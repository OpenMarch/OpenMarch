import { act, renderHook, waitFor } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { describeDbTests, type DbConnection, schema } from "@/test/base";
import { transactionWithHistory } from "@/db-functions/history";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useTimingObjects } from "@/hooks";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { useTimelinePlaybackDriver } from "../useTimelinePlaybackDriver";
import { stopTimelinePlayback } from "../timelineTransport";

/**
 * Timeline mode's playback rules while playing (ui.md UI-9, UI-10 Play and Stop; P8.11, P8.17), frame by frame with fake
 * animation frames. The audio clock is replaced by a settable one: `restartLivePlaybackAt` moves
 * it, as the real one moves the live position, and the audio player never restarts, so a loop
 * that waited for it would stall.
 */

const audio = vi.hoisted(() => ({
    seconds: 0,
    restarts: [] as number[],
    startInfo: { current: null as object | null },
}));
vi.mock("@/components/timeline/audio/AudioPlayer", () => ({
    getLivePlaybackPosition: () => audio.seconds,
    playbackStartInfoRef: audio.startInfo,
    restartLivePlaybackAt: (seconds: number) => {
        audio.restarts.push(seconds);
        audio.seconds = seconds;
    },
}));

const store = () => useTimelineSelectionStore.getState();

beforeEach(() => {
    store().reset();
    audio.seconds = 0;
    audio.restarts = [];
    audio.startInfo.current = null;
    vi.useFakeTimers({
        toFake: ["requestAnimationFrame", "cancelAnimationFrame"],
    });
});
afterEach(() => {
    vi.useRealTimers();
});

/** Beats 1..16 of 0.5 s after the fixed beat 0: beat b starts at (b - 1) / 2 s; the end is 17. */
const seedShow = (db: DbConnection) =>
    transactionWithHistory(db, "seedShow", async (tx) => {
        await tx.insert(schema.beats).values(
            Array.from({ length: 16 }, (_, i) => ({
                id: i + 1,
                position: i + 1,
                duration: 0.5,
            })),
        );
        await tx.insert(schema.pages).values([
            { id: 1, start_beat: 1 },
            { id: 2, start_beat: 9 },
        ]);
    });

const frame = () =>
    act(() => {
        vi.advanceTimersToNextFrame();
    });

describeDbTests("useTimelinePlaybackDriver", (it) => {
    const setUp = async (
        db: DbConnection,
        wrapper: ComponentType<{ children: ReactNode }>,
    ) => {
        await seedShow(db);
        const hook = renderHook(
            () => {
                useTimelinePlaybackDriver(true);
                return {
                    beats: useTimingObjects()!.beats,
                    playing: useIsPlaying()!,
                };
            },
            { wrapper },
        );
        await waitFor(() => expect(hook.result.current.beats).toHaveLength(17));
        await waitFor(() => expect(store().showEndBeat).toBe(17));
        return hook;
    };
    const play = (result: {
        current: { playing: { setIsPlaying: (p: boolean) => void } };
    }) => {
        audio.startInfo.current = {};
        act(() => {
            result.current.playing.setIsPlaying(true);
        });
    };

    it("plays through the window's end without looping (UI-10 Play)", async ({
        db,
        wrapper,
    }) => {
        const { result } = await setUp(db, wrapper);
        act(() => {
            store().selectRange(1, 9);
        });
        audio.seconds = 3.9; // beat 8.8
        play(result);
        frame();
        audio.seconds = 4.2; // past beat 9, the window's end
        frame();
        expect(audio.restarts).toEqual([]);
        expect(result.current.playing.isPlaying).toBe(true);
    });

    it("pausing leaves the start flag: the window runs from it to the paused playhead", async ({
        db,
        wrapper,
    }) => {
        const { result } = await setUp(db, wrapper);
        act(() => {
            store().selectRange(9, 13);
        });
        audio.seconds = 6.1; // beat 13.2
        play(result);
        frame();
        act(() => {
            result.current.playing.setIsPlaying(false);
        });
        expect(store().playheadBeat).toBe(13);
        expect(store().startBeat).toBe(9);
        expect(store().selection).toEqual({ kind: "range", start: 9, end: 13 });
    });

    it("Stop while playing returns the playhead to the start flag", async ({
        db,
        wrapper,
    }) => {
        const { result } = await setUp(db, wrapper);
        act(() => {
            store().selectRange(9, 13);
        });
        audio.seconds = 6.1;
        play(result);
        frame();
        act(() => {
            stopTimelinePlayback({
                isPlaying: true,
                setIsPlaying: result.current.playing.setIsPlaying,
            });
        });
        expect(result.current.playing.isPlaying).toBe(false);
        expect(store().playheadBeat).toBe(9);
        expect(store().startBeat).toBe(9);
    });

    it("Stop before the audio starts still returns to the start flag, and paused Stop returns at once", async ({
        db,
        wrapper,
    }) => {
        const { result } = await setUp(db, wrapper);
        act(() => {
            store().selectRange(9, 13);
        });
        act(() => {
            result.current.playing.setIsPlaying(true);
        });
        act(() => {
            stopTimelinePlayback({
                isPlaying: true,
                setIsPlaying: result.current.playing.setIsPlaying,
            });
        });
        expect(store().playheadBeat).toBe(9);
        act(() => {
            store().seekKeepingStart(15);
        });
        act(() => {
            stopTimelinePlayback({
                isPlaying: false,
                setIsPlaying: result.current.playing.setIsPlaying,
            });
        });
        expect(store().playheadBeat).toBe(9);
    });

    it("plays on and stops at the end of the show, leaving the playhead there", async ({
        db,
        wrapper,
    }) => {
        const { result } = await setUp(db, wrapper);
        audio.seconds = 7.9;
        play(result);
        frame();
        expect(result.current.playing.isPlaying).toBe(true);
        audio.seconds = 8; // the end of beat 16
        frame();
        expect(result.current.playing.isPlaying).toBe(false);
        expect(store().playheadBeat).toBe(17);
        // The start flag stayed at beat 0
        expect(store().selection).toEqual({ kind: "range", start: 0, end: 17 });
    });

    it("pausing leaves the playhead on the last whole beat played", async ({
        db,
        wrapper,
    }) => {
        const { result } = await setUp(db, wrapper);
        act(() => {
            store().selectRange(1, 9);
        });
        audio.seconds = 2.3; // beat 5.6
        play(result);
        frame();
        act(() => {
            result.current.playing.setIsPlaying(false);
        });
        expect(store().playheadBeat).toBe(5);
        expect(store().selection).toEqual({ kind: "range", start: 1, end: 5 });
    });

    it("does nothing before the audio has started", async ({ db, wrapper }) => {
        const { result } = await setUp(db, wrapper);
        act(() => {
            store().selectRange(1, 9);
        });
        audio.seconds = 5; // past the range, but there is no live position yet
        act(() => {
            result.current.playing.setIsPlaying(true);
        });
        frame();
        expect(audio.restarts).toEqual([]);
        act(() => {
            result.current.playing.setIsPlaying(false);
        });
        // A pause before any frame leaves the playhead alone
        expect(store().playheadBeat).toBe(9);
    });

    it("clamps seeks to the end of the show and ignores non-finite ones", async ({
        db,
        wrapper,
    }) => {
        await setUp(db, wrapper);
        act(() => {
            store().seek(40);
        });
        expect(store().playheadBeat).toBe(17);
        act(() => {
            store().seek(Number.NaN);
        });
        expect(store().playheadBeat).toBe(17);
    });
});

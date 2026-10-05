import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { describeDbTests, type DbConnection, schema } from "@/test/base";
import { transactionWithHistory } from "@/db-functions/history";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useTimingObjects } from "@/hooks";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { startTimelinePlayback } from "../timelineTransport";
import { useTimelinePageBridge } from "../useTimelinePageBridge";
import { useTimelinePlaybackDriver } from "../useTimelinePlaybackDriver";

/**
 * Play, pause and play again in timeline mode, with the hooks `TimelineResolverHost` mounts in its
 * order (the page bridge before the playback driver). The audio clock is a settable fake, as in
 * useTimelinePlaybackDriver.test.tsx; animation frames are faked.
 */

const audio = vi.hoisted(() => ({
    seconds: 0,
    startInfo: { current: null as object | null },
}));
vi.mock("@/components/timeline/audio/AudioPlayer", () => ({
    getLivePlaybackPosition: () => audio.seconds,
    playbackStartInfoRef: audio.startInfo,
    restartLivePlaybackAt: (seconds: number) => {
        audio.seconds = seconds;
    },
}));

const store = () => useTimelineSelectionStore.getState();

/** Beats 1..16 of 0.5 s; pages start on beats 1, 5, 9 and 13, so the flags are 0, 5, 9, 13, 17. */
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
            { id: 2, start_beat: 5 },
            { id: 3, start_beat: 9 },
            { id: 4, start_beat: 13 },
        ]);
    });

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
    store().reset();
    audio.seconds = 0;
    audio.startInfo.current = null;
    vi.useFakeTimers({
        toFake: ["requestAnimationFrame", "cancelAnimationFrame"],
    });
    consoleError = vi.spyOn(console, "error");
});
afterEach(() => {
    vi.useRealTimers();
    consoleError.mockRestore();
});

const frame = () =>
    act(() => {
        vi.advanceTimersToNextFrame();
    });

const maxDepthErrors = () =>
    consoleError.mock.calls.filter((args: unknown[]) =>
        String(args[0]).includes("Maximum update depth"),
    );

describeDbTests("timeline play, pause, play", (it) => {
    it("doesn't loop between the page bridge and the pause seek", async ({
        db,
        wrapper,
    }) => {
        await seedShow(db);
        const { result } = renderHook(
            () => {
                useTimelinePageBridge(true);
                useTimelinePlaybackDriver(true);
                return {
                    timing: useTimingObjects()!,
                    playing: useIsPlaying()!,
                    selectedPage: useSelectedPage()!.selectedPage,
                };
            },
            { wrapper },
        );
        await waitFor(() =>
            expect(result.current.timing.pages.length).toBeGreaterThan(3),
        );
        await waitFor(() => expect(store().showEndBeat).toBe(17));

        let writes = 0;
        const unsubscribe = useTimelineSelectionStore.subscribe((s, prev) => {
            if (s.playheadRevision !== prev.playheadRevision) writes++;
        });

        const playPause = (liveSeconds: number) => {
            act(() => {
                startTimelinePlayback(17, result.current.playing.setIsPlaying);
            });
            audio.startInfo.current = {};
            audio.seconds = liveSeconds;
            frame();
            act(() => {
                result.current.playing.setIsPlaying(false);
            });
        };

        // The page at [5, 9): Play previews it (UI-11); pausing holds the frame and leaves P at 9
        act(() => {
            store().selectRange(5, 9);
            store().setPlayFromStart(true);
        });
        writes = 0;
        playPause(3.1); // beat 7.2
        expect(store().cursorBeat).toBe(7);
        expect(store().playheadBeat).toBe(9);
        // Play again resumes from the held frame
        playPause(3.4); // beat 7.8
        expect(store().cursorBeat).toBe(7);
        expect(store().playheadBeat).toBe(9);
        unsubscribe();

        expect(maxDepthErrors()).toEqual([]);
        // At most a start cue and a pause cue per play
        expect(writes).toBeLessThanOrEqual(4);
        expect(result.current.selectedPage?.id).toBe(2);
    });
});

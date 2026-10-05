import { act, renderHook, waitFor } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { describeDbTests, type DbConnection, schema } from "@/test/base";
import { transactionWithHistory } from "@/db-functions/history";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useTimingObjects } from "@/hooks";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import {
    canPlay,
    navigationTarget,
    pageAtPlayhead,
    pageFlags,
    playbackStep,
    playStartBeat,
} from "@/timeline/timelinePlayhead";
import { useTimelinePageBridge } from "@/timeline/useTimelinePageBridge";
import { useTimelinePlayback } from "../useTimelinePlayback";

/**
 * The timeline-mode playhead (ui.md UI-9; P8.11): pages are flags, the paused playhead rests on any
 * whole beat, seeking doesn't change the selection, navigation selects a page's range (home for
 * the first), and play resumes from the playhead and loops a selected range.
 */

/** Pages as `fromDatabasePages` builds them: page 0 holds only the fixed beat 0. */
const pagesOf = (...beatLists: number[][]) =>
    beatLists.map((indexes, i) => ({
        id: i,
        beats: indexes.map((index) => ({ index })),
    }));
/** Page 0 is beat 0; page 1 is beats 1-8 (flag 9); page 2 is beats 9-16 (flag 17) */
const PAGES = pagesOf(
    [0],
    [1, 2, 3, 4, 5, 6, 7, 8],
    [9, 10, 11, 12, 13, 14, 15, 16],
);
const store = () => useTimelineSelectionStore.getState();

beforeEach(() => store().reset());

describe("pages as flags", () => {
    it("puts each page's flag at its end, and home's at 0", () => {
        expect(
            pageFlags(PAGES).map(({ page, flag, range }) => ({
                id: page.id,
                flag,
                range,
            })),
        ).toEqual([
            { id: 0, flag: 0, range: null },
            { id: 1, flag: 9, range: { start: 1, end: 9 } },
            { id: 2, flag: 17, range: { start: 9, end: 17 } },
        ]);
        expect(pageFlags([])).toEqual([]);
    });

    it("finds the page containing or ending at the playhead", () => {
        expect(pageAtPlayhead(PAGES, 0)?.id).toBe(0);
        expect(pageAtPlayhead(PAGES, 1)?.id).toBe(1);
        expect(pageAtPlayhead(PAGES, 5)?.id).toBe(1);
        expect(pageAtPlayhead(PAGES, 9)?.id).toBe(1);
        expect(pageAtPlayhead(PAGES, 10)?.id).toBe(2);
        expect(pageAtPlayhead(PAGES, 17)?.id).toBe(2);
        // Past the last flag: the last page
        expect(pageAtPlayhead(PAGES, 30)?.id).toBe(2);
        expect(pageAtPlayhead([], 3)).toBeNull();
    });

    it("navigates by flags from the playhead", () => {
        const to = (
            beat: number,
            direction: Parameters<typeof navigationTarget>[2],
        ) => navigationTarget(PAGES, beat, direction)?.page.id ?? null;
        expect(to(0, "next-page")).toBe(1);
        expect(to(5, "next-page")).toBe(1);
        expect(to(9, "next-page")).toBe(2);
        expect(to(17, "next-page")).toBeNull();
        expect(to(17, "previous-page")).toBe(1);
        expect(to(12, "previous-page")).toBe(1);
        expect(to(9, "previous-page")).toBe(0);
        expect(to(0, "previous-page")).toBeNull();
        expect(to(12, "first-page")).toBe(0);
        expect(to(0, "last-page")).toBe(2);
        expect(navigationTarget([], 0, "first-page")).toBeNull();
    });
});

describe("play", () => {
    const range = { kind: "range", start: 1, end: 9 } as const;
    const home = { kind: "home" } as const;

    it("starts at the playhead (UI-10 Play)", () => {
        expect(playStartBeat(home, 5)).toBe(5);
        expect(playStartBeat(range, 5)).toBe(5);
        expect(playStartBeat(range, 9)).toBe(9);
        expect(playStartBeat(range, 12)).toBe(12);
        expect(canPlay(home, 17, 17)).toBe(false);
        expect(canPlay(home, 16, 17)).toBe(true);
        expect(canPlay(range, 17, 17)).toBe(false);
    });

    it("never loops, and stops at the end of the show (UI-10 Play)", () => {
        expect(playbackStep(range, 8.5, 17)).toBeNull();
        expect(playbackStep(range, 9, 17)).toBeNull();
        expect(playbackStep(home, 9, 17)).toBeNull();
        expect(playbackStep(home, 17, 17)).toBe("stop");
        expect(playbackStep({ kind: "none" }, 17, 17)).toBe("stop");
    });

    it("loops over an isolated timeline (docs/timeline/research/ownership/09-isolation.md)", () => {
        const isolated = { start: 3, end: 9 };
        expect(playbackStep(range, 8.5, 17, isolated)).toBeNull();
        expect(playbackStep(range, 9, 17, isolated)).toEqual({ loopTo: 3 });
        expect(playbackStep(range, 9, 17, null)).toBeNull();
    });
});

/** Beats 1..16 of 0.5 s after the fixed beat 0; page 1 starts at beat 1 and page 2 at beat 9. */
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

describeDbTests("useTimelinePlayback", (it) => {
    const renderPlayback = (
        wrapper: ComponentType<{ children: ReactNode }>,
        bridge = false,
    ) =>
        renderHook(
            () => {
                const { beats, pages } = useTimingObjects()!;
                useTimelinePageBridge(bridge);
                return {
                    pages,
                    beats,
                    playback: useTimelinePlayback({ beats, pages }),
                    selected: useSelectedPage()!,
                    playing: useIsPlaying()!,
                    selection: useTimelineSelectionStore((s) => s.selection),
                };
            },
            { wrapper },
        );

    it("shows the playhead, and seeking moves the playhead and the window's end", async ({
        db,
        wrapper,
    }) => {
        await seedShow(db);
        const { result } = renderPlayback(wrapper);
        await waitFor(() => expect(result.current.pages).toHaveLength(3));
        expect(result.current.playback.positionBeat).toBe(0);
        expect(result.current.selection).toEqual({ kind: "home" });

        act(() => {
            store().selectRange(1, 9);
        });
        expect(result.current.playback.positionBeat).toBe(9);
        act(() => {
            result.current.playback.onSeek!(5);
        });
        expect(result.current.playback.positionBeat).toBe(5);
        // UI-10: the window ends at the playhead
        expect(result.current.selection).toEqual({
            kind: "range",
            start: 1,
            end: 5,
        });
        // Any whole beat, the end of the show (the last flag) included
        act(() => {
            result.current.playback.onSeek!(17);
        });
        expect(result.current.playback.positionBeat).toBe(17);
    });

    it("navigates to flags, selecting each page's range or home, only while paused", async ({
        db,
        wrapper,
    }) => {
        await seedShow(db);
        const { result } = renderPlayback(wrapper);
        await waitFor(() => expect(result.current.pages).toHaveLength(3));

        act(() => {
            result.current.playback.onNavigate!("next-page");
        });
        expect(result.current.selection).toEqual({
            kind: "range",
            start: 1,
            end: 9,
        });
        expect(result.current.playback.positionBeat).toBe(9);
        act(() => {
            result.current.playback.onNavigate!("last-page");
        });
        expect(result.current.selection).toEqual({
            kind: "range",
            start: 9,
            end: 17,
        });
        expect(result.current.playback.positionBeat).toBe(17);
        act(() => {
            result.current.playback.onNavigate!("first-page");
        });
        expect(result.current.selection).toEqual({ kind: "home" });
        expect(result.current.playback.positionBeat).toBe(0);

        act(() => {
            result.current.playing.setIsPlaying(true);
        });
        act(() => {
            result.current.playback.onNavigate!("last-page");
        });
        act(() => {
            result.current.playback.onSeek!(4);
        });
        expect(result.current.selection).toEqual({ kind: "home" });
        expect(store().playheadBeat).toBe(0);
    });

    it("names the page containing or ending at the playhead while paused", async ({
        db,
        wrapper,
    }) => {
        await seedShow(db);
        const { result } = renderPlayback(wrapper);
        await waitFor(() => expect(result.current.pages).toHaveLength(3));

        act(() => {
            store().seek(9);
        });
        // Beat 9 is page 1's flag (and page 2's first beat): page 1 ends there
        expect(result.current.playback.pageLabel).toBe(
            result.current.pages[1]!.name,
        );
        act(() => {
            store().seek(10);
        });
        expect(result.current.playback.pageLabel).toBe(
            result.current.pages[2]!.name,
        );
        act(() => {
            result.current.playing.setIsPlaying(true);
        });
        expect(result.current.playback.pageLabel).toBeUndefined();
    });

    it("plays from the playhead, and pauses keeping the window", async ({
        db,
        wrapper,
    }) => {
        await seedShow(db);
        const { result } = renderPlayback(wrapper);
        await waitFor(() => expect(result.current.pages).toHaveLength(3));

        // At the end of the show with nothing to loop: nothing to play
        act(() => {
            store().seek(17);
        });
        act(() => {
            result.current.playback.onPlayingChange!(true);
        });
        expect(result.current.playback.isPlaying).toBe(false);

        // UI-10: play starts at the playhead, the window's end
        act(() => {
            store().selectRange(1, 9);
        });
        act(() => {
            result.current.playback.onPlayingChange!(true);
        });
        expect(result.current.playback.isPlaying).toBe(true);
        expect(store().playheadBeat).toBe(9);
        // While playing, the cursor follows the audio clock and is never -1
        expect(result.current.playback.positionBeat).toBeGreaterThanOrEqual(0);

        act(() => {
            result.current.playback.onPlayingChange!(false);
        });
        expect(result.current.playback.isPlaying).toBe(false);
        expect(result.current.selection).toEqual({
            kind: "range",
            start: 1,
            end: 9,
        });

        // Mid-range, play resumes where the playhead is
        act(() => {
            store().seek(5);
        });
        act(() => {
            result.current.playback.onPlayingChange!(true);
        });
        expect(store().playheadBeat).toBe(5);
    });

    it("keeps the legacy selected page on the playhead's page, and back (TEMPORARY, P8.12)", async ({
        db,
        wrapper,
    }) => {
        await seedShow(db);
        const { result } = renderPlayback(wrapper, true);
        await waitFor(() => expect(result.current.pages).toHaveLength(3));
        // The page boxes `TimelineModePanel` keeps in the app, so the start flag follows
        act(() => {
            store().setPageBoxes([
                { start: 1, end: 9 },
                { start: 9, end: 17 },
            ]);
        });

        act(() => {
            store().selectRange(9, 17);
        });
        await waitFor(() =>
            expect(result.current.selected.selectedPage?.id).toBe(2),
        );
        act(() => {
            store().seek(4);
        });
        await waitFor(() =>
            expect(result.current.selected.selectedPage?.id).toBe(1),
        );
        // Selecting a page elsewhere moves the playhead to its flag, not the selection
        act(() => {
            result.current.selected.setSelectedPage({ id: 2 });
        });
        await waitFor(() => expect(store().playheadBeat).toBe(17));
        expect(result.current.selection).toEqual({
            kind: "range",
            start: 9,
            end: 17,
        });
        act(() => {
            result.current.selected.setSelectedPage({ id: 0 });
        });
        await waitFor(() => expect(store().playheadBeat).toBe(0));
        expect(result.current.selected.selectedPage?.id).toBe(0);
    });
});

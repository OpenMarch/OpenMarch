import { act, renderHook, waitFor } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { describeDbTests, type DbConnection, schema } from "@/test/base";
import { transactionWithHistory } from "@/db-functions/history";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useTimingObjects } from "@/hooks";
import {
    displayedBeat,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import {
    canPlayOn,
    navigationTarget,
    pageAtPlayhead,
    pageFlags,
    playbackStep,
    previewBounds,
} from "@/timeline/timelinePlayhead";
import {
    loopBounds,
    startTimelinePlayOn,
    toggleTimelineLoop,
} from "@/timeline/timelineTransport";
import { useTimelinePageBridge } from "@/timeline/useTimelinePageBridge";
import { useTimelinePlayback } from "../useTimelinePlayback";

/**
 * The timeline-mode playhead (ui.md UI-9; P8.11): pages are flags, the paused playhead rests on any
 * whole beat, seeking doesn't change the selection, navigation selects a page's range (home for
 * the first). Play loops the loop region, wherever the playhead is, and plays on otherwise (UI-17).
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

beforeEach(() => {
    store().reset();
    // reset keeps page boxes; whether a flag is pinned depends on them
    store().setPageBoxes([]);
});

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

    const on = { kind: "on" } as const;

    it("previews exactly the window, with no roll (UI-11 Play)", () => {
        const window = (start: number, end: number) => ({
            selection: { kind: "range", start, end } as const,
            isolation: null,
        });
        expect(previewBounds(window(5, 9))).toEqual({ from: 5, to: 9 });
        expect(previewBounds(window(1, 17))).toEqual({ from: 1, to: 17 });
        // Nothing to preview at home or with nothing selected: Play plays on
        expect(previewBounds({ selection: home, isolation: null })).toBeNull();
        expect(
            previewBounds({ selection: { kind: "none" }, isolation: null }),
        ).toBeNull();
        // An isolated timeline previews its whole range
        expect(
            previewBounds({
                selection: range,
                isolation: { start: 3, end: 9 },
            }),
        ).toEqual({ from: 3, to: 9 });
    });

    it("plays on while there is time after the start", () => {
        expect(canPlayOn(17, 17)).toBe(false);
        expect(canPlayOn(16, 17)).toBe(true);
    });

    it("a preview always loops back to its start at its end (UI-17)", () => {
        const preview = { kind: "preview", from: 3, to: 11 } as const;
        expect(playbackStep(preview, 10.5, 17, null)).toBeNull();
        expect(playbackStep(preview, 11, 17, null)).toEqual({ loopTo: 3 });
        expect(playbackStep(preview, 12, 17, null)).toEqual({ loopTo: 3 });
    });

    it("plays on to the end of the show and stops there", () => {
        expect(playbackStep(on, 9, 17, null)).toBeNull();
        expect(playbackStep(on, 17, 17, null)).toBe("stop");
    });

    it("loopBounds is the isolated range, else the loop, else nothing (UI-17)", () => {
        store().selectRange(1, 9);
        expect(loopBounds(store())).toBeNull();
        store().setLoop({ start: 2, end: 6 });
        expect(loopBounds(store())).toEqual({ from: 2, to: 6 });
        // Isolation wins, even when a loop is also set
        store().setStoredTimelines([
            {
                id: 1,
                start: 3,
                end: 9,
                marcherIds: new Set([1]),
            },
        ]);
        store().isolate(1);
        expect(loopBounds(store())).toEqual({ from: 3, to: 9 });
    });

    it("loops over an isolated timeline (docs/timeline/research/ownership/09-isolation.md)", () => {
        const isolated = { start: 3, end: 9 };
        const preview = { kind: "preview", from: 3, to: 9 } as const;
        expect(playbackStep(on, 8.5, 17, isolated)).toBeNull();
        expect(playbackStep(on, 9, 17, isolated)).toEqual({ loopTo: 3 });
        expect(playbackStep(preview, 9, 17, isolated)).toEqual({ loopTo: 3 });
        expect(playbackStep(on, 9, 17, null)).toBeNull();
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

/** The seeded show's page boxes, as `TimelineModePanel` gives them to the store */
const PAGE_BOXES = [
    { start: 1, end: 9 },
    { start: 9, end: 17 },
];

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
        // TimelineModePanel keeps these; without them every range reads as pinned
        act(() => {
            store().setPageBoxes(PAGE_BOXES);
        });

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

    it("C turns the loop on over the window, and E/Q move it onto the page (UI-17)", async ({
        db,
        wrapper,
    }) => {
        await seedShow(db);
        const { result } = renderPlayback(wrapper);
        await waitFor(() => expect(result.current.pages).toHaveLength(3));
        act(() => {
            store().setPageBoxes(PAGE_BOXES);
        });
        act(() => {
            result.current.playback.onNavigate!("next-page");
        });
        expect(store().startPinned).toBe(false);
        expect(store().loop).toBeNull();
        // Page 1's window is the loop; C does not move the start flag
        act(() => {
            toggleTimelineLoop();
        });
        expect(store().loop).toEqual({ start: 1, end: 9 });
        expect(store().startBeat).toBe(1);
        expect(store().startPinned).toBe(false);
        expect(result.current.playback.playLoops).toBe(true);
        // E takes the loop to the next page
        act(() => {
            result.current.playback.onNavigate!("next-page");
        });
        expect(store().loop).toEqual({ start: 9, end: 17 });
        expect(store().startPinned).toBe(false);
        expect(store().startBeat).toBe(9);
        expect(result.current.selection).toEqual({
            kind: "range",
            start: 9,
            end: 17,
        });
        // Q brings it back
        act(() => {
            result.current.playback.onNavigate!("previous-page");
        });
        expect(store().loop).toEqual({ start: 1, end: 9 });
        expect(store().playheadBeat).toBe(9);
        // Off: navigation leaves the loop null
        act(() => {
            toggleTimelineLoop();
        });
        expect(store().loop).toBeNull();
        act(() => {
            result.current.playback.onNavigate!("next-page");
        });
        expect(store().loop).toBeNull();
        expect(result.current.selection).toEqual({
            kind: "range",
            start: 9,
            end: 17,
        });
    });

    it("a seek or a click leaves the loop, and page navigation moves it only while it is on (UI-17)", async ({
        db,
        wrapper,
    }) => {
        await seedShow(db);
        const { result } = renderPlayback(wrapper);
        await waitFor(() => expect(result.current.pages).toHaveLength(3));
        act(() => {
            store().setPageBoxes(PAGE_BOXES);
            store().selectRange(1, 9);
            store().setLoop({ start: 1, end: 17 });
        });
        const loop = store().loop;
        // Inside the loop, then past it: the playhead moves, the loop does not
        act(() => {
            result.current.playback.onSeek!(5);
        });
        expect(store().playheadBeat).toBe(5);
        expect(store().loop).toBe(loop);
        act(() => {
            result.current.playback.onSeek!(12);
        });
        expect(store().playheadBeat).toBe(12);
        expect(store().loop).toBe(loop);
        // A click (press, then release) is a seek too
        act(() => {
            result.current.playback.onSeek!(4, { gesture: "press" });
            result.current.playback.onSeek!(4, { gesture: "end" });
        });
        expect(store().playheadBeat).toBe(4);
        expect(store().loop).toBe(loop);
        // E moves an active loop onto the target page
        act(() => {
            result.current.playback.onNavigate!("next-page");
        });
        expect(store().playheadBeat).toBe(9);
        expect(store().loop).toEqual({ start: 1, end: 9 });
        expect(loopBounds(store())).toEqual({ from: 1, to: 9 });
        // Off: the same navigation leaves it null
        act(() => {
            store().setLoop(null);
            result.current.playback.onNavigate!("next-page");
        });
        expect(store().loop).toBeNull();
        expect(store().selection).toEqual({
            kind: "range",
            start: 9,
            end: 17,
        });
    });

    it("leaves a hand-drawn start flag through a seek, and page navigation selects the page (UI-12, UI-17)", async ({
        db,
        wrapper,
    }) => {
        await seedShow(db);
        const { result } = renderPlayback(wrapper);
        await waitFor(() => expect(result.current.pages).toHaveLength(3));
        act(() => {
            store().setPageBoxes(PAGE_BOXES);
            store().selectRange(12, 15);
        });
        expect(store().startPinned).toBe(true);
        expect(store().loop).toBeNull();
        act(() => {
            result.current.playback.onSeek!(16);
        });
        expect(store().startBeat).toBe(12);
        expect(store().startPinned).toBe(true);
        expect(store().loop).toBeNull();
        // E selects the target page. It does not keep the drawn flag or turn the loop on
        act(() => {
            result.current.playback.onNavigate!("next-page");
        });
        expect(store().selection).toEqual({
            kind: "range",
            start: 9,
            end: 17,
        });
        expect(store().startPinned).toBe(false);
        expect(store().loop).toBeNull();
    });

    it("C loops the edit window, not the displayed beat; C again clears it; C in isolation does nothing (UI-17)", async ({
        db,
        wrapper,
    }) => {
        await seedShow(db);
        const { result } = renderPlayback(wrapper);
        await waitFor(() => expect(result.current.pages).toHaveLength(3));
        act(() => {
            store().setPageBoxes(PAGE_BOXES);
            store().selectRange(9, 17);
            store().cue(12);
        });
        expect(store().startPinned).toBe(false);
        expect(displayedBeat(store())).toBe(12);
        act(() => {
            toggleTimelineLoop();
        });
        expect(store().loop).toEqual({ start: 9, end: 17 });
        expect(store().startBeat).toBe(9);
        expect(store().startPinned).toBe(false);
        expect(store().playheadBeat).toBe(17);
        expect(store().cursorBeat).toBe(12);
        expect(store().selection).toEqual({
            kind: "range",
            start: 9,
            end: 17,
        });

        act(() => {
            toggleTimelineLoop();
        });
        expect(store().loop).toBeNull();
        expect(store().startBeat).toBe(9);
        expect(store().playheadBeat).toBe(17);
        expect(store().selection).toEqual({
            kind: "range",
            start: 9,
            end: 17,
        });

        act(() => {
            store().setLoop({ start: 9, end: 17 });
            store().setStoredTimelines([
                {
                    id: 1,
                    start: 9,
                    end: 17,
                    marcherIds: new Set([1]),
                },
            ]);
            store().isolate(1);
        });
        const loop = store().loop;
        const pinned = store().startPinned;
        const start = store().startBeat;
        const playhead = store().playheadBeat;
        act(() => {
            toggleTimelineLoop();
        });
        expect(store().isolation).not.toBeNull();
        expect(store().loop).toBe(loop);
        expect(store().startPinned).toBe(pinned);
        expect(store().startBeat).toBe(start);
        expect(store().playheadBeat).toBe(playhead);
        // The hook result is what keeps this render subscribed to the store
        expect(result.current.playback.playLoops).toBe(true);
    });

    it("playLoops when a loop is set or a move is isolated, and Space follows that (UI-17)", async ({
        db,
        wrapper,
    }) => {
        await seedShow(db);
        const { result } = renderPlayback(wrapper);
        await waitFor(() => expect(result.current.pages).toHaveLength(3));
        act(() => {
            store().setPageBoxes(PAGE_BOXES);
        });

        // Playing on from the end of the show: nothing to play
        act(() => {
            store().seek(17);
        });
        act(() => {
            startTimelinePlayOn(17, result.current.playing.setIsPlaying);
        });
        expect(result.current.playback.isPlaying).toBe(false);

        act(() => {
            store().selectRange(1, 9);
        });
        expect(store().startPinned).toBe(false);
        expect(result.current.playback.playLoops).toBe(false);
        // A page is selected: Play's tooltip names Shift+Space and C (UI-17)
        expect(result.current.playback.playNext).toBe("page");
        // Space: plays on from P. The driver, not this hook, moves P when it stops
        act(() => {
            result.current.playback.onPlayingChange!(true);
        });
        expect(result.current.playback.isPlaying).toBe(true);
        expect(result.current.playback.playLoops).toBe(false);
        expect(store().playback).toEqual({ kind: "on" });
        expect(store().playheadBeat).toBe(9);
        expect(store().cursorBeat).toBe(9);
        // While playing, the cursor follows the audio clock and is never -1
        expect(result.current.playback.positionBeat).toBeGreaterThanOrEqual(0);

        act(() => {
            result.current.playback.onPlayingChange!(false);
        });
        expect(result.current.playback.isPlaying).toBe(false);
        // The driver isn't mounted, so clear the run it would have cleared on pause
        act(() => {
            store().setPlayback(null);
            store().clearCursor();
            // P sits on the loop's end; Space still loops the loop and leaves P
            store().setLoop({ start: 5, end: 9 });
        });
        expect(store().startPinned).toBe(false);
        expect(result.current.playback.playLoops).toBe(true);
        act(() => {
            result.current.playback.onPlayingChange!(true);
        });
        expect(result.current.playback.isPlaying).toBe(true);
        expect(result.current.playback.playLoops).toBe(true);
        expect(store().playback).toEqual({ kind: "preview", from: 5, to: 9 });
        expect(store().cursorBeat).toBe(5);
        expect(store().playheadBeat).toBe(9);

        // Isolation loops even when the loop itself is off
        act(() => {
            result.current.playback.onPlayingChange!(false);
            store().setPlayback(null);
            store().clearCursor();
            store().setLoop(null);
            store().selectRange(9, 17);
            store().setStoredTimelines([
                {
                    id: 1,
                    start: 9,
                    end: 17,
                    marcherIds: new Set([1]),
                },
            ]);
            store().isolate(1);
        });
        expect(store().startPinned).toBe(false);
        expect(result.current.playback.playLoops).toBe(true);
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

    it("waits for a scrub to end before following the playhead's page", async ({
        db,
        wrapper,
    }) => {
        await seedShow(db);
        const { result } = renderPlayback(wrapper, true);
        await waitFor(() => expect(result.current.pages).toHaveLength(3));
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

        // Scrub back across page 2's flag into page 1, then forward to page 2 and back again
        act(() => {
            store().beginScrub();
            store().seek(12);
        });
        act(() => {
            store().seek(4);
        });
        act(() => {
            store().seek(3);
        });
        expect(store().playheadBeat).toBe(3);
        expect(result.current.selected.selectedPage?.id).toBe(2);

        act(() => {
            store().endScrub();
        });
        await waitFor(() =>
            expect(result.current.selected.selectedPage?.id).toBe(1),
        );
        // The bridge's own write isn't read back as a page change
        expect(store().playheadBeat).toBe(3);
    });
});

import { beforeEach, describe, expect, it } from "vitest";
import {
    editWindow,
    followingStart,
    isMarcherDimmed,
    normalizePlayheadBeat,
    resolveStoredTimeline,
    selectedStoredTimeline,
    useTimelineSelectionStore,
    type StoredTimelineMembership,
} from "../TimelineSelectionStore";

const timeline = (
    id: number,
    start: number,
    end: number,
    marcherIds: number[],
): StoredTimelineMembership => ({
    id,
    start,
    end,
    marcherIds: new Set(marcherIds),
});

const store = () => useTimelineSelectionStore.getState();

/** Page boxes for flags at 9, 17 and 25 (page 1's box starts at beat 1) */
const BOXES = [
    { start: 1, end: 9 },
    { start: 9, end: 17 },
    { start: 17, end: 25 },
];

describe("TimelineSelectionStore (UI-9, UI-10)", () => {
    beforeEach(() => {
        store().reset();
        store().setPageBoxes([]);
    });

    it("opens on home with the playhead at beat 0", () => {
        expect(store().selection).toEqual({ kind: "home" });
        expect(store().playheadBeat).toBe(0);
        expect(store().storedTimelines).toBeNull();
    });

    it("selecting a range seeks to its end; home seeks to 0", () => {
        store().selectRange(1, 9);
        expect(store().selection).toEqual({ kind: "range", start: 1, end: 9 });
        expect(store().playheadBeat).toBe(9);
        store().selectHome();
        expect(store().selection).toEqual({ kind: "home" });
        expect(store().playheadBeat).toBe(0);
    });

    it("seeking moves the playhead and the window's end, and bumps the revision even in place", () => {
        store().setPageBoxes(BOXES);
        store().selectRange(1, 9);
        const revision = store().playheadRevision;
        store().seek(4);
        // UI-10: the window ends at the playhead, and the unpinned start flag follows it
        expect(store().selection).toEqual({ kind: "range", start: 1, end: 4 });
        expect(store().playheadBeat).toBe(4);
        store().seek(4);
        expect(store().playheadRevision).toBe(revision + 2);
    });

    it("writes show time 0 as beat 0", () => {
        store().seek(1);
        expect(store().playheadBeat).toBe(0);
        expect(normalizePlayheadBeat(1)).toBe(0);
        expect(normalizePlayheadBeat(1, false)).toBe(1);
        expect(normalizePlayheadBeat(2.4)).toBe(2);
    });

    it("resolves a range to the stored timeline with exactly that range", () => {
        const timelines = [timeline(5, 1, 9, [1]), timeline(6, 9, 17, [2])];
        expect(
            resolveStoredTimeline(
                { kind: "range", start: 9, end: 17 },
                timelines,
            )?.id,
        ).toBe(6);
        expect(
            resolveStoredTimeline(
                { kind: "range", start: 9, end: 16 },
                timelines,
            ),
        ).toBeNull();
        expect(resolveStoredTimeline({ kind: "home" }, timelines)).toBeNull();
        expect(
            resolveStoredTimeline({ kind: "range", start: 1, end: 9 }, null),
        ).toBeNull();
    });

    it("keeps the selection when its timeline is stored or deleted", () => {
        store().selectRange(1, 9);
        expect(selectedStoredTimeline(store())).toBeNull();
        store().setStoredTimelines([timeline(5, 1, 9, [1])]);
        expect(selectedStoredTimeline(store())?.id).toBe(5);
        store().setStoredTimelines([]);
        expect(store().selection).toEqual({ kind: "range", start: 1, end: 9 });
        expect(selectedStoredTimeline(store())).toBeNull();
    });

    it("dims nobody under UI-10: dragging is what adds", () => {
        store().setStoredTimelines([
            timeline(5, 1, 9, [1]),
            timeline(6, 17, 25, []),
        ]);
        store().selectRange(1, 9);
        expect(isMarcherDimmed(store(), 2)).toBe(false);
        store().selectRange(17, 25);
        expect(isMarcherDimmed(store(), 1)).toBe(false);
    });

    it("dims nobody on a range before the stored timelines load", () => {
        store().selectRange(1, 9);
        expect(store().storedTimelines).toBeNull();
        expect(isMarcherDimmed(store(), 1)).toBe(false);
    });

    it("the unpinned start flag follows navigation to the page box holding the playhead", () => {
        store().setPageBoxes(BOXES);
        store().seek(13);
        expect(store().startBeat).toBe(9);
        expect(store().startPinned).toBe(false);
        expect(store().selection).toEqual({ kind: "range", start: 9, end: 13 });
        store().seek(17); // on a flag: the box ending there
        expect(store().selection).toEqual({ kind: "range", start: 9, end: 17 });
        store().seek(30); // past the last flag: the last flag
        expect(store().selection).toEqual({
            kind: "range",
            start: 25,
            end: 30,
        });
        store().seek(0);
        expect(store().selection).toEqual({ kind: "home" });
    });

    it("a dragged range pins the start flag until the playhead reaches it", () => {
        store().setPageBoxes(BOXES);
        store().selectRange(12, 17);
        expect(store().startPinned).toBe(true);
        store().seek(22); // navigation keeps a pinned flag behind the playhead
        expect(store().selection).toEqual({
            kind: "range",
            start: 12,
            end: 22,
        });
        store().seek(12); // reaching it unpins it
        expect(store().startPinned).toBe(false);
        expect(store().selection).toEqual({ kind: "range", start: 9, end: 12 });
        store().selectRange(9, 17); // a page box is unpinned
        expect(store().startPinned).toBe(false);
    });

    it("playback moves only the playhead, and Stop returns it to the start flag", () => {
        store().setPageBoxes(BOXES);
        store().selectRange(9, 17);
        store().seekKeepingStart(30); // paused far past the flag: the flag stays
        expect(store().selection).toEqual({ kind: "range", start: 9, end: 30 });
        store().returnToStart();
        expect(store().playheadBeat).toBe(9);
        expect(store().startBeat).toBe(9);
        // On the flag, the window falls back to the page box ending there
        expect(store().selection).toEqual({ kind: "range", start: 1, end: 9 });
    });

    it("Stop inside page 1 returns home: page 1's box starts at beat 1, show time 0", () => {
        store().setPageBoxes(BOXES);
        store().seek(5);
        expect(store().startBeat).toBe(1);
        store().returnToStart();
        expect(store().playheadBeat).toBe(0);
        expect(store().selection).toEqual({ kind: "home" });
        expect(editWindow(1, 1, BOXES)).toEqual({ kind: "home" });
        expect(followingStart(1, BOXES)).toBe(0);
    });

    it("a start flag placed before the page boxes load is unpinned when they arrive", () => {
        store().selectRange(9, 17);
        expect(store().startPinned).toBe(true); // no boxes yet
        store().setPageBoxes(BOXES);
        expect(store().startPinned).toBe(false);
        expect(store().selection).toEqual({ kind: "range", start: 9, end: 17 });
    });

    it("computes the window and the following start as pure functions", () => {
        expect(followingStart(0, BOXES)).toBe(0);
        expect(followingStart(5, BOXES)).toBe(1);
        expect(followingStart(5, [])).toBe(0);
        expect(editWindow(9, 13, BOXES)).toEqual({
            kind: "range",
            start: 9,
            end: 13,
        });
        expect(editWindow(9, 9, BOXES)).toEqual({
            kind: "range",
            start: 1,
            end: 9,
        });
        expect(editWindow(9, 0, BOXES)).toEqual({ kind: "home" });
    });

    it("moves a selection with its timeline's clip move, and no other", () => {
        store().selectRange(1, 9);
        store().followTimelineShift({ start: 9, end: 17 }, 2);
        expect(store().selection).toEqual({ kind: "range", start: 1, end: 9 });
        store().followTimelineShift({ start: 1, end: 9 }, 2);
        expect(store().selection).toEqual({ kind: "range", start: 3, end: 11 });
        // UI-10: the window's end is the playhead, so it moves too
        expect(store().playheadBeat).toBe(11);
    });

    it("moves the loaded stored timeline with the selection, so it still resolves before the reload", () => {
        store().setStoredTimelines([
            timeline(5, 1, 9, [1, 2]),
            timeline(6, 9, 17, [3]),
        ]);
        store().selectRange(1, 9);
        store().followTimelineShift({ start: 1, end: 9 }, 2);
        expect(selectedStoredTimeline(store())?.id).toBe(5);
        expect(isMarcherDimmed(store(), 1)).toBe(false);
        expect(store().storedTimelines!.map((t) => [t.start, t.end])).toEqual([
            [3, 11],
            [9, 17],
        ]);
    });

    describe("isolation (docs/timeline/research/ownership/09-isolation.md)", () => {
        const TIMELINES = [
            timeline(1, 1, 9, [1, 2]),
            timeline(2, 9, 17, [1, 2, 3]),
            timeline(3, 12, 20, [3]),
        ];
        beforeEach(() => {
            store().setPageBoxes(BOXES);
            store().setStoredTimelines(TIMELINES);
        });

        it("sets the window to the timeline and dims and locks only those outside it", () => {
            store().seek(5);
            store().isolate(3);
            expect(store().isolation?.timelineId).toBe(3);
            expect(store().selection).toEqual({
                kind: "range",
                start: 12,
                end: 20,
            });
            expect(isMarcherDimmed(store(), 3)).toBe(false);
            expect(isMarcherDimmed(store(), 1)).toBe(true);
            // Ignored: a timeline that isn't loaded
            store().isolate(99);
            expect(store().isolation?.timelineId).toBe(3);
        });

        it("keeps the playhead inside the timeline and the start flag on its start", () => {
            store().isolate(3);
            store().seek(30);
            expect(store().playheadBeat).toBe(20);
            // Never on the start flag: UI-10 would fall back to the previous page box there
            store().seek(2);
            expect(store().playheadBeat).toBe(13);
            store().seek(15);
            expect(store().startBeat).toBe(12);
            expect(store().selection).toEqual({
                kind: "range",
                start: 12,
                end: 15,
            });
            store().seekKeepingStart(40);
            expect(store().playheadBeat).toBe(20);
        });

        it("Esc (exit) restores the start flag and playhead it saved", () => {
            store().selectRange(3, 9);
            store().isolate(2);
            store().isolate(3);
            store().seek(14);
            store().exitIsolation();
            expect(store().isolation).toBeNull();
            expect(store().startBeat).toBe(3);
            expect(store().startPinned).toBe(true);
            expect(store().playheadBeat).toBe(9);
        });

        it("navigating to a page box, home or a dragged range ends isolation", () => {
            store().isolate(3);
            store().selectRange(1, 9);
            expect(store().isolation).toBeNull();
            store().isolate(3);
            store().selectHome();
            expect(store().isolation).toBeNull();
        });

        it("ends when the timeline goes away, and follows it when its range changes", () => {
            store().isolate(3);
            store().setStoredTimelines([
                TIMELINES[0]!,
                TIMELINES[1]!,
                timeline(3, 14, 22, [3]),
            ]);
            expect(store().isolation).toMatchObject({ start: 14, end: 22 });
            expect(store().selection).toEqual({
                kind: "range",
                start: 14,
                end: 20,
            });
            store().setStoredTimelines(TIMELINES.slice(0, 2));
            expect(store().isolation).toBeNull();
            expect(isMarcherDimmed(store(), 1)).toBe(false);
        });

        it("Stop and the loop's wrap keep the window on the isolated move (code review 1)", () => {
            store().isolate(2);
            store().returnToStart();
            expect(store().playheadBeat).toBe(10);
            expect(store().selection).toEqual({
                kind: "range",
                start: 9,
                end: 10,
            });
            store().seek(9);
            expect(store().selection).toEqual({
                kind: "range",
                start: 9,
                end: 10,
            });
        });

        it("keeps S on the isolated start when the page boxes change (code review 4)", () => {
            store().isolate(2);
            store().seek(12);
            store().setPageBoxes([
                { start: 1, end: 6 },
                { start: 6, end: 17 },
                { start: 17, end: 25 },
            ]);
            expect(store().selection).toEqual({
                kind: "range",
                start: 9,
                end: 12,
            });
        });

        it("moves S and P with the isolated clip even with P mid-range (code review 5)", () => {
            store().isolate(3);
            store().seek(15);
            store().followTimelineShift({ start: 12, end: 20 }, 2);
            expect(store().isolation).toMatchObject({ start: 14, end: 22 });
            expect(store().selection).toEqual({
                kind: "range",
                start: 14,
                end: 17,
            });
            // The reload then finds the range unchanged
            store().setStoredTimelines([
                TIMELINES[0]!,
                TIMELINES[1]!,
                timeline(3, 14, 22, [3]),
            ]);
            expect(store().selection).toEqual({
                kind: "range",
                start: 14,
                end: 17,
            });
        });

        it("restores the window it was given (the one before a double-click's clicks; code review 3)", () => {
            store().selectRange(3, 9);
            const before = {
                startBeat: store().startBeat,
                startPinned: store().startPinned,
                playheadBeat: store().playheadBeat,
            };
            // The double-click's single clicks select the page box first
            store().selectRange(9, 17);
            store().isolate(2, before);
            store().exitIsolation();
            expect(store().selection).toEqual({
                kind: "range",
                start: 3,
                end: 9,
            });
        });

        it("selecting nothing ends isolation (code review 10)", () => {
            store().isolate(3);
            store().selectNothing();
            expect(store().isolation).toBeNull();
            expect(isMarcherDimmed(store(), 1)).toBe(false);
        });
    });
});

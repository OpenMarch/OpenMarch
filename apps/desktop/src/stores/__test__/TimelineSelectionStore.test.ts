import { beforeEach, describe, expect, it } from "vitest";
import {
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

describe("TimelineSelectionStore (UI-9)", () => {
    beforeEach(() => store().reset());

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

    it("seeking moves only the playhead, and bumps the revision even in place", () => {
        store().selectRange(1, 9);
        const revision = store().playheadRevision;
        store().seek(4);
        expect(store().selection).toEqual({ kind: "range", start: 1, end: 9 });
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

    it("dims marchers without a transition in the selected stored timeline only", () => {
        store().setStoredTimelines([
            timeline(5, 1, 9, [1]),
            timeline(6, 17, 25, []),
        ]);
        expect(isMarcherDimmed(store(), 2)).toBe(false); // home
        store().selectRange(1, 9);
        expect(isMarcherDimmed(store(), 1)).toBe(false);
        expect(isMarcherDimmed(store(), 2)).toBe(true);
        store().selectRange(9, 17); // not stored yet: nobody is dimmed
        expect(isMarcherDimmed(store(), 1)).toBe(false);
        expect(isMarcherDimmed(store(), 2)).toBe(false);
        store().selectRange(17, 25); // stored with nobody in it: everyone is dimmed
        expect(isMarcherDimmed(store(), 1)).toBe(true);
        expect(isMarcherDimmed(store(), 2)).toBe(true);
        store().selectNothing();
        expect(isMarcherDimmed(store(), 1)).toBe(false);
    });

    it("dims nobody on a range before the stored timelines load", () => {
        store().selectRange(1, 9);
        expect(store().storedTimelines).toBeNull();
        expect(isMarcherDimmed(store(), 1)).toBe(false);
    });

    it("starts dimming non-members once the selected range's timeline is stored", () => {
        store().setStoredTimelines([]);
        store().selectRange(9, 17);
        expect(isMarcherDimmed(store(), 1)).toBe(false);
        expect(isMarcherDimmed(store(), 2)).toBe(false);
        store().setStoredTimelines([timeline(7, 9, 17, [1])]); // Add selected marchers
        expect(isMarcherDimmed(store(), 1)).toBe(false);
        expect(isMarcherDimmed(store(), 2)).toBe(true);
        store().setStoredTimelines([]); // undone
        expect(isMarcherDimmed(store(), 2)).toBe(false);
    });

    it("moves a selection with its timeline's clip move, and no other", () => {
        store().selectRange(1, 9);
        store().followTimelineShift({ start: 9, end: 17 }, 2);
        expect(store().selection).toEqual({ kind: "range", start: 1, end: 9 });
        store().followTimelineShift({ start: 1, end: 9 }, 2);
        expect(store().selection).toEqual({ kind: "range", start: 3, end: 11 });
        expect(store().playheadBeat).toBe(9);
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
});

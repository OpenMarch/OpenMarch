import { describe, expect, it, vi } from "vitest";
import type { StoredTimelineMembership } from "@/stores/TimelineSelectionStore";
import {
    pauseToSplit,
    mergeDirection,
    mergeVerdict,
    moveMenuEntries,
    pageMenuEntries,
    splitEntryState,
    splitVerdict,
    timelineLabel,
    type SplitMergeContext,
} from "../splitMergeMoves";
import { isVerticalPeel, PEEL_START_PX } from "../TimelineClipPeel";

/** The split and merge entries and drag previews (docs/timeline/ui.md UI-25). */

const timeline = (
    id: number,
    start: number,
    end: number,
    marcherIds: number[],
    name: string | null = null,
): StoredTimelineMembership => ({
    id,
    start,
    end,
    marcherIds: new Set(marcherIds),
    name,
});

const BOXES = [
    { start: 1, end: 9, name: "1" },
    { start: 9, end: 17, name: "2" },
    { start: 17, end: 25, name: "3" },
];
// Page 2's timeline (3), a move split off it (7), page 3's timeline (4), and a move inside it (5)
const TIMELINES = [
    timeline(3, 9, 17, [1, 2, 3]),
    timeline(7, 9, 17, [4, 5], "Move 2"),
    timeline(4, 17, 25, [1, 2]),
    timeline(5, 18, 22, [6], "Move 1"),
];

const ctx = (
    selected: number[],
    isPlaying = false,
    storedTimelines = TIMELINES,
): SplitMergeContext => ({
    storedTimelines,
    pageBoxes: BOXES,
    selectedMarcherIds: new Set(selected),
    isPlaying,
});

const pageRangeOf = (pageId: number) => BOXES[pageId - 1] ?? null;

const commands = () => ({ split: vi.fn(), merge: vi.fn() });

describe("split and merge entries (UI-25)", () => {
    it("names a page's own timeline by its page and a split move by its label", () => {
        expect(timelineLabel(ctx([]), 3)).toBe("Page 2");
        expect(timelineLabel(ctx([]), 7)).toBe("Move 2");
    });

    it("counts the selected members, and says why it can't split", () => {
        expect(splitEntryState(ctx([1, 2, 9]), 3)).toEqual({
            label: "Split 2 selected into new move",
            disabledReason: null,
        });
        expect(splitEntryState(ctx([9]), 3)!.disabledReason).toMatch(
            /Select marchers in Page 2/,
        );
        // A page's own move splits off whole (#581); another move doesn't
        expect(splitEntryState(ctx([1, 2, 3]), 3)).toEqual({
            label: "Split 3 selected into new move",
            disabledReason: null,
        });
        expect(splitEntryState(ctx([4, 5]), 7)!.disabledReason).toMatch(
            /Every marcher in Move 2 is selected/,
        );
        expect(splitEntryState(ctx([1], true), 3)!.disabledReason).toBe(
            pauseToSplit(),
        );
    });

    it("a move's menu offers Merge into each page it overlaps, fitting it to other counts", () => {
        const c = commands();
        const entries = moveMenuEntries(ctx([4]), 7, null, 7, c);
        expect(entries.map((e) => [e.id, e.label, e.disabledReason])).toEqual([
            ["split", "Split 1 selected into new move", null],
            ["merge-into-page", "Merge into Page 2", null],
        ]);
        entries[1]!.onSelect();
        expect(c.merge).toHaveBeenCalledWith(7, 3);
        entries[0]!.onSelect();
        expect(c.split).toHaveBeenCalledWith(7, [4]);
        // Move 1 sits inside page 3: merging fits it to the page's counts (owner, 2026-10-18)
        expect(
            moveMenuEntries(ctx([6]), 5, null, 5, c).map((e) => [
                e.id,
                e.label,
                e.disabledReason,
            ]),
        ).toEqual([
            ["split", "Split 1 selected into new move", expect.any(String)],
            ["merge-into-page", "Merge into Page 3 · fit to its counts", null],
        ]);
        // Across a flag, one entry per page
        const across = [...TIMELINES, timeline(9, 13, 21, [7], "Move 4")];
        expect(
            moveMenuEntries(ctx([], false, across), 9, null, 9, c)
                .filter((e) => e.id.startsWith("merge-into-page"))
                .map((e) => e.label),
        ).toEqual([
            "Merge into Page 2 · fit to its counts",
            "Merge into Page 3 · fit to its counts",
        ]);
    });

    it("with a second move selected, offers Merge moves into the right-clicked one, or into the page's", () => {
        const both = [...TIMELINES, timeline(8, 9, 17, [6], "Move 3")];
        const pair = moveMenuEntries(ctx([], false, both), 8, 7, 8, commands());
        expect(pair.find((e) => e.id === "merge-pair")).toMatchObject({
            label: "Merge Move 2 into Move 3",
            disabledReason: null,
        });
        // Different counts: the source fits to the target's
        const far = moveMenuEntries(ctx([]), 5, 7, 5, commands());
        expect(far.find((e) => e.id === "merge-pair")).toMatchObject({
            label: "Merge Move 2 into Move 1 · fit to its counts",
            disabledReason: null,
        });
        expect(mergeDirection(ctx([]), 3, 7)).toEqual({
            sourceId: 7,
            targetId: 3,
        });
    });

    it("refuses a merge that would give a marcher two moves", () => {
        const overlap = [
            timeline(3, 9, 17, [1, 2, 3]),
            timeline(7, 9, 17, [3, 5], "Move 2"),
        ];
        const [, merge] = moveMenuEntries(
            ctx([], false, overlap),
            7,
            null,
            7,
            commands(),
        );
        expect(merge!.disabledReason).toMatch(/in both moves/);
    });

    it("a page box offers the split off its own timeline, or says nothing moves there", () => {
        const c = commands();
        const [entry] = pageMenuEntries(ctx([2]), BOXES[1]!, c);
        expect(entry!.label).toBe("Split 1 selected into new move");
        entry!.onSelect();
        expect(c.split).toHaveBeenCalledWith(3, [2]);
        expect(
            pageMenuEntries(ctx([2]), BOXES[0]!, c)[0]!.disabledReason,
        ).toMatch(/Nothing moves on this page yet/);
        expect(pageMenuEntries(ctx([]), BOXES[0]!, c)).toEqual([]);
    });

    it("a page box whose timeline everyone was split off says it has no move of its own (#581)", () => {
        const c = commands();
        const emptied = [
            timeline(3, 9, 17, []),
            timeline(8, 9, 17, [1, 2, 3], "Move 3"),
        ];
        const [entry] = pageMenuEntries(ctx([2], false, emptied), BOXES[1]!, c);
        expect(entry!.disabledReason).toMatch(/no move of its own/);
        entry!.onSelect();
        expect(c.split).not.toHaveBeenCalled();
        // The split move is a move: named as one, and split as one
        expect(timelineLabel(ctx([], false, emptied), 8)).toBe("Move 3");
        expect(
            splitEntryState(ctx([1, 2, 3], false, emptied), 8)!.disabledReason,
        ).toMatch(/Every marcher in Move 3 is selected/);
    });

    it("an emptied page box with no move left over it says nothing moves there, not to use a clip", () => {
        // Everyone split off, then the move deleted (or the page cleared, or held from the page
        // before): the page timeline is left empty with no clip over its counts
        const alone = [timeline(3, 9, 17, [])];
        const [entry] = pageMenuEntries(
            ctx([2], false, alone),
            BOXES[1]!,
            commands(),
        );
        expect(entry!.disabledReason).toMatch(/Nothing moves on this page yet/);
        // A move over other counts of the page isn't a clip over the box's
        const [inside] = pageMenuEntries(
            ctx([2], false, [...alone, timeline(8, 10, 14, [1], "Move 3")]),
            BOXES[1]!,
            commands(),
        );
        expect(inside!.disabledReason).toMatch(
            /Nothing moves on this page yet/,
        );
    });
});

describe("the clip drag (UI-25)", () => {
    it("locks to vertical only when it starts up or down", () => {
        expect(isVerticalPeel(0, PEEL_START_PX)).toBe(true);
        expect(isVerticalPeel(4, -PEEL_START_PX)).toBe(true);
        expect(isVerticalPeel(6, PEEL_START_PX)).toBe(false);
        expect(isVerticalPeel(0, PEEL_START_PX - 1)).toBe(false);
    });

    it("previews a split only with members selected", () => {
        expect(splitVerdict(ctx([]), 3)).toBeNull();
        expect(splitVerdict(ctx([9]), 3)).toBeNull();
        expect(splitVerdict(ctx([1, 2]), 3)).toEqual({
            label: "Split 2 marchers",
        });
        expect(splitVerdict(ctx([1, 2, 3]), 3)).toEqual({
            label: "Split 3 marchers",
        });
        expect(splitVerdict(ctx([4, 5]), 7)).toMatchObject({
            refused: true,
        });
    });

    it("previews a merge onto a page box or a move, and why not", () => {
        expect(mergeVerdict(ctx([]), 7, { pageId: 2 }, pageRangeOf)).toEqual({
            label: "Merge into Page 2",
        });
        expect(mergeVerdict(ctx([]), 7, { pageId: 3 }, pageRangeOf)).toEqual({
            label: "Merge into Page 3 · fit to its counts",
        });
        expect(
            mergeVerdict(ctx([]), 7, { pageId: 1 }, pageRangeOf),
        ).toMatchObject({
            refused: true,
            label: "Page 1 has no move of its own to merge into.",
        });
        expect(
            mergeVerdict(ctx([]), 7, { timelineId: 7 }, pageRangeOf),
        ).toBeNull();
        expect(
            mergeVerdict(ctx([], true), 7, { timelineId: 3 }, pageRangeOf),
        ).toMatchObject({ refused: true, label: pauseToSplit() });
    });
});

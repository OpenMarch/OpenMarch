import { describe, expect, it, vi } from "vitest";
import type { PageKeepState } from "../timelineKeepLater";
import {
    holdFromPreviousMenu,
    holdFromPreviousMessage,
} from "../timelineHoldFromPrevious";
import { selectionHeldBars } from "../timelineHeldBars";

/**
 * The page box menu's **Hold from previous page** entry and what its toast says (holds, fork
 * #472), and the selection's Held bars.
 */

const state = (pageId: number): PageKeepState => ({
    pageId,
    pageName: String(pageId),
    box: { start: pageId * 8 + 1, end: pageId * 8 + 9 },
    follows: [],
    fromStart: [],
    from: [],
    midMove: [],
    selected: 3,
});

const names = new Map([
    [1, "T1"],
    [2, "T2"],
    [3, "T3"],
    [4, "T4"],
]);
const nameOf = (id: number) => names.get(id);

describe("holdFromPreviousMenu", () => {
    it("runs for every selected marcher on the page box", () => {
        const run = vi.fn(async () => ({ held: [], skipped: [] }));
        const menu = holdFromPreviousMenu([state(3)], [2, 1], nameOf, run);
        expect(menu.reasonFor(3)).toBeNull();
        expect(menu.reasonFor("3")).toBeNull();
        menu.onSet(3);
        expect(run).toHaveBeenCalledExactlyOnceWith(
            { start: 25, end: 33 },
            [2, 1],
        );
    });

    it("is checked where every selected marcher is Held, and says why where nobody could be", () => {
        const page3 = { ...state(3), follows: [1, 2], selected: 2 };
        const held = [1, 2].map((marcherId) => ({
            id: marcherId,
            marcherId,
            start: 25,
            end: 33,
        }));
        const menu = holdFromPreviousMenu(
            [page3],
            [1, 2],
            nameOf,
            vi.fn(),
            held,
        );
        expect(menu.entryOn?.(3)).toEqual({
            checked: true,
            changes: 0,
            selected: 2,
        });
        expect(menu.reasonFor(3)).toContain("Page 3");
        // Partway through a move: not Held, but it can't be held either
        const partway = holdFromPreviousMenu(
            [{ ...state(3), midMove: [1, 2], selected: 2 }],
            [1, 2],
            nameOf,
            vi.fn(),
        );
        expect(partway.entryOn?.(3)?.checked).toBe(false);
        expect(partway.reasonFor(3)).toContain("partway through a move");
    });

    it("hides the entry when nothing is selected", () => {
        expect(
            holdFromPreviousMenu([], [], nameOf, vi.fn()).reasonFor(3),
        ).toBeUndefined();
        expect(
            holdFromPreviousMenu([state(3)], [], nameOf, vi.fn()).reasonFor(3),
        ).toBeUndefined();
    });
});

describe("holdFromPreviousMessage", () => {
    it("names who is Held, and who isn't with why", () => {
        expect(
            holdFromPreviousMessage(
                {
                    held: [1, 2],
                    skipped: [
                        { marcherId: 3, reason: "noArrival" },
                        { marcherId: 4, reason: "shape" },
                    ],
                },
                "3",
                nameOf,
            ),
        ).toEqual({
            title: "T1 and T2 Held on Page 3",
            description:
                "Not held: T3: no move ends where Page 3 starts; T4: in a shape on this page",
        });
    });

    it("says nobody was held when everyone was skipped, and nothing for nothing", () => {
        expect(
            holdFromPreviousMessage(
                { held: [], skipped: [{ marcherId: 1, reason: "held" }] },
                "2",
                nameOf,
            ),
        ).toEqual({
            title: "Nobody Held on Page 2",
            description: "Not held: T1: already Held here",
        });
        expect(
            holdFromPreviousMessage({ held: [], skipped: [] }, "2", nameOf),
        ).toBeNull();
    });
});

describe("selectionHeldBars", () => {
    const mark = (
        id: number,
        marcherId: number,
        start: number,
        end: number,
    ) => ({
        id,
        marcherId,
        start,
        end,
    });

    it("one bar per stretch for the selected marchers, in selection order", () => {
        const marks = [
            mark(1, 1, 17, 25),
            mark(2, 2, 17, 25),
            mark(3, 3, 9, 25),
            mark(4, 4, 17, 25),
        ];
        expect(selectionHeldBars(marks, [2, 1, 3])).toEqual([
            { start: 9, end: 25, marcherIds: [3], total: 3 },
            { start: 17, end: 25, marcherIds: [2, 1], total: 3 },
        ]);
    });

    it("draws nothing without a selection or marks", () => {
        expect(selectionHeldBars([mark(1, 1, 17, 25)], [])).toEqual([]);
        expect(selectionHeldBars([], [1])).toEqual([]);
    });
});

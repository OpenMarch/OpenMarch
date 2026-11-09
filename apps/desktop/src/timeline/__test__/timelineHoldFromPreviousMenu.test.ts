import { describe, expect, it, vi } from "vitest";
import type { PageKeepState } from "../timelineKeepLater";
import {
    holdFromPreviousLight,
    holdFromPreviousMenu,
    holdFromPreviousMessage,
} from "../timelineHoldFromPrevious";

/**
 * The page box menu's **Hold from last keyframe** entry and what its toast says (holds, fork
 * #472). The selection's hold bars are in timelineHoldBars.test.ts.
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

describe("holdFromPreviousLight", () => {
    const light = (
        patch: Partial<PageKeepState>,
        marcherIds: number[],
        marks: { id: number; marcherId: number; start: number; end: number }[],
    ) =>
        holdFromPreviousLight({
            state: { ...state(3), ...patch },
            marcherIds,
            marks,
            rowsOf: (id) => (id === 3 ? [] : [{ start: 1, end: 9 }]),
            showStart: 1,
        });

    it("shows the hold whole: from the last arrival over the Not defined pages to the page's end", () => {
        const shown = light({ follows: [1] }, [1], []);
        expect(shown?.wouldHold).toBe(true);
        expect(shown?.byMarcher.get(1)).toEqual([{ start: 9, end: 33 }]);
    });

    it("a marcher that never moved shows from the start of the show", () => {
        expect(light({ follows: [3] }, [3], [])?.byMarcher.get(3)).toEqual([
            { start: 1, end: 33 },
        ]);
    });

    it("joins the marcher's earlier hold, and shows a page with its own move too", () => {
        const shown = light(
            { follows: [1] },
            [1, 2],
            [{ id: 1, marcherId: 1, start: 9, end: 17 }],
        );
        expect(shown?.byMarcher.get(1)).toEqual([{ start: 17, end: 33 }]);
        // Marcher 2 isn't in follows: a move of its own there, which the hold would replace
        expect(shown?.byMarcher.get(2)).toEqual([{ start: 9, end: 33 }]);
    });

    it("leaves out a marcher Held over part of the page with a move of its own after", () => {
        expect(
            light({}, [1], [{ id: 1, marcherId: 1, start: 25, end: 29 }]),
        ).toBeNull();
    });

    it("leaves out who it wouldn't change, and shows nothing when that's everyone", () => {
        const heldThere = [{ id: 1, marcherId: 1, start: 25, end: 33 }];
        const shown = light({ follows: [1], midMove: [2] }, [1, 2], heldThere);
        expect(shown).toBeNull();
    });
});

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
                "Not held: T3: a move ends at Page 3 without arriving there; T4: in a shape on this page",
        });
    });

    it("names the pages covered when the hold reaches back beyond the page", () => {
        expect(
            holdFromPreviousMessage(
                {
                    held: [1],
                    skipped: [],
                    pagesCovered: ["3", "4", "5"],
                },
                "5",
                nameOf,
            ),
        ).toEqual({ title: "T1 Held on Pages 3–5", description: null });
    });

    it("names the page a move ended at when it ended further back without arriving", () => {
        expect(
            holdFromPreviousMessage(
                {
                    held: [],
                    skipped: [
                        { marcherId: 3, reason: "noArrival", atPage: "3" },
                        { marcherId: 4, reason: "noArrival" },
                    ],
                },
                "5",
                nameOf,
            )?.description,
        ).toBe(
            "Not held: T3: a move ends at Page 3 without arriving there; T4: a move ends at Page 5 without arriving there",
        );
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

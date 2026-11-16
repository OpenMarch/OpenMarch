import { beforeAll, describe, expect, it } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import { holdEntryStates, marcherPageStates } from "../holdMenuState";
import type { PageKeepState } from "../timelineKeepLater";

/**
 * What the hold commands would do for the selection on a page: each marcher Defined, Held, Not
 * defined or partway through a move, and each command's entry checked or counted from that.
 */

/** Page 3's box is beats 9–17; `selected` defaults to everyone named */
const page3 = ({
    follows = [],
    midMove = [],
    selected,
}: {
    follows?: number[];
    midMove?: number[];
    selected: number;
}): PageKeepState => ({
    pageId: 3,
    pageName: "3",
    box: { start: 9, end: 17 },
    follows,
    fromStart: [],
    from: [],
    midMove,
    selected,
});

const mark = (marcherId: number, start: number, end: number) => ({
    marcherId,
    start,
    end,
});

beforeAll(async () => {
    await tolgee.run();
});

describe("marcherPageStates", () => {
    it("tells Held from Not defined by the marks, and keeps partway apart", () => {
        // 1 and 2 have no move on page 3; 2 has a mark over it; 3 is partway; 4 is Defined
        const states = marcherPageStates(
            page3({ follows: [1, 2], midMove: [3], selected: 4 }),
            [mark(2, 9, 25), mark(1, 1, 9), mark(4, 9, 17)],
        );
        expect(Object.fromEntries(states)).toEqual({
            1: "notDefined",
            2: "held",
            3: "midMove",
        });
    });

    it("counts a mark over any of the box, as the commands do", () => {
        const states = marcherPageStates(page3({ follows: [1], selected: 1 }), [
            mark(1, 16, 30),
        ]);
        expect(states.get(1)).toBe("held");
    });
});

describe("holdEntryStates", () => {
    it("all Held: Hold from last keyframe is checked; Define as shown changes nobody", () => {
        const entries = holdEntryStates(
            page3({ follows: [1, 2], selected: 2 }),
            [mark(1, 9, 17), mark(2, 1, 17)],
        );
        expect(entries.holdFromPrevious).toEqual({
            checked: true,
            changes: 0,
            selected: 2,
        });
        expect(entries.defineAsShown).toEqual({
            checked: false,
            changes: 0,
            selected: 2,
        });
        expect(entries.clearThisPage).toEqual({
            checked: false,
            changes: 2,
            selected: 2,
        });
    });

    it("all Defined: Define as shown is checked", () => {
        const entries = holdEntryStates(page3({ selected: 3 }), []);
        expect(entries.defineAsShown.checked).toBe(true);
        expect(entries.holdFromPrevious).toMatchObject({
            checked: false,
            changes: 3,
        });
        expect(entries.clearThisPage).toMatchObject({
            checked: false,
            changes: 3,
        });
    });

    it("all Not defined: Clear this page is checked", () => {
        const entries = holdEntryStates(
            page3({ follows: [1, 2], selected: 2 }),
            [],
        );
        expect(entries.clearThisPage).toEqual({
            checked: true,
            changes: 0,
            selected: 2,
        });
        expect(entries.defineAsShown).toMatchObject({
            checked: false,
            changes: 2,
        });
        expect(entries.holdFromPrevious).toMatchObject({
            checked: false,
            changes: 2,
        });
    });

    it("mixed: each counts whom it would change, and none is checked", () => {
        // 1 Held, 2 Not defined, 3 partway, 4 and 5 Defined
        const entries = holdEntryStates(
            page3({ follows: [1, 2], midMove: [3], selected: 5 }),
            [mark(1, 9, 17)],
        );
        expect(entries.defineAsShown).toEqual({
            checked: false,
            changes: 1,
            selected: 5,
        });
        // Not the Held one, nor the one partway (its move crosses the flag)
        expect(entries.holdFromPrevious).toEqual({
            checked: false,
            changes: 3,
            selected: 5,
        });
        expect(entries.clearThisPage).toEqual({
            checked: false,
            changes: 4,
            selected: 5,
        });
    });

    it("all partway: nothing is checked and only Clear this page changes anyone", () => {
        const entries = holdEntryStates(
            page3({ midMove: [1, 2], selected: 2 }),
            [],
        );
        expect(entries.defineAsShown).toMatchObject({
            checked: false,
            changes: 0,
        });
        expect(entries.holdFromPrevious).toMatchObject({
            checked: false,
            changes: 0,
        });
        expect(entries.clearThisPage).toMatchObject({
            checked: false,
            changes: 2,
        });
    });

    it("checks nothing with nothing selected", () => {
        const entries = holdEntryStates(page3({ selected: 0 }), []);
        expect(Object.values(entries).some((e) => e.checked)).toBe(false);
    });
});

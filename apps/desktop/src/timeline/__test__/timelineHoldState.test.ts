import { describe, expect, it } from "vitest";
import type { CarrySpan } from "../timelineCarryForward";
import {
    marcherHoldState,
    sharedHoldState,
    type NamedFlag,
} from "../timelineHoldState";

/**
 * The inspector line's state (docs/timeline/ui.md UI-18): "Moves here" where a marcher's own move
 * ends on the current page, "Holding since Page X" where it holds, shown for a selection only
 * when every marcher agrees.
 */

const hold = (start: number, end: number): CarrySpan => ({
    start,
    end,
    kind: "hold",
});
const own = (start: number, end: number): CarrySpan => ({
    start,
    end,
    kind: "join",
});

// Page 1 is home, at beat 0; page 2's flag is beat 9, and so on
const FLAGS: NamedFlag[] = [
    { beat: 0, name: "1" },
    { beat: 9, name: "2" },
    { beat: 17, name: "3" },
    { beat: 25, name: "4" },
    { beat: 33, name: "5" },
];

describe("one marcher's state on the current page", () => {
    // Moves on page 2, holds through pages 3 and 4, moves again on page 5
    const spans = [
        hold(-Infinity, 1),
        own(1, 9),
        hold(9, 25),
        own(25, 33),
        hold(33, Infinity),
    ];

    it("moves here where its own move ends on the page's flag", () => {
        expect(marcherHoldState(spans, 9, FLAGS)).toEqual({
            kind: "movesHere",
        });
        expect(marcherHoldState(spans, 33, FLAGS)).toEqual({
            kind: "movesHere",
        });
    });

    it("holds since the page whose flag its last move ended on", () => {
        expect(marcherHoldState(spans, 17, FLAGS)).toEqual({
            kind: "holding",
            page: { beat: 9, name: "2" },
            fromStart: false,
        });
        expect(marcherHoldState(spans, 25, FLAGS)).toEqual({
            kind: "holding",
            page: { beat: 9, name: "2" },
            fromStart: false,
        });
    });

    it("holds since the first page when it has never moved", () => {
        expect(
            marcherHoldState([hold(-Infinity, Infinity)], 25, FLAGS),
        ).toEqual({
            kind: "holding",
            page: { beat: 0, name: "1" },
            fromStart: true,
        });
    });

    it("moves here for a move ending partway into the page, and holds since that page after", () => {
        const midPage = [hold(-Infinity, 12), own(12, 14), hold(14, Infinity)];
        expect(marcherHoldState(midPage, 17, FLAGS)).toEqual({
            kind: "movesHere",
        });
        expect(marcherHoldState(midPage, 25, FLAGS)).toEqual({
            kind: "holding",
            page: { beat: 17, name: "3" },
            fromStart: false,
        });
    });

    it("says nothing on the first page, partway through a move passing the flag, or off a flag", () => {
        expect(marcherHoldState(spans, 0, FLAGS)).toBeNull();
        const passing = [hold(-Infinity, 9), own(9, 25), hold(25, Infinity)];
        expect(marcherHoldState(passing, 17, FLAGS)).toBeNull();
        expect(marcherHoldState(spans, 20, FLAGS)).toBeNull();
    });
});

describe("a selection's state", () => {
    const holding2 = { kind: "holding", page: FLAGS[1]! } as const;
    const holding3 = { kind: "holding", page: FLAGS[2]! } as const;
    const moves = { kind: "movesHere" } as const;

    it("is the state every marcher shares", () => {
        expect(sharedHoldState([moves, moves])).toEqual(moves);
        expect(sharedHoldState([holding2, { ...holding2 }])).toEqual(holding2);
    });

    it("is nothing when they differ, or any says nothing", () => {
        expect(sharedHoldState([moves, holding2])).toBeNull();
        expect(sharedHoldState([holding2, holding3])).toBeNull();
        expect(sharedHoldState([holding2, null])).toBeNull();
        expect(sharedHoldState([])).toBeNull();
    });
});

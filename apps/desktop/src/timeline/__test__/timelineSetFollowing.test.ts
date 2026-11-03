// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createResolver, type XY } from "@openmarch/core";
import {
    followingAt,
    isSetAt,
    marcherSetBeats,
    selectionKeyframes,
    type SetSpan,
} from "../timelineSetFollowing";

/**
 * Set vs Following (#300): a marcher is Set on a count where a move of its own ends, moved or not
 * (holds decision 13, #468), and on the first page; everywhere else it's Following.
 */

const hold = (start: number, end: number): SetSpan => ({
    start,
    end,
    kind: "hold",
});
const own = (start: number, end: number): SetSpan => ({
    start,
    end,
    kind: "join",
});

describe("one marcher's Set counts", () => {
    // Home at 0,0; moves to 8,0 over beats 1–9; holds; moves to 8,8 over 25–29 (mid-page 5)
    const spans = [
        hold(-Infinity, 1),
        own(1, 9),
        hold(9, 25),
        own(25, 29),
        hold(29, Infinity),
    ];
    const setBeats = marcherSetBeats(spans);

    it("is Set on the first page, always", () => {
        expect(isSetAt(setBeats, 0)).toBe(true);
        expect(isSetAt([], 0)).toBe(true);
    });

    it("is Set on a move's exact end beat", () => {
        expect(isSetAt(setBeats, 9)).toBe(true);
        expect(isSetAt(setBeats, 29)).toBe(true);
    });

    it("follows one beat before and one beat after a move's end", () => {
        expect(isSetAt(setBeats, 8)).toBe(false);
        expect(isSetAt(setBeats, 10)).toBe(false);
    });

    it("follows partway through a move", () => {
        expect(isSetAt(setBeats, 5)).toBe(false);
        expect(isSetAt(setBeats, 4.5)).toBe(false);
    });

    it("follows on the flag of a page whose move ended mid-page", () => {
        // Page 5's flag is beat 33; the move ended on beat 29
        expect(isSetAt(setBeats, 33)).toBe(false);
    });

    it("lists its Set beats ascending, without the first page's", () => {
        expect(setBeats).toEqual([9, 29]);
    });

    it("is Set on a move that goes nowhere: a stored move end is a keyframe (#468)", () => {
        // A stay (Only Page N, Remove keyframe's next-page move): the spans carry no positions,
        // so a move ending where it began reads like any other
        const stay = [hold(-Infinity, 1), own(1, 9), hold(9, Infinity)];
        expect(isSetAt(marcherSetBeats(stay), 9)).toBe(true);
    });
});

describe("a count where a later move cuts in", () => {
    // Row 1 runs over [1, 17); row 2 starts inside it at 9, so row 1's first span stops at 9
    const cut = (start: number, end: number, _row: number, rowEnd: number) => ({
        ...own(start, end),
        assignmentEnd: rowEnd,
    });
    it("is not Set where the cut stops a span: no move of the marcher's ends there", () => {
        const spans = [
            hold(-Infinity, 1),
            cut(1, 9, 1, 17),
            cut(9, 13, 2, 13),
            cut(13, 17, 1, 17),
            hold(17, Infinity),
        ];
        expect(marcherSetBeats(spans)).toEqual([13, 17]);
    });

    it("is Set where one move ends and the next starts on the same count (a split)", () => {
        const spans = [
            hold(-Infinity, 1),
            cut(1, 9, 1, 9),
            cut(9, 17, 2, 17),
            hold(17, Infinity),
        ];
        expect(marcherSetBeats(spans)).toEqual([9, 17]);
    });
});

describe("Set counts from the resolver's spans", () => {
    /** One marcher, home at 0,0, with direct moves of its own in shapeless one-slot transitions. */
    const resolverOf = (
        moves: readonly (readonly [
            start: number,
            end: number,
            layer: number,
            to: XY,
        ])[],
    ) =>
        createResolver({
            marchers: [{ id: 1, home: [0, 0] }],
            shapes: {},
            transitions: Object.fromEntries(
                moves.map(([start, end, , to], i) => [
                    i + 1,
                    {
                        id: i + 1,
                        start,
                        end,
                        dest: null,
                        points: [to],
                        slots: 1,
                        style: "direct",
                        order: "inherit",
                        params: null,
                    },
                ]),
            ),
            assignments: moves.map(([start, end, layer], i) => ({
                id: i + 1,
                marcher: 1,
                transition: i + 1,
                slot: 0,
                start,
                end,
                layer,
            })),
        });
    const setBeats = (r: ReturnType<typeof createResolver>) =>
        marcherSetBeats(r.spanInfos(1));

    it("a move inside another: Set where each ends, not where the inner one starts", () => {
        // Spec G3's shape: [0, 16) on layer 0, [4, 12) on layer 1
        const r = resolverOf([
            [0, 16, 0, [16, 0]],
            [4, 12, 1, [0, 8]],
        ]);
        expect(setBeats(r)).toEqual([12, 16]);
    });

    it("a move cut off for good by a later one: its own end is never reached, so not Set", () => {
        // L-3: [0, 12) is cut at 8 by [8, 16) and never resumes
        const r = resolverOf([
            [0, 12, 0, [12, 0]],
            [8, 16, 1, [0, 8]],
        ]);
        expect(setBeats(r)).toEqual([16]);
    });

    it("a move that goes nowhere: Set where it ends, though the marcher never moves (#468)", () => {
        // Home at 0,0; [8, 16) ends at 0,0 too, a stay the designer stored
        const r = resolverOf([[8, 16, 0, [0, 0]]]);
        expect(r.positionAt(1, 8)).toEqual(r.positionAt(1, 16));
        expect(setBeats(r)).toEqual([16]);
    });

    it("a stay cut partway by a later move: not Set where the cut stops it (#384)", () => {
        // [0, 12) goes nowhere and [4, 8) on a higher layer takes over partway: the stay's span
        // stops at 4, where nothing ends, and resumes to its own end at 12
        const r = resolverOf([
            [0, 12, 0, [0, 0]],
            [4, 8, 1, [0, 0]],
        ]);
        expect(setBeats(r)).toEqual([8, 12]);
    });

    it("a stay cut off for good by a later one: never Set", () => {
        const r = resolverOf([
            [0, 12, 0, [0, 0]],
            [8, 16, 1, [4, 0]],
        ]);
        expect(setBeats(r)).toEqual([16]);
    });
});

describe("who follows at a count", () => {
    const setBeats = new Map<number, readonly number[]>([
        [1, [9, 17]],
        [2, [17]],
        [3, []],
    ]);

    it("is everyone not Set there", () => {
        expect([...followingAt(setBeats, 9)].sort()).toEqual([2, 3]);
        expect([...followingAt(setBeats, 17)]).toEqual([3]);
        expect([...followingAt(setBeats, 12)].sort()).toEqual([1, 2, 3]);
    });

    it("is nobody on the first page", () => {
        expect(followingAt(setBeats, 0).size).toBe(0);
    });
});

describe("the selection's keyframes", () => {
    it("are the counts any selected marcher is Set on, ascending, filled where all of them are", () => {
        expect(
            selectionKeyframes([[9, 17, 33], [17], [9, 25]], [4, 7, 2]),
        ).toEqual([
            { beat: 9, set: 2, total: 3, marcherIds: [4, 2] },
            { beat: 17, set: 2, total: 3, marcherIds: [4, 7] },
            { beat: 25, set: 1, total: 3, marcherIds: [2] },
            { beat: 33, set: 1, total: 3, marcherIds: [4] },
        ]);
        expect(selectionKeyframes([[9, 17], [17]], [1, 2])).toEqual([
            { beat: 9, set: 1, total: 2, marcherIds: [1] },
            { beat: 17, set: 2, total: 2, marcherIds: [1, 2] },
        ]);
    });

    it("are every Set count of one selected marcher, each filled", () => {
        expect(selectionKeyframes([[9, 29]], [5])).toEqual([
            { beat: 9, set: 1, total: 1, marcherIds: [5] },
            { beat: 29, set: 1, total: 1, marcherIds: [5] },
        ]);
    });

    it("leave out the first page, where everyone is always Set", () => {
        expect(selectionKeyframes([[0, 9], [9]], [1, 2])).toEqual([
            { beat: 9, set: 2, total: 2, marcherIds: [1, 2] },
        ]);
    });

    it("are none with nothing selected, or when nobody selected is Set anywhere", () => {
        expect(selectionKeyframes([], [])).toEqual([]);
        expect(selectionKeyframes([[], []], [1, 2])).toEqual([]);
    });
});

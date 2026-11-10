import { describe, expect, it } from "vitest";
import {
    applyHoldEdgeDrag,
    holdReachBack,
    holdEdgeHandles,
    holdEdgeLimits,
    intersectHoldEdgeLimits,
    landHoldEdge,
    mergeTouchingMarks,
    holdOverWindowStart,
} from "../holdExtent";

/** Shaping a hold (fork #475): where a Held hold's end may go, and touching holds joining. */

const mark = (marcherId: number, start: number, end: number, id = start) => ({
    id: marcherId * 1000 + id,
    marcherId,
    start,
    end,
});

describe("holdEdgeLimits", () => {
    it("lets the end go from one count after the start to the next move", () => {
        expect(
            holdEdgeLimits({
                mark: { start: 17, end: 25 },
                moves: [
                    { start: 9, end: 17 },
                    { start: 29, end: 33 },
                ],
                showEnd: 40,
            }),
        ).toEqual({
            from: 25,
            min: 18,
            max: 29,
            minBlock: "minimum",
            maxBlock: "nextMove",
        });
    });

    it("stops the end at the show's end when no move follows", () => {
        expect(
            holdEdgeLimits({
                mark: { start: 17, end: 25 },
                moves: [{ start: 9, end: 17 }],
                showEnd: 33,
            }),
        ).toMatchObject({ max: 33, maxBlock: "showEnd" });
    });
});

describe("holdReachBack", () => {
    const start = 33;
    const showStart = 1;
    const reach = (
        rows: { start: number; end: number }[],
        marks: { start: number; end: number }[] = [],
    ) => holdReachBack({ start, rows, marks, showStart });

    it("reaches the marcher's last row end before the hold", () => {
        expect(
            reach([
                { start: 1, end: 9 },
                { start: 9, end: 17 },
            ]),
        ).toEqual({ kind: "row", beat: 17 });
    });

    it("stops at its own earlier hold when that ends later", () => {
        expect(
            reach([{ start: 9, end: 17 }], [{ start: 17, end: 25 }]),
        ).toEqual({ kind: "hold", beat: 25 });
    });

    it("stops at the last row end when that is later than an earlier hold's", () => {
        expect(
            reach([{ start: 21, end: 29 }], [{ start: 9, end: 17 }]),
        ).toEqual({ kind: "row", beat: 29 });
    });

    it("reaches the start of the show for a marcher who never moved", () => {
        expect(reach([])).toEqual({ kind: "show", beat: 1 });
        expect(
            holdReachBack({ start: 0, rows: [], marks: [], showStart: 1 }),
        ).toEqual({ kind: "show", beat: 0 });
    });

    it("ignores rows and holds that end after it", () => {
        expect(
            reach([{ start: 41, end: 49 }], [{ start: 41, end: 49 }]),
        ).toEqual({ kind: "show", beat: 1 });
    });
});

describe("landHoldEdge", () => {
    it("clamps to the limits and says what stopped it", () => {
        const limits = holdEdgeLimits({
            mark: { start: 17, end: 25 },
            moves: [{ start: 29, end: 33 }],
            showEnd: 33,
        })!;
        expect(landHoldEdge(limits, 31)).toEqual({
            beat: 29,
            blocked: "nextMove",
        });
        expect(landHoldEdge(limits, 12)).toEqual({
            beat: 18,
            blocked: "minimum",
        });
        expect(landHoldEdge(limits, 21)).toEqual({ beat: 21, blocked: null });
    });
});

describe("intersectHoldEdgeLimits", () => {
    it("keeps the tightest of several holds' limits, with what stops each side", () => {
        const a = holdEdgeLimits({
            mark: { start: 17, end: 25 },
            moves: [{ start: 29, end: 33 }],
            showEnd: 40,
        });
        const b = holdEdgeLimits({
            mark: { start: 21, end: 25 },
            moves: [],
            showEnd: 40,
        });
        expect(intersectHoldEdgeLimits([a, b])).toEqual({
            from: 25,
            min: 22,
            max: 29,
            minBlock: "minimum",
            maxBlock: "nextMove",
        });
    });

    it("gives null when one of them can't move", () => {
        const end = holdEdgeLimits({
            mark: { start: 17, end: 25 },
            moves: [],
            showEnd: 40,
        });
        expect(intersectHoldEdgeLimits([end, null])).toBeNull();
    });
});

describe("mergeTouchingMarks and applyHoldEdgeDrag", () => {
    it("joins one marcher's touching or overlapping holds, keeping the earliest id", () => {
        expect(
            mergeTouchingMarks([
                mark(1, 25, 33),
                mark(1, 9, 25),
                mark(2, 9, 17),
                mark(2, 20, 24),
            ]),
        ).toEqual([mark(1, 9, 33, 9), mark(2, 9, 17), mark(2, 20, 24)]);
    });

    it("drags only the selected marchers' edges at `from`, then joins", () => {
        const marks = [mark(1, 9, 17), mark(1, 25, 33), mark(2, 9, 17)];
        expect(
            applyHoldEdgeDrag(marks, {
                from: 17,
                to: 25,
                marcherIds: [1],
            }),
        ).toEqual([mark(1, 9, 33, 9), mark(2, 9, 17)]);
    });
});

describe("holdEdgeHandles", () => {
    it("one handle per end for the selected marchers, none where an end can't move", () => {
        const handles = holdEdgeHandles({
            marcherIds: [2, 1],
            // Both arrive at 17 and stand still to the end; 3 isn't selected
            movesOf: () => [{ start: 9, end: 17 }],
            marks: [mark(1, 17, 33), mark(2, 17, 33), mark(3, 17, 25)],
            showEnd: 33,
        });
        expect(handles).toEqual([
            {
                beat: 33,
                marcherIds: [2, 1],
                limits: {
                    from: 33,
                    min: 18,
                    max: 33,
                    minBlock: "minimum",
                    maxBlock: "showEnd",
                },
            },
        ]);
    });

    it("has no end handle where the hold already runs to its next move and can't shorten", () => {
        expect(
            holdEdgeHandles({
                marcherIds: [1],
                movesOf: () => [
                    { start: 9, end: 17 },
                    { start: 18, end: 25 },
                ],
                marks: [mark(1, 17, 18)],
                showEnd: 33,
            }),
        ).toEqual([]);
    });
});

describe("holdOverWindowStart (#476)", () => {
    const at = (
        windowStart: number,
        rows: { start: number; end: number }[],
        marks: { start: number; end: number }[] = [],
    ) => holdOverWindowStart({ windowStart, rows, marks, showStart: 1 });

    it("starts at the window where a move crosses it or ends there", () => {
        expect(at(13, [{ start: 9, end: 17 }])).toBe(13);
        expect(at(17, [{ start: 9, end: 17 }])).toBe(17);
    });

    it("starts at the window inside or touching a hold of its own", () => {
        expect(at(13, [], [{ start: 9, end: 17 }])).toBe(13);
        expect(at(17, [], [{ start: 9, end: 17 }])).toBe(17);
    });

    it("reaches back over Not defined counts to the last move, the last hold, or the show's start", () => {
        expect(at(21, [{ start: 9, end: 17 }])).toBe(17);
        expect(at(21, [{ start: 9, end: 13 }], [{ start: 13, end: 17 }])).toBe(
            17,
        );
        expect(at(21, [])).toBe(1);
    });
});

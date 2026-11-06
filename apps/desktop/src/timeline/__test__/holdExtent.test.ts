import { describe, expect, it } from "vitest";
import {
    applyHoldEdgeDrag,
    holdEdgeAllows,
    holdEdgeHandles,
    holdEdgeLimits,
    intersectHoldEdgeLimits,
    landHoldEdge,
    mergeTouchingMarks,
} from "../holdExtent";

/** Shaping a hold (fork #475): where a Held hold's edges may go, and touching holds joining. */

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
                edge: "end",
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
                edge: "end",
                mark: { start: 17, end: 25 },
                moves: [{ start: 9, end: 17 }],
                showEnd: 33,
            }),
        ).toMatchObject({ max: 33, maxBlock: "showEnd" });
    });

    it("can't move the start of a hold that grows out of its arrival", () => {
        expect(
            holdEdgeLimits({
                edge: "start",
                mark: { start: 17, end: 25 },
                moves: [{ start: 9, end: 17 }],
                showEnd: 33,
            }),
        ).toBeNull();
    });

    it("moves a start from the starting spots anywhere back to the show's start", () => {
        expect(
            holdEdgeLimits({
                edge: "start",
                mark: { start: 17, end: 25 },
                moves: [{ start: 29, end: 33 }],
                showEnd: 33,
            }),
        ).toEqual({
            from: 17,
            min: 0,
            max: 24,
            minBlock: "showStart",
            maxBlock: "minimum",
        });
    });

    it("moves a start that borrows its spot back to the last arrival only", () => {
        const limits = holdEdgeLimits({
            edge: "start",
            mark: { start: 25, end: 33 },
            moves: [{ start: 9, end: 17 }],
            showEnd: 33,
        })!;
        expect(limits).toMatchObject({ min: 17, max: 25, only: [17, 25] });
        expect(holdEdgeAllows(limits, 17)).toBe(true);
        expect(holdEdgeAllows(limits, 21)).toBe(false);
        expect(landHoldEdge(limits, 20)).toEqual({ beat: 17, blocked: null });
        expect(landHoldEdge(limits, 23)).toEqual({ beat: 25, blocked: null });
    });
});

describe("landHoldEdge", () => {
    it("clamps to the limits and says what stopped it", () => {
        const limits = holdEdgeLimits({
            edge: "end",
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
            edge: "end",
            mark: { start: 17, end: 25 },
            moves: [{ start: 29, end: 33 }],
            showEnd: 40,
        });
        const b = holdEdgeLimits({
            edge: "end",
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
            edge: "end",
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
                edge: "end",
                from: 17,
                to: 25,
                marcherIds: [1],
            }),
        ).toEqual([mark(1, 9, 33, 9), mark(2, 9, 17)]);
    });
});

describe("holdEdgeHandles", () => {
    it("one handle per edge and beat for the selected marchers, none where an edge can't move", () => {
        const handles = holdEdgeHandles({
            marcherIds: [2, 1],
            // Both arrive at 17 and stand still to the end; 3 isn't selected
            movesOf: () => [{ start: 9, end: 17 }],
            marks: [mark(1, 17, 33), mark(2, 17, 33), mark(3, 17, 25)],
            showEnd: 33,
        });
        expect(handles).toEqual([
            {
                edge: "end",
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

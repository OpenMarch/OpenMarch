// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { assignSlots } from "../assign";
import { walksCross } from "../geometry/segments";
import { makePath } from "../geometry/path";
import { dist, xy } from "../geometry/vec";
import { lineKind, type LineParams } from "../kinds/line";
import { leastSquaredTravel } from "../leastTravel";
import { sampleAlong } from "../spacing";
import type { ShapeContext } from "../types";

const STEP = 10;
const ctx: ShapeContext = { stepPx: STEP, snapPoint: (p) => p };

/** Eight marchers in a line two steps apart, listed out of order the way a selection can be */
const shuffled = [5, 0, 7, 2, 6, 1, 3, 4];
const lineAt = (x0: number, y: number) =>
    Array.from({ length: 8 }, (_, i) => xy(x0 + i * 2 * STEP, y));

describe("leastSquaredTravel", () => {
    it("keeps a line's order when it slides along itself, because that is the least travel", () => {
        // Plain distance ties here: the two end marchers can leapfrog the line for the same total
        const from = shuffled.map((i) => lineAt(0, 0)[i]!);
        const spots = lineAt(4 * STEP, 0);
        const result = leastSquaredTravel(from, spots);
        result.forEach((spot, i) =>
            expect(dist(from[i]!, spots[spot]!)).toBeCloseTo(4 * STEP),
        );
    });

    it("keeps a line's order when it moves into a tighter line in front", () => {
        const from = shuffled.map((i) => lineAt(0, 0)[i]!);
        const spots = Array.from({ length: 8 }, (_, i) =>
            xy(4 * STEP + i * STEP, 6 * STEP),
        );
        const result = leastSquaredTravel(from, spots);
        const byX = from
            .map((p, i) => ({ x: p.x, to: spots[result[i]!]!.x }))
            .sort((a, b) => a.x - b.x);
        byX.forEach(
            (m, i) => i > 0 && expect(m.to).toBeGreaterThan(byX[i - 1]!.to),
        );
    });

    it("leaves no walks crossing", () => {
        const from = Array.from({ length: 12 }, (_, i) =>
            xy(((i * 37) % 11) * STEP, ((i * 53) % 7) * STEP),
        );
        const spots = Array.from({ length: 12 }, (_, i) =>
            xy(i * 1.5 * STEP, 20 * STEP),
        );
        const result = leastSquaredTravel(from, spots);
        expect(new Set(result).size).toBe(12);
        for (let i = 0; i < 12; i++)
            for (let j = i + 1; j < 12; j++)
                expect(
                    walksCross(
                        { from: from[i]!, to: spots[result[i]!]! },
                        { from: from[j]!, to: spots[result[j]!]! },
                    ),
                ).toBe(false);
    });
});

describe("assignSlots solver", () => {
    it("uses the solver it is given for the nearest order", () => {
        const params: LineParams = {
            a: xy(0, 0),
            b: xy(30, 0),
            spacing: { mode: "fit" },
        };
        const slots = sampleAlong(
            makePath([{ type: "line", a: params.a, b: params.b }]),
            { mode: "fit" },
            3,
            STEP,
        );
        const solve = vi.fn(() => [2, 1, 0]);
        const result = assignSlots({
            kind: lineKind,
            params,
            slots,
            marchers: [
                { id: 1, at: xy(0, 5), from: xy(0, 9), drillRank: 0 },
                { id: 2, at: xy(15, 5), drillRank: 1 },
                { id: 3, at: xy(30, 5), drillRank: 2 },
            ],
            mode: "nearest",
            ctx,
            solve,
        });
        expect(result).toEqual([2, 1, 0]);
        // decided from where marchers start the move, not where they are drawn
        expect(solve).toHaveBeenCalledWith(
            [xy(0, 9), xy(15, 5), xy(30, 5)],
            slots,
        );
    });
});

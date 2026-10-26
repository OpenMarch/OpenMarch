import { describe, expect, it } from "vitest";
import { snapGroupDelta } from "../GroupUtils";

describe("snapGroupDelta", () => {
    const pps = 10; // pixels per step

    it("moves in whole rounding steps on each axis", () => {
        // 2-step rounding: 37 px (3.7 steps) snaps to 4 steps, -12 px to -2
        expect(
            snapGroupDelta(
                37,
                -12,
                { nearestXSteps: 2, nearestYSteps: 2 },
                pps,
            ),
        ).toEqual({ dx: 40, dy: -20 });
        // 1-step rounding
        expect(
            snapGroupDelta(
                37,
                -12,
                { nearestXSteps: 1, nearestYSteps: 1 },
                pps,
            ),
        ).toEqual({ dx: 40, dy: -10 });
    });

    it("leaves an axis without rounding free", () => {
        expect(snapGroupDelta(37, -12, { nearestXSteps: 2 }, pps)).toEqual({
            dx: 40,
            dy: -12,
        });
        expect(snapGroupDelta(37, -12, undefined, pps)).toEqual({
            dx: 37,
            dy: -12,
        });
    });
});

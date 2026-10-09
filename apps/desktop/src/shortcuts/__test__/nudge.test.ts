import { describe, expect, it } from "vitest";
import { resolveNudgeDistance } from "../nudge";

describe("resolveNudgeDistance", () => {
    it("grid uses axis rounding with fallback 1", () => {
        expect(
            resolveNudgeDistance(
                { direction: "up", step: "grid", snap: true },
                { nearestYSteps: 2, nearestXSteps: 3 },
            ),
        ).toBe(2);
        expect(
            resolveNudgeDistance(
                { direction: "left", step: "grid", snap: true },
                { nearestYSteps: 2, nearestXSteps: 3 },
            ),
        ).toBe(3);
        expect(
            resolveNudgeDistance({
                direction: "down",
                step: "grid",
                snap: true,
            }),
        ).toBe(1);
        expect(
            resolveNudgeDistance(
                { direction: "right", step: "grid", snap: true },
                { nearestXSteps: 0 },
            ),
        ).toBe(1);
    });

    it("fixed steps", () => {
        expect(
            resolveNudgeDistance({
                direction: "up",
                step: "quarter",
                snap: false,
            }),
        ).toBe(0.25);
        expect(
            resolveNudgeDistance({
                direction: "up",
                step: "tenth",
                snap: false,
            }),
        ).toBe(0.1);
        expect(
            resolveNudgeDistance({ direction: "up", step: "four", snap: true }),
        ).toBe(4);
    });
});

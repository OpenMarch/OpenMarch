import { describe, expect, it } from "vitest";
import { planFromAbove, type PlanTriangle } from "../planFromAbove";

/** The 12 triangles of a box from (x0, 0, z0) to (x1, h, z1) */
function box(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    h: number,
): PlanTriangle[] {
    const p = (x: number, y: number, z: number) => [x, y, z];
    const quads = [
        [p(x0, h, z0), p(x1, h, z0), p(x1, h, z1), p(x0, h, z1)], // top
        [p(x0, 0, z0), p(x0, 0, z1), p(x1, 0, z1), p(x1, 0, z0)], // bottom
        [p(x0, 0, z1), p(x0, h, z1), p(x1, h, z1), p(x1, 0, z1)], // front
        [p(x0, 0, z0), p(x1, 0, z0), p(x1, h, z0), p(x0, h, z0)], // back
        [p(x0, 0, z0), p(x0, h, z0), p(x0, h, z1), p(x0, 0, z1)], // left
        [p(x1, 0, z0), p(x1, 0, z1), p(x1, h, z1), p(x1, h, z0)], // right
    ];
    return quads.flatMap(([a, b, c, d]) => [
        [...a, ...b, ...c],
        [...a, ...c, ...d],
    ]);
}

const extent = (flat: readonly number[]) => {
    const xs = flat.filter((_, i) => i % 2 === 0);
    const zs = flat.filter((_, i) => i % 2 === 1);
    return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
};

describe("planFromAbove", () => {
    it("draws a box as one outline at its footprint, in millimeters", () => {
        const plan = planFromAbove(box(-0.5, -0.25, 0.5, 0.25, 1));
        expect(plan.outline).toHaveLength(1);
        const [x0, z0, x1, z1] = extent(plan.outline[0]);
        for (const [got, want] of [
            [x0, -500],
            [z0, -250],
            [x1, 500],
            [z1, 250],
        ])
            expect(Math.abs(got - want)).toBeLessThanOrEqual(5);
        // The top's rim is seen from above
        expect(plan.details.length).toBeGreaterThan(0);
    });

    it("draws two boxes far apart as two outlines", () => {
        const plan = planFromAbove([
            ...box(-1, 0, -0.5, 0.5, 1),
            ...box(0.5, 0, 1, 0.5, 1),
        ]);
        expect(plan.outline).toHaveLength(2);
    });

    it("draws nothing for nothing", () => {
        expect(planFromAbove([])).toEqual({ outline: [], details: [] });
    });

    it("keeps a sign leaning a hair off vertical only with slivers on", () => {
        // 1 m wide, 1 m tall, leaning 1 mm: thinner than a 5 mm cell from above
        const sign: PlanTriangle[] = [
            [-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0.001],
            [-0.5, 0, 0, 0.5, 1, 0.001, -0.5, 1, 0.001],
        ];
        expect(planFromAbove(sign).outline).toEqual([]);
        const [outline] = planFromAbove(sign, { slivers: true }).outline;
        const [x0, , x1] = extent(outline);
        expect(x0).toBeLessThan(-490);
        expect(x1).toBeGreaterThan(490);
    });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";
import { boxTool } from "../box/boxTool";
import { boxFrame, type BoxParams } from "../box/boxGeometry";
import { circleTool } from "../circle/circleTool";
import { pivotPoint, type PivotKey } from "../frame/frame";
import {
    expandStep,
    scaleKeepingRatio,
    scrubKeepingRatio,
} from "../frame/scale";
import {
    edit,
    openTool,
    pointerMove,
    press,
    release,
    undo,
} from "../tool/toolMachine";
import type { AnyToolKind, ToolEnv } from "../tool/toolKind";
import type { ShapeContext, XY } from "../types";

/**
 * Expand and Shrink (#489): one step scales the shape keeping its across:deep ratio, by the
 * owner's half-step rule, around the pivot.
 */

describe("one step of the half-step rule", () => {
    const step = (a: number, d: number, by: -1 | 1) => expandStep([a, d], by);

    it("equal spacings both change by half a step", () => {
        expect(step(2, 2, 1)).toEqual([2.5, 2.5]);
        expect(step(2, 2, -1)).toEqual([1.5, 1.5]);
    });

    it("equal spacings off the ladder both round to the next half step that way", () => {
        expect(step(1.3, 1.3, 1)).toEqual([1.5, 1.5]);
        expect(step(1.3, 1.3, -1)).toEqual([1, 1]);
        expect(step(2.75, 2.75, 1)).toEqual([3, 3]);
        expect(step(2.75, 2.75, -1)).toEqual([2.5, 2.5]);
        // Rounding down onto the floor is fine; under it isn't
        expect(step(0.7, 0.7, -1)).toEqual([0.5, 0.5]);
        expect(step(0.5, 0.5, -1)).toBeNull();
    });

    it("when only one is on the ladder, that one drives", () => {
        // 3 is on the ladder, 2.2 isn't: 3 → 3.5, 2.2 follows the ratio
        const [a, d] = step(3, 2.2, 1)!;
        expect(a).toBe(3.5);
        expect(d).toBeCloseTo((2.2 * 3.5) / 3, 9);
        // The smaller one drives when it is the one on the ladder
        const [a2, d2] = step(3.2, 2, -1)!;
        expect(d2).toBe(1.5);
        expect(a2).toBeCloseTo((3.2 * 1.5) / 2, 9);
    });

    it("when both are on the ladder, the larger drives", () => {
        const [a, d] = step(2, 3, 1)!;
        expect(d).toBe(3.5);
        expect(a).toBeCloseTo((2 * 3.5) / 3, 9);
        const [a2, d2] = step(4, 2, -1)!;
        expect([a2, d2]).toEqual([3.5, 1.75]);
    });

    it("when neither is on the ladder, the larger drives and rounds to the next half step", () => {
        // 3.2 → 3.5 expanding, → 3 shrinking
        const [a, d] = step(3.2, 1.6, 1)!;
        expect(a).toBe(3.5);
        expect(d).toBeCloseTo(1.75, 9);
        const [a2, d2] = step(3.2, 1.6, -1)!;
        expect(a2).toBe(3);
        expect(d2).toBeCloseTo(1.5, 9);
        // A value just past a half step rounds on, not back to where it nearly is
        expect(step(2.7, 1.1, 1)![0]).toBe(3);
        expect(step(2.7, 1.1, -1)![0]).toBe(2.5);
    });

    it("a lone spacing moves to its next half step", () => {
        expect(expandStep([2], 1)).toEqual([2.5]);
        expect(expandStep([2.2], 1)).toEqual([2.5]);
        expect(expandStep([2.2], -1)).toEqual([2]);
    });

    it("never takes either spacing under half a step", () => {
        expect(step(0.5, 0.5, -1)).toBeNull();
        expect(expandStep([0.5], -1)).toBeNull();
        // The driver could go to 1, but the follower would be 0.5 × 1/1.5 ≈ 0.33
        expect(step(1.5, 0.5, -1)).toBeNull();
        // Exactly half a step for the follower is fine
        expect(step(2, 1, -1)).toEqual([1.5, 0.75]);
        expect(step(1, 0.5, 1)).toEqual([1.5, 0.75]);
        // 2 → 1.5 would take 0.5 to 0.375
        expect(step(2, 0.5, -1)).toBeNull();
    });
});

const STEP = 10;
const half = STEP / 2;
const snapHalf = (v: number) => Math.round(v / half) * half;
const env = (over: Partial<ToolEnv> = {}): ToolEnv => ({
    stepPx: STEP,
    snap: true,
    constrain: false,
    gridSnap: (p) => ({ x: snapHalf(p.x), y: snapHalf(p.y) }),
    hitRadius: 3,
    ...over,
});
const ctx: ShapeContext = { stepPx: STEP, snapPoint: (p) => p };
const marchers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        at: { x: 300 + i * 7, y: 300 },
        drillRank: i,
    }));
const near = (a: XY, b: XY, eps = 1e-6) =>
    Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;

function drawn(kind: AnyToolKind, n: number, from: XY, to: XY) {
    let t = openTool(kind, marchers(n));
    t = press(t, from, env());
    t = pointerMove(t, to, env());
    return release(t, ctx);
}

/** The box's across and deep spacings, in steps, as the editor shows them */
const spacings = (p: unknown, n: number) => {
    const [, across, deep] = boxTool.params;
    return [
        across!.value!(p as BoxParams, n, STEP),
        deep!.value!(p as BoxParams, n, STEP),
    ];
};

describe("expanding and shrinking the box", () => {
    const N = 8;
    // 4 × 2 at 2 steps apart, then deep set to 3
    const box = () => {
        const t = drawn(boxTool, N, { x: 0, y: 0 }, { x: 60, y: 20 });
        const [, , deep] = boxTool.params;
        return { t, p: deep!.set!(t.params, N, 3, env())! };
    };

    it("keeps the across:deep ratio and the pivot, as one undo step", () => {
        const { t, p } = box();
        expect(spacings(p, N)).toEqual([2, 3]);
        for (const pivot of ["c", "nw", "se"] as PivotKey[]) {
            const was = pivotPoint(boxFrame(p, N), pivot);
            const bigger = scaleKeepingRatio(boxTool, p, N, 1, pivot, env());
            // Both on the ladder: the larger (deep, 3) drives to 3.5, across follows
            const [a, d] = spacings(bigger, N);
            expect(d).toBe(3.5);
            expect(a / d).toBeCloseTo(2 / 3, 2);
            expect(
                near(pivotPoint(boxFrame(bigger as BoxParams, N), pivot), was),
            ).toBe(true);
        }
        const opened = edit(t, p, ctx);
        const scaled = edit(
            opened,
            scaleKeepingRatio(boxTool, p, N, 1, "c", env()),
            ctx,
        );
        expect(undo(scaled).params).toBe(opened.params);
    });

    it("expand twice and shrink once lands one step up, the ratio kept", () => {
        let { p } = box();
        p = scaleKeepingRatio(boxTool, p, N, 1, "nw", env()) as BoxParams;
        p = scaleKeepingRatio(boxTool, p, N, 1, "nw", env()) as BoxParams;
        p = scaleKeepingRatio(boxTool, p, N, -1, "nw", env()) as BoxParams;
        const [a, d] = spacings(p, N);
        expect(d).toBe(3.5);
        expect(a / d).toBeCloseTo(2 / 3, 2);
    });

    it("stops before a spacing goes under half a step", () => {
        let { p } = box();
        for (let i = 0; i < 20; i++) {
            const next = scaleKeepingRatio(boxTool, p, N, -1, "c", env());
            if (next === null) break;
            p = next as BoxParams;
        }
        const [a, d] = spacings(p, N);
        expect(Math.min(a, d)).toBeGreaterThanOrEqual(0.5 - 1e-9);
        expect(scaleKeepingRatio(boxTool, p, N, -1, "c", env())).toBeNull();
    });

    it("works in Outline and Spread", () => {
        const { t, p } = box();
        for (const mode of ["outline", "spread"] as const) {
            const switched = boxTool.closed!.withDistribution(
                p,
                N,
                boxTool.closed!.startMode(p, N, mode),
                env(),
            );
            const bigger = scaleKeepingRatio(
                boxTool,
                switched,
                N,
                1,
                "c",
                env(),
            );
            expect(bigger).not.toBeNull();
            const before = boxFrame(switched, N);
            const after = boxFrame(bigger as BoxParams, N);
            expect(after.halfWidth).toBeGreaterThan(before.halfWidth);
            // Wider and deeper in the same proportion (a spread's frame, an outline's spacings)
            if (before.halfDepth > 0)
                expect(after.halfWidth / after.halfDepth).toBeCloseTo(
                    before.halfWidth / before.halfDepth,
                    1,
                );
        }
        expect(t).toBeTruthy();
    });
});

describe("expanding a circle", () => {
    it("moves its one interval to the next half step", () => {
        const N = 8;
        const t = drawn(circleTool, N, { x: 0, y: 0 }, { x: 40, y: 0 });
        const [interval] = circleTool.params;
        const p = interval!.set!(t.params, N, 2.2, env())!;
        const bigger = scaleKeepingRatio(circleTool, p, N, 1, "c", env());
        expect(interval!.value!(bigger, N, STEP)).toBe(2.5);
        const center = circleTool.frameOf(p, N).center;
        expect(near(circleTool.frameOf(bigger, N).center, center)).toBe(true);
    });
});

describe("scrubbing Expand", () => {
    const N = 8;
    const p = () => {
        const t = drawn(boxTool, N, { x: 0, y: 0 }, { x: 60, y: 20 });
        const [, , deep] = boxTool.params;
        return deep!.set!(t.params, N, 3, env())!;
    };

    it("takes one step of the rule per 8 px of drag", () => {
        const base = p();
        expect(scrubKeepingRatio(boxTool, base, N, 4, "c", env())).toBe(base);
        expect(
            spacings(scrubKeepingRatio(boxTool, base, N, 17, "c", env()), N)[1],
        ).toBe(4);
        expect(
            spacings(scrubKeepingRatio(boxTool, base, N, -8, "c", env()), N)[1],
        ).toBe(2.5);
        // Far down it stops at the floor rather than giving up
        const tiny = spacings(
            scrubKeepingRatio(boxTool, base, N, -400, "c", env()),
            N,
        );
        expect(Math.min(...tiny)).toBeGreaterThanOrEqual(0.5 - 1e-9);
    });

    it("with fine, moves the driver in hundredths, the ratio kept", () => {
        const base = p();
        const [a, d] = spacings(
            scrubKeepingRatio(
                boxTool,
                base,
                N,
                7,
                "c",
                env({ snap: false, fine: true }),
            ),
            N,
        );
        expect(d).toBeCloseTo(3.07, 6);
        expect(a / d).toBeCloseTo(2 / 3, 2);
    });

    it("with the Snap toggle off, scales freely", () => {
        const base = p();
        const [, d] = spacings(
            scrubKeepingRatio(
                boxTool,
                base,
                N,
                3,
                "c",
                env({ snap: false, pull: false }),
            ),
            N,
        );
        // Half a step per 8 px, unrounded (to the typed precision)
        expect(d).toBeCloseTo(3 + (3 * 0.5) / 8, 2);
    });
});

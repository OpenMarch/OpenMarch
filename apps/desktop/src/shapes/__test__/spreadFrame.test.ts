// @vitest-environment node
import { describe, expect, it } from "vitest";
import { boxTool } from "../box/boxTool";
import { circleTool } from "../circle/circleTool";
import {
    distributionOf,
    reshuffle,
    withMode,
    withSeed,
} from "../distribute/modes";
import type {
    DistributionMode,
    SpreadDistribution,
} from "../distribute/distribution";
import type { BoxParams } from "../box/boxGeometry";
import type { ShapeFrame } from "../frame/frame";
import { fieldToFrame } from "../frame/frame";
import type { AnyToolKind, ToolEnv } from "../tool/toolKind";
import {
    edit,
    openTool,
    pointerMove,
    press,
    release,
    slotsOf,
    type ToolState,
} from "../tool/toolMachine";
import type { ShapeContext, XY } from "../types";

/**
 * A spread fills the frame the designer drew (#439): the frame (center, size, turn) is the
 * shape's, and Reshuffle only picks another even arrangement inside it. It never moves, grows or
 * shrinks the frame or its outline, and the marchers use the whole frame for every seed.
 */

const STEP = 10;
const half = STEP / 2;
const snapHalf = (v: number) => Math.round(v / half) * half;
const env: ToolEnv = {
    stepPx: STEP,
    snap: true,
    constrain: false,
    gridSnap: (p) => ({ x: snapHalf(p.x), y: snapHalf(p.y) }),
    hitRadius: 3,
};
const ctx: ShapeContext = { stepPx: STEP, snapPoint: (p) => p };
const marchers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        at: { x: 300 + i * 7, y: 300 },
        drillRank: i,
    }));

function spreadDrawn(kind: AnyToolKind, n: number, from: XY, to: XY) {
    let t = openTool(kind, marchers(n));
    t = press(t, from, env);
    t = pointerMove(t, to, env);
    t = release(t, ctx);
    return edit(t, withMode(t.kind, t.params, t.spots, "spread", env), ctx);
}

/** The shape reshuffled `times` times, as the Reshuffle button does it */
function reshuffledTimes(t: ToolState, times: number): ToolState {
    for (let i = 0; i < times; i++)
        t = edit(t, reshuffle(t.kind, t.params, t.spots, env), ctx);
    return t;
}

const closestOf = (spots: readonly XY[]) =>
    Math.min(
        ...spots.flatMap((p, i) =>
            spots.slice(i + 1).map((q) => Math.hypot(q.x - p.x, q.y - p.y)),
        ),
    );

const seedOf = (t: ToolState) =>
    (distributionOf(t.kind, t.params, t.spots) as SpreadDistribution).seed;

const SHAPES: Record<string, (n: number) => ToolState> = {
    box: (n) => spreadDrawn(boxTool, n, { x: 0, y: 0 }, { x: 90, y: 40 }),
    circle: (n) => spreadDrawn(circleTool, n, { x: 0, y: 0 }, { x: 50, y: 0 }),
};

describe.each(Object.entries(SHAPES))("a %s in Spread", (_, drawn) => {
    describe.each([12, 24, 48])("at %i marchers", (n) => {
        it("keeps its frame and outline through every Reshuffle", () => {
            const s = drawn(n);
            const frame = s.kind.frameOf(s.params, n);
            const outline = s.kind.outline?.(s.params, n);
            for (let times = 1; times <= 6; times++) {
                const r = reshuffledTimes(s, times);
                expect(seedOf(r)).toBe(seedOf(s) + times);
                expect(r.kind.frameOf(r.params, n)).toEqual(frame);
                expect(r.kind.outline?.(r.params, n)).toEqual(outline);
            }
        });

        it("keeps its frame and outline for a typed seed, near or far (#437)", () => {
            const s = drawn(n);
            const frame = s.kind.frameOf(s.params, n);
            const outline = s.kind.outline?.(s.params, n);
            for (const seed of [1, 9, 4242, 2 ** 31 - 1]) {
                const typed = edit(
                    s,
                    withSeed(s.kind, s.params, s.spots, seed, env),
                    ctx,
                );
                expect(seedOf(typed)).toBe(seed);
                expect(typed.kind.frameOf(typed.params, n)).toEqual(frame);
                expect(typed.kind.outline?.(typed.params, n)).toEqual(outline);
            }
        });

        it("fills its frame for every seed: marchers inside, near every side", () => {
            const s = drawn(n);
            const frame = s.kind.frameOf(s.params, n);
            for (let times = 0; times < 20; times++) {
                const r = reshuffledTimes(s, times);
                const local = slotsOf(r, ctx).map((p) =>
                    fieldToFrame(frame, p),
                );
                const xs = local.map((p) => p.x);
                const ys = local.map((p) => p.y);
                for (const p of local) {
                    expect(Math.abs(p.x)).toBeLessThanOrEqual(frame.halfWidth);
                    expect(Math.abs(p.y)).toBeLessThanOrEqual(frame.halfDepth);
                }
                // No empty band along a side wider than an interval
                const interval =
                    (r.params as { across?: number; interval?: number })
                        .across ?? (r.params as { interval: number }).interval;
                expect(frame.halfWidth - Math.max(...xs)).toBeLessThan(
                    interval,
                );
                expect(frame.halfWidth + Math.min(...xs)).toBeLessThan(
                    interval,
                );
                expect(frame.halfDepth - Math.max(...ys)).toBeLessThan(
                    interval,
                );
                expect(frame.halfDepth + Math.min(...ys)).toBeLessThan(
                    interval,
                );
            }
        });
    });
});

/** Two frames the same, to a millionth of a field unit */
function expectSameFrame(a: ShapeFrame, b: ShapeFrame) {
    expect(a.center.x).toBeCloseTo(b.center.x, 6);
    expect(a.center.y).toBeCloseTo(b.center.y, 6);
    expect(a.halfWidth).toBeCloseTo(b.halfWidth, 6);
    expect(a.halfDepth).toBeCloseTo(b.halfDepth, 6);
    expect(a.rotation).toBe(b.rotation);
}

function drawnIn(kind: AnyToolKind, n: number, from: XY, to: XY) {
    let t = openTool(kind, marchers(n));
    t = press(t, from, env);
    t = pointerMove(t, to, env);
    return release(t, ctx);
}

const switched = (t: ToolState, mode: DistributionMode) =>
    edit(t, withMode(t.kind, t.params, t.spots, mode, env), ctx);

describe("a mode switch keeps the frame the designer drew (#439)", () => {
    describe.each([12, 24, 48])("at %i marchers", (n) => {
        it("Grid → Spread → Grid: the same frame and outline, and back to the box it was", () => {
            const grid = drawnIn(boxTool, n, { x: 0, y: 0 }, { x: 90, y: 40 });
            const frame = boxTool.frameOf(grid.params as BoxParams, n);
            const spread = switched(grid, "spread");
            expectSameFrame(
                boxTool.frameOf(spread.params as BoxParams, n),
                frame,
            );
            // The marchers fill it, no closer than its interval
            const across = (spread.params as BoxParams).across;
            const spots = slotsOf(spread, ctx);
            for (const p of spots.map((s) => fieldToFrame(frame, s))) {
                expect(Math.abs(p.x)).toBeLessThanOrEqual(frame.halfWidth);
                expect(Math.abs(p.y)).toBeLessThanOrEqual(frame.halfDepth);
            }
            expect(closestOf(spots)).toBeGreaterThanOrEqual(
                across * (1 - 1e-6),
            );
            const back = switched(spread, "files");
            expect(back.params).toEqual(
                expect.objectContaining({
                    center: (grid.params as BoxParams).center,
                    files: (grid.params as BoxParams).files,
                    across: (grid.params as BoxParams).across,
                    deep: (grid.params as BoxParams).deep,
                }),
            );
        });

        it("Grid → Outline → Spread fills the box drawn, not the outline's half steps (#449)", () => {
            const grid = drawnIn(boxTool, n, { x: 0, y: 0 }, { x: 90, y: 40 });
            const frame = boxTool.frameOf(grid.params as BoxParams, n);
            const outline = switched(grid, "outline");
            const spread = switched(outline, "spread");
            expectSameFrame(
                boxTool.frameOf(spread.params as BoxParams, n),
                frame,
            );
        });

        it("a circle, Outline → Spread → Outline: the same radius", () => {
            const outline = drawnIn(
                circleTool,
                n,
                { x: 0, y: 0 },
                { x: 50, y: 0 },
            );
            const frame = circleTool.frameOf(outline.params, n);
            const spread = switched(outline, "spread");
            expectSameFrame(circleTool.frameOf(spread.params, n), frame);
            const was = circleTool.outline!(outline.params, n);
            circleTool.outline!(spread.params, n).forEach((p, k) => {
                expect(p.x).toBeCloseTo(was[k]!.x, 6);
                expect(p.y).toBeCloseTo(was[k]!.y, 6);
            });
            const back = switched(spread, "outline");
            expectSameFrame(circleTool.frameOf(back.params, n), frame);
        });
    });
});

describe("a spread's interval is never under half a step (#439 review)", () => {
    it("a mode switch into a frame too small grows it from its center just enough", () => {
        // 48 marchers in a box drawn at half-step intervals: too tight to spread at ½ step
        const grid = drawnIn(boxTool, 48, { x: 0, y: 0 }, { x: 35, y: 15 });
        const was = boxTool.frameOf(grid.params as BoxParams, 48);
        const spread = switched(grid, "spread");
        const p = spread.params as BoxParams;
        const now = boxTool.frameOf(p, 48);
        expect(p.across).toBeCloseTo(half, 9);
        expect(now.center).toEqual(was.center);
        expect(now.halfWidth).toBeGreaterThan(was.halfWidth);
        expect(now.halfWidth / now.halfDepth).toBeCloseTo(
            was.halfWidth / was.halfDepth,
            9,
        );
        expect(closestOf(slotsOf(spread, ctx))).toBeGreaterThanOrEqual(
            half * (1 - 1e-6),
        );
    });

    it("a handle stops where the interval would go under half a step", () => {
        let s = spreadDrawn(boxTool, 48, { x: 0, y: 0 }, { x: 90, y: 40 });
        const e = boxTool.handles(s.params, 48).find((h) => h.key === "e")!;
        s = press(s, e.at, env);
        // To just inside the opposite side: far smaller than 48 fit at half a step
        const f = boxTool.frameOf(s.params, 48);
        s = pointerMove(
            s,
            { x: f.center.x - f.halfWidth + half, y: e.at.y },
            env,
        );
        s = release(s, ctx);
        const p = s.params as BoxParams;
        expect(p.across).toBeGreaterThanOrEqual(half * (1 - 1e-6));
        expect(p.across).toBeLessThan(half * 1.01);
        expect(closestOf(slotsOf(s, ctx))).toBeGreaterThanOrEqual(
            p.across * (1 - 1e-6),
        );
    });
});

describe("a spread's chip (#439 review)", () => {
    const spacing = boxTool.params.find((q) => q.key === "across")!;

    it("keeps the frame when the interval shown is typed back", () => {
        const s = spreadDrawn(boxTool, 24, { x: 0, y: 0 }, { x: 90, y: 40 });
        const shown = spacing.display(s.params, 24, STEP);
        expect(spacing.type!(s.params, 24, shown, env)).toBe(s.params);
    });

    it("scales the frame about its pivot exactly for a typed interval", () => {
        const s = spreadDrawn(boxTool, 24, { x: 0, y: 0 }, { x: 90, y: 40 });
        const was = boxTool.frameOf(s.params, 24);
        const p = spacing.type!(s.params, 24, "3", env) as BoxParams;
        const now = boxTool.frameOf(p, 24);
        expect(p.across).toBeCloseTo(3 * STEP, 9);
        expect(now.center.x).toBeCloseTo(was.center.x, 9);
        expect(now.center.y).toBeCloseTo(was.center.y, 9);
        expect(now.halfWidth / now.halfDepth).toBeCloseTo(
            was.halfWidth / was.halfDepth,
            9,
        );
    });
});

describe("out of Spread, the drawn box stays (#439 review)", () => {
    /** A spread box `width` × `depth` field units at the center of the drawn one */
    function spreadSized(n: number, width: number) {
        let s = spreadDrawn(boxTool, n, { x: 0, y: 0 }, { x: 90, y: 40 });
        const e = boxTool.handles(s.params, n).find((h) => h.key === "e")!;
        const f = boxTool.frameOf(s.params, n);
        s = press(s, e.at, env);
        s = pointerMove(
            s,
            { x: f.center.x - f.halfWidth + width, y: e.at.y },
            env,
        );
        return release(s, ctx);
    }

    it("Spread → Outline keeps its center, and its size to the half steps", () => {
        const s = spreadSized(20, 145);
        const was = boxTool.frameOf(s.params as BoxParams, 20);
        const out = switched(s, "outline");
        const now = boxTool.frameOf(out.params as BoxParams, 20);
        expect(now.center).toEqual(was.center);
        expect(Math.abs(now.halfWidth - was.halfWidth)).toBeLessThanOrEqual(
            half * 2,
        );
        expect(Math.abs(now.halfDepth - was.halfDepth)).toBeLessThanOrEqual(
            half * 2,
        );
    });

    it("Spread → Grid picks the layout whose half-step size comes nearest the frame", () => {
        for (const n of [20, 26, 40]) {
            const s = spreadSized(n, 145);
            const was = boxTool.frameOf(s.params as BoxParams, n);
            const grid = switched(s, "files");
            const now = boxTool.frameOf(grid.params as BoxParams, n);
            expect(now.center).toEqual(was.center);
            expect(
                Math.abs(now.halfWidth - was.halfWidth),
                `${n} wide`,
            ).toBeLessThanOrEqual(half);
            expect(
                Math.abs(now.halfDepth - was.halfDepth),
                `${n} deep`,
            ).toBeLessThanOrEqual(half);
        }
    });
});

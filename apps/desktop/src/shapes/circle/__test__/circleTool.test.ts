import { describe, expect, it } from "vitest";
import { circleTool } from "../circleTool";
import { radiusFor, radiusOf, type CircleParams } from "../circleGeometry";
import { boxTool } from "../../box/boxTool";
import { distributionOf, switchModes, withMode } from "../../distribute/modes";
import { filesDistribution } from "../../distribute/distribution";
import { flipShape, turnShape } from "../../frame/gestures";
import { scaleShape } from "../../frame/scale";
import { savedShapeOf, savedToolKind } from "../../library/savedShapes";
import { placementOf } from "../../tool/shapePlacement";
import { SHAPE_TOOLS } from "../../tool/shapeTools";
import { shapeSteps, startingParams } from "../../command/shapeSteps";
import type { ToolEnv } from "../../tool/toolKind";
import {
    openTool,
    pointerMove,
    press,
    release,
    slotsOf,
    switchKind,
    undo,
    type ToolState,
} from "../../tool/toolMachine";
import type { ShapeContext, XY } from "../../types";

/**
 * The circle kind (#389, spec #385): drawn center-out, sized by the interval between neighbors
 * (the chord), the first marcher front-center, filled in Outline by the host's distributor.
 * Driven through the shape session as the box is.
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
const fine: ToolEnv = { ...env, snap: false, fine: true, gridSnap: (p) => p };
const ctx: ShapeContext = { stepPx: STEP, snapPoint: (p) => p };
const marchers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        at: { x: 300 + i * 7, y: 300 },
        drillRank: i,
    }));

function drawn(n: number, from: XY, to: XY, e: ToolEnv = env): ToolState {
    let t = openTool(circleTool, marchers(n));
    t = press(t, from, e);
    t = pointerMove(t, to, e);
    return release(t, ctx);
}

const paramsOf = (t: ToolState) => t.params as CircleParams;
const spotsOf = (p: CircleParams, n: number) =>
    circleTool.shape.generate(p, n, ctx);
const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
const circle = (interval: number, extra: Partial<CircleParams> = {}) =>
    ({
        center: { x: 100, y: 100 },
        interval,
        rotation: 0,
        ...extra,
    }) as CircleParams;

describe("drawing a circle", () => {
    it("draws from the center out, its interval in half steps", () => {
        // 8 marchers on a radius of 26: a chord of 19.9, so 2 steps
        const t = drawn(8, { x: 101, y: 99 }, { x: 127, y: 99 });
        const p = paramsOf(t);
        expect(p.center).toEqual({ x: 100, y: 100 });
        expect(p.interval).toBe(20);
        expect(p.rotation).toBe(0);
        expect(radiusOf(p, 8)).toBeCloseTo(radiusFor(20, 8));
    });

    it("draws hundredths of a step and off the grid with fine (#411)", () => {
        const p = paramsOf(
            drawn(8, { x: 101, y: 99 }, { x: 125, y: 99 }, fine),
        );
        expect(p.center).toEqual({ x: 101, y: 99 });
        // 2 · 24 · sin(π/8) = 18.37, to hundredths of a step
        expect(p.interval).toBeCloseTo(18.4);
    });

    it("draws nothing for a drag shorter than half a step", () => {
        expect(drawn(8, { x: 100, y: 100 }, { x: 103, y: 100 }).params).toBe(
            null,
        );
    });
});

describe("the circle's outline", () => {
    it("puts neighbors exactly one interval apart, the first front-center, at any count", () => {
        for (let n = 2; n <= 120; n++) {
            for (const interval of [5, 20, 25]) {
                const p = circle(interval);
                const spots = spotsOf(p, n);
                expect(spots).toHaveLength(n);
                const r = radiusFor(interval, n);
                // The front is toward +y on the field
                expect(spots[0]!.x).toBe(100);
                expect(spots[0]!.y).toBeCloseTo(100 + r, 9);
                for (let k = 0; k < n; k++) {
                    const next = spots[(k + 1) % n]!;
                    expect(dist(spots[k]!, next)).toBeCloseTo(interval, 9);
                    expect(dist(spots[k]!, p.center)).toBeCloseTo(r, 9);
                }
            }
        }
    });

    it("goes round toward the left from the front", () => {
        const spots = spotsOf(circle(20), 4);
        expect(spots[1]!.x).toBeLessThan(100);
        expect(spots[2]!.y).toBeLessThan(100);
        expect(spots[3]!.x).toBeGreaterThan(100);
    });

    it("stands one marcher on the center", () => {
        expect(spotsOf(circle(20), 1).map(({ x, y }) => ({ x, y }))).toEqual([
            { x: 100, y: 100 },
        ]);
    });

    it("turns where the first marcher stands", () => {
        // A quarter turn clockwise: the front swings to the left
        const p = circle(20, { rotation: Math.PI / 2 });
        const r = radiusFor(20, 6);
        const [first] = spotsOf(p, 6);
        expect(first!.x).toBeCloseTo(100 - r, 9);
        expect(first!.y).toBeCloseTo(100, 9);
    });

    it("runs the other way round when flipped across, and starts at the back flipped deep", () => {
        const plain = spotsOf(circle(20), 6);
        const across = spotsOf(circle(20, { flipX: true }), 6);
        const deep = spotsOf(circle(20, { flipY: true }), 6);
        expect(across[1]!.x).toBeCloseTo(200 - plain[1]!.x, 9);
        expect(across[1]!.y).toBeCloseTo(plain[1]!.y, 9);
        expect(deep[0]!.y).toBeCloseTo(100 - radiusFor(20, 6), 9);
    });
});

describe("editing a circle", () => {
    const N = 10;
    const base = () =>
        paramsOf(drawn(N, { x: 100, y: 100 }, { x: 132, y: 100 }));

    it("has one radius handle, which changes the interval in half steps and keeps the center", () => {
        const p = base();
        const handles = circleTool.handles(p, N);
        expect(handles.map((h) => h.key)).toEqual(["radius"]);
        expect(handles[0]!.at.x).toBeCloseTo(100 + radiusOf(p, N));
        // A rim at 50: 2 · 50 · sin(π/10) = 30.9, so 3 steps
        const out = circleTool.dragHandle(
            p,
            N,
            "radius",
            { x: 100, y: 150 },
            env,
        );
        expect(out.interval).toBe(30);
        expect(out.center).toEqual(p.center);
        // fine: hundredths, 30.90
        const hundredths = circleTool.dragHandle(
            p,
            N,
            "radius",
            { x: 100, y: 150 },
            fine,
        );
        expect(hundredths.interval).toBeCloseTo(30.9);
    });

    it("has no handle for one marcher", () => {
        expect(circleTool.handles(circle(20), 1)).toEqual([]);
    });

    it("moves from inside, its center on the grid", () => {
        const p = base();
        expect(circleTool.contains(p, N, { x: 110, y: 95 })).toBe(true);
        expect(circleTool.contains(p, N, { x: 200, y: 100 })).toBe(false);
        const moved = circleTool.move(p, N, { x: 12, y: -3 }, env);
        expect(moved.center).toEqual({ x: 110, y: 95 });
        expect(moved.interval).toBe(p.interval);
    });

    it("turns and flips through its frame around its center", () => {
        const p = base();
        const turned = turnShape(
            circleTool,
            p,
            N,
            Math.PI / 4,
            "c",
            env,
        ) as CircleParams;
        expect(turned.center).toEqual(p.center);
        expect(turned.rotation).toBeCloseTo(Math.PI / 4);
        const flipped = flipShape(
            circleTool,
            p,
            N,
            "across",
            "c",
            env,
        ) as CircleParams;
        expect(flipped.flipX).toBe(true);
        expect(flipped.center).toEqual(p.center);
    });

    it("scales by interval in half steps", () => {
        const p = base();
        const bigger = scaleShape(
            circleTool,
            p,
            N,
            1,
            "c",
            env,
        ) as CircleParams;
        expect(bigger.interval).toBe(p.interval + half);
        expect(bigger.center).toEqual(p.center);
        const tiny = circle(half);
        expect(scaleShape(circleTool, tiny, N, -1, "c", env)).toBeNull();
    });

    it("grows from a pivot on its edge", () => {
        const p = base();
        const back = { x: 100, y: 100 - radiusOf(p, N) };
        const bigger = scaleShape(
            circleTool,
            p,
            N,
            1,
            "n",
            env,
        ) as CircleParams;
        expect(bigger.center.y - radiusOf(bigger, N)).toBeCloseTo(back.y);
    });

    it("takes the interval typed in the chip, and undoes a drawn circle", () => {
        const t = drawn(N, { x: 100, y: 100 }, { x: 132, y: 100 });
        const [param] = circleTool.params;
        expect(param!.display(t.params, N, STEP)).toBe("2");
        expect(
            (param!.type(t.params, N, "3.5", env) as CircleParams).interval,
        ).toBe(35);
        // Typed, it keeps hundredths of a step, not half steps (#411)
        expect(
            (param!.type(t.params, N, "2.37", env) as CircleParams).interval,
        ).toBeCloseTo(23.7);
        expect(undo(t).params).toBe(null);
    });
});

describe("the circle and the host", () => {
    it("is listed after the box", () => {
        expect(SHAPE_TOOLS.map((e) => e.kind.shape.label)).toEqual([
            "Box",
            "Circle",
        ]);
    });

    it("fills in Outline or Spread (#391), never Files", () => {
        expect(circleTool.closed!.modes).toEqual(["outline", "spread"]);
        expect(switchModes(circleTool)).toEqual(["outline", "spread"]);
        const p = circle(20);
        expect(distributionOf(circleTool, p, 6)).toEqual({
            mode: "outline",
            oddGap: { side: "back", at: null, style: "spread" },
        });
        expect(withMode(circleTool, p, 6, "files", env)).toBe(p);
        // A recipe that says Files (from another kind, or a broken file) still reads as Outline
        const files = { ...p, distribution: filesDistribution(3) };
        expect(distributionOf(circleTool, files, 6)).toEqual({
            mode: "outline",
            oddGap: { side: "back", at: null, style: "spread" },
        });
        expect(spotsOf(files, 6)).toEqual(spotsOf(p, 6));
    });

    it("keeps a box's frame when the open box turns into a circle", () => {
        let t = openTool(boxTool, marchers(8));
        t = release(
            pointerMove(
                press(t, { x: 100, y: 100 }, env),
                { x: 160, y: 130 },
                env,
            ),
            ctx,
        );
        const box = boxTool.frameOf(t.params, 8);
        const c = switchKind(t, circleTool, ctx, env);
        const p = paramsOf(c);
        expect(p.center).toEqual(box.center);
        expect(radiusOf(p, 8)).toBeGreaterThan(
            Math.min(box.halfWidth, box.halfDepth) - STEP,
        );
        expect(radiusOf(p, 8)).toBeLessThan(
            Math.max(box.halfWidth, box.halfDepth) + STEP,
        );
        expect(undo(c).kind).toBe(boxTool);
    });

    it("saves its recipe as circle version 2 with its distribution", () => {
        const t = drawn(6, { x: 100, y: 100 }, { x: 125, y: 100 });
        const placement = placementOf(t, ctx)!;
        expect(placement.recipe.kind).toBe("circle");
        expect(placement.recipe.kindVersion).toBe(2);
        const stored = JSON.parse(JSON.stringify(placement.recipe.params));
        expect(stored.distribution).toEqual({
            mode: "outline",
            oddGap: { side: "back", at: null, style: "spread" },
        });
        expect(spotsOf(stored, 6)).toEqual(
            slotsOf(t, ctx).map((s) => ({
                x: s.x,
                y: s.y,
                row: s.row,
                col: s.col,
            })),
        );
    });

    it("is saved with its interval and lays it out on any count", () => {
        const t = drawn(6, { x: 100, y: 100 }, { x: 125, y: 100 });
        const saved = savedShapeOf(circleTool, t.params, 6, STEP, {
            id: "s1",
            name: "Ring",
        });
        expect(saved).toMatchObject({
            kind: "circle",
            kindVersion: 2,
            intervals: { interval: 2.5 },
        });
        const kind = savedToolKind(circleTool, saved);
        const p = kind.draw(
            { x: 0, y: 0 },
            { x: 80, y: 0 },
            12,
            env,
        ) as CircleParams;
        expect(p.interval).toBe(25);
    });

    it("starts the command bar's circle around the marchers, at the default interval", () => {
        const starts = marchers(8).map((m) => m.at);
        const p = startingParams(circleTool, starts, 8, env) as CircleParams;
        expect(p.center).toEqual(
            env.gridSnap({ x: 300 + (7 * 7) / 2, y: 300 }),
        );
        expect(p.interval).toBe(20);
        const { steps } = shapeSteps(circleTool, p, 8, env, ["outline", "3"]);
        expect(steps.map((s) => [s.param.key, s.initial])).toEqual([
            ["mode", "Outline"],
            ["interval", "2"],
        ]);
    });
});

describe("with fromCenter (Alt, version A)", () => {
    it("draws and resizes the same with or without it: it's drawn from its center already", () => {
        const centered: ToolEnv = { ...env, fromCenter: true };
        const from = { x: 100, y: 100 };
        const to = { x: 137, y: 121 };
        const plain = circleTool.draw(from, to, 12, env);
        expect(plain).toBeDefined();
        expect(circleTool.draw(from, to, 12, centered)).toEqual(plain);
        const [handle] = circleTool.handles(plain, 12);
        const at = { x: handle!.at.x + 13, y: handle!.at.y + 4 };
        expect(
            circleTool.dragHandle(plain, 12, handle!.key, at, centered),
        ).toEqual(circleTool.dragHandle(plain, 12, handle!.key, at, env));
    });
});

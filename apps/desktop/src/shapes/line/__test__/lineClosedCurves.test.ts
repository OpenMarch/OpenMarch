import { describe, expect, it } from "vitest";
import { curveTool, lineTool } from "../lineTool";
import {
    isLineParams,
    lineFrame,
    linePath,
    SMOOTH,
    type LineParams,
} from "../lineGeometry";
import { edgeSplitOf, withEdge, withMode } from "../../distribute/modes";
import { fieldToFrame } from "../../frame/frame";
import type { AnyToolKind, ToolEnv } from "../../tool/toolKind";
import {
    edit,
    openTool,
    pointerMove,
    press,
    release,
    slotsOf,
    type ToolState,
} from "../../tool/toolMachine";
import type { ShapeContext, XY } from "../../types";

/**
 * Closing and filling a Line that curves (#529 with #525, spec #522): a closed line's stretches
 * wrap round, a smooth first point is smooth on the closing segment too, its corners hold marchers
 * in Outline, and Grid, Spread and Edge fill the curve as drawn, not the polygon of its points.
 * Driven through the shape session with the real Line kind.
 */

const STEP = 10;
const half = STEP / 2;
const snapHalf = (v: number) => Math.round(v / half) * half;
const env: ToolEnv = {
    stepPx: STEP,
    snap: true,
    pull: true,
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

function click(t: ToolState, at: XY): ToolState {
    t = pointerMove(t, at, env);
    t = press(t, at, env);
    return release(t, ctx, { double: false });
}

/** `points` clicked with `kind`, closed by a click on the first */
function closedWith(
    kind: AnyToolKind,
    n: number,
    points: readonly XY[],
): ToolState {
    let t = openTool(kind, marchers(n));
    for (const p of points) t = click(t, p);
    return click(t, points[0]!);
}

/** A diamond 4 steps across, every point smooth: about a circle once closed */
const DIAMOND = [
    { x: 100, y: 120 },
    { x: 120, y: 100 },
    { x: 140, y: 120 },
    { x: 120, y: 140 },
];
/** A 6 × 6 step square whose right side bows out through a smooth point */
const D_SHAPE = [
    { x: 100, y: 100, tension: 0 },
    { x: 160, y: 100, tension: 0 },
    { x: 180, y: 130, tension: SMOOTH },
    { x: 160, y: 160, tension: 0 },
    { x: 100, y: 160, tension: 0 },
];

const paramsOf = (t: ToolState) => t.params as LineParams;
const spotsOf = (t: ToolState) => slotsOf(t, ctx).map(({ x, y }) => ({ x, y }));
const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
const gapsRound = (spots: readonly XY[]) =>
    spots.map((s, i) => dist(s, spots[(i + 1) % spots.length]!));
const choice = (key: string) => lineTool.choices!.find((c) => c.key === key)!;
const picked = (t: ToolState, key: string, value: string) =>
    edit(t, choice(key).pick(t.params, t.spots, value, env), ctx);
const interval = lineTool.params.find((p) => p.key === "interval")!;
const inMode = (t: ToolState, mode: "files" | "outline" | "spread") =>
    edit(t, withMode(lineTool, t.params, t.spots, mode, env), ctx);
const placed = (params: LineParams, n: number): ToolState =>
    edit(openTool(lineTool, marchers(n)), params, ctx);
/** How far `at` is from the drawn line, measured on a fine polyline of it */
const offCurve = (p: LineParams, at: XY) => {
    const path = linePath(p);
    const line = path.polyline(path.length / 4000);
    return Math.min(...line.map((q) => dist(q, at)));
};
/** The way the line heads at distance `s` along it */
const heading = (p: LineParams, s: number) => {
    const path = linePath(p);
    const a = path.at(s - 1e-4);
    const b = path.at(s + 1e-4);
    return Math.atan2(b.y - a.y, b.x - a.x);
};

describe("closing a Curve", () => {
    it("closes with a click on its first point, smooth through it", () => {
        const t = closedWith(curveTool, 8, DIAMOND);
        const p = paramsOf(t);
        expect(p.closed).toBe(true);
        expect(p.points.every((q) => q.tension === SMOOTH)).toBe(true);
        expect(isLineParams(p)).toBe(true);
        const path = linePath(p);
        expect(path.closed).toBe(true);
        // No kink at the first point: the closing segment leaves it the way the first arrives
        const before = heading(p, path.length - 0.01);
        const after = heading(p, 0.01);
        expect(Math.abs(before - after)).toBeLessThan(0.01);
        // Bowed out, about a circle through the points, well past the diamond's straight
        // sides (14.1 from its middle)
        expect(
            dist(path.at(path.length / 8), { x: 120, y: 120 }),
        ).toBeGreaterThan(17);
        // Fit with no corner: evenly apart straight across, all the way round
        const spots = spotsOf(t);
        expect(spots).toHaveLength(8);
        const gaps = gapsRound(spots);
        gaps.forEach((g) => expect(g).toBeCloseTo(gaps[0]!, 6));
        expect(t.past).toHaveLength(1);
    });

    it("has a frame round the curve, not just its points", () => {
        const triangle: LineParams = {
            points: [
                { x: 100, y: 100, tension: SMOOTH },
                { x: 160, y: 100, tension: SMOOTH },
                { x: 130, y: 150, tension: SMOOTH },
            ],
            closed: true,
            spacing: { mode: "fit" },
        };
        const frame = lineFrame(triangle);
        const path = linePath(triangle);
        // The curve bows out past the points' bounds
        const ys = path.polyline(path.length / 400).map((q) => q.y);
        expect(Math.min(...ys)).toBeLessThan(100 - 1);
        // Round the outline as filled, the curve in short pieces: within a hair of the curve
        for (const q of path.polyline(path.length / 400)) {
            const local = fieldToFrame(frame, q);
            expect(Math.abs(local.x)).toBeLessThanOrEqual(
                frame.halfWidth + 0.05,
            );
            expect(Math.abs(local.y)).toBeLessThanOrEqual(
                frame.halfDepth + 0.05,
            );
        }
    });
});

describe("Outline on a closed curve", () => {
    const N = 12;
    const dShape = () =>
        placed({ points: D_SHAPE, closed: true, spacing: { mode: "fit" } }, N);

    it("holds a marcher on every corner and none on the smooth point", () => {
        const spots = spotsOf(dShape());
        expect(spots).toHaveLength(N);
        for (const c of D_SHAPE.filter((q) => q.tension === 0))
            expect(spots.some((s) => dist(s, c) < 1e-6)).toBe(true);
        expect(spots.some((s) => dist(s, D_SHAPE[2]!) < 1e-3)).toBe(false);
        // From the first point round
        expect(dist(spots[0]!, D_SHAPE[0]!)).toBeLessThan(1e-6);
    });

    it("runs groups once round from the first point, corners held", () => {
        let t = dShape();
        t = edit(t, interval.type(t.params, N, "4*2+3", env), ctx);
        // Locked, the groups kept as typed
        t = edit(t, lineTool.lock!.toggle(t.params, N, env), ctx);
        const p = paramsOf(t);
        expect(p.spacing).toEqual({
            mode: "keep",
            groups: [{ interval: 20, count: 4 }, { interval: 30 }],
        });
        expect(isLineParams(p)).toBe(true);
        const spots = spotsOf(t);
        expect(spots).toHaveLength(N);
        for (const c of p.points.filter((q) => q.tension === 0))
            expect(spots.some((s) => dist(s, c) < 1e-6)).toBe(true);
        expect(spots.some((s) => dist(s, p.points[2]!) < 1e-3)).toBe(false);
        // The first group's three gaps first, on the top side, closer than the rest
        expect(dist(spots[0]!, p.points[0]!)).toBeLessThan(1e-6);
        const gaps = gapsRound(spots);
        expect(gaps[1]).toBeCloseTo(gaps[0]!, 6);
        expect(gaps[2]).toBeCloseTo(gaps[0]!, 6);
        expect(gaps[3]!).toBeGreaterThan(gaps[0]! * 1.2);
        expect(lineTool.groups!.shown(t.params, N, STEP)).toHaveLength(2);
    });
});

describe("filling a closed curve", () => {
    it("spreads with its edge on the curve as drawn", () => {
        const n = 16;
        let t = inMode(closedWith(curveTool, n, DIAMOND), "spread");
        t = edit(t, withEdge(lineTool, t.params, n, true, env), ctx);
        const p = paramsOf(t);
        const spots = spotsOf(t);
        expect(spots).toHaveLength(n);
        const split = edgeSplitOf(lineTool, t.params, n)!;
        expect(split.edge).toBeGreaterThan(3);
        // The edge's spots on the drawn curve, not the diamond through its points
        const onCurve = spots.filter((s) => offCurve(p, s) < 0.05);
        expect(onCurve.length).toBeGreaterThanOrEqual(split.edge);
        // And every spot inside it
        const r = (s: XY) => dist(s, { x: 120, y: 120 });
        spots.forEach((s) => expect(r(s)).toBeLessThan(21));
    });

    it("fills Grid inside the curve, past the diamond's sides", () => {
        const t = inMode(closedWith(curveTool, 12, DIAMOND), "files");
        const spots = spotsOf(t);
        expect(spots).toHaveLength(12);
        // Some spots lie outside the straight diamond, inside the curve
        const outsideDiamond = spots.filter(
            (s) => Math.abs(s.x - 120) + Math.abs(s.y - 120) > 20 + 1e-6,
        );
        expect(outsideDiamond.length).toBeGreaterThan(0);
    });

    // Grid's spots on a curved outline are part of the recipe format (ADR 0006)
    it("keeps Grid's spots on a closed curve", () => {
        const params: LineParams = {
            points: DIAMOND.map((q) => ({ ...q, tension: SMOOTH })),
            closed: true,
            spacing: { mode: "fit" },
            distribution: { mode: "files", oddGap: "center" },
        };
        expect(isLineParams(params)).toBe(true);
        const spots = lineTool.shape.generate(params, 12, ctx);
        expect(spots).toHaveLength(PINNED_CURVE_GRID.length);
        spots.forEach((s, i) => {
            expect(s.x).toBeCloseTo(PINNED_CURVE_GRID[i]![0]!, 6);
            expect(s.y).toBeCloseTo(PINNED_CURVE_GRID[i]![1]!, 6);
        });
    });
});

describe("reopening a closed curve", () => {
    it("keeps its spots, opened on a straight side", () => {
        const closed = placed(
            { points: D_SHAPE, closed: true, spacing: { mode: "fit" } },
            12,
        );
        const opened = picked(closed, "ends", "open");
        const p = paramsOf(opened);
        expect(p.closed).toBeFalsy();
        expect(p.points.some((q) => q.tension === SMOOTH)).toBe(true);
        const key = (q: XY) => `${q.x.toFixed(6)},${q.y.toFixed(6)}`;
        expect(spotsOf(opened).map(key).sort()).toEqual(
            spotsOf(closed).map(key).sort(),
        );
    });

    it("opens a smooth closed curve to an open curve of as many spots", () => {
        const closed = closedWith(curveTool, 8, DIAMOND);
        const opened = picked(closed, "ends", "open");
        const p = paramsOf(opened);
        expect(p.closed).toBeFalsy();
        expect(isLineParams(p)).toBe(true);
        const spots = spotsOf(opened);
        expect(spots).toHaveLength(8);
        spots.forEach((s) => {
            expect(Number.isFinite(s.x) && Number.isFinite(s.y)).toBe(true);
            // Its new ends bend it a little differently: within an eighth of its size
            expect(offCurve(paramsOf(closed), s)).toBeLessThan(2.5);
        });
    });
});

/** Grid's 12 spots on the closed Curve through {@link DIAMOND}: ranks of 2, 4, 4 and 2, square */
const PINNED_CURVE_GRID: readonly (readonly number[])[] = [
    [114.06304657543808, 102.18913972631424],
    [125.93695342456192, 102.18913972631424],
    [102.18913972631424, 114.06304657543808],
    [114.06304657543808, 114.06304657543808],
    [125.93695342456192, 114.06304657543808],
    [137.81086027368576, 114.06304657543808],
    [102.18913972631424, 125.93695342456192],
    [114.06304657543808, 125.93695342456192],
    [125.93695342456192, 125.93695342456192],
    [137.81086027368576, 125.93695342456192],
    [114.06304657543808, 137.81086027368576],
    [125.93695342456192, 137.81086027368576],
];

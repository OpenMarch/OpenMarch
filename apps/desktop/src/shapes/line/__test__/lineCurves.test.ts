import { describe, expect, it } from "vitest";
import { curveTool, lineTool } from "../lineTool";
import {
    isLineParams,
    linePath,
    lineSpots,
    MAX_TENSION,
    SMOOTH,
    type LineParams,
} from "../lineGeometry";
import { chipLayout } from "../../editor/chip";
import {
    liveTargets,
    moveLive,
    openLive,
    pressLive,
    releaseLive,
    reopenLive,
} from "../../placed/liveBox";
import {
    boxesAt,
    PLACED_KINDS,
    type PlacedBox,
    type PlacedRecipe,
} from "../../placed/placedBox";
import { placementOf } from "../../tool/shapePlacement";
import { SHAPE_TOOLS } from "../../tool/shapeTools";
import { toolId, type AnyToolKind, type ToolEnv } from "../../tool/toolKind";
import {
    edit,
    clearSelection,
    finishPoints,
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
 * Smooth points and the Curve (#525, spec #522): each point has a tension, 0 a corner and more a
 * smooth point the line bends through. A click on a point selects it, a double-click toggles it,
 * the ends of a selected point's tangent bar set how round (#557); smooth points never hold a marcher, and spots stay
 * evenly apart along the curve, or straight across when measured so. Curve is a preset of the Line whose points start
 * smooth. Driven through the shape session with the real Line kind.
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

/** A line of `kind` clicked through `points`, finished with Enter */
function clicked(
    kind: AnyToolKind,
    n: number,
    points: readonly XY[],
): ToolState {
    let t = openTool(kind, marchers(n));
    for (const p of points) t = click(t, p);
    return finishPoints(t, ctx);
}

/**
 * A handle pressed and dragged to `to`, or clicked where it is when `to` is absent (`double` for a
 * double-click's second click). An end of a point's tangent bar (`t1`, `tb1`) shows once its point
 * is selected, so the point is clicked first when it isn't.
 */
function onHandle(
    t: ToolState,
    key: string,
    to?: XY,
    double = false,
): ToolState {
    const tangent = /^tb?(\d+)$/.exec(key);
    if (tangent && t.selected !== `p${tangent[1]}`)
        t = onHandle(t, `p${tangent[1]}`);
    const h = t.kind.handles(t.params, t.spots, t.selected);
    const at = h.find((x) => x.key === key)!.at;
    t = press(t, at, env);
    expect(t.gesture).toMatchObject({ type: "handle", key });
    if (!to) return release(t, ctx, { double });
    t = pointerMove(t, to, env);
    return release(t, ctx, null);
}

/** Point `key` double-clicked: made smooth, or a corner again (#557) */
const switched = (t: ToolState, key: string) =>
    onHandle(onHandle(t, key), key, undefined, true);

const paramsOf = (t: ToolState) => t.params as LineParams;
const tensions = (t: ToolState) => paramsOf(t).points.map((q) => q.tension);
const spotsOf = (t: ToolState) => slotsOf(t, ctx).map(({ x, y }) => ({ x, y }));
const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
const handleKeys = (t: ToolState) =>
    t.kind.handles(t.params, t.spots, t.selected).map((h) => h.key);
const gapsOf = (spots: readonly XY[]) =>
    spots.slice(1).map((p, i) => dist(spots[i]!, p));
/** How far along the line each spot is from the one before */
const arcGapsOf = (p: LineParams, n: number) => {
    const s = lineSpots(p, n).map((spot) => spot.s!);
    return s.slice(1).map((x, i) => x - s[i]!);
};
/** How far `at` is from the line drawn through `t`'s outline */
const offLine = (t: ToolState, at: XY) => {
    const path = linePath(paramsOf(t));
    return dist(path.at(path.project(at)), at);
};
const interval = lineTool.params.find((p) => p.key === "interval")!;
const choice = (key: string) => lineTool.choices!.find((c) => c.key === key)!;
const typed = (t: ToolState, text: string) =>
    edit(t, interval.type(t.params, t.spots, text, env), ctx);
/** The interval locked (Keep interval) as its button does, one change; as it is when it is */
const locked = (t: ToolState) =>
    lineTool.lock!.locked(t.params, t.spots)
        ? t
        : edit(t, lineTool.lock!.toggle(t.params, t.spots, env), ctx);
/** Typed, then locked: typing alone leaves the interval unlocked (owner decision on #522) */
const kept = (t: ToolState, text: string) => locked(typed(t, text));
const picked = (t: ToolState, key: string, value: string) =>
    edit(t, choice(key).pick(t.params, t.spots, value, env), ctx);
const straight = (t: ToolState) => picked(t, "measured", "straight");

const ARCH = [
    { x: 0, y: 0 },
    { x: 40, y: -20 },
    { x: 80, y: 0 },
];
/** A Line with a corner at its second point: an L, its arms 40 long */
const L = (n = 5) =>
    clicked(lineTool, n, [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
    ]);

describe("a point's tension", () => {
    it("makes the line bend through a smooth point and turn sharply at a corner", () => {
        const corner = clicked(lineTool, 4, ARCH);
        const curve = clicked(curveTool, 4, ARCH);
        expect(tensions(corner)).toEqual([0, 0, 0]);
        expect(tensions(curve)).toEqual([SMOOTH, SMOOTH, SMOOTH]);
        // Both pass through every point
        for (const q of ARCH) expect(offLine(curve, q)).toBeLessThan(1e-6);
        // The corner's outline is its three points; the curve's bows out past the straight
        // segments, so it's longer
        expect(lineTool.outline!(corner.params, 4)).toEqual(ARCH);
        expect(linePath(paramsOf(curve)).length).toBeGreaterThan(
            linePath(paramsOf(corner)).length + 1,
        );
        // Halfway to the top, the curve stands above the straight segment
        const outline = curveTool.outline!(curve.params, 4);
        const near20 = outline.reduce((a, b) =>
            Math.abs(b.x - 20) < Math.abs(a.x - 20) ? b : a,
        );
        expect(near20.y).toBeLessThan(-10.5);
    });

    it("reads a recipe's tensions from 0 to the roundest, and nothing else", () => {
        const points = (tension: number) => [
            { x: 0, y: 0, tension: 0 },
            { x: 40, y: -20, tension },
            { x: 80, y: 0, tension: 0 },
        ];
        const read = (tension: number) =>
            isLineParams({ points: points(tension), spacing: { mode: "fit" } });
        expect(read(0)).toBe(true);
        expect(read(SMOOTH)).toBe(true);
        expect(read(0.3)).toBe(true);
        expect(read(MAX_TENSION)).toBe(true);
        expect(read(MAX_TENSION + 0.1)).toBe(false);
        expect(read(-0.5)).toBe(false);
        expect(read(Number.NaN)).toBe(false);
    });
});

describe("setting a point's tension", () => {
    it("turns a corner smooth on a double-click of its handle, and back with another", () => {
        let t = switched(L(), "p1");
        expect(tensions(t)).toEqual([0, SMOOTH, 0]);
        // One undo step
        expect(t.past).toHaveLength(L().past.length + 1);
        expect(tensions(undo(t))).toEqual([0, 0, 0]);
        t = switched(t, "p1");
        expect(tensions(t)).toEqual([0, 0, 0]);
    });

    it("gives a smooth point a tension handle, dragged out for rounder and back to a corner", () => {
        let t = switched(L(), "p1");
        expect(handleKeys(t)).toEqual(expect.arrayContaining(["t1", "tb1"]));
        expect(handleKeys(L())).not.toContain("t1");
        const p1 = paramsOf(t).points[1]!;
        const at = t.kind
            .handles(t.params, t.spots, "p1")
            .find((h) => h.key === "t1")!.at;
        // Twice as far out from the point: twice the tension
        const out = {
            x: p1.x + (at.x - p1.x) * 2,
            y: p1.y + (at.y - p1.y) * 2,
        };
        t = onHandle(t, "t1", out);
        expect(tensions(t)[1]).toBeCloseTo(2 * SMOOTH, 6);
        // Halfway back: in tenths
        const back = {
            x: p1.x + (at.x - p1.x) * 0.53,
            y: p1.y + (at.y - p1.y) * 0.53,
        };
        const t2 = onHandle(switched(L(), "p1"), "t1", back);
        expect(tensions(t2)[1]).toBeCloseTo(0.5, 9);
        // Behind the point: a corner again, its handle gone
        const behind = { x: p1.x - (at.x - p1.x), y: p1.y - (at.y - p1.y) };
        const t3 = onHandle(switched(L(), "p1"), "t1", behind);
        expect(tensions(t3)[1]).toBe(0);
        expect(handleKeys(t3)).not.toContain("t1");
    });

    it("has no Points menu: a double-click switches a point instead (#560)", () => {
        expect(lineTool.choices!.map((c) => c.key)).not.toContain("points");
    });

    it("hides the corners switch on a line whose only corner turned smooth", () => {
        const corners = choice("corners");
        const t = L();
        expect(corners.shown!(t.params, t.spots)).toBe(true);
        const smooth = switched(t, "p1");
        expect(corners.shown!(smooth.params, smooth.spots)).toBe(false);
    });

    it("splits a curved segment on its curve, the new point smooth", () => {
        const t = clicked(curveTool, 5, ARCH);
        const mid = t.kind
            .handles(t.params, t.spots)
            .find((h) => h.key === "m0")!;
        expect(offLine(t, mid.at)).toBeLessThan(1e-6);
        const split = onHandle(t, "m0");
        expect(paramsOf(split).points[1]).toMatchObject({
            ...mid.at,
            tension: SMOOTH,
        });
    });
});

describe("spots along a curve", () => {
    it("never puts a marcher on a smooth point, neighbors evenly apart along the path", () => {
        // Four marchers on a symmetric arch: none on its top
        const t = clicked(curveTool, 4, ARCH);
        const spots = spotsOf(t);
        expect(spots[0]).toEqual(ARCH[0]);
        expect(spots.at(-1)).toEqual(ARCH[2]);
        for (const s of spots) expect(dist(s, ARCH[1]!)).toBeGreaterThan(1);
        const gaps = arcGapsOf(paramsOf(t), 4);
        for (const g of gaps) expect(g).toBeCloseTo(gaps[0]!, 6);
        expect(gaps[0]).toBeCloseTo(linePath(paramsOf(t)).length / 3, 6);
        for (const s of spots) expect(offLine(t, s)).toBeLessThan(1e-6);
        // The chip shows that interval, worked out
        const chip = chipLayout(lineTool, t.params, t.spots, env).intervals[0]!;
        expect(Number(interval.value!(t.params, t.spots, STEP))).toBeCloseTo(
            gaps[0]! / STEP,
            6,
        );
        expect(chip.derived).toBe(true);
    });

    it("puts neighbors evenly apart straight across when measured so", () => {
        const t = straight(clicked(curveTool, 4, ARCH));
        expect(paramsOf(t).measured).toBe("straight");
        const spots = spotsOf(t);
        expect(spots[0]).toEqual(ARCH[0]);
        expect(spots.at(-1)).toEqual(ARCH[2]);
        const gaps = gapsOf(spots);
        for (const g of gaps) expect(g).toBeCloseTo(gaps[0]!, 6);
        // Each chord is shorter than the path between them, so not even along it
        const arcs = arcGapsOf(paramsOf(t), 4);
        expect(gaps[0]!).toBeLessThan(arcs[0]!);
        for (const s of spots) expect(offLine(t, s)).toBeLessThan(1e-6);
        // The chip shows that interval, worked out
        const chip = chipLayout(lineTool, t.params, t.spots, env).intervals[0]!;
        expect(Number(interval.value!(t.params, t.spots, STEP))).toBeCloseTo(
            gaps[0]! / STEP,
            6,
        );
        expect(chip.derived).toBe(true);
    });

    it("keeps a marcher on each corner but not on a smooth point between them", () => {
        // A zigzag whose second point is a corner and third smooth
        let t = clicked(lineTool, 7, [
            { x: 0, y: 0 },
            { x: 40, y: 0 },
            { x: 60, y: 30 },
            { x: 100, y: 30 },
        ]);
        t = switched(t, "p2");
        expect(tensions(t)).toEqual([0, 0, SMOOTH, 0]);
        const spots = spotsOf(t);
        expect(spots.some((s) => dist(s, { x: 40, y: 0 }) < 1e-9)).toBe(true);
        expect(spots.every((s) => dist(s, { x: 60, y: 30 }) > 0.5)).toBe(true);
    });

    it("keeps a typed interval along the path between neighbors on the curve", () => {
        const t = kept(clicked(curveTool, 5, ARCH), "2");
        expect(paramsOf(t).spacing.mode).toBe("keep");
        for (const g of arcGapsOf(paramsOf(t), 5))
            expect(g).toBeCloseTo(2 * STEP, 6);
        expect(linePath(paramsOf(t)).length).toBeCloseTo(4 * 2 * STEP, 6);
    });

    it("keeps a typed interval straight across between neighbors along the curve, measured so", () => {
        const t = kept(straight(clicked(curveTool, 5, ARCH)), "2");
        expect(paramsOf(t).spacing.mode).toBe("keep");
        for (const g of gapsOf(spotsOf(t))) expect(g).toBeCloseTo(2 * STEP, 6);
    });

    /** An L whose second arm bends through a smooth point: a corner, then a curve */
    const hooked = () =>
        switched(
            clicked(lineTool, 7, [
                { x: 0, y: 0 },
                { x: 40, y: 0 },
                { x: 55, y: 25 },
                { x: 40, y: 50 },
            ]),
            "p2",
        );

    it("makes a curved run between corners whole intervals when an interval is typed", () => {
        const t = kept(hooked(), "2");
        for (const g of arcGapsOf(paramsOf(t), 7))
            expect(g).toBeCloseTo(2 * STEP, 6);
        // The corner holds a marcher, and isn't off its interval
        const corner = paramsOf(t).points[1]!;
        expect(spotsOf(t).some((s) => dist(s, corner) < 1e-6)).toBe(true);
        expect(interval.note!(t.params, t.spots)).toBeNull();
    });

    it("makes a curved run between corners whole intervals straight across, measured so", () => {
        const t = kept(straight(hooked()), "2");
        for (const g of gapsOf(spotsOf(t))) expect(g).toBeCloseTo(2 * STEP, 6);
        const corner = paramsOf(t).points[1]!;
        expect(spotsOf(t).some((s) => dist(s, corner) < 1e-6)).toBe(true);
        expect(interval.note!(t.params, t.spots)).toBeNull();
    });
});

describe("a curve with mixed intervals, measured straight across", () => {
    const N = 6;
    /** A corner, then an arm bending through a smooth point; spaced `2*3+4*2` */
    const hook = () => {
        let t = clicked(lineTool, N, [
            { x: 0, y: 0 },
            { x: 40, y: 0 },
            { x: 55, y: 25 },
            { x: 40, y: 50 },
        ]);
        t = straight(switched(t, "p2"));
        expect(tensions(t)).toEqual([0, 0, SMOOTH, 0]);
        return kept(t, "2*3+4*2");
    };
    // 2 marchers 3 apart, then 4 marchers 2 apart, the seam the larger
    const GAPS = [3, 3, 2, 2, 2].map((g) => g * STEP);
    const smoothPoint = (t: ToolState) => paramsOf(t).points[2]!;
    const cornerPoint = (t: ToolState) => paramsOf(t).points[1]!;

    it("keeps each group's interval straight across, in order, the corner on a marcher (Keep interval)", () => {
        const t = hook();
        expect(paramsOf(t).spacing).toMatchObject({ mode: "keep" });
        expect(paramsOf(t).spacing).toMatchObject({
            groups: [
                { count: 2, interval: 3 * STEP },
                { count: 4, interval: 2 * STEP },
            ],
        });
        const spots = spotsOf(t);
        expect(spots).toHaveLength(N);
        gapsOf(spots).forEach((g, i) => expect(g).toBeCloseTo(GAPS[i]!, 6));
        expect(spots.some((s) => dist(s, cornerPoint(t)) < 1e-6)).toBe(true);
        for (const s of spots)
            expect(dist(s, smoothPoint(t))).toBeGreaterThan(0.5);
        for (const s of spots) expect(offLine(t, s)).toBeLessThan(1e-6);
        // Its stretches are whole runs of the gaps: the corner isn't off its interval
        expect(interval.note!(t.params, t.spots)).toBeNull();
    });

    it("keeps the groups' proportions unlocked in Fit, the corner on a marcher", () => {
        const kept = hook();
        const t = picked(kept, "spacing", "fit");
        expect(paramsOf(t).spacing).toEqual({
            mode: "fit",
            groups: (paramsOf(kept).spacing as { groups: unknown }).groups,
        });
        const spots = spotsOf(t);
        expect(spots).toHaveLength(N);
        const corner = spots.findIndex((s) => dist(s, cornerPoint(t)) < 1e-6);
        expect(corner).toBeGreaterThan(0);
        // The line as long as its groups: the same spots as locked
        spotsOf(kept).forEach((s, i) =>
            expect(dist(s, spots[i]!)).toBeLessThan(1e-6),
        );
        for (const s of spots)
            expect(dist(s, smoothPoint(t))).toBeGreaterThan(0.5);
    });

    it("is placed and reopened with its tensions and groups exactly, everyone on a spot", () => {
        const t = hook();
        const placement = placementOf(t, ctx)!;
        const recipe: PlacedRecipe = {
            ...placement.recipe,
            id: 1,
            timelineId: 10,
            members: placement.members,
            params: JSON.parse(JSON.stringify(placement.recipe.params)),
        };
        const { spots: _spots, ...saved } = recipe.params as LineParams & {
            spots: number;
        };
        expect(isLineParams(saved)).toBe(true);
        const at = new Map(recipe.members.map((m) => [m.marcherId, m]));
        const [placed] = boxesAt({
            recipes: [recipe],
            endBeatOf: () => 8,
            beat: 8,
            positionOf: (id) => at.get(id),
        }) as PlacedBox<LineParams>[];
        expect(placed!.kind).toBe(lineTool);
        expect(placed!.params.points).toEqual(paramsOf(t).points);
        expect(placed!.params.spacing).toEqual(paramsOf(t).spacing);
        const spots = spotsOf(t);
        const { members } = liveTargets(placed!, placed!.params, ctx);
        expect(members).toHaveLength(N);
        for (const m of members)
            expect(spots.some((s) => dist(s, m) < 1e-6)).toBe(true);
        expect(
            chipLayout(lineTool, placed!.params, N, env).groups?.map(
                (g) => `${g.count} × ${g.interval}`,
            ),
        ).toEqual(["2 × 3", "4 × 2"]);
    });
});

describe("a run on the path along a curve", () => {
    /** A curve bending hard near its start and gently toward its end, measured straight across */
    const lopsided = (
        anchor: "start" | "center" | "end",
        groups: { interval: number; count?: number }[],
    ): LineParams => ({
        points: [
            { x: 0, y: 0, tension: 0 },
            { x: 15, y: -30, tension: SMOOTH },
            { x: 120, y: 0, tension: 0 },
        ],
        spacing: { mode: "path", groups, anchor },
        measured: "straight",
    });
    const along = (p: LineParams, at: XY) => linePath(p).project(at);
    const ONE = [{ interval: 15 }];
    const MIXED = [{ interval: 10, count: 3 }, { interval: 25 }];

    for (const [name, groups, gaps] of [
        ["one interval", ONE, [15, 15, 15]],
        ["groups", MIXED, [10, 10, 25]],
    ] as const) {
        it(`ends the run on the line's end with the end anchor (${name})`, () => {
            const p = lopsided("end", [...groups]);
            const spots = lineSpots(p, 4);
            expect(dist(spots.at(-1)!, { x: 120, y: 0 })).toBeLessThan(1e-6);
            gapsOf(spots).forEach((g, i) => expect(g).toBeCloseTo(gaps[i]!, 6));
        });

        it(`centers the run with as much path spare before as after (${name})`, () => {
            const p = lopsided("center", [...groups]);
            const spots = lineSpots(p, 4);
            const before = along(p, spots[0]!);
            const after = linePath(p).length - along(p, spots.at(-1)!);
            expect(before).toBeGreaterThan(1);
            expect(before).toBeCloseTo(after, 3);
            gapsOf(spots).forEach((g, i) => expect(g).toBeCloseTo(gaps[i]!, 6));
        });

        it(`lays the run its length along the path from the anchor (${name})`, () => {
            for (const anchor of ["start", "center", "end"] as const) {
                const { measured: _m, ...p } = lopsided(anchor, [...groups]);
                const s = lineSpots(p, 4).map((spot) => spot.s!);
                arcGapsOf(p, 4).forEach((g, i) =>
                    expect(g).toBeCloseTo(gaps[i]!, 9),
                );
                const spare = linePath(p).length - (s.at(-1)! - s[0]!);
                const before = { start: 0, center: spare / 2, end: spare };
                expect(s[0]).toBeCloseTo(before[anchor], 9);
            }
        });
    }
});

describe("the Curve", () => {
    it("is in the Shapes tab after the Line, a preset of the same kind", () => {
        const entry = SHAPE_TOOLS.find((e) => e.kind === curveTool)!;
        expect(entry.action).toBe("shapeCurve");
        expect(SHAPE_TOOLS.map((e) => toolId(e.kind))).toEqual([
            "block",
            "circle",
            "line",
            "curve",
            "arc",
        ]);
        expect(curveTool.shape.label).toBe("Curve");
        expect(curveTool.shape.id).toBe("line");
        expect(curveTool.shape.version).toBe(lineTool.shape.version);
        // Recipes read back as the Line
        expect(PLACED_KINDS).toContain(lineTool);
        expect(PLACED_KINDS).not.toContain(curveTool);
    });

    it("draws a gentle bow with a drag: a smooth middle point a quarter of the way out, to the left", () => {
        let t = openTool(curveTool, marchers(5));
        t = press(t, { x: 0, y: 0 }, env);
        t = pointerMove(t, { x: 80, y: 0 }, env);
        t = release(t, ctx, null);
        expect(tensions(t)).toEqual([SMOOTH, SMOOTH, SMOOTH]);
        // Dragged left to right, the bow rises toward the top of the screen
        expect(paramsOf(t).points.map(({ x, y }) => ({ x, y }))).toEqual([
            { x: 0, y: 0 },
            { x: 40, y: -20 },
            { x: 80, y: 0 },
        ]);
        // Dragged the other way, it bows the other way
        let back = openTool(curveTool, marchers(5));
        back = press(back, { x: 80, y: 0 }, env);
        back = pointerMove(back, { x: 0, y: 0 }, env);
        back = release(back, ctx, null);
        expect(paramsOf(back).points[1]).toMatchObject({ x: 40, y: 20 });
        // The Line still draws straight
        let line = openTool(lineTool, marchers(5));
        line = press(line, { x: 0, y: 0 }, env);
        line = pointerMove(line, { x: 80, y: 0 }, env);
        line = release(line, ctx, null);
        expect(tensions(line)).toEqual([0, 0]);
    });

    it("turns a shape into an arch across its frame, every point smooth", () => {
        const line = clicked(lineTool, 5, [ARCH[0]!, ARCH[2]!]);
        const frame = lineTool.frameOf(line.params, 5);
        const curve = curveTool.fromFrame(frame, 5, env);
        expect(curve.points.map((q) => q.tension)).toEqual([
            SMOOTH,
            SMOOTH,
            SMOOTH,
        ]);
        expect(curve.points[0]).toMatchObject(ARCH[0]!);
        expect(curve.points[2]).toMatchObject(ARCH[2]!);
        expect(curve.points[1]!.y).toBeLessThan(0);
    });
});

describe("a placed curve", () => {
    const N = 6;
    function recipeOf(t: ToolState): PlacedRecipe {
        const placement = placementOf(t, ctx)!;
        return {
            ...placement.recipe,
            id: 1,
            timelineId: 10,
            members: placement.members,
            params: JSON.parse(JSON.stringify(placement.recipe.params)),
        };
    }
    const readBack = (recipe: PlacedRecipe): PlacedBox<LineParams> => {
        const at = new Map(recipe.members.map((m) => [m.marcherId, m]));
        const [placed] = boxesAt({
            recipes: [recipe],
            endBeatOf: () => 8,
            beat: 8,
            positionOf: (id) => at.get(id),
        });
        return placed as PlacedBox<LineParams>;
    };
    const arch = () => clicked(curveTool, N, [...ARCH, { x: 120, y: -20 }]);

    it("is saved as a Line recipe and keeps its tensions when reopened", () => {
        const t = onHandle(arch(), "t1", { x: 60, y: -40 });
        const recipe = recipeOf(t);
        expect(recipe.kind).toBe("line");
        const placed = readBack(recipe);
        expect(placed.kind).toBe(lineTool);
        expect(placed.params.points).toEqual(paramsOf(t).points);
        // Every member on a spot of the curve as it was drawn
        const spots = spotsOf(t);
        const { members } = liveTargets(placed, placed.params, ctx);
        expect(members).toHaveLength(N);
        for (const m of members)
            expect(spots.some((s) => dist(s, m) < 1e-6)).toBe(true);
    });

    const handleAt = (
        placed: PlacedBox<LineParams>,
        key: string,
        selected?: string,
    ) =>
        lineTool.handles(placed.params, N, selected).find((h) => h.key === key)!
            .at;

    it("selects a point clicked, saving nothing, and switches it on a double-click", () => {
        const placed = readBack(recipeOf(arch()));
        const p1 = handleAt(placed, "p1");
        const first = releaseLive(pressLive(openLive(placed), p1, env)!, {
            double: false,
        });
        expect(first.changed).toBe(false);
        expect(first.live.selected).toBe("p1");
        expect((first.live.params as LineParams).points[1]!.tension).toBe(
            SMOOTH,
        );
        // The second click is the double: the point turns a corner, saved once, still selected
        const second = releaseLive(pressLive(first.live, p1, env)!, {
            double: true,
        });
        expect(second.changed).toBe(true);
        expect(second.live.selected).toBe("p1");
        expect((second.live.params as LineParams).points[1]!.tension).toBe(0);
        // Read back after the save, the selection stays on the point
        expect(openLive(placed, second.live.selected).selected).toBe("p1");
    });

    it("leaves a point as it was when it's dragged out and back: a drag, not a click", () => {
        const placed = readBack(recipeOf(arch()));
        const p1 = handleAt(placed, "p1");
        let live = pressLive(openLive(placed), p1, env)!;
        live = moveLive(live, { x: p1.x + 40, y: p1.y }, env);
        live = moveLive(live, p1, env);
        // The editor tells a press that went past the slop as a drag
        const out = releaseLive(live, null);
        expect(out.changed).toBe(false);
        expect((out.live.params as LineParams).points[1]!.tension).toBe(SMOOTH);
    });

    it("saves a tension handle dragged on the placed curve on release", () => {
        const placed = readBack(recipeOf(arch()));
        // Only the selected point shows its tangent bar
        expect(
            lineTool.handles(placed.params, N).some((h) => h.key === "t1"),
        ).toBe(false);
        let live = pressLive(
            openLive(placed, "p1"),
            handleAt(placed, "t1", "p1"),
            env,
        )!;
        expect(live.gesture).toMatchObject({ type: "handle", key: "t1" });
        live = moveLive(live, { x: 60, y: -40 }, env);
        const out = releaseLive(live, null);
        expect(out.changed).toBe(true);
        const tension = (out.live.params as LineParams).points[1]!.tension;
        expect(tension).toBeGreaterThan(SMOOTH);
        expect(out.live.selected).toBe("p1");
        const { members } = liveTargets(placed, out.live.params, ctx);
        expect(members).toHaveLength(N);
    });

    /** An open Line through four corners, its ends apart */
    const OPEN4 = [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
        { x: 0, y: 40 },
    ];

    it("drops the selection when the selected end, dragged onto the other, closes the line", () => {
        const placed = readBack(recipeOf(clicked(lineTool, N, OPEN4)));
        for (const [from, to] of [
            ["p0", "p3"],
            ["p3", "p0"],
        ] as const) {
            const start = handleAt(placed, from);
            const selected = releaseLive(
                pressLive(openLive(placed), start, env)!,
                { double: false },
            ).live;
            expect(selected.selected).toBe(from);
            let live = pressLive(selected, start, env)!;
            live = moveLive(live, handleAt(placed, to), env);
            const out = releaseLive(live, null);
            expect((out.live.params as LineParams).closed).toBe(true);
            expect(out.live.selected).toBeNull();
        }
    });

    it("keeps the selection when its own save comes back, and drops it for any other change (undo)", () => {
        const placed = readBack(recipeOf(arch()));
        const selected = releaseLive(
            pressLive(openLive(placed), handleAt(placed, "p2"), env)!,
            { double: false },
        ).live;
        expect(selected.selected).toBe("p2");
        // Read again unchanged (the playhead moved): kept
        expect(reopenLive(selected, readBack(recipeOf(arch()))).selected).toBe(
            "p2",
        );
        // A tension dragged and saved: the box read back is that save, kept
        let live = pressLive(selected, handleAt(placed, "t2", "p2"), env)!;
        live = moveLive(live, { x: 100, y: -30 }, env);
        const out = releaseLive(live, null);
        expect(out.changed).toBe(true);
        const saved = {
            ...placed,
            params: JSON.parse(JSON.stringify(out.live.params)),
        };
        const readBackSave = reopenLive(out.live, saved, out.live.params);
        expect(readBackSave.selected).toBe("p2");
        // Undone: the box comes back from outside, nothing selected
        const undone = reopenLive(readBackSave, placed);
        expect(undone.selected).toBeNull();
        expect(undone.params).toBe(placed.params);
        // A split segment undone too, though the point's key is still there
        const split = releaseLive(
            pressLive(openLive(placed, "p2"), handleAt(placed, "m0"), env)!,
            { double: false },
        );
        expect(split.changed).toBe(true);
        const later = { ...placed, params: split.live.params as LineParams };
        expect(reopenLive(openLive(later, "p3"), placed).selected).toBeNull();
    });

    it("goes inside the box on a double-click whose first click selected the box, not switching the point", () => {
        const placed = readBack(recipeOf(arch()));
        const out = releaseLive(
            pressLive(openLive(placed), handleAt(placed, "p1"), env)!,
            { double: true, ownFirst: false },
        );
        expect(out.changed).toBe(false);
        expect(out.enter).toBe(true);
        expect(out.live.selected ?? null).toBeNull();
        expect((out.live.params as LineParams).points[1]!.tension).toBe(SMOOTH);
        // Both clicks on the point: it switches, and nobody goes inside
        const own = releaseLive(
            pressLive(openLive(placed, "p1"), handleAt(placed, "p1"), env)!,
            { double: true, ownFirst: true },
        );
        expect(own.changed).toBe(true);
        expect(own.enter).toBe(false);
    });

    it("swallows a double-click on an end of a tangent bar: nothing changes, nobody goes inside", () => {
        const placed = readBack(recipeOf(arch()));
        const out = releaseLive(
            pressLive(
                openLive(placed, "p1"),
                handleAt(placed, "t1", "p1"),
                env,
            )!,
            { double: true, ownFirst: true },
        );
        expect(out.changed).toBe(false);
        expect(out.enter).toBe(false);
        expect(out.live.selected).toBe("p1");
    });
});

describe("selecting a point (#557)", () => {
    const at = (t: ToolState, key: string) =>
        t.kind
            .handles(t.params, t.spots, t.selected)
            .find((h) => h.key === key)!;
    const arch = () => clicked(curveTool, 5, ARCH);

    it("selects a point on a click, changing nothing, and shows only its tangent bar", () => {
        const t = arch();
        // Nothing selected: no point shows a tension handle
        expect(handleKeys(t).filter((k) => k.startsWith("t"))).toEqual([]);
        const selected = onHandle(t, "p1");
        expect(selected.selected).toBe("p1");
        expect(selected.params).toBe(t.params);
        expect(selected.past).toHaveLength(t.past.length);
        // Its bar: an end each way along the curve, on a line through the point
        const p1 = paramsOf(t).points[1]!;
        const ahead = at(selected, "t1");
        const back = at(selected, "tb1");
        expect(ahead.bar).toEqual({ x: p1.x, y: p1.y });
        expect(back.bar).toEqual({ x: p1.x, y: p1.y });
        const cross =
            (ahead.at.x - p1.x) * (back.at.y - p1.y) -
            (ahead.at.y - p1.y) * (back.at.x - p1.x);
        expect(Math.abs(cross)).toBeLessThan(1e-6);
        expect(ahead.at.x).toBeGreaterThan(p1.x);
        expect(back.at.x).toBeLessThan(p1.x);
        // No other point's bar
        expect(handleKeys(selected).filter((k) => k.startsWith("t"))).toEqual([
            "t1",
            "tb1",
        ]);
        // Another point clicked moves the selection
        expect(onHandle(selected, "p2").selected).toBe("p2");
    });

    it("gives an end point a bar both ways, and a selected corner none", () => {
        const t = onHandle(arch(), "p0");
        const q = paramsOf(t).points[0]!;
        const ahead = at(t, "t0").at;
        const back = at(t, "tb0").at;
        expect(dist(ahead, q)).toBeCloseTo(dist(back, q), 9);
        expect((ahead.x + back.x) / 2).toBeCloseTo(q.x, 9);
        const corner = onHandle(L(), "p1");
        expect(corner.selected).toBe("p1");
        expect(handleKeys(corner).filter((k) => k.startsWith("t"))).toEqual([]);
    });

    it("sets the tension live from either end of the bar, as one undo step, keeping the selection", () => {
        const t = onHandle(arch(), "p1");
        const p1 = paramsOf(t).points[1]!;
        const back = at(t, "tb1").at;
        let g = press(t, back, env);
        // Twice as far out the back way: twice the tension, while the pointer is still down
        g = pointerMove(
            g,
            { x: p1.x + (back.x - p1.x) * 2, y: p1.y + (back.y - p1.y) * 2 },
            env,
        );
        expect(g.gesture).not.toBeNull();
        expect(tensions(g)[1]).toBeCloseTo(2 * SMOOTH, 6);
        const done = release(g, ctx, null);
        expect(done.selected).toBe("p1");
        expect(done.past).toHaveLength(t.past.length + 1);
        expect(tensions(undo(done))[1]).toBe(SMOOTH);
        // A click on an end of the bar keeps the point selected
        expect(onHandle(t, "t1").selected).toBe("p1");
    });

    it("switches a point on a double-click as one undo step, and keeps it selected", () => {
        const t = arch();
        const s = switched(t, "p1");
        expect(tensions(s)).toEqual([SMOOTH, 0, SMOOTH]);
        expect(s.past).toHaveLength(t.past.length + 1);
        expect(s.selected).toBe("p1");
        // A corner now: no bar
        expect(handleKeys(s).filter((k) => k.startsWith("t"))).toEqual([]);
    });

    it("moves a point dragged without selecting or switching it", () => {
        const t = arch();
        const p1 = at(t, "p1").at;
        const moved = onHandle(t, "p1", { x: p1.x, y: p1.y - 10 });
        expect(moved.selected ?? null).toBeNull();
        expect(tensions(moved)).toEqual(tensions(t));
        expect(paramsOf(moved).points[1]).toMatchObject({ y: p1.y - 10 });
        // Dragged out and back: still a drag, nothing selected or switched
        let g = press(t, p1, env);
        g = pointerMove(g, { x: p1.x + 20, y: p1.y }, env);
        g = pointerMove(g, p1, env);
        const back = release(g, ctx, null);
        expect(back.selected ?? null).toBeNull();
        expect(back.params).toEqual(t.params);
        // The selected point dragged stays selected, its bar going with it
        const s = onHandle(t, "p1");
        const dragged = onHandle(s, "p1", { x: p1.x, y: p1.y - 10 });
        expect(dragged.selected).toBe("p1");
    });

    it("drops the selection when the selected end, dragged onto the other, closes the line", () => {
        const open = clicked(lineTool, 6, [
            { x: 0, y: 0 },
            { x: 40, y: 0 },
            { x: 40, y: 40 },
            { x: 0, y: 40 },
        ]);
        for (const [from, to] of [
            ["p0", "p3"],
            ["p3", "p0"],
        ] as const) {
            const s = onHandle(open, from);
            expect(s.selected).toBe(from);
            const closed = onHandle(s, from, at(open, to).at);
            expect(paramsOf(closed).closed).toBe(true);
            expect(closed.selected).toBeNull();
        }
    });

    it("clears the selection on a click on the empty field, Escape, undo or another kind", () => {
        const t = onHandle(arch(), "p1");
        expect(click(t, { x: 200, y: 200 }).selected).toBeNull();
        const cleared = clearSelection(t);
        expect(cleared.selected).toBeNull();
        expect(clearSelection(cleared)).toBe(cleared);
        const s = switched(arch(), "p1");
        expect(undo(s).selected).toBeNull();
        expect(switchKind(t, lineTool, ctx, env).selected).toBeNull();
    });
});

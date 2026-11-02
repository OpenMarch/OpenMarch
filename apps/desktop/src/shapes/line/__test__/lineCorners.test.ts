import { describe, expect, it } from "vitest";
import { lineTool } from "../lineTool";
import {
    cornerOffInterval,
    isLineParams,
    type LineParams,
} from "../lineGeometry";
import { chipLayout } from "../../editor/chip";
import {
    liveTargets,
    moveLive,
    openLive,
    pressLive,
    releaseLive,
} from "../../placed/liveBox";
import {
    boxesAt,
    type PlacedBox,
    type PlacedRecipe,
} from "../../placed/placedBox";
import { placementOf } from "../../tool/shapePlacement";
import type { ToolEnv } from "../../tool/toolKind";
import {
    edit,
    finishPoints,
    openTool,
    pointerMove,
    press,
    release,
    slotsOf,
    undo,
    type ToolState,
} from "../../tool/toolMachine";
import type { ShapeContext, XY } from "../../types";

/**
 * Lines with corners (#524, spec #522): clicked point after point, every point and every
 * segment's midpoint a handle, every corner holding a marcher unless switched off, Fit giving each
 * segment a whole number of marchers, Keep interval keeping corners on whole intervals. Driven
 * through the shape session with the real Line kind.
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
/** `fine` held: the ladder off */
const fine: ToolEnv = { ...env, snap: false, fine: true, gridSnap: (p) => p };
const ctx: ShapeContext = { stepPx: STEP, snapPoint: (p) => p };
const marchers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        at: { x: 300 + i * 7, y: 300 },
        drillRank: i,
    }));

/** A press and release where it pressed, the pointer moving there first as a hover does */
function click(t: ToolState, at: XY, e: ToolEnv = env): ToolState {
    t = pointerMove(t, at, e);
    t = press(t, at, e);
    return release(t, ctx, { double: false });
}

/** A line clicked through `points`, finished with Enter */
function clicked(n: number, points: readonly XY[]): ToolState {
    let t = openTool(lineTool, marchers(n));
    for (const p of points) t = click(t, p);
    return finishPoints(t, ctx);
}

/** A handle pressed and dragged to `to`, or clicked where it is when `to` is absent */
function onHandle(
    t: ToolState,
    key: string,
    to?: XY,
    e: ToolEnv = env,
): ToolState {
    const h = lineTool.handles(t.params as LineParams, t.spots);
    const at = h.find((x) => x.key === key)!.at;
    t = press(t, at, e);
    expect(t.gesture).toMatchObject({ type: "handle", key });
    if (!to) return release(t, ctx, { double: false });
    t = pointerMove(t, to, e);
    return release(t, ctx, null);
}

const paramsOf = (t: ToolState) => t.params as LineParams;
const pointsOf = (t: ToolState) =>
    paramsOf(t).points.map(({ x, y }) => ({ x, y }));
const spotsOf = (t: ToolState) => slotsOf(t, ctx).map(({ x, y }) => ({ x, y }));
const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
const expectNear = (a: readonly XY[], b: readonly XY[]) => {
    expect(a).toHaveLength(b.length);
    a.forEach((p, i) => {
        expect(p.x).toBeCloseTo(b[i]!.x, 6);
        expect(p.y).toBeCloseTo(b[i]!.y, 6);
    });
};
const interval = lineTool.params.find((p) => p.key === "interval")!;
const corners = lineTool.choices!.find((c) => c.key === "corners")!;
const chip = (t: ToolState, e: ToolEnv = env) =>
    chipLayout(lineTool, t.params, t.spots, e).intervals[0]!;
const typed = (t: ToolState, text: string) =>
    edit(t, interval.type(t.params, t.spots, text, env), ctx);
/** The interval locked (Keep interval) as its button does, one change; as it is when it is */
const locked = (t: ToolState) =>
    lineTool.lock!.locked(t.params, t.spots)
        ? t
        : edit(t, lineTool.lock!.toggle(t.params, t.spots, env), ctx);
/** Typed, then locked: typing alone leaves the interval unlocked (owner decision on #522) */
const kept = (t: ToolState, text: string) => locked(typed(t, text));
const cornersOff = (t: ToolState) =>
    edit(t, corners.pick(t.params, t.spots, "off", env), ctx);
/** Whether `x` is a whole number of `unit`s */
const whole = (x: number, unit: number) =>
    Math.abs(x / unit - Math.round(x / unit)) < 1e-6;

describe("clicking a line's points", () => {
    it("draws an L by clicks, each point on half steps, a corner with no tension", () => {
        const t = clicked(5, [
            { x: 1, y: 1 },
            { x: 41, y: 1 },
            { x: 39, y: 41 },
        ]);
        expect(t.gesture).toBeNull();
        expect(pointsOf(t)).toEqual([
            { x: 0, y: 0 },
            { x: 40, y: 0 },
            { x: 40, y: 40 },
        ]);
        expect(paramsOf(t).points.every((p) => p.tension === 0)).toBe(true);
        expect(paramsOf(t).spacing.mode).toBe("fit");
    });

    it("keeps each next point at 45° from the last with constrain", () => {
        let t = openTool(lineTool, marchers(5));
        t = click(t, { x: 0, y: 0 });
        t = click(t, { x: 40, y: 0 });
        t = click(t, { x: 71, y: 28 }, { ...env, constrain: true });
        t = finishPoints(t, ctx);
        const [, b, c] = pointsOf(t);
        expect(c!.x - b!.x).toBeCloseTo(c!.y - b!.y, 6);
    });

    it("previews the next segment at the pointer and leaves it out on Enter", () => {
        let t = openTool(lineTool, marchers(5));
        t = click(t, { x: 0, y: 0 });
        t = click(t, { x: 40, y: 0 });
        t = pointerMove(t, { x: 40, y: 30 }, env);
        expect(pointsOf(t)).toHaveLength(3);
        t = finishPoints(t, ctx);
        expect(pointsOf(t)).toEqual([
            { x: 0, y: 0 },
            { x: 40, y: 0 },
        ]);
    });

    it("is drawn with an open outline: an L is no triangle", () => {
        const t = clicked(5, [
            { x: 0, y: 0 },
            { x: 40, y: 0 },
            { x: 40, y: 40 },
        ]);
        expect(lineTool.outlineOpen!(t.params, 5)).toBe(true);
    });
});

describe("handles on a line with corners", () => {
    const L = () =>
        clicked(5, [
            { x: 0, y: 0 },
            { x: 40, y: 0 },
            { x: 40, y: 40 },
        ]);

    it("has a handle on every point and a midpoint handle on every segment", () => {
        const handles = lineTool.handles(paramsOf(L()), 5);
        expect(handles.map((h) => [h.key, h.at, !!h.adds])).toEqual([
            ["p0", { x: 0, y: 0 }, false],
            ["p1", { x: 40, y: 0 }, false],
            ["p2", { x: 40, y: 40 }, false],
            ["m0", { x: 20, y: 0 }, true],
            ["m1", { x: 40, y: 20 }, true],
        ]);
    });

    it("drags a corner where it's dropped with fine, in Fit", () => {
        const t = onHandle(L(), "p1", { x: 51, y: -9 }, fine);
        expect(pointsOf(t)).toEqual([
            { x: 0, y: 0 },
            { x: 51, y: -9 },
            { x: 40, y: 40 },
        ]);
    });

    it("snaps a dragged corner where both its legs come out to whole steps, unlocked, when that's near on screen", () => {
        // Zoomed far out, every whole-step spot is within a few pixels of the pointer
        const t = onHandle(L(), "p1", { x: 51, y: -9 }, { ...env, zoom: 0.01 });
        expect(paramsOf(t).spacing.mode).toBe("fit");
        const [a, b, c] = pointsOf(t);
        // Near where it was dropped, a marcher on it, each leg's gaps whole steps
        expect(dist(b!, { x: 51, y: -9 })).toBeLessThan(STEP * 2);
        const spots = spotsOf(t);
        const k = spots.findIndex((s) => dist(s, b!) < 1e-6);
        expect(k).toBeGreaterThan(0);
        const legs = [dist(a!, b!) / k, dist(b!, c!) / (spots.length - 1 - k)];
        for (const leg of legs)
            expect(leg / STEP).toBeCloseTo(Math.round(leg / STEP), 6);
    });

    it("splits a segment when its midpoint handle is clicked, the line looking the same", () => {
        const t = onHandle(L(), "m1");
        expect(pointsOf(t)).toEqual([
            { x: 0, y: 0 },
            { x: 40, y: 0 },
            { x: 40, y: 20 },
            { x: 40, y: 40 },
        ]);
        expect(undo(t).params).toEqual(L().params);
    });

    it("adds a corner and drags it when a midpoint handle is dragged", () => {
        const t = onHandle(L(), "m0", { x: 20, y: -20 }, fine);
        expect(pointsOf(t)).toEqual([
            { x: 0, y: 0 },
            { x: 20, y: -20 },
            { x: 40, y: 0 },
            { x: 40, y: 40 },
        ]);
    });

    it("splits a straight line from its middle, though the center dot is there too", () => {
        let t = openTool(lineTool, marchers(5));
        t = press(t, { x: 0, y: 0 }, env);
        t = pointerMove(t, { x: 80, y: 0 }, env);
        t = release(t, ctx, null);
        t = onHandle(t, "m0");
        expect(pointsOf(t)).toEqual([
            { x: 0, y: 0 },
            { x: 40, y: 0 },
            { x: 80, y: 0 },
        ]);
        // Reaching inside the center dot still pulls the pivot out
        const pulled = press(t, { x: 40, y: 0 }, { ...env, reachInside: true });
        expect(pulled.gesture?.type).toBe("pivot");
    });
});

describe("corners", () => {
    // 4 marchers on an L of 4 steps then 2½: 3 gaps, 2 on the long leg and 1 on the short one
    const L = () =>
        clicked(4, [
            { x: 0, y: 0 },
            { x: 40, y: 0 },
            { x: 40, y: 25 },
        ]);

    it("hold a marcher by default, each segment a whole number of marchers by its length", () => {
        const t = L();
        expect(paramsOf(t).corners).toBeUndefined();
        expect(corners.current(t.params, t.spots)).toBe("on");
        expectNear(spotsOf(t), [
            { x: 0, y: 0 },
            { x: 20, y: 0 },
            { x: 40, y: 0 },
            { x: 40, y: 25 },
        ]);
    });

    it("show the range of spacings in the chip, in Fit", () => {
        expect(chip(L())).toMatchObject({ display: "2–2½", derived: true });
        // Even segments show one number
        const even = clicked(5, [
            { x: 0, y: 0 },
            { x: 40, y: 0 },
            { x: 40, y: 40 },
        ]);
        expect(chip(even)).toMatchObject({ display: "2", derived: false });
        // Segments a hair apart read as one number, not "2–2"
        const near = clicked(5, [
            { x: 0, y: 0 },
            { x: 40, y: 0 },
            { x: 40, y: 40.003 },
        ]);
        expect(chip(near)).toMatchObject({ display: "2", derived: false });
    });

    it("switch off, the intervals running around the corner", () => {
        const t = cornersOff(L());
        expect(paramsOf(t).corners).toBe(false);
        expect(corners.current(t.params, t.spots)).toBe("off");
        const spots = spotsOf(t);
        expect(spots.some((s) => dist(s, { x: 40, y: 0 }) < 1e-6)).toBe(false);
        // Evenly along the line: 65 / 3 apart
        expect(spots[1]!.x).toBeCloseTo(65 / 3, 6);
        expect(chip(t).display).not.toContain("–");
        expect(undo(t).params).toEqual(L().params);
    });

    it("are offered only on a line with a corner", () => {
        let straight = openTool(lineTool, marchers(4));
        straight = press(straight, { x: 0, y: 0 }, env);
        straight = pointerMove(straight, { x: 60, y: 0 }, env);
        straight = release(straight, ctx, null);
        expect(corners.shown!(straight.params, 4)).toBe(false);
        expect(corners.shown!(L().params, 4)).toBe(true);
    });

    it("aren't offered where corners can't hold marchers: on the path, or too few marchers", () => {
        const spacing = lineTool.choices!.find((c) => c.key === "spacing")!;
        const onPath = edit(
            L(),
            spacing.pick(L().params, L().spots, "path-start", env),
            ctx,
        );
        expect(paramsOf(onPath).spacing.mode).toBe("path");
        expect(corners.shown!(onPath.params, onPath.spots)).toBe(false);
        // Three points are two segments, so two marchers are one gap too few
        expect(corners.shown!(L().params, 2)).toBe(false);
    });
});

describe("Keep interval on a line with corners", () => {
    // 9 marchers on an L of 8 steps each way: 4 gaps of 2 steps on each leg
    const L = () =>
        kept(
            clicked(9, [
                { x: 0, y: 0 },
                { x: 80, y: 0 },
                { x: 80, y: 80 },
            ]),
            "2",
        );

    it("makes each segment a whole number of intervals, a marcher on the corner", () => {
        // 4 marchers on an L of 4 then 2½ steps, typed 2: the legs become 4 and 2 steps
        const t = kept(
            clicked(4, [
                { x: 0, y: 0 },
                { x: 40, y: 0 },
                { x: 40, y: 25 },
            ]),
            "2",
        );
        expect(paramsOf(t).spacing.mode).toBe("keep");
        const [a, b, c] = pointsOf(t);
        expect(dist(a!, b!)).toBeCloseTo(40, 6);
        expect(dist(b!, c!)).toBeCloseTo(20, 6);
        const spots = spotsOf(t);
        expect(spots.some((s) => dist(s, b!) < 1e-6)).toBe(true);
        for (let i = 1; i < spots.length; i++)
            expect(dist(spots[i - 1]!, spots[i]!)).toBeCloseTo(20, 6);
        expect(chip(t)).toMatchObject({ display: "2", note: null });
    });

    it("moves a dragged corner in whole intervals, its neighbors staying", () => {
        const t = onHandle(L(), "p1", { x: 3, y: 77 });
        const [a, b, c] = pointsOf(t);
        expect(a).toEqual({ x: 0, y: 0 });
        expect(c).toEqual({ x: 80, y: 80 });
        expect(b!.x).toBeCloseTo(0, 6);
        expect(b!.y).toBeCloseTo(80, 6);
        const off = onHandle(L(), "p1", { x: 70, y: 20 });
        const [p0, p1, p2] = pointsOf(off);
        expect(whole(dist(p0!, p1!), 20)).toBe(true);
        expect(whole(dist(p1!, p2!), 20)).toBe(true);
        expect(dist(p0!, p1!) + dist(p1!, p2!)).toBeCloseTo(160, 6);
        expect(chip(off).note).toBeNull();
        // Everyone still 2 steps apart, with a marcher on the corner
        const spots = spotsOf(off);
        expect(spots.some((s) => dist(s, p1!) < 1e-6)).toBe(true);
        for (let i = 1; i < spots.length; i++)
            expect(dist(spots[i - 1]!, spots[i]!)).toBeCloseTo(20, 6);
    });

    it("frees a corner with fine, and the chip says it's off its interval", () => {
        const t = onHandle(L(), "p1", { x: 73.3, y: 4.1 }, fine);
        expect(pointsOf(t)[1]).toEqual({ x: 73.3, y: 4.1 });
        expect(chip(t).note).toBe("corner off its interval");
        // The corner still holds a marcher
        expect(
            spotsOf(t).some((s) => dist(s, { x: 73.3, y: 4.1 }) < 1e-6),
        ).toBe(true);
    });

    it("never stacks two marchers when fine pulls a corner in off its interval", () => {
        // Legs of about 2.7 and exactly 3 intervals, each still holding 4 gaps
        const t = onHandle(L(), "p1", { x: 44, y: 32 }, fine);
        const [a, b, c] = pointsOf(t);
        expect(b).toEqual({ x: 44, y: 32 });
        const spots = spotsOf(t);
        expect(spots).toHaveLength(9);
        for (let i = 0; i < spots.length; i++)
            for (let j = i + 1; j < spots.length; j++)
                expect(dist(spots[i]!, spots[j]!)).toBeGreaterThan(1);
        // Each leg is laid out evenly, the corner and both ends holding a marcher
        expectNear([spots[0]!, spots[4]!, spots[8]!], [a!, b!, c!]);
        const legs = [spots.slice(0, 5), spots.slice(4)];
        legs.forEach((leg, k) => {
            const each = dist(pointsOf(t)[k]!, pointsOf(t)[k + 1]!) / 4;
            for (let i = 1; i < leg.length; i++)
                expect(dist(leg[i - 1]!, leg[i]!)).toBeCloseTo(each, 6);
        });
        expect(chip(t).note).toBe("corner off its interval");
    });

    it("turns an end about its neighbor, the segment's length kept", () => {
        const t = onHandle(L(), "p2", { x: 160, y: 1 });
        expect(pointsOf(t)[1]).toEqual({ x: 80, y: 0 });
        expect(pointsOf(t)[2]!.x).toBeCloseTo(160, 6);
        expect(pointsOf(t)[2]!.y).toBeCloseTo(0, 6);
    });

    it("runs a typed interval around the corner with corners off", () => {
        const t = cornersOff(L());
        const spots = spotsOf(t);
        for (let i = 1; i < spots.length; i++)
            expect(dist(spots[i - 1]!, spots[i]!)).toBeCloseTo(20, 6);
        // The line is as long as its marchers need, end to end
        expectNear(
            [spots[0]!, spots.at(-1)!],
            [pointsOf(t)[0]!, pointsOf(t).at(-1)!],
        );
    });
});

describe("a placed line with corners", () => {
    const N = 5;
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
    const zigzag = () =>
        clicked(N, [
            { x: 0, y: 0 },
            { x: 40, y: 0 },
            { x: 40, y: 40 },
            { x: 80, y: 40 },
        ]);

    it("keeps every point when placed and reopened", () => {
        const t = zigzag();
        const placed = readBack(recipeOf(t));
        expect(placed).toBeDefined();
        expect(placed.params.points).toEqual(paramsOf(t).points);
        expect(lineTool.handles(placed.params, N)).toHaveLength(4 + 3);
    });

    it("keeps the corners switch off when placed and reopened", () => {
        const t = cornersOff(zigzag());
        const { spots: _spots, ...params } = recipeOf(t)
            .params as LineParams & {
            spots: number;
        };
        expect(isLineParams(params)).toBe(true);
        expect(readBack(recipeOf(t)).params.corners).toBe(false);
    });

    it("saves a corner dragged on the placed line, inside the same frame", () => {
        const placed = readBack(recipeOf(zigzag()));
        const corner = lineTool.handles(placed.params, N)[1]!;
        let live = pressLive(openLive(placed), corner.at, env)!;
        live = moveLive(live, { x: 40, y: -20 }, fine);
        const out = releaseLive(live);
        expect(out.changed).toBe(true);
        expect((out.live.params as LineParams).points[1]).toMatchObject({
            x: 40,
            y: -20,
        });
        expect(liveTargets(placed, out.live.params, ctx).members).toHaveLength(
            N,
        );
    });

    it("splits a segment of the placed line on a click of its midpoint", () => {
        const placed = readBack(recipeOf(zigzag()));
        const mid = lineTool
            .handles(placed.params, N)
            .find((h) => h.key === "m0")!;
        const live = pressLive(openLive(placed), mid.at, env)!;
        const out = releaseLive(live, { double: false });
        expect(out.changed).toBe(true);
        expect((out.live.params as LineParams).points).toHaveLength(5);
    });
});

describe("mixed intervals on a line with corners (#526)", () => {
    // 7 marchers on an L of 4 steps each way, typed 3 at 2 steps then 4 at 3: gaps 2 2 3 3 3 3
    // (the seam takes the larger), the corner at the seam nearest halfway: 2 2 3 | 3 3 3
    const GAPS = [2, 2, 3, 3, 3, 3];
    const drawnL = () =>
        clicked(7, [
            { x: 0, y: 0 },
            { x: 40, y: 0 },
            { x: 40, y: 40 },
        ]);
    const L = () => kept(drawnL(), "3*2+4*3");
    const gapsOf = (t: ToolState) => {
        const at = spotsOf(t);
        return at.slice(1).map((q, i) => dist(at[i]!, q) / STEP);
    };
    const expectGaps = (t: ToolState, steps: readonly number[]) => {
        const gaps = gapsOf(t);
        expect(gaps).toHaveLength(steps.length);
        gaps.forEach((g, i) => expect(g).toBeCloseTo(steps[i]!, 6));
    };
    /** Distances from the first point that a whole run of the gaps reaches */
    const seams = GAPS.map((_, i) =>
        GAPS.slice(0, i + 1).reduce((a, b) => a + b * STEP, 0),
    );
    const onSeam = (l: number) => seams.some((s) => Math.abs(s - l) < 1e-6);

    it("lays the groups' gaps in order along the line, each segment a whole run, a marcher on the corner", () => {
        const t = L();
        expect(paramsOf(t).spacing).toEqual({
            mode: "keep",
            groups: [
                { interval: 20, count: 3 },
                { interval: 30, count: 4 },
            ],
        });
        const [a, b, c] = pointsOf(t);
        expect(dist(a!, b!)).toBeCloseTo(70, 6);
        expect(dist(b!, c!)).toBeCloseTo(90, 6);
        // Each leg keeps its direction
        expect(b!.y - a!.y).toBeCloseTo(0, 6);
        expect(c!.x - b!.x).toBeCloseTo(0, 6);
        expectGaps(t, GAPS);
        expect(spotsOf(t)[3]).toEqual(b);
        expect(cornerOffInterval(t.params as LineParams, 7)).toBe(false);
    });

    it("moves a dragged corner onto a seam between the gaps, its neighbors staying", () => {
        const t = L();
        const [a, , c] = pointsOf(t);
        const moved = onHandle(t, "p1", { x: a!.x + 30, y: a!.y + 60 });
        const [p0, p1, p2] = pointsOf(moved);
        expect(p0).toEqual(a);
        expect(p2).toEqual(c);
        expect(onSeam(dist(p0!, p1!))).toBe(true);
        expect(dist(p0!, p1!) + dist(p1!, p2!)).toBeCloseTo(160, 6);
        expect(cornerOffInterval(paramsOf(moved), 7)).toBe(false);
        // The same gaps in the same order, the corner on a marcher
        expectGaps(moved, GAPS);
        expect(spotsOf(moved).some((s) => dist(s, p1!) < 1e-6)).toBe(true);
    });

    it("scales a segment's gaps to fit when fine leaves its corner off a seam", () => {
        const t = L();
        const [a] = pointsOf(t);
        const to = { x: a!.x + 61.3, y: a!.y + 4.1 };
        const moved = onHandle(t, "p1", to, fine);
        expect(pointsOf(moved)[1]).toEqual(to);
        // The group chips stand in for the interval chip; the line knows its corner is off
        expect(cornerOffInterval(paramsOf(moved), 7)).toBe(true);
        const spots = spotsOf(moved);
        expect(spots).toHaveLength(7);
        expect(spots.some((s) => dist(s, to) < 1e-6)).toBe(true);
        for (let i = 0; i < spots.length; i++)
            for (let j = i + 1; j < spots.length; j++)
                expect(dist(spots[i]!, spots[j]!)).toBeGreaterThan(1);
        // The short first leg keeps its gaps' proportions: 2 2 3
        const g = gapsOf(moved);
        expect(g[1]! / g[0]!).toBeCloseTo(1, 6);
        expect(g[2]! / g[0]!).toBeCloseTo(1.5, 6);
    });

    it("runs the groups' gaps around the corner with corners off, and back on", () => {
        const off = cornersOff(L());
        expect(paramsOf(off).spacing).toEqual(paramsOf(L()).spacing);
        expectGaps(off, GAPS);
        expectNear(
            [spotsOf(off)[0]!, spotsOf(off).at(-1)!],
            [pointsOf(off)[0]!, pointsOf(off).at(-1)!],
        );
        const on = edit(
            off,
            corners.pick(off.params, off.spots, "on", env),
            ctx,
        );
        expect(paramsOf(on).corners).toBeUndefined();
        expect(paramsOf(on).spacing).toEqual(paramsOf(L()).spacing);
        expectGaps(on, GAPS);
        expect(spotsOf(on)[3]).toEqual(pointsOf(on)[1]);
    });

    it("keeps the groups' proportions unlocked in Fit, scaled to the legs", () => {
        const spacing = lineTool.choices!.find((c) => c.key === "spacing")!;
        const t = L();
        const fit = edit(t, spacing.pick(t.params, t.spots, "fit", env), ctx);
        expect(paramsOf(fit).spacing).toEqual({
            mode: "fit",
            groups: (paramsOf(t).spacing as { groups: unknown }).groups,
        });
        expect(pointsOf(fit)).toEqual(pointsOf(t));
        // As long as the groups: the same spots as locked
        expectNear(spotsOf(fit), spotsOf(t));
        // A leg dragged longer with fine: its gaps grow in proportion, the corner on a marcher
        const longer = onHandle(fit, "p2", { x: 120, y: 80 }, fine);
        const [, b] = pointsOf(longer);
        expect(spotsOf(longer).some((s) => dist(s, b!) < 1e-6)).toBe(true);
        expect(
            lineTool.groups!.shown(longer.params, longer.spots, STEP),
        ).toHaveLength(2);
    });

    it("is placed and reopened with its points, groups and corners exactly", () => {
        for (const t of [L(), cornersOff(L())]) {
            const placement = placementOf(t, ctx)!;
            const recipe: PlacedRecipe = {
                ...placement.recipe,
                id: 1,
                timelineId: 10,
                members: placement.members,
                params: JSON.parse(JSON.stringify(placement.recipe.params)),
            };
            const { spots: _spots, ...params } = recipe.params as LineParams & {
                spots: number;
            };
            expect(isLineParams(params)).toBe(true);
            const at = new Map(recipe.members.map((m) => [m.marcherId, m]));
            const [placed] = boxesAt({
                recipes: [recipe],
                endBeatOf: () => 8,
                beat: 8,
                positionOf: (id) => at.get(id),
            }) as PlacedBox<LineParams>[];
            expect(placed).toBeDefined();
            expect(placed!.params.points).toEqual(paramsOf(t).points);
            expect(placed!.params.spacing).toEqual(paramsOf(t).spacing);
            expect(placed!.params.corners).toBe(paramsOf(t).corners);
            // Everyone on a spot, and the group chips back
            const spots = slotsOf(t, ctx);
            placement.members.forEach((m) =>
                expect(
                    spots.some((s) => dist(s, { x: m.x, y: m.y }) < 1e-6),
                ).toBe(true),
            );
            expect(
                chipLayout(lineTool, placed!.params, 7, env).groups?.map(
                    (g) => `${g.count} × ${g.interval}`,
                ),
            ).toEqual(["3 × 2", "4 × 3"]);
        }
    });
});

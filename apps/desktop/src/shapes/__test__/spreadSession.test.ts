import { describe, expect, it } from "vitest";
import { boxTool } from "../box/boxTool";
import { boxDistribution, filesOf, type BoxParams } from "../box/boxGeometry";
import { circleTool } from "../circle/circleTool";
import { radiusOf, type CircleParams } from "../circle/circleGeometry";
import {
    filesDistribution,
    type SpreadDistribution,
} from "../distribute/distribution";
import { distributionOf, reshuffle, withMode } from "../distribute/modes";
import { fieldToFrame } from "../frame/frame";
import { SPREAD_GENERATOR } from "../distribute/spread";
import { savedShapeOf, withSavedDistribution } from "../library/savedShapes";
import { boxesAt, type PlacedRecipe } from "../placed/placedBox";
import { placedBoxSummary } from "../placed/placedBoxText";
import { placementOf } from "../tool/shapePlacement";
import type { AnyToolKind, ToolEnv } from "../tool/toolKind";
import {
    edit,
    openTool,
    pointerMove,
    press,
    release,
    slotsOf,
    undo,
    type ToolState,
} from "../tool/toolMachine";
import type { ShapeContext, XY } from "../types";

/**
 * Even spread in the shape session (#391, spec #385): the box and the circle switch to Spread,
 * Reshuffle is one undo step, and a placed spread reopens exactly, while one from a generator this
 * app doesn't have stays plain positions.
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

function drawn(kind: AnyToolKind, n: number, from: XY, to: XY): ToolState {
    let t = openTool(kind, marchers(n));
    t = press(t, from, env);
    t = pointerMove(t, to, env);
    return release(t, ctx);
}

/** The open shape switched to Spread, as the mode switch does it */
const spreadOf = (t: ToolState): ToolState =>
    edit(t, withMode(t.kind, t.params, t.spots, "spread", env), ctx);

const dist = (a: XY, b: XY) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
const closest = (spots: readonly XY[]) =>
    Math.min(
        ...spots.flatMap((p, i) => spots.slice(i + 1).map((q) => dist(p, q))),
    );
const xyOf = (spots: readonly XY[]) => spots.map((s) => [s.x, s.y]);
/** A spread's closest pair: never under the interval, and not much over it (#439) */
function expectSpacing(spots: readonly XY[], interval: number) {
    expect(closest(spots)).toBeGreaterThanOrEqual(interval * (1 - 1e-6));
    expect(closest(spots)).toBeLessThan(interval * 1.2);
}

/** What placing `t` saves, through JSON as the database keeps it, read back as a placed shape */
function reopened(t: ToolState, change?: (params: object) => object) {
    const placement = placementOf(t, ctx)!;
    const params = JSON.parse(JSON.stringify(placement.recipe.params));
    const recipe: PlacedRecipe = {
        ...placement.recipe,
        id: 1,
        timelineId: 10,
        members: placement.members,
        params: change ? change(params) : params,
    };
    const at = new Map(placement.members.map((m) => [m.marcherId, m]));
    const shapes = boxesAt({
        recipes: [recipe],
        endBeatOf: () => 8,
        beat: 8,
        positionOf: (id) => at.get(id),
    });
    return { shapes, stored: recipe.params as Record<string, unknown> };
}

describe("a box in Spread", () => {
    const N = 24;
    const box = () => drawn(boxTool, N, { x: 0, y: 0 }, { x: 60, y: 30 });

    it("is one undo step from Files, and back in Files it is the box it was", () => {
        const t = box();
        const s = spreadOf(t);
        expect(distributionOf(boxTool, s.params, N)).toEqual({
            mode: "spread",
            seed: 1,
            generator: SPREAD_GENERATOR,
            count: N,
        });
        expect(xyOf(slotsOf(undo(s), ctx))).toEqual(xyOf(slotsOf(t, ctx)));
        const back = withMode(boxTool, s.params, N, "files", env) as BoxParams;
        expect(filesOf(back)).toBe(filesOf(t.params as BoxParams));
        expect(boxDistribution(back)).toEqual(
            filesDistribution(filesOf(t.params as BoxParams)),
        );
    });

    it("stands its marchers inside its frame, no closer than the across interval", () => {
        const s = spreadOf(box());
        const p = s.params as BoxParams;
        const spots = slotsOf(s, ctx);
        expect(spots).toHaveLength(N);
        expectSpacing(spots, p.across);
        const frame = boxTool.frameOf(p, N);
        for (const spot of spots) {
            const local = fieldToFrame(frame, spot);
            expect(Math.abs(local.x)).toBeLessThan(frame.halfWidth);
            expect(Math.abs(local.y)).toBeLessThan(frame.halfDepth);
        }
    });

    it("shows only its spacing in the chip: a spread has no files or ranks", () => {
        const s = spreadOf(box());
        const shown = boxTool.params
            .filter((param) => param.shown?.(s.params, N) ?? true)
            .map((param) => param.key);
        expect(shown).toEqual(["across"]);
    });

    it("follows a handle, the opposite side staying put, the interval what fits (#439)", () => {
        let s = spreadOf(box());
        const before = s.params as BoxParams;
        const frame = boxTool.frameOf(before, N);
        const e = boxTool.handles(s.params, N).find((h) => h.key === "e")!;
        s = press(s, e.at, env);
        s = pointerMove(s, { x: e.at.x + 60, y: e.at.y }, env);
        s = release(s, ctx);
        const after = s.params as BoxParams;
        const now = boxTool.frameOf(after, N);
        // The east side went where it was dragged, the west and the depth stayed
        expect(now.center.x - now.halfWidth).toBeCloseTo(
            frame.center.x - frame.halfWidth,
            9,
        );
        expect(now.center.x + now.halfWidth).toBeCloseTo(
            frame.center.x + frame.halfWidth + 60,
            9,
        );
        expect(now.halfDepth).toBeCloseTo(frame.halfDepth, 9);
        // A bigger frame for the same marchers: a wider interval, no pair closer than it
        expect(after.across).toBeGreaterThan(before.across);
        expectSpacing(slotsOf(s, ctx), after.across);
        for (const spot of slotsOf(s, ctx)) {
            const local = fieldToFrame(now, spot);
            expect(Math.abs(local.x)).toBeLessThanOrEqual(now.halfWidth);
            expect(Math.abs(local.y)).toBeLessThanOrEqual(now.halfDepth);
        }
    });

    it("drafts its spots during a handle drag and lays them out exactly on release (#439)", () => {
        let s = spreadOf(box());
        const e = boxTool.handles(s.params, N).find((h) => h.key === "e")!;
        s = press(s, e.at, env);
        s = pointerMove(s, { x: e.at.x + 37, y: e.at.y }, env);
        // Mid-drag: inside the new frame, though not the exact layout
        const frame = boxTool.frameOf(s.params, N);
        const drafted = slotsOf(s, ctx);
        expect(drafted).toHaveLength(N);
        for (const spot of drafted) {
            const local = fieldToFrame(frame, spot);
            expect(Math.abs(local.x)).toBeLessThanOrEqual(
                frame.halfWidth + 1e-9,
            );
            expect(Math.abs(local.y)).toBeLessThanOrEqual(
                frame.halfDepth + 1e-9,
            );
        }
        s = release(s, ctx);
        // Released: the spots a fresh look at the params gives, no pair closer than the interval
        const exact = boxTool.shape.generate(
            JSON.parse(JSON.stringify(s.params)),
            N,
            ctx,
        );
        expect(xyOf(slotsOf(s, ctx))).toEqual(xyOf(exact));
        expectSpacing(exact, (s.params as BoxParams).across);
    });

    it("reshuffles to the next seed as one undo step", () => {
        const s = spreadOf(box());
        const r = edit(s, reshuffle(boxTool, s.params, N, env), ctx);
        expect(
            (distributionOf(boxTool, r.params, N) as SpreadDistribution).seed,
        ).toBe(2);
        expect(xyOf(slotsOf(r, ctx))).not.toEqual(xyOf(slotsOf(s, ctx)));
        expectSpacing(slotsOf(r, ctx), (r.params as BoxParams).across);
        expect(xyOf(slotsOf(undo(r), ctx))).toEqual(xyOf(slotsOf(s, ctx)));
    });

    it("has no Reshuffle in Files", () => {
        const t = box();
        expect(reshuffle(boxTool, t.params, N, env)).toBeNull();
    });

    it("reopens placed with its seed, generator and spots", () => {
        let s = spreadOf(box());
        s = edit(s, reshuffle(boxTool, s.params, N, env), ctx);
        const { shapes, stored } = reopened(s);
        expect(stored.distribution).toEqual({
            mode: "spread",
            seed: 2,
            generator: SPREAD_GENERATOR,
            count: N,
        });
        expect(shapes).toHaveLength(1);
        expect(boxTool.shape.generate(shapes[0]!.params, N, ctx)).toEqual(
            slotsOf(s, ctx),
        );
        // Its numbers are its spacing: no files, ranks or short rank
        const across = (s.params as BoxParams).across / STEP;
        expect(placedBoxSummary(shapes[0]!, STEP)).toBe(
            `${Math.round(across * 100) / 100} steps`,
        );
    });

    it("reopens a generator 1 spread laid out as it was placed, closest pair exactly one interval (#439)", () => {
        const s = spreadOf(box());
        const { shapes, stored } = reopened(s, (params) => ({
            ...params,
            distribution: {
                ...(params as { distribution: object }).distribution,
                generator: 1,
            },
        }));
        expect(shapes).toHaveLength(1);
        expect(boxDistribution(shapes[0]!.params as BoxParams)).toMatchObject({
            generator: 1,
        });
        const spots = boxTool.shape.generate(shapes[0]!.params, N, ctx);
        expect(closest(spots)).toBeCloseTo(stored.across as number, 9);
    });

    it("stays plain positions when its generator is one this app doesn't have", () => {
        const s = spreadOf(box());
        const { shapes } = reopened(s, (params) => ({
            ...params,
            distribution: {
                ...(params as { distribution: object }).distribution,
                generator: SPREAD_GENERATOR + 1,
            },
        }));
        expect(shapes).toEqual([]);
    });

    it("saves without its seed, and a saved spread places from seed 1", () => {
        let s = spreadOf(box());
        s = edit(s, reshuffle(boxTool, s.params, N, env), ctx);
        const saved = savedShapeOf(boxTool, s.params, N, STEP, {
            id: "s",
            name: "Scatter",
            at: "2026-10-23T00:00:00.000Z",
        });
        expect(saved.distribution).toEqual({
            mode: "spread",
            generator: SPREAD_GENERATOR,
        });
        const fresh = drawn(boxTool, 30, { x: 0, y: 0 }, { x: 60, y: 30 });
        const placed = withSavedDistribution(
            boxTool,
            fresh.params,
            30,
            saved.distribution,
            env,
        );
        expect(distributionOf(boxTool, placed, 30)).toEqual({
            mode: "spread",
            seed: 1,
            generator: SPREAD_GENERATOR,
            count: 30,
        });
    });
});

describe("a circle in Spread", () => {
    const N = 20;
    const circle = () => drawn(circleTool, N, { x: 0, y: 0 }, { x: 60, y: 0 });

    it("switches from Outline as one undo step, its center kept", () => {
        const t = circle();
        const s = spreadOf(t);
        expect(distributionOf(circleTool, s.params, N)?.mode).toBe("spread");
        expect((s.params as CircleParams).center).toEqual(
            (t.params as CircleParams).center,
        );
        expect(xyOf(slotsOf(undo(s), ctx))).toEqual(xyOf(slotsOf(t, ctx)));
    });

    it("fills its disc, no closer than the interval", () => {
        const s = spreadOf(circle());
        const p = s.params as CircleParams;
        const spots = slotsOf(s, ctx);
        expect(spots).toHaveLength(N);
        expectSpacing(spots, p.interval);
        const r = radiusOf(p, N);
        for (const spot of spots) expect(dist(spot, p.center)).toBeLessThan(r);
        // Not a ring: some stand well inside
        expect(
            spots.filter((spot) => dist(spot, p.center) < r / 2).length,
        ).toBeGreaterThan(0);
    });

    it("sets its interval by its radius handle, as in Outline", () => {
        let s = spreadOf(circle());
        const before = s.params as CircleParams;
        const h = circleTool.handles(s.params, N)[0]!;
        s = press(s, h.at, env);
        s = pointerMove(s, { x: h.at.x + 40, y: h.at.y }, env);
        s = release(s, ctx);
        const after = s.params as CircleParams;
        expect(after.interval).toBeGreaterThan(before.interval);
        // The rim lands near the cursor: within a half step's worth of interval
        expect(radiusOf(after, N)).toBeGreaterThan(radiusOf(before, N) + 20);
        expectSpacing(slotsOf(s, ctx), after.interval);
    });

    it("reshuffles and reopens like the box", () => {
        let s = spreadOf(circle());
        s = edit(s, reshuffle(circleTool, s.params, N, env), ctx);
        const { shapes } = reopened(s);
        expect(shapes).toHaveLength(1);
        expect(circleTool.shape.generate(shapes[0]!.params, N, ctx)).toEqual(
            slotsOf(s, ctx),
        );
    });
});

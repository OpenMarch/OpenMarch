// @vitest-environment node
import { describe, expect, it } from "vitest";
import { boxTool } from "../box/boxTool";
import { circleTool } from "../circle/circleTool";
import {
    distributionOf,
    edgeSplitOf,
    reshuffle,
    withEdge,
    withMode,
    withSeed,
} from "../distribute/modes";
import type { SpreadDistribution } from "../distribute/distribution";
import { SPREAD_GENERATOR } from "../distribute/spread";
import type { ShapeFrame } from "../frame/frame";
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
 * Spread with an edge in the shape session (#450): the toggle keeps the frame, Reshuffle and a
 * typed seed keep the edge (and reshuffle the inside only), and the marchers stand no closer than
 * the interval, for a box and a circle at 8 to 100.
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

function spreadOf(kind: AnyToolKind, n: number, to: XY): ToolState {
    let t = openTool(kind, marchers(n));
    t = press(t, { x: 0, y: 0 }, env);
    t = pointerMove(t, to, env);
    t = release(t, ctx);
    return edit(t, withMode(t.kind, t.params, t.spots, "spread", env), ctx);
}

const toggled = (t: ToolState, on: boolean) =>
    edit(t, withEdge(t.kind, t.params, t.spots, on, env), ctx);
const dOf = (t: ToolState) =>
    distributionOf(t.kind, t.params, t.spots) as SpreadDistribution;
const intervalOf = (t: ToolState) =>
    (t.params as { across?: number; interval?: number }).across ??
    (t.params as { interval: number }).interval;
const closest = (ps: readonly XY[]) =>
    Math.min(
        ...ps.flatMap((p, i) =>
            ps.slice(i + 1).map((q) => Math.hypot(q.x - p.x, q.y - p.y)),
        ),
    );

function expectSameFrame(a: ShapeFrame, b: ShapeFrame) {
    expect(a.center.x).toBeCloseTo(b.center.x, 6);
    expect(a.center.y).toBeCloseTo(b.center.y, 6);
    expect(a.halfWidth).toBeCloseTo(b.halfWidth, 6);
    expect(a.halfDepth).toBeCloseTo(b.halfDepth, 6);
}

const SHAPES: Record<string, (n: number) => ToolState> = {
    box: (n) => spreadOf(boxTool, n, { x: 160, y: 110 }),
    circle: (n) => spreadOf(circleTool, n, { x: 80, y: 0 }),
};

describe.each(Object.entries(SHAPES))(
    "a %s in Spread with an edge",
    (_, drawn) => {
        it.each([8, 12, 24, 48, 100])(
            "at %i: the toggle keeps the frame, no pair under the interval",
            (n) => {
                const s = drawn(n);
                const frame = s.kind.frameOf(s.params, n);
                const on = toggled(s, true);
                expect(dOf(on).edge).toBe(true);
                expectSameFrame(on.kind.frameOf(on.params, n), frame);
                expect(closest(slotsOf(on, ctx))).toBeGreaterThanOrEqual(
                    intervalOf(on) * (1 - 1e-6),
                );
                const split = edgeSplitOf(on.kind, on.params, n)!;
                expect(split.edge + split.inside).toBe(n);
                const off = toggled(on, false);
                expect(dOf(off)).not.toHaveProperty("edge");
                expectSameFrame(off.kind.frameOf(off.params, n), frame);
            },
        );

        it("reshuffles the inside only, keeping the edge and the frame, and a typed seed keeps it too", () => {
            const n = 40;
            const on = toggled(drawn(n), true);
            const frame = on.kind.frameOf(on.params, n);
            const { edge } = edgeSplitOf(on.kind, on.params, n)!;
            const r = edit(
                on,
                reshuffle(on.kind, on.params, on.spots, env),
                ctx,
            );
            expect(dOf(r).edge).toBe(true);
            expectSameFrame(r.kind.frameOf(r.params, n), frame);
            const xy = (t: ToolState) =>
                slotsOf(t, ctx).map(({ x, y }) => [x, y]);
            expect(xy(r).slice(0, edge)).toEqual(xy(on).slice(0, edge));
            expect(xy(r).slice(edge)).not.toEqual(xy(on).slice(edge));
            const typed = edit(
                r,
                withSeed(r.kind, r.params, r.spots, 7, env),
                ctx,
            );
            expect(dOf(typed)).toMatchObject({ seed: 7, edge: true });
        });

        it("keeps its edge in a placed recipe, saved as JSON", () => {
            const on = toggled(drawn(24), true);
            const saved = JSON.parse(JSON.stringify(on.params));
            expect(distributionOf(on.kind, saved, 24)).toEqual(dOf(on));
        });
    },
);

it("moves a generator 1 spread to generator 2 when Edge is pressed, as Reshuffle does", () => {
    const s = SHAPES.box!(24);
    const d = dOf(s);
    const old = {
        ...(s.params as object),
        distribution: { ...d, generator: 1 },
    };
    const on = withEdge(boxTool, old, 24, true, env);
    expect(distributionOf(boxTool, on, 24)).toMatchObject({
        generator: SPREAD_GENERATOR,
        edge: true,
    });
});

it("keeps what the box remembers of Grid through an Edge toggle (#449 + #450)", () => {
    let t = openTool(boxTool, marchers(24));
    t = press(t, { x: 0, y: 0 }, env);
    t = pointerMove(t, { x: 120, y: 50 }, env);
    const grid = release(t, ctx);
    const spread = edit(
        grid,
        withMode(grid.kind, grid.params, grid.spots, "spread", env),
        ctx,
    );
    const on = toggled(spread, true);
    expectSameFrame(
        on.kind.frameOf(on.params, 24),
        grid.kind.frameOf(grid.params, 24),
    );
    const back = edit(
        on,
        withMode(on.kind, on.params, on.spots, "files", env),
        ctx,
    );
    const { files, across, deep, center } = back.params as {
        files: number;
        across: number;
        deep: number;
        center: XY;
    };
    const was = grid.params as typeof back.params & {
        files: number;
        across: number;
        deep: number;
        center: XY;
    };
    expect({ files, across, deep, center }).toEqual({
        files: was.files,
        across: was.across,
        deep: was.deep,
        center: was.center,
    });
});

it("has no Edge outside Spread", () => {
    let t = openTool(boxTool, marchers(12));
    t = press(t, { x: 0, y: 0 }, env);
    t = pointerMove(t, { x: 80, y: 40 }, env);
    t = release(t, ctx);
    expect(withEdge(boxTool, t.params, 12, true, env)).toBeNull();
    expect(edgeSplitOf(boxTool, t.params, 12)).toBeNull();
});

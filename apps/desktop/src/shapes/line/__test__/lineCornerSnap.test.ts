import { describe, expect, it } from "vitest";
import { lineTool } from "../lineTool";
import { SOFT_SNAP_PX, type LineParams } from "../lineGeometry";
import type { ToolEnv } from "../../tool/toolKind";
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
 * Dragging a corner with the interval unlocked (owner feedback on #596): measured ↔ or ↕, the
 * corner moves freely the other way and snaps that way so both its stretches' runs are whole
 * steps; along the path or straight across it follows the pointer and snaps to a whole-interval
 * spot only within a few pixels of it. Shift leaves it where it's dragged.
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
    // Half a step is 5 px on screen: under 8, so drags snap to whole steps
    zoom: 1,
};
/** Zoomed far out: every whole-interval spot is within a few pixels of the pointer */
const far: ToolEnv = { ...env, zoom: 0.01 };
const fine: ToolEnv = { ...env, snap: false, fine: true, gridSnap: (p) => p };
const ctx: ShapeContext = { stepPx: STEP, snapPoint: (p) => p };
const marchers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        at: { x: 300 + i * 7, y: 300 },
        drillRank: i,
    }));

/** A handle pressed and moved to `to`, not yet let go */
function midDrag(t: ToolState, key: string, to: XY, e: ToolEnv = env) {
    const at = lineTool
        .handles(t.params as LineParams, t.spots)
        .find((x) => x.key === key)!.at;
    t = press(t, at, e);
    expect(t.gesture?.type).toBe("handle");
    return pointerMove(t, to, e);
}

const paramsOf = (t: ToolState) => t.params as LineParams;
const cornerOf = (t: ToolState) => {
    const { x, y } = paramsOf(t).points[1]!;
    return { x, y };
};
const spotsOf = (t: ToolState) => slotsOf(t, ctx).map(({ x, y }) => ({ x, y }));
const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
const measured = lineTool.choices!.find((c) => c.key === "measured")!;
const measuredBy = (t: ToolState, value: string) =>
    edit(t, measured.pick(t.params, t.spots, value, env), ctx);
const lock = lineTool.lock!;

/**
 * 8 marchers side to side from 0 to 140, 2 steps apart, with a corner on the fourth (at 60),
 * a segment's midpoint dragged there with Shift as a user adds a point in the middle
 */
function split(): ToolState {
    let t = openTool(lineTool, marchers(8));
    t = press(t, { x: 0, y: 0 }, env);
    t = pointerMove(t, { x: 140, y: 0 }, env);
    t = release(t, ctx);
    t = release(midDrag(t, "m0", { x: 60, y: 0 }, fine), ctx);
    expect(paramsOf(t).points.map(({ x, y }) => ({ x, y }))).toEqual([
        { x: 0, y: 0 },
        { x: 60, y: 0 },
        { x: 140, y: 0 },
    ]);
    expect(lock.locked(t.params, t.spots)).toBe(false);
    return t;
}

describe("a corner dragged unlocked, measured ↔", () => {
    it("moves straight up smoothly, staying where both sides' side-to-side intervals are whole", () => {
        let t = midDrag(measuredBy(split(), "x"), "p1", { x: 62, y: -3 });
        for (const y of [-3, -8, -14, -21, -33, -47]) {
            t = pointerMove(t, { x: 62, y }, env);
            expect(cornerOf(t)).toEqual({ x: 60, y: snapHalf(y) });
        }
        t = release(t, ctx);
        // Every marcher still 2 steps apart side to side
        const xs = spotsOf(t).map((s) => s.x);
        xs.slice(1).forEach((x, i) => expect(x - xs[i]!).toBeCloseTo(20, 6));
    });

    it("moves to the next spot side to side where both intervals are whole", () => {
        const t = midDrag(measuredBy(split(), "x"), "p1", { x: 77, y: -30 });
        expect(cornerOf(t)).toEqual({ x: 80, y: -30 });
    });

    it("measured ↕, moves freely side to side", () => {
        let t = openTool(lineTool, marchers(8));
        t = press(t, { x: 0, y: 0 }, env);
        t = pointerMove(t, { x: 0, y: 140 }, env);
        t = release(t, ctx);
        t = release(midDrag(t, "m0", { x: 0, y: 60 }, fine), ctx);
        t = midDrag(measuredBy(t, "y"), "p1", { x: 37, y: 63 });
        expect(cornerOf(t)).toEqual({ x: 35, y: 60 });
    });

    it("stays where it's dragged with Shift", () => {
        const t = midDrag(
            measuredBy(split(), "x"),
            "p1",
            { x: 62.3, y: -21.7 },
            fine,
        );
        expect(cornerOf(t)).toEqual({ x: 62.3, y: -21.7 });
    });

    it("locked, still keeps its run of gaps side to side", () => {
        let t = measuredBy(split(), "x");
        t = edit(t, lock.toggle(t.params, t.spots, env), ctx);
        t = midDrag(t, "p1", { x: 67, y: -30 });
        expect(cornerOf(t)).toEqual({ x: 60, y: -30 });
    });
});

describe("a corner dragged unlocked, along the path or straight across", () => {
    for (const how of ["along", "straight"]) {
        const line = () =>
            how === "along" ? split() : measuredBy(split(), how);

        it(`${how}: follows the pointer away from whole-interval spots`, () => {
            const to = { x: 62, y: -30 };
            const snapped = cornerOf(midDrag(line(), "p1", to, far));
            expect(dist(snapped, to)).toBeGreaterThan(SOFT_SNAP_PX);
            expect(cornerOf(midDrag(line(), "p1", to))).toEqual({
                x: 60,
                y: -30,
            });
        });

        it(`${how}: snaps to a whole-interval spot within ${SOFT_SNAP_PX} px of the pointer`, () => {
            const spot = cornerOf(
                midDrag(line(), "p1", { x: 62, y: -30 }, far),
            );
            const to = { x: spot.x + 3, y: spot.y - 2 };
            const near = cornerOf(midDrag(line(), "p1", to, far));
            expect(dist(near, to)).toBeLessThanOrEqual(SOFT_SNAP_PX);
            const t = midDrag(line(), "p1", to);
            expect(cornerOf(t).x).toBeCloseTo(near.x, 9);
            expect(cornerOf(t).y).toBeCloseTo(near.y, 9);
            // Both legs' marchers evenly spaced on whole steps
            const at = spotsOf(t);
            const legs = [dist(at[0]!, at[1]!), dist(at[6]!, at[7]!)];
            for (const leg of legs)
                expect(leg / STEP).toBeCloseTo(Math.round(leg / STEP), 6);
        });

        it(`${how}: stays where it's dragged with Shift`, () => {
            const t = midDrag(line(), "p1", { x: 61.7, y: -28.2 }, fine);
            expect(cornerOf(t)).toEqual({ x: 61.7, y: -28.2 });
        });
    }
});

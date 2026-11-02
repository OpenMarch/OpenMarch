import { describe, expect, it } from "vitest";
import { curveTool, lineTool } from "../lineTool";
import type { LineParams } from "../lineGeometry";
import type { AnyToolKind, ToolEnv } from "../../tool/toolKind";
import {
    finishPoints,
    openTool,
    pointerMove,
    press,
    release,
    removeLastPoint,
    undo,
    type ToolState,
} from "../../tool/toolMachine";
import type { ShapeContext, XY } from "../../types";

/**
 * Taking back the last clicked point (owner, option A on #522): while a line's points are being
 * clicked, each removal takes one off and the preview runs from the point before to the pointer;
 * the first point stays. Points aren't undo steps until the line is finished, so the finished
 * line is still one. Driven through the shape session with the real Line kind.
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

const A = { x: 0, y: 0 };
const B = { x: 40, y: 0 };
const C = { x: 40, y: 40 };
const D = { x: 0, y: 40 };

function click(t: ToolState, at: XY): ToolState {
    t = pointerMove(t, at, env);
    t = press(t, at, env);
    return release(t, ctx, { double: false });
}

function clicking(points: readonly XY[], kind: AnyToolKind = lineTool) {
    let t = openTool(kind, marchers(8));
    for (const p of points) t = click(t, p);
    return t;
}

const clickedPoints = (t: ToolState) =>
    t.gesture?.type === "points" ? t.gesture.points : null;
const pointsOf = (t: ToolState) =>
    (t.params as LineParams).points.map(({ x, y }) => ({ x, y }));

describe("taking back the last clicked point", () => {
    it("takes off the last point, and the preview runs from the one before to the pointer", () => {
        let t = clicking([A, B, C]);
        t = pointerMove(t, { x: 20, y: 60 }, env);
        t = removeLastPoint(t, env);
        expect(clickedPoints(t)).toEqual([A, B]);
        expect(t.gesture?.type).toBe("points");
        // A, B and where the pointer is: C is gone from the preview
        expect(pointsOf(t)).toEqual([A, B, { x: 20, y: 60 }]);
    });

    it("keeps taking points off, one per removal, down to the first", () => {
        let t = clicking([A, B, C, D]);
        t = removeLastPoint(t, env);
        t = removeLastPoint(t, env);
        expect(clickedPoints(t)).toEqual([A, B]);
        t = removeLastPoint(t, env);
        expect(clickedPoints(t)).toEqual([A]);
    });

    it("does nothing more with only the first point left", () => {
        let t = clicking([A, B]);
        t = removeLastPoint(t, env);
        expect(clickedPoints(t)).toEqual([A]);
        const once = t;
        t = removeLastPoint(t, env);
        expect(t).toBe(once);
        // Enter then draws nothing, as with one point clicked
        t = finishPoints(t, ctx);
        expect(t.gesture).toBeNull();
        expect(t.params).toBeNull();
    });

    it("goes on clicking from the point before, and the finished line is one undo step", () => {
        let t = clicking([A, B, { x: 80, y: 80 }]);
        t = removeLastPoint(t, env);
        t = click(t, C);
        t = finishPoints(t, ctx);
        expect(pointsOf(t)).toEqual([A, B, C]);
        expect(t.past).toHaveLength(1);
        expect(undo(t).params).toBeNull();
    });

    it("on the first point, still previews the line closed with one point fewer", () => {
        let t = clicking([A, B, C, D]);
        t = pointerMove(t, A, env);
        expect((t.params as LineParams).closed).toBe(true);
        t = removeLastPoint(t, env);
        expect(clickedPoints(t)).toEqual([A, B, C]);
        expect((t.params as LineParams).closed).toBe(true);
        expect(pointsOf(t)).toEqual([A, B, C]);
        // The closing click closes the triangle
        t = press(t, A, env);
        t = release(t, ctx, { double: false });
        expect(t.gesture).toBeNull();
        expect(pointsOf(t)).toEqual([A, B, C]);
        expect((t.params as LineParams).closed).toBe(true);
    });

    it("stops previewing the line closed when too few points are left to close", () => {
        let t = clicking([A, B, C]);
        t = pointerMove(t, A, env);
        expect((t.params as LineParams).closed).toBe(true);
        t = removeLastPoint(t, env);
        expect((t.params as LineParams).closed).toBeFalsy();
    });

    it("does nothing once the line is finished: a closing click finishes it", () => {
        let t = clicking([A, B, C]);
        t = click(t, A);
        expect(t.gesture).toBeNull();
        expect(removeLastPoint(t, env)).toBe(t);
    });

    it("does nothing while the pointer is down", () => {
        let t = clicking([A, B, C]);
        t = press(t, D, env);
        expect(removeLastPoint(t, env)).toBe(t);
    });

    it("works the same on the Curve", () => {
        let t = clicking([A, B, C], curveTool);
        t = removeLastPoint(t, env);
        expect(clickedPoints(t)).toEqual([A, B]);
        t = finishPoints(t, ctx);
        expect(pointsOf(t)).toEqual([A, B]);
    });
});

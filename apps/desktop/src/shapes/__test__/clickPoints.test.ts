import { describe, expect, it } from "vitest";
import { boxTool } from "../box/boxTool";
import type { ToolEnv } from "../tool/toolKind";
import {
    cancelGesture,
    finishPoints,
    openTool,
    pointerMove,
    press,
    release,
    targetsOf,
    undo,
    type ToolState,
} from "../tool/toolMachine";
import type { ShapeContext, XY } from "../types";
import { polyTool, type PolyParams } from "./fakeRowKind";

/**
 * The host's click-to-add-points draw (#524, spec #522), through the shape session with a fake
 * kind that opts in: a drag still draws two points; clicks add points with a preview; Enter, a
 * double-click or a click on the last point finishes; Escape cancels. A kind that doesn't opt in
 * draws by one drag as before.
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

/** A press and release where it pressed, the pointer moving there first as a hover does */
function click(t: ToolState, at: XY, double = false): ToolState {
    t = pointerMove(t, at, env);
    t = press(t, at, env);
    return release(t, ctx, { double });
}

const pointsOf = (t: ToolState) => (t.params as PolyParams | null)?.points;

describe("drawing by clicking points", () => {
    const open = () => openTool(polyTool, marchers(5));

    it("still draws two points with a drag", () => {
        let t = press(open(), { x: 0, y: 0 }, env);
        t = pointerMove(t, { x: 101, y: 49 }, env);
        t = release(t, ctx, null);
        expect(t.gesture).toBeNull();
        expect(pointsOf(t)).toEqual([
            { x: 0, y: 0 },
            { x: 100, y: 50 },
        ]);
    });

    it("starts a run of points with a click, previewing the next segment at the pointer", () => {
        let t = click(open(), { x: 1, y: 1 });
        expect(t.gesture?.type).toBe("points");
        // One point is no shape yet
        expect(t.params).toBeNull();
        t = pointerMove(t, { x: 49, y: 2 }, env);
        expect(pointsOf(t)).toEqual([
            { x: 0, y: 0 },
            { x: 50, y: 0 },
        ]);
        t = click(t, { x: 49, y: 2 });
        t = pointerMove(t, { x: 51, y: 41 }, env);
        // The preview follows the pointer, landed where a click would put it
        expect(pointsOf(t)).toEqual([
            { x: 0, y: 0 },
            { x: 50, y: 0 },
            { x: 50, y: 40 },
        ]);
        expect(t.gesture?.type).toBe("points");
    });

    const clickedL = () => {
        let t = click(open(), { x: 0, y: 0 });
        t = click(t, { x: 50, y: 0 });
        t = click(t, { x: 50, y: 40 });
        return pointerMove(t, { x: 90, y: 90 }, env);
    };
    const L = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 40 },
    ];

    it("finishes with Enter, the point at the pointer left out, as one undo step", () => {
        const t = finishPoints(clickedL(), ctx);
        expect(t.gesture).toBeNull();
        expect(pointsOf(t)).toEqual(L);
        expect(targetsOf(t, ctx)).toHaveLength(5);
        expect(undo(t).params).toBeNull();
        expect(t.past).toHaveLength(1);
    });

    it("finishes with a click on the last point", () => {
        const t = click(clickedL(), { x: 51, y: 41 });
        expect(t.gesture).toBeNull();
        expect(pointsOf(t)).toEqual(L);
    });

    it("finishes with a double-click, which adds its point once", () => {
        let t = click(open(), { x: 0, y: 0 });
        t = click(t, { x: 50, y: 0 });
        t = click(t, { x: 50, y: 40 });
        t = click(t, { x: 50, y: 40 }, true);
        expect(t.gesture).toBeNull();
        expect(pointsOf(t)).toEqual(L);
    });

    it("cancels with Escape, leaving the shape as it was", () => {
        const t = cancelGesture(clickedL());
        expect(t.gesture).toBeNull();
        expect(t.params).toBeNull();
        expect(t.past).toHaveLength(0);
    });

    it("draws nothing when finished with only one point", () => {
        const t = finishPoints(click(open(), { x: 0, y: 0 }), ctx);
        expect(t.gesture).toBeNull();
        expect(t.params).toBeNull();
        expect(t.past).toHaveLength(0);
    });

    it("replaces the open shape once a clicked line is finished; Escape keeps it", () => {
        let t = press(open(), { x: 0, y: 0 }, env);
        t = pointerMove(t, { x: 100, y: 0 }, env);
        const drawn = release(t, ctx, null);
        let clicked = click(drawn, { x: 0, y: 100 });
        clicked = click(clicked, { x: 50, y: 100 });
        clicked = click(clicked, { x: 50, y: 150 });
        expect(pointsOf(cancelGesture(clicked))).toEqual(pointsOf(drawn));
        const done = finishPoints(clicked, ctx);
        expect(pointsOf(done)).toEqual([
            { x: 0, y: 100 },
            { x: 50, y: 100 },
            { x: 50, y: 150 },
        ]);
        expect(pointsOf(undo(done))).toEqual(pointsOf(drawn));
    });
});

describe("closing by clicking the first point (#529)", () => {
    const open = () => openTool(polyTool, marchers(5));
    const clickedL = () => {
        let t = click(open(), { x: 0, y: 0 });
        t = click(t, { x: 50, y: 0 });
        return click(t, { x: 50, y: 40 });
    };
    const closedOf = (t: ToolState) =>
        (t.params as PolyParams | null)?.closed === true;

    it("previews the closed shape with the pointer on the first point", () => {
        const t = pointerMove(clickedL(), { x: 1, y: -1 }, env);
        expect(closedOf(t)).toBe(true);
        expect(pointsOf(t)).toEqual(L3);
        // Off it, the next point again
        expect(closedOf(pointerMove(t, { x: 20, y: 30 }, env))).toBe(false);
    });

    it("closes and finishes with a click there, as one undo step", () => {
        const t = click(clickedL(), { x: 1, y: -1 });
        expect(t.gesture).toBeNull();
        expect(closedOf(t)).toBe(true);
        expect(pointsOf(t)).toEqual(L3);
        expect(targetsOf(t, ctx)).toHaveLength(5);
        expect(t.past).toHaveLength(1);
        expect(undo(t).params).toBeNull();
    });

    it("adds a point there with only two points: there's nothing to close", () => {
        let t = click(open(), { x: 0, y: 0 });
        t = click(t, { x: 50, y: 0 });
        t = click(t, { x: 0, y: 0 });
        expect(t.gesture?.type).toBe("points");
        expect(closedOf(t)).toBe(false);
    });
});

const L3 = [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 50, y: 40 },
];

describe("a kind drawn by one drag only", () => {
    it("does nothing on a click: the box starts no run of points", () => {
        const t = click(openTool(boxTool, marchers(5)), { x: 0, y: 0 });
        expect(t.gesture).toBeNull();
        expect(t.params).toBeNull();
    });
});

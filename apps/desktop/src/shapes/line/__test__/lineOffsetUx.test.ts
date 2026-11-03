import { describe, expect, it } from "vitest";
import { lineTool } from "../lineTool";
import {
    lineFrame,
    linePivot,
    offsetStart,
    type LineParams,
    type LinePoint,
} from "../lineGeometry";
import { boxTool } from "../../box/boxTool";
import { chipLayout } from "../../editor/chip";
import type { ScrubMove } from "../../editor/scrub";
import { pivotPoint } from "../../frame/frame";
import { pivotOf } from "../../frame/pivot";
import { shapeTargetAt } from "../../frame/gestures";
import type { ToolEnv } from "../../tool/toolKind";
import {
    edit,
    openTool,
    pickPivot,
    pointerMove,
    press,
    pressTarget,
    redo,
    release,
    switchKind,
    undo,
    type ToolState,
} from "../../tool/toolMachine";
import { quarterTurn } from "../../editor/chip";
import { flipShape } from "../../frame/gestures";
import type { ShapeContext, XY } from "../../types";

/**
 * The owner's feedback on Offset (#596): its numbers mean screen directions, ↔ positive to the
 * right and ↕ positive up the screen (toward the back of the field, field y going down); ↕ drags
 * up and down, and either drags or types through 0 to the other side. A new Line's pivot is its
 * leftmost end or point, the front one on an upright line, and the offset reads from there.
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
    pullRadius: 2,
    zoom: 1,
};
const ctx: ShapeContext = { stepPx: STEP, snapPoint: (p) => p };
const marchers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        at: { x: 300 + i * 7, y: 300 },
        drillRank: i,
    }));

function drawn(n: number, from: XY, to: XY): ToolState {
    let t = openTool(lineTool, marchers(n));
    t = press(t, from, env);
    t = pointerMove(t, to, env);
    return release(t, ctx);
}

const paramsOf = (t: ToolState) => t.params as LineParams;
const pointsOf = (t: ToolState) =>
    paramsOf(t).points.map(({ x, y }) => ({ x, y }));
const param = (key: string) => lineTool.params.find((p) => p.key === key)!;
const measured = lineTool.choices!.find((c) => c.key === "measured")!;
const readout = (t: ToolState) =>
    chipLayout(lineTool, t.params, t.spots, env).intervals.map(
        (x) => x.display,
    );
const typed = (t: ToolState, text: string, key: string) =>
    edit(t, param(key).type(t.params, t.spots, text, env), ctx);
const asOffset = (t: ToolState) =>
    edit(t, measured.pick(t.params, t.spots, "offset", env), ctx);
/** A drag of a number from its press, `dx` right and `dy` down the screen in px */
const scrubbed = (t: ToolState, key: string, dx: number, dy: number) => {
    const p = param(key);
    const move = { dx, dy, axis: p.drag, roles: {} } as unknown as ScrubMove;
    return p.scrub(t.params, t.spots, move, env) as LineParams;
};
const shown = (p: LineParams, n: number) =>
    chipLayout(lineTool, p, n, env).intervals.map((x) => x.display);

describe("a new Line's pivot (#596)", () => {
    it("is its left end, whichever way it was drawn", () => {
        const right = drawn(5, { x: 100, y: 100 }, { x: 150, y: 100 });
        expect(paramsOf(right).pivot).toBe("w");
        const left = drawn(5, { x: 150, y: 100 }, { x: 100, y: 100 });
        expect(paramsOf(left).pivot).toBe("e");
        // A diagonal too
        const up = drawn(5, { x: 150, y: 50 }, { x: 100, y: 100 });
        expect(paramsOf(up).pivot).toBe("e");
    });

    it("is the front end, lowest on the screen, on an upright line", () => {
        const down = drawn(5, { x: 100, y: 50 }, { x: 100, y: 150 });
        expect(paramsOf(down).pivot).toBe("e");
        expect(pointsOf(down)[1]).toEqual({ x: 100, y: 150 });
        const up = drawn(5, { x: 100, y: 150 }, { x: 100, y: 50 });
        expect(paramsOf(up).pivot).toBe("w");
    });

    it("is the leftmost point when that's between the ends, and the center on a closed line", () => {
        const corner = (x: number, y: number): LinePoint => ({
            x,
            y,
            tension: 0,
        });
        const bent: LineParams = {
            points: [corner(100, 0), corner(0, 50), corner(100, 100)],
            spacing: { mode: "fit" },
        };
        const pivot = linePivot(bent);
        expect(typeof pivot).toBe("object");
        const at = pivotPoint(lineFrame(bent), pivot);
        expect(at.x).toBeCloseTo(0, 9);
        expect(at.y).toBeCloseTo(50, 9);
        expect(linePivot({ ...bent, closed: true })).toBe("c");
    });

    it("keeps one set by hand, and a box's moved pivot when it becomes a Line", () => {
        let t = drawn(5, { x: 100, y: 100 }, { x: 150, y: 100 });
        t = pickPivot(t, "c", ctx);
        t = typed(t, "2", "interval");
        // Grown from the center, set by hand
        expect(pointsOf(t)).toEqual([
            { x: 85, y: 100 },
            { x: 165, y: 100 },
        ]);
        expect(pivotOf(t.params)).toBe("c");

        // A box with its pivot moved keeps it as a Line
        let box = openTool(boxTool, marchers(6));
        box = press(box, { x: 100, y: 100 }, env);
        box = pointerMove(box, { x: 160, y: 140 }, env);
        box = release(box, ctx);
        const moved = pickPivot(box, "ne", ctx);
        expect(pivotOf(switchKind(moved, lineTool, ctx, env).params)).toBe(
            "ne",
        );
        // One where the box put it (the center) goes to the Line's own start
        const line = switchKind(box, lineTool, ctx, env);
        expect(pivotOf(line.params)).toBe(linePivot(line.params as LineParams));
        // And back: the Line's start doesn't follow it into a box
        expect(pivotOf(switchKind(line, boxTool, ctx, env).params)).toBe("c");
    });

    it("leaves a press on the left end to the end, reaching inside takes the pivot", () => {
        const t = drawn(5, { x: 100, y: 100 }, { x: 150, y: 100 });
        const end = { x: 100, y: 100 };
        expect(
            shapeTargetAt(lineTool, t.params, t.spots, end, env),
        ).toMatchObject({ type: "handle", key: "p0" });
        expect(
            shapeTargetAt(lineTool, t.params, t.spots, end, {
                ...env,
                reachInside: true,
            }),
        ).toMatchObject({ type: "pivot" });
        // A pivot moved onto an end by hand wins over it, as before
        const moved = pickPivot(t, "e", ctx);
        expect(pressTarget(moved, { x: 150, y: 100 }, env)).toMatchObject({
            type: "pivot",
        });
    });

    /** What a plain press, and one reaching inside, on point `index` of the open line takes */
    const pressesOn = (t: ToolState, index: number) => {
        const at = paramsOf(t).points[index]!;
        return [
            pressTarget(t, at, env),
            pressTarget(t, at, { ...env, reachInside: true }),
        ];
    };

    it("leaves the end under it to a plain press after a quarter turn, a flip or the ends crossing (review on #596)", () => {
        const t = drawn(5, { x: 100, y: 100 }, { x: 160, y: 100 });
        // ↻ about the left end: the pivot stays on it, though the line now starts from its front
        const turned = edit(
            t,
            quarterTurn(lineTool, t.params, t.spots, env),
            ctx,
        );
        expect(linePivot(paramsOf(turned))).not.toBe(pivotOf(turned.params));
        expect(pressesOn(turned, 0)).toEqual([
            { type: "handle", key: "p0" },
            { type: "pivot" },
        ]);
        // Flipped side to side about it
        const flipped = edit(
            t,
            flipShape(
                lineTool,
                t.params,
                t.spots,
                "across",
                pivotOf(t.params),
                env,
            ),
            ctx,
        );
        const under = paramsOf(flipped).points.findIndex(
            (q) => q.x === 100 && q.y === 100,
        );
        expect(under).toBeGreaterThanOrEqual(0);
        expect(pressesOn(flipped, under)[0]).toEqual({
            type: "handle",
            key: `p${under}`,
        });
        // The far end dragged past the pivot's end: that end is no longer the leftmost
        const at = paramsOf(t).points[1]!;
        let crossed = press(t, at, env);
        crossed = release(pointerMove(crossed, { x: 60, y: 100 }, env), ctx);
        expect(paramsOf(crossed).points[1]!.x).toBeLessThan(100);
        expect(pressesOn(crossed, 0)[0]).toEqual({
            type: "handle",
            key: "p0",
        });
    });

    it("takes a plain press once it's been moved by hand, and keeps that through undo", () => {
        const t = drawn(5, { x: 100, y: 100 }, { x: 160, y: 100 });
        const end = paramsOf(t).points[0]!;
        // Dragged off and back onto the left end by hand
        let moved = press(t, end, { ...env, reachInside: true });
        expect(moved.gesture?.type).toBe("pivot");
        moved = pointerMove(moved, { x: 130, y: 100 }, env);
        moved = release(moved, ctx);
        expect(moved.pivotMoved).toBe(true);
        moved = pickPivot(moved, pivotOf(t.params), ctx);
        expect(pressTarget(moved, end, env)).toEqual({ type: "pivot" });
        // Undone, the pick goes and the drag stays: still moved by hand
        let back = undo(moved);
        expect(back.pivotMoved).toBe(true);
        expect(pivotOf(back.params)).not.toBe(pivotOf(t.params));
        // Undone again, the line as drawn: the end takes a plain press again
        back = undo(back);
        expect(back.pivotMoved).toBe(false);
        expect(pivotOf(back.params)).toBe(pivotOf(t.params));
        expect(pressTarget(back, end, env)).toEqual({
            type: "handle",
            key: "p0",
        });
        // Redone, moved by hand again, both steps
        let again = redo(back);
        expect(again.pivotMoved).toBe(true);
        again = redo(again);
        expect(again.pivotMoved).toBe(true);
        expect(pivotOf(again.params)).toBe(pivotOf(t.params));
        expect(pressTarget(again, end, env)).toEqual({ type: "pivot" });
        // A placed line, which doesn't keep that, goes by where a Line puts its pivot
        const turned = edit(
            t,
            quarterTurn(lineTool, t.params, t.spots, env),
            ctx,
        );
        expect(
            shapeTargetAt(lineTool, turned.params, turned.spots, end, env),
        ).toEqual({ type: "handle", key: "p0" });
    });

    it("isn't moved by hand when it's let go where it was, and leaves nothing to undo (review on #596)", () => {
        const t = drawn(5, { x: 100, y: 100 }, { x: 160, y: 100 });
        const end = paramsOf(t).points[0]!;
        let jittered = press(t, end, { ...env, reachInside: true });
        expect(jittered.gesture?.type).toBe("pivot");
        // A hand's wobble, and dragged off and back onto the end
        jittered = pointerMove(jittered, { x: 101, y: 100.5 }, env);
        jittered = pointerMove(jittered, { x: 130, y: 100 }, env);
        jittered = pointerMove(jittered, { x: 100.5, y: 99.5 }, env);
        jittered = release(jittered, ctx);
        expect(pivotOf(jittered.params)).toBe(pivotOf(t.params));
        expect(jittered.pivotMoved).toBe(false);
        expect(jittered.past).toHaveLength(t.past.length);
        expect(pressTarget(jittered, end, env)).toEqual({
            type: "handle",
            key: "p0",
        });
    });
});

describe("Offset in screen directions (#596)", () => {
    // 5 marchers on a level line, 1 step apart from its left end
    const level = () =>
        asOffset(drawn(5, { x: 100, y: 100 }, { x: 140, y: 100 }));

    it("drags ↕ up and down and ↔ sideways", () => {
        expect(param("offsetY").drag).toBe("y");
        expect(param("offsetX").drag).toBe("x");
    });

    it("tilts a level line up the screen as ↕ is dragged up, and down through 0 as it's dragged down", () => {
        const t = level();
        expect(readout(t)).toEqual(["1", "0"]);
        // 16 px up is a step more (half a step per 8 px): each next marcher a step toward the back
        const up = scrubbed(t, "offsetY", 0, -16);
        expect(up.offset).toEqual({ x: 10, y: -10 });
        expect(shown(up, t.spots)).toEqual(["1", "1"]);
        // From the left end, which stays put
        expect(up.points[0]).toMatchObject({ x: 100, y: 100 });
        expect(up.points[1]!.y).toBeLessThan(100);
        // Down past where it started: below 0, toward the front
        const down = scrubbed(t, "offsetY", 0, 16);
        expect(down.offset).toEqual({ x: 10, y: 10 });
        expect(shown(down, t.spots)).toEqual(["1", "−1"]);
        expect(down.points[0]).toMatchObject({ x: 100, y: 100 });
        // Sideways does nothing to ↕
        expect(scrubbed(t, "offsetY", 40, 0)).toBe(t.params);
    });

    it("crosses 0 both ways in one drag from either side", () => {
        const tilted = edit(level(), scrubbed(level(), "offsetY", 0, -16), ctx);
        expect(readout(tilted)).toEqual(["1", "1"]);
        // From 1 down 2 steps: −1
        const through = scrubbed(tilted, "offsetY", 0, 32);
        expect(shown(through, tilted.spots)).toEqual(["1", "−1"]);
        const below = edit(tilted, through, ctx);
        // And from −1 up 2 steps: 1
        expect(shown(scrubbed(below, "offsetY", 0, -32), below.spots)).toEqual([
            "1",
            "1",
        ]);
    });

    it("drags ↔ right for more and left through 0", () => {
        const t = level();
        const right = scrubbed(t, "offsetX", 16, 0);
        expect(shown(right, t.spots)).toEqual(["2", "0"]);
        // Left past 0 with ↕ at 0 would be no line: the drag steps over it
        const tilted = edit(t, scrubbed(t, "offsetY", 0, -16), ctx);
        const left = scrubbed(tilted, "offsetX", -32, 0);
        expect(shown(left, tilted.spots)).toEqual(["−1", "1"]);
        expect(left.offset).toEqual({ x: -10, y: -10 });
        // Up and down does nothing to ↔
        expect(scrubbed(t, "offsetX", 0, -40)).toBe(t.params);
        // Both nought: the drag goes on to the next value rather than stopping
        const zero = scrubbed(t, "offsetX", -16, 0);
        expect(shown(zero, t.spots)).toEqual(["−½", "0"]);
    });

    it("types values below 0 with either minus sign, and + or none above", () => {
        let t = level();
        t = typed(t, "-1½", "offsetY");
        expect(paramsOf(t).offset).toEqual({ x: 10, y: 15 });
        expect(readout(t)).toEqual(["1", "−1½"]);
        t = typed(t, "−2", "offsetX");
        expect(paramsOf(t).offset).toEqual({ x: -20, y: 15 });
        expect(readout(t)).toEqual(["−2", "−1½"]);
        t = typed(t, "+1", "offsetY");
        expect(paramsOf(t).offset).toEqual({ x: -20, y: -10 });
        expect(readout(t)).toEqual(["−2", "1"]);
        // Not a number
        expect(param("offsetY").type(t.params, t.spots, "--1", env)).toBeNull();
        expect(param("offsetY").type(t.params, t.spots, "-", env)).toBeNull();
    });

    it("reads from the left end on a line drawn right to left, the same way on screen", () => {
        const t = asOffset(drawn(5, { x: 140, y: 100 }, { x: 100, y: 80 }));
        // Stored first point to last: left and up. Read from the left end: right and down
        expect(offsetStart(paramsOf(t))).toBe("last");
        expect(paramsOf(t).offset).toEqual({ x: -10, y: -5 });
        expect(readout(t)).toEqual(["1", "−½"]);
        // Up the screen tilts it up from the left end, which stays put
        const up = typed(t, "1", "offsetY");
        expect(paramsOf(up).offset).toEqual({ x: -10, y: 10 });
        expect(readout(up)).toEqual(["1", "1"]);
        expect(pointsOf(up)[1]).toEqual(pointsOf(t)[1]);
        expect(pointsOf(up)[0]!.y).toBeLessThan(pointsOf(up)[1]!.y);
    });
});

import { describe, expect, it } from "vitest";
import { curveTool, lineTool } from "../lineTool";
import { isLineParams, lineFrame, type LineParams } from "../lineGeometry";
import { quarterTurn } from "../../editor/chip";
import { DEGREE, rotationDegrees, type ShapeFrame } from "../../frame/frame";
import {
    flipShape,
    frameControls,
    scrubTurn,
    shapeTurn,
    turnShape,
} from "../../frame/gestures";
import { pivotOf, withPivot } from "../../frame/pivot";
import {
    boxesAt,
    type PlacedBox,
    type PlacedRecipe,
} from "../../placed/placedBox";
import { placementOf } from "../../tool/shapePlacement";
import type { ToolEnv } from "../../tool/toolKind";
import {
    edit,
    openTool,
    pointerMove,
    press,
    release,
    type ToolState,
} from "../../tool/toolMachine";
import type { ShapeContext, XY } from "../../types";

/**
 * Turning a Line follows the box's rules (ADR 0006, decision 10): a line reads 0° as drawn,
 * whichever way, and the knob, the degrees, ⟳ and typed degrees step and set its turn from there;
 * square to the field it goes back onto the grid. An end swung round its neighbor goes in the
 * knob's 15° steps counted from level, 1° with fine, and the drag's readout shows the angle.
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
const fine: ToolEnv = { ...env, snap: false, fine: true, gridSnap: (p) => p };
const free: ToolEnv = { ...env, snap: false, pull: false, gridSnap: (p) => p };
const ctx: ShapeContext = { stepPx: STEP, snapPoint: (p) => p };
const marchers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        at: { x: 300 + i * 7, y: 300 },
        drillRank: i,
    }));

function drawn(
    n: number,
    from: XY,
    to: XY,
    kind = lineTool,
    e: ToolEnv = env,
): ToolState {
    let t = openTool(kind, marchers(n));
    t = press(t, from, e);
    t = pointerMove(t, to, e);
    return release(t, ctx);
}

const paramsOf = (t: ToolState) => t.params as LineParams;
const pointsOf = (t: ToolState) =>
    paramsOf(t).points.map(({ x, y }) => ({ x, y }));
/** The editor's turn readout, in degrees */
const degrees = (t: ToolState) =>
    rotationDegrees(shapeTurn(lineTool, t.params, t.spots));
/** Which way the line points from its first point to its last, in degrees */
const direction = (t: ToolState) =>
    rotationDegrees(lineFrame(paramsOf(t)).rotation);
const set = (t: ToolState, params: unknown) => edit(t, params, ctx);
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

/** The knob pressed and turned `by` degrees about the line's pivot, not yet let go */
function knobTurn(t: ToolState, by: number, e: ToolEnv = env): ToolState {
    const { knob } = frameControls(lineTool, t.params, t.spots, e);
    const pressed = press(t, knob, e);
    expect(pressed.gesture?.type).toBe("rotate");
    const gesture = pressed.gesture as { pivot: XY };
    const r = Math.hypot(knob.x - gesture.pivot.x, knob.y - gesture.pivot.y);
    const a = Math.atan2(knob.y - gesture.pivot.y, knob.x - gesture.pivot.x);
    return pointerMove(
        pressed,
        {
            x: gesture.pivot.x + r * Math.cos(a + by * DEGREE),
            y: gesture.pivot.y + r * Math.sin(a + by * DEGREE),
        },
        e,
    );
}

/** A handle pressed and moved to `to`, then let go */
function dragHandle(t: ToolState, key: string, to: XY, e: ToolEnv = env) {
    const at = lineTool
        .handles(t.params as LineParams, t.spots)
        .find((x) => x.key === key)!.at;
    t = press(t, at, e);
    expect(t.gesture?.type).toBe("handle");
    return release(pointerMove(t, to, e), ctx);
}

describe("a drawn line reads 0°", () => {
    it("whichever way it was drawn, dragged or clicked, Line or Curve", () => {
        const right = drawn(5, { x: 100, y: 100 }, { x: 180, y: 100 });
        const left = drawn(5, { x: 180, y: 100 }, { x: 100, y: 100 });
        const slanted = drawn(5, { x: 100, y: 100 }, { x: 180, y: 105 });
        const curve = drawn(
            5,
            { x: 100, y: 100 },
            { x: 180, y: 100 },
            curveTool,
        );
        for (const t of [right, left, slanted, curve]) {
            expect(degrees(t)).toBe(0);
            expect(paramsOf(t).turn).toBeUndefined();
        }
        // The frame still points along the line, as its handles and pivots need
        expect(direction(left)).toBe(180);
        let clicked = openTool(lineTool, marchers(5));
        for (const at of [
            { x: 100, y: 100 },
            { x: 150, y: 80 },
            { x: 200, y: 105 },
        ]) {
            clicked = press(clicked, at, env);
            clicked = release(clicked, ctx);
        }
        expect(degrees(clicked)).toBe(0);
    });

    it("keeps reading its turn while points are edited, not turned", () => {
        const t = drawn(5, { x: 100, y: 100 }, { x: 180, y: 100 });
        const turned = set(t, quarterTurn(lineTool, t.params, t.spots, env));
        expect(degrees(turned)).toBe(90);
        const dragged = dragHandle(turned, "p1", { x: 60, y: 160 });
        expect(pointsOf(dragged)).not.toEqual(pointsOf(turned));
        expect(degrees(dragged)).toBe(90);
        const added = set(
            dragged,
            lineTool.menu!.pick(
                dragged.params,
                dragged.spots,
                "m0",
                "add",
                env,
            )!.params,
        );
        expect(paramsOf(added).points.length).toBe(3);
        expect(degrees(added)).toBe(90);
    });

    it("keeps its turn when moved", () => {
        const t = drawn(5, { x: 100, y: 100 }, { x: 180, y: 100 });
        const turned = set(t, quarterTurn(lineTool, t.params, t.spots, env));
        const moved = set(
            turned,
            lineTool.move(paramsOf(turned), 5, { x: 30, y: 20 }, env),
        );
        expect(degrees(moved)).toBe(90);
    });
});

describe("turning the whole line, as a box turns", () => {
    // Drawn a little off level: 5° from the knob's steps if they counted from the field
    const slanted = () => drawn(5, { x: 100, y: 100 }, { x: 180, y: 107 });

    it("steps the knob in 15° from the drawn 0°, the readout following mid-drag", () => {
        const t = slanted();
        const drawnAt = lineFrame(paramsOf(t)).rotation;
        const moving = knobTurn(t, 20);
        expect(degrees(moving)).toBe(15);
        near(lineFrame(paramsOf(moving)).rotation, drawnAt + 15 * DEGREE);
        const done = release(moving, ctx);
        expect(paramsOf(done).turn).toBe(15);
        expect(isLineParams(paramsOf(done))).toBe(true);
        // Turned on from there, the steps still count from the drawn 0°
        const again = release(knobTurn(done, 50), ctx);
        expect(degrees(again)).toBe(60);
    });

    it("turns the knob in whole degrees with fine, and freely with Snap off", () => {
        expect(degrees(release(knobTurn(slanted(), 20.4, fine), ctx))).toBe(20);
        const t = release(knobTurn(slanted(), 20.4, free), ctx);
        near(paramsOf(t).turn!, 20.4);
    });

    it("scrubs the degrees in 15° steps from the drawn 0°", () => {
        const t = slanted();
        // 1° per 2 px: 22 px is 11°, nearest 15
        const scrubbed = scrubTurn(lineTool, t.params, t.spots, 22, "w", env);
        expect(rotationDegrees(shapeTurn(lineTool, scrubbed, 5))).toBe(15);
        const fined = scrubTurn(lineTool, t.params, t.spots, 22, "w", fine);
        expect(rotationDegrees(shapeTurn(lineTool, fined, 5))).toBe(11);
    });

    it("adds exactly 90° with ⟳, from whatever the turn is", () => {
        const t = slanted();
        const drawnAt = direction(t);
        let turned = set(t, quarterTurn(lineTool, t.params, t.spots, env));
        expect(degrees(turned)).toBe(90);
        expect(direction(turned)).toBeCloseTo(drawnAt + 90, 1);
        for (const expected of [180, 270, 0]) {
            turned = set(
                turned,
                quarterTurn(lineTool, turned.params, turned.spots, env),
            );
            expect(degrees(turned)).toBe(expected);
        }
        // A full turn round stores nothing: it reads as drawn
        expect(paramsOf(turned).turn).toBeUndefined();
        expect(direction(turned)).toBeCloseTo(drawnAt, 1);
    });

    it("sets typed degrees relative to the drawn 0°", () => {
        const t = slanted();
        const drawnAt = direction(t);
        const typed = turnShape(
            lineTool,
            t.params,
            t.spots,
            45 * DEGREE,
            pivotOf(t.params),
            env,
        );
        expect(rotationDegrees(shapeTurn(lineTool, typed, 5))).toBe(45);
        expect(rotationDegrees(lineFrame(typed as LineParams).rotation)).toBe(
            Math.round((drawnAt + 45) * 10) / 10,
        );
    });

    it("turns a closed line by the same rule", () => {
        let t = openTool(lineTool, marchers(8));
        for (const at of [
            { x: 100, y: 100 },
            { x: 160, y: 100 },
            { x: 160, y: 140 },
            { x: 100, y: 140 },
            { x: 100, y: 100 },
        ]) {
            t = press(t, at, env);
            t = release(t, ctx);
        }
        expect(paramsOf(t).closed).toBe(true);
        expect(degrees(t)).toBe(0);
        const turned = release(knobTurn(t, 32), ctx);
        expect(degrees(turned)).toBe(30);
    });

    it("mirrors the turn with a flip", () => {
        const t = slanted();
        const turned = set(
            t,
            turnShape(lineTool, t.params, t.spots, 30 * DEGREE, "w", env),
        );
        const flipped = flipShape(
            lineTool,
            turned.params,
            turned.spots,
            "across",
            "w",
            env,
        );
        expect(rotationDegrees(shapeTurn(lineTool, flipped, 5))).toBe(330);
        // Flipped back, it reads as it did
        const back = flipShape(lineTool, flipped, 5, "across", "w", env);
        expect(rotationDegrees(shapeTurn(lineTool, back, 5))).toBe(30);
    });

    it("keeps the turn a shape had when it's turned into a line", () => {
        const frame: ShapeFrame = {
            center: { x: 100, y: 100 },
            halfWidth: 40,
            halfDepth: 10,
            rotation: 30 * DEGREE,
            flipX: false,
            flipY: false,
        };
        const line = lineTool.fromFrame(frame, 5, env);
        expect(rotationDegrees(shapeTurn(lineTool, line, 5))).toBe(30);
        const square = lineTool.fromFrame({ ...frame, rotation: 0 }, 5, env);
        expect(square.turn).toBeUndefined();
    });
});

describe("square to the field, back on the grid", () => {
    it("puts a level line turned a quarter about its center back on the grid", () => {
        // 1½ steps long: its center is a quarter step off the grid
        let t = drawn(2, { x: 100, y: 100 }, { x: 115, y: 100 });
        t = set(t, withPivot(paramsOf(t), "c"));
        const turned = set(t, quarterTurn(lineTool, t.params, t.spots, env));
        expect(degrees(turned)).toBe(90);
        for (const q of pointsOf(turned)) {
            expect(q.x % half).toBe(0);
            expect(q.y % half).toBe(0);
        }
        expect(Math.abs(pointsOf(turned)[1]!.y - pointsOf(turned)[0]!.y)).toBe(
            15,
        );
    });

    it("keeps its pivot end still and lands the far end on the grid in Fit", () => {
        // Drawn with fine: 8.37 steps long, its far end off the grid
        const t = drawn(
            5,
            { x: 100, y: 100 },
            { x: 183.7, y: 100 },
            lineTool,
            fine,
        );
        expect(pivotOf(t.params)).toBe("w");
        const turned = set(t, quarterTurn(lineTool, t.params, t.spots, env));
        const [a, b] = pointsOf(turned);
        expect(a).toEqual({ x: 100, y: 100 });
        expect(b).toEqual({ x: 100, y: 185 });
    });

    it("doesn't stretch a bent line whose ends happen to be level", () => {
        // A Fit chevron, its ends level: a flip mirrors it and reshapes nothing
        const chevron: LineParams = {
            points: [
                { x: 100, y: 100, tension: 0 },
                { x: 141.3, y: 130, tension: 0 },
                { x: 183.7, y: 100, tension: 0 },
            ],
            spacing: { mode: "fit" },
        };
        const flipped = flipShape(
            lineTool,
            chevron,
            5,
            "across",
            "w",
            env,
        ) as LineParams;
        const [a, mid, b] = flipped.points;
        near(Math.abs(b!.x - a!.x), 83.7);
        near(Math.abs(mid!.x - a!.x), 41.3);
        near(Math.abs(mid!.y - a!.y), 30);
    });

    it("leaves a line turned off square where it turned", () => {
        const t = drawn(5, { x: 100, y: 100 }, { x: 180, y: 100 });
        const turned = turnShape(
            lineTool,
            t.params,
            t.spots,
            15 * DEGREE,
            "w",
            env,
        ) as LineParams;
        near(
            Math.hypot(turned.points[1]!.x - 100, turned.points[1]!.y - 100),
            80,
        );
        near(lineFrame(turned).rotation, 15 * DEGREE);
    });
});

describe("an end swung round its neighbor", () => {
    const locked = () => {
        const t = drawn(5, { x: 100, y: 100 }, { x: 180, y: 100 });
        return set(t, lineTool.lock!.toggle(t.params, t.spots, env));
    };
    const angleOf = (t: ToolState) => {
        const [a, b] = pointsOf(t);
        return rotationDegrees(Math.atan2(b!.y - a!.y, b!.x - a!.x));
    };
    /** The pointer `deg` degrees round from the first point, `r` away */
    const at = (deg: number, r = 80) => ({
        x: 100 + r * Math.cos(deg * DEGREE),
        y: 100 + r * Math.sin(deg * DEGREE),
    });

    it("snaps in 15° steps counted from level, its length kept, when locked", () => {
        const t = dragHandle(locked(), "p1", at(20, 60));
        expect(angleOf(t)).toBe(15);
        const [a, b] = pointsOf(t);
        near(Math.hypot(b!.x - a!.x, b!.y - a!.y), 80);
        // Plumb and level exactly
        expect(pointsOf(dragHandle(locked(), "p1", at(86)))[1]).toEqual({
            x: 100,
            y: 180,
        });
    });

    it("goes in whole degrees with fine, and freely with Snap off", () => {
        expect(angleOf(dragHandle(locked(), "p1", at(20.4), fine))).toBe(20);
        const t = dragHandle(locked(), "p1", at(20.4), free);
        expect(angleOf(t)).toBe(20.4);
    });

    it("snaps the unlocked direction the same way, the interval on whole steps", () => {
        const t = drawn(5, { x: 100, y: 100 }, { x: 180, y: 100 });
        const dragged = dragHandle(t, "p1", at(37, 81));
        expect(angleOf(dragged)).toBe(30);
        const [a, b] = pointsOf(dragged);
        // 4 gaps of 2 steps
        near(Math.hypot(b!.x - a!.x, b!.y - a!.y), 80);
    });

    it("doesn't change the turn readout", () => {
        expect(degrees(dragHandle(locked(), "p1", at(50)))).toBe(0);
    });

    it("shows the angle from its neighbor in the drag's readout", () => {
        const t = dragHandle(locked(), "p1", at(20, 60));
        const p = paramsOf(t);
        expect(lineTool.handleTip!(p, 5, "p1")).toBe("15°");
        expect(lineTool.handleTip!(p, 5, "p0")).toBe("195°");
        // Not on a segment's midpoint, nor a point between the ends
        expect(lineTool.handleTip!(p, 5, "m0")).toBeNull();
    });
});

describe("saved lines", () => {
    function placedBack(t: ToolState): PlacedBox<LineParams> {
        const placement = placementOf(t, ctx)!;
        const recipe: PlacedRecipe = {
            ...placement.recipe,
            id: 1,
            timelineId: 10,
            members: placement.members,
            params: JSON.parse(JSON.stringify(placement.recipe.params)),
        };
        const at = new Map(recipe.members.map((m) => [m.marcherId, m]));
        const [placed] = boxesAt({
            recipes: [recipe],
            endBeatOf: () => 8,
            beat: 8,
            positionOf: (id) => at.get(id),
        }) as PlacedBox<LineParams>[];
        return placed!;
    }

    it("reads a line saved before as 0°, its points as they were", () => {
        const old: LineParams = {
            points: [
                { x: 100, y: 100, tension: 0 },
                { x: 180, y: 170, tension: 0 },
            ],
            spacing: { mode: "fit" },
        };
        expect(isLineParams(old)).toBe(true);
        expect(rotationDegrees(shapeTurn(lineTool, old, 5))).toBe(0);
    });

    it("places a turned line and reads its turn back", () => {
        const t = drawn(5, { x: 100, y: 100 }, { x: 180, y: 107 });
        const turned = set(t, quarterTurn(lineTool, t.params, t.spots, env));
        const placed = placedBack(turned);
        expect(placed.kind).toBe(lineTool);
        expect(placed.params.turn).toBe(90);
        expect(rotationDegrees(shapeTurn(lineTool, placed.params, 5))).toBe(90);
    });

    it("refuses a turn that isn't degrees from 0 up to 360", () => {
        const base = paramsOf(drawn(5, { x: 100, y: 100 }, { x: 180, y: 100 }));
        expect(isLineParams({ ...base, turn: 15 })).toBe(true);
        expect(isLineParams({ ...base, turn: 0 })).toBe(true);
        for (const turn of [-15, 360, 400, "15", Number.NaN, null])
            expect(isLineParams({ ...base, turn })).toBe(false);
    });
});

describe("closing and opening", () => {
    it("keeps the turn", () => {
        let t = openTool(lineTool, marchers(6));
        for (const at of [
            { x: 100, y: 100 },
            { x: 160, y: 100 },
            { x: 160, y: 140 },
            { x: 100, y: 140 },
        ]) {
            t = press(t, at, env);
            t = release(t, ctx);
        }
        t = press(t, { x: 100, y: 140 }, env);
        t = release(t, ctx);
        const turned = set(t, quarterTurn(lineTool, t.params, t.spots, env));
        const ends = lineTool.choices!.find((c) => c.key === "ends")!;
        const closed = set(
            turned,
            ends.pick(turned.params, turned.spots, "closed", env),
        );
        expect(paramsOf(closed).closed).toBe(true);
        expect(degrees(closed)).toBe(90);
        const opened = set(
            closed,
            ends.pick(closed.params, closed.spots, "open", env),
        );
        expect(paramsOf(opened).closed).not.toBe(true);
        expect(degrees(opened)).toBe(90);
    });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type { FieldPointer } from "@/field/editor/fieldEditor";
import type { PointerKind } from "@/field/editor/pointerThresholds";
import { runAction } from "@/shortcuts/registry";
import { setShapeField } from "../field/shapeField";
import { shapeContextFor } from "../field/shapeFieldContext";
import { frameControls, shapeTargetAt } from "../frame/gestures";
import { lineTool } from "../line/lineTool";
import { ShapeToolKeys } from "../tool/ShapeToolKeys";
import {
    closeShapeTool,
    openShapeTool,
    useShapeToolStore,
} from "../tool/shapeToolStore";
import { shapeToolMode } from "../tool/shapeToolMode";
import { toolEnvFor } from "../tool/toolEnv";
import {
    finishPoints,
    openTool,
    pointerMove,
    press,
    release,
    type ToolState,
} from "../tool/toolMachine";
import type { XY } from "../types";

/**
 * The shape tool with a finger or pen (tablet 1.4): handles reach as far as the pointer's kind
 * does, while the knob stays drawn where a mouse's reach puts it; a press lost to a second finger
 * keeps the points already tapped; and Discard, the touch layout's Escape, throws the shape away.
 */

const fieldProperties =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const STEP = fieldProperties.pixelsPerStep;
const shapeField = {
    fieldProperties: () => fieldProperties,
    zoom: () => 1,
    marchers: () => [],
    drawn: () => new Map(),
};
const field = () => ({
    fieldProperties,
    zoom: () => 1,
    marchers: () => [],
    drawn: () => new Map(),
});
const marchers = Array.from({ length: 5 }, (_, i) => ({
    id: i + 1,
    at: { x: 300 + i * 7, y: 300 },
    drillRank: i,
}));
const A = { x: 30 * STEP, y: 20 * STEP };
const B = { x: 38 * STEP, y: 20 * STEP };
const C = { x: 38 * STEP, y: 26 * STEP };
const D = { x: 30 * STEP, y: 26 * STEP };

beforeEach(() => setShapeField(shapeField));

afterEach(() => {
    cleanup();
    closeShapeTool();
    setShapeField(null);
});

function click(t: ToolState, at: XY): ToolState {
    const env = toolEnvFor(field());
    t = pointerMove(t, at, env);
    t = press(t, at, env);
    return release(t, shapeContextFor(field()), { double: false });
}

/** A Line with A, B and C clicked, still being drawn */
function clicking(): ToolState {
    let t = openTool(lineTool, marchers);
    for (const p of [A, B, C]) t = click(t, p);
    return t;
}

const pointer = (at: XY, kind: PointerKind): FieldPointer => ({
    field: at,
    screen: at,
    button: 0,
    kind,
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
});
const modePress = { reachesInside: () => false, isMac: false };

const tool = () => useShapeToolStore.getState().tool;
const clickedPoints = () => {
    const g = tool()?.gesture;
    return g?.type === "points" ? g.points : null;
};

describe("the shape tool's reach by pointer kind", () => {
    it("reaches a handle from 22 screen px with a finger, 14 with a pen, 10 with a mouse", () => {
        const env = (kind: PointerKind) =>
            toolEnvFor(field(), undefined, { kind });
        expect(env("mouse").hitRadius).toBe(10);
        expect(env("pen").hitRadius).toBe(14);
        expect(env("touch").hitRadius).toBe(22);
        // The knob's stem is a mouse's, whatever presses
        for (const kind of ["mouse", "pen", "touch"] as const)
            expect(env(kind).stemUnit).toBe(10);
    });

    it("takes a line's point with a finger 18 px off, where a mouse misses it", () => {
        const done = finishPoints(clicking(), shapeContextFor(field()));
        const n = done.marchers.length;
        const off = { x: B.x + 13, y: B.y - 13 };
        const targetFor = (kind: PointerKind) =>
            shapeTargetAt(
                lineTool,
                done.params,
                n,
                off,
                toolEnvFor(field(), undefined, { kind }),
            );
        expect(targetFor("touch")).toEqual({ type: "handle", key: "p1" });
        expect(targetFor("mouse")).not.toEqual({ type: "handle", key: "p1" });
    });

    it("draws the knob where a mouse's reach puts it, for a finger too", () => {
        const done = finishPoints(clicking(), shapeContextFor(field()));
        const n = done.marchers.length;
        const knobFor = (kind: PointerKind) =>
            frameControls(
                lineTool,
                done.params,
                n,
                toolEnvFor(field(), undefined, { kind }),
            ).knob;
        expect(knobFor("touch")).toEqual(knobFor("mouse"));
    });
});

describe("tapping a line's points", () => {
    it("keeps the points already down when a press is lost (a second finger lands to pan)", () => {
        openShapeTool(clicking(), null, null);
        act(() => {
            shapeToolMode.press(pointer(D, "touch"), modePress);
        });
        expect(tool()?.gesture).toMatchObject({
            type: "points",
            pressed: true,
        });
        act(() => {
            shapeToolMode.cancel();
        });
        expect(tool()?.gesture).toMatchObject({
            type: "points",
            pressed: false,
        });
        expect(clickedPoints()).toHaveLength(3);
        // Tapping goes on from there
        act(() => {
            shapeToolMode.press(pointer(D, "touch"), modePress);
            shapeToolMode.release(pointer(D, "touch"), {
                double: false,
                ownFirst: false,
            });
        });
        expect(clickedPoints()).toHaveLength(4);
    });

    it("goes back to before a drag that's lost, as Escape does", () => {
        openShapeTool(openTool(lineTool, marchers), null, null);
        act(() => {
            shapeToolMode.press(pointer(A, "touch"), modePress);
            shapeToolMode.move(pointer(B, "touch"));
        });
        expect(tool()?.gesture?.type).toBe("draw");
        act(() => {
            shapeToolMode.cancel();
        });
        expect(tool()?.gesture).toBeNull();
        expect(tool()?.params).toBeNull();
    });
});

describe("Discard (the touch layout's Escape)", () => {
    it("drops the points being tapped, and the tool stays armed", () => {
        openShapeTool(clicking(), null, null);
        renderHook(() => ShapeToolKeys());
        act(() => void runAction("shapeDiscard"));
        expect(tool()).not.toBeNull();
        expect(tool()?.gesture).toBeNull();
        expect(tool()?.params).toBeNull();
    });

    it("closes the tool with a shape drawn, placing nothing, even with a point selected", () => {
        const done = finishPoints(clicking(), shapeContextFor(field()));
        openShapeTool({ ...done, selected: "p1" }, null, null);
        renderHook(() => ShapeToolKeys());
        act(() => void runAction("shapeDiscard"));
        expect(tool()).toBeNull();
    });

    it("finishes and takes back points through the keys' own actions", () => {
        openShapeTool(clicking(), null, null);
        renderHook(() => ShapeToolKeys());
        act(() => void runAction("shapeRemoveLastPoint"));
        expect(clickedPoints()).toHaveLength(2);
        act(() => void runAction("applyShape"));
        expect(tool()?.gesture).toBeNull();
        expect(tool()?.params).not.toBeNull();
    });
});

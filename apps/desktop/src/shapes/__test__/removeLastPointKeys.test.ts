import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type { FieldPointer } from "@/field/editor/fieldEditor";
import { registerActionHandler, runAction } from "@/shortcuts/registry";
import { setShapeField } from "../field/shapeField";
import { shapeContextFor } from "../field/shapeFieldContext";
import { useHandleMenuStore, closeHandleMenu } from "../field/handleMenu";
import { lineTool } from "../line/lineTool";
import type { LineParams } from "../line/lineGeometry";
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
 * Taking back the last point while clicking a line's points (owner, option A on #522): a
 * right-click (a Mac's Ctrl-click and a long press reach the same `openMenu`), Backspace or Delete
 * (`shapeRemoveLastPoint`), and undo. The key is the tool's only while clicking, so it does
 * nothing else then and nothing at all otherwise; a right-click on a finished line still opens
 * the handle menu (#569).
 */

const fieldProperties =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const STEP = fieldProperties.pixelsPerStep;
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

let undoShow: ReturnType<typeof vi.fn>;
let unregisterUndo: () => void;

beforeEach(() => {
    setShapeField({
        fieldProperties: () => fieldProperties,
        zoom: () => 1,
        marchers: () => [],
        drawn: () => new Map(),
    });
    // Stands in for the show's undo, which mounts before the tool's keys
    undoShow = vi.fn();
    unregisterUndo = registerActionHandler("performUndo", {
        run: undoShow,
        isEnabled: () => true,
    });
});

afterEach(() => {
    cleanup();
    unregisterUndo();
    closeHandleMenu();
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
    landed = t.gesture?.type === "points" ? t.gesture.points : [];
    expect(landed).toHaveLength(3);
    return t;
}

const tool = () => useShapeToolStore.getState().tool!;
const clickedPoints = () => {
    const g = tool().gesture;
    return g?.type === "points" ? g.points : null;
};
/** A, B and C as they landed when clicked */
let landed: readonly XY[] = [];
const first = (count: number) => landed.slice(0, count);
const rightClick = (at: XY): FieldPointer => ({
    field: at,
    screen: at,
    button: 2,
    kind: "mouse",
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
});

describe("taking back the last clicked point", () => {
    it("Backspace and Delete take one point back each, and leave the first", () => {
        openShapeTool(clicking(), null, null);
        renderHook(() => ShapeToolKeys());
        act(() => void runAction("shapeRemoveLastPoint"));
        expect(clickedPoints()).toEqual(first(2));
        act(() => void runAction("shapeRemoveLastPoint"));
        expect(clickedPoints()).toEqual(first(1));
        // The first point stays: Escape cancels the drawing
        expect(runAction("shapeRemoveLastPoint")).toBe(true);
        expect(clickedPoints()).toEqual(first(1));
    });

    it("undo takes a point back while clicking, not the show's or the shape's undo", () => {
        openShapeTool(clicking(), null, null);
        renderHook(() => ShapeToolKeys());
        act(() => void runAction("performUndo"));
        expect(clickedPoints()).toEqual(first(2));
        act(() => void runAction("performUndo"));
        act(() => void runAction("performUndo"));
        expect(clickedPoints()).toEqual(first(1));
        expect(tool().gesture?.type).toBe("points");
        expect(undoShow).not.toHaveBeenCalled();
    });

    it("a right-click takes a point back, and opens no menu", () => {
        openShapeTool(clicking(), null, null);
        let used = false;
        act(() => {
            used = shapeToolMode.openMenu!(rightClick(landed[1]!));
        });
        expect(used).toBe(true);
        expect(clickedPoints()).toEqual(first(2));
        expect(useHandleMenuStore.getState().menu).toBeNull();
    });

    it("leaves Backspace alone when no points are being clicked", () => {
        const done = finishPoints(clicking(), shapeContextFor(field()));
        openShapeTool(done, null, null);
        renderHook(() => ShapeToolKeys());
        expect(runAction("shapeRemoveLastPoint")).toBe(false);
        expect((tool().params as LineParams).points).toHaveLength(3);
    });

    it("a right-click on a finished line's point still opens its menu", () => {
        const done = finishPoints(clicking(), shapeContextFor(field()));
        openShapeTool(done, null, null);
        let used = false;
        act(() => {
            used = shapeToolMode.openMenu!(rightClick(landed[1]!));
        });
        expect(used).toBe(true);
        expect(useHandleMenuStore.getState().menu?.key).toBe("p1");
        expect((tool().params as LineParams).points).toHaveLength(3);
    });

    it("undo on a finished line steps back through the shape's own history", () => {
        const done = finishPoints(clicking(), shapeContextFor(field()));
        openShapeTool(done, null, null);
        renderHook(() => ShapeToolKeys());
        act(() => void runAction("performUndo"));
        expect(tool().params).toBeNull();
    });
});

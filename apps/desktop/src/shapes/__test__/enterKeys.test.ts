import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { registerActionHandler, runAction } from "@/shortcuts/registry";
import { setShapeField } from "../field/shapeField";
import { shapeContextFor } from "../field/shapeFieldContext";
import { ShapeToolKeys } from "../tool/ShapeToolKeys";
import {
    closeShapeTool,
    openShapeTool,
    useShapeToolStore,
} from "../tool/shapeToolStore";
import { toolEnvFor } from "../tool/toolEnv";
import {
    openTool,
    pointerMove,
    press,
    release,
    type ToolState,
} from "../tool/toolMachine";
import type { XY } from "../types";
import { polyTool, rowTool } from "./fakeRowKind";

/**
 * Enter with the shape tool open (#524): while a line's points are being clicked it finishes the
 * line; otherwise it falls through to Place, for every kind. The tool's keys sit on top of Place,
 * and a handler on top that can't run doesn't let the key through, so finishing points must only
 * be there while clicking.
 */

const fieldProperties =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const STEP = fieldProperties.pixelsPerStep;
const FROM = { x: 30 * STEP + 1, y: 20 * STEP + 1 };
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

let place: ReturnType<typeof vi.fn>;
let unregisterPlace: () => void;

beforeEach(() => {
    setShapeField({
        fieldProperties: () => fieldProperties,
        zoom: () => 1,
        marchers: () => [],
        drawn: () => new Map(),
    });
    // Stands in for Place (`useShapeToolActions`), which mounts before the tool's keys
    place = vi.fn();
    unregisterPlace = registerActionHandler("applyShape", {
        run: place,
        isEnabled: () => true,
    });
});

afterEach(() => {
    cleanup();
    unregisterPlace();
    closeShapeTool();
    setShapeField(null);
});

function click(t: ToolState, at: XY): ToolState {
    const env = toolEnvFor(field());
    t = pointerMove(t, at, env);
    t = press(t, at, env);
    return release(t, shapeContextFor(field()), { double: false });
}

describe("Enter with the shape tool open", () => {
    it("places a drawn shape that isn't clicking points", () => {
        const env = toolEnvFor(field());
        let t = openTool(rowTool, marchers);
        t = press(t, FROM, env);
        t = pointerMove(t, { x: FROM.x + 8 * STEP, y: FROM.y }, env);
        t = release(t, shapeContextFor(field()));
        openShapeTool(t, null, null);
        renderHook(() => ShapeToolKeys());
        expect(runAction("applyShape")).toBe(true);
        expect(place).toHaveBeenCalledTimes(1);
    });

    it("places a finished line", () => {
        let t = click(openTool(polyTool, marchers), FROM);
        t = click(t, { x: FROM.x + 8 * STEP, y: FROM.y });
        openShapeTool(t, null, null);
        renderHook(() => ShapeToolKeys());
        // The first Enter finishes the points, the second places the line
        act(() => void runAction("applyShape"));
        expect(place).not.toHaveBeenCalled();
        expect(useShapeToolStore.getState().tool?.gesture).toBeNull();
        act(() => void runAction("applyShape"));
        expect(place).toHaveBeenCalledTimes(1);
    });
});

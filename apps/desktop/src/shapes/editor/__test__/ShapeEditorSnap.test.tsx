import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { boxTool } from "../../box/boxTool";
import { setShapeField } from "../../field/shapeField";
import { shapeContextFor } from "../../field/shapeFieldContext";
import { closeShapeTool, openShapeTool } from "../../tool/shapeToolStore";
import { toolEnvFor } from "../../tool/toolEnv";
import { openTool, pointerMove, press, release } from "../../tool/toolMachine";
import { ShapeEditor } from "../ShapeEditorBar";

/**
 * The floating editor of an open shape carries the Snap toggle's button (modifier roles, version
 * A), so a forgotten off state shows wherever a shape is edited.
 */

const fieldProperties =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const STEP = fieldProperties.pixelsPerStep;
const field = {
    fieldProperties: () => fieldProperties,
    zoom: () => 1,
    marchers: () => [],
    drawn: () => new Map(),
};
const marchers = Array.from({ length: 8 }, (_, i) => ({
    id: i + 1,
    at: { x: 300 + i * 7, y: 300 },
    drillRank: i,
}));

beforeEach(() => {
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
    setShapeField(field);
    const ctx = { ...field, fieldProperties };
    const env = toolEnvFor(ctx);
    let tool = openTool(boxTool, marchers);
    tool = press(tool, { x: 30 * STEP, y: 20 * STEP }, env);
    tool = pointerMove(tool, { x: 34 * STEP, y: 22 * STEP }, env);
    tool = release(tool, shapeContextFor(ctx));
    openShapeTool(tool, null, null);
});

afterEach(() => {
    cleanup();
    closeShapeTool();
    setShapeField(null);
    act(() => {
        useUiSettingsStore.getState().setSnap(true);
    });
    localStorage.clear();
    vi.unstubAllGlobals();
});

describe("an open shape's floating editor", () => {
    it("has the Snap button, which turns snapping off and on", () => {
        render(
            <QueryClientProvider client={new QueryClient()}>
                <ShapeEditor stepPx={STEP} />
            </QueryClientProvider>,
        );
        const bar = screen.getByTestId("shape-tool-readout");
        const button = screen.getByTestId("shape-editor-snap");
        expect(bar.contains(button)).toBe(true);
        expect(button.getAttribute("aria-pressed")).toBe("false");

        fireEvent.click(button);
        expect(useUiSettingsStore.getState().uiSettings.snap).toBe(false);
        expect(button.getAttribute("aria-pressed")).toBe("true");

        fireEvent.click(button);
        expect(useUiSettingsStore.getState().uiSettings.snap).toBe(true);
    });
});

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
import { pressAction } from "@/shortcuts/registry";
import { boxTool } from "../../box/boxTool";
import { circleTool } from "../../circle/circleTool";
import { lineTool } from "../../line/lineTool";
import {
    HIDE_MARCHERS_TAP_MS,
    isHiding,
    SHOWN,
    useMarchersHiddenStore,
} from "../../field/marchersHidden";
import { setShapeField } from "../../field/shapeField";
import { shapeContextFor } from "../../field/shapeFieldContext";
import {
    closeShapeTool,
    openShapeTool,
    useShapeToolStore,
} from "../../tool/shapeToolStore";
import { toolEnvFor } from "../../tool/toolEnv";
import type { AnyToolKind } from "../../tool/toolKind";
import { openTool, pointerMove, press, release } from "../../tool/toolMachine";
import { ShapeEditor } from "../ShapeEditorBar";

/**
 * The shape on its own (#558), through the editor of an open Box, Circle and Line: H held hides
 * the marchers until it's let go, a tap latches, and the eye button shows and turns the same
 * state. The shape itself, its history and who goes where don't change.
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

/** Draws `kind` by dragging, and opens it as the open shape */
function openDrawn(kind: AnyToolKind) {
    const ctx = { ...field, fieldProperties };
    const env = toolEnvFor(ctx);
    let tool = openTool(kind, marchers);
    tool = press(tool, { x: 30 * STEP, y: 20 * STEP }, env);
    tool = pointerMove(tool, { x: 38 * STEP, y: 24 * STEP }, env);
    tool = release(tool, shapeContextFor(ctx));
    openShapeTool(tool, null, null);
}

const hiding = () => isHiding(useMarchersHiddenStore.getState());

let now = 1000;

beforeEach(() => {
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
    vi.spyOn(Date, "now").mockImplementation(() => now);
    setShapeField(field);
});

afterEach(() => {
    cleanup();
    closeShapeTool();
    setShapeField(null);
    useMarchersHiddenStore.setState(SHOWN, true);
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

const renderEditor = () =>
    render(
        <QueryClientProvider client={new QueryClient()}>
            <ShapeEditor stepPx={STEP} />
        </QueryClientProvider>,
    );

describe.each([
    ["Box", boxTool],
    ["Circle", circleTool],
    ["Line", lineTool],
] as const)("an open %s's editor", (_name, kind) => {
    it("starts with the marchers shown, and H held hides them until let go", () => {
        openDrawn(kind);
        renderEditor();
        const tool = useShapeToolStore.getState().tool;
        expect(tool?.params).not.toBeNull();
        const eye = screen.getByTestId("shape-editor-hide-marchers");
        expect(eye.getAttribute("aria-pressed")).toBe("false");

        let letGo: ReturnType<typeof pressAction> = null;
        act(() => {
            letGo = pressAction("shapeHideMarchers");
        });
        expect(hiding()).toBe(true);
        expect(eye.getAttribute("aria-pressed")).toBe("true");
        now += HIDE_MARCHERS_TAP_MS + 100;
        act(() => {
            letGo?.("keyup");
        });
        expect(hiding()).toBe(false);
        expect(eye.getAttribute("aria-pressed")).toBe("false");

        // Drawing only: the same shape, the same history
        expect(useShapeToolStore.getState().tool).toBe(tool);
    });

    it("latches on a tap of H, and the eye button shows it and turns it back", () => {
        openDrawn(kind);
        renderEditor();
        const tool = useShapeToolStore.getState().tool;
        const eye = screen.getByTestId("shape-editor-hide-marchers");

        act(() => {
            const letGo = pressAction("shapeHideMarchers");
            now += 80;
            letGo?.("keyup");
        });
        expect(hiding()).toBe(true);
        expect(eye.getAttribute("aria-pressed")).toBe("true");

        fireEvent.click(eye);
        expect(hiding()).toBe(false);
        fireEvent.click(eye);
        expect(hiding()).toBe(true);

        expect(useShapeToolStore.getState().tool).toBe(tool);
    });
});

describe("the editor going while H is held", () => {
    it("lets go of the key, so the marchers don't stay hidden", () => {
        openDrawn(boxTool);
        const { unmount } = renderEditor();
        act(() => void pressAction("shapeHideMarchers"));
        expect(hiding()).toBe(true);
        unmount();
        expect(hiding()).toBe(false);
    });
});

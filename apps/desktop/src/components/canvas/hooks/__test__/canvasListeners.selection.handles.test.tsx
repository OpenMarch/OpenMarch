import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fabric } from "fabric";
import type { ShapeRow } from "@openmarch/core";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";
import TimelineShapeOverlay, {
    isTimelineShapeHandle,
} from "@/global/classes/canvasObjects/TimelineShapeOverlay";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type Marcher from "@/global/classes/Marcher";
import { defaultSettings } from "@/stores/UiSettingsStore";
import { useSelectionListeners } from "../canvasListeners.selection";

/**
 * P7.11: the canvas's selection listeners treat timeline shape handles as transparent. Pressing a
 * handle while marchers are selected starts the handle's drag and leaves the marchers selected,
 * and a rubber band never picks a handle up. Driven with real fabric mouse events.
 */

const MARCHER = {
    id: 1,
    name: "A",
    section: "Trumpet",
    drill_prefix: "T",
    drill_order: 1,
    drill_number: "T1",
    year: null,
    notes: null,
    created_at: "",
    updated_at: "",
} as unknown as Marcher;

const mocks = vi.hoisted(() => ({
    selected: [] as unknown[],
    setSelected: vi.fn(),
}));

vi.mock("@/context/SelectedMarchersContext", () => ({
    useSelectedMarchers: () => ({
        selectedMarchers: mocks.selected,
        setSelectedMarchers: mocks.setSelected,
    }),
}));
vi.mock("@/context/SelectedPageContext", () => ({
    useSelectedPage: () => ({ selectedPage: null }),
}));

const BOX: ShapeRow = {
    kind: "box",
    geometry: { origin: [100, 100], width: 80, height: 40 },
};

const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
        {children}
    </QueryClientProvider>
);

/** A mouse event at scene point (x, y), through the canvas's viewport transform. */
const mouse = (
    canvas: fabric.Canvas,
    type: string,
    x: number,
    y: number,
    extra: MouseEventInit = {},
) => {
    const p = fabric.util.transformPoint(
        new fabric.Point(x, y),
        canvas.viewportTransform!,
    );
    return new MouseEvent(type, {
        clientX: p.x,
        clientY: p.y,
        button: 0,
        bubbles: true,
        ...extra,
    });
};

type Internals = {
    __onMouseDown: (e: MouseEvent) => void;
    __onMouseMove: (e: MouseEvent) => void;
    __onMouseUp: (e: MouseEvent) => void;
};

/** Presses at `from`, moves in steps to `to`, and releases there, as fabric sees a mouse. */
const press = (
    canvas: OpenMarchCanvas,
    from: [number, number],
    to: [number, number],
    extra: MouseEventInit = {},
) => {
    const c = canvas as unknown as Internals;
    act(() => {
        c.__onMouseDown(mouse(canvas, "mousedown", ...from, extra));
        for (let i = 1; i <= 4; i++)
            c.__onMouseMove(
                mouse(
                    canvas,
                    "mousemove",
                    from[0] + ((to[0] - from[0]) * i) / 4,
                    from[1] + ((to[1] - from[1]) * i) / 4,
                    extra,
                ),
            );
        c.__onMouseUp(mouse(canvas, "mouseup", ...to, extra));
    });
};

const setUp = () => {
    const canvas = new OpenMarchCanvas({
        canvasRef: null,
        fieldProperties:
            FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES,
        uiSettings: defaultSettings,
    });
    const marcher = new CanvasMarcher({
        marcher: MARCHER,
        coordinate: { x: 300, y: 300 },
    });
    canvas.add(marcher);
    mocks.selected = [MARCHER];
    renderHook(() => useSelectionListeners({ canvas }), { wrapper });
    const onCommit = vi.fn();
    const overlay = new TimelineShapeOverlay(
        canvas,
        { shape: "red", handleFill: "white" },
        onCommit,
    );
    overlay.show(BOX, true);
    return { canvas, marcher, overlay, onCommit };
};

beforeEach(() => {
    mocks.setSelected.mockReset();
});
afterEach(() => {
    mocks.selected = [];
});

describe("timeline shape handles and the selection listeners", () => {
    it("the selected marcher is active before the drag", () => {
        const { canvas, marcher } = setUp();
        expect(canvas.getActiveObjects()).toEqual([marcher]);
    });

    it("the first press on a handle drags it, commits once and keeps the marchers selected", () => {
        const { canvas, overlay, onCommit } = setUp();
        const corner = overlay.handleObjects[1]!;
        const at: [number, number] = [
            corner.left! - TimelineShapeOverlay.gridOffset,
            corner.top! - TimelineShapeOverlay.gridOffset,
        ];
        expect(at).toEqual([180, 140]);
        press(canvas, at, [220, 160]);
        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit).toHaveBeenCalledWith({
            kind: "box",
            geometry: { origin: [100, 100], width: 120, height: 60 },
        });
        expect(mocks.setSelected).not.toHaveBeenCalled();
    });

    it("a rubber band over handles and a marcher selects only the marcher", () => {
        const { canvas, marcher } = setUp();
        canvas.discardActiveObject();
        mocks.setSelected.mockReset();
        press(canvas, [50, 50], [400, 400]);
        const active = canvas.getActiveObjects();
        expect(active.some(isTimelineShapeHandle)).toBe(false);
        expect(active).toContain(marcher);
    });
});

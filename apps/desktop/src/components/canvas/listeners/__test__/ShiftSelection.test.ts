import { afterEach, describe, expect, it } from "vitest";
import { fabric } from "fabric";
import { generateMarchers } from "@/__mocks__/generators";
import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { defaultSettings } from "@/stores/UiSettingsStore";
import DefaultListeners from "../DefaultListeners";

const setUp = () => {
    const canvas = new OpenMarchCanvas({
        canvasRef: null,
        fieldProperties:
            FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES,
        uiSettings: defaultSettings,
    });
    canvas.setListeners(new DefaultListeners({ canvas }));
    const marchers = generateMarchers({ numberOfMarchers: 3, seed: 1 }).map(
        (marcher, i) => {
            const canvasMarcher = new CanvasMarcher({
                marcher,
                coordinate: { x: 40 + i * 80, y: 40 },
            });
            canvas.add(canvasMarcher);
            return canvasMarcher;
        },
    );
    return { canvas, marchers };
};

const fire = (
    canvas: OpenMarchCanvas,
    type: "mousedown" | "mousemove" | "mouseup",
    { x, y }: { x: number; y: number },
    shiftKey = true,
) => {
    const target = type === "mousedown" ? canvas.upperCanvasEl : document;
    target.dispatchEvent(
        new MouseEvent(type, {
            clientX: x,
            clientY: y,
            shiftKey,
            button: 0,
            bubbles: true,
        }),
    );
};

const selectedIds = (canvas: OpenMarchCanvas) =>
    canvas
        .getActiveObjects()
        .map((obj) => (obj as CanvasMarcher).marcherObj.id)
        .sort();

describe("Shift selection", () => {
    let canvas: OpenMarchCanvas | undefined;
    afterEach(() => {
        canvas?.dispose();
        canvas = undefined;
    });

    it("keeps the selection when a Shift-click lands on empty field", () => {
        const setup = setUp();
        canvas = setup.canvas;
        const [a, b] = setup.marchers;
        canvas.setActiveObject(new fabric.ActiveSelection([a, b], { canvas }));

        fire(canvas, "mousedown", { x: 120, y: 120 });
        fire(canvas, "mouseup", { x: 120, y: 120 });

        expect(selectedIds(canvas)).toEqual(
            [a.marcherObj.id, b.marcherObj.id].sort(),
        );
    });

    it("adds lassoed marchers to the existing selection", () => {
        const setup = setUp();
        canvas = setup.canvas;
        const [a, b, c] = setup.marchers;
        canvas.setActiveObject(new fabric.ActiveSelection([a, b], { canvas }));

        // Draw a closed lasso around the third marcher only
        const lasso = [
            { x: 180, y: 10 },
            { x: 240, y: 10 },
            { x: 240, y: 80 },
            { x: 180, y: 80 },
            { x: 182, y: 12 },
        ];
        fire(canvas, "mousedown", lasso[0]);
        lasso.slice(1).forEach((p) => fire(canvas!, "mousemove", p));
        fire(canvas, "mouseup", lasso[lasso.length - 1]);

        expect(selectedIds(canvas)).toEqual(
            [a.marcherObj.id, b.marcherObj.id, c.marcherObj.id].sort(),
        );
    });

    it("restores every object's interaction after a lasso that is not closed", () => {
        const setup = setUp();
        canvas = setup.canvas;
        const shapeHandle = new fabric.Rect({
            left: 260,
            top: 100,
            width: 10,
            height: 10,
            selectable: true,
            evented: true,
        });
        const decoration = new fabric.Rect({
            left: 10,
            top: 130,
            width: 10,
            height: 10,
            selectable: false,
            evented: false,
        });
        canvas.add(shapeHandle, decoration);

        fire(canvas, "mousedown", { x: 120, y: 120 });
        fire(canvas, "mousemove", { x: 200, y: 140 });
        fire(canvas, "mouseup", { x: 200, y: 140 });

        expect(shapeHandle.evented).toBe(true);
        expect(shapeHandle.selectable).toBe(true);
        expect(decoration.evented).toBe(false);
        expect(decoration.selectable).toBe(false);
        expect(setup.marchers.every((m) => m.evented)).toBe(true);
    });

    it("ends a lasso that is interrupted by a mode change", () => {
        const setup = setUp();
        canvas = setup.canvas;

        fire(canvas, "mousedown", { x: 120, y: 120 });
        fire(canvas, "mousemove", { x: 200, y: 140 });
        // e.g. pressing L for Create Line before releasing the mouse
        canvas.setListeners(new DefaultListeners({ canvas }));

        expect(canvas.defaultCursor).toBe("default");
        expect(setup.marchers.every((m) => m.evented && m.selectable)).toBe(
            true,
        );
    });
});

import { describe, expect, it } from "vitest";
import { fabric } from "fabric";
import { generateMarchers } from "@/__mocks__/generators";
import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { defaultSettings } from "@/stores/UiSettingsStore";
import DefaultListeners from "../DefaultListeners";
import LineListeners from "../LineListeners";

const createCanvasWithMarchers = () => {
    const canvas = new OpenMarchCanvas({
        canvasRef: null,
        fieldProperties:
            FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES,
        uiSettings: defaultSettings,
    });
    generateMarchers({ numberOfMarchers: 3, seed: 1 }).forEach((marcher, i) => {
        canvas.add(
            new CanvasMarcher({
                marcher,
                coordinate: { x: 100 + i * 20, y: 100 },
            }),
        );
    });
    return canvas;
};

describe("LineListeners", () => {
    it("restores marcher interaction and the cursor when line creation is cancelled", () => {
        const canvas = createCanvasWithMarchers();
        canvas.setListeners(new LineListeners({ canvas }));
        expect(canvas.getCanvasMarchers().every((m) => !m.selectable)).toBe(
            true,
        );

        // Cancelling swaps back to the default listeners without finishing a line
        canvas.setListeners(new DefaultListeners({ canvas }));

        for (const marcher of canvas.getCanvasMarchers()) {
            expect(marcher.selectable).toBe(true);
            expect(marcher.evented).toBe(true);
        }
        expect(canvas.staticGridRef.hoverCursor).toBe("default");
        canvas.dispose();
    });

    it("ends a Ctrl+Shift lasso started in line mode when the mode changes", () => {
        const canvas = createCanvasWithMarchers();
        const shapeHandle = new fabric.Rect({
            left: 260,
            top: 100,
            width: 10,
            height: 10,
            selectable: true,
            evented: true,
        });
        canvas.add(shapeHandle);
        canvas.setListeners(new LineListeners({ canvas }));

        const mouse = (type: "mousedown" | "mousemove", x: number, y: number) =>
            (type === "mousedown"
                ? canvas.upperCanvasEl
                : document
            ).dispatchEvent(
                new MouseEvent(type, {
                    clientX: x,
                    clientY: y,
                    ctrlKey: true,
                    shiftKey: true,
                    button: 0,
                    bubbles: true,
                }),
            );
        mouse("mousedown", 20, 200);
        mouse("mousemove", 80, 220);
        // Leave line mode before releasing the mouse
        canvas.setListeners(new DefaultListeners({ canvas }));

        expect(shapeHandle.evented).toBe(true);
        expect(shapeHandle.selectable).toBe(true);
        for (const marcher of canvas.getCanvasMarchers()) {
            expect(marcher.selectable).toBe(true);
            expect(marcher.evented).toBe(true);
        }
        canvas.dispose();
    });

    it("keeps marchers unselectable when line mode starts mid-lasso", () => {
        const canvas = createCanvasWithMarchers();
        canvas.setListeners(new DefaultListeners({ canvas }));
        const mouse = (type: "mousedown" | "mousemove", x: number, y: number) =>
            (type === "mousedown"
                ? canvas.upperCanvasEl
                : document
            ).dispatchEvent(
                new MouseEvent(type, {
                    clientX: x,
                    clientY: y,
                    shiftKey: true,
                    button: 0,
                    bubbles: true,
                }),
            );
        mouse("mousedown", 20, 200);
        mouse("mousemove", 80, 220);

        // e.g. pressing L for Create Line before releasing the mouse
        canvas.setListeners(new LineListeners({ canvas }));

        for (const marcher of canvas.getCanvasMarchers()) {
            expect(marcher.selectable).toBe(false);
        }
        expect(canvas.staticGridRef.hoverCursor).toBe("crosshair");
        canvas.dispose();
    });
});

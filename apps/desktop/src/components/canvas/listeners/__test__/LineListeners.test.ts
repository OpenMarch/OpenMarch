import { describe, expect, it } from "vitest";
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
});

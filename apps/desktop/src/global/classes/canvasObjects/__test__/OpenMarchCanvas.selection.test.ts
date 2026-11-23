import { describe, expect, it } from "vitest";
import { fabric } from "fabric";
import { generateMarchers } from "@/__mocks__/generators";
import { defaultSettings } from "@/stores/UiSettingsStore";
import CanvasMarcher from "../CanvasMarcher";
import OpenMarchCanvas from "../OpenMarchCanvas";
import FieldPropertiesTemplates from "../../FieldProperties.templates";

type RenderArgs = Parameters<OpenMarchCanvas["renderMarchers"]>[0];

describe("OpenMarchCanvas selection box", () => {
    it("follows selected marchers that are moved by a render", async () => {
        const canvas = new OpenMarchCanvas({
            canvasRef: null,
            fieldProperties:
                FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES,
            uiSettings: defaultSettings,
        });
        const marchers = generateMarchers({ numberOfMarchers: 2, seed: 1 });
        const canvasMarchers = marchers.map((marcher, i) => {
            const canvasMarcher = new CanvasMarcher({
                marcher,
                coordinate: { x: 100 + i * 20, y: 100 },
            });
            canvas.add(canvasMarcher);
            return canvasMarcher;
        });
        const selection = new fabric.ActiveSelection(canvasMarchers, {
            canvas,
        });
        canvas.setActiveObject(selection);

        // e.g. an align action writes new coordinates and the canvas re-renders them
        await canvas.renderMarchers({
            marcherVisuals: Object.fromEntries(
                canvasMarchers.map((cm) => [
                    cm.marcherObj.id,
                    { getCanvasMarcher: () => cm },
                ]),
            ) as unknown as RenderArgs["marcherVisuals"],
            marcherPages: Object.fromEntries(
                marchers.map((marcher, i) => [
                    marcher.id,
                    { marcher_id: marcher.id, x: 400 + i * 20, y: 300 },
                ]),
            ) as unknown as RenderArgs["marcherPages"],
        });

        // The dots land where the database says, not shifted by the refit
        canvasMarchers.forEach((canvasMarcher, i) => {
            const coords = canvasMarcher.getMarcherCoords();
            expect(coords.x).toBeCloseTo(400 + i * 20);
            expect(coords.y).toBeCloseTo(300);
        });

        const box = selection.getBoundingRect(true, true);
        for (const canvasMarcher of canvasMarchers) {
            const dot = canvasMarcher.getAbsoluteCoords();
            expect(dot.x).toBeGreaterThanOrEqual(box.left);
            expect(dot.x).toBeLessThanOrEqual(box.left + box.width);
            expect(dot.y).toBeGreaterThanOrEqual(box.top);
            expect(dot.y).toBeLessThanOrEqual(box.top + box.height);
        }
    });
});

import { describe, expect, it } from "vitest";
import OpenMarchCanvas from "../OpenMarchCanvas";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { defaultSettings } from "@/stores/UiSettingsStore";

const opaquePixels = (canvas: OpenMarchCanvas) => {
    const el = canvas.getElement();
    const data = el
        .getContext("2d")!
        .getImageData(0, 0, el.width, el.height).data;
    let count = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) count++;
    return count;
};

describe("the field grid in video export frames", () => {
    it("isn't drawn on a frame once the static field render hides it again", () => {
        const canvas = new OpenMarchCanvas({
            canvasRef: document.createElement("canvas"),
            fieldProperties:
                FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES,
            uiSettings: defaultSettings,
        });
        canvas.enableRetinaScaling = false;
        canvas.setDimensions({ width: 600, height: 400 });
        canvas.viewportTransform = [0.5, 0, 0, 0.5, 10, 10];
        canvas.backgroundColor = "rgba(0,0,0,0)";
        // videoFrameRenderer's getStaticFieldCanvas: render once with the grid shown
        canvas.staticGridRef.visible = true;
        canvas.renderAll();
        const withGrid = opaquePixels(canvas);
        expect(withGrid).toBeGreaterThan(0);
        // Each frame then renders with the grid hidden and a transparent background
        canvas.staticGridRef.visible = false;
        canvas.renderAll();
        expect(opaquePixels(canvas)).toBe(0);
    });
});

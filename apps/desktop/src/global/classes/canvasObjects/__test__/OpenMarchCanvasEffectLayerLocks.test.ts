import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { defaultSettings } from "@/stores/UiSettingsStore";
import { createEffectLayerCanvasRect } from "@/utilities/effectLayerCanvasRect";
import { fabric } from "fabric";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OpenMarchCanvas from "../OpenMarchCanvas";

describe("OpenMarchCanvas effect layer movement locks", () => {
    beforeEach(() => {
        window.electron = {
            getFieldPropertiesImage: vi.fn().mockResolvedValue(null),
        } as Window["electron"];
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("does not lock movement on effect layer rects when marcherTransformsReadOnly is true", () => {
        const canvas = new OpenMarchCanvas({
            canvasRef: null,
            fieldProperties:
                FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES,
            uiSettings: defaultSettings,
        });
        canvas.marcherTransformsReadOnly = true;

        const rect = createEffectLayerCanvasRect({
            left: 10,
            top: 20,
            width: 30,
            height: 40,
            strokeColor: { r: 1, g: 2, b: 3, a: 1 },
            style: "selected",
            layerId: 1,
            interactive: true,
        });
        canvas.add(rect);
        canvas.setActiveObject(rect);

        expect(rect.lockMovementX).not.toBe(true);
        expect(rect.lockMovementY).not.toBe(true);
    });

    it("still locks movement on non-effect-layer objects when marcherTransformsReadOnly is true", () => {
        const canvas = new OpenMarchCanvas({
            canvasRef: null,
            fieldProperties:
                FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES,
            uiSettings: defaultSettings,
        });
        canvas.marcherTransformsReadOnly = true;

        const rect = new fabric.Rect({
            left: 0,
            top: 0,
            width: 10,
            height: 10,
        });
        canvas.add(rect);
        canvas.setActiveObject(rect);

        expect(rect.lockMovementX).toBe(true);
        expect(rect.lockMovementY).toBe(true);
    });

    it("does not re-lock effect layer movement when setUiSettings is called in read-only mode", () => {
        const canvas = new OpenMarchCanvas({
            canvasRef: null,
            fieldProperties:
                FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES,
            uiSettings: defaultSettings,
        });
        canvas.marcherTransformsReadOnly = true;

        const rect = createEffectLayerCanvasRect({
            left: 10,
            top: 20,
            width: 30,
            height: 40,
            strokeColor: { r: 1, g: 2, b: 3, a: 1 },
            style: "selected",
            layerId: 1,
            interactive: true,
        });
        canvas.add(rect);
        canvas.setActiveObject(rect);
        canvas.setUiSettings(defaultSettings);

        expect(rect.lockMovementX).not.toBe(true);
        expect(rect.lockMovementY).not.toBe(true);
    });
});

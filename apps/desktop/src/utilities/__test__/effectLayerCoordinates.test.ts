import { describe, expect, it } from "vitest";
import {
    clampEffectLayerRectToField,
    fabricRectToEffectLayerRect,
    isEffectLayerRectLargeEnough,
    MIN_EFFECT_LAYER_DRAFT_PX,
    normalizeCanvasRect,
} from "../effectLayerCoordinates";
import { fabric } from "fabric";

describe("normalizeCanvasRect", () => {
    it("normalizes drag from bottom-right to top-left", () => {
        expect(normalizeCanvasRect(100, 80, 40, 20)).toEqual({
            left: 40,
            top: 20,
            width: 60,
            height: 60,
        });
    });

    it("normalizes drag from top-left to bottom-right", () => {
        expect(normalizeCanvasRect(10, 20, 70, 90)).toEqual({
            left: 10,
            top: 20,
            width: 60,
            height: 70,
        });
    });
});

describe("clampEffectLayerRectToField", () => {
    it("clamps rect to field bounds", () => {
        expect(
            clampEffectLayerRectToField(
                { left: -10, top: -5, width: 200, height: 150 },
                100,
                80,
            ),
        ).toEqual({
            left: 0,
            top: 0,
            width: 100,
            height: 80,
        });
    });

    it("shrinks width and height when rect extends past field edge", () => {
        expect(
            clampEffectLayerRectToField(
                { left: 80, top: 60, width: 50, height: 40 },
                100,
                80,
            ),
        ).toEqual({
            left: 80,
            top: 60,
            width: 20,
            height: 20,
        });
    });
});

describe("isEffectLayerRectLargeEnough", () => {
    it("accepts rects at or above the minimum draft size", () => {
        expect(
            isEffectLayerRectLargeEnough({
                left: 0,
                top: 0,
                width: MIN_EFFECT_LAYER_DRAFT_PX,
                height: MIN_EFFECT_LAYER_DRAFT_PX,
            }),
        ).toBe(true);
    });

    it("rejects rects below the minimum draft size", () => {
        expect(
            isEffectLayerRectLargeEnough({
                left: 0,
                top: 0,
                width: MIN_EFFECT_LAYER_DRAFT_PX - 1,
                height: 10,
            }),
        ).toBe(false);
    });
});

describe("fabricRectToEffectLayerRect", () => {
    it("reads scaled dimensions and resets scale to 1", () => {
        const rect = new fabric.Rect({
            left: 10,
            top: 20,
            width: 30,
            height: 40,
            scaleX: 2,
            scaleY: 1.5,
            strokeWidth: 0,
        });

        const result = fabricRectToEffectLayerRect(rect);
        expect(result.left).toBe(10);
        expect(result.top).toBe(20);
        expect(result.width).toBeCloseTo(60, 5);
        expect(result.height).toBeCloseTo(60, 5);
        expect(rect.scaleX).toBe(1);
        expect(rect.scaleY).toBe(1);
        expect(rect.width).toBeCloseTo(60, 5);
        expect(rect.height).toBeCloseTo(60, 5);
    });
});

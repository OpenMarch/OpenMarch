import { describe, expect, it } from "vitest";
import {
    clampEffectLayerRectToField,
    isEffectLayerRectLargeEnough,
    MIN_EFFECT_LAYER_DRAFT_PX,
    normalizeCanvasRect,
} from "../effectLayerCoordinates";

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

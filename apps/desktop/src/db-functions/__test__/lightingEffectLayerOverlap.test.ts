import { describe, expect, it } from "vitest";
import {
    assertLightingEffectLayersDoNotOverlap,
    LIGHTING_EFFECT_LAYER_OVERLAP_ERROR,
    lightingEffectLayerRectsOverlap,
} from "../lightingEffectLayers";

describe("lightingEffectLayerRectsOverlap", () => {
    it("returns true when rects share interior area", () => {
        expect(
            lightingEffectLayerRectsOverlap(
                { top: 0, left: 0, height: 10, width: 10 },
                { top: 5, left: 5, height: 10, width: 10 },
            ),
        ).toBe(true);
    });

    it("returns false when rects only touch at an edge", () => {
        expect(
            lightingEffectLayerRectsOverlap(
                { top: 0, left: 0, height: 10, width: 10 },
                { top: 0, left: 10, height: 10, width: 10 },
            ),
        ).toBe(false);
        expect(
            lightingEffectLayerRectsOverlap(
                { top: 0, left: 0, height: 10, width: 10 },
                { top: 10, left: 0, height: 10, width: 10 },
            ),
        ).toBe(false);
    });

    it("returns false when rects have zero or negative area", () => {
        expect(
            lightingEffectLayerRectsOverlap(
                { top: 0, left: 0, height: 0, width: 10 },
                { top: 0, left: 5, height: 10, width: 10 },
            ),
        ).toBe(false);
        expect(
            lightingEffectLayerRectsOverlap(
                { top: 0, left: 0, height: 10, width: -1 },
                { top: 0, left: 5, height: 10, width: 10 },
            ),
        ).toBe(false);
    });
});

describe("assertLightingEffectLayersDoNotOverlap", () => {
    it("passes for non-overlapping layers", () => {
        expect(() =>
            assertLightingEffectLayersDoNotOverlap([
                { top: 0, left: 0, height: 10, width: 10 },
                { top: 0, left: 10, height: 10, width: 10 },
            ]),
        ).not.toThrow();
    });

    it("throws when any pair overlaps", () => {
        expect(() =>
            assertLightingEffectLayersDoNotOverlap([
                { top: 0, left: 0, height: 10, width: 10 },
                { top: 5, left: 5, height: 10, width: 10 },
            ]),
        ).toThrow(LIGHTING_EFFECT_LAYER_OVERLAP_ERROR);
    });
});

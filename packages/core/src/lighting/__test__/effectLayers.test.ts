import { describe, expect, it } from "vitest";
import {
    canLightingEffectTypeHaveLayers,
    LIGHTING_EFFECT_LAYER_SUPPORT_BY_TYPE,
} from "../effectLayers";
import { LightingEffectTypes } from "../types";

describe("LIGHTING_EFFECT_LAYER_SUPPORT_BY_TYPE", () => {
    it("covers every lighting effect type", () => {
        expect(
            Object.keys(LIGHTING_EFFECT_LAYER_SUPPORT_BY_TYPE).sort(),
        ).toEqual([...LightingEffectTypes].sort());
    });

    it("only enables layers for solid effects", () => {
        expect(LIGHTING_EFFECT_LAYER_SUPPORT_BY_TYPE.solid).toBe(true);
        expect(LIGHTING_EFFECT_LAYER_SUPPORT_BY_TYPE.strobe).toBe(false);
        expect(LIGHTING_EFFECT_LAYER_SUPPORT_BY_TYPE.fade).toBe(false);
    });
});

describe("canLightingEffectTypeHaveLayers", () => {
    it("returns true for solid effects", () => {
        expect(canLightingEffectTypeHaveLayers("solid")).toBe(true);
    });

    it("returns false for fade and strobe effects", () => {
        expect(canLightingEffectTypeHaveLayers("fade")).toBe(false);
        expect(canLightingEffectTypeHaveLayers("strobe")).toBe(false);
    });
});

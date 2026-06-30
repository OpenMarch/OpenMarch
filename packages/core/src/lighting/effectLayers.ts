import type { LightingEffectType } from "./types";

export const LIGHTING_EFFECT_LAYER_SUPPORT_BY_TYPE = {
    solid: true,
    strobe: false,
    fade: false,
} as const satisfies Record<LightingEffectType, boolean>;

export const LIGHTING_EFFECT_LAYER_UNSUPPORTED_TYPE_ERROR =
    "Effect layers are only supported for solid lighting effects.";

export function canLightingEffectTypeHaveLayers(
    type: LightingEffectType,
): boolean {
    return LIGHTING_EFFECT_LAYER_SUPPORT_BY_TYPE[type];
}

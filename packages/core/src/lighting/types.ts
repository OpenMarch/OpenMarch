export const LightingEffectTypes = ["solid", "strobe", "fade", "wipe"] as const;
export type LightingEffectType = (typeof LightingEffectTypes)[number];

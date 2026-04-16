export const LightingEffectTypes = ["solid", "strobe", "fade"] as const;
export type LightingEffectType = (typeof LightingEffectTypes)[number];

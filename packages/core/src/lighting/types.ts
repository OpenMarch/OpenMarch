export const LightingEffectTypes = ["solid", "wipe", "flicker"] as const;
export type LightingEffectType = (typeof LightingEffectTypes)[number];

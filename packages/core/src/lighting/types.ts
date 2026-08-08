export const LightingEffectTypes = [
    "solid",
    "wipe",
    "flicker",
    "fade",
] as const;
export type LightingEffectType = (typeof LightingEffectTypes)[number];

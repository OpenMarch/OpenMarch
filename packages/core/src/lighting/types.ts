export const LightingEffectTypes = [
    "solid",
    "strobe",
    "fade",
    "wipe",
    "flicker",
] as const;
export type LightingEffectType = (typeof LightingEffectTypes)[number];

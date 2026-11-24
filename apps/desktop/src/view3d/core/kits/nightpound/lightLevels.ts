import { lightingValues, type LightingValues } from "../../environment";
import type { LightingPreset } from "../../types";

/** The key for this venue's own values in `environment/lighting.ts`. */
export const NIGHTPOUND_VENUE = "nightpound";

/**
 * A preset's values as this venue lights it. Every overhead part reads its
 * levels from here: `kit.roofSpotIntensity` scales the floor spots,
 * `kit.barEmissive` the can lights, `kit.panelEmissive` the boards.
 */
export function nightpoundLighting(preset: LightingPreset): LightingValues {
    return lightingValues(preset, NIGHTPOUND_VENUE);
}

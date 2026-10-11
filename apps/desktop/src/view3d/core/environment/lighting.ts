import type { Vector3Tuple } from "three";
import type { LightingPreset } from "../types";
import { ft } from "./units";

/**
 * Lighting preset values, ported from the reference demo's `SKY` table and its
 * pro (roof closed) and gym (house, show) presets. Lengths are meters.
 *
 * The shared rig (`createEnvironment`) applies the sky, fog, hemisphere, sun
 * and exposure fields. Kits read `kit` (via `lightingValues(preset).kit`) to
 * drive the extra lights they own.
 */
export interface LightingValues {
    /** The gym hides the sky dome. */
    skyVisible: boolean;
    skyTop: number;
    skyBottom: number;
    /** Fog color. Usually equal to `skyBottom`. */
    fog: number;
    hemisphere: { sky: number; ground: number; intensity: number };
    sun: {
        color: number;
        /** 0 turns the sun off; it then also stops casting shadows. */
        intensity: number;
        /** Offset from the focus point, in meters. */
        offset: Vector3Tuple;
    };
    /** Apply to `renderer.toneMappingExposure`. */
    exposure: number;
    kit: KitLightingValues;
}

/** Values for lights and emissive parts that kits own. */
export interface KitLightingValues {
    /** Light poles: `lightPole(...).setOn(lampsOn, lampScale)`. */
    lampsOn: boolean;
    lampScale: number;
    /** Pro roof-edge light bar emissive intensity. */
    barEmissive: number;
    /** Pro roof-edge spot intensity. */
    roofSpotIntensity: number;
    /** Pro: whether the sliding roof panels are open. */
    roofOpen: boolean;
    /** Gym ceiling panel emissive intensity. */
    panelEmissive: number;
    /** Gym overhead directional light intensity. */
    overheadIntensity: number;
    /** Gym show spot intensity. */
    showSpotIntensity: number;
}

const kitOff: KitLightingValues = {
    lampsOn: false,
    lampScale: 0,
    barEmissive: 0,
    roofSpotIntensity: 0,
    roofOpen: true,
    panelEmissive: 0,
    overheadIntensity: 0,
    showSpotIntensity: 0,
};

/** Sun offsets in the demo are in feet. */
const sunOffset = (x: number, y: number, z: number): Vector3Tuple => [
    ft(x),
    ft(y),
    ft(z),
];

const day: LightingValues = {
    skyVisible: true,
    skyTop: 0x3d7fd6,
    skyBottom: 0xcfe2f5,
    fog: 0xcfe2f5,
    hemisphere: { sky: 0xcfe3ff, ground: 0x4a5d33, intensity: 1.1 },
    sun: { color: 0xffffff, intensity: 2.3, offset: sunOffset(300, 520, 260) },
    exposure: 1,
    kit: { ...kitOff },
};

const dusk: LightingValues = {
    skyVisible: true,
    skyTop: 0x27306a,
    skyBottom: 0xf2995a,
    fog: 0xf2995a,
    hemisphere: { sky: 0xffc49a, ground: 0x3a3440, intensity: 0.55 },
    sun: { color: 0xffa860, intensity: 1.4, offset: sunOffset(-700, 120, -60) },
    exposure: 1.05,
    kit: {
        ...kitOff,
        lampsOn: true,
        lampScale: 0.6,
        barEmissive: 2,
        roofSpotIntensity: 1.4,
    },
};

const night: LightingValues = {
    skyVisible: true,
    skyTop: 0x04060d,
    skyBottom: 0x17203a,
    fog: 0x17203a,
    hemisphere: { sky: 0x1b2440, ground: 0x0a0a0c, intensity: 0.3 },
    sun: { color: 0x8899cc, intensity: 0, offset: sunOffset(0, 500, 0) },
    exposure: 1.15,
    kit: {
        ...kitOff,
        lampsOn: true,
        lampScale: 1,
        barEmissive: 2,
        roofSpotIntensity: 1.4,
    },
};

/** Pro dome with the roof shut: day sky colors, no sun, warm interior. */
const roofClosed: LightingValues = {
    ...day,
    hemisphere: { sky: 0xfff1e0, ground: 0x554433, intensity: 0.9 },
    sun: { ...day.sun, intensity: 0 },
    exposure: 1,
    kit: { ...kitOff, barEmissive: 2, roofSpotIntensity: 1.4, roofOpen: false },
};

const house: LightingValues = {
    skyVisible: false,
    skyTop: 0x1a1a1f,
    skyBottom: 0x1a1a1f,
    fog: 0x1a1a1f,
    hemisphere: { sky: 0xfff4e0, ground: 0x6b5a44, intensity: 0.9 },
    sun: { color: 0xffffff, intensity: 0, offset: sunOffset(0, 500, 0) },
    exposure: 1,
    kit: { ...kitOff, panelEmissive: 1.4, overheadIntensity: 1.1 },
};

const show: LightingValues = {
    ...house,
    hemisphere: { ...house.hemisphere, intensity: 0.12 },
    exposure: 1.2,
    kit: {
        ...kitOff,
        panelEmissive: 0.08,
        overheadIntensity: 0.1,
        showSpotIntensity: 2.4,
    },
};

const LIGHTING: Record<LightingPreset, LightingValues> = {
    day,
    dusk,
    night,
    roofClosed,
    house,
    show,
};

/** Every preset's values. Treat the result as read-only. */
export function lightingValues(preset: LightingPreset): LightingValues {
    return LIGHTING[preset];
}

export const LIGHTING_PRESET_IDS = Object.keys(LIGHTING) as LightingPreset[];

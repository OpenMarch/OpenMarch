import type { Light, Vector3Tuple } from "three";
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
        /** False for a moon too faint to be worth a shadow map. Default true. */
        castShadow?: boolean;
    };
    /** Apply to `renderer.toneMappingExposure`. */
    exposure: number;
    /** Fog range in meters (linear fog, `env.fog.near` and `far`). */
    fogNear: number;
    fogFar: number;
    /** The procedural sky and the land around the venue. */
    sky: SkyLook;
    /** What the environment map sees below the horizon, sRGB hex. */
    envGround: number;
    kit: KitLightingValues;
}

/**
 * How the procedural sky and the land look under a preset. `skyTop` is the
 * zenith and `fog` the color right at the horizon, so distant fogged ground
 * meets the sky without a seam. Colors are sRGB hex.
 */
export interface SkyLook {
    /** Sky color about 15 degrees up, between the horizon haze and the zenith. */
    mid: number;
    /** Band a few degrees above the horizon, strongest away from the sun. */
    band: number;
    bandStrength: number;
    /** Glow around the sun (or moon) and its strength. */
    glow: number;
    glowStrength: number;
    /** Sun disc brightness; 0 hides it. The disc sits along `sun.offset`. */
    sunDisc: number;
    cloudCover: number;
    cloudLit: number;
    cloudShade: number;
    cloudOpacity: number;
    /** Star brightness; 0 hides them. */
    stars: number;
    /** Moon brightness and direction; 0 hides it. */
    moon: number;
    moonDirection: Vector3Tuple;
    /** Warm light-pollution glow of a town on the horizon toward -Z. */
    cityGlow: number;
    cityGlowStrength: number;
    /** Horizon silhouettes: treeline and town, then far hills. */
    nearLand: number;
    farLand: number;
    /** How far each silhouette fades toward the horizon color, 0..1. */
    nearHaze: number;
    farHaze: number;
    /** Lit windows, street lights and porch lights; 0 is off (daytime). */
    windows: number;
    /** Multiplies the land's daytime colors. */
    landLight: number;
    /** Warm light the stadium throws on the ground around it. */
    landSpill: number;
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

/** The moon hangs low behind the far stand, right of the press box view. */
const MOON_DIRECTION: Vector3Tuple = [0.52, 0.34, -0.78];

/** Turf as the ground sees it from the field: a mid green. */
const TURF_GROUND = 0x3f6b2e;

const daySky: SkyLook = {
    mid: 0x8fbbe8,
    band: 0xdbe8f5,
    bandStrength: 0.25,
    glow: 0xfff3d8,
    glowStrength: 0.6,
    sunDisc: 6,
    cloudCover: 0.42,
    cloudLit: 0xffffff,
    cloudShade: 0x9eacc0,
    cloudOpacity: 0.92,
    stars: 0,
    moon: 0,
    moonDirection: MOON_DIRECTION,
    cityGlow: 0x000000,
    cityGlowStrength: 0,
    nearLand: 0x3a4d33,
    farLand: 0x627a6c,
    nearHaze: 0.34,
    farHaze: 0.66,
    windows: 0,
    landLight: 1,
    landSpill: 0,
};

const day: LightingValues = {
    skyVisible: true,
    skyTop: 0x2f6fc9,
    skyBottom: 0xcfe0ef,
    fog: 0xcfe0ef,
    hemisphere: { sky: 0xcfe3ff, ground: 0x4a5d33, intensity: 1.1 },
    sun: { color: 0xffffff, intensity: 2.3, offset: sunOffset(300, 520, 260) },
    exposure: 1,
    fogNear: 140,
    fogFar: 1700,
    sky: daySky,
    envGround: TURF_GROUND,
    kit: { ...kitOff },
};

const dusk: LightingValues = {
    skyVisible: true,
    skyTop: 0x1c2a66,
    skyBottom: 0xf0a878,
    fog: 0xf0a878,
    hemisphere: { sky: 0xffc49a, ground: 0x3a3440, intensity: 0.55 },
    sun: { color: 0xffa860, intensity: 1.4, offset: sunOffset(-700, 120, -60) },
    exposure: 1.05,
    fogNear: 120,
    fogFar: 1600,
    sky: {
        mid: 0x8c94c0,
        band: 0xe59aa8,
        bandStrength: 0.45,
        glow: 0xffb45e,
        glowStrength: 1.6,
        sunDisc: 5,
        cloudCover: 0.36,
        cloudLit: 0xffa070,
        cloudShade: 0x5a4a78,
        cloudOpacity: 0.9,
        stars: 0.12,
        moon: 0,
        moonDirection: MOON_DIRECTION,
        cityGlow: 0xffb070,
        cityGlowStrength: 0.15,
        nearLand: 0x2b2940,
        farLand: 0x4f4468,
        nearHaze: 0.2,
        farHaze: 0.46,
        windows: 0.6,
        landLight: 0.42,
        landSpill: 0.05,
    },
    envGround: TURF_GROUND,
    kit: {
        ...kitOff,
        lampsOn: true,
        lampScale: 0.6,
        barEmissive: 2,
        roofSpotIntensity: 1.4,
    },
};

/**
 * A lit stadium in a town: the sky is dark but the world isn't black. The
 * hemisphere stays low enough to leave the pole-lit field brightest, a faint
 * moon gives walls a lit side (the sun slot, without a shadow map), and light
 * bouncing off the turf comes up from below.
 */
const night: LightingValues = {
    skyVisible: true,
    skyTop: 0x050812,
    skyBottom: 0x1c2540,
    fog: 0x1c2540,
    hemisphere: { sky: 0x5f7199, ground: 0x4c4c3e, intensity: 1.25 },
    sun: {
        color: 0xa5b8ea,
        intensity: 0.75,
        offset: [
            MOON_DIRECTION[0] * 500,
            MOON_DIRECTION[1] * 500,
            MOON_DIRECTION[2] * 500,
        ],
        castShadow: false,
    },
    exposure: 1.15,
    fogNear: 100,
    fogFar: 1500,
    sky: {
        mid: 0x0d1428,
        band: 0x1f2b4e,
        bandStrength: 0.4,
        glow: 0x8aa0d0,
        glowStrength: 0.2,
        sunDisc: 0,
        cloudCover: 0.22,
        cloudLit: 0x3a4664,
        cloudShade: 0x10162a,
        cloudOpacity: 0.65,
        stars: 1,
        moon: 1.3,
        moonDirection: MOON_DIRECTION,
        cityGlow: 0xc9874a,
        cityGlowStrength: 0.34,
        nearLand: 0x0b0f1a,
        farLand: 0x141b30,
        nearHaze: 0.14,
        farHaze: 0.42,
        windows: 1,
        landLight: 0.16,
        landSpill: 0.05,
    },
    envGround: 0x6f8058,
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

/** Indoors there is no sky to see; the map is a dim room. */
const indoorSky: SkyLook = {
    ...daySky,
    mid: 0x1a1a1f,
    band: 0x1a1a1f,
    bandStrength: 0,
    glowStrength: 0,
    sunDisc: 0,
    cloudCover: 0,
};

const house: LightingValues = {
    skyVisible: false,
    skyTop: 0x1a1a1f,
    skyBottom: 0x1a1a1f,
    fog: 0x1a1a1f,
    hemisphere: { sky: 0xfff4e0, ground: 0x6b5a44, intensity: 0.9 },
    sun: { color: 0xffffff, intensity: 0, offset: sunOffset(0, 500, 0) },
    exposure: 1,
    fogNear: ft(1800),
    fogFar: ft(5000),
    sky: indoorSky,
    envGround: 0x54483c,
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

/**
 * Sets a light's intensity and hides the light while it is 0. three.js shades
 * every visible light for every pixel, whatever its intensity, so a light
 * that is off but still visible costs as much as a lit one: by day the four
 * unlit pole spots took a third of the frame's GPU time. Turning a light on
 * or off changes the light count, so the scene's shaders recompile once.
 */
export function setLightIntensity(light: Light, intensity: number): void {
    light.intensity = intensity;
    light.visible = intensity > 0;
}

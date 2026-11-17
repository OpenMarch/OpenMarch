import {
    DirectionalLight,
    Fog,
    Group,
    HemisphereLight,
    type Vector3Tuple,
} from "three";
import type { LightingPreset } from "../types";
import {
    lightingValues,
    setLightIntensity,
    type LightingValues,
} from "./lighting";
import { createHorizon, type Horizon } from "./horizon";
import { createLand, type Land } from "./land";
import { createSkyDome, type SkyDome } from "./sky";
import { ft } from "./units";

export interface EnvironmentOptions {
    /** "low" never casts shadows. Default "high". */
    quality?: "low" | "high";
    /** Default look-at point (the sun's target). Default the origin. */
    focus?: Vector3Tuple;
}

export interface Environment {
    /**
     * Sky dome, horizon, land, hemisphere light, sun and the sun's target.
     * Add to the scene.
     */
    root: Group;
    sky: SkyDome;
    /** Treeline, town and hills past the stands. Null at low quality. */
    horizon: Horizon | null;
    /** Fields, woods, roads and town past the stands. Null at low quality. */
    land: Land | null;
    hemisphere: HemisphereLight;
    sun: DirectionalLight;
    /** Assign to `scene.fog`. Its color follows the preset. */
    fog: Fog;
    /** Apply to `renderer.toneMappingExposure`; updated by `setLighting`. */
    readonly exposure: number;
    /**
     * Applies a preset to the sky, fog, hemisphere light, sun and exposure and
     * returns the preset's values. Kits drive their own lights from
     * `values.kit`.
     */
    setLighting(preset: LightingPreset, focus?: Vector3Tuple): LightingValues;
    setFocus(focus: Vector3Tuple): void;
    /**
     * Shows or hides the land and horizon around the venue (they also hide
     * with the sky). Set it from `KitResult.surroundings` when the kit changes.
     */
    setSurroundings(on: boolean): void;
    dispose(): void;
}

/**
 * The shared lighting rig: one hemisphere light and one shadow-casting sun,
 * plus the sky dome and fog (design.md section 5). The scene owns it; kits add
 * their own lights and switch them in `KitResult.setLighting`.
 */
export function createEnvironment(
    options: EnvironmentOptions = {},
): Environment {
    const quality = options.quality ?? "high";
    let focus: Vector3Tuple = options.focus ?? [0, 0, 0];

    const root = new Group();
    root.name = "environment";
    const sky = createSkyDome({ quality });
    // Low quality paints a silhouette into the sky instead: no extra draw calls.
    const horizon = quality === "high" ? createHorizon() : null;
    const land = quality === "high" ? createLand() : null;
    const hemisphere = new HemisphereLight(0xcfe3ff, 0x4a5d33, 1);
    const sun = new DirectionalLight(0xffffff, 2);
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
        left: -ft(420),
        right: ft(420),
        top: ft(420),
        bottom: -ft(420),
        near: ft(10),
        far: ft(2200),
    });
    sun.shadow.bias = -0.0004;
    sun.shadow.camera.updateProjectionMatrix();
    root.add(sky.mesh, hemisphere, sun, sun.target);
    if (horizon) root.add(horizon.mesh);
    if (land) root.add(land.mesh);
    const fog = new Fog(0xcfe2f5, ft(1800), ft(5000));

    let exposure = 1;
    let surroundings = true;
    let skyVisible = true;
    const showSurroundings = () => {
        if (horizon) horizon.mesh.visible = surroundings && skyVisible;
        if (land) land.mesh.visible = surroundings && skyVisible;
    };
    const env: Environment = {
        root,
        sky,
        horizon,
        land,
        hemisphere,
        sun,
        fog,
        get exposure() {
            return exposure;
        },
        setLighting(preset, f) {
            if (f) focus = f;
            const v = lightingValues(preset);
            sky.setPreset(preset);
            horizon?.setPreset(preset);
            horizon?.setCenter(focus);
            land?.setPreset(preset);
            land?.setCenter(focus);
            skyVisible = v.skyVisible;
            showSurroundings();
            fog.color.setHex(v.fog);
            fog.near = v.fogNear;
            fog.far = v.fogFar;
            hemisphere.color.setHex(v.hemisphere.sky);
            hemisphere.groundColor.setHex(v.hemisphere.ground);
            hemisphere.intensity = v.hemisphere.intensity;
            sun.color.setHex(v.sun.color);
            setLightIntensity(sun, v.sun.intensity);
            sun.position.set(
                focus[0] + v.sun.offset[0],
                focus[1] + v.sun.offset[1],
                focus[2] + v.sun.offset[2],
            );
            sun.target.position.set(...focus);
            sun.castShadow =
                quality === "high" &&
                v.sun.intensity > 0 &&
                v.sun.castShadow !== false;
            exposure = v.exposure;
            return v;
        },
        setSurroundings(on) {
            surroundings = on;
            showSurroundings();
        },
        setFocus(f) {
            focus = f;
            sun.target.position.set(...f);
            horizon?.setCenter(f);
            land?.setCenter(f);
        },
        dispose() {
            sky.dispose();
            horizon?.dispose();
            land?.dispose();
            sun.shadow.dispose();
        },
    };
    env.setLighting("day");
    return env;
}

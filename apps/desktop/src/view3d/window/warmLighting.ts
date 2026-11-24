/**
 * Compiles the shaders for the venue's other lighting presets in the
 * background. A light that is off is hidden (`setLightIntensity`), so each
 * preset lights the scene with its own set of lights and needs its own
 * shaders. Compiled on the switch, they froze the window for over a second
 * the first time the viewer chose night.
 */
import type { Camera, Object3D } from "three";
import type { Environment } from "@/view3d/core/environment";
import type { KitResult, LightingPreset } from "@/view3d/core/types";

/** The part of `WebGLRenderer` this needs. */
export interface ShaderCompiler {
    compileAsync(
        scene: Object3D,
        camera: Camera,
        targetScene?: Object3D | null,
    ): Promise<Object3D>;
}

export interface LitScene {
    env: Environment;
    kit: KitResult;
    /** The preset the scene shows now; it is put back before this returns. */
    current: LightingPreset;
}

/**
 * Lights the scene with each other preset just long enough to start its
 * shaders compiling, then puts `current` back. It all runs in one task, so
 * no frame draws the borrowed lighting; the compiling finishes off the main
 * thread where the browser supports it.
 */
export function warmLightingPresets(
    gl: ShaderCompiler,
    scene: Object3D,
    camera: Camera,
    { env, kit, current }: LitScene,
): Promise<void> {
    const pending: Promise<Object3D>[] = [];
    for (const preset of kit.lightingPresets) {
        if (preset === current) continue;
        env.setLighting(preset, kit.focus, kit.lightingVenue);
        kit.setLighting(preset);
        pending.push(gl.compileAsync(scene, camera));
    }
    env.setLighting(current, kit.focus, kit.lightingVenue);
    kit.setLighting(current);
    return Promise.all(pending).then(() => undefined);
}

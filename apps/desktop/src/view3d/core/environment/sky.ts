// cspell:ignore tonemap
import { BackSide, Mesh, ShaderMaterial, SphereGeometry } from "three";
import type { LightingPreset } from "../types";
import { lightingValues } from "./lighting";
import {
    applySkyPreset,
    createSkyUniforms,
    SKY_VERTEX,
    skyFragmentShader,
} from "./skyShader";
import { ft } from "./units";

/** Radius of the sky dome in meters. The camera's far plane must exceed it. */
export const SKY_RADIUS = ft(5000);

export interface SkyDome {
    mesh: Mesh;
    /** Overrides the zenith and horizon colors of the current preset. */
    setColors(top: number, bottom: number): void;
    /** Applies a preset's sky (and shows or hides the dome). */
    setPreset(preset: LightingPreset): void;
    dispose(): void;
}

/**
 * The procedural sky (`skyShader.ts`): gradient, dusk band, sun, clouds,
 * stars, moon and town glow. Ignores fog; its horizon is the fog color.
 */
export function createSkyDome(
    options: { quality?: "low" | "high" } = {},
): SkyDome {
    const low = options.quality === "low";
    const uniforms = createSkyUniforms();
    const material = new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms,
        vertexShader: SKY_VERTEX,
        fragmentShader: skyFragmentShader({
            octaves: low ? 3 : 5,
            cloudLighting: !low,
            tonemap: true,
            landBand: low,
        }),
    });
    const geometry = new SphereGeometry(SKY_RADIUS, 32, 16);
    const mesh = new Mesh(geometry, material);
    mesh.name = "sky";
    mesh.frustumCulled = false;
    // Drawn after the other opaque objects, so the depth test skips the
    // shader wherever the venue already covers the sky.
    mesh.renderOrder = 1000;

    return {
        mesh,
        setColors(top, bottom) {
            uniforms.top.value.setHex(top);
            uniforms.bottom.value.setHex(bottom);
        },
        setPreset(preset) {
            applySkyPreset(uniforms, preset);
            mesh.visible = lightingValues(preset).skyVisible;
        },
        dispose() {
            geometry.dispose();
            material.dispose();
        },
    };
}

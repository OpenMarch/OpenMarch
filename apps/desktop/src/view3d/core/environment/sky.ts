import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry } from "three";
import type { LightingPreset } from "../types";
import { lightingValues } from "./lighting";
import { ft } from "./units";

/** Radius of the sky dome in meters. The camera's far plane must exceed it. */
export const SKY_RADIUS = ft(5000);

export interface SkyDome {
    mesh: Mesh;
    setColors(top: number, bottom: number): void;
    /** Sets the gradient from a preset (and shows or hides the dome). */
    setPreset(preset: LightingPreset): void;
    dispose(): void;
}

/** Gradient sky shader from the reference demo. Ignores fog. */
export function createSkyDome(): SkyDome {
    const material = new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
            top: { value: new Color() },
            bottom: { value: new Color() },
        },
        vertexShader:
            "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader:
            "uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y * 1.5 + 0.06, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.65)), 1.0);\n#include <colorspace_fragment>\n}",
    });
    const geometry = new SphereGeometry(SKY_RADIUS, 32, 16);
    const mesh = new Mesh(geometry, material);
    mesh.name = "sky";
    mesh.frustumCulled = false;

    const setColors = (top: number, bottom: number) => {
        material.uniforms.top.value.setHex(top);
        material.uniforms.bottom.value.setHex(bottom);
    };
    return {
        mesh,
        setColors,
        setPreset(preset) {
            const v = lightingValues(preset);
            setColors(v.skyTop, v.skyBottom);
            mesh.visible = v.skyVisible;
        },
        dispose() {
            geometry.dispose();
            material.dispose();
        },
    };
}

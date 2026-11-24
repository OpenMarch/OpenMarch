// cspell:ignore fract tonemapping
import { ShaderMaterial, Vector2, type Texture } from "three";

/**
 * The surface of an LED screen: the picture, shown as light, on a grid of
 * diodes. Up close each diode is a bright square in a dark surround; from
 * the stands the grid is finer than a pixel and fades out, so the picture
 * neither shimmers nor dims. The picture is multiplied by `gain` before the
 * renderer's tone mapping, so a screen can sit above the hall's exposure
 * (and above a bloom pass's threshold).
 *
 * Unlit and fog-free: a screen is its own light.
 */
export interface LedOptions {
    map: Texture;
    /** Diodes across one unit of U and of V. */
    cells: [number, number];
    gain?: number;
}

export interface LedUniforms {
    map: { value: Texture };
    cells: { value: Vector2 };
    gain: { value: number };
    /** Added to U, in texture tiles: a ribbon's crawl. */
    scroll: { value: number };
}

export type LedMaterial = ShaderMaterial & { uniforms: LedUniforms };

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform vec2 cells;
uniform float gain;
uniform float scroll;
varying vec2 vUv;
void main() {
    vec3 picture = texture2D(map, vec2(vUv.x + scroll, vUv.y)).rgb;
    // The diode grid stays on the screen; only the picture crawls.
    vec2 cell = vUv * cells;
    vec2 width = fwidth(cell);
    // 1 where a diode spans four pixels or more, 0 under two.
    float near = 1.0 - smoothstep(0.25, 0.5, max(width.x, width.y));
    vec2 d = abs(fract(cell) - 0.5);
    float diode = smoothstep(0.5, 0.3, max(d.x, d.y));
    // Brighter diodes make up for the dark between them.
    float led = mix(1.0, mix(0.3, 1.22, diode), near);
    gl_FragColor = vec4(picture * gain * led, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}`;

export function ledMaterial(options: LedOptions): LedMaterial {
    const uniforms: LedUniforms = {
        map: { value: options.map },
        cells: { value: new Vector2(...options.cells) },
        gain: { value: options.gain ?? 1 },
        scroll: { value: 0 },
    };
    const material = new ShaderMaterial({
        name: "markDiesel.led",
        uniforms: uniforms as unknown as ShaderMaterial["uniforms"],
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
    });
    return material as LedMaterial;
}

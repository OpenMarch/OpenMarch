// cspell:ignore fract tonemapping
/**
 * The land past the stands: a patchwork of fields, woods, a few roads and a
 * small town toward -Z, drawn in one mesh with no textures. At night the
 * town's street lights come on and the stadium throws a warm pool of light on
 * the ground around it.
 *
 * It covers the kits' plain ground plane from a hair above it and below
 * anything else on the ground, so kits building on the ground must stay at
 * least 2 cm above `GROUND_Y` to clear it. It fades to the fog color with
 * distance so it meets the horizon. Unlit: its colors come from the lighting
 * preset.
 */
import {
    BufferGeometry,
    Color,
    Float32BufferAttribute,
    Mesh,
    ShaderMaterial,
    Vector2,
    type Vector3Tuple,
} from "three";
import type { LightingPreset } from "../types";
import { GROUND_LAYER, setGroundLayer } from "./groundLayers";
import { lightingValues } from "./lighting";
import { NOISE_GLSL } from "./skyShader";
import { ft } from "./units";

/** Radius of the land. Beyond it the kits' ground and the fog take over. */
export const LAND_OUTER_RADIUS = 1400;
/** The land's height: just above the kits' ground plane at -0.3 ft. */
export const LAND_Y = -ft(0.3) + 0.016;
/** Past this radius the land rises off the kits' ground plane. Meters. */
export const LAND_RISE_START = 780;
/**
 * Past the infields the land lifts this much more, for a depth margin over the
 * kits' ground plane at range, and stays under kits' ground paint at -3 cm.
 */
const LAND_SHELF = 0.039;
const LAND_SHELF_FROM = 130;
const LAND_SHELF_TO = 170;
/** How far it has risen at the outer edge, for a depth margin at range. */
const LAND_RISE = 1.0;

const VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec2 uCenter;
uniform vec3 uHaze;
uniform float uLight;
uniform float uWindows;
uniform float uSpill;
uniform float uFogNear;
uniform float uFogFar;
varying vec3 vWorld;
${NOISE_GLSL}
float aa(float edge, float value) {
    float w = max(fwidth(value), 1e-4);
    return smoothstep(edge - w, edge + w, value);
}
void main() {
    vec2 p = vWorld.xz - uCenter;
    float r = length(p);

    // Farm plots on a grid turned off the stadium's axes, wobbling a little.
    float c = 0.962;
    float s = 0.272;
    vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    vec2 warp = vec2(omNoise(q / 310.0 + 1.7), omNoise(q / 270.0 + 9.2)) - 0.5;
    vec2 g = (q + warp * 46.0) / vec2(120.0, 176.0);
    vec2 id = floor(g);
    vec2 f = fract(g);
    float h = omHash12(id);
    vec3 plot = mix(vec3(0.075, 0.115, 0.05), vec3(0.11, 0.135, 0.065), h);
    if (h > 0.72) plot = mix(vec3(0.15, 0.13, 0.075), vec3(0.19, 0.16, 0.10), h);
    if (h < 0.14) plot = vec3(0.07, 0.10, 0.05);
    plot *= 0.88 + 0.24 * omNoise(p / 23.0 + id);
    // Mown or plowed rows, too fine to read from far away.
    float rows = sin((h > 0.5 ? f.x : f.y) * 96.0);
    plot *= 1.0 + 0.05 * rows * (1.0 - smoothstep(180.0, 700.0, r));

    // Hedgerows along the plot edges.
    vec2 toEdge = min(f, 1.0 - f) * vec2(120.0, 176.0);
    float edge = min(toEdge.x, toEdge.y);
    plot = mix(vec3(0.045, 0.07, 0.04), plot, aa(2.8, edge));

    // Woodlots: dark patches with ragged edges.
    float wood = omNoise(p / 170.0 + 3.1) * 0.68 + omNoise(p / 38.0 + 8.7) * 0.32;
    float woods = aa(0.67, wood);
    plot = mix(plot, vec3(0.045, 0.075, 0.04) * (0.8 + 0.4 * omNoise(p / 9.0)), woods);

    // The grounds around the venue: a mown lawn, with the plots starting
    // past the parking and the trees. Kits build on top of this.
    float grounds = smoothstep(170.0, 290.0, r + 40.0 * (omNoise(p / 60.0) - 0.5));
    vec3 lawn = vec3(0.085, 0.13, 0.06) * (0.9 + 0.2 * omNoise(p / 11.0));
    plot = mix(lawn, plot, grounds);

    // Two county roads, straight through.
    float roadA = abs(mod(q.x + 210.0, 840.0) - 420.0);
    float roadB = abs(mod(q.y + 330.0, 760.0) - 380.0);
    float road = (1.0 - min(aa(4.0, roadA), aa(3.0, roadB))) * grounds;

    // The town: a block grid in the sector toward -Z.
    float ang = atan(p.x, -p.y);
    float inTown = (1.0 - smoothstep(0.42, 0.62, abs(ang)))
        * smoothstep(300.0, 360.0, r) * (1.0 - smoothstep(820.0, 960.0, r));
    vec2 blockG = q / vec2(62.0, 76.0);
    vec2 blockId = floor(blockG);
    vec2 blockF = fract(blockG);
    float streets = min(aa(0.1, blockF.x) * aa(blockF.x, 0.9), aa(0.11, blockF.y) * aa(blockF.y, 0.89));
    vec3 roofs = mix(vec3(0.10, 0.10, 0.095), vec3(0.17, 0.13, 0.11), omHash12(blockId + 0.5));
    float lot = omNoise(blockF * 7.0 + blockId * 3.0);
    roofs = mix(vec3(0.07, 0.10, 0.055), roofs, aa(0.42, lot));
    vec3 town = mix(vec3(0.12, 0.12, 0.12), roofs, streets);
    vec3 col = mix(plot, town, inTown);
    col = mix(col, vec3(0.085, 0.085, 0.09), road);

    // Moonlight is a touch cooler than sunlight, not teal.
    col *= uLight * mix(vec3(1.0), vec3(0.95, 0.92, 1.0), uWindows);

    // Night: street lights in town and a scatter on the roads, and a pool
    // of light around the stadium.
    if (uWindows > 0.0) {
        vec2 lampId = floor(q / 26.0);
        vec2 lampF = fract(q / 26.0) - 0.5;
        float lampOn = step(0.62, omHash12(lampId + 2.1));
        float lamp = smoothstep(0.17, 0.02, length(lampF)) * lampOn;
        float lit = inTown * (1.0 - streets * 0.75) + road * 0.45;
        col += vec3(1.0, 0.72, 0.42) * lamp * lit * uWindows * 1.1;
        col += vec3(0.40, 0.28, 0.16) * 0.11 * inTown * uWindows;
    }
    col += vec3(0.42, 0.40, 0.31) * uSpill * exp(-max(r - 60.0, 0.0) / 70.0);

    // Haze with distance from the camera.
    float dist = length(vWorld - cameraPosition);
    float haze = clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
    col = mix(col, uHaze, pow(haze, 1.2));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

/**
 * A nearly flat disc out to `LAND_RISE_START`, then a very shallow cone. The kits'
 * ground plane is one huge quad, whose depth is imprecise at range; rising a
 * meter or so over a kilometer keeps the land clear of it without anyone being
 * able to see the slope.
 */
export function landGeometry(segments = 96): BufferGeometry {
    const rings = [
        { r: 0, y: 0 },
        { r: LAND_SHELF_FROM, y: 0 },
        { r: LAND_SHELF_TO, y: LAND_SHELF },
        { r: LAND_RISE_START, y: LAND_SHELF },
        {
            r: (LAND_RISE_START + LAND_OUTER_RADIUS) / 2,
            y: LAND_SHELF + LAND_RISE * 0.3,
        },
        { r: LAND_OUTER_RADIUS, y: LAND_SHELF + LAND_RISE },
    ];
    const positions: number[] = [];
    const index: number[] = [];
    rings.forEach(({ r, y }) => {
        for (let i = 0; i <= segments; i++) {
            const a = (i / segments) * Math.PI * 2;
            positions.push(Math.cos(a) * r, y, Math.sin(a) * r);
        }
    });
    const perRing = segments + 1;
    for (let b = 0; b < rings.length - 1; b++) {
        for (let i = 0; i < segments; i++) {
            const k = b * perRing + i;
            index.push(
                k,
                k + 1,
                k + perRing,
                k + 1,
                k + perRing + 1,
                k + perRing,
            );
        }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(positions, 3));
    g.setIndex(index);
    return g;
}

export interface Land {
    mesh: Mesh;
    /** Recolors for a preset (and shows or hides with the sky). */
    setPreset(preset: LightingPreset): void;
    /** Centers the land on the venue (only x and z are used). */
    setCenter(center: Vector3Tuple): void;
    dispose(): void;
}

export function createLand(): Land {
    const geometry = landGeometry();
    const material = new ShaderMaterial({
        fog: false,
        uniforms: {
            uCenter: { value: new Vector2() },
            uHaze: { value: new Color() },
            uLight: { value: 1 },
            uWindows: { value: 0 },
            uSpill: { value: 0 },
            uFogNear: { value: 140 },
            uFogFar: { value: 1700 },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
    });
    setGroundLayer(material, GROUND_LAYER.land);
    const mesh = new Mesh(geometry, material);
    mesh.name = "land";
    mesh.frustumCulled = false;
    mesh.position.y = LAND_Y;
    // Drawn after the kits' opaque meshes, so where it and the kits' ground
    // plane come out at the same depth, far from the camera, the land wins.
    mesh.renderOrder = 998;
    const u = material.uniforms;
    return {
        mesh,
        setPreset(preset) {
            const v = lightingValues(preset);
            u.uHaze.value.setHex(v.fog);
            u.uLight.value = v.sky.landLight;
            u.uWindows.value = v.sky.windows;
            u.uSpill.value = v.sky.landSpill;
            u.uFogNear.value = v.fogNear;
            u.uFogFar.value = v.fogFar;
            mesh.visible = v.skyVisible;
        },
        setCenter(center) {
            mesh.position.x = center[0];
            mesh.position.z = center[2];
            u.uCenter.value.set(center[0], center[2]);
        },
        dispose() {
            geometry.dispose();
            material.dispose();
        },
    };
}

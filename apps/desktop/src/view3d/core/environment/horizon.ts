// cspell:ignore fract tonemapping
/**
 * The distant horizon: two rings of silhouettes standing on the ground far
 * past the stands, so the world doesn't end at a flat plane. The near ring
 * (about 760 m out) is a treeline with a small town toward -Z, behind the far
 * stand from the press box, with a water tower and a steeple; at dusk and
 * night its windows and street lights come on. The far ring (about 1.3 km)
 * is rolling hills with a radio mast.
 *
 * Both rings are one mesh and one draw call. Each ring is a sloped band (a
 * cone frustum), so from the blimp it reads as a hillside rather than a
 * cardboard wall. The fragment shader cuts the silhouette from the band and
 * fades it toward the horizon color for aerial perspective, so it ignores
 * the scene fog. The rig owns it and shows it with the sky.
 */
import {
    BufferGeometry,
    Color,
    DoubleSide,
    Float32BufferAttribute,
    Mesh,
    ShaderMaterial,
    type Vector3Tuple,
} from "three";
import type { LightingPreset } from "../types";
import { lightingValues } from "./lighting";
import { NOISE_GLSL } from "./skyShader";

/** Radius of the near ring's crest (treeline and town), meters. */
export const HORIZON_NEAR_RADIUS = 760;
/** Radius of the far ring's crest (hills), meters. Inside the kits' ground. */
export const HORIZON_FAR_RADIUS = 1300;

interface RingSpec {
    /** Crest radius and the radius where the band meets the ground. */
    rTop: number;
    rBottom: number;
    /** Tallest silhouette the band must hold. */
    height: number;
    layer: number;
}

const RINGS: RingSpec[] = [
    {
        rTop: HORIZON_NEAR_RADIUS,
        rBottom: HORIZON_NEAR_RADIUS - 40,
        height: 60,
        layer: 0,
    },
    {
        rTop: HORIZON_FAR_RADIUS,
        rBottom: HORIZON_FAR_RADIUS - 260,
        height: 90,
        layer: 1,
    },
];

/** Both bands as one geometry with a per-vertex `aLayer`. */
export function horizonGeometry(segments = 256): BufferGeometry {
    const pos: number[] = [];
    const layer: number[] = [];
    const index: number[] = [];
    const bottomY = -6;
    for (const ring of RINGS) {
        const base = pos.length / 3;
        for (let i = 0; i <= segments; i++) {
            const a = (i / segments) * Math.PI * 2;
            const c = Math.cos(a);
            const s = Math.sin(a);
            pos.push(c * ring.rBottom, bottomY, s * ring.rBottom);
            pos.push(c * ring.rTop, ring.height, s * ring.rTop);
            layer.push(ring.layer, ring.layer);
        }
        for (let i = 0; i < segments; i++) {
            const k = base + i * 2;
            index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.setAttribute("aLayer", new Float32BufferAttribute(layer, 1));
    g.setIndex(index);
    g.computeBoundingSphere();
    return g;
}

const VERTEX = /* glsl */ `
attribute float aLayer;
varying vec3 vLocal;
varying float vLayer;
void main() {
    vLocal = position;
    vLayer = aLayer;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uNear;
uniform vec3 uFar;
uniform vec3 uHaze;
uniform float uNearHaze;
uniform float uFarHaze;
uniform float uWindows;
varying vec3 vLocal;
varying float vLayer;
${NOISE_GLSL}
const float PI = 3.14159265;
float ridge(float ang, float k, float scale) {
    vec2 c = vec2(cos(ang), sin(ang)) * k;
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
        s += a * omNoise(c * scale);
        scale *= 2.03;
        a *= 0.5;
    }
    return s / 0.9375;
}
float box(vec2 p, vec2 c, vec2 r) {
    vec2 q = abs(p - c) - r;
    return step(max(q.x, q.y), 0.0);
}
void main() {
    float ang = atan(vLocal.z, vLocal.x);
    float y = vLocal.y;
    vec3 col;
    float glow = 0.0;
    vec3 glowCol = vec3(1.0, 0.78, 0.48);
    if (vLayer < 0.5) {
        // Near ring: meters along the crest, town centered toward -Z.
        float x = ang * ${HORIZON_NEAR_RADIUS.toFixed(1)};
        float town = x + 0.5 * PI * ${HORIZON_NEAR_RADIUS.toFixed(1)};
        float inTown = 1.0 - smoothstep(110.0, 190.0, abs(town + 30.0));
        // Treeline: crowns about 7 m across over a slow rise and fall,
        // with a few gaps for fields.
        float slow = ridge(ang, 1.0, 9.0);
        float crowns = omNoise(vec2(x / 7.0, 0.5)) * 0.6 + omNoise(vec2(x / 3.1, 4.5)) * 0.4;
        float gaps = smoothstep(0.32, 0.4, ridge(ang + 1.3, 1.0, 5.0));
        float trees = (7.0 + 6.0 * slow + 4.0 * crowns) * mix(0.25, 1.0, gaps);
        // Town: blocks 12 m wide, one to three stories.
        float cellX = floor(town / 12.0);
        float hb = omHash12(vec2(cellX, 3.0));
        float bh = 5.0 + 6.0 * hb * hb + 4.0 * step(0.95, hb);
        float inGap = step(10.5, mod(town, 12.0));
        float buildings = bh * step(0.15, inTown) * (1.0 - inGap) * step(0.2, omHash12(vec2(cellX, 7.0)) + inTown * 0.6);
        float profile = max(trees * (1.0 - 0.55 * inTown), buildings);
        // Water tower: legs and a round tank.
        vec2 tp = vec2(town - 95.0, y);
        float tower = box(tp, vec2(-4.5, 14.0), vec2(0.5, 14.0)) + box(tp, vec2(4.5, 14.0), vec2(0.5, 14.0));
        tower += step(length((tp - vec2(0.0, 32.0)) / vec2(8.5, 6.0)), 1.0);
        tower += box(tp, vec2(0.0, 39.0), vec2(1.0, 1.5));
        // Steeple: a tower and a spire.
        vec2 sp = vec2(town + 120.0, y);
        float steeple = box(sp, vec2(0.0, 12.0), vec2(3.0, 12.0));
        steeple += step(abs(sp.x), max(0.0, (40.0 - sp.y) * 0.18)) * step(24.0, sp.y);
        float solid = max(step(y, profile), step(0.5, tower + steeple));
        if (solid < 0.5) discard;
        float isTree = step(buildings + 0.01, y) * (1.0 - step(0.5, tower + steeple));
        float shade = mix(0.8, 1.08, omHash12(vec2(floor(x / 6.0), 1.0)));
        vec3 build = mix(uNear, vec3(dot(uNear, vec3(0.33))) * 1.25, 0.6);
        col = mix(build, uNear * shade, isTree);
        col *= mix(0.78, 1.0, clamp(y / 18.0, 0.0, 1.0));
        // Windows: a grid on the buildings, about half lit.
        if (isTree < 0.5 && tower + steeple < 0.5) {
            vec2 wc = floor(vec2(town / 3.0, y / 3.4));
            vec2 wf = fract(vec2(town / 3.0, y / 3.4));
            float pane = step(0.25, wf.x) * step(wf.x, 0.75) * step(0.3, wf.y) * step(wf.y, 0.75);
            float on = step(0.72, omHash12(wc + 0.5));
            glow += pane * on * step(2.0, y) * (0.35 + 0.35 * omHash12(wc + 2.5));
            col *= 1.0 - pane * 0.25;
        }
        // Street lights along the base in and near town, and a red beacon.
        vec2 lp = vec2(mod(town, 34.0) - 17.0, y - 6.0);
        glow += smoothstep(1.3, 0.3, length(lp)) * step(0.05, inTown) * 1.1;
        col = mix(col, uHaze, uNearHaze);
        col += glowCol * glow * uWindows;
        col += vec3(1.0, 0.1, 0.05) * smoothstep(1.4, 0.3, length(tp - vec2(0.0, 41.5))) * 2.0 * uWindows;
    } else {
        // Far ring: low hills up to about 42 m, meters along the crest.
        float x = ang * ${HORIZON_FAR_RADIUS.toFixed(1)};
        float hills = 8.0 + 34.0 * pow(ridge(ang, 1.0, 2.6), 1.6);
        hills += 6.0 * omNoise(vec2(x / 24.0, 2.0));
        // A radio mast on a crest off to one side, with a red beacon.
        float mx = x - (-0.3 * PI) * ${HORIZON_FAR_RADIUS.toFixed(1)};
        float mastTop = 8.0 + 34.0 * pow(ridge(-0.3 * PI, 1.0, 2.6), 1.6) + 62.0;
        float mast = step(abs(mx), 1.2 * (1.0 - y / mastTop) + 0.4) * step(y, mastTop);
        if (y > hills && mast < 0.5) discard;
        col = uFar * mix(0.82, 1.0, clamp(y / 90.0, 0.0, 1.0));
        col = mix(col, uHaze, uFarHaze);
        col += vec3(1.0, 0.1, 0.05) * smoothstep(3.5, 0.8, length(vec2(mx, y - mastTop))) * 2.0 * uWindows;
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

export interface Horizon {
    mesh: Mesh;
    /** Recolors for a preset (and shows or hides with the sky). */
    setPreset(preset: LightingPreset): void;
    /** Centers the rings on the venue (only x and z are used). */
    setCenter(center: Vector3Tuple): void;
    dispose(): void;
}

export function createHorizon(): Horizon {
    const geometry = horizonGeometry();
    const material = new ShaderMaterial({
        side: DoubleSide,
        fog: false,
        uniforms: {
            uNear: { value: new Color() },
            uFar: { value: new Color() },
            uHaze: { value: new Color() },
            uNearHaze: { value: 0 },
            uFarHaze: { value: 0 },
            uWindows: { value: 0 },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
    });
    const mesh = new Mesh(geometry, material);
    mesh.name = "horizon";
    mesh.frustumCulled = false;
    mesh.renderOrder = 999;
    const u = material.uniforms;
    return {
        mesh,
        setPreset(preset) {
            const v = lightingValues(preset);
            u.uNear.value.setHex(v.sky.nearLand);
            u.uFar.value.setHex(v.sky.farLand);
            u.uHaze.value.setHex(v.fog);
            u.uNearHaze.value = v.sky.nearHaze;
            u.uFarHaze.value = v.sky.farHaze;
            u.uWindows.value = v.sky.windows;
            mesh.visible = v.skyVisible;
        },
        setCenter(center) {
            mesh.position.set(center[0], 0, center[2]);
        },
        dispose() {
            geometry.dispose();
            material.dispose();
        },
    };
}

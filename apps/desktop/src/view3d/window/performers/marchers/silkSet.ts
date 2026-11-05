// cspell:words glsl beginnormal skinbase skinnormal
/**
 * The flags' silks, drawn apart from the instruments (props-spec.md
 * section 7, ADR 0010 D-17): one instanced cloth mesh per detail tier for
 * every silk in the band, whatever the look, so 40 silks or 400 add one
 * draw call per tier. Each instance is one silk: a flat grid of UVs that
 * the vertex shader waves (`silkWave.ts`) in the silk's own frame, carries
 * to its bone's bind pose, then skins from the composer's texture like the
 * instruments. The wave goes in before skinning, so a silk follows its
 * hand through any hold or transition.
 *
 * - Cloth, not metal: metalness 0, matte, double-sided. A silk is plain in
 *   its color (the section's 2D fill, else its uniform preset's carry), or
 *   painted with its preset's pattern (`uniformPresets.ts`), sampled from
 *   {@link silkPatternTexture} at the grid's (u, v). Silk cues (C5.4) come
 *   later.
 * - No shadows at any quality (props-spec.md section 7, "Rendering").
 * - The wave reads only per-instance inputs written from the count, so a
 *   scrub back to a count draws the same silks as playing there.
 */
import * as THREE from "three";
import { writeMatrix } from "@/view3d/render/instanced-marchers.js";
import { COMPOSED_BONE_SHADER, type Composer } from "@/view3d/render/composer";
import { instrumentModel, type Detail } from "@/view3d/core/instruments";
import { hold as holdFor } from "@/view3d/core/instruments/holds";
import type { SilkSpec } from "@/view3d/core/instruments/model";
import {
    SILK_CUT_IDS,
    SILK_GRID,
    SILK_WAVE_SHADER,
    silkPhases,
    silkSeed,
} from "@/view3d/core/instruments/silkWave";
import { uniformKey } from "@/view3d/core/marchers/looks";
import {
    UNIFORM_PRESET_IDS,
    UNIFORM_PRESETS,
    type UniformPresetId,
} from "@/view3d/core/marchers/uniformPresets";
import { poseArms } from "./armPose";
import { instrumentFrames } from "./instrumentGeometry";
import { isNearCarrier } from "./hornSet";
import type { MarcherQuality, MarcherSlotLook } from "./marcherBodies";

/** How rough the cloth is: matte, with no sheen (ticket 10). */
export const SILK_ROUGHNESS = 0.8;

/**
 * A silk's grid of `fly` × `header` cells: positions are (u, v, 0), u
 * from the pole to the fly and v from the bottom to the top, which the
 * shader waves; `uv` is the same (u, v) for artwork. Wound so each
 * triangle faces ∂P/∂u × ∂P/∂v, the side the wave's normal is on.
 */
export function silkGrid(fly: number, header: number): THREE.BufferGeometry {
    const row = fly + 1;
    const n = row * (header + 1);
    const pos = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    for (let j = 0; j <= header; j++)
        for (let i = 0; i <= fly; i++) {
            const k = j * row + i;
            pos[k * 3] = uv[k * 2] = i / fly;
            pos[k * 3 + 1] = uv[k * 2 + 1] = j / header;
        }
    const idx: number[] = [];
    for (let j = 0; j < header; j++)
        for (let i = 0; i < fly; i++) {
            const a = j * row + i;
            idx.push(a, a + 1, a + row + 1, a, a + row + 1, a + row);
        }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    // the shader computes the normal, but without a normal attribute three
    // shades flat (found in the silk prototype)
    const normal = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) normal[k * 3 + 2] = 1;
    g.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
}

/** The presets that paint their silks, in {@link silkPatternTexture}'s order. */
export const SILK_PATTERN_IDS: readonly UniformPresetId[] =
    UNIFORM_PRESET_IDS.filter((id) => UNIFORM_PRESETS[id].silk);

/** One pattern's texels in {@link silkPatternTexture}: u across, v up. */
export const SILK_PATTERN_SIZE = { u: 128, v: 64 } as const;

let patternTexture: THREE.DataTexture | null = null;

/**
 * Every silk pattern, one band of {@link SILK_PATTERN_SIZE} each, stacked
 * up in {@link SILK_PATTERN_IDS}' order and sampled by the silk shader. It
 * doesn't depend on the show, so one texture serves every silk mesh.
 */
export function silkPatternTexture(): THREE.DataTexture {
    if (patternTexture) return patternTexture;
    const { u: w, v: h } = SILK_PATTERN_SIZE;
    const n = Math.max(1, SILK_PATTERN_IDS.length);
    const data = new Uint8Array(w * h * n * 4);
    SILK_PATTERN_IDS.forEach((id, k) => {
        const silk = UNIFORM_PRESETS[id].silk!;
        for (let j = 0; j < h; j++)
            for (let i = 0; i < w; i++) {
                const c = silk((i + 0.5) / w, (j + 0.5) / h);
                const o = ((k * h + j) * w + i) * 4;
                data[o] = (c >> 16) & 255;
                data[o + 1] = (c >> 8) & 255;
                data[o + 2] = c & 255;
                data[o + 3] = 255;
            }
    });
    const texture = new THREE.DataTexture(data, w, h * n);
    // the patterns are sRGB, as the presets' colors are
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    patternTexture = texture;
    return texture;
}

/** Per-instance attributes and how many floats each takes. */
const INSTANCE_ATTRIBUTES = {
    aSlot: 1,
    /** (fly, header, mirror, bone index) */
    aSilk: 4,
    /** The Cut: 0 the rectangle, else 1 + its index in `SILK_CUT_IDS` */
    aCut: 1,
    /** The silk frame to its bone's bind pose: three rows of a 3 × 4 affine. */
    aFrame0: 4,
    aFrame1: 4,
    aFrame2: 4,
    /** (wave phase, belly phase, ground speed, turn rate): written per frame */
    aMotion: 4,
    /** Linear RGB, for a plain silk. */
    aColor: 3,
    /** The silk's pattern: its index in `SILK_PATTERN_IDS`, or -1 for plain. */
    aPattern: 1,
} as const;
type InstanceAttribute = keyof typeof INSTANCE_ATTRIBUTES;
const STATIC: InstanceAttribute[] = [
    "aSlot",
    "aSilk",
    "aCut",
    "aFrame0",
    "aFrame1",
    "aFrame2",
    "aColor",
    "aPattern",
];

const SILK_HEAD = /* glsl */ `
${COMPOSED_BONE_SHADER}
${SILK_WAVE_SHADER}
attribute float aSlot;
attribute vec4 aSilk;
attribute float aCut;
attribute vec4 aFrame0;
attribute vec4 aFrame1;
attribute vec4 aFrame2;
attribute vec4 aMotion;
attribute vec3 aColor;
attribute float aPattern;
varying vec3 vSilkColor;
varying vec2 vSilkUv;
varying float vSilkPattern;
`;

const SILK_FRAGMENT_HEAD = /* glsl */ `
uniform sampler2D uSilkPatterns;
uniform float uSilkPatternCount;
varying vec3 vSilkColor;
varying vec2 vSilkUv;
varying float vSilkPattern;
/** The silk's pattern at (u, v), kept inside its own band of the texture. */
vec3 silkPatternColor(vec2 uv, float pattern) {
  float inset = 0.5 / ${SILK_PATTERN_SIZE.v.toFixed(1)};
  float v = clamp(uv.y, inset, 1.0 - inset);
  return texture2D(uSilkPatterns, vec2(uv.x, (pattern + v) / uSilkPatternCount)).rgb;
}
`;

/**
 * The silks' cloth material, skinned from `composer`: the wave and the
 * silk frame before skinning, the normal from the wave's derivatives.
 */
export function silkMaterial(composer: Composer): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0,
        roughness: SILK_ROUGHNESS,
        side: THREE.DoubleSide,
        envMapIntensity: 1,
    });
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uComposed = composer.uniform;
        shader.uniforms.uSilkPatterns = { value: silkPatternTexture() };
        shader.uniforms.uSilkPatternCount = {
            value: Math.max(1, SILK_PATTERN_IDS.length),
        };
        shader.vertexShader = shader.vertexShader
            .replace("#include <common>", `#include <common>\n${SILK_HEAD}`)
            .replace(
                "#include <beginnormal_vertex>",
                `mat4 silkFrame = transpose(mat4(aFrame0, aFrame1, aFrame2, vec4(0.0, 0.0, 0.0, 1.0)));
  vec3 silkLocal, silkNormal;
  silkPoint(position.x, position.y, aSilk.xyz, aMotion, aCut, silkLocal, silkNormal);
  vec3 objectNormal = mat3(silkFrame) * silkNormal;
  vSilkColor = aColor;
  vSilkUv = position.xy;
  vSilkPattern = aPattern;`,
            )
            .replace(
                "#include <skinbase_vertex>",
                "mat4 bakeSkin = composedBone(int(aSlot + 0.5), int(aSilk.w + 0.5));",
            )
            .replace(
                "#include <skinnormal_vertex>",
                "objectNormal = (bakeSkin * vec4(objectNormal, 0.0)).xyz;",
            )
            // the wave and the silk frame go in before skinning
            .replace(
                "#include <skinning_vertex>",
                "transformed = (bakeSkin * (silkFrame * vec4(silkLocal, 1.0))).xyz;",
            );
        shader.fragmentShader = shader.fragmentShader
            .replace(
                "#include <common>",
                `#include <common>\n${SILK_FRAGMENT_HEAD}`,
            )
            .replace(
                "#include <color_fragment>",
                `#include <color_fragment>
  diffuseColor.rgb *= vSilkPattern < -0.5
    ? vSilkColor
    : silkPatternColor(vSilkUv, floor(vSilkPattern + 0.5));`,
            );
    };
    material.customProgramCacheKey = () => "view3d-silk";
    return material;
}

/** One silk: whose it is and what the shader needs that never changes. */
interface SilkInstance {
    slot: number;
    seed: number;
    /** INSTANCE_ATTRIBUTES' static values, by name. */
    values: Record<InstanceAttribute, number[]>;
}

/** Each slot's motion at a moment, for the silks' wave. */
export interface SilkMotionFrame {
    /** The show clock, s. */
    seconds: number;
    /** Per slot: ground speed (m/s), turn rate (rad/s), distance covered (m). */
    speed: Float32Array;
    turn: Float32Array;
    distance: Float64Array;
}

interface Tier {
    mesh: THREE.InstancedMesh;
    /** Silk indexes in instance order this frame. */
    silks: number[];
}

/** The silk frame in its bone's bind pose: the bone's `toBind` times the spec's frame. */
function silkFrame(spec: SilkSpec, toBind: THREE.Matrix4): THREE.Matrix4 {
    const b = spec.basis;
    const o = spec.origin;
    // prettier-ignore
    const local = new THREE.Matrix4().set(
        b[0], b[1], b[2], o[0],
        b[3], b[4], b[5], o[1],
        b[6], b[7], b[8], o[2],
        0, 0, 0, 1,
    );
    return toBind.clone().multiply(local);
}

const lin = (hex: number) => new THREE.Color(hex); // sRGB hex to linear

/** Every silk the looks carry, slot by slot, with what never changes. */
function silkInstances(
    skeleton: THREE.Skeleton,
    looks: readonly MarcherSlotLook[],
): SilkInstance[] {
    const silks: SilkInstance[] = [];
    // silks by look: the same specs and frames for every wearer
    const byLook = new Map<
        string,
        { spec: SilkSpec; bone: number; frame: number[] }[]
    >();
    looks.forEach((l, slot) => {
        const carry = l.uniform.options.carry;
        if (!carry) return;
        const key = uniformKey(l.uniform);
        let specs = byLook.get(key);
        if (!specs) {
            // silk specs don't depend on the detail; the pieces aren't used
            const model = instrumentModel(
                carry.model,
                "low",
                carry.options ?? {},
            );
            const h = holdFor(carry.family, l.uniform.options.hold);
            const frameOf = instrumentFrames(
                skeleton,
                poseArms(skeleton, h),
                h,
            );
            specs = (model.silks ?? []).map((spec) => {
                const f = frameOf(spec.bone ?? model.bone ?? "handR");
                const e = silkFrame(spec, f.toBind).elements; // column-major
                return {
                    spec,
                    bone: f.index,
                    // rows of the 3 × 4 affine
                    frame: [0, 1, 2].flatMap((r) => [
                        e[r],
                        e[4 + r],
                        e[8 + r],
                        e[12 + r],
                    ]),
                };
            });
            byLook.set(key, specs);
        }
        const { carryColor, silk } = l.uniform.options;
        const color = lin(
            l.silkColor ?? carryColor ?? l.uniform.colors.primary,
        );
        // a fill or a Silk cue (`silkColor`) makes the silk plain
        const pattern =
            silk && l.silkColor === undefined
                ? SILK_PATTERN_IDS.indexOf(silk)
                : -1;
        specs.forEach(({ spec, bone, frame }, n) =>
            silks.push({
                slot,
                // by slot, so a marcher added earlier in the band doesn't
                // change the wave of every silk after it
                seed: silkSeed(slot * 2 + n),
                values: {
                    aSlot: [slot],
                    aSilk: [spec.fly, spec.header, spec.mirror, bone],
                    aCut: [spec.cut ? SILK_CUT_IDS.indexOf(spec.cut) + 1 : 0],
                    aFrame0: frame.slice(0, 4),
                    aFrame1: frame.slice(4, 8),
                    aFrame2: frame.slice(8, 12),
                    aMotion: [0, 0, 0, 0],
                    aColor: [color.r, color.g, color.b],
                    aPattern: [pattern],
                },
            }),
        );
    });
    return silks;
}

/** One tier's instanced mesh: the grid at `detail`, room for `n` silks. */
function silkTierMesh(
    detail: Detail,
    n: number,
    material: THREE.Material,
): THREE.InstancedMesh {
    const grid = SILK_GRID[detail];
    const g = silkGrid(grid.fly, grid.header);
    for (const [name, size] of Object.entries(INSTANCE_ATTRIBUTES)) {
        const a = new THREE.InstancedBufferAttribute(
            new Float32Array(n * size),
            size,
        );
        a.setUsage(THREE.DynamicDrawUsage);
        g.setAttribute(name, a);
    }
    const mesh = new THREE.InstancedMesh(g, material, n);
    mesh.name = `view3d-silks-${detail}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    // no shadows at any quality (props-spec.md section 7)
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.count = 0;
    return mesh;
}

export class SilkSet {
    readonly meshes: THREE.InstancedMesh[] = [];
    private readonly silks: SilkInstance[];
    private readonly tiers: Tier[] = [];
    /** Per silk: whether it was near last frame. */
    private readonly near = new Map<number, boolean>();
    /** Per silk: (wave phase, belly phase, speed, turn), as the shader reads it. */
    private readonly motion: Float32Array;
    /** The slots that carry a silk, each once. */
    readonly slots: readonly number[];

    constructor(
        skeleton: THREE.Skeleton,
        looks: readonly MarcherSlotLook[],
        quality: MarcherQuality,
        readonly material: THREE.Material,
    ) {
        this.silks = silkInstances(skeleton, looks);
        this.slots = [...new Set(this.silks.map((s) => s.slot))];
        this.motion = new Float32Array(this.silks.length * 4);
        this.silks.forEach((s, i) => {
            const p = silkPhases(0, 0, s.seed);
            this.motion[i * 4] = p.wavePhase;
            this.motion[i * 4 + 1] = p.bellyPhase;
        });
        if (this.silks.length === 0) return;
        const details: Detail[] =
            quality === "high" ? ["high", "low"] : ["low"];
        for (const detail of details) {
            const mesh = silkTierMesh(detail, this.silks.length, material);
            this.tiers.push({ mesh, silks: [] });
            this.meshes.push(mesh);
        }
    }

    /** Draw calls per frame: one per tier, however many silks. */
    get drawCalls(): number {
        return this.meshes.length;
    }

    /** How many silks the set draws. */
    get count(): number {
        return this.silks.length;
    }

    /**
     * Each silk's wave inputs at a moment, from its slot's motion. Every
     * value comes from `frame` alone, so the same moment writes the same
     * numbers however the clock got there.
     */
    writeMotion(frame: SilkMotionFrame): void {
        this.silks.forEach((s, i) => {
            const p = silkPhases(
                frame.seconds,
                frame.distance[s.slot] ?? 0,
                s.seed,
            );
            this.motion[i * 4] = p.wavePhase;
            this.motion[i * 4 + 1] = p.bellyPhase;
            this.motion[i * 4 + 2] = frame.speed[s.slot] ?? 0;
            this.motion[i * 4 + 3] = frame.turn[s.slot] ?? 0;
        });
    }

    /**
     * Places every placed slot's silks in its tier's mesh, packed by
     * distance as the instruments are (`hornSet.ts`), with this frame's
     * motion. `camera` null draws everything at full detail.
     */
    writeFrame(
        xz: Float32Array,
        heading: Float32Array,
        placed: Uint8Array,
        scale: Float32Array,
        camera: [number, number, number] | null,
    ): void {
        if (this.tiers.length === 0) return;
        const lists: number[][] = this.tiers.map(() => []);
        this.silks.forEach((s, i) => {
            if (!placed[s.slot]) return;
            let tier = 0;
            if (this.tiers.length > 1 && camera) {
                const near = isNearCarrier(
                    xz[s.slot * 2],
                    xz[s.slot * 2 + 1],
                    camera,
                    this.near.get(i),
                );
                this.near.set(i, near);
                tier = near ? 0 : 1;
            }
            lists[tier].push(i);
        });
        this.tiers.forEach((t, k) => {
            const list = lists[k];
            const g = t.mesh.geometry;
            const changed =
                list.length !== t.silks.length ||
                list.some((s, i) => s !== t.silks[i]);
            const matrices = t.mesh.instanceMatrix.array as Float32Array;
            const motion = g.attributes
                .aMotion as THREE.InstancedBufferAttribute;
            list.forEach((silk, i) => {
                const slot = this.silks[silk].slot;
                writeMatrix(
                    matrices,
                    i,
                    xz[slot * 2],
                    xz[slot * 2 + 1],
                    heading[slot],
                    scale[slot],
                );
                for (let c = 0; c < 4; c++)
                    motion.array[i * 4 + c] = this.motion[silk * 4 + c];
                if (!changed) return;
                for (const name of STATIC) {
                    const a = g.attributes[
                        name
                    ] as THREE.InstancedBufferAttribute;
                    const v = this.silks[silk].values[name];
                    for (let c = 0; c < v.length; c++)
                        a.array[i * v.length + c] = v[c];
                }
            });
            if (changed)
                for (const name of STATIC)
                    (
                        g.attributes[name] as THREE.InstancedBufferAttribute
                    ).needsUpdate = true;
            motion.needsUpdate = true;
            t.mesh.count = list.length;
            t.mesh.instanceMatrix.needsUpdate = true;
            t.silks = list;
        });
    }

    dispose(): void {
        for (const mesh of this.meshes) {
            mesh.geometry.dispose();
            mesh.dispose();
        }
        this.meshes.length = 0;
        this.tiers.length = 0;
    }
}

// cspell:ignore highp glsl GLSL skinbase SKINBASE skinnormal
/**
 * The compose pass (performer-behavior.md section 8.3): once a frame, every
 * performer's final skinning matrices, from the per-channel bake and each
 * performer's channel state, into a small float texture that bodies and
 * instruments skin from with one matrix per influence.
 *
 * - **GPU** (WebGL2 with `EXT_color_buffer_float`): one render-to-texture
 *   pass, a fragment per (performer, bone, matrix column), into an RGBA32F
 *   target. Measured cheaper than today's per-vertex lerp (findings.md,
 *   2026-10-11).
 * - **CPU** fallback, when float targets are missing: `composeMath.ts` in
 *   JavaScript, uploaded each composed frame. The same math the GPU pass
 *   mirrors, so the two draw alike.
 *
 * Layout: 4 texels a bone, 24 bones (23 plus the prop bone), 96 texels a
 * performer, 42 performers a texture row (4032 texels).
 */
import * as THREE from "three";
import type { ChannelBake } from "./channelBake";
import { composeSetupOf, composeSlot, type ComposeSetup } from "./composeMath";
import {
    emptyState,
    stateSize,
    STATE_PER_ROW,
    STATE_TEXELS,
    writeChannelState,
    writeFeetState,
    type ChannelPlay,
    type FeetPlay,
} from "./channelState";

/** Bones per composed performer: 23 plus the prop bone. */
export const COMPOSED_BONES = 24;
/** Texels per composed performer. */
export const COMPOSED_STRIDE = COMPOSED_BONES * 4;
/** Performers per row of the composed texture. */
export const COMPOSED_PER_ROW = Math.floor(4096 / COMPOSED_STRIDE);

export type ComposeMode = "gpu" | "cpu";

const PASS_VERT = /* glsl */ `
precision highp float;
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Mirrors composeSlot (composeMath.ts) line for line.
const PASS_FRAG = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uAnim;
uniform sampler2D uState;
uniform float uCount;
uniform int uRowsPerColumn, uBones, uSlots, uTurnRoot, uAnchorBody, uAnchorHorn, uProp;
uniform bool uTurnOn;
uniform float uWaist;
uniform int uChannel[${COMPOSED_BONES}];
uniform int uTurnClass[${COMPOSED_BONES}];
out vec4 outColor;

ivec2 bakedRow(int row) {
  int col = row / uRowsPerColumn;
  return ivec2(col * uBones * 4, row - col * uRowsPerColumn);
}
mat4 bakedBone(int bone, ivec2 at) {
  int x = at.x + bone * 4;
  return mat4(texelFetch(uAnim, ivec2(x, at.y), 0), texelFetch(uAnim, ivec2(x + 1, at.y), 0),
              texelFetch(uAnim, ivec2(x + 2, at.y), 0), texelFetch(uAnim, ivec2(x + 3, at.y), 0));
}
mat4 sampleBone(int bone, ivec2 a, ivec2 b, float f) {
  return (1.0 - f) * bakedBone(bone, a) + f * bakedBone(bone, b);
}
vec3 turnData(ivec2 at) {
  int x = at.x + uTurnRoot * 4;
  return vec3(texelFetch(uAnim, ivec2(x, at.y), 0).w, texelFetch(uAnim, ivec2(x + 1, at.y), 0).w,
              texelFetch(uAnim, ivec2(x + 2, at.y), 0).w);
}
mat4 yawMatrix(float t) { float c = cos(t), s = sin(t); return mat4(c, 0.0, -s, 0.0, 0.0, 1.0, 0.0, 0.0, s, 0.0, c, 0.0, 0.0, 0.0, 0.0, 1.0); }
vec4 state(int slot, int k) {
  return texelFetch(uState, ivec2((slot % ${STATE_PER_ROW}) * ${STATE_TEXELS} + k, slot / ${STATE_PER_ROW}), 0);
}
// a Body (3) or Horn (5) row at the clock; false when the channel has none
bool chanAt(int slot, int texel, out ivec2 a, out ivec2 b, out float f) {
  vec4 s0 = state(slot, texel), s1 = state(slot, texel + 1);
  a = ivec2(0); b = ivec2(0); f = 0.0;
  if (s0.x < 0.0) return false;
  float t = uCount * s1.x + s0.w;
  t = s1.y > 0.0 ? clamp(t, 0.0, s0.z) : mod(t, s0.z);
  float u = t / s0.z * s0.y;
  float c0 = min(floor(u), s0.y - 1.0);
  f = u - c0;
  a = bakedRow(int(s0.x + c0));
  b = bakedRow(int(s0.x + c0) + 1);
  return true;
}
// the Feet at the clock, set once in main
ivec2 ra, rb, sa, sb;
float fr, bw;
bool blend;
mat4 feetBone(int bone) {
  mat4 m = sampleBone(bone, ra, rb, fr);
  if (blend) m = (1.0 - bw) * m + bw * sampleBone(bone, sa, sb, fr);
  return m;
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int per = p.x / ${COMPOSED_STRIDE};
  int slot = p.y * ${COMPOSED_PER_ROW} + per;
  if (slot >= uSlots || per >= ${COMPOSED_PER_ROW}) { outColor = vec4(0.0); return; }
  int bone = (p.x - per * ${COMPOSED_STRIDE}) / 4;
  int column = p.x % 4;
  vec4 f0 = state(slot, 0), f1 = state(slot, 1);
  float rate = f1.x;
  float u = f0.y > 0.0 && f0.z > 0.0 ? mod(uCount * rate + f0.w, f0.z) / f0.z * f0.y : 0.0;
  float r0 = floor(u);
  fr = u - r0;
  bw = f1.z;
  float first = bw >= 1.0 ? f1.y : f0.x;
  blend = bw > 0.0 && bw < 1.0;
  ra = bakedRow(int(first + r0)); rb = bakedRow(int(first + r0) + 1);
  sa = bakedRow(int(f1.y + r0)); sb = bakedRow(int(f1.y + r0) + 1);
  int ch = uChannel[bone];
  mat4 m;
  if (ch == 0) m = feetBone(bone);
  else {
    ivec2 b0, b1, h0, h1; float bf, hf;
    bool bodyOn = chanAt(slot, 3, b0, b1, bf);
    bool hornOn = ch == 2 && chanAt(slot, 5, h0, h1, hf);
    mat4 spBody = mat4(1.0);
    if (bodyOn) spBody = feetBone(uAnchorBody) * inverse(sampleBone(uAnchorBody, b0, b1, bf));
    if (!hornOn) m = bodyOn ? spBody * sampleBone(bone, b0, b1, bf) : feetBone(bone);
    else if (bone == uProp && state(slot, 6).z > 0.0) m = sampleBone(bone, h0, h1, hf);
    else {
      mat4 chest = bodyOn ? spBody * sampleBone(uAnchorHorn, b0, b1, bf) : feetBone(uAnchorHorn);
      m = chest * inverse(sampleBone(uAnchorHorn, h0, h1, hf)) * sampleBone(bone, h0, h1, hf);
    }
  }
  // the leg turn, per bone by its class
  vec4 tn = state(slot, 2);
  float te = clamp(((f0.y > 0.0 ? u / f0.y : 0.0) - tn.z) / max(tn.w - tn.z, 1e-6), 0.0, 1.0);
  float turnT = tn.x == tn.y ? tn.x : mix(tn.x, tn.y, te * te * te * (te * (te * 6.0 - 15.0) + 10.0));
  if (uTurnOn && turnT != 0.0) {
    mat4 turnLeg = yawMatrix(turnT);
    int cls = uTurnClass[bone];
    if (cls == 1) m = turnLeg * m;
    else {
      vec3 td = (1.0 - fr) * turnData(ra) + fr * turnData(rb);
      if (blend) td = (1.0 - bw) * td + bw * ((1.0 - fr) * turnData(sa) + fr * turnData(sb));
      float a = td.z, r = uWaist;
      vec3 h = vec3(td.x, 0.0, td.y), th = mat3(turnLeg) * h;
      if (cls == 2) {
        mat4 tw = yawMatrix(atan(r * sin(a + turnT), 1.0 + r * cos(a + turnT)) - atan(r * sin(a), 1.0 + r * cos(a)));
        m = tw * m;
        m[3].xyz += th - mat3(tw) * h;
      } else m[3].xyz += th - h;
    }
  }
  outColor = m[column];
}
`;

/** Composed matrices for `n` performer slots, refreshed by {@link Composer.update}. */
export class Composer {
    /** Set to compose on the CPU even where the GPU pass works (checks, tests). */
    static preferCpu = false;

    readonly width = COMPOSED_PER_ROW * COMPOSED_STRIDE;
    readonly height: number;
    readonly state: Float32Array;
    readonly stateTexture: THREE.DataTexture;
    /** The composed texture, for the skinning shaders; null until the first update. */
    readonly uniform: { value: THREE.Texture | null } = { value: null };
    readonly setup: ComposeSetup;
    mode: ComposeMode | null = null;
    private target: THREE.WebGLRenderTarget | null = null;
    private passScene: THREE.Scene | null = null;
    private readonly passCamera = new THREE.OrthographicCamera(
        -1,
        1,
        1,
        -1,
        0,
        1,
    );
    private passMaterial: THREE.RawShaderMaterial | null = null;
    private out: Float32Array | null = null;
    private outTexture: THREE.DataTexture | null = null;
    private dirty = true;
    private lastCount = Number.NaN;

    constructor(
        readonly bake: ChannelBake,
        readonly n: number,
    ) {
        if (bake.bones !== COMPOSED_BONES)
            throw new Error(
                `Composer: the bake has ${bake.bones} bones a row, not ${COMPOSED_BONES}`,
            );
        this.setup = composeSetupOf(bake.boneNames, bake.turn);
        this.height = Math.max(1, Math.ceil(n / COMPOSED_PER_ROW));
        this.state = emptyState(n);
        const { width, height } = stateSize(n);
        this.stateTexture = new THREE.DataTexture(
            this.state,
            width,
            height,
            THREE.RGBAFormat,
            THREE.FloatType,
        );
        this.stateTexture.needsUpdate = true;
    }

    writeFeet(slot: number, play: FeetPlay): void {
        if (slot >= this.n) return;
        writeFeetState(this.state, slot, play);
        this.touch();
    }

    writeChannel(
        slot: number,
        channel: "body" | "horn",
        play: ChannelPlay | null,
    ): void {
        if (slot >= this.n) return;
        writeChannelState(this.state, slot, channel, play);
        this.touch();
    }

    private touch() {
        this.stateTexture.needsUpdate = true;
        this.dirty = true;
    }

    /** Composes the frame at count clock `count`, unless nothing changed since the last one. */
    update(gl: THREE.WebGLRenderer, count: number, force = false): void {
        if (!this.mode) this.init(gl);
        if (!force && !this.dirty && count === this.lastCount) return;
        this.dirty = false;
        this.lastCount = count;
        if (this.mode === "gpu") {
            this.passMaterial!.uniforms.uCount.value = count;
            const prev = gl.getRenderTarget();
            const autoClear = gl.autoClear;
            gl.autoClear = false;
            gl.setRenderTarget(this.target);
            gl.render(this.passScene!, this.passCamera);
            gl.setRenderTarget(prev);
            gl.autoClear = autoClear;
        } else {
            this.composeCpu(count, this.out!);
            this.outTexture!.needsUpdate = true;
        }
    }

    private init(gl: THREE.WebGLRenderer) {
        const floatTargets =
            gl.capabilities.isWebGL2 &&
            gl.extensions.has("EXT_color_buffer_float");
        this.mode = floatTargets && !Composer.preferCpu ? "gpu" : "cpu";
        if (this.mode === "gpu") {
            this.target = new THREE.WebGLRenderTarget(this.width, this.height, {
                type: THREE.FloatType,
                format: THREE.RGBAFormat,
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                depthBuffer: false,
                stencilBuffer: false,
                generateMipmaps: false,
            });
            const s = this.setup;
            const b = this.bake;
            this.passMaterial = new THREE.RawShaderMaterial({
                glslVersion: THREE.GLSL3,
                vertexShader: PASS_VERT,
                fragmentShader: PASS_FRAG,
                depthTest: false,
                depthWrite: false,
                uniforms: {
                    uAnim: { value: b.texture },
                    uState: { value: this.stateTexture },
                    uCount: { value: 0 },
                    uRowsPerColumn: { value: b.rowsPerColumn },
                    uBones: { value: b.bones },
                    uSlots: { value: this.n },
                    uTurnRoot: { value: s.turn?.root ?? 0 },
                    uAnchorBody: { value: s.anchorBody },
                    uAnchorHorn: { value: s.anchorHorn },
                    uProp: { value: s.propBone },
                    uTurnOn: { value: !!s.turn },
                    uWaist: { value: s.turn?.waist ?? 0 },
                    uChannel: { value: Array.from(s.channel) },
                    uTurnClass: { value: Array.from(s.turnClass) },
                },
            });
            const quad = new THREE.Mesh(
                new THREE.PlaneGeometry(2, 2),
                this.passMaterial,
            );
            quad.frustumCulled = false;
            this.passScene = new THREE.Scene();
            this.passScene.add(quad);
            this.uniform.value = this.target.texture;
        } else {
            this.out = new Float32Array(this.width * this.height * 4);
            this.outTexture = new THREE.DataTexture(
                this.out,
                this.width,
                this.height,
                THREE.RGBAFormat,
                THREE.FloatType,
            );
            this.outTexture.needsUpdate = true;
            this.uniform.value = this.outTexture;
        }
    }

    /** Every slot composed on the CPU into `out`, laid out as the texture is. */
    composeCpu(count: number, out: Float32Array): void {
        const img = this.bake.texture.image as {
            data: Float32Array;
            width: number;
        };
        const anim = {
            data: img.data,
            width: img.width,
            rowsPerColumn: this.bake.rowsPerColumn,
        };
        for (let slot = 0; slot < this.n; slot++)
            composeSlot(
                anim,
                this.setup,
                this.state,
                slot,
                count,
                out,
                (Math.floor(slot / COMPOSED_PER_ROW) * this.width +
                    (slot % COMPOSED_PER_ROW) * COMPOSED_STRIDE) *
                    4,
            );
    }

    /**
     * GPU mode: the pass's output read back against the CPU composition at
     * the same clock. The largest difference in any matrix entry, and the
     * largest entry for scale. Null on the CPU path.
     */
    crossCheck(gl: THREE.WebGLRenderer) {
        if (this.mode !== "gpu" || !this.target) return null;
        const gpu = new Float32Array(this.width * this.height * 4);
        gl.readRenderTargetPixels(
            this.target,
            0,
            0,
            this.width,
            this.height,
            gpu,
        );
        const cpu = new Float32Array(gpu.length);
        this.composeCpu(this.lastCount, cpu);
        let maxDiff = 0;
        let maxAbs = 0;
        for (let k = 0; k < gpu.length; k++) {
            maxDiff = Math.max(maxDiff, Math.abs(gpu[k] - cpu[k]));
            maxAbs = Math.max(maxAbs, Math.abs(cpu[k]));
        }
        return { count: this.lastCount, maxDiff, maxAbs };
    }

    dispose(): void {
        this.stateTexture.dispose();
        this.target?.dispose();
        this.passMaterial?.dispose();
        this.passScene?.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        this.outTexture?.dispose();
        this.uniform.value = null;
    }
}

/** The skinning shader's head: the composed texture and one slot per instance. */
const COMPOSED_HEAD = /* glsl */ `
uniform highp sampler2D uComposed;
attribute vec4 skinIndex;
attribute vec4 skinWeight;
attribute float aSlot;
attribute vec3 aSkin;
varying vec3 vSkinTone;
mat4 composedBone(int slot, int bone) {
  int x = (slot % ${COMPOSED_PER_ROW}) * ${COMPOSED_STRIDE} + bone * 4, y = slot / ${COMPOSED_PER_ROW};
  return mat4(texelFetch(uComposed, ivec2(x, y), 0), texelFetch(uComposed, ivec2(x + 1, y), 0),
              texelFetch(uComposed, ivec2(x + 2, y), 0), texelFetch(uComposed, ivec2(x + 3, y), 0));
}
`;

const COMPOSED_SKINBASE = /* glsl */ `
  int cSlot = int(aSlot + 0.5);
  mat4 bakeSkin = mat4(0.0);
  for (int k = 0; k < 4; k++) {
    float w = skinWeight[k];
    if (w > 0.0) bakeSkin += w * composedBone(cSlot, int(skinIndex[k] + 0.5));
  }
  vSkinTone = aSkin;
`;

/**
 * Patches a MeshStandardMaterial (plain, or from `uniform-shader.js`) to
 * skin from the composer's texture: one matrix per influence, the slot from
 * each instance's `aSlot`. With the uniform shader, the skin tone comes from
 * each instance's `aSkin`. Returns the same material.
 */
export function composedSkinning<M extends THREE.Material>(
    material: M,
    composer: Composer,
): M {
    const base = material.onBeforeCompile;
    const key = material.customProgramCacheKey?.() ?? "";
    material.onBeforeCompile = (shader, renderer) => {
        base?.call(material, shader, renderer);
        shader.uniforms.uComposed = composer.uniform;
        shader.vertexShader =
            COMPOSED_HEAD +
            shader.vertexShader
                .replace("#include <skinbase_vertex>", COMPOSED_SKINBASE)
                .replace(
                    "#include <skinnormal_vertex>",
                    "objectNormal = (bakeSkin * vec4(objectNormal, 0.0)).xyz;",
                )
                .replace(
                    "#include <skinning_vertex>",
                    "transformed = (bakeSkin * vec4(transformed, 1.0)).xyz;",
                );
        // the uniform shader's skin line, made per instance; warn if it ever stops matching
        const skinLine = "if (part == 0) return uSkin;";
        if (
            shader.fragmentShader.includes("uniformColor()") &&
            !shader.fragmentShader.includes(skinLine)
        )
            // eslint-disable-next-line no-console -- a silent miss would paint every skin alike
            console.warn(
                "composedSkinning: uniform shader's skin line not found; every instance will use the material's uSkin",
            );
        shader.fragmentShader =
            "varying vec3 vSkinTone;\n" +
            shader.fragmentShader.replace(
                skinLine,
                "if (part == 0) return vSkinTone;",
            );
    };
    material.customProgramCacheKey = () => key + "|composed-instances";
    return material;
}

/**
 * A body's or instrument's geometry for n instances: the source's vertex
 * buffers (shared, not copied) plus each instance's slot and skin tone.
 * Free it with `disposeInstancedGeometry`.
 */
export function composedGeometry(
    source: THREE.BufferGeometry,
    n: number,
): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(source.attributes))
        g.setAttribute(k, a);
    g.setIndex(source.index);
    g.setAttribute(
        "aSlot",
        new THREE.InstancedBufferAttribute(new Float32Array(n), 1),
    );
    g.setAttribute(
        "aSkin",
        new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3),
    );
    return g;
}

/** sRGB hex to linear, as THREE.Color does. */
const lin = (x: number) =>
    x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;

/** Points instance `i` at performer slot `slot`, with its skin tone (sRGB) when given. */
export function writeInstance(
    mesh: THREE.InstancedMesh,
    i: number,
    slot: number,
    skin?: number,
): void {
    const g = mesh.geometry;
    const aSlot = g.attributes.aSlot as THREE.InstancedBufferAttribute;
    aSlot.array[i] = slot;
    aSlot.needsUpdate = true;
    if (skin === undefined) return;
    const aSkin = g.attributes.aSkin as THREE.InstancedBufferAttribute;
    aSkin.array[i * 3] = lin(((skin >> 16) & 255) / 255);
    aSkin.array[i * 3 + 1] = lin(((skin >> 8) & 255) / 255);
    aSkin.array[i * 3 + 2] = lin((skin & 255) / 255);
    aSkin.needsUpdate = true;
}

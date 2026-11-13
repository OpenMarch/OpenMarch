// cspell:words skinbase skinnormal fract XYZW
/**
 * The shakos' feather plumes, drawn apart from the bodies: one instanced
 * mesh for the whole band, so the plume is one draw call however many
 * marchers wear one. The body's own plume (part 8, a narrow spike) is left
 * out of the body's draw (`marcherBodies.ts`).
 *
 * - The plume is built in `core/marchers/plumeGeometry.ts`: the feather
 *   cards at `high` quality, one lumpy solid at `low`.
 * - Each instance rides its slot's head bone, skinned from the composer's
 *   texture like the instruments, from the socket where the body's plume
 *   stood (its lowest point, centred), so it sits on the shako of every
 *   body type and of the block body.
 * - The feathers are cut out of their cards in the fragment shader with
 *   alpha-to-coverage, so their edges stay smooth with MSAA. The plume is
 *   one color, the look's `plume`.
 * - No shadows, as the bodies cast none.
 */
import * as THREE from "three";
import { writeMatrix } from "@/view3d/render/instanced-marchers.js";
import { COMPOSED_BONE_SHADER, type Composer } from "@/view3d/render/composer";
import { PART } from "@/view3d/core/marchers/looks";
import {
    plumeGeometryData,
    type PlumeTier,
} from "@/view3d/core/marchers/plumeGeometry";

/** Where a plume stands on a body: its socket in bind space and the bone it rides. */
export interface PlumeSocket {
    x: number;
    y: number;
    z: number;
    bone: number;
}

/** How far the plume sits above the body's plume socket, metres: just clear of the crown. */
const SOCKET_LIFT = 0.005;

/**
 * Where `source`'s own plume (part 8) stands: its lowest point, centred on
 * its vertices, and the bone they ride. Null when the body has no plume.
 */
export function plumeSocket(source: THREE.BufferGeometry): PlumeSocket | null {
    const part = source.getAttribute("_part");
    const pos = source.getAttribute("position");
    const bones = source.getAttribute("skinIndex");
    if (!part || !pos || !bones) return null;
    let minY = Infinity;
    let sx = 0;
    let sz = 0;
    let n = 0;
    let bone = -1;
    for (let i = 0; i < pos.count; i++) {
        if (Math.round(part.getX(i)) !== PART.plume) continue;
        minY = Math.min(minY, pos.getY(i));
        sx += pos.getX(i);
        sz += pos.getZ(i);
        n++;
        if (bone < 0) bone = Math.round(bones.getX(i));
    }
    if (n === 0) return null;
    return { x: sx / n, y: minY + SOCKET_LIFT, z: sz / n, bone };
}

/** A plume tier as a `BufferGeometry`, with the per-instance attributes added for `n` plumes. */
export function plumeGeometry(
    tier: PlumeTier,
    n: number,
): THREE.BufferGeometry {
    const d = plumeGeometryData(tier);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(d.position, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(d.normal, 3));
    g.setAttribute("aHeight", new THREE.BufferAttribute(d.height, 1));
    g.setAttribute("aCardUv", new THREE.BufferAttribute(d.uv, 2));
    g.setAttribute("aCard", new THREE.BufferAttribute(d.card, 1));
    g.setAttribute("aSeed", new THREE.BufferAttribute(d.seed, 1));
    g.setAttribute("aShade", new THREE.BufferAttribute(d.shade, 1));
    for (const [name, size] of Object.entries(INSTANCE_ATTRIBUTES))
        g.setAttribute(
            name,
            new THREE.InstancedBufferAttribute(
                new Float32Array(n * size),
                size,
            ),
        );
    return g;
}

/** Per-instance attributes and how many floats each takes. */
const INSTANCE_ATTRIBUTES = {
    aSlot: 1,
    /** The socket in bind space (x, y, z) and the bone index. */
    aSocket: 4,
    /** Linear RGB. */
    aColor: 3,
} as const;

const PLUME_HEAD = /* glsl */ `
${COMPOSED_BONE_SHADER}
attribute float aSlot;
attribute vec4 aSocket;
attribute vec3 aColor;
attribute float aHeight;
attribute vec2 aCardUv;
attribute float aCard;
attribute float aSeed;
attribute float aShade;
varying vec3 vPlumeColor;
varying float vHeight;
varying vec2 vCardUv;
varying float vCard;
varying float vSeed;
`;

const PLUME_FRAGMENT_HEAD = /* glsl */ `
varying vec3 vPlumeColor;
varying float vHeight;
varying vec2 vCardUv;
varying float vCard;
varying float vSeed;
float plumeHash(float x) { return fract(sin(x * 127.1) * 43758.5453); }
/**
 * Greater than 0 inside the feather on a card: x across (-1 to 1), y along
 * (0 to 1). Each feather has its own lopsided vanes, barb spacing and
 * ragged edge from its seed. The barbs fade where they'd be under a pixel.
 */
float featherDistance(vec2 q, float s) {
  float y = clamp(q.y, 0.0, 1.0);
  float side = q.x > 0.0 ? 1.0 : 0.7 + 0.3 * plumeHash(s + 1.0);
  float envelope = (y < 0.55
    ? 0.5 + 0.5 * sqrt(y / 0.55)
    : pow(max(0.0, 1.0 - pow((y - 0.55) / 0.45, 2.0)), 0.3)) * side;
  float freq = 20.0 + 14.0 * plumeHash(s + 2.0);
  float phase = q.y * freq - abs(q.x) * (2.0 + 2.0 * plumeHash(s + 3.0)) + s * 17.0;
  float detail = 1.0 - smoothstep(0.25, 0.7, fwidth(phase));
  float amp = 0.05 + 0.1 * plumeHash(s + 4.0);
  float wave = 0.5 + 0.35 * sin(6.2832 * phase) + 0.3 * sin(6.2832 * phase * 2.37 + s * 9.0);
  float split = smoothstep(0.06, 0.0, abs(fract(q.y * 2.0 + s * 5.0) - 0.5) - 0.4)
    * step(0.6, plumeHash(s + 5.0)) * 0.35;
  return envelope * (1.0 - amp * detail * wave - split * detail) - abs(q.x);
}
`;

/** How rough the feathers are: matte. */
export const PLUME_ROUGHNESS = 0.9;

/**
 * The plume material for `tier`, skinned from `composer`: the socket offset
 * before skinning on the instance's head bone, the color per instance, and
 * at `high` the feathers cut out of their cards.
 */
export function plumeMaterial(
    composer: Composer,
    tier: PlumeTier,
): THREE.MeshStandardMaterial {
    const cards = tier === "high";
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0,
        roughness: PLUME_ROUGHNESS,
        side: cards ? THREE.DoubleSide : THREE.FrontSide,
    });
    if (cards) {
        material.alphaTest = 0.5;
        material.alphaToCoverage = true;
    }
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uComposed = composer.uniform;
        shader.vertexShader = shader.vertexShader
            .replace("#include <common>", `#include <common>\n${PLUME_HEAD}`)
            .replace(
                "#include <skinbase_vertex>",
                "mat4 bakeSkin = composedBone(int(aSlot + 0.5), int(aSocket.w + 0.5));",
            )
            .replace(
                "#include <skinnormal_vertex>",
                "objectNormal = (bakeSkin * vec4(objectNormal, 0.0)).xyz;",
            )
            .replace(
                "#include <begin_vertex>",
                `#include <begin_vertex>
  vPlumeColor = aColor * aShade;
  vHeight = aHeight;
  vCardUv = aCardUv;
  vCard = aCard;
  vSeed = aSeed;`,
            )
            .replace(
                "#include <skinning_vertex>",
                "transformed = (bakeSkin * vec4(transformed + aSocket.xyz, 1.0)).xyz;",
            );
        shader.fragmentShader = shader.fragmentShader
            .replace(
                "#include <common>",
                `#include <common>\n${PLUME_FRAGMENT_HEAD}`,
            )
            .replace(
                "#include <color_fragment>",
                `#include <color_fragment>
  vec3 plumeColor = vPlumeColor * mix(0.9, 1.0, smoothstep(0.0, 0.3, vHeight));
  // the feather is worked out for every fragment and mixed in on cards, not
  // branched on: its fwidth needs uniform control flow
  float onCard = step(0.5, vCard);
  float featherAlpha = clamp(0.5 + featherDistance(vCardUv, vSeed) * 6.0, 0.0, 1.0);
  float featherShade = (0.86 + 0.24 * plumeHash(vSeed + 6.0)) // feather to feather
    * mix(0.72, 1.0, smoothstep(0.0, 0.5, vCardUv.y)) // tucked under the one above
    * (1.0 - 0.05 * (1.0 - smoothstep(0.0, 0.05, abs(vCardUv.x)))); // the shaft
  diffuseColor.a = mix(diffuseColor.a, featherAlpha, onCard);
  diffuseColor.rgb *= plumeColor * mix(1.0, featherShade, onCard);`,
            )
            // the normals point out of the plume as a whole: keep them on
            // both faces of a card instead of flipping them for the back
            .replace(
                "#include <normal_fragment_begin>",
                "#include <normal_fragment_begin>\n  normal = normalize(vNormal);",
            )
            // a soft rim, and light through the thin feathers: both scale
            // the light the plume gets, so it darkens with the scene at night
            .replace(
                "#include <lights_fragment_end>",
                `#include <lights_fragment_end>
  {
    float rim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
    float glow = rim * 0.2 + vCard * 0.22 * smoothstep(0.2, 0.9, vCardUv.y);
    reflectedLight.directDiffuse *= 1.0 + glow;
    reflectedLight.indirectDiffuse *= 1.0 + glow;
  }`,
            );
    };
    material.customProgramCacheKey = () => `view3d-plume-${tier}`;
    return material;
}

/**
 * Draws `mesh` without writing alpha. With alpha-to-coverage three leaves
 * the feather's fractional alpha in the output (it doesn't define OPAQUE),
 * and the canvas has an alpha channel, so a feather's edge would let the
 * page show through. Three sets the color mask from the material after this
 * hook, but its cache already says "all on", so it leaves the mask alone;
 * turning alpha back on after the draw matches its cache again.
 */
export function keepCanvasOpaque(mesh: THREE.Object3D): void {
    mesh.onBeforeRender = (renderer) =>
        renderer.getContext().colorMask(true, true, true, false);
    mesh.onAfterRender = (renderer) =>
        renderer.getContext().colorMask(true, true, true, true);
}

/** One plume: the slot that wears it, where it stands and its color. */
export interface PlumeWearer {
    slot: number;
    socket: PlumeSocket;
    /** sRGB hex. */
    color: number;
}

export class PlumeSet {
    readonly mesh: THREE.InstancedMesh;
    private readonly slots: number[];

    constructor(
        wearers: readonly PlumeWearer[],
        tier: PlumeTier,
        readonly material: THREE.Material,
    ) {
        const n = wearers.length;
        this.slots = wearers.map((w) => w.slot);
        const g = plumeGeometry(tier, n);
        const slot = g.getAttribute("aSlot") as THREE.InstancedBufferAttribute;
        const socket = g.getAttribute(
            "aSocket",
        ) as THREE.InstancedBufferAttribute;
        const color = g.getAttribute(
            "aColor",
        ) as THREE.InstancedBufferAttribute;
        const c = new THREE.Color();
        wearers.forEach((w, i) => {
            slot.setX(i, w.slot);
            socket.setXYZW(
                i,
                w.socket.x,
                w.socket.y,
                w.socket.z,
                w.socket.bone,
            );
            c.set(w.color); // sRGB hex to linear
            color.setXYZ(i, c.r, c.g, c.b);
        });
        this.mesh = new THREE.InstancedMesh(g, material, n);
        this.mesh.name = `view3d-plumes-${tier}`;
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // the bounds would be the rest pose's: the instances move
        this.mesh.frustumCulled = false;
        this.mesh.castShadow = false;
        this.mesh.receiveShadow = false;
        if ((material as THREE.MeshStandardMaterial).alphaToCoverage)
            keepCanvasOpaque(this.mesh);
    }

    /** How many plumes the set draws. */
    get count(): number {
        return this.slots.length;
    }

    /** Draw calls per frame. */
    get drawCalls(): number {
        return this.slots.length > 0 ? 1 : 0;
    }

    /** Places each plume with its slot: collapsed (not drawn) when the slot isn't placed. */
    writeFrame(
        xz: Float32Array,
        heading: Float32Array,
        placed: Uint8Array,
        scale: Float32Array,
    ): void {
        const array = this.mesh.instanceMatrix.array as Float32Array;
        this.slots.forEach((slot, i) =>
            writeMatrix(
                array,
                i,
                xz[slot * 2],
                xz[slot * 2 + 1],
                heading[slot],
                placed[slot] ? scale[slot] : 0,
            ),
        );
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    dispose(): void {
        this.mesh.geometry.dispose();
        this.mesh.dispose();
    }
}

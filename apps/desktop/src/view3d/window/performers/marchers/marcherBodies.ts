/**
 * The 3D View's marchers drawn with om-pose's instanced renderer (ADR 0002
 * D-7): one `InstancedMesh` per (body, uniform), skinned on the GPU from one
 * texture of baked clips.
 *
 * - `high` quality draws the seven v4u bodies; `low` draws om-pose's block
 *   bodies (264 triangles against 1,796), which play the same clips.
 * - A look that carries an instrument gets a second `InstancedMesh` over
 *   the same instances: the horn, posed by the look's hold, in a smooth
 *   metallic material (docs/3d/instruments.md §4).
 * - Built once per marcher set, look set, clip set and quality; per frame
 *   the caller writes positions and the count clock.
 * - Dispose with {@link MarcherBodies.dispose}: the instanced geometries
 *   share the bodies' vertex buffers, so they go through
 *   `disposeInstancedGeometry`, never `geometry.dispose()`.
 */
import * as THREE from "three";
import {
    bakeClips,
    blockGeometry,
    disposeInstancedGeometry,
    instancedGeometry,
    instancedSkinning,
    writeMarcher,
    writeMatrix,
    type Bake,
    type MarcherClip,
} from "@/view3d/vendor/om-pose/instanced-marchers.js";
import { createUniformMaterial } from "@/view3d/vendor/om-pose/uniform-shader.js";
import {
    partVisible,
    uniformKey,
    type BodyType,
    type PerformerBody,
    type UniformLook,
} from "@/view3d/core/marchers/looks";
import { FIELD_SURFACE_Y } from "@/view3d/core/field";
import {
    hold as holdFor,
    holdId,
    type HoldFamily,
    type HoldState,
} from "@/view3d/core/instruments/holds";
import type { LoadedBody } from "./marcherAssets";
import { holdClip, poseArms } from "./armPose";
import { instrumentMaterial } from "./instrumentGeometry";
import { HornSet } from "./hornSet";
import { mirrorClip, mirrorName } from "./mirrorClip";
import {
    platformClip,
    platformRig,
    platformWeight,
    type PlatformRig,
} from "./platformClip";

/**
 * Contact shadow under each marcher: a soft dark disc on the turf, in place
 * of real shadows (the instanced skinning has no depth pass yet).
 */
export const CONTACT_RADIUS = 0.38;
export const CONTACT_OPACITY = 0.35;
const CONTACT_Y = FIELD_SURFACE_Y + 0.005;

/** A radial falloff, opaque at the center: the contact disc's alpha. */
function contactAlpha(size = 64): THREE.DataTexture {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
            const r =
                Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
            const a = Math.max(0, 1 - r);
            const v = Math.round(255 * a * a * (3 - 2 * a));
            const o = (y * size + x) * 4;
            data[o] = data[o + 1] = data[o + 2] = v;
            data[o + 3] = 255;
        }
    const t = new THREE.DataTexture(data, size, size);
    t.needsUpdate = true;
    return t;
}

/**
 * The source's triangles that a look shows: parts the look doesn't wear
 * (other instruments, the aussie hat, the cape, the shako on guard) are
 * left out of the draw instead of skinned and then discarded. Every v4u
 * triangle belongs to one part, so this draws exactly what the shader would.
 */
export function visibleIndex(
    source: THREE.BufferGeometry,
    look: UniformLook,
): THREE.BufferAttribute | null {
    const index = source.index;
    const part = source.getAttribute("_part");
    if (!index || !part) return null;
    const keep: number[] = [];
    for (let t = 0; t < index.count; t += 3) {
        const a = index.getX(t);
        if (partVisible(look, Math.round(part.getX(a))))
            keep.push(a, index.getX(t + 1), index.getX(t + 2));
    }
    if (keep.length === index.count) return null;
    return new THREE.BufferAttribute(
        index.count > 65535 || source.attributes.position.count > 65535
            ? new Uint32Array(keep)
            : new Uint16Array(keep),
        1,
    );
}

/**
 * `disposeInstancedGeometry` for a geometry with its own index: frees the
 * per-instance buffers and that index, never the body's shared buffers.
 */
function disposeMarcherGeometry(
    g: THREE.BufferGeometry,
    own: "shared" | "index",
) {
    if (own === "shared") {
        disposeInstancedGeometry(g);
        return;
    }
    for (const k of Object.keys(g.attributes))
        if (
            !(g.attributes[k] as THREE.InstancedBufferAttribute)
                .isInstancedBufferAttribute
        )
            g.deleteAttribute(k);
    g.dispose();
}

/** One contact disc per marcher, at the feet. */
function createContactMesh(n: number): THREE.InstancedMesh {
    const disc = new THREE.CircleGeometry(CONTACT_RADIUS, 24);
    disc.rotateX(-Math.PI / 2);
    const mesh = new THREE.InstancedMesh(
        disc,
        new THREE.MeshBasicMaterial({
            color: 0x000000,
            alphaMap: contactAlpha(),
            transparent: true,
            opacity: CONTACT_OPACITY,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
        }),
        n,
    );
    mesh.name = "view3d-marcher-contact";
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    return mesh;
}

/** One marcher's instance: which body it wears and in which uniform. */
export interface MarcherSlotLook {
    body: PerformerBody;
    uniform: UniformLook;
}

export type MarcherQuality = "low" | "high";

interface MeshEntry {
    mesh: THREE.InstancedMesh;
    /** Slot index per instance. */
    slots: number[];
    /** What the body geometry owns: nothing (shared buffers) or its own part-filtered index. */
    own: "shared" | "index";
}

/** The hold id of a slot that carries nothing: its clips bake unposed. */
export const NO_HOLD = "none";

/** The hold a look plays: `<family>:<state>`, or NO_HOLD when it carries nothing. */
export function slotHoldId(look: UniformLook): string {
    const c = look.options.carry;
    return c ? holdId(c.family, look.options.hold) : NO_HOLD;
}

/** The bake row name of a clip played in a hold. */
export function rowKey(clip: string, hold: string): string {
    return hold === NO_HOLD ? clip : `${clip}@${hold}`;
}

const parseHoldId = (id: string) => {
    const [family, state] = id.split(":") as [HoldFamily, HoldState];
    return holdFor(family, state);
};

/** Which foot the band steps off on. "right" plays every clip mirrored. */
export type StepOffFoot = "left" | "right";

/** The clips to load for `names`: on the right foot, each row's mirrored partner too. */
export function clipsToLoad(
    names: readonly string[],
    foot: StepOffFoot,
): string[] {
    const out = new Set(names);
    if (foot === "right") for (const n of names) out.add(mirrorName(n));
    return [...out];
}

/**
 * The clip a row bakes from: on the right foot the mirror of its partner
 * (`mirrorName`), so slides and built turns keep their travel direction
 * while the feet swap; then backward marching and closes go up on the
 * platform of the foot (`platformClip.ts`).
 */
export function clipForBake(
    name: string,
    clips: Record<string, THREE.AnimationClip>,
    foot: StepOffFoot,
    rig: PlatformRig,
): THREE.AnimationClip {
    let clip = clips[name];
    if (foot === "right") {
        const partner = mirrorName(name);
        const source = clips[partner];
        if (!source)
            throw new Error(
                `3D View: clip ${partner} isn't loaded to mirror as ${name}`,
            );
        clip = mirrorClip(source, name);
    }
    const weight = platformWeight(name);
    return weight ? platformClip(clip, rig, weight) : clip;
}

/**
 * Every v4u body shares one skeleton, so any of them bakes for all. Each
 * clip is baked once per hold in `holds` (docs/3d/instruments.md §5): the
 * arm tracks replaced by the hold's pose, under `rowKey` names. Each row's
 * clip comes from `clipForBake`.
 */
export function bakeForBodies(
    bodies: ReadonlyMap<BodyType, LoadedBody>,
    clips: Record<string, THREE.AnimationClip>,
    holds: readonly string[] = [NO_HOLD],
    foot: StepOffFoot = "left",
    /** When given, only these rows (`rowKey`) are baked: the ones marchers play. */
    only?: ReadonlySet<string>,
): Bake {
    const first = bodies.values().next().value;
    if (!first) throw new Error("3D View: no bodies to bake on");
    const rig = platformRig(first.mesh.skeleton);
    const sources: Record<string, THREE.AnimationClip> = {};
    for (const name of Object.keys(clips))
        sources[name] = clipForBake(name, clips, foot, rig);
    const all: Record<string, THREE.AnimationClip> = {};
    for (const h of holds) {
        const pose =
            h === NO_HOLD
                ? null
                : poseArms(first.mesh.skeleton, parseHoldId(h));
        for (const name of Object.keys(clips)) {
            if (only && !only.has(rowKey(name, h))) continue;
            const clip = sources[name];
            all[rowKey(name, h)] = pose
                ? holdClip(clip, pose, rowKey(name, h))
                : clip;
        }
    }
    return bakeClips(THREE, first.scene, all);
}

export class MarcherBodies {
    readonly group = new THREE.Group();
    readonly bake: Bake;
    private readonly entries: MeshEntry[] = [];
    private readonly materials: THREE.Material[] = [];
    /** The instruments, one group per look, near and far detail (`hornSet.ts`). */
    private readonly horns: HornSet | null = null;
    private readonly blockSource: THREE.BufferGeometry | null = null;
    private readonly contact: THREE.InstancedMesh;
    /** Mesh entry and instance index per slot. */
    private readonly meshOf: Int32Array;
    private readonly instanceOf: Int32Array;
    private readonly scaleOf: Float32Array;
    /** The hold id each slot plays (`slotHoldId`). */
    private readonly holdIds: string[];

    constructor(
        bodies: ReadonlyMap<BodyType, LoadedBody>,
        bake: Bake,
        looks: readonly MarcherSlotLook[],
        quality: MarcherQuality,
    ) {
        this.bake = bake;
        this.group.name = "view3d-marchers";
        this.meshOf = new Int32Array(looks.length).fill(-1);
        this.instanceOf = new Int32Array(looks.length);
        this.scaleOf = new Float32Array(looks.length);
        this.holdIds = looks.map((l) => slotHoldId(l.uniform));

        this.contact = createContactMesh(looks.length);
        this.group.add(this.contact);

        if (quality === "low") {
            const anyBody = bodies.values().next().value!;
            this.blockSource = blockGeometry(THREE, anyBody.mesh.skeleton);
        }
        // Group the slots by mesh: (body type, uniform) at high, uniform at low.
        const groups = new Map<
            string,
            { type: BodyType; look: UniformLook; slots: number[] }
        >();
        looks.forEach((l, i) => {
            const u = uniformKey(l.uniform);
            const key = quality === "low" ? u : `${l.body.bodyType}|${u}`;
            let g = groups.get(key);
            if (!g) {
                g = { type: l.body.bodyType, look: l.uniform, slots: [] };
                groups.set(key, g);
            }
            g.slots.push(i);
            this.scaleOf[i] = l.body.heightClass;
        });
        const materialByLook = new Map<string, THREE.Material>();
        for (const g of groups.values()) {
            const u = uniformKey(g.look);
            let material = materialByLook.get(u);
            if (!material) {
                material = instancedSkinning(
                    THREE,
                    createUniformMaterial(THREE, {
                        style: g.look.style,
                        colors: g.look.colors,
                        options: g.look.options,
                    }),
                    bake,
                );
                materialByLook.set(u, material);
                this.materials.push(material);
            }
            const { mesh, own } = this.buildMesh(bodies, material, g);
            const entry = this.entries.length;
            g.slots.forEach((slot, k) => {
                this.meshOf[slot] = entry;
                this.instanceOf[slot] = k;
                writeMarcher(mesh, k, {
                    row: this.firstRow(),
                    skin: looks[slot].body.skinTone,
                });
            });
            this.entries.push({ mesh, slots: g.slots, own });
            this.group.add(mesh);
        }
        if (looks.some((l) => l.uniform.options.carry)) {
            // in `materials` so writeFrame drives its clip clock and dispose frees it
            const material = instrumentMaterial(bake);
            this.materials.push(material);
            this.horns = new HornSet(bodies, bake, looks, quality, material);
            for (const m of this.horns.meshes) this.group.add(m);
        }
    }

    /** One InstancedMesh for a group of slots sharing a body and a look. */
    private buildMesh(
        bodies: ReadonlyMap<BodyType, LoadedBody>,
        material: THREE.Material,
        g: { type: BodyType; look: UniformLook; slots: number[] },
    ) {
        const source = this.blockSource ?? bodies.get(g.type)!.mesh.geometry;
        const filtered = this.blockSource ? null : visibleIndex(source, g.look);
        const own: MeshEntry["own"] = filtered ? "index" : "shared";
        const geometry = instancedGeometry(THREE, source, g.slots.length);
        if (filtered) geometry.setIndex(filtered);
        const mesh = new THREE.InstancedMesh(
            geometry,
            material,
            g.slots.length,
        );
        mesh.name = `view3d-marchers-${g.type}`;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // The bounds are computed once and don't follow the instances.
        mesh.frustumCulled = false;
        // No shadows: om-pose's depth pass isn't patched, so a shadow
        // would show the rest pose (openmarch-3d.md, "Not done yet").
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        return { mesh, own };
    }

    /** The hold id slot `slot` plays, for `rowKey`. */
    holdOf(slot: number): string {
        return this.holdIds[slot] ?? NO_HOLD;
    }

    private firstRow() {
        const row = Object.values(this.bake.rows)[0];
        if (!row) throw new Error("3D View: empty bake");
        return row;
    }

    /** Draw calls this set issues per frame: a body mesh per group, plus the instruments. */
    get drawCalls(): number {
        return this.entries.length + (this.horns?.drawCalls ?? 0);
    }

    /** Sets what slot `slot` plays; call when its clip changes. */
    setClip(slot: number, clip: MarcherClip): void {
        const e = this.meshOf[slot];
        if (e < 0) return;
        writeMarcher(this.entries[e].mesh, this.instanceOf[slot], clip);
        this.horns?.setClip(slot, clip);
    }

    /**
     * Places every slot: at (x, z) facing `heading` when placed, collapsed
     * (not drawn) otherwise. `count` is the show's count clock. `camera`
     * picks each instrument's detail; null draws them all at full detail.
     */
    writeFrame(
        xz: Float32Array,
        heading: Float32Array,
        placed: Uint8Array,
        count: number,
        camera: [number, number, number] | null = null,
    ): void {
        for (const { mesh, slots } of this.entries) {
            const array = mesh.instanceMatrix.array as Float32Array;
            for (let k = 0; k < slots.length; k++) {
                const i = slots[k];
                writeMatrix(
                    array,
                    k,
                    xz[i * 2],
                    xz[i * 2 + 1],
                    heading[i],
                    placed[i] ? this.scaleOf[i] : 0,
                );
            }
            mesh.instanceMatrix.needsUpdate = true;
        }
        this.horns?.writeFrame(xz, heading, placed, this.scaleOf, camera);
        const discs = this.contact.instanceMatrix.array as Float32Array;
        for (let i = 0; i < placed.length; i++) {
            const o = i * 16;
            discs.fill(0, o, o + 16);
            if (!placed[i]) continue;
            const s = this.scaleOf[i];
            discs[o] = s;
            discs[o + 5] = 1;
            discs[o + 10] = s;
            discs[o + 12] = xz[i * 2];
            discs[o + 13] = CONTACT_Y;
            discs[o + 14] = xz[i * 2 + 1];
            discs[o + 15] = 1;
        }
        this.contact.instanceMatrix.needsUpdate = true;
        for (const m of this.materials)
            (
                m.userData.uniforms as { uCount: { value: number } }
            ).uCount.value = count;
    }

    dispose(): void {
        for (const { mesh, own } of this.entries) {
            disposeMarcherGeometry(mesh.geometry, own);
            mesh.dispose();
        }
        this.horns?.dispose();
        for (const m of this.materials) m.dispose();
        this.blockSource?.dispose();
        this.contact.geometry.dispose();
        const cm = this.contact.material as THREE.MeshBasicMaterial;
        cm.alphaMap?.dispose();
        cm.dispose();
        this.contact.dispose();
        this.entries.length = 0;
        this.group.clear();
    }
}

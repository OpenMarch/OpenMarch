/**
 * The 3D View's marchers drawn with the instanced renderer (ADR 0010 D-7,
 * performer-behavior.md section 8.3): one `InstancedMesh` per (body type,
 * `bodyKey`), skinned from the composer's texture, which composes each
 * performer's channels once a frame from the per-channel bake.
 *
 * - `high` quality draws the seven v4u bodies; `low` draws om-pose's block
 *   bodies (264 triangles against 1,796), which play the same clips.
 * - The shakos' plumes are one more `InstancedMesh` (`plumeSet.ts`), feather
 *   cards at `high` and one lumpy solid at `low`; the bodies leave their own
 *   plume out.
 * - A look that carries an instrument gets a second `InstancedMesh` over
 *   the same instances: the horn, posed by the look's hold, in a smooth
 *   metallic material (docs/3d/instruments.md §4).
 * - Built once per marcher set, look set, bake and quality; per frame the
 *   caller writes positions and the count clock, then `compose`s.
 * - Dispose with {@link MarcherBodies.dispose}: the instanced geometries
 *   share the bodies' vertex buffers, so they go through
 *   `disposeInstancedGeometry`, never `geometry.dispose()`.
 */
import * as THREE from "three";
import {
    blockGeometry,
    disposeInstancedGeometry,
    writeMatrix,
} from "@/view3d/render/instanced-marchers.js";
import {
    bakeChannels,
    type ChannelBake,
    type HornRowSpec,
} from "@/view3d/render/channelBake";
import {
    Composer,
    composedGeometry,
    composedSkinning,
    writeInstance,
} from "@/view3d/render/composer";
import type { ChannelPlay, FeetPlay } from "@/view3d/render/channelState";
import { createUniformMaterial } from "@/view3d/render/uniform-shader.js";
import {
    bodyKey,
    PART,
    partVisible,
    type BodyType,
    type PerformerBody,
    type UniformLook,
} from "@/view3d/core/marchers/looks";
import { GROUND_LAYER, setGroundLayer } from "@/view3d/core/environment";
import { FIELD_SURFACE_Y } from "@/view3d/core/field";
import { STAND_Y } from "../performerData";
import { holdId } from "@/view3d/core/instruments/holds";
import type { LoadedBody } from "./marcherAssets";
import { instrumentMaterial } from "./instrumentGeometry";
import { HornSet } from "./hornSet";
import { SilkSet, silkMaterial, type SilkMotionFrame } from "./silkSet";
import {
    PlumeSet,
    plumeMaterial,
    plumeSocket,
    type PlumeSocket,
    type PlumeWearer,
} from "./plumeSet";
import { mirrorClip, mirrorName } from "./mirrorClip";
import { plainRow } from "@/view3d/core/marchers/planner";
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

/** The uniform shader's glove line (`render/uniform-shader.js`). */
export const GLOVE_LINE = "if (part == 5) return uGloves;";
/** The per-instance skin tone, as `composedSkinning` declares it. */
const BARE_HAND_LINE = "if (part == 5) return vSkinTone;";

/**
 * Patches a material from `composedSkinning` so its hands (the gloves part)
 * show each instance's skin tone instead of the glove color: a look without
 * gloves. Call it after `composedSkinning`, which declares `vSkinTone`.
 */
export function bareHands(material: THREE.Material): THREE.Material {
    const base = material.onBeforeCompile;
    const key = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
        base.call(material, shader, renderer);
        if (!shader.fragmentShader.includes(GLOVE_LINE))
            console.warn(
                "bareHands: uniform shader's glove line not found; the hands keep the glove color",
            );
        shader.fragmentShader = shader.fragmentShader.replace(
            GLOVE_LINE,
            BARE_HAND_LINE,
        );
    };
    material.customProgramCacheKey = () => key + "|bare-hands";
    return material;
}

/**
 * The source's triangles that a look shows: parts the look doesn't wear
 * (other instruments, the aussie hat, the cape, the shako on guard) are
 * left out of the draw instead of skinned and then discarded. Every v4u
 * triangle belongs to one part, so this draws exactly what the shader would.
 * Parts in `drop` are left out too: ones another mesh draws instead.
 */
export function visibleIndex(
    source: THREE.BufferGeometry,
    look: UniformLook,
    drop: readonly number[] = [],
): THREE.BufferAttribute | null {
    const index = source.index;
    const part = source.getAttribute("_part");
    if (!index || !part) return null;
    const keep: number[] = [];
    for (let t = 0; t < index.count; t += 3) {
        const a = index.getX(t);
        const p = Math.round(part.getX(a));
        if (partVisible(look, p) && !drop.includes(p))
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
        // Over the field at any distance (the field has a ground layer too).
        setGroundLayer(
            new THREE.MeshBasicMaterial({
                color: 0x000000,
                alphaMap: contactAlpha(),
                transparent: true,
                opacity: CONTACT_OPACITY,
                depthWrite: false,
            }),
            GROUND_LAYER.contact,
        ),
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
    /**
     * sRGB: a carried flag's silk, plain, from a Silk cue (props-spec.md
     * section 6). Without one the silk takes the uniform's carry: the
     * section's 2D fill, else its preset's color and silk pattern.
     */
    silkColor?: number;
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

/** Which foot the band steps off on. "right" plays every clip mirrored. */
export type StepOffFoot = "left" | "right";

/** Whether row `name` bakes mirrored, and the row it mirrors. */
function mirrored(name: string, foot: StepOffFoot) {
    const { row, mirrored: rightFootRow } = plainRow(name);
    return { row, mirror: rightFootRow !== (foot === "right") };
}

/**
 * The clips to load for `names`: each mirrored row's partner too. A row
 * is mirrored when a right-foot move plays it (`mirrorRow`), or for every
 * row when the whole bake is on the right foot.
 */
export function clipsToLoad(
    names: readonly string[],
    foot: StepOffFoot,
): string[] {
    const out = new Set(names);
    for (const n of names) {
        const { row, mirror } = mirrored(n, foot);
        if (mirror) out.add(mirrorName(row));
    }
    return [...out];
}

/**
 * The clip a row bakes from: a mirrored row (a right-foot move's, or any
 * row on a right-foot bake) is the mirror of its partner (`mirrorName`), so
 * slides and built turns keep their travel direction while the feet swap;
 * then backward marching and closes go up on the platform of the foot
 * (`platformClip.ts`).
 */
export function clipForBake(
    name: string,
    clips: Record<string, THREE.AnimationClip>,
    foot: StepOffFoot,
    rig: PlatformRig,
): THREE.AnimationClip {
    const { row, mirror } = mirrored(name, foot);
    let clip = clips[name] ?? clips[row];
    if (mirror) {
        const partner = mirrorName(row);
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
 * Every v4u body shares one skeleton, so any of them bakes for all. The
 * Feet rows are the clips, each from `clipForBake`; the Horn/Equipment rows
 * are `horn` (holds and transitions, `hornRows.ts`). Rows add up across the
 * channels: a clip bakes once whatever the marchers carry.
 */
export function bakeForBodies(
    bodies: ReadonlyMap<BodyType, LoadedBody>,
    clips: Record<string, THREE.AnimationClip>,
    foot: StepOffFoot = "left",
    horn: readonly HornRowSpec[] = [],
    /** When given, only these Feet rows are baked: the ones marchers play. */
    only?: ReadonlySet<string>,
): ChannelBake {
    const first = bodies.values().next().value;
    if (!first) throw new Error("3D View: no bodies to bake on");
    const rig = platformRig(first.mesh.skeleton);
    const feet: Record<string, THREE.AnimationClip> = {};
    for (const name of Object.keys(clips)) {
        if (only && !only.has(name)) continue;
        feet[name] = clipForBake(name, clips, foot, rig);
    }
    return bakeChannels(first.scene, { feet, horn });
}

export class MarcherBodies {
    readonly group = new THREE.Group();
    readonly bake: ChannelBake;
    /** Composes every slot's channels each frame; bodies and instruments skin from it. */
    readonly composer: Composer;
    private readonly entries: MeshEntry[] = [];
    private readonly materials: THREE.Material[] = [];
    /** The instruments, one group per look, near and far detail (`hornSet.ts`). */
    private readonly horns: HornSet | null = null;
    /** The flags' silks, one cloth mesh per tier (`silkSet.ts`). */
    private readonly silks: SilkSet | null = null;
    /** The shakos' plumes, one mesh for the band (`plumeSet.ts`). */
    private readonly plumes: PlumeSet | null = null;
    private readonly blockSource: THREE.BufferGeometry | null = null;
    private readonly contact: THREE.InstancedMesh;
    /** Mesh entry and instance index per slot. */
    private readonly meshOf: Int32Array;
    private readonly instanceOf: Int32Array;
    private readonly scaleOf: Float32Array;
    /** The hold id each slot plays (`slotHoldId`). */
    private readonly holdIds: string[];
    /** The count clock of the last `writeFrame`. */
    private count = 0;

    constructor(
        bodies: ReadonlyMap<BodyType, LoadedBody>,
        bake: ChannelBake,
        looks: readonly MarcherSlotLook[],
        quality: MarcherQuality,
    ) {
        this.bake = bake;
        this.composer = new Composer(bake, looks.length);
        const firstRow = this.firstRow();
        for (let i = 0; i < looks.length; i++)
            this.composer.writeFeet(i, { row: firstRow });
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
        // Group the slots by mesh: (body type, body look) at high, body look
        // at low. Looks that differ only in what they carry share a mesh.
        const groups = new Map<
            string,
            { type: BodyType; look: UniformLook; slots: number[] }
        >();
        looks.forEach((l, i) => {
            const u = bodyKey(l.uniform);
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
            const u = bodyKey(g.look);
            let material = materialByLook.get(u);
            if (!material) {
                material = composedSkinning(
                    createUniformMaterial(THREE, {
                        style: g.look.style,
                        colors: g.look.colors,
                        options: g.look.options,
                    }),
                    this.composer,
                );
                if (!g.look.options.gloves) bareHands(material);
                materialByLook.set(u, material);
                this.materials.push(material);
            }
            const { mesh, own } = this.buildMesh(bodies, material, g);
            const entry = this.entries.length;
            g.slots.forEach((slot, k) => {
                this.meshOf[slot] = entry;
                this.instanceOf[slot] = k;
                writeInstance(mesh, k, slot, looks[slot].body.skinTone);
            });
            this.entries.push({ mesh, slots: g.slots, own });
            this.group.add(mesh);
        }
        this.plumes = this.buildPlumes(bodies, looks, quality);
        if (looks.some((l) => l.uniform.options.carry)) {
            // in `materials` so dispose frees it
            const material = instrumentMaterial(this.composer);
            this.materials.push(material);
            this.horns = new HornSet(bodies, looks, quality, material);
            for (const m of this.horns.meshes) this.group.add(m);
            const skeleton = bodies.values().next().value!.mesh.skeleton;
            const cloth = silkMaterial(this.composer);
            const silks = new SilkSet(skeleton, looks, quality, cloth);
            if (silks.count > 0) {
                this.materials.push(cloth);
                this.silks = silks;
                for (const m of silks.meshes) this.group.add(m);
            } else cloth.dispose();
        }
    }

    /**
     * The plumes of every slot whose look wears a shako, each standing where
     * its body's own plume did, added to the group. Null when nobody wears one.
     */
    private buildPlumes(
        bodies: ReadonlyMap<BodyType, LoadedBody>,
        looks: readonly MarcherSlotLook[],
        quality: MarcherQuality,
    ): PlumeSet | null {
        const sockets = new Map<BodyType | "block", PlumeSocket | null>();
        const socketOf = (type: BodyType) => {
            const key = this.blockSource ? "block" : type;
            if (!sockets.has(key))
                sockets.set(
                    key,
                    plumeSocket(
                        this.blockSource ?? bodies.get(type)!.mesh.geometry,
                    ),
                );
            return sockets.get(key)!;
        };
        const wearers: PlumeWearer[] = [];
        looks.forEach((l, slot) => {
            if (!partVisible(l.uniform, PART.plume)) return;
            const socket = socketOf(l.body.bodyType);
            if (socket)
                wearers.push({ slot, socket, color: l.uniform.colors.plume });
        });
        if (wearers.length === 0) return null;
        const material = plumeMaterial(this.composer, quality);
        // in `materials` so dispose frees it
        this.materials.push(material);
        const plumes = new PlumeSet(wearers, quality, material);
        this.group.add(plumes.mesh);
        return plumes;
    }

    /** One InstancedMesh for a group of slots sharing a body and a look. */
    private buildMesh(
        bodies: ReadonlyMap<BodyType, LoadedBody>,
        material: THREE.Material,
        g: { type: BodyType; look: UniformLook; slots: number[] },
    ) {
        const source = this.blockSource ?? bodies.get(g.type)!.mesh.geometry;
        // the plume is drawn by `plumeSet.ts`, so the body leaves its own out
        const filtered = visibleIndex(source, g.look, [PART.plume]);
        const own: MeshEntry["own"] = filtered ? "index" : "shared";
        const geometry = composedGeometry(source, g.slots.length);
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
        const row = Object.values(this.bake.rows).find(
            (r) => r.channel === "feet",
        );
        if (!row) throw new Error("3D View: no Feet rows in the bake");
        return row;
    }

    /** Draw calls this set issues per frame: a body mesh per group, plus the plumes, instruments and silks. */
    get drawCalls(): number {
        return (
            this.entries.length +
            (this.plumes?.drawCalls ?? 0) +
            (this.horns?.drawCalls ?? 0) +
            (this.silks?.drawCalls ?? 0)
        );
    }

    /** The slots that carry a silk: the ones `writeFrame`'s silk motion needs. */
    get silkSlots(): readonly number[] {
        return this.silks?.slots ?? [];
    }

    /** Sets what slot `slot`'s Feet play; call when its clip changes. */
    setClip(slot: number, clip: FeetPlay): void {
        this.composer.writeFeet(slot, clip);
    }

    /** Sets what slot `slot`'s Horn/Equipment channel plays; null follows the Feet. */
    setHorn(slot: number, play: ChannelPlay | null): void {
        this.composer.writeChannel(slot, "horn", play);
    }

    /** Composes this frame's bones (after `setClip`, `setHorn` and `writeFrame`). */
    compose(gl: THREE.WebGLRenderer, force = false): void {
        this.composer.update(gl, this.count, force);
    }

    /**
     * Places every slot: at (x, z) facing `heading` when placed, collapsed
     * (not drawn) otherwise. `count` is the show's count clock. `camera`
     * picks each instrument's detail; null draws them all at full detail.
     * `silk` is each slot's motion for the silks' wave; without it they
     * keep the last motion written, as when only the camera moved.
     */
    writeFrame(
        xz: Float32Array,
        heading: Float32Array,
        placed: Uint8Array,
        count: number,
        camera: [number, number, number] | null = null,
        silk: SilkMotionFrame | null = null,
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
                    STAND_Y,
                );
            }
            mesh.instanceMatrix.needsUpdate = true;
        }
        this.plumes?.writeFrame(xz, heading, placed, this.scaleOf);
        this.horns?.writeFrame(xz, heading, placed, this.scaleOf, camera);
        if (silk) this.silks?.writeMotion(silk);
        this.silks?.writeFrame(xz, heading, placed, this.scaleOf, camera);
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
        this.count = count;
    }

    dispose(): void {
        for (const { mesh, own } of this.entries) {
            disposeMarcherGeometry(mesh.geometry, own);
            mesh.dispose();
        }
        this.plumes?.dispose();
        this.horns?.dispose();
        this.silks?.dispose();
        for (const m of this.materials) m.dispose();
        this.composer.dispose();
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

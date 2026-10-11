/**
 * The marchers' instruments, drawn apart from their bodies
 * (docs/3d/instruments.md §4): one group per look, since an instrument's
 * shape doesn't depend on the body type, and at high quality two meshes per
 * group, full detail near the camera and low detail beyond. Each frame packs
 * every placed slot into its mesh's instances by distance, with hysteresis
 * so an instrument at the boundary doesn't flicker between them.
 *
 * Every v4 body shares one skeleton, so one geometry serves all body types.
 */
import * as THREE from "three";
import {
    instancedGeometry,
    writeMarcher,
    writeMatrix,
    type Bake,
    type MarcherClip,
} from "@/view3d/vendor/om-pose/instanced-marchers.js";
import { instrumentModel, type Detail } from "@/view3d/core/instruments";
import { hold as holdFor } from "@/view3d/core/instruments/holds";
import {
    uniformKey,
    type BodyType,
    type UniformLook,
} from "@/view3d/core/marchers/looks";
import type { LoadedBody } from "./marcherAssets";
import { poseArms } from "./armPose";
import { instrumentGeometry } from "./instrumentGeometry";
import type { MarcherQuality, MarcherSlotLook } from "./marcherBodies";

/** Closer than this (m) an instrument switches to full detail... */
export const HORN_NEAR_M = 28;
/** ...and farther than this it switches back to low detail. */
export const HORN_FAR_M = 34;

interface Tier {
    mesh: THREE.InstancedMesh;
    /** Slots in instance order this frame. */
    slots: number[];
}

interface HornGroup {
    slots: number[];
    /** Full detail first when there are two. */
    tiers: Tier[];
    /** Per slot of the group: whether it was near last frame. */
    near: Map<number, boolean>;
}

export class HornSet {
    readonly meshes: THREE.InstancedMesh[] = [];
    private readonly groups: HornGroup[] = [];
    /** The latest clip per slot, copied into whichever instance the slot lands on. */
    private readonly clips = new Map<number, MarcherClip>();
    private dirty = true;

    constructor(
        bodies: ReadonlyMap<BodyType, LoadedBody>,
        bake: Bake,
        looks: readonly MarcherSlotLook[],
        quality: MarcherQuality,
        private readonly material: THREE.Material,
    ) {
        void bake;
        const skeleton = bodies.values().next().value!.mesh.skeleton;
        const byLook = new Map<
            string,
            { look: UniformLook; slots: number[] }
        >();
        looks.forEach((l, i) => {
            if (!l.uniform.options.carry) return;
            const key = uniformKey(l.uniform);
            let g = byLook.get(key);
            if (!g) byLook.set(key, (g = { look: l.uniform, slots: [] }));
            g.slots.push(i);
        });
        const details: Detail[] =
            quality === "high" ? ["high", "low"] : ["low"];
        for (const { look, slots } of byLook.values()) {
            const carry = look.options.carry!;
            const h = holdFor(carry.family, look.options.hold);
            const pose = poseArms(skeleton, h);
            const tiers: Tier[] = [];
            for (const detail of details) {
                const model = instrumentModel(
                    carry.model,
                    detail,
                    carry.options ?? {},
                );
                if (model.pieces.length === 0) break; // mapped, not modeled yet
                const source = instrumentGeometry(
                    skeleton,
                    pose,
                    h,
                    model,
                    look.options.finish,
                    look.colors.primary,
                );
                const mesh = new THREE.InstancedMesh(
                    instancedGeometry(THREE, source, slots.length),
                    material,
                    slots.length,
                );
                mesh.name = `view3d-horn-${carry.model}-${detail}`;
                mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                mesh.frustumCulled = false;
                mesh.castShadow = false;
                mesh.receiveShadow = false;
                mesh.count = 0;
                tiers.push({ mesh, slots: [] });
                this.meshes.push(mesh);
            }
            if (tiers.length > 0)
                this.groups.push({ slots, tiers, near: new Map() });
        }
    }

    /** Draw calls per frame: one per mesh. */
    get drawCalls(): number {
        return this.meshes.length;
    }

    /** Sets what slot `slot` plays; it reaches the instance on the next frame. */
    setClip(slot: number, clip: MarcherClip): void {
        this.clips.set(slot, clip);
        this.dirty = true;
    }

    /**
     * Places every placed slot's instrument in its tier's mesh, packed, and
     * copies its clip in when its instance changed. `camera` null draws
     * everything at full detail.
     */
    writeFrame(
        xz: Float32Array,
        heading: Float32Array,
        placed: Uint8Array,
        scale: Float32Array,
        camera: [number, number, number] | null,
    ): void {
        for (const g of this.groups) {
            const lists: number[][] = g.tiers.map(() => []);
            for (const slot of g.slots) {
                if (!placed[slot]) continue;
                let tier = 0;
                if (g.tiers.length > 1 && camera) {
                    const d = Math.hypot(
                        xz[slot * 2] - camera[0],
                        camera[1] - 1.4,
                        xz[slot * 2 + 1] - camera[2],
                    );
                    const was = g.near.get(slot);
                    const near =
                        was === undefined
                            ? d < (HORN_NEAR_M + HORN_FAR_M) / 2
                            : was
                              ? d < HORN_FAR_M
                              : d < HORN_NEAR_M;
                    g.near.set(slot, near);
                    tier = near ? 0 : 1;
                }
                lists[tier].push(slot);
            }
            g.tiers.forEach((t, k) => {
                const list = lists[k];
                const changed =
                    this.dirty ||
                    list.length !== t.slots.length ||
                    list.some((s, i) => s !== t.slots[i]);
                const matrices = t.mesh.instanceMatrix.array as Float32Array;
                list.forEach((slot, i) => {
                    writeMatrix(
                        matrices,
                        i,
                        xz[slot * 2],
                        xz[slot * 2 + 1],
                        heading[slot],
                        scale[slot],
                    );
                    if (changed) {
                        const clip = this.clips.get(slot);
                        if (clip) writeMarcher(t.mesh, i, clip);
                    }
                });
                t.mesh.count = list.length;
                t.mesh.instanceMatrix.needsUpdate = true;
                t.slots = list;
            });
        }
        this.dirty = false;
    }

    dispose(): void {
        for (const mesh of this.meshes) {
            // each mesh's buffers are its own: built here, shared with nothing,
            // so a plain dispose frees the per-vertex and per-instance ones alike
            mesh.geometry.dispose();
            mesh.dispose();
        }
        this.meshes.length = 0;
        this.groups.length = 0;
        void this.material;
    }
}

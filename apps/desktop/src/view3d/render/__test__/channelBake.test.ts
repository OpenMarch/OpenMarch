import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { bakeClips } from "../instanced-marchers.js";
import { bakeChannels } from "../channelBake";
import { rowTexel } from "../bakeLayout";
import { hold } from "@/view3d/core/instruments/holds";
import {
    armHold,
    holdRowName,
} from "@/view3d/window/performers/marchers/hornRows";

const root = path.resolve(__dirname, "../../assets/om-pose");

async function gltf(file: string) {
    const b = fs.readFileSync(path.join(root, file));
    const ab = new ArrayBuffer(b.byteLength);
    new Uint8Array(ab).set(b);
    return new GLTFLoader().parseAsync(ab, "");
}

async function fixture() {
    const body = await gltf("bodies/neutral-average.glb");
    let mesh: THREE.SkinnedMesh | null = null;
    body.scene.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh)
            mesh = o as THREE.SkinnedMesh;
    });
    const clips = new Map<string, THREE.AnimationClip>();
    for (const c of (await gltf("clips/clips-h100.glb")).animations)
        clips.set(c.name, c);
    return { scene: body.scene, mesh: mesh! as THREE.SkinnedMesh, clips };
}

/** Bone `bone`'s matrix in row `row` of a bake laid out `bones` wide. */
function boneAt(
    data: Float32Array,
    width: number,
    layout: { rowsPerColumn: number; bones: number },
    row: number,
    bone: number,
) {
    const [x, y] = rowTexel(layout, row, bone);
    return new THREE.Matrix4().fromArray(data, (y * width + x) * 4);
}

describe("bakeChannels", () => {
    it("samples a Feet row as om-pose's bakeClips does, bone for bone", async () => {
        const f = await fixture();
        const feet = {
            attention: f.clips.get("attention")!,
            "8to5": f.clips.get("8to5")!,
        };
        const ours = bakeChannels(f.scene, { feet });
        const theirs = bakeClips(THREE, f.scene, feet);
        const a = ours.texture.image.data as Float32Array;
        const b = theirs.texture.image.data as Float32Array;
        let worst = 0;
        for (const name of Object.keys(feet)) {
            expect(ours.rows[name].frames).toBe(theirs.rows[name].frames);
            for (let i = 0; i <= ours.rows[name].frames; i++)
                for (let bone = 0; bone < theirs.bones; bone++) {
                    const m = boneAt(
                        a,
                        ours.layout.width,
                        ours.layout,
                        ours.rows[name].row + i,
                        bone,
                    ).elements;
                    const n = boneAt(
                        b,
                        theirs.texture.image.width,
                        {
                            rowsPerColumn: theirs.rowsPerColumn,
                            bones: theirs.bones,
                        },
                        theirs.rows[name].row + i,
                        bone,
                    ).elements;
                    for (let k = 0; k < 16; k++)
                        worst = Math.max(worst, Math.abs(m[k] - n[k]));
                }
        }
        // the root's bottom row holds the leg turn's data in both
        expect(worst).toBeLessThan(1e-6);
    });

    it("bakes a hold as one Horn row whose prop bone holds the instrument where the hold places it", async () => {
        const f = await fixture();
        const h = hold("brass", "carry");
        const bake = bakeChannels(f.scene, {
            feet: { attention: f.clips.get("attention")! },
            horn: [
                {
                    name: holdRowName("brass:carry"),
                    from: armHold(f.mesh.skeleton, "brass", "carry"),
                },
            ],
        });
        const row = bake.rows[holdRowName("brass:carry")];
        expect(row).toMatchObject({ frames: 1, channel: "horn" });
        const prop = boneAt(
            bake.texture.image.data as Float32Array,
            bake.layout.width,
            bake.layout,
            row.row,
            bake.propBone,
        );
        // holds.ts: the instrument's origin, its bell along bellAxis
        const origin = new THREE.Vector3().applyMatrix4(prop);
        expect(
            origin.distanceTo(new THREE.Vector3(...h.instrument.origin)),
        ).toBeLessThan(1e-4);
        const bell = new THREE.Vector3(0, 0, 1).applyMatrix4(prop).sub(origin);
        expect(
            bell.distanceTo(new THREE.Vector3(...h.instrument.bellAxis)),
        ).toBeLessThan(1e-4);
    });

    it("bakes a prop path in body space as the prop bone, in place of the hand and grip", async () => {
        const f = await fixture();
        const up = armHold(f.mesh.skeleton, "brass", "up");
        // a prop rising 2 m over the row, in body space
        const bake = bakeChannels(f.scene, {
            feet: { attention: f.clips.get("attention")! },
            horn: [
                {
                    name: "toss",
                    from: up,
                    frames: 4,
                    propPath: (u) =>
                        new THREE.Matrix4().makeTranslation(0, 2 * u, 0),
                },
            ],
        });
        const row = bake.rows.toss;
        expect(row.frames).toBe(4);
        const data = bake.texture.image.data as Float32Array;
        for (const [i, y] of [
            [0, 0],
            [2, 1],
            [4, 2],
        ]) {
            const m = boneAt(
                data,
                bake.layout.width,
                bake.layout,
                row.row + i,
                bake.propBone,
            );
            expect(m.elements[13]).toBeCloseTo(y, 6);
            expect(m.elements[12]).toBeCloseTo(0, 6);
        }
    });

    it("gives a Feet row's prop bone the right hand's matrix", async () => {
        const f = await fixture();
        const bake = bakeChannels(f.scene, {
            feet: { "8to5": f.clips.get("8to5")! },
        });
        const handR = bake.boneNames.indexOf("DEF-handR");
        const data = bake.texture.image.data as Float32Array;
        for (const i of [0, 7, 30]) {
            const r = bake.rows["8to5"].row + i;
            expect(
                boneAt(data, bake.layout.width, bake.layout, r, bake.propBone)
                    .elements,
            ).toEqual(
                boneAt(data, bake.layout.width, bake.layout, r, handR).elements,
            );
        }
    });
});

describe("a hold row composed onto a Feet clip", () => {
    it("draws what om-pose's bake of the clip in that hold drew, every bone, turned or not", async () => {
        const { composeSlot, composeSetupOf } = await import("../composeMath");
        const { emptyState, writeChannelState, writeFeetState } =
            await import("../channelState");
        const { holdClip, poseArms } =
            await import("@/view3d/window/performers/marchers/armPose");
        const f = await fixture();
        const clip = f.clips.get("8to5")!;
        const ours = bakeChannels(f.scene, {
            feet: { "8to5": clip },
            horn: [
                {
                    name: "hold:brass:up",
                    from: armHold(f.mesh.skeleton, "brass", "up"),
                },
            ],
        });
        // the independent source: today's clip baked with the hold's arms
        const pose = poseArms(f.mesh.skeleton, hold("brass", "up"));
        const theirs = bakeClips(THREE, f.scene, {
            held: holdClip(clip, pose, "held"),
        });
        const setup = composeSetupOf(ours.boneNames, ours.turn);
        const anim = {
            data: ours.texture.image.data as Float32Array,
            width: ours.layout.width,
            rowsPerColumn: ours.rowsPerColumn,
        };
        const state = emptyState(1);
        const h = ours.rows["hold:brass:up"];
        writeChannelState(state, 0, "horn", {
            row: h.row,
            frames: h.frames,
            counts: h.counts,
            phase: 0,
            rate: 1,
            once: false,
        });
        const out = new Float32Array(ours.bones * 16);
        const old = theirs.texture.image.data as Float32Array;
        let worst = 0;
        for (const legYaw of [0, 0.6]) {
            writeFeetState(state, 0, {
                row: ours.rows["8to5"],
                legYaw,
            });
            for (const i of [0, 9, 17, 29]) {
                // the clock at sample i of the one-count clip
                composeSlot(anim, setup, state, 0, i / 30, out, 0);
                for (let bone = 0; bone < theirs.bones; bone++) {
                    const m = boneAt(
                        old,
                        theirs.texture.image.width,
                        {
                            rowsPerColumn: theirs.rowsPerColumn,
                            bones: theirs.bones,
                        },
                        theirs.rows.held.row + i,
                        bone,
                    ).elements;
                    // om-pose turns a bone the same way, as a sum per class
                    const want = turnedLikeOmPose(m, bone, legYaw, ours, i);
                    for (let k = 0; k < 16; k++)
                        worst = Math.max(
                            worst,
                            Math.abs(out[bone * 16 + k] - want[k]),
                        );
                }
            }
        }
        expect(worst).toBeLessThan(2e-5);
    });
});

/**
 * om-pose's per-class leg turn on one bone of an old bake row (its shader's
 * LEG TURN, written out again here from instanced-marchers.js), the turn's
 * data read from that row of our bake (the same clip's Feet row).
 */
function turnedLikeOmPose(
    m: number[],
    bone: number,
    t: number,
    bake: ReturnType<typeof bakeChannels>,
    sample: number,
): number[] {
    if (t === 0 || !bake.turn) return m;
    const data = bake.texture.image.data as Float32Array;
    const [x, y] = rowTexel(
        bake.layout,
        bake.rows["8to5"].row + sample,
        bake.turn.root,
    );
    const w = (k: number) => data[(y * bake.layout.width + x + k) * 4 + 3];
    const h = new THREE.Vector3(w(0), 0, w(1));
    const a = w(2);
    const r = bake.turn.waist;
    const M = new THREE.Matrix4().fromArray(m);
    const cls = bake.turn.classes[bone];
    const yaw = (v: number) => new THREE.Matrix4().makeRotationY(v);
    const th = h.clone().applyMatrix4(yaw(t));
    if (cls === 1) return yaw(t).multiply(M).elements;
    if (cls === 2) {
        const tw =
            Math.atan2(r * Math.sin(a + t), 1 + r * Math.cos(a + t)) -
            Math.atan2(r * Math.sin(a), 1 + r * Math.cos(a));
        const out = yaw(tw).multiply(M);
        const d = th.clone().sub(h.clone().applyMatrix4(yaw(tw)));
        out.elements[12] += d.x;
        out.elements[14] += d.z;
        return out.elements;
    }
    M.elements[12] += th.x - h.x;
    M.elements[14] += th.z - h.z;
    return M.elements;
}

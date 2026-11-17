// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
    HOLD_STATES,
    hold,
    type ArmTargets,
} from "@/view3d/core/instruments/holds";
import { BODY_TYPES } from "@/view3d/core/marchers/looks";
import { ARM_BONES, holdClip, poseArms } from "../marchers/armPose";
import { restoreStillPose } from "@/view3d/window/performers/marchers/stillPose";

async function skeleton(type = "neutral-average"): Promise<THREE.Skeleton> {
    const b = fs.readFileSync(
        path.resolve(__dirname, `../../../assets/om-pose/bodies/${type}.glb`),
    );
    const gltf = await new GLTFLoader().parseAsync(
        b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
        "",
    );
    let sk: THREE.Skeleton | null = null;
    gltf.scene.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh)
            sk = (o as THREE.SkinnedMesh).skeleton;
    });
    return sk!;
}

async function clip8to5(): Promise<THREE.AnimationClip> {
    const b = fs.readFileSync(
        path.resolve(__dirname, "../../../assets/om-pose/clips/clips-h100.glb"),
    );
    const gltf = await new GLTFLoader().parseAsync(
        b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
        "",
    );
    return restoreStillPose(gltf.animations).find((c) => c.name === "8to5")!;
}

/** World position of a posed bone's head, by applying the pose to a cloned rig. */
function posedHead(
    sk: THREE.Skeleton,
    pose: ReturnType<typeof poseArms>,
    name: string,
): THREE.Vector3 {
    const bones = sk.bones.map((b) => b.clone(false));
    sk.bones.forEach((b, i) => {
        const p = b.parent ? sk.bones.indexOf(b.parent as THREE.Bone) : -1;
        if (p >= 0) bones[p].add(bones[i]);
    });
    bones.forEach((b) => {
        const q = pose.local.get(b.name);
        if (q) b.quaternion.copy(q);
    });
    const root = bones.find((b) => !b.parent)!;
    root.updateMatrixWorld(true);
    return new THREE.Vector3().setFromMatrixPosition(
        bones.find((b) => b.name === name)!.matrixWorld,
    );
}

describe("poseArms", () => {
    it("names the eight arm bones", () => {
        expect(ARM_BONES).toEqual([
            "DEF-shoulderL",
            "DEF-upper_armL",
            "DEF-forearmL",
            "DEF-handL",
            "DEF-shoulderR",
            "DEF-upper_armR",
            "DEF-forearmR",
            "DEF-handR",
        ]);
    });

    it.each(HOLD_STATES)(
        "brass %s: puts the elbows and wrists on their targets",
        async (state) => {
            const sk = await skeleton();
            const h = hold("trumpet", state);
            const pose = poseArms(sk, h);
            // the eight arm bones, the neck and the head
            expect(pose.local.size).toBe(10);
            const elbowR = posedHead(sk, pose, "DEF-forearmR");
            const wristR = posedHead(sk, pose, "DEF-handR");
            expect(
                elbowR.distanceTo(new THREE.Vector3(...h.right.elbow)),
            ).toBeLessThan(0.02);
            expect(
                wristR.distanceTo(new THREE.Vector3(...h.right.wrist)),
            ).toBeLessThan(0.02);
            const wristL = posedHead(sk, pose, "DEF-handL");
            expect(
                wristL.distanceTo(new THREE.Vector3(...h.left.wrist)),
            ).toBeLessThan(0.02);
        },
    );

    it("points the hand's +Y along the fingers", async () => {
        const sk = await skeleton();
        const h = hold("trumpet", "up");
        const pose = poseArms(sk, h);
        const y = new THREE.Vector3(0, 1, 0).transformDirection(pose.handR);
        expect(y.dot(new THREE.Vector3(...h.right.fingers))).toBeGreaterThan(
            0.99,
        );
    });

    it("keeps the wrists clear of the torso in every hold", async () => {
        const sk = await skeleton();
        for (const state of HOLD_STATES) {
            const pose = poseArms(sk, hold("trumpet", state));
            const w = posedHead(sk, pose, "DEF-handR");
            // in front of the chest plane, or (trail) beside the body
            expect(w.z > 0.12 || Math.abs(w.x) > 0.22).toBe(true);
        }
    });
});

/** A posed hand's axes: +Y the fingers, +Z the thumb's side, ±X its faces. */
function handAxes(m: THREE.Matrix4) {
    const x = new THREE.Vector3();
    const y = new THREE.Vector3();
    const z = new THREE.Vector3();
    m.extractBasis(x, y, z);
    return { x: x.normalize(), y: y.normalize(), z: z.normalize() };
}
/** The way each palm faces: −X on the right hand, +X on the left. */
const palms = (pose: ReturnType<typeof poseArms>) => ({
    right: handAxes(pose.handR).x.negate(),
    left: handAxes(pose.handL).x,
});
const mirrored = (v: THREE.Vector3) => new THREE.Vector3(-v.x, v.y, v.z);
const expectSame = (a: THREE.Vector3, b: THREE.Vector3) =>
    expect(a.distanceTo(b)).toBeLessThan(0.005);

/** The bend plane's normal of a posed arm, the first rule's hint for its turn. */
function bendNormal(sk: THREE.Skeleton, side: "L" | "R", t: ArmTargets) {
    const i = sk.bones.findIndex((b) => b.name === `DEF-upper_arm${side}`);
    const shoulder = new THREE.Vector3().setFromMatrixPosition(
        sk.boneInverses[i].clone().invert(),
    );
    const elbow = new THREE.Vector3(...t.elbow);
    return new THREE.Vector3()
        .crossVectors(
            elbow.clone().sub(shoulder),
            new THREE.Vector3(...t.wrist).sub(elbow),
        )
        .normalize();
}

/** How nearly a posed hand's thumb side lies along its arm's bend normal: 1 along it, −1 half a turn off. */
function alongBend(
    sk: THREE.Skeleton,
    side: "L" | "R",
    hand: THREE.Matrix4,
    t: ArmTargets,
): number {
    const { y, z } = handAxes(hand);
    const n = bendNormal(sk, side, t);
    return z.dot(n.addScaledVector(y, -n.dot(y)).normalize());
}

describe("the arms' turn about their length (#980)", () => {
    it("the bind pose mirrors the hands by flipping X", async () => {
        const sk = await skeleton();
        const bind = (name: string) =>
            handAxes(
                sk.boneInverses[sk.bones.findIndex((b) => b.name === name)]
                    .clone()
                    .invert(),
            );
        const r = bind("DEF-handR");
        const l = bind("DEF-handL");
        expectSame(l.y, mirrored(r.y));
        expectSame(l.z, mirrored(r.z));
        expectSame(l.x, mirrored(r.x).negate());
    });

    it.each(BODY_TYPES)(
        "poses the left hand as the right's mirror image in the mirrored drum holds (%s)",
        async (type) => {
            const sk = await skeleton(type);
            for (const family of ["cymbals", "tenors", "bass"] as const) {
                const pose = poseArms(sk, hold(family, "up"));
                const r = handAxes(pose.handR);
                const l = handAxes(pose.handL);
                // the bind pose's own mirror: fingers and thumb mirrored, X flipped
                expectSame(l.y, mirrored(r.y));
                expectSame(l.z, mirrored(r.z));
                expectSame(l.x, mirrored(r.x).negate());
                expectSame(palms(pose).left, mirrored(palms(pose).right));
            }
        },
    );

    it("turns the palms where a hold says they face", async () => {
        const sk = await skeleton();
        const down = new THREE.Vector3(0, -1, 0);
        // matched grip: palms down on the tenors' sticks and the snare's right one
        const tenors = palms(poseArms(sk, hold("tenors", "up")));
        expect(tenors.right.dot(down)).toBeGreaterThan(0.98);
        expect(tenors.left.dot(down)).toBeGreaterThan(0.98);
        // the snare's right hand slopes a little down with its forearm
        // (straight wrist, owner 2026-11-17), so its palm faces down and a
        // little back
        const snare = palms(poseArms(sk, hold("snare", "up")));
        expect(snare.right.dot(down)).toBeGreaterThan(0.93);
        // bass mallets: the palms face in, toward the heads, thumbs on top
        const bass = poseArms(sk, hold("bass", "up"));
        expect(palms(bass).right.x).toBeGreaterThan(0.98);
        expect(palms(bass).left.x).toBeLessThan(-0.98);
        expect(handAxes(bass.handR).z.y).toBeGreaterThan(0.5);
        expect(handAxes(bass.handL).z.y).toBeGreaterThan(0.5);
    });

    it("turns the snare's left hand over for traditional grip", async () => {
        const sk = await skeleton();
        const h = hold("snare", "up");
        const pose = poseArms(sk, h);
        const palm = palms(pose).left;
        // in toward the other hand and partly up, the thumb's side on top
        expect(palm.x).toBeLessThan(-0.7);
        expect(palm.y).toBeGreaterThan(0.25);
        expect(handAxes(pose.handL).z.y).toBeGreaterThan(0.7);
        expect(palm.dot(new THREE.Vector3(...h.left.palm!))).toBeGreaterThan(
            0.99,
        );
    });

    it("keeps the bend plane's turn on both arms where a hold doesn't say", async () => {
        const sk = await skeleton();
        // winds and guard, tuned by eye on this rule: thumb side along the normal
        for (const family of ["trumpet", "flute", "sax", "flag"] as const) {
            const h = hold(family, "up");
            expect(h.right.palm ?? h.left.palm).toBeUndefined();
            const pose = poseArms(sk, h);
            expect(alongBend(sk, "R", pose.handR, h.right)).toBeGreaterThan(
                0.99,
            );
            expect(alongBend(sk, "L", pose.handL, h.left)).toBeGreaterThan(
                0.99,
            );
        }
        // the right cymbal hand too; the left is its mirror image, half a turn on
        const h = hold("cymbals", "up");
        const pose = poseArms(sk, h);
        expect(alongBend(sk, "R", pose.handR, h.right)).toBeGreaterThan(0.99);
        expect(alongBend(sk, "L", pose.handL, h.left)).toBeLessThan(-0.99);
    });

    it("turns the upper arm the way a hold says", async () => {
        const sk = await skeleton();
        const h = hold("snare", "up");
        expect(h.left.upperArm).toBe("in");
        const upperZ = (pose: ReturnType<typeof poseArms>, side: "L" | "R") => {
            const bones = sk.bones.map((b) => b.clone(false));
            sk.bones.forEach((b, i) => {
                const p = b.parent
                    ? sk.bones.indexOf(b.parent as THREE.Bone)
                    : -1;
                if (p >= 0) bones[p].add(bones[i]);
            });
            bones.forEach((b) => {
                const q = pose.local.get(b.name);
                if (q) b.quaternion.copy(q);
            });
            bones.find((b) => !b.parent)!.updateMatrixWorld(true);
            return handAxes(
                bones.find((b) => b.name === `DEF-upper_arm${side}`)!
                    .matrixWorld,
            ).z;
        };
        // the snare's upper arms both turn their thumb sides in toward the body
        const pose = poseArms(sk, h);
        expect(upperZ(pose, "R").x).toBeGreaterThan(0.6);
        expect(upperZ(pose, "L").x).toBeLessThan(-0.8);
        // left to the smaller twist, the left one turns out; told "out", the same
        for (const upperArm of [undefined, "out"] as const) {
            const out = poseArms(sk, { ...h, left: { ...h.left, upperArm } });
            expect(upperZ(out, "L").x).toBeGreaterThan(0.8);
        }
    });

    it("shares a palm's turn between the wrist and the forearm", async () => {
        const sk = await skeleton();
        // the forearm's thumb side lies between the upper arm's and the hand's
        for (const family of ["snare", "bass"] as const) {
            const h = hold(family, "up");
            const pose = poseArms(sk, h);
            const bones = sk.bones.map((b) => b.clone(false));
            sk.bones.forEach((b, i) => {
                const p = b.parent
                    ? sk.bones.indexOf(b.parent as THREE.Bone)
                    : -1;
                if (p >= 0) bones[p].add(bones[i]);
            });
            bones.forEach((b) => {
                const q = pose.local.get(b.name);
                if (q) b.quaternion.copy(q);
            });
            bones.find((b) => !b.parent)!.updateMatrixWorld(true);
            const z = (name: string) =>
                handAxes(bones.find((b) => b.name === name)!.matrixWorld).z;
            for (const side of ["L", "R"]) {
                const whole = z(`DEF-upper_arm${side}`).angleTo(
                    z(`DEF-hand${side}`),
                );
                expect(
                    z(`DEF-forearm${side}`).angleTo(z(`DEF-hand${side}`)),
                ).toBeLessThan(whole);
                // no joint twists more than a quarter turn
                expect(
                    z(`DEF-forearm${side}`).angleTo(z(`DEF-hand${side}`)),
                ).toBeLessThan(Math.PI / 2);
            }
        }
    });
});

describe("holdClip", () => {
    it("replaces the arm tracks with constants and keeps the rest", async () => {
        const sk = await skeleton();
        const clip = await clip8to5();
        const out = holdClip(
            clip,
            poseArms(sk, hold("trumpet", "up")),
            "8to5@brass:up",
        );
        expect(out.name).toBe("8to5@brass:up");
        expect(out.duration).toBe(clip.duration);
        expect(out.tracks.length).toBe(clip.tracks.length);
        const arm = out.tracks.filter(
            (t) =>
                ARM_BONES.includes(t.name.split(".")[0]) &&
                t.name.endsWith(".quaternion"),
        );
        expect(arm.length).toBe(8);
        for (const t of arm) {
            expect(t.times.length).toBe(2);
            expect(Array.from(t.values.slice(0, 4))).toEqual(
                Array.from(t.values.slice(4, 8)),
            );
        }
        const leg = out.tracks.find((t) => t.name === "DEF-thighL.quaternion")!;
        expect(leg).toBe(
            clip.tracks.find((t) => t.name === "DEF-thighL.quaternion"),
        );
        // the source clip is untouched: its hand track is not the one we wrote
        const srcHand = clip.tracks.find(
            (t) => t.name === "DEF-handR.quaternion",
        )!;
        const outHand = out.tracks.find(
            (t) => t.name === "DEF-handR.quaternion",
        )!;
        expect(outHand).not.toBe(srcHand);
        expect(Array.from(srcHand.values.slice(0, 4))).not.toEqual(
            Array.from(outHand.values.slice(0, 4)),
        );
    });
});

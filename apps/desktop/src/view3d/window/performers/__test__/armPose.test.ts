// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HOLD_STATES, hold } from "@/view3d/core/instruments/holds";
import { ARM_BONES, holdClip, poseArms } from "../marchers/armPose";

async function skeleton(): Promise<THREE.Skeleton> {
    const b = fs.readFileSync(
        path.resolve(
            __dirname,
            "../../../assets/om-pose/bodies/neutral-average.glb",
        ),
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
    return gltf.animations.find((c) => c.name === "8to5")!;
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
            const h = hold("brass", state);
            const pose = poseArms(sk, h);
            expect(pose.local.size).toBe(8);
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
        const h = hold("brass", "up");
        const pose = poseArms(sk, h);
        const y = new THREE.Vector3(0, 1, 0).transformDirection(pose.handR);
        expect(y.dot(new THREE.Vector3(...h.right.fingers))).toBeGreaterThan(
            0.99,
        );
    });

    it("keeps the wrists clear of the torso in every hold", async () => {
        const sk = await skeleton();
        for (const state of HOLD_STATES) {
            const pose = poseArms(sk, hold("brass", state));
            const w = posedHead(sk, pose, "DEF-handR");
            // in front of the chest plane, or (trail) beside the body
            expect(w.z > 0.12 || Math.abs(w.x) > 0.22).toBe(true);
        }
    });
});

describe("holdClip", () => {
    it("replaces the arm tracks with constants and keeps the rest", async () => {
        const sk = await skeleton();
        const clip = await clip8to5();
        const out = holdClip(
            clip,
            poseArms(sk, hold("brass", "up")),
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

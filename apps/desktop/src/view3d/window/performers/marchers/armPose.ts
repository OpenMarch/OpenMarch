/**
 * Poses the v4 skeleton's arms and head to a hold (docs/3d/instruments.md §5) and
 * writes that pose into clips before the bake, so the recorded legs march
 * while the arms hold the instrument.
 *
 * Each arm is aimed, not solved: the upper arm's +Y points at the elbow
 * target, the forearm's at the wrist target, the hand's along the fingers.
 * About their own length the bones turn their thumb side toward the bend
 * plane's normal, unless the hold says where the palm faces
 * (`ArmTargets.palm`, `upperArm`, `halfTurn`).
 * Bone lengths are the skeleton's, so a target just out of reach lands
 * short along the same line. The clavicles stay at bind. The head turns
 * about its own joint by the hold's `head` (pitched up, rolled); the neck
 * stays at bind.
 */
import * as THREE from "three";
import {
    headQuaternion,
    type ArmTargets,
    type Hold,
} from "@/view3d/core/instruments/holds";
import { HEAD_BONES } from "@/view3d/render/composeMath";

/** GLTFLoader drops the dots from bone names (PropertyBinding.sanitizeNodeName). */
export const ARM_BONES: readonly string[] = [
    "DEF-shoulderL",
    "DEF-upper_armL",
    "DEF-forearmL",
    "DEF-handL",
    "DEF-shoulderR",
    "DEF-upper_armR",
    "DEF-forearmR",
    "DEF-handR",
];

export interface ArmPose {
    /** Local quaternion per sanitized bone name. */
    local: Map<string, THREE.Quaternion>;
    /** World matrices of the hands in the posed rest body. */
    handR: THREE.Matrix4;
    handL: THREE.Matrix4;
}

const parentIndex = (skeleton: THREE.Skeleton, b: THREE.Bone) =>
    b.parent && (b.parent as THREE.Bone).isBone
        ? skeleton.bones.indexOf(b.parent as THREE.Bone)
        : -1;

/** A private copy of the bone hierarchy at bind pose, from the inverse bind matrices. */
function bindRig(skeleton: THREE.Skeleton): THREE.Bone[] {
    const bones = skeleton.bones.map((b) => {
        const c = new THREE.Bone();
        c.name = b.name;
        return c;
    });
    skeleton.bones.forEach((b, i) => {
        const p = parentIndex(skeleton, b);
        if (p >= 0) bones[p].add(bones[i]);
    });
    // world = inverse(boneInverse); local = inverse(parentWorld) * world
    const world = skeleton.boneInverses.map((m) => m.clone().invert());
    skeleton.bones.forEach((b, i) => {
        const p = parentIndex(skeleton, b);
        const local =
            p >= 0 ? world[p].clone().invert().multiply(world[i]) : world[i];
        local.decompose(bones[i].position, bones[i].quaternion, bones[i].scale);
    });
    for (const b of bones) if (!b.parent) b.updateMatrixWorld(true);
    return bones;
}

/** The world rotation that takes +Y to `dir`, with +Z as near `hint` as it can be. */
function aim(dir: THREE.Vector3, hint: THREE.Vector3): THREE.Quaternion {
    const y = dir.clone().normalize();
    let z = hint.clone().sub(y.clone().multiplyScalar(hint.dot(y)));
    if (z.lengthSq() < 1e-8)
        z = new THREE.Vector3(0, 0, 1).sub(y.clone().multiplyScalar(y.z));
    z.normalize();
    const x = new THREE.Vector3().crossVectors(y, z).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(x, y, z),
    );
}

/** Sets `bone`'s local rotation so its world +Y points along `dir`, then updates the world matrices. */
function aimBone(
    bone: THREE.Bone,
    dir: THREE.Vector3,
    hint: THREE.Vector3,
): void {
    const parentWorld = new THREE.Quaternion();
    (bone.parent as THREE.Object3D).getWorldQuaternion(parentWorld);
    bone.quaternion.copy(parentWorld.invert().multiply(aim(dir, hint)));
    bone.updateMatrixWorld(true);
}

/** `v` with its part along unit `axis` taken out, or null when nothing is left. */
function across(v: THREE.Vector3, axis: THREE.Vector3): THREE.Vector3 | null {
    const out = v.clone().addScaledVector(axis, -v.dot(axis));
    return out.lengthSq() < 1e-8 ? null : out.normalize();
}

/**
 * The hand bone's +Z is its thumb side and its ±X its faces: the palm is
 * −X on the right hand and +X on the left (the bind pose mirrors the arms
 * by flipping X). So the thumb lies along fingers × palm on the right hand
 * and palm × fingers on the left.
 */
function thumbFor(
    side: "L" | "R",
    fingers: THREE.Vector3,
    palm: THREE.Vector3,
): THREE.Vector3 {
    return side === "R"
        ? new THREE.Vector3().crossVectors(fingers, palm)
        : new THREE.Vector3().crossVectors(palm, fingers);
}

function poseArm(bones: THREE.Bone[], side: "L" | "R", t: ArmTargets): void {
    const find = (n: string) => bones.find((b) => b.name === n + side)!;
    const upper = find("DEF-upper_arm");
    const fore = find("DEF-forearm");
    const hand = find("DEF-hand");
    const elbow = new THREE.Vector3(...t.elbow);
    const wrist = new THREE.Vector3(...t.wrist);
    const fingers = new THREE.Vector3(...t.fingers).normalize();
    const head = (b: THREE.Bone) =>
        new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
    // the bend plane's normal is the hint for the roll of the bones: each
    // bone's thumb side (+Z) turns toward it
    const shoulder = head(upper);
    const normal = new THREE.Vector3().crossVectors(
        elbow.clone().sub(shoulder),
        wrist.clone().sub(elbow),
    );
    if (normal.lengthSq() < 1e-8) normal.set(0, 0, 1);
    // a hold that says where the palm faces turns the hand to it, and the
    // arm the way round that leaves the wrist the smaller twist, unless
    // the hold says which way round the upper arm turns
    const thumb = t.palm
        ? thumbFor(side, fingers, new THREE.Vector3(...t.palm))
        : null;
    // the body's middle is toward −X from the left arm, +X from the right
    const turnedIn = (side === "L" ? -normal.x : normal.x) > 0;
    const flip = !thumb
        ? t.halfTurn
        : t.upperArm
          ? turnedIn !== (t.upperArm === "in")
          : thumb.dot(normal) < 0;
    if (flip) normal.negate();
    aimBone(upper, elbow.clone().sub(shoulder), normal);
    const along = wrist.clone().sub(head(fore));
    let foreHint = normal;
    if (thumb) {
        // the forearm takes half the hand's turn, as a real one twists along its length
        const axis = along.clone().normalize();
        const a = across(normal, axis);
        const b = across(thumb, axis);
        if (a && b && a.dot(b) > -0.99) foreHint = a.add(b);
    }
    aimBone(fore, along, foreHint);
    aimBone(hand, fingers, thumb ?? normal);
}

/** Turns the head bone in world space by the hold's head pitch and roll. */
function poseHead(bones: THREE.Bone[], hold: Hold): void {
    const head = bones.find((b) => b.name === "DEF-spine006");
    if (!head) return;
    const [x, y, z, w] = headQuaternion(hold.head);
    const world = new THREE.Quaternion();
    head.getWorldQuaternion(world);
    const turned = new THREE.Quaternion(x, y, z, w).multiply(world);
    const parentWorld = new THREE.Quaternion();
    (head.parent as THREE.Object3D).getWorldQuaternion(parentWorld);
    head.quaternion.copy(parentWorld.invert().multiply(turned));
    head.updateMatrixWorld(true);
}

export function poseArms(skeleton: THREE.Skeleton, hold: Hold): ArmPose {
    const bones = bindRig(skeleton);
    poseHead(bones, hold);
    poseArm(bones, "R", hold.right);
    poseArm(bones, "L", hold.left);
    const local = new Map<string, THREE.Quaternion>();
    for (const name of [...ARM_BONES, ...HEAD_BONES])
        local.set(name, bones.find((b) => b.name === name)!.quaternion.clone());
    return {
        local,
        handR: bones.find((b) => b.name === "DEF-handR")!.matrixWorld.clone(),
        handL: bones.find((b) => b.name === "DEF-handL")!.matrixWorld.clone(),
    };
}

/** `clip` with the arm bones' rotation tracks replaced by the pose, as a new clip named `name`. */
export function holdClip(
    clip: THREE.AnimationClip,
    pose: ArmPose,
    name: string,
): THREE.AnimationClip {
    const tracks = clip.tracks.map((t) => {
        const [bone, prop] = t.name.split(".");
        const q = prop === "quaternion" ? pose.local.get(bone) : undefined;
        if (!q) return t;
        return new THREE.QuaternionKeyframeTrack(
            t.name,
            [0, clip.duration],
            [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w],
        );
    });
    return new THREE.AnimationClip(name, clip.duration, tracks);
}

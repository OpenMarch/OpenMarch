/**
 * A body posed in a hold, and its hands' skinned vertices: what the grip
 * tests (`cymbalGrip.test.ts`, `snareGrip.test.ts`) check instruments against.
 */
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { hold, type HoldFamily } from "@/view3d/core/instruments/holds";
import { partVisible, sectionUniform } from "@/view3d/core/marchers/looks";
import { poseArms } from "../marchers/armPose";

/** The body `type`, its arms posed in `family`'s hold. */
export async function posedBody(type: string, family: HoldFamily) {
    const b = fs.readFileSync(
        path.resolve(__dirname, `../../../assets/om-pose/bodies/${type}.glb`),
    );
    const gltf = await new GLTFLoader().parseAsync(
        b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
        "",
    );
    let mesh: THREE.SkinnedMesh | null = null;
    gltf.scene.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh)
            mesh = o as THREE.SkinnedMesh;
    });
    const m = mesh!;
    const sk = m.skeleton;
    const pose = poseArms(sk, hold(family, "up"));
    // every bone at bind (from the inverse bind matrices), then the arms
    const world = sk.boneInverses.map((x) => x.clone().invert());
    sk.bones.forEach((bone, i) => {
        const parent = bone.parent as THREE.Bone;
        const pi = parent?.isBone ? sk.bones.indexOf(parent) : -1;
        const parentWorld =
            pi >= 0
                ? world[pi]
                : (bone.parent?.matrixWorld ?? new THREE.Matrix4());
        new THREE.Matrix4()
            .copy(parentWorld)
            .invert()
            .multiply(world[i])
            .decompose(bone.position, bone.quaternion, bone.scale);
        const q = pose.local.get(bone.name);
        if (q) bone.quaternion.copy(q);
    });
    gltf.scene.updateMatrixWorld(true);
    return m;
}

/**
 * A hand's skinned vertices (those it carries at least a third of), of the
 * parts the window draws: the body file's placeholder instruments ride the
 * hands too, and never draw.
 */
export function handVertices(
    m: THREE.SkinnedMesh,
    bone: string,
    section: string,
): THREE.Vector3[] {
    const index = m.skeleton.bones.findIndex((b) => b.name === bone);
    const look = sectionUniform(section);
    const g = m.geometry;
    const part = g.getAttribute("_part");
    const pos = g.getAttribute("position");
    const si = g.getAttribute("skinIndex");
    const sw = g.getAttribute("skinWeight");
    const out: THREE.Vector3[] = [];
    for (let i = 0; i < pos.count; i++) {
        let w = 0;
        for (let k = 0; k < 4; k++)
            if (si.getComponent(i, k) === index) w += sw.getComponent(i, k);
        if (w < 1 / 3 || !partVisible(look, Math.round(part.getX(i)))) continue;
        const v = new THREE.Vector3().fromBufferAttribute(pos, i);
        m.applyBoneTransform(i, v);
        out.push(v.applyMatrix4(m.matrixWorld));
    }
    return out;
}

// @vitest-environment node
/**
 * The cymbals sit in the hands, not through them: on every body, posed in
 * the cymbals hold, no hand vertex lies inside its cymbal (the bronze, the
 * bell's pad), and each pad rests against its palm.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { hold } from "@/view3d/core/instruments/holds";
import { batteryModel } from "@/view3d/core/instruments/battery";
import { PART_BLACK, PART_BRONZE } from "@/view3d/core/instruments/mesh";
import {
    BODY_TYPES,
    partVisible,
    sectionUniform,
} from "@/view3d/core/marchers/looks";
import { poseArms } from "../marchers/armPose";

async function posedBody(type: string) {
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
    const pose = poseArms(sk, hold("cymbals", "up"));
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
function handVertices(m: THREE.SkinnedMesh, bone: string): THREE.Vector3[] {
    const index = m.skeleton.bones.findIndex((b) => b.name === bone);
    const look = sectionUniform("Cymbals");
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

describe("cymbal grip", () => {
    // the cymbals' instrument frame is the body's, moved to the hold's origin
    const origin = new THREE.Vector3(
        ...hold("cymbals", "up").instrument.origin,
    );
    const model = batteryModel("cymbals", "high");
    const sides = [
        { bone: "handR", body: "DEF-handR", out: -1 },
        { bone: "handL", body: "DEF-handL", out: 1 },
    ] as const;

    it.each(BODY_TYPES)(
        "keeps both hands outside their cymbals (%s)",
        async (type) => {
            const m = await posedBody(type);
            for (const side of sides) {
                // the cymbal's outer surface, outward along its axis, per 5 mm of radius
                // the bronze and the pad (the bigger black piece; the strap
                // loop runs into the fist on purpose)
                const mine = model.pieces.filter((p) => p.bone === side.bone);
                const pad = mine
                    .filter((p) => p.part === PART_BLACK)
                    .sort((a, b) => b.positions.length - a.positions.length)[0];
                const pieces = [
                    ...mine.filter((p) => p.part === PART_BRONZE),
                    pad,
                ];
                const axis = new THREE.Vector3();
                let n = 0;
                for (const p of pieces)
                    for (let i = 0; i < p.positions.length; i += 3) {
                        axis.y += p.positions[i + 1];
                        axis.z += p.positions[i + 2];
                        n++;
                    }
                axis.divideScalar(n).add(origin);
                const surface = new Map<number, number>();
                for (const p of pieces)
                    for (let i = 0; i < p.positions.length; i += 3) {
                        const y = p.positions[i + 1] + origin.y;
                        const z = p.positions[i + 2] + origin.z;
                        const bin = Math.round(
                            Math.hypot(y - axis.y, z - axis.z) / 0.005,
                        );
                        const outward = (p.positions[i] + origin.x) * side.out;
                        surface.set(
                            bin,
                            Math.max(surface.get(bin) ?? -9, outward),
                        );
                    }
                const crown = Math.max(...surface.values());
                let palm = Infinity;
                for (const v of handVertices(m, side.body)) {
                    const r = Math.hypot(v.y - axis.y, v.z - axis.z);
                    const top = [-1, 0, 1]
                        .map(
                            (d) => surface.get(Math.round(r / 0.005) + d) ?? -9,
                        )
                        .reduce((a, b) => Math.max(a, b));
                    const outward = v.x * side.out;
                    // a hand vertex over the cymbal lies outside its surface
                    if (top > -9)
                        expect(
                            outward,
                            `${side.bone} r ${r.toFixed(3)} dz ${(v.z - axis.z).toFixed(3)} dy ${(v.y - axis.y).toFixed(3)}`,
                        ).toBeGreaterThan(top - 0.006);
                    if (r < 0.045) palm = Math.min(palm, outward);
                }
                // and the palm rests on the pad: no gap you could see
                expect(palm - crown).toBeLessThan(0.012);
            }
        },
    );
});

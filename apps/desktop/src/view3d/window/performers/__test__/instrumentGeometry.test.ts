// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { brassModel } from "@/view3d/core/instruments/brass";
import type { InstrumentModel } from "@/view3d/core/instruments/model";
import type { Piece } from "@/view3d/core/instruments/mesh";
import { hold } from "@/view3d/core/instruments/holds";
import { poseArms } from "../marchers/armPose";
import {
    MATTE_PARTS,
    instrumentGeometry,
    instrumentMaterial,
    matteShader,
} from "../marchers/instrumentGeometry";
import {
    PART_BLACK,
    PART_CHROME,
    PART_METAL,
    PART_SILK,
    PART_WOOD,
} from "@/view3d/core/instruments/mesh";
import { NO_HOLD, bakeForBodies } from "../marchers/marcherBodies";

async function body() {
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
    let mesh: THREE.SkinnedMesh | null = null;
    gltf.scene.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh)
            mesh = o as THREE.SkinnedMesh;
    });
    return mesh!;
}

describe("instrumentGeometry", () => {
    it("weights every vertex to the right hand and keeps the parts", async () => {
        const mesh = await body();
        const h = hold("brass", "up");
        const g = instrumentGeometry(
            mesh.skeleton,
            poseArms(mesh.skeleton, h),
            h,
            brassModel("trumpet"),
        );
        const handR = mesh.skeleton.bones.findIndex(
            (b) => b.name === "DEF-handR",
        );
        const si = g.getAttribute("skinIndex");
        const sw = g.getAttribute("skinWeight");
        for (let i = 0; i < si.count; i++) {
            expect(si.getX(i)).toBe(handR);
            expect(sw.getX(i)).toBe(1);
        }
        const parts = new Set<number>();
        const part = g.getAttribute("_part");
        for (let i = 0; i < part.count; i++) parts.add(part.getX(i));
        // gold, chrome, black, and the pearl valve buttons
        expect([...parts].sort()).toEqual([16, 18, 22, 23]);
    });

    it("lands on the hold's placement once skinned with the posed hand", async () => {
        const mesh = await body();
        const h = hold("brass", "up");
        const pose = poseArms(mesh.skeleton, h);
        const g = instrumentGeometry(
            mesh.skeleton,
            pose,
            h,
            brassModel("trumpet"),
        );
        const handR = mesh.skeleton.bones.findIndex(
            (b) => b.name === "DEF-handR",
        );
        // what the skinning does: bindInv * handWorld(posed) * boneInverse * bind, with bind = identity here
        const skin = pose.handR
            .clone()
            .multiply(mesh.skeleton.boneInverses[handR]);
        const box = new THREE.Box3();
        const v = new THREE.Vector3();
        const pos = g.getAttribute("position");
        for (let i = 0; i < pos.count; i++)
            box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(skin));
        const c = box.getCenter(new THREE.Vector3());
        // the trumpet runs forward from the grip: its center is ahead of the origin, near face height
        expect(c.z).toBeGreaterThan(h.instrument.origin[2]);
        expect(Math.abs(c.y - h.instrument.origin[1])).toBeLessThan(0.1);
        expect(box.max.z - box.min.z).toBeCloseTo(0.48, 1);
    });
});

describe("pieces on other bones", () => {
    it("weights each piece to its own bone: the chest for a drum, each hand for its stick", async () => {
        const mesh = await body();
        const h = hold("snare", "up");
        const cube = (bone: "handR" | "handL" | "spine002"): Piece => ({
            part: 19,
            bone,
            positions: [0, 0, 0, 0.1, 0, 0, 0, 0.1, 0],
            normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
            indices: [0, 1, 2],
        });
        const model: InstrumentModel = {
            id: "snare",
            bone: "spine002",
            pieces: [cube("spine002"), cube("handR"), cube("handL")],
            leftGrip: [0, 0, 0],
            mouthpiece: [0, 0, 0],
        };
        const g = instrumentGeometry(
            mesh.skeleton,
            poseArms(mesh.skeleton, h),
            h,
            model,
        );
        const index = (name: string) =>
            mesh.skeleton.bones.findIndex((b) => b.name === name);
        const si = g.getAttribute("skinIndex");
        expect(si.getX(0)).toBe(index("DEF-spine002"));
        expect(si.getX(3)).toBe(index("DEF-handR"));
        expect(si.getX(6)).toBe(index("DEF-handL"));
    });

    it("places a chest piece by the hold's placement in the bind pose", async () => {
        const mesh = await body();
        const h = hold("snare", "up");
        const model: InstrumentModel = {
            id: "snare",
            bone: "spine002",
            pieces: [
                {
                    part: 19,
                    positions: [0, 0, 0],
                    normals: [0, 1, 0],
                    indices: [0],
                },
            ],
            leftGrip: [0, 0, 0],
            mouthpiece: [0, 0, 0],
        };
        const g = instrumentGeometry(
            mesh.skeleton,
            poseArms(mesh.skeleton, h),
            h,
            model,
        );
        // the chest doesn't move with the arm pose, so bind = posed: the origin lands on the placement
        const p = new THREE.Vector3().fromBufferAttribute(
            g.getAttribute("position") as THREE.BufferAttribute,
            0,
        );
        expect(p.x).toBeCloseTo(h.instrument.origin[0], 6);
        expect(p.y).toBeCloseTo(h.instrument.origin[1], 6);
        expect(p.z).toBeCloseTo(h.instrument.origin[2], 6);
    });
});

describe("instrument color and material", () => {
    it("carries per-vertex linear colors from the model", async () => {
        const mesh = await body();
        const h = hold("brass", "up");
        const g = instrumentGeometry(
            mesh.skeleton,
            poseArms(mesh.skeleton, h),
            h,
            brassModel("trumpet"),
        );
        const color = g.getAttribute("color");
        expect(color.itemSize).toBe(3);
        expect(color.count).toBe(g.getAttribute("position").count);
    });

    it("recolors the metal for a silver finish", async () => {
        const mesh = await body();
        const h = hold("brass", "up");
        const gold = instrumentGeometry(
            mesh.skeleton,
            poseArms(mesh.skeleton, h),
            h,
            brassModel("trumpet"),
            "brass",
        );
        const silver = instrumentGeometry(
            mesh.skeleton,
            poseArms(mesh.skeleton, h),
            h,
            brassModel("trumpet"),
            "silver",
        );
        const part = gold.getAttribute("_part");
        let i = 0;
        while (part.getX(i) !== 16) i++;
        expect(gold.getAttribute("color").getX(i)).not.toBeCloseTo(
            silver.getAttribute("color").getX(i),
            3,
        );
    });

    it("builds a smooth metallic material under the instanced skinning", async () => {
        const mesh = await body();
        const bake = bakeForBodies(
            new Map([
                [
                    "neutral-average",
                    { scene: mesh.parent as THREE.Object3D, mesh },
                ],
            ]) as never,
            {},
            [NO_HOLD],
        );
        const m = instrumentMaterial(bake);
        expect(m.metalness).toBeGreaterThan(0.9);
        expect(m.roughness).toBeLessThan(0.4);
        expect(m.vertexColors).toBe(true);
        expect(m.flatShading).toBe(false);
        // bells and tube ends are open surfaces: their insides must draw too
        expect(m.side).toBe(THREE.DoubleSide);
        expect(m.customProgramCacheKey()).toContain("baked-instances");
    });

    it("draws the rifle's stock, silks and rubber matte, the metal shiny", () => {
        expect(MATTE_PARTS).toEqual(
            expect.arrayContaining([PART_WOOD, PART_SILK, PART_BLACK]),
        );
        expect(MATTE_PARTS).not.toContain(PART_METAL);
        expect(MATTE_PARTS).not.toContain(PART_CHROME);
        // every hook the patch needs is in three's standard shader, so it
        // can't silently do nothing
        const shader = {
            vertexShader: THREE.ShaderLib.standard.vertexShader,
            fragmentShader: THREE.ShaderLib.standard.fragmentShader,
        };
        matteShader(shader);
        expect(shader.vertexShader).toContain("vMatte = (");
        expect(shader.vertexShader).toContain("attribute float _part;");
        expect(shader.fragmentShader).toContain(
            "metalnessFactor *= 1.0 - vMatte;",
        );
        expect(shader.fragmentShader).toContain(
            "roughnessFactor = mix(roughnessFactor",
        );
    });
});

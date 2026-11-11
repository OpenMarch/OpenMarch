// @vitest-environment node
// cspell:words clearcoat envmap
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
    gripMatrix,
    instrumentGeometry,
    instrumentMaterial,
    surfaceOf,
    surfaceShader,
} from "../marchers/instrumentGeometry";
import {
    PART_BLACK,
    PART_CHROME,
    PART_METAL,
    PART_SILK,
    PART_WOOD,
} from "@/view3d/core/instruments/mesh";
import { bakeForBodies } from "../marchers/marcherBodies";
import { Composer } from "@/view3d/render/composer";

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
    it("weights every vertex to the prop bone and keeps the parts", async () => {
        const mesh = await body();
        const h = hold("trumpet", "up");
        const g = instrumentGeometry(
            mesh.skeleton,
            poseArms(mesh.skeleton, h),
            h,
            brassModel("trumpet"),
        );
        // the prop bone follows the skeleton's 23 bones in every bake row
        const prop = mesh.skeleton.bones.length;
        expect(prop).toBe(23);
        const si = g.getAttribute("skinIndex");
        const sw = g.getAttribute("skinWeight");
        for (let i = 0; i < si.count; i++) {
            expect(si.getX(i)).toBe(prop);
            expect(sw.getX(i)).toBe(1);
        }
        const parts = new Set<number>();
        const part = g.getAttribute("_part");
        for (let i = 0; i < part.count; i++) parts.add(part.getX(i));
        // the finish metal, nickel trim, and the pearl valve buttons
        expect([...parts].sort()).toEqual([16, 18, 23]);
    });

    it("lands on the hold's placement once skinned with the prop bone: the posed hand times the grip", async () => {
        const mesh = await body();
        const h = hold("trumpet", "up");
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
        // the prop bone: the hand's skinning matrix, bindInv * handWorld(posed)
        // * boneInverse * bind with bind = identity here, times the grip
        const skin = pose.handR
            .clone()
            .multiply(mesh.skeleton.boneInverses[handR])
            .multiply(gripMatrix(mesh.skeleton, pose, h));
        const box = new THREE.Box3();
        const v = new THREE.Vector3();
        const pos = g.getAttribute("position");
        for (let i = 0; i < pos.count; i++)
            box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(skin));
        const c = box.getCenter(new THREE.Vector3());
        // the trumpet runs forward from the grip: its center is ahead of the origin, near face height
        expect(c.z).toBeGreaterThan(h.instrument.origin[2]);
        expect(Math.abs(c.y - h.instrument.origin[1])).toBeLessThan(0.1);
        // a B♭ trumpet with its mouthpiece, rim to bell
        expect(box.max.z - box.min.z).toBeCloseTo(0.56, 1);
    });
});

describe("pieces on other bones", () => {
    it("weights each piece to its own bone: the chest for a drum, the prop bone and the left hand for the sticks", async () => {
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
        // a right-hand piece rides the prop bone, after the skeleton's bones
        expect(si.getX(3)).toBe(mesh.skeleton.bones.length);
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
        const h = hold("trumpet", "up");
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
        const h = hold("trumpet", "up");
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

    it("builds a smooth metallic material skinned from the composed bones", async () => {
        const mesh = await body();
        const bake = bakeForBodies(
            new Map([
                [
                    "neutral-average",
                    { scene: mesh.parent as THREE.Object3D, mesh },
                ],
            ]) as never,
            {},
        );
        const m = instrumentMaterial(new Composer(bake, 1));
        expect(m.metalness).toBeGreaterThan(0.9);
        expect(m.roughness).toBeLessThan(0.4);
        expect(m.clearcoat).toBe(1);
        expect(m.vertexColors).toBe(true);
        expect(m.flatShading).toBe(false);
        // bells and tube ends are open surfaces: their insides must draw too
        expect(m.side).toBe(THREE.DoubleSide);
        expect(m.customProgramCacheKey()).toContain("composed-instances");
    });

    it("gives each vertex its part's surface: lacquer under a clear coat, bare silver, matte rubber", async () => {
        expect(MATTE_PARTS).toEqual(
            expect.arrayContaining([PART_WOOD, PART_SILK, PART_BLACK]),
        );
        expect(MATTE_PARTS).not.toContain(PART_METAL);
        expect(MATTE_PARTS).not.toContain(PART_CHROME);
        // lacquered brass is metal under a glossy coat; silver plate is
        // bare and sharper; rubber and paint are not metal at all
        const lacquer = surfaceOf(PART_METAL, "brass");
        const silver = surfaceOf(PART_METAL, "silver");
        expect(lacquer).toMatchObject({ metalness: 1, coat: 1 });
        expect(silver).toMatchObject({ metalness: 1, coat: 0 });
        expect(silver.roughness).toBeLessThan(lacquer.roughness);
        expect(surfaceOf(PART_CHROME, "brass").metalness).toBe(1);
        expect(surfaceOf(PART_BLACK, "brass")).toMatchObject({
            metalness: 0,
            coat: 0,
        });

        const mesh = await body();
        const h = hold("trumpet", "up");
        const g = instrumentGeometry(
            mesh.skeleton,
            poseArms(mesh.skeleton, h),
            h,
            brassModel("trumpet"),
            "silver",
        );
        const part = g.getAttribute("_part");
        const surface = g.getAttribute("_surface");
        expect(surface.count).toBe(part.count);
        for (let i = 0; i < part.count; i += 97) {
            const want = surfaceOf(part.getX(i), "silver");
            expect(surface.getX(i)).toBeCloseTo(want.metalness, 5);
            expect(surface.getY(i)).toBeCloseTo(want.roughness, 5);
            expect(surface.getZ(i)).toBeCloseTo(want.coat, 5);
        }
    });

    it("patches every hook it needs in three's physical shader", () => {
        // each hook is in the shader, so the patch can't silently do nothing
        const shader = {
            vertexShader: THREE.ShaderLib.physical.vertexShader,
            fragmentShader: THREE.ShaderLib.physical.fragmentShader,
        };
        surfaceShader(shader);
        expect(shader.vertexShader).toContain("attribute vec3 _surface;");
        expect(shader.vertexShader).toContain("vSurface = _surface;");
        expect(shader.fragmentShader).toContain(
            "metalnessFactor = vSurface.x;",
        );
        expect(shader.fragmentShader).toContain(
            "roughnessFactor = vSurface.y;",
        );
        expect(shader.fragmentShader).toContain(
            "material.clearcoat *= vSurface.z;",
        );
        // the environment's boost replaced the chunk's own intensity
        expect(shader.fragmentShader).toContain("(envMapIntensity * ");
        expect(shader.fragmentShader).not.toContain(
            "#include <envmap_physical_pars_fragment>",
        );
    });
});

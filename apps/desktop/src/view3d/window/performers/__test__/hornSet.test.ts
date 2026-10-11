// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
    defaultPerformerBody,
    sectionUniform,
    type BodyType,
} from "@/view3d/core/marchers/looks";
import type { LoadedBody } from "../marchers/marcherAssets";
import { NO_HOLD, bakeForBodies } from "../marchers/marcherBodies";
import { HORN_FAR_M, HORN_NEAR_M, HornSet } from "../marchers/hornSet";

const root = path.resolve(__dirname, "../../../assets/om-pose");
async function gltf(file: string) {
    const b = fs.readFileSync(path.join(root, file));
    return new GLTFLoader().parseAsync(
        b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
        "",
    );
}
async function setup() {
    const body = await gltf("bodies/neutral-average.glb");
    let mesh: THREE.SkinnedMesh | null = null;
    body.scene.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh)
            mesh = o as THREE.SkinnedMesh;
    });
    const bodies = new Map<BodyType, LoadedBody>();
    // two body types share one skeleton: horns must not split by body type
    bodies.set("neutral-average", {
        scene: body.scene,
        mesh: mesh!,
    } as LoadedBody);
    bodies.set("neutral-slim", {
        scene: body.scene,
        mesh: mesh!,
    } as LoadedBody);
    const clip = (await gltf("clips/clips-h100.glb")).animations.find(
        (c) => c.name === "8to5",
    )!;
    const bake = bakeForBodies(bodies, { "8to5": clip }, ["brass:up", NO_HOLD]);
    return { bodies, bake };
}
const look = (id: number, type: BodyType, section: string) => ({
    body: { ...defaultPerformerBody(id), bodyType: type },
    uniform: sectionUniform(section, null),
});
const material = (bake: ReturnType<typeof bakeForBodies>) => {
    const m = new THREE.MeshStandardMaterial();
    m.userData.uniforms = { uCount: { value: 0 } };
    void bake;
    return m;
};

/** Frame inputs: slot i at (x_i, 0), all placed, heading 0, scale 1. */
function frame(xs: number[]) {
    const xz = new Float32Array(xs.length * 2);
    xs.forEach((x, i) => (xz[i * 2] = x));
    return {
        xz,
        heading: new Float32Array(xs.length),
        placed: Uint8Array.from(xs.map(() => 1)),
        scale: Float32Array.from(xs.map(() => 1)),
    };
}

describe("HornSet", () => {
    it("groups instruments by look across body types, with a near and a far mesh at high quality", async () => {
        const { bodies, bake } = await setup();
        const set = new HornSet(
            bodies,
            bake,
            [
                look(1, "neutral-average", "Trumpet"),
                look(2, "neutral-slim", "Trumpet"),
                look(3, "neutral-average", "Drum Major"),
            ],
            "high",
            material(bake),
        );
        expect(set.meshes.length).toBe(2);
        const [near, far] = set.meshes;
        const triangles = (m: THREE.InstancedMesh) =>
            m.geometry.index!.count / 3;
        expect(triangles(near)).toBeGreaterThan(triangles(far) * 2);
        expect(set.drawCalls).toBe(2);
        set.dispose();
    });

    it("draws near instruments at full detail and far ones at low detail", async () => {
        const { bodies, bake } = await setup();
        const set = new HornSet(
            bodies,
            bake,
            [
                look(1, "neutral-average", "Trumpet"),
                look(2, "neutral-slim", "Trumpet"),
            ],
            "high",
            material(bake),
        );
        const f = frame([5, 100]);
        set.writeFrame(f.xz, f.heading, f.placed, f.scale, [0, 2, 0]);
        const [near, far] = set.meshes;
        expect(near.count).toBe(1);
        expect(far.count).toBe(1);
        // the near mesh's first instance sits at x 5, the far one's at x 100
        expect(near.instanceMatrix.array[12]).toBeCloseTo(5, 6);
        expect(far.instanceMatrix.array[12]).toBeCloseTo(100, 6);
        set.dispose();
    });

    it("moves a slot's clip with it into its packed index", async () => {
        const { bodies, bake } = await setup();
        const set = new HornSet(
            bodies,
            bake,
            [
                look(1, "neutral-average", "Trumpet"),
                look(2, "neutral-slim", "Trumpet"),
            ],
            "high",
            material(bake),
        );
        const row = bake.rows["8to5@brass:up"];
        set.setClip(1, { row, phase: -7, rate: 1, legYaw: 0 });
        const f = frame([100, 5]); // slot 1 is near, slot 0 far
        set.writeFrame(f.xz, f.heading, f.placed, f.scale, [0, 2, 0]);
        const [near] = set.meshes;
        const aTime = near.geometry.getAttribute(
            "aTime",
        ) as THREE.InstancedBufferAttribute;
        expect(aTime.getX(0)).toBe(-7);
        set.dispose();
    });

    it("keeps an instrument in its mesh inside the hysteresis band", async () => {
        const { bodies, bake } = await setup();
        const set = new HornSet(
            bodies,
            bake,
            [look(1, "neutral-average", "Trumpet")],
            "high",
            material(bake),
        );
        const between = (HORN_NEAR_M + HORN_FAR_M) / 2;
        let f = frame([5]);
        set.writeFrame(f.xz, f.heading, f.placed, f.scale, [0, 2, 0]);
        f = frame([between]);
        set.writeFrame(f.xz, f.heading, f.placed, f.scale, [0, 2, 0]);
        expect(set.meshes[0].count).toBe(1); // still near
        f = frame([HORN_FAR_M + 5]);
        set.writeFrame(f.xz, f.heading, f.placed, f.scale, [0, 2, 0]);
        expect(set.meshes[0].count).toBe(0);
        f = frame([between]);
        set.writeFrame(f.xz, f.heading, f.placed, f.scale, [0, 2, 0]);
        expect(set.meshes[1].count).toBe(1); // stays far
        set.dispose();
    });

    it("has one low-detail mesh per look at low quality", async () => {
        const { bodies, bake } = await setup();
        const set = new HornSet(
            bodies,
            bake,
            [look(1, "neutral-average", "Trumpet")],
            "low",
            material(bake),
        );
        expect(set.meshes.length).toBe(1);
        const f = frame([5]);
        set.writeFrame(f.xz, f.heading, f.placed, f.scale, [0, 2, 0]);
        expect(set.meshes[0].count).toBe(1);
        set.dispose();
    });

    it("leaves unplaced slots out of both meshes", async () => {
        const { bodies, bake } = await setup();
        const set = new HornSet(
            bodies,
            bake,
            [
                look(1, "neutral-average", "Trumpet"),
                look(2, "neutral-slim", "Trumpet"),
            ],
            "high",
            material(bake),
        );
        const f = frame([5, 6]);
        f.placed[1] = 0;
        set.writeFrame(f.xz, f.heading, f.placed, f.scale, [0, 2, 0]);
        expect(set.meshes[0].count + set.meshes[1].count).toBe(1);
        set.dispose();
    });
});

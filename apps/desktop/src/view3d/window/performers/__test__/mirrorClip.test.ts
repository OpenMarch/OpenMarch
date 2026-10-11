// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mirrorClip, mirrorName } from "../marchers/mirrorClip";

async function load() {
    const b = fs.readFileSync(
        path.resolve(
            __dirname,
            "../../../assets/om-pose/bodies/neutral-average.glb",
        ),
    );
    const body = await new GLTFLoader().parseAsync(
        b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
        "",
    );
    const c = fs.readFileSync(
        path.resolve(__dirname, "../../../assets/om-pose/clips/clips-h100.glb"),
    );
    const clips = await new GLTFLoader().parseAsync(
        c.buffer.slice(c.byteOffset, c.byteOffset + c.byteLength),
        "",
    );
    return { scene: body.scene, clips: clips.animations };
}

/** World position of a bone after posing `scene` with `clip` at `t`. */
function posed(
    scene: THREE.Object3D,
    clip: THREE.AnimationClip,
    t: number,
    bone: string,
): THREE.Vector3 {
    const rig = scene.clone(true);
    const mixer = new THREE.AnimationMixer(rig);
    const action = mixer.clipAction(clip);
    action.play();
    mixer.update(t);
    rig.updateMatrixWorld(true);
    return new THREE.Vector3().setFromMatrixPosition(
        rig.getObjectByName(bone)!.matrixWorld,
    );
}

describe("mirrorClip", () => {
    it("swaps the sides so the mirrored pose is the reflection of the original", async () => {
        const { scene, clips } = await load();
        const clip = clips.find((c) => c.name === "8to5")!;
        const m = mirrorClip(clip, "8to5~R");
        expect(m.name).toBe("8to5~R");
        expect(m.duration).toBe(clip.duration);
        expect(m.tracks.length).toBe(clip.tracks.length);
        for (const t of [0.1, 0.4, 0.8]) {
            const footL = posed(scene, clip, t, "DEF-footL");
            const footR = posed(scene, clip, t, "DEF-footR");
            const mL = posed(scene, m, t, "DEF-footL");
            const mR = posed(scene, m, t, "DEF-footR");
            // the mirrored left foot is where the original right foot was, reflected in x
            expect(mL.x).toBeCloseTo(-footR.x, 4);
            expect(mL.y).toBeCloseTo(footR.y, 4);
            expect(mL.z).toBeCloseTo(footR.z, 4);
            expect(mR.x).toBeCloseTo(-footL.x, 4);
            expect(mR.z).toBeCloseTo(footL.z, 4);
            // the hips stay on the center line
            const hip = posed(scene, m, t, "DEF-spine");
            expect(Math.abs(hip.x)).toBeLessThan(0.05);
        }
    });

    it("leaves the source clip untouched", async () => {
        const { clips } = await load();
        const clip = clips.find((c) => c.name === "stepoff_8to5")!;
        const before = Array.from(
            clip.tracks.find((t) => t.name === "DEF-thighL.quaternion")!.values,
        );
        mirrorClip(clip, "x");
        expect(
            Array.from(
                clip.tracks.find((t) => t.name === "DEF-thighL.quaternion")!
                    .values,
            ),
        ).toEqual(before);
    });
});

describe("mirrorName", () => {
    it("swaps slides and built turns, and leaves symmetric clips alone", () => {
        expect(mirrorName("slideL8to5")).toBe("slideR8to5");
        expect(mirrorName("stepoff_slideR12to5")).toBe("stepoff_slideL12to5");
        expect(mirrorName("halt2_back8to5_L45")).toBe("halt2_back8to5_R45");
        expect(mirrorName("change_8to5__slideL8to5")).toBe(
            "change_8to5__slideR8to5",
        );
        expect(mirrorName("change2_slideR8to5__slideL8to5")).toBe(
            "change2_slideL8to5__slideR8to5",
        );
        expect(mirrorName("8to5-h105")).toBe("8to5-h105");
        expect(mirrorName("marktime")).toBe("marktime");
    });
});

describe("the step-off foot is the performer's own", () => {
    it("steps off on the performer's left as baked, and on their right mirrored", async () => {
        const { scene, clips } = await load();
        const clip = (name: string) => clips.find((c) => c.name === name)!;
        // the body faces +Z (the toes point that way), so the performer's left is +X
        const att = clip("attention");
        expect(posed(scene, att, 0, "DEF-toeL").z).toBeGreaterThan(
            posed(scene, att, 0, "DEF-footL").z,
        );
        expect(posed(scene, att, 0, "DEF-footL").x).toBeGreaterThan(0);

        // three tenths of the way through the step-off count: which foot is out front?
        const lead = (c: THREE.AnimationClip) => {
            const a = posed(scene, c, 0.3, "DEF-footL");
            const b = posed(scene, c, 0.3, "DEF-footR");
            return a.z > b.z ? a : b;
        };
        // "left": the clip as baked
        const left = lead(clip("stepoff_8to5"));
        expect(left.x).toBeGreaterThan(0);
        expect(left.z).toBeGreaterThan(0.2);
        // "right": every row mirrored from its partner
        const right = lead(
            mirrorClip(clip(mirrorName("stepoff_8to5")), "stepoff_8to5"),
        );
        expect(right.x).toBeLessThan(0);
        expect(right.z).toBeGreaterThan(0.2);
    });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
    HEEL_LIFT,
    platformClip,
    platformRig,
    platformWeight,
    prepBase,
} from "../marchers/platformClip";
import { prepName } from "@/view3d/core/marchers/planner";

async function parse(file: string) {
    const b = fs.readFileSync(
        path.resolve(__dirname, "../../../assets/om-pose", file),
    );
    return new GLTFLoader().parseAsync(
        b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
        "",
    );
}

let cache: Promise<{
    scene: THREE.Object3D;
    clips: THREE.AnimationClip[];
    skeleton: THREE.Skeleton;
}> | null = null;
function load() {
    cache ??= (async () => {
        const body = await parse("bodies/neutral-average.glb");
        const clips = await parse("clips/clips-h100.glb");
        let mesh: THREE.SkinnedMesh | null = null;
        body.scene.traverse((o) => {
            if ((o as THREE.SkinnedMesh).isSkinnedMesh && !mesh)
                mesh = o as THREE.SkinnedMesh;
        });
        return {
            scene: body.scene,
            clips: clips.animations,
            skeleton: mesh!.skeleton,
        };
    })();
    return cache;
}

/** Both feet's bones at fraction `u` of the clip, and their balls (the toe bones' heads). */
function feet(scene: THREE.Object3D, clip: THREE.AnimationClip, u: number) {
    const rig = scene.clone(true);
    const mixer = new THREE.AnimationMixer(rig);
    const action = mixer.clipAction(clip);
    action.play();
    action.paused = true;
    action.time = u * clip.duration;
    mixer.update(0);
    rig.updateMatrixWorld(true);
    const side = (s: "L" | "R") => ({
        foot: rig.getObjectByName(`DEF-foot${s}`)!,
        ball: new THREE.Vector3().setFromMatrixPosition(
            rig.getObjectByName(`DEF-toe${s}`)!.matrixWorld,
        ),
    });
    return { L: side("L"), R: side("R") };
}

/** The heel's height: a point fixed in the foot, behind and above the ankle at bind. */
async function heelPoints() {
    const { scene } = await load();
    scene.updateMatrixWorld(true);
    const out: Record<"L" | "R", THREE.Vector3> = {
        L: new THREE.Vector3(),
        R: new THREE.Vector3(),
    };
    for (const s of ["L", "R"] as const) {
        const foot = scene.getObjectByName(`DEF-foot${s}`)!;
        const ankle = new THREE.Vector3().setFromMatrixPosition(
            foot.matrixWorld,
        );
        out[s] = foot.worldToLocal(
            ankle.add(new THREE.Vector3(0, 0.01, -0.045)),
        );
    }
    return out;
}

async function pose(clip: THREE.AnimationClip, u: number) {
    const { scene } = await load();
    const local = await heelPoints();
    const f = feet(scene, clip, u);
    const heel = (s: "L" | "R") => f[s].foot.localToWorld(local[s].clone());
    return {
        L: { ball: f.L.ball, heel: heel("L") },
        R: { ball: f.R.ball, heel: heel("R") },
    };
}

/** The planted foot at that moment: the one whose ball is lower. */
const planted = (p: Awaited<ReturnType<typeof pose>>) =>
    p.L.ball.y <= p.R.ball.y ? p.L : p.R;

describe("marching on the platform of the foot", () => {
    it("picks the clips: backward marching all the way, a close until the feet meet", () => {
        expect(platformWeight("back8to5")?.(0.5)).toBe(1);
        expect(platformWeight("back16to5_L45-h095")?.(0.2)).toBe(1);
        expect(platformWeight("halt_8to5")?.(0.5)).toBe(1);
        expect(platformWeight("halt2_back8to5")?.(1)).toBe(0);
        expect(platformWeight("stepoff_back8to5")?.(0)).toBe(0);
        expect(platformWeight("8to5")).toBeNull();
        expect(platformWeight("stepoff_8to5")).toBeNull();
        expect(platformWeight("attention")).toBeNull();
    });

    it("lifts the heel of the planted foot about an inch in a backward march, ball still on the ground", async () => {
        const { clips, skeleton } = await load();
        const src = clips.find((c) => c.name === "back8to5")!;
        const out = platformClip(
            src,
            platformRig(skeleton),
            platformWeight("back8to5")!,
        );
        for (const u of [0.1, 0.35, 0.6, 0.85]) {
            const before = planted(await pose(src, u));
            const after = planted(await pose(out, u));
            expect(after.heel.y - before.heel.y).toBeGreaterThan(
                HEEL_LIFT * 0.8,
            );
            expect(after.heel.y - before.heel.y).toBeLessThan(HEEL_LIFT * 1.2);
            expect(Math.abs(after.ball.y - before.ball.y)).toBeLessThan(0.004);
        }
    });

    it("closes on the platform and comes down flat at the end", async () => {
        const { clips, skeleton } = await load();
        const src = clips.find((c) => c.name === "halt_8to5")!;
        const out = platformClip(
            src,
            platformRig(skeleton),
            platformWeight("halt_8to5")!,
        );
        const mid = [
            planted(await pose(src, 0.5)),
            planted(await pose(out, 0.5)),
        ];
        expect(mid[1].heel.y - mid[0].heel.y).toBeGreaterThan(HEEL_LIFT * 0.8);
        expect(Math.abs(mid[1].ball.y - mid[0].ball.y)).toBeLessThan(0.004);
        const end = [await pose(src, 1), await pose(out, 1)];
        for (const s of ["L", "R"] as const)
            expect(end[1][s].heel.distanceTo(end[0][s].heel)).toBeLessThan(
                1e-3,
            );
    });
});

describe("prep landings on the platform", () => {
    it("rises into the landing at its loop time and comes down through the next half count", () => {
        // a two-count loop: clip fraction u is clip time / 2 counts
        const w = platformWeight(prepName("8to5", 1))!;
        expect(w(1 / 2)).toBeCloseTo(1, 9); // the landing
        expect(w(0.75 / 2)).toBeGreaterThan(0.5); // rising
        expect(w(0.3 / 2)).toBe(0); // well before
        expect(w(1.5 / 2)).toBe(0); // down by the next half count
        expect(w(1.25 / 2)).toBeGreaterThan(0); // still coming down
        // a landing at loop time 0 wraps across the loop's end
        const w0 = platformWeight(prepName("8to5", 0))!;
        expect(w0(0)).toBeCloseTo(1, 9);
        expect(w0(1.8 / 2)).toBeGreaterThan(0.5);
    });

    it("keeps a backward loop on the platform throughout", () => {
        const w = platformWeight(prepName("back8to5", 0))!;
        for (const u of [0, 0.3, 0.6, 0.9]) expect(w(u)).toBe(1);
    });

    it("reads a prep row's base clip back", () => {
        expect(prepBase(prepName("slideL8to5-h095", 1))).toBe(
            "slideL8to5-h095",
        );
        expect(prepBase("8to5")).toBe("8to5");
    });
});

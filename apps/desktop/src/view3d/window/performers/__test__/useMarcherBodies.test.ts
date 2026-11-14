import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { renderHook } from "@testing-library/react";
import type { AnimationClip, SkinnedMesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Manifest } from "@/view3d/render/step-blend.js";
import {
    defaultPerformerBody,
    sectionUniform,
    type BodyType,
} from "@/view3d/core/marchers/looks";
import type { HoldState } from "@/view3d/core/instruments/holds";
import type { LoadedBody } from "../marchers/marcherAssets";
import {
    ClipSet,
    useMarcherBodies,
    type MarcherAssets,
} from "../marchers/useMarcherBodies";
import { holdRowName } from "../marchers/hornRows";
import { restoreStillPose } from "@/view3d/window/performers/marchers/stillPose";

const root = path.resolve(__dirname, "../../../assets/om-pose");

async function gltf(file: string) {
    const b = fs.readFileSync(path.join(root, file));
    // copy into this (jsdom) realm's ArrayBuffer: the loader rejects a Node one
    const ab = new ArrayBuffer(b.byteLength);
    new Uint8Array(ab).set(b);
    return new GLTFLoader().parseAsync(ab, "");
}

async function assets(): Promise<MarcherAssets> {
    const body = await gltf("bodies/neutral-average.glb");
    let mesh: SkinnedMesh | null = null;
    body.scene.traverse((o) => {
        if ((o as SkinnedMesh).isSkinnedMesh) mesh = o as SkinnedMesh;
    });
    const clips = new Map<string, AnimationClip>();
    for (const c of restoreStillPose(
        (await gltf("clips/clips-h100.glb")).animations,
    ))
        clips.set(c.name, c);
    return {
        bodies: new Map([
            ["neutral-average", { scene: body.scene, mesh: mesh! }],
        ]) as Map<BodyType, LoadedBody>,
        manifest: JSON.parse(
            fs.readFileSync(path.join(root, "manifest.json"), "utf8"),
        ) as Manifest,
        clips,
        classes: new Set([1 as const]),
        key: "1|",
    };
}

// the fixture loads one body, so pin the look to it
const looksIn = (hold: HoldState) => [
    {
        body: {
            ...defaultPerformerBody(1),
            bodyType: "neutral-average" as const,
        },
        uniform: sectionUniform("Trumpet", hold),
    },
];

describe("useMarcherBodies", () => {
    it("bakes again for new Horn rows and disposes the previous bake texture and bodies", async () => {
        const a = await assets();
        const { result, rerender } = renderHook(
            ({ hold }: { hold: HoldState }) =>
                useMarcherBodies(
                    a,
                    ["attention", "8to5"],
                    looksIn(hold),
                    "high",
                    "left",
                    undefined,
                    [holdRowName(`trumpet:${hold}`)],
                ),
            { initialProps: { hold: "up" } },
        );
        const first = result.current!;
        expect(Object.keys(first.bake.rows).sort()).toEqual([
            "8to5",
            "attention",
            "hold:trumpet:up",
        ]);
        const textureDispose = vi.spyOn(first.bake.texture, "dispose");
        const bodiesDispose = vi.spyOn(first, "dispose");

        rerender({ hold: "carry" });
        const second = result.current!;
        expect(second).not.toBe(first);
        expect(Object.keys(second.bake.rows).sort()).toEqual([
            "8to5",
            "attention",
            "hold:trumpet:carry",
        ]);
        expect(textureDispose).toHaveBeenCalledTimes(1);
        expect(bodiesDispose).toHaveBeenCalledTimes(1);
    });
});

describe("ClipSet", () => {
    const crab = async () => {
        const manifest = JSON.parse(
            fs.readFileSync(path.join(root, "crab/manifest.json"), "utf8"),
        ) as Manifest;
        const clips = restoreStillPose(
            (await gltf("crab/clips-h100.glb")).animations,
        );
        return { set: new ClipSet(clips, manifest), clips };
    };
    const track = (clip: AnimationClip, name: string) =>
        clip.tracks.find((t) => t.name === name)!;

    it("makes crab right's loop from crab left's: mirrored, a count on", async () => {
        const { set, clips } = await crab();
        expect(clips.some((c) => c.name === "crabR090_8to5")).toBe(false);
        const right = set.get("crabR090_8to5")!;
        const left = set.get("crabL090_8to5")!;
        expect(right.duration).toBe(left.duration);
        // the right thigh at the start is the left thigh a count on, reflected
        const r = track(right, "DEF-thighR.quaternion").values;
        const l = track(left, "DEF-thighL.quaternion").values;
        const half = ((l.length / 4 - 1) / 2) * 4;
        expect(r[0]).toBeCloseTo(l[half], 6);
        expect(r[1]).toBeCloseTo(-l[half + 1], 6);
        expect(r[2]).toBeCloseTo(-l[half + 2], 6);
        expect(r[3]).toBeCloseTo(l[half + 3], 6);
    });

    it("makes crab right's halts from the other halt, in time", async () => {
        const { set } = await crab();
        const halt = set.get("halt_crabR090_8to5")!;
        const source = set.get("halt2_crabL090_8to5")!;
        const r = track(halt, "DEF-thighR.quaternion").values;
        const l = track(source, "DEF-thighL.quaternion").values;
        expect(r[0]).toBeCloseTo(l[0], 6);
        expect(r[1]).toBeCloseTo(-l[1], 6);
    });

    it("holds a stop's last pose for a stop-and-go's still count", async () => {
        const { set } = await crab();
        const stop = set.get("stop_crabL090_8to5")!;
        const hold = set.get("hold_crabL090_8to5")!;
        expect(hold.duration).toBe(stop.duration);
        const s = track(stop, "DEF-thighL.quaternion").values;
        const h = track(hold, "DEF-thighL.quaternion").values;
        expect(Array.from(h)).toEqual([
            ...Array.from(s.slice(-4)),
            ...Array.from(s.slice(-4)),
        ]);
    });

    it("makes the weight-on-the-right stop from the other side's, mirrored", async () => {
        const { set } = await crab();
        const stop2 = set.get("stop2_crabL090_8to5")!;
        const source = set.get("stop_crabR090_8to5")!;
        const r = track(stop2, "DEF-thighR.quaternion").values;
        const l = track(source, "DEF-thighL.quaternion").values;
        expect(r[0]).toBeCloseTo(l[0], 6);
        expect(r[1]).toBeCloseTo(-l[1], 6);
        // and its still count holds that
        expect(set.get("hold2_crabL090_8to5")).toBeDefined();
    });

    it("keeps what it made, serves stored clips as they are, and has nothing else", async () => {
        const { set, clips } = await crab();
        expect(set.get("crabR090_8to5")).toBe(set.get("crabR090_8to5"));
        const stored = clips.find((c) => c.name === "stepoff_crabR090_8to5")!;
        expect(set.get(stored.name)).toBe(stored);
        expect(set.get("crabR999_8to5")).toBeUndefined();
    });

    it("has every clip the crab manifest lists", async () => {
        const { set } = await crab();
        const manifest = JSON.parse(
            fs.readFileSync(path.join(root, "crab/manifest.json"), "utf8"),
        ) as { clips: { name: string; height: number }[] };
        const missing = manifest.clips
            .filter((c) => c.height === 1)
            .filter((c) => !set.get(c.name));
        expect(missing).toEqual([]);
    });
});

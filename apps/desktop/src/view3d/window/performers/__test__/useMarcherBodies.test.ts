import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { renderHook } from "@testing-library/react";
import type { AnimationClip, SkinnedMesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Manifest } from "@/view3d/vendor/om-pose/step-blend.js";
import {
    defaultPerformerBody,
    sectionUniform,
    type BodyType,
} from "@/view3d/core/marchers/looks";
import type { HoldState } from "@/view3d/core/instruments/holds";
import type { LoadedBody } from "../marchers/marcherAssets";
import {
    useMarcherBodies,
    type MarcherAssets,
} from "../marchers/useMarcherBodies";

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
    for (const c of (await gltf("clips/clips-h100.glb")).animations)
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
    };
}

// the fixture loads one body, so pin the look to it
const looksIn = (hold: HoldState) => [
    {
        body: {
            ...defaultPerformerBody(1),
            bodyType: "neutral-average" as const,
        },
        uniform: sectionUniform("Trumpet", null, hold),
    },
];

describe("useMarcherBodies", () => {
    it("rebuilds for a new hold and disposes the previous bake texture and bodies", async () => {
        const a = await assets();
        const { result, rerender } = renderHook(
            ({ hold }: { hold: HoldState }) =>
                useMarcherBodies(
                    a,
                    ["attention", "8to5"],
                    looksIn(hold),
                    "high",
                ),
            { initialProps: { hold: "up" } },
        );
        const first = result.current!;
        expect(Object.keys(first.bake.rows).sort()).toEqual([
            "8to5@brass:up",
            "attention@brass:up",
        ]);
        const textureDispose = vi.spyOn(first.bake.texture, "dispose");
        const bodiesDispose = vi.spyOn(first, "dispose");

        rerender({ hold: "carry" });
        const second = result.current!;
        expect(second).not.toBe(first);
        expect(Object.keys(second.bake.rows).sort()).toEqual([
            "8to5@brass:carry",
            "attention@brass:carry",
        ]);
        expect(textureDispose).toHaveBeenCalledTimes(1);
        expect(bodiesDispose).toHaveBeenCalledTimes(1);
    });
});

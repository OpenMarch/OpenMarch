// @vitest-environment node
// cspell:words Interpolant
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { BufferGeometry, SkinnedMesh } from "three";
import type * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
    bassOptions,
    sectionUniform,
    type BodyType,
} from "@/view3d/core/marchers/looks";
import type { LoadedBody } from "../marchers/marcherAssets";
import { defaultPerformerBody } from "@/view3d/core/marchers/looks";
import {
    MarcherBodies,
    NO_HOLD,
    bakeForBodies,
    clipForBake,
    clipsToLoad,
    rowKey,
    slotHoldId,
    visibleIndex,
} from "../marchers/marcherBodies";
import { platformRig } from "../marchers/platformClip";

async function body(): Promise<BufferGeometry> {
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
    let geo: BufferGeometry | null = null;
    gltf.scene.traverse((o) => {
        if ((o as SkinnedMesh).isSkinnedMesh) geo = (o as SkinnedMesh).geometry;
    });
    return geo!;
}

async function loadedBodies() {
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
    let mesh: SkinnedMesh | null = null;
    gltf.scene.traverse((o) => {
        if ((o as SkinnedMesh).isSkinnedMesh) mesh = o as SkinnedMesh;
    });
    return new Map([
        ["neutral-average", { scene: gltf.scene, mesh: mesh! }],
    ]) as Map<BodyType, LoadedBody>;
}

async function allClips() {
    const b = fs.readFileSync(
        path.resolve(__dirname, "../../../assets/om-pose/clips/clips-h100.glb"),
    );
    const gltf = await new GLTFLoader().parseAsync(
        b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
        "",
    );
    return new Map(gltf.animations.map((c) => [c.name, c]));
}

async function clip8to5() {
    const b = fs.readFileSync(
        path.resolve(__dirname, "../../../assets/om-pose/clips/clips-h100.glb"),
    );
    const gltf = await new GLTFLoader().parseAsync(
        b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
        "",
    );
    return gltf.animations.find((c) => c.name === "8to5")!;
}

describe("rows per hold", () => {
    it("names rows by clip and hold, bare for no hold", () => {
        expect(rowKey("8to5", NO_HOLD)).toBe("8to5");
        expect(rowKey("8to5-h105", "brass:up")).toBe("8to5-h105@brass:up");
        expect(slotHoldId(sectionUniform("Trumpet", null, "carry"))).toBe(
            "brass:carry",
        );
        expect(slotHoldId(sectionUniform("Drum Major", null))).toBe(NO_HOLD);
    });

    it("bakes one row set per hold", async () => {
        const bodies = await loadedBodies();
        const clip = await clip8to5();
        const bake = bakeForBodies(bodies, { "8to5": clip }, [
            NO_HOLD,
            "brass:up",
            "brass:carry",
        ]);
        expect(Object.keys(bake.rows).sort()).toEqual([
            "8to5",
            "8to5@brass:carry",
            "8to5@brass:up",
        ]);
        expect(bake.rows["8to5@brass:up"].frames).toBe(
            bake.rows["8to5"].frames,
        );
    });
});

describe("baking only the rows marchers play", () => {
    it("skips clip and hold pairs no marcher plays", async () => {
        const bodies = await loadedBodies();
        const clip = await clip8to5();
        const bake = bakeForBodies(
            bodies,
            { "8to5": clip, attention: clip },
            [NO_HOLD, "brass:up"],
            "left",
            new Set(["8to5@brass:up", "attention", "attention@brass:up"]),
        );
        expect(Object.keys(bake.rows).sort()).toEqual([
            "8to5@brass:up",
            "attention",
            "attention@brass:up",
        ]);
    });
});

describe("horns as their own meshes", () => {
    async function trumpetAndDrumMajor(quality: "high" | "low") {
        const bodies = await loadedBodies();
        const clip = await clip8to5();
        const bake = bakeForBodies(bodies, { "8to5": clip }, [
            "brass:up",
            NO_HOLD,
        ]);
        const looks = [
            {
                body: {
                    ...defaultPerformerBody(1),
                    bodyType: "neutral-average" as const,
                },
                uniform: sectionUniform("Trumpet", null),
            },
            {
                body: {
                    ...defaultPerformerBody(2),
                    bodyType: "neutral-average" as const,
                },
                uniform: sectionUniform("Drum Major", null),
            },
        ];
        return { bake, set: new MarcherBodies(bodies, bake, looks, quality) };
    }

    it("draws a brass group as a body mesh plus a metallic horn mesh", async () => {
        const { set } = await trumpetAndDrumMajor("high");
        const bodiesMeshes = set.group.children.filter((o) =>
            o.name.startsWith("view3d-marchers-"),
        );
        const horns = set.group.children.filter((o) =>
            o.name.startsWith("view3d-horn-"),
        ) as THREE.InstancedMesh[];
        expect(bodiesMeshes.length).toBe(2);
        // one instrument group for the trumpet look: full and low detail
        expect(horns.length).toBe(2);
        expect(set.drawCalls).toBe(4);
        const horn = horns.find((h) => h.name.endsWith("-high"))!;
        expect(horn.geometry.getAttribute("color")).toBeDefined();
        expect(horn.geometry.index!.count / 3).toBeGreaterThan(8000);
        const m = horn.material as THREE.MeshStandardMaterial;
        expect(m.metalness).toBeGreaterThan(0.9);
        expect(m.vertexColors).toBe(true);
        expect(m.flatShading).toBe(false);
        set.dispose();
    });

    it("keeps the body mesh free of horn triangles", async () => {
        const { set } = await trumpetAndDrumMajor("high");
        const bodiesMeshes = set.group.children.filter((o) =>
            o.name.startsWith("view3d-marchers-"),
        ) as THREE.InstancedMesh[];
        for (const m of bodiesMeshes)
            expect(m.geometry.index!.count / 3).toBe(1256);
        set.dispose();
    });

    it("gives the low tier a horn too, at low detail", async () => {
        const { set } = await trumpetAndDrumMajor("low");
        const horns = set.group.children.filter((o) =>
            o.name.startsWith("view3d-horn-"),
        ) as THREE.InstancedMesh[];
        expect(horns.length).toBe(1);
        expect(horns[0].geometry.index!.count / 3).toBeLessThan(3500);
        expect(set.drawCalls).toBe(3); // two block meshes (the looks differ) plus the horn
        set.dispose();
    });

    it("writes the same clip into the body and the horn", async () => {
        const { set, bake } = await trumpetAndDrumMajor("high");
        const row = bake.rows["8to5@brass:up"];
        set.setClip(0, { row, phase: -3, rate: 1, legYaw: 0.1 });
        // the instruments pack their instances when a frame is written: the
        // trumpet at 5 m from the camera lands first in the full-detail mesh
        set.writeFrame(
            Float32Array.from([5, 0, 8, 0]),
            new Float32Array(2),
            Uint8Array.from([1, 1]),
            0,
            [0, 2, 0],
        );
        const bodyMesh = set.group.children.find(
            (o) => o.name === "view3d-marchers-neutral-average",
        ) as THREE.InstancedMesh;
        const horn = set.group.children.find((o) =>
            o.name.endsWith("-high"),
        ) as THREE.InstancedMesh;
        const clipOf = (m: THREE.InstancedMesh) =>
            Array.from(
                (
                    m.geometry.getAttribute("aClip") as THREE.BufferAttribute
                ).array.slice(0, 3),
            );
        expect(clipOf(horn)).toEqual([row.row, row.frames, row.counts]);
        expect(clipOf(horn)).toEqual(clipOf(bodyMesh));
        set.dispose();
    });

    it("drives the horn's clip clock with the bodies' each frame", async () => {
        const { set } = await trumpetAndDrumMajor("high");
        const horn = set.group.children.find((o) =>
            o.name.startsWith("view3d-horn-"),
        ) as THREE.InstancedMesh;
        set.writeFrame(
            new Float32Array(4),
            new Float32Array(2),
            Uint8Array.from([1, 1]),
            7,
        );
        const u = (horn.material as THREE.Material).userData.uniforms as {
            uCount: { value: number };
        };
        expect(u.uCount.value).toBe(7);
        set.dispose();
    });

    it("disposes the horn geometry and material with the set", async () => {
        const { set } = await trumpetAndDrumMajor("high");
        const horns = set.group.children.filter((o) =>
            o.name.startsWith("view3d-horn-"),
        ) as THREE.InstancedMesh[];
        expect(horns.length).toBe(2);
        const geometryDisposes = horns.map((h) =>
            vi.spyOn(h.geometry, "dispose"),
        );
        // one material shared by every instrument mesh
        const materialDispose = vi.spyOn(
            horns[0].material as THREE.Material,
            "dispose",
        );
        set.dispose();
        for (const d of geometryDisposes) expect(d).toHaveBeenCalledTimes(1);
        expect(materialDispose).toHaveBeenCalledTimes(1);
    });

    it("gives a drum-major-only set no horn and one draw call", async () => {
        const bodies = await loadedBodies();
        const clip = await clip8to5();
        const bake = bakeForBodies(bodies, { "8to5": clip }, [NO_HOLD]);
        const set = new MarcherBodies(
            bodies,
            bake,
            [
                {
                    body: {
                        ...defaultPerformerBody(2),
                        bodyType: "neutral-average" as const,
                    },
                    uniform: sectionUniform("Drum Major", null),
                },
            ],
            "high",
        );
        expect(set.drawCalls).toBe(1);
        expect(
            set.group.children.some((o) => o.name.startsWith("view3d-horn-")),
        ).toBe(false);
        set.dispose();
    });
});

describe("bass drum sizes", () => {
    it("draws each bass drum at its marcher's size", async () => {
        const bodies = await loadedBodies();
        const clip = await clip8to5();
        const bake = bakeForBodies(bodies, { "8to5": clip }, ["bass:up"]);
        const sizes = bassOptions([1, 2], ["Bass Drum", "Bass Drum"]);
        const looks = [0, 1].map((i) => ({
            body: {
                ...defaultPerformerBody(i + 1),
                bodyType: "neutral-average" as const,
            },
            uniform: sectionUniform("Bass Drum", null, "up", sizes[i]),
        }));
        const set = new MarcherBodies(bodies, bake, looks, "high");
        const horns = set.group.children.filter(
            (o) =>
                o.name.startsWith("view3d-horn-") && o.name.endsWith("-high"),
        ) as THREE.InstancedMesh[];
        expect(horns.length).toBe(2);
        // the drum shell alone: in the bind pose the mallets hang at the
        // sides and would dominate a whole-mesh bounding box
        const extent = (m: THREE.InstancedMesh) => {
            const pos = m.geometry.getAttribute("position");
            const part = m.geometry.getAttribute("_part");
            const lo = [Infinity, Infinity, Infinity];
            const hi = [-Infinity, -Infinity, -Infinity];
            for (let i = 0; i < pos.count; i++) {
                if (Math.round(part.getX(i)) !== 19) continue;
                const v = [pos.getX(i), pos.getY(i), pos.getZ(i)];
                for (let k = 0; k < 3; k++) {
                    lo[k] = Math.min(lo[k], v[k]);
                    hi[k] = Math.max(hi[k], v[k]);
                }
            }
            return Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
        };
        const [a, b] = horns.map(extent).sort((p, q) => p - q);
        // 18 in against 32 in: the larger drum is about 0.36 m bigger across
        expect(b - a).toBeGreaterThan(0.25);
        set.dispose();
    });
});

describe("stepping off on the right foot", () => {
    it("loads the mirrored partner of every clip the show plays", () => {
        expect(clipsToLoad(["8to5", "slideL8to5"], "left")).toEqual([
            "8to5",
            "slideL8to5",
        ]);
        expect(clipsToLoad(["8to5", "slideL8to5"], "right").sort()).toEqual([
            "8to5",
            "slideL8to5",
            "slideR8to5",
        ]);
    });

    it("bakes each row from its mirrored partner", async () => {
        const bodies = await loadedBodies();
        const all = await allClips();
        const clips = {
            "8to5": all.get("8to5")!,
            slideL8to5: all.get("slideL8to5")!,
            slideR8to5: all.get("slideR8to5")!,
        };
        const left = bakeForBodies(bodies, clips, [NO_HOLD], "left");
        const right = bakeForBodies(bodies, clips, [NO_HOLD], "right");
        expect(Object.keys(right.rows).sort()).toEqual(
            Object.keys(left.rows).sort(),
        );
        // a mirrored forward march is not the same bake as the original (the feet swap)
        const row = right.rows["8to5"];
        const a = left.texture.image.data as Float32Array;
        const b = right.texture.image.data as Float32Array;
        let differs = 0;
        const width = left.texture.image.width * 4;
        for (let i = row.row * width; i < (row.row + 1) * width; i++)
            if (Math.abs(a[i] - b[i]) > 1e-6) differs++;
        expect(differs).toBeGreaterThan(0);
    });

    it("refuses a right-foot bake when a mirrored partner is missing", async () => {
        const bodies = await loadedBodies();
        const all = await allClips();
        expect(() =>
            bakeForBodies(
                bodies,
                { slideL8to5: all.get("slideL8to5")! },
                [NO_HOLD],
                "right",
            ),
        ).toThrow(/slideR8to5/);
    });
});

describe("part-filtered index", () => {
    it("draws only the parts a look wears", async () => {
        const geo = await body();
        expect(geo.index!.count / 3).toBe(1796);
        const triangles = (section: string) =>
            visibleIndex(geo, sectionUniform(section, null))!.count / 3;
        // no aussie hat (64), no cape (116), no placeholder instruments (360)
        expect(triangles("Trumpet")).toBe(1256);
        // no instrument at all (360)
        expect(triangles("Flute")).toBe(1256);
        // and no shako (80)
        expect(triangles("Color Guard")).toBe(1176);
    });

    it("keeps whole triangles of visible parts only", async () => {
        const geo = await body();
        const part = geo.getAttribute("_part");
        const index = visibleIndex(geo, sectionUniform("Mellophone", null))!;
        const parts = new Set<number>();
        for (let i = 0; i < index.count; i++)
            parts.add(Math.round(part.getX(index.getX(i))));
        expect([...parts].sort((a, b) => a - b)).toEqual([
            0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
        ]);
    });
});

describe("the clips the bake plays", () => {
    it("puts backward marching and closes on the platform of the foot, and leaves forward marching flat", async () => {
        const bodies = await loadedBodies();
        const skeleton = bodies.values().next().value!.mesh.skeleton;
        const c = fs.readFileSync(
            path.resolve(
                __dirname,
                "../../../assets/om-pose/clips/clips-h100.glb",
            ),
        );
        const gltf = await new GLTFLoader().parseAsync(
            c.buffer.slice(c.byteOffset, c.byteOffset + c.byteLength),
            "",
        );
        const clips = Object.fromEntries(
            gltf.animations
                .filter((a) =>
                    ["8to5", "back8to5", "halt_8to5"].includes(a.name),
                )
                .map((a) => [a.name, a]),
        );
        const rig = platformRig(skeleton);
        const rootY = (clip: THREE.AnimationClip) => {
            const t = clip.tracks.find((x) => x.name === "root.position")!;
            const sampler = (
                t as unknown as { createInterpolant(): THREE.Interpolant }
            ).createInterpolant();
            return sampler.evaluate(clip.duration / 2)[1];
        };
        for (const name of ["back8to5", "halt_8to5"]) {
            const baked = clipForBake(name, clips, "left", rig);
            expect(rootY(baked) - rootY(clips[name])).toBeGreaterThan(0.01);
        }
        expect(clipForBake("8to5", clips, "left", rig)).toBe(clips["8to5"]);
        // a prep row (loaded under its own name from the base clip) rises
        // only around its landing, at loop time 1 of 2: halfway through
        const prep = { ...clips, "8to5~prep1": clips["8to5"] };
        const baked = clipForBake("8to5~prep1", prep, "left", rig);
        const rootAt = (clip: THREE.AnimationClip, u: number) => {
            const t = clip.tracks.find((x) => x.name === "root.position")!;
            const sampler = (
                t as unknown as { createInterpolant(): THREE.Interpolant }
            ).createInterpolant();
            return sampler.evaluate(clip.duration * u)[1];
        };
        expect(rootAt(baked, 0.5) - rootAt(clips["8to5"], 0.5)).toBeGreaterThan(
            0.01,
        );
        expect(
            Math.abs(rootAt(baked, 0.05) - rootAt(clips["8to5"], 0.05)),
        ).toBeLessThan(1e-6);
    });
});

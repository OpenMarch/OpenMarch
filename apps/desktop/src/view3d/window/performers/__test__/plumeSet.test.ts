// @vitest-environment node
// cspell:words skinbase skinnormal
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { blockGeometry } from "@/view3d/render/instanced-marchers.js";
import {
    defaultPerformerBody,
    sectionUniform,
    type BodyType,
} from "@/view3d/core/marchers/looks";
import type { Composer } from "@/view3d/render/composer";
import type { LoadedBody } from "../marchers/marcherAssets";
import { MarcherBodies, bakeForBodies } from "../marchers/marcherBodies";
import {
    PlumeSet,
    keepCanvasOpaque,
    plumeMaterial,
    plumeSocket,
} from "../marchers/plumeSet";

const root = path.resolve(__dirname, "../../../assets/om-pose");

async function loadedBodies() {
    const b = fs.readFileSync(path.join(root, "bodies/neutral-average.glb"));
    const gltf = await new GLTFLoader().parseAsync(
        b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
        "",
    );
    let mesh: THREE.SkinnedMesh | null = null;
    gltf.scene.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh)
            mesh = o as THREE.SkinnedMesh;
    });
    return new Map([
        ["neutral-average", { scene: gltf.scene, mesh: mesh! }],
    ]) as Map<BodyType, LoadedBody>;
}

async function clip8to5() {
    const b = fs.readFileSync(path.join(root, "clips/clips-h100.glb"));
    const gltf = await new GLTFLoader().parseAsync(
        b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
        "",
    );
    return gltf.animations.find((c) => c.name === "8to5")!;
}

const headBone = (skeleton: THREE.Skeleton) =>
    skeleton.bones.findIndex((b) => /spine\.?006$/.test(b.name));

const look = (id: number, section: string) => ({
    body: { ...defaultPerformerBody(id), bodyType: "neutral-average" as const },
    uniform: sectionUniform(section),
});

async function band(
    sections: string[],
    quality: "high" | "low",
): Promise<MarcherBodies> {
    const bodies = await loadedBodies();
    const bake = bakeForBodies(bodies, { "8to5": await clip8to5() });
    return new MarcherBodies(
        bodies,
        bake,
        sections.map((s, i) => look(i + 1, s)),
        quality,
    );
}

const plumesOf = (set: MarcherBodies) =>
    set.group.children.filter((o) =>
        o.name.startsWith("view3d-plumes-"),
    ) as THREE.InstancedMesh[];

describe("plume socket", () => {
    it("stands where the body's own plume did: on the crown, on the head bone", async () => {
        const bodies = await loadedBodies();
        const { mesh } = bodies.get("neutral-average")!;
        const socket = plumeSocket(mesh.geometry)!;
        expect(socket.bone).toBe(headBone(mesh.skeleton));
        // the body's plume starts at 1.905 m, centred left to right
        expect(socket.y).toBeCloseTo(1.91, 2);
        expect(Math.abs(socket.x)).toBeLessThan(0.005);
    });

    it("finds the block body's plume too", async () => {
        const bodies = await loadedBodies();
        const { skeleton } = bodies.get("neutral-average")!.mesh;
        const socket = plumeSocket(blockGeometry(THREE, skeleton))!;
        expect(socket.bone).toBe(headBone(skeleton));
        expect(socket.y).toBeGreaterThan(1.6);
    });

    it("is null for a body with no plume", () => {
        const g = new THREE.BufferGeometry();
        g.setAttribute(
            "position",
            new THREE.Float32BufferAttribute([0, 0, 0], 3),
        );
        g.setAttribute("_part", new THREE.Float32BufferAttribute([1], 1));
        g.setAttribute(
            "skinIndex",
            new THREE.Float32BufferAttribute([0, 0, 0, 0], 4),
        );
        expect(plumeSocket(g)).toBeNull();
    });
});

describe("plumes in the band", () => {
    it("gives every shako one plume in one mesh, in its look's plume color", async () => {
        const set = await band(["Trumpet", "Trumpet", "Drum Major"], "high");
        const plumes = plumesOf(set);
        expect(plumes.length).toBe(1);
        expect(plumes[0].name).toBe("view3d-plumes-high");
        expect(plumes[0].count).toBe(3);
        const color = plumes[0].geometry.getAttribute("aColor");
        const want = new THREE.Color(sectionUniform("Trumpet").colors.plume);
        expect(color.getX(0)).toBeCloseTo(want.r, 5);
        expect(color.getY(0)).toBeCloseTo(want.g, 5);
        expect(color.getZ(0)).toBeCloseTo(want.b, 5);
        set.dispose();
    });

    it("puts each plume on its own wearer's head when some slots wear none", async () => {
        const set = await band(
            ["Color Guard", "Trumpet", "Color Guard", "Tuba"],
            "high",
        );
        const [plumes] = plumesOf(set);
        const slot = plumes.geometry.getAttribute("aSlot");
        expect(plumes.count).toBe(2);
        expect([slot.getX(0), slot.getX(1)]).toEqual([1, 3]);
        set.writeFrame(
            Float32Array.from([0, 0, 5, 6, 0, 0, 7, 8]),
            new Float32Array(4),
            Uint8Array.from([1, 1, 1, 1]),
            0,
        );
        const m = plumes.instanceMatrix.array;
        expect([m[12], m[14]]).toEqual([5, 6]);
        expect([m[28], m[30]]).toEqual([7, 8]);
        set.dispose();
    });

    it("gives no plume to a look without a shako", async () => {
        const set = await band(["Color Guard"], "high");
        expect(plumesOf(set).length).toBe(0);
        set.dispose();
    });

    it("cuts feathers out of cards at high and draws one solid at low", async () => {
        const high = await band(["Trumpet"], "high");
        const low = await band(["Trumpet"], "low");
        const [h] = plumesOf(high);
        const [l] = plumesOf(low);
        const hm = h.material as THREE.MeshStandardMaterial;
        const lm = l.material as THREE.MeshStandardMaterial;
        expect(hm.alphaToCoverage).toBe(true);
        expect(hm.side).toBe(THREE.DoubleSide);
        expect(lm.alphaTest).toBe(0);
        expect(lm.side).toBe(THREE.FrontSide);
        expect(h.geometry.attributes.position.count / 3).toBe(298);
        expect(l.geometry.attributes.position.count / 3).toBe(72);
        // the block body leaves its own plume box out too
        const block = low.group.children.find((o) =>
            o.name.startsWith("view3d-marchers-"),
        ) as THREE.InstancedMesh;
        const part = block.geometry.getAttribute("_part");
        const index = block.geometry.index!;
        for (let i = 0; i < index.count; i++)
            expect(Math.round(part.getX(index.getX(i)))).not.toBe(8);
        high.dispose();
        low.dispose();
    });

    it("scales each plume with its marcher's height class", () => {
        const material = new THREE.MeshStandardMaterial();
        const set = new PlumeSet(
            [{ slot: 0, socket: { x: 0, y: 1.9, z: 0, bone: 14 }, color: 0 }],
            "low",
            material,
        );
        set.writeFrame(
            Float32Array.from([0, 0]),
            new Float32Array(1),
            Uint8Array.from([1]),
            Float32Array.from([1.05]),
        );
        const m = set.mesh.instanceMatrix.array;
        expect(Math.hypot(m[0], m[1], m[2])).toBeCloseTo(1.05, 5);
        set.dispose();
        material.dispose();
    });

    it("hides the plume of a marcher who isn't placed", () => {
        const socket = { x: 0, y: 1.9, z: 0, bone: 14 };
        const material = new THREE.MeshStandardMaterial();
        const set = new PlumeSet(
            [
                { slot: 0, socket, color: 0xffffff },
                { slot: 1, socket, color: 0xffffff },
            ],
            "low",
            material,
        );
        set.writeFrame(
            Float32Array.from([1, 2, 3, 4]),
            new Float32Array(2),
            Uint8Array.from([1, 0]),
            Float32Array.from([1, 1]),
        );
        const m = set.mesh.instanceMatrix.array;
        // the placed one at (1, 2), the other collapsed to nothing
        expect(m[12]).toBe(1);
        expect(m[14]).toBe(2);
        expect(Array.from(m.slice(16, 28)).every((v) => v === 0)).toBe(true);
        set.dispose();
        material.dispose();
    });
});

describe("an opaque canvas", () => {
    it("draws the feathers without writing alpha, then turns alpha back on", () => {
        const calls: boolean[][] = [];
        const renderer = {
            getContext: () => ({
                colorMask: (...m: boolean[]) => calls.push(m),
            }),
        } as unknown as THREE.WebGLRenderer;
        const mesh = new THREE.Mesh();
        keepCanvasOpaque(mesh);
        const args = [
            renderer,
            new THREE.Scene(),
            new THREE.PerspectiveCamera(),
            mesh.geometry,
            mesh.material as THREE.Material,
            null,
        ] as const;
        mesh.onBeforeRender(...args);
        mesh.onAfterRender(...args);
        expect(calls).toEqual([
            [true, true, true, false],
            [true, true, true, true],
        ]);
    });

    it("is only needed for the feather cards", async () => {
        const high = await band(["Trumpet"], "high");
        const low = await band(["Trumpet"], "low");
        const noop = new THREE.Object3D().onBeforeRender;
        expect(plumesOf(high)[0].onBeforeRender).not.toBe(noop);
        expect(plumesOf(low)[0].onBeforeRender).toBe(noop);
        high.dispose();
        low.dispose();
    });
});

describe("plume material", () => {
    it("patches the standard shader: skinned on the head bone, feathers cut out", () => {
        const composer = { uniform: { value: null } } as unknown as Composer;
        for (const tier of ["high", "low"] as const) {
            const m = plumeMaterial(composer, tier);
            const shader = {
                uniforms: {} as Record<string, unknown>,
                vertexShader: THREE.ShaderLib.physical.vertexShader,
                fragmentShader: THREE.ShaderLib.physical.fragmentShader,
            };
            m.onBeforeCompile(
                shader as unknown as THREE.WebGLProgramParametersWithUniforms,
                undefined as unknown as THREE.WebGLRenderer,
            );
            expect(shader.uniforms.uComposed).toBe(composer.uniform);
            for (const chunk of [
                "skinbase_vertex",
                "skinnormal_vertex",
                "skinning_vertex",
            ])
                expect(shader.vertexShader).not.toContain(
                    `#include <${chunk}>`,
                );
            expect(shader.vertexShader).toContain(
                "composedBone(int(aSlot + 0.5), int(aSocket.w + 0.5))",
            );
            expect(shader.fragmentShader).toContain(
                "featherDistance(vCardUv, vSeed)",
            );
            expect(shader.fragmentShader).toContain(
                "normal = normalize(vNormal);",
            );
            // every patch landed: a chunk three renamed would leave its
            // replace doing nothing, and the plume black or unlit
            for (const injected of [
                "vPlumeColor = aColor * aShade;",
                "transformed = (bakeSkin * vec4(transformed + aSocket.xyz, 1.0)).xyz;",
                "objectNormal = (bakeSkin * vec4(objectNormal, 0.0)).xyz;",
            ])
                expect(shader.vertexShader).toContain(injected);
            for (const injected of [
                "diffuseColor.a = mix(diffuseColor.a, featherAlpha, onCard);",
                "reflectedLight.directDiffuse *= 1.0 + glow;",
            ])
                expect(shader.fragmentShader).toContain(injected);
            expect(m.customProgramCacheKey()).toBe(`view3d-plume-${tier}`);
            m.dispose();
        }
    });
});

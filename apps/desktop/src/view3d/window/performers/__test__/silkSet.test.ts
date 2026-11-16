import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
    defaultPerformerBody,
    sectionUniform,
} from "@/view3d/core/marchers/looks";
import { buildCountClock } from "@/view3d/core/marchers/countClock";
import type { MarcherPlan } from "@/view3d/core/marchers/planner";
import { SILK_GRID, silkPoint } from "@/view3d/core/instruments/silkWave";
import type { Composer } from "@/view3d/render/composer";
import {
    SILK_PATTERN_IDS,
    SILK_PATTERN_SIZE,
    SilkSet,
    silkGrid,
    silkMaterial,
    silkPatternTexture,
} from "../marchers/silkSet";
import { UNIFORM_PRESETS } from "@/view3d/core/marchers/uniformPresets";
import { guardCarry } from "@/view3d/core/instruments/catalog";
import { SilkMotion } from "../marchers/silkMotion";
import type { ShowPlans } from "../marchers/marcherMotion";
import type { MarcherSlotLook } from "../marchers/marcherBodies";

const root = path.resolve(__dirname, "../../../assets/om-pose");
async function skeleton() {
    const b = fs.readFileSync(path.join(root, "bodies/neutral-average.glb"));
    // a buffer from this realm: jsdom's ArrayBuffer isn't Node's
    const ab = new ArrayBuffer(b.byteLength);
    new Uint8Array(ab).set(b);
    const body = await new GLTFLoader().parseAsync(ab, "");
    let mesh: THREE.SkinnedMesh | null = null;
    body.scene.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh)
            mesh = o as THREE.SkinnedMesh;
    });
    return mesh!.skeleton;
}

const look = (
    id: number,
    section: string,
    guard?: "swingFlag" | "doubleSwingFlag",
): MarcherSlotLook => ({
    body: defaultPerformerBody(id),
    uniform: sectionUniform(section, "up", undefined, undefined, guard),
    silkColor: 0xcc2233,
});

/** n slots in a line along +x, all placed, scale 1. */
function frame(n: number, spacing = 2) {
    const xz = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) xz[i * 2] = i * spacing;
    return {
        xz,
        heading: new Float32Array(n),
        placed: new Uint8Array(n).fill(1),
        scale: new Float32Array(n).fill(1),
    };
}

/**
 * A show of K counts at 120 bpm where slot i stands 4 counts, marches
 * along +z at a pace of its own, wheels its heading, then stands.
 */
function show(n: number, K = 48) {
    const beats = Array.from({ length: K }, (_, k) => ({
        id: k + 1,
        timestamp: k * 0.5,
        duration: 0.5,
    }));
    const clock = buildCountClock(beats);
    const positions: Float64Array[] = [];
    const plans: MarcherPlan[] = [];
    for (let i = 0; i < n; i++) {
        const p = new Float64Array((K + 1) * 2);
        const h = new Float64Array(K + 1);
        let z = 0;
        for (let k = 0; k <= K; k++) {
            if (k > 4 && k <= 36) z += 0.3 + 0.02 * i;
            p[k * 2] = i * 2;
            p[k * 2 + 1] = z;
            h[k] = k < 20 ? 0 : Math.min(k - 20, 8) * (Math.PI / 16);
        }
        positions.push(p);
        plans.push({ events: [], counts: K, headings: h });
    }
    const showPlans = {
        plans,
        planMs: 0,
        replanned: n,
        inputs: {
            positions,
            heightClasses: [],
            bpm: clock.bpm,
            ids: [],
            cues: null,
        },
    } as unknown as ShowPlans;
    return { clock, showPlans };
}

/** Everything a tier's mesh hands the GPU, copied. */
function snapshot(set: SilkSet) {
    return set.meshes.map((m) => ({
        count: m.count,
        matrices: Array.from(m.instanceMatrix.array),
        attributes: Object.fromEntries(
            Object.entries(m.geometry.attributes)
                .filter(
                    ([, a]) =>
                        (a as THREE.InstancedBufferAttribute)
                            .isInstancedBufferAttribute,
                )
                .map(([k, a]) => [k, Array.from(a.array as Float32Array)]),
        ),
    }));
}

/**
 * The silks' vertices in their bones' bind pose, from what the shader
 * reads: the wave (`silkPoint`) at each grid point, then the silk frame.
 */
function vertices(set: SilkSet) {
    const out: number[] = [];
    const p = [0, 0, 0];
    for (const m of set.meshes) {
        const g = m.geometry;
        const pos = g.attributes.position;
        const a = (k: string) => g.attributes[k].array as Float32Array;
        for (let i = 0; i < m.count; i++) {
            const silk = a("aSilk").subarray(i * 4, i * 4 + 4);
            const mo = a("aMotion").subarray(i * 4, i * 4 + 4);
            const rows = [a("aFrame0"), a("aFrame1"), a("aFrame2")].map((r) =>
                r.subarray(i * 4, i * 4 + 4),
            );
            for (let v = 0; v < pos.count; v++) {
                silkPoint(
                    pos.getX(v),
                    pos.getY(v),
                    {
                        fly: silk[0],
                        header: silk[1],
                        mirror: silk[2],
                        wavePhase: mo[0],
                        bellyPhase: mo[1],
                        speed: mo[2],
                        turn: mo[3],
                    },
                    p,
                );
                for (const r of rows)
                    out.push(r[0] * p[0] + r[1] * p[1] + r[2] * p[2] + r[3]);
            }
        }
    }
    return out;
}

describe("silkGrid", () => {
    it.each([
        ["high", 24, 16],
        ["low", 12, 8],
    ] as const)("grids a %s silk %i × %i with UVs", (detail, fly, header) => {
        const { fly: f, header: h } = SILK_GRID[detail];
        expect([f, h]).toEqual([fly, header]);
        const g = silkGrid(f, h);
        expect(g.attributes.position.count).toBe((fly + 1) * (header + 1));
        expect(g.attributes.uv.count).toBe((fly + 1) * (header + 1));
        expect(g.index!.count / 3).toBe(2 * fly * header);
    });

    it("winds each triangle toward ∂u × ∂v (+Z on the flat grid)", () => {
        const g = silkGrid(3, 2);
        const p = g.attributes.position;
        const idx = g.index!;
        for (let t = 0; t < idx.count; t += 3) {
            const [a, b, c] = [0, 1, 2].map((k) =>
                new THREE.Vector3().fromBufferAttribute(p, idx.getX(t + k)),
            );
            const n = b.clone().sub(a).cross(c.clone().sub(a));
            expect(n.z).toBeGreaterThan(0);
        }
    });
});

describe("silkMaterial", () => {
    it("is cloth: not metal, double-sided", () => {
        const m = silkMaterial({
            uniform: { value: null },
        } as unknown as Composer);
        expect(m.metalness).toBe(0);
        expect(m.side).toBe(THREE.DoubleSide);
        const shader = {
            uniforms: {} as Record<string, unknown>,
            vertexShader: THREE.ShaderLib.standard.vertexShader,
            fragmentShader: THREE.ShaderLib.standard.fragmentShader,
        };
        m.onBeforeCompile(
            shader as unknown as THREE.WebGLProgramParametersWithUniforms,
            {} as THREE.WebGLRenderer,
        );
        // the wave and the silk frame go in before skinning
        const vs = shader.vertexShader;
        expect(vs.indexOf("silkPoint(position.x")).toBeLessThan(
            vs.indexOf("transformed = (bakeSkin * (silkFrame"),
        );
        expect(vs).not.toContain("#include <skinning_vertex>");
        expect(shader.uniforms.uComposed).toBeDefined();
        // a patterned silk samples its preset's band of the pattern texture
        expect(
            (shader.uniforms.uSilkPatterns as { value: unknown }).value,
        ).toBe(silkPatternTexture());
        expect(shader.fragmentShader).toContain("silkPatternColor(vSilkUv");
    });
});

describe("silkPatternTexture", () => {
    it("holds each preset's pattern in its own band, pole to fly and bottom to top", () => {
        const texture = silkPatternTexture();
        const { u: w, v: h } = SILK_PATTERN_SIZE;
        expect(SILK_PATTERN_IDS).toContain("sash");
        expect(texture.image.width).toBe(w);
        expect(texture.image.height).toBe(h * SILK_PATTERN_IDS.length);
        expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
        const data = texture.image.data as Uint8Array;
        SILK_PATTERN_IDS.forEach((id, k) => {
            const silk = UNIFORM_PRESETS[id].silk!;
            for (const [i, j] of [
                [0, 0],
                [w - 1, 0],
                [0, h - 1],
                [w - 1, h - 1],
                [w >> 1, h >> 2],
            ]) {
                const c = silk((i + 0.5) / w, (j + 0.5) / h);
                const o = ((k * h + j) * w + i) * 4;
                expect([...data.subarray(o, o + 3)]).toEqual([
                    (c >> 16) & 255,
                    (c >> 8) & 255,
                    c & 255,
                ]);
            }
        });
    });
});

describe("SilkSet", () => {
    it("draws 40 silks in one call per tier, and casts no shadows", async () => {
        const sk = await skeleton();
        const looks = [
            ...Array.from({ length: 30 }, (_, i) => look(i, "Color Guard")),
            ...Array.from({ length: 5 }, (_, i) =>
                look(30 + i, "Color Guard", "doubleSwingFlag"),
            ),
            look(40, "Trumpet"),
        ];
        const material = new THREE.MeshStandardMaterial();
        for (const [quality, tiers] of [
            ["high", 2],
            ["low", 1],
        ] as const) {
            const set = new SilkSet(sk, looks, quality, material);
            expect(set.count).toBe(40);
            expect(set.drawCalls).toBe(tiers);
            expect(set.slots).toHaveLength(35);
            for (const m of set.meshes) {
                expect(m.castShadow).toBe(false);
                expect(m.material).toBe(material);
            }
            const f = frame(looks.length);
            set.writeFrame(f.xz, f.heading, f.placed, f.scale, null);
            // every silk drawn, at full detail with no camera
            expect(set.meshes[0].count).toBe(40);
            set.dispose();
        }
    });

    it("draws a slot's silk only while it holds the flag (Equipment cues)", async () => {
        const sk = await skeleton();
        const withCarry = (
            section: string,
            carry: ReturnType<typeof guardCarry> | null,
        ) =>
            sectionUniform(
                section,
                "up",
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                { carry },
            );
        const guard = look(1, "Color Guard");
        const trumpet = look(2, "Trumpet");
        const set = new SilkSet(
            sk,
            [
                // a guard who swaps the flag for a rifle
                {
                    ...guard,
                    held: [
                        guard.uniform,
                        withCarry("Color Guard", guardCarry("rifle")),
                    ],
                },
                // a trumpet who's given a flag
                {
                    ...trumpet,
                    held: [
                        trumpet.uniform,
                        withCarry("Trumpet", guardCarry("flag6")),
                    ],
                },
            ],
            "low",
            new THREE.MeshStandardMaterial(),
        );
        expect(set.count).toBe(2);
        expect(set.slots).toEqual([0, 1]);
        const f = frame(2);
        const drawn = (held: number[]) => {
            set.writeFrame(
                f.xz,
                f.heading,
                f.placed,
                f.scale,
                null,
                null,
                Uint8Array.from(held),
            );
            const slots = set.meshes[0].geometry.attributes.aSlot.array;
            return Array.from(slots.subarray(0, set.meshes[0].count));
        };
        expect(drawn([0, 0])).toEqual([0]);
        expect(drawn([1, 1])).toEqual([1]);
        expect(drawn([0, 1])).toEqual([0, 1]);
        set.dispose();
    });

    it("rides the prop bone, and the left hand for a double swing's second silk", async () => {
        const sk = await skeleton();
        const set = new SilkSet(
            sk,
            [look(1, "Color Guard", "doubleSwingFlag")],
            "low",
            new THREE.MeshStandardMaterial(),
        );
        const f = frame(1);
        set.writeFrame(f.xz, f.heading, f.placed, f.scale, null);
        const silk = set.meshes[0].geometry.attributes.aSilk.array;
        const handL = sk.bones.findIndex((b) => b.name === "DEF-handL");
        expect([silk[2], silk[3]]).toEqual([1, sk.bones.length]);
        expect([silk[6], silk[7]]).toEqual([-1, handL]);
        set.dispose();
    });

    it("paints a silk with its preset's pattern unless a fill or a Silk cue makes it plain", async () => {
        const sk = await skeleton();
        const guard = (fill?: number): MarcherSlotLook => ({
            body: defaultPerformerBody(1),
            uniform: sectionUniform("Color Guard", "up", undefined, fill),
        });
        const read = (l: MarcherSlotLook) => {
            const set = new SilkSet(
                sk,
                [l],
                "low",
                new THREE.MeshStandardMaterial(),
            );
            const f = frame(1);
            set.writeFrame(f.xz, f.heading, f.placed, f.scale, null);
            const g = set.meshes[0].geometry.attributes;
            const out = {
                pattern: g.aPattern.array[0],
                color: [...g.aColor.array.slice(0, 3)],
            };
            set.dispose();
            return out;
        };
        const linear = (hex: number) => {
            const c = new THREE.Color(hex);
            return [c.r, c.g, c.b].map((x) => expect.closeTo(x, 5));
        };
        // Royal Sash, the guard default, paints its diagonal
        expect(read(guard()).pattern).toBe(SILK_PATTERN_IDS.indexOf("sash"));
        // a section with its own 2D fill gets a plain silk in that fill
        const filled = read(guard(0x22aa44));
        expect(filled.pattern).toBe(-1);
        expect(filled.color).toEqual(linear(0x22aa44));
        // a Silk cue's color is plain too
        const cued = read({ ...guard(), silkColor: 0xcc2233 });
        expect(cued.pattern).toBe(-1);
        expect(cued.color).toEqual(linear(0xcc2233));
    });

    it("splits near and far silks by distance from the camera", async () => {
        const sk = await skeleton();
        const looks = Array.from({ length: 4 }, (_, i) =>
            look(i, "Color Guard"),
        );
        const set = new SilkSet(
            sk,
            looks,
            "high",
            new THREE.MeshStandardMaterial(),
        );
        const f = frame(4, 20); // at x = 0, 20, 40, 60
        set.writeFrame(f.xz, f.heading, f.placed, f.scale, [0, 1.4, 0]);
        expect(set.meshes.map((m) => m.count)).toEqual([2, 2]);
        set.dispose();
    });

    it("draws the same silks at a count however the clock got there", async () => {
        const sk = await skeleton();
        const n = 12;
        const looks = Array.from({ length: n }, (_, i) =>
            look(i, "Color Guard", i % 3 === 0 ? "doubleSwingFlag" : undefined),
        );
        const set = new SilkSet(
            sk,
            looks,
            "high",
            new THREE.MeshStandardMaterial(),
        );
        const { clock, showPlans } = show(n);
        const motion = new SilkMotion(showPlans, clock, set.slots);
        const f = frame(n);
        const camera: [number, number, number] = [5, 3, -10];
        const at = (count: number) => {
            set.writeMotion(motion.update(count));
            set.writeFrame(f.xz, f.heading, f.placed, f.scale, camera);
            return { snap: snapshot(set), vertices: vertices(set) };
        };
        const first = at(12.37);
        // play on, scrub back past it, jump ahead, then return
        for (let c = 12.4; c < 30; c += 0.7) at(c);
        at(2);
        at(44.1);
        const again = at(12.37);
        expect(again.snap).toEqual(first.snap);
        expect(again.vertices).toEqual(first.vertices);
        // and the silks did move in between: not a frozen frame
        expect(at(30.5).vertices).not.toEqual(first.vertices);
        set.dispose();
    });

    it("hangs at rest and lifts on the move", async () => {
        const sk = await skeleton();
        const set = new SilkSet(
            sk,
            [look(1, "Color Guard")],
            "low",
            new THREE.MeshStandardMaterial(),
        );
        const { clock, showPlans } = show(1);
        const motion = new SilkMotion(showPlans, clock, set.slots);
        const f = frame(1);
        set.writeMotion(motion.update(1)); // standing
        set.writeFrame(f.xz, f.heading, f.placed, f.scale, null);
        const aMotion = set.meshes[0].geometry.attributes.aMotion.array;
        expect(aMotion[2]).toBe(0);
        set.writeMotion(motion.update(10)); // marching 0.3 m a count
        set.writeFrame(f.xz, f.heading, f.placed, f.scale, null);
        expect(aMotion[2]).toBeCloseTo(0.6, 5);
        set.writeMotion(motion.update(23)); // wheeling
        set.writeFrame(f.xz, f.heading, f.placed, f.scale, null);
        expect(aMotion[3]).toBeCloseTo(Math.PI / 16 / 0.5, 4);
        set.dispose();
    });
});

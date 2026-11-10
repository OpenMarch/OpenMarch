import { beforeAll, describe, expect, it, vi } from "vitest";
import {
    Color,
    InstancedMesh,
    Mesh,
    Object3D,
    SpotLight,
    Vector3,
    type BufferGeometry,
    type MeshStandardMaterial,
} from "three";
import type { LightingPreset, SeatRow } from "../../types";
import {
    buildCrowd,
    createEnvironment,
    crowdBlockGeometry,
    createSharedMaterials,
    defaultCrowdPalette,
    FT,
    landGeometry,
    LIGHTING_PRESET_IDS,
    lightingValues,
    lightPole,
    PERSON_SPACING,
    setTexturePainting,
    videoBoard,
} from "..";

beforeAll(() => setTexturePainting(false));

const triangles = (g: BufferGeometry) =>
    (g.index ? g.index.count : g.getAttribute("position").count) / 3;

/** A straight stand: `rows` rows of `length` meters along X, rising in Y and Z. */
function straightRows(
    rows: number,
    length: number,
    side: SeatRow["side"] = "home",
): SeatRow[] {
    return Array.from({ length: rows }, (_, i) => ({
        points: [
            [-length / 2, 1 + i * 0.3, 10 + i * 0.8],
            [length / 2, 1 + i * 0.3, 10 + i * 0.8],
        ],
        closed: false,
        depth: 0.8,
        side,
    }));
}

describe("lighting presets", () => {
    it("ports the demo's SKY table in meters", () => {
        const day = lightingValues("day");
        expect(day.skyTop).toBe(0x2f6fc9);
        expect(day.skyBottom).toBe(0xcfe0ef);
        expect(day.hemisphere).toEqual({
            sky: 0xcfe3ff,
            ground: 0x4a5d33,
            intensity: 1.1,
        });
        expect(day.sun.intensity).toBe(2.3);
        expect(day.sun.offset[0]).toBeCloseTo(300 * FT);
        expect(day.sun.offset[1]).toBeCloseTo(520 * FT);
        expect(day.sun.offset[2]).toBeCloseTo(260 * FT);
        expect(day.kit.lampsOn).toBe(false);

        const dusk = lightingValues("dusk");
        expect(dusk.exposure).toBe(1.05);
        expect(dusk.kit.lampScale).toBe(0.6);
        const night = lightingValues("night");
        expect(night.exposure).toBe(1.15);
        // A faint moon, not the sun: no shadow map.
        expect(night.sun.intensity).toBeGreaterThan(0);
        expect(night.sun.castShadow).toBe(false);
        expect(night.kit.lampsOn).toBe(true);
    });

    it("ports the roof closed and gym presets", () => {
        const closed = lightingValues("roofClosed");
        expect(closed.sun.intensity).toBe(0);
        expect(closed.hemisphere.sky).toBe(0xfff1e0);
        expect(closed.kit.roofOpen).toBe(false);
        expect(closed.kit.barEmissive).toBe(2);
        const house = lightingValues("house");
        const show = lightingValues("show");
        expect(house.skyVisible).toBe(false);
        expect(house.kit.panelEmissive).toBe(1.4);
        expect(house.kit.showSpotIntensity).toBe(0);
        expect(show.hemisphere.intensity).toBe(0.12);
        expect(show.exposure).toBe(1.2);
        expect(show.kit.showSpotIntensity).toBe(2.4);
        expect(show.kit.overheadIntensity).toBe(0.1);
    });

    it("has finite values for every preset", () => {
        for (const id of LIGHTING_PRESET_IDS) {
            const v = lightingValues(id);
            const nums = [
                v.exposure,
                v.hemisphere.intensity,
                v.sun.intensity,
                ...v.sun.offset,
            ];
            nums.forEach((n) => expect(Number.isFinite(n)).toBe(true));
        }
        expect(LIGHTING_PRESET_IDS.sort()).toEqual(
            ["day", "dusk", "house", "night", "roofClosed", "show"].sort(),
        );
    });
});

describe("createEnvironment", () => {
    it("applies a preset to the rig", () => {
        const env = createEnvironment({ focus: [0, 0, -24] });
        const v = env.setLighting("dusk");
        expect(env.hemisphere.intensity).toBe(v.hemisphere.intensity);
        expect(env.sun.color.getHex()).toBe(0xffa860);
        expect(env.sun.castShadow).toBe(true);
        expect(env.fog.color.getHex()).toBe(v.fog);
        expect(env.fog.near).toBe(v.fogNear);
        expect(env.exposure).toBe(1.05);
        expect(env.sun.position.z).toBeCloseTo(-24 + -60 * FT);
        expect(env.sun.target.position.z).toBe(-24);
        env.dispose();
    });

    it("leaves a faint moon at night, and no sun or shadows indoors", () => {
        const env = createEnvironment();
        env.setLighting("night");
        // The moon gives walls a lit side; it isn't worth a shadow map.
        expect(env.sun.castShadow).toBe(false);
        expect(env.sun.visible).toBe(true);
        expect(env.sun.intensity).toBeLessThan(1);
        env.setLighting("house");
        expect(env.sky.mesh.visible).toBe(false);
        expect(env.sun.visible).toBe(false);
        env.setLighting("day");
        expect(env.sky.mesh.visible).toBe(true);
        expect(env.sun.castShadow).toBe(true);
        expect(env.sun.visible).toBe(true);
        env.dispose();
    });

    it("never casts shadows at low quality", () => {
        const env = createEnvironment({ quality: "low" });
        env.setLighting("day");
        expect(env.sun.castShadow).toBe(false);
        env.dispose();
    });

    it("disposes the sky, horizon and land", () => {
        const env = createEnvironment();
        const spies = [
            vi.spyOn(env.sky.mesh.geometry, "dispose"),
            vi.spyOn(env.horizon!.mesh.geometry, "dispose"),
            vi.spyOn(env.land!.mesh.geometry, "dispose"),
        ];
        env.dispose();
        for (const spy of spies) expect(spy).toHaveBeenCalled();
    });

    it("builds no horizon or land at low quality, to add no draw calls", () => {
        const env = createEnvironment({ quality: "low" });
        expect(env.horizon).toBeNull();
        expect(env.land).toBeNull();
        env.dispose();
    });

    it("shows the horizon and land only with the sky", () => {
        const env = createEnvironment();
        env.setLighting("house");
        expect(env.horizon!.mesh.visible).toBe(false);
        expect(env.land!.mesh.visible).toBe(false);
        env.setLighting("night");
        expect(env.horizon!.mesh.visible).toBe(true);
        expect(env.land!.mesh.visible).toBe(true);
        env.dispose();
    });

    it("faces the land upward", () => {
        const g = landGeometry(8);
        const pos = g.getAttribute("position");
        const index = g.getIndex()!;
        // Skips the first ring's zero-area triangles at the center.
        for (let t = 0; t < index.count; t += 3) {
            const a = new Vector3().fromBufferAttribute(pos, index.getX(t));
            const b = new Vector3().fromBufferAttribute(pos, index.getX(t + 1));
            const c = new Vector3().fromBufferAttribute(pos, index.getX(t + 2));
            const n = b.sub(a).cross(c.sub(a));
            if (n.lengthSq() > 1e-6) expect(n.y).toBeGreaterThan(0);
        }
        g.dispose();
    });

    it("keeps the land between the kits' ground plane and their paint", () => {
        const env = createEnvironment();
        const y = env.land!.mesh.position.y;
        expect(y).toBeGreaterThan(-0.3 * FT);
        expect(y).toBeLessThan(-0.3 * FT + 0.02);
        env.dispose();
    });
});

describe("lightPole", () => {
    it("toggles its spot and lamp", () => {
        const shared = createSharedMaterials();
        const pole = lightPole(27, [0, 0, 30], shared);
        const spot = pole.object.children.find(
            (c): c is SpotLight => c instanceof SpotLight,
        )!;
        expect(spot.intensity).toBe(0);
        expect(spot.visible).toBe(false);
        pole.setOn(true, 0.5);
        expect(spot.intensity).toBeCloseTo(0.8);
        expect(spot.visible).toBe(true);
        expect(spot.position.y).toBeCloseTo(27 + 4 * FT);
        pole.setOn(false);
        expect(spot.intensity).toBe(0);
        expect(spot.visible).toBe(false);
        pole.dispose();
        shared.dispose();
    });
});

describe("videoBoard", () => {
    it("builds frame, screen and legs", () => {
        const shared = createSharedMaterials();
        const withLegs = videoBoard(29, 16, 10, shared);
        expect(withLegs.object.children).toHaveLength(4);
        const noLegs = videoBoard(33.5, 17.7, 0, shared);
        expect(noLegs.object.children).toHaveLength(2);
        const meshes: Mesh[] = [];
        withLegs.object.traverse((o) => {
            if (o instanceof Mesh) meshes.push(o);
        });
        expect(meshes).toHaveLength(4);
        withLegs.dispose();
        noLegs.dispose();
        shared.dispose();
    });
});

describe("buildCrowd", () => {
    it("is a single InstancedMesh with a sane count", () => {
        const rows = straightRows(10, 60);
        const crowd = buildCrowd(rows, { density: 1 });
        expect(crowd.mesh).toBeInstanceOf(InstancedMesh);
        expect(crowd.mesh.count).toBe(crowd.count);
        // 60 m / 0.64 m is about 94 slots per row, minus aisles.
        const perRow = Math.floor(60 / PERSON_SPACING) + 1;
        expect(crowd.count).toBeLessThan(10 * perRow);
        expect(crowd.count).toBeGreaterThan(10 * perRow * 0.8);
        crowd.dispose();
    });

    it("leaves aisles", () => {
        const rows = straightRows(1, 40);
        const full = buildCrowd(rows, { density: 1, aisleEvery: 1e9 });
        const aisled = buildCrowd(rows, { density: 1, aisleEvery: 18 });
        expect(aisled.count).toBeLessThan(full.count);
        full.dispose();
        aisled.dispose();
    });

    it("scales with density and halves at low quality", () => {
        const rows = straightRows(20, 80);
        const high = buildCrowd(rows, { density: 0.8 });
        const low = buildCrowd(rows, { density: 0.8, quality: "low" });
        const none = buildCrowd(rows, { density: 0 });
        expect(low.count).toBeLessThan(high.count * 0.65);
        expect(low.count).toBeGreaterThan(high.count * 0.35);
        expect(none.count).toBe(0);
        [high, low, none].forEach((c) => c.dispose());
    });

    it("is deterministic and finite", () => {
        const rows = straightRows(5, 30);
        const a = buildCrowd(rows);
        const b = buildCrowd(rows);
        expect(Array.from(a.mesh.instanceMatrix.array)).toEqual(
            Array.from(b.mesh.instanceMatrix.array),
        );
        for (const n of a.mesh.instanceMatrix.array) {
            expect(Number.isFinite(n)).toBe(true);
        }
        a.dispose();
        b.dispose();
    });

    it("handles closed rows and empty input", () => {
        const ring: SeatRow = {
            points: [
                [-10, 1, -10],
                [10, 1, -10],
                [10, 1, 10],
                [-10, 1, 10],
            ],
            closed: true,
            depth: 0.8,
            side: "neutral",
        };
        const closed = buildCrowd([ring], { density: 1 });
        const open = buildCrowd([{ ...ring, closed: false }], { density: 1 });
        expect(closed.count).toBeGreaterThan(open.count);
        const empty = buildCrowd([]);
        expect(empty.count).toBe(0);
        expect(empty.clearAround([0, 0, 0], 5)).toBe(0);
        [closed, open, empty].forEach((c) => c.dispose());
    });

    it("uses the palette for the row's side", () => {
        const palette = { home: [0xff0000], away: [0x00ff00], neutral: [0] };
        const crowd = buildCrowd(straightRows(2, 10, "away"), {
            density: 1,
            palette,
        });
        const c = crowd.mesh.instanceColor!;
        expect(c.getX(0)).toBeCloseTo(0);
        expect(c.getY(0)).toBeCloseTo(1);
        crowd.dispose();
    });

    it("builds a palette from venue params", () => {
        const p = defaultCrowdPalette({
            homeColor: "#112233",
            awayColor: "bad",
        });
        expect(p.home[0]).toBe(0x112233);
        expect(p.away[0]).toBe(0xc23b3b);
    });

    it("clearAround hides people in range and the latest call wins", () => {
        const crowd = buildCrowd(straightRows(10, 60), { density: 1 });
        const total = crowd.count;
        const center: [number, number, number] = [0, 2, 14];
        const hidden = crowd.clearAround(center, 5);
        expect(hidden).toBeGreaterThan(0);
        expect(crowd.visibleCount()).toBe(total - hidden);

        const arr = crowd.mesh.instanceMatrix.array;
        let zeroed = 0;
        for (let k = 0; k < total; k++) {
            if (arr[k * 16] === 0 && arr[k * 16 + 5] === 0) zeroed++;
        }
        expect(zeroed).toBe(hidden);

        // Moving the point restores the earlier area.
        crowd.clearAround([25, 2, 14], 3);
        const hiddenAgain = total - crowd.visibleCount();
        let zeroedAgain = 0;
        for (let k = 0; k < total; k++) {
            if (arr[k * 16] === 0 && arr[k * 16 + 5] === 0) zeroedAgain++;
        }
        expect(zeroedAgain).toBe(hiddenAgain);

        crowd.reset();
        expect(crowd.visibleCount()).toBe(total);
        expect(crowd.clearAround([1000, 0, 0], 5)).toBe(0);
        crowd.dispose();
    });

    it("faces down the rake, wherever the rows run", () => {
        // Rows rising toward +Z face -Z whichever way they were drawn.
        const forward = straightRows(4, 20);
        const backward = forward.map((r) => ({
            ...r,
            points: [...r.points].reverse(),
        }));
        for (const rows of [forward, backward]) {
            const crowd = buildCrowd(rows, { density: 1 });
            const arr = crowd.mesh.instanceMatrix.array;
            for (let k = 0; k < crowd.count; k++) {
                // The figure's +Z axis, in the matrix's third column.
                expect(arr[k * 16 + 10]).toBeLessThan(0);
            }
            crowd.dispose();
        }
    });

    it("draws everyone in one mesh, with no tiers beneath it", () => {
        for (const quality of ["high", "low"] as const) {
            const crowd = buildCrowd(straightRows(4, 20), {
                density: 1,
                quality,
            });
            expect(crowd.mesh.children).toHaveLength(0);
            crowd.dispose();
        }
    });

    it("does no per-frame work of its own", () => {
        const crowd = buildCrowd(straightRows(4, 20), { density: 1 });
        expect(crowd.mesh.onBeforeRender).toBe(
            Object3D.prototype.onBeforeRender,
        );
        crowd.dispose();
    });

    it("averages the crowd's clothes for the far drift", () => {
        const palette = { home: [0xff0000], away: [0], neutral: [0] };
        const crowd = buildCrowd(straightRows(2, 10), { density: 1, palette });
        const material = crowd.mesh.material as MeshStandardMaterial;
        const shader = {
            uniforms: {},
            vertexShader: "",
            fragmentShader: "",
        } as unknown as Parameters<typeof material.onBeforeCompile>[0];
        material.onBeforeCompile(shader, undefined as never);
        const mean = shader.uniforms.uCrowdMean.value as Color;
        expect(mean.r).toBeCloseTo(1, 5);
        expect(mean.g).toBeCloseTo(0, 5);
        crowd.dispose();
    });

    it("keeps its block within the triangle budget", () => {
        expect(triangles(crowdBlockGeometry())).toBeLessThanOrEqual(12);
    });

    it("clearAround keeps the matrix finite", () => {
        const crowd = buildCrowd(straightRows(4, 20), { density: 1 });
        crowd.clearAround([0, 1, 10], 100);
        expect(crowd.visibleCount()).toBe(0);
        for (const n of crowd.mesh.instanceMatrix.array) {
            expect(Number.isFinite(n)).toBe(true);
        }
        crowd.dispose();
    });

    it("disposes its geometry and material", () => {
        const crowd = buildCrowd(straightRows(2, 10));
        const geo = vi.spyOn(crowd.mesh.geometry, "dispose");
        const mat = vi.spyOn(
            crowd.mesh.material as { dispose(): void },
            "dispose",
        );
        crowd.dispose();
        expect(geo).toHaveBeenCalled();
        expect(mat).toHaveBeenCalled();
    });
});

describe("createSharedMaterials", () => {
    it("disposes everything it created", () => {
        const shared = createSharedMaterials();
        const extra = shared.std(0x123456);
        const spies = [shared.concrete, shared.glass, extra].map((m) =>
            vi.spyOn(m, "dispose"),
        );
        const geo = vi.spyOn(shared.unitBox, "dispose");
        shared.dispose();
        spies.forEach((s) => expect(s).toHaveBeenCalled());
        expect(geo).toHaveBeenCalled();
    });
});

describe("presets cover the contract", () => {
    it("accepts every LightingPreset", () => {
        const env = createEnvironment();
        for (const id of LIGHTING_PRESET_IDS as LightingPreset[]) {
            expect(() => env.setLighting(id)).not.toThrow();
        }
        env.dispose();
    });
});

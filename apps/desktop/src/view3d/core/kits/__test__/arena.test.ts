import { beforeAll, describe, expect, it } from "vitest";
import {
    Box3,
    DirectionalLight,
    InstancedMesh,
    Mesh,
    SpotLight,
    Vector3,
    type Object3D,
} from "three";
import { setTexturePainting } from "../../environment";
import type { FieldFootprint, KitBuildInput, KitResult } from "../../types";
import { KIT_LIGHTING } from "../../venueSettings";
import {
    ARENA_LOWER,
    ARENA_MARGIN,
    ARENA_ROOF_Y,
    ARENA_UPPER,
    buildArena,
    judgesTablePlacement,
} from "../arena";
import { RING_POINTS, outlineOffset } from "../bowl";
import {
    cutPolyline,
    mergedBoxes,
    ringSection,
    slicePolyline,
} from "../arena/geometry";

beforeAll(() => setTexturePainting(false));

const footprints: Record<string, FieldFootprint> = {
    indoor40x60: { minX: -17.1, maxX: 17.1, minZ: -22.9, maxZ: 0 },
    indoor50x80: { minX: -22.9, maxX: 22.9, minZ: -28.6, maxZ: 0 },
    football: { minX: -54.86, maxX: 54.86, minZ: -48.77, maxZ: 0 },
};

const params = {
    homeColor: "#6442ff",
    awayColor: "#c23b3b",
    endZoneText: "",
    endZoneColor: "#1f2a5c",
};

const build = (
    footprint: FieldFootprint,
    quality: KitBuildInput["quality"] = "high",
): KitResult => buildArena({ footprint, params, quality });

function drawCalls(root: Object3D): number {
    let n = 0;
    root.traverse((o) => {
        if (!(o instanceof Mesh) || !o.visible) return;
        let p: Object3D | null = o;
        while (p) {
            if (!p.visible) return;
            p = p.parent;
        }
        n += Array.isArray(o.material) ? o.material.length : 1;
    });
    return n;
}

const outline = (fp: FieldFootprint) => ({
    centerX: (fp.minX + fp.maxX) / 2,
    centerZ: (fp.minZ - ARENA_MARGIN.back + fp.maxZ + ARENA_MARGIN.front) / 2,
    halfX: (fp.maxX - fp.minX) / 2 + ARENA_MARGIN.side,
    halfZ: (fp.maxZ - fp.minZ + ARENA_MARGIN.back + ARENA_MARGIN.front) / 2,
    cornerRadius: 9,
});

describe("arena geometry helpers", () => {
    it("bowl rings have the layout the aisles assume", () => {
        expect(RING_POINTS).toBe(148);
    });

    it("merges boxes into one geometry with colors", () => {
        const geo = mergedBoxes([
            { p: [0, 0, 0], s: [1, 1, 1], color: 0xff0000 },
            { p: [5, 0, 0], s: [2, 1, 1], ry: Math.PI / 2 },
        ]);
        expect(geo.getAttribute("position").count).toBe(72);
        expect(geo.getAttribute("color").getX(0)).toBeCloseTo(1);
        geo.computeBoundingBox();
        expect(geo.boundingBox!.max.x).toBeCloseTo(5.5);
        expect(geo.boundingBox!.max.z).toBeCloseTo(1);
        geo.dispose();
    });

    it("slices and cuts polylines", () => {
        const line = [new Vector3(0, 0, 0), new Vector3(10, 0, 0)];
        const mid = slicePolyline(line, 2, 7);
        expect(mid[0].x).toBeCloseTo(2);
        expect(mid[mid.length - 1].x).toBeCloseTo(7);
        const pieces = cutPolyline(line, [
            { minX: 4, maxX: 6, minZ: -1, maxZ: 1 },
        ]);
        expect(pieces).toHaveLength(2);
        expect(pieces[0][pieces[0].length - 1].x).toBeLessThanOrEqual(4);
        expect(pieces[1][0].x).toBeGreaterThanOrEqual(6);
    });

    it("trims ring sections for the aisles", () => {
        const ring = Array.from({ length: 8 }, (_, i) => new Vector3(i, 0, 0));
        const s = ringSection(ring, 1, 5, 0.5);
        expect(s[0].x).toBeCloseTo(1.5);
        expect(s[s.length - 1].x).toBeCloseTo(4.5);
        expect(ringSection(ring, 1, 2, 0.6)).toEqual([]);
    });
});

describe.each(Object.entries(footprints))("arena kit, %s", (_name, fp) => {
    const cx = (fp.minX + fp.maxX) / 2;
    const cz = (fp.minZ + fp.maxZ) / 2;

    it("reports the venue settings' lighting and focuses on the field", () => {
        const kit = build(fp);
        expect(kit.lightingPresets).toEqual([...KIT_LIGHTING.arena.presets]);
        expect(kit.defaultLighting).toBe(KIT_LIGHTING.arena.defaultLighting);
        expect(kit.focus).toEqual([cx, 0, cz]);
        kit.dispose();
    });

    it("keeps the bowl, the judges' table and the tunnel off the floor area", () => {
        const kit = build(fp);
        kit.root.updateMatrixWorld(true);
        const o = outline(fp);
        // Every seat row is in the stands, and none is inside the footprint.
        for (const row of kit.seatRows) {
            expect(row.closed).toBe(false);
            for (const [x, , z] of row.points)
                expect(outlineOffset(o, x, z)).toBeGreaterThan(0);
        }
        const tape = 1.5;
        for (const name of ["arena.judgesTable", "arena.tunnel"]) {
            const box = new Box3().setFromObject(
                kit.root.getObjectByName(name)!,
            );
            const overlapsX =
                box.max.x > fp.minX - tape && box.min.x < fp.maxX + tape;
            const overlapsZ =
                box.max.z > fp.minZ - tape && box.min.z < fp.maxZ + tape;
            expect(overlapsX && overlapsZ).toBe(false);
        }
        const table = judgesTablePlacement(fp);
        expect(table.z).toBeGreaterThan(fp.maxZ + tape);
        expect(table.z).toBeLessThan(fp.maxZ + ARENA_MARGIN.front - 1);
        kit.dispose();
    });

    it("cuts aisles and the tunnel out of the seat rows", () => {
        const kit = build(fp);
        const rows = ARENA_LOWER.rows + ARENA_UPPER.rows;
        // At least ten sections per row, so far more rows than tiers' rows.
        expect(kit.seatRows.length).toBeGreaterThan(rows * 10);
        const tunnel = new Box3().setFromObject(
            kit.root.getObjectByName("arena.tunnel")!,
        );
        for (const row of kit.seatRows)
            for (const [x, y, z] of row.points) {
                const inside =
                    x > tunnel.min.x &&
                    x < tunnel.max.x &&
                    z > tunnel.min.z &&
                    z < tunnel.max.z;
                if (inside) expect(y).toBeGreaterThan(tunnel.max.y - 1.1);
            }
        kit.dispose();
    });

    it("has the named cameras inside the building", () => {
        const kit = build(fp);
        expect(kit.cameras.map((c) => c.id)).toEqual([
            "geJudge",
            "judgesTable",
            "frontRow",
            "upperDeck",
            "corner",
            "tunnel",
            "floor",
            "topDown",
        ]);
        const o = outline(fp);
        for (const c of kit.cameras) {
            expect(c.labelKey).toBe(`view3d.camera.${c.id}`);
            if (c.kind === "topDown") {
                expect(c.position[1]).toBeGreaterThan(ARENA_ROOF_Y);
                continue;
            }
            const [x, y, z] = c.position;
            expect(y).toBeGreaterThan(0.5);
            expect(y).toBeLessThan(ARENA_ROOF_Y - 2);
            const d = outlineOffset(o, x, z);
            const back = ARENA_UPPER.offset + ARENA_UPPER.rows * 0.84;
            expect(d).toBeLessThan(back);
        }
        const seat = (id: string) => kit.cameras.find((c) => c.id === id)!;
        // Seats sit above their tread: the GE judge is high in the lower level.
        expect(seat("geJudge").position[1]).toBeGreaterThan(6);
        expect(seat("upperDeck").position[1]).toBeGreaterThan(ARENA_UPPER.base);
        kit.dispose();
    });

    it("hides everything overhead when the camera is above the roof", () => {
        const kit = build(fp);
        const overhead = kit.root.getObjectByName("arena.overhead")!;
        kit.onFrame?.({ cameraPosition: [cx, ARENA_ROOF_Y + 50, cz], dt: 0 });
        expect(overhead.visible).toBe(false);
        kit.onFrame?.({ cameraPosition: [cx, 8, cz + 30], dt: 0 });
        expect(overhead.visible).toBe(true);
        kit.dispose();
    });

    it("switches between house and show lighting", () => {
        const kit = build(fp);
        const spots: SpotLight[] = [];
        let overheadLight: DirectionalLight | undefined;
        kit.root.traverse((o) => {
            if (o instanceof SpotLight) spots.push(o);
            if (o instanceof DirectionalLight) overheadLight = o;
        });
        expect(spots).toHaveLength(4);
        kit.setLighting("house");
        expect(spots.every((s) => !s.visible)).toBe(true);
        expect(overheadLight!.visible).toBe(true);
        expect(kit.root.getObjectByName("arena.beams")!.visible).toBe(false);
        kit.setLighting("show");
        expect(spots.every((s) => s.visible && s.intensity > 0)).toBe(true);
        expect(kit.root.getObjectByName("arena.beams")!.visible).toBe(true);
        // Unsupported presets are ignored.
        kit.setLighting("day");
        expect(spots.every((s) => s.visible)).toBe(true);
        kit.dispose();
    });

    it("stays cheap: few draw calls, and low quality drops shadows and beams", () => {
        const high = build(fp, "high");
        high.setLighting("show");
        expect(drawCalls(high.root)).toBeLessThanOrEqual(17);
        high.dispose();

        const low = build(fp, "low");
        low.setLighting("show");
        expect(low.root.getObjectByName("arena.beams")).toBeUndefined();
        low.root.traverse((o) => {
            if (o instanceof Mesh || o instanceof InstancedMesh)
                expect(o.castShadow).toBe(false);
            if (o instanceof DirectionalLight) expect(o.castShadow).toBe(false);
        });
        low.dispose();
    });

    it("disposes every geometry, material and texture it made", () => {
        const kit = build(fp);
        const disposed = new Set<object>();
        const watch = (o: { dispose(): void } | null | undefined) => {
            if (!o) return;
            const orig = o.dispose.bind(o);
            o.dispose = () => {
                disposed.add(o);
                orig();
            };
        };
        const owned: { dispose(): void }[] = [];
        kit.root.traverse((o) => {
            if (!(o instanceof Mesh)) return;
            owned.push(o.geometry);
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mats) {
                owned.push(m);
                for (const key of ["map", "emissiveMap", "alphaMap"] as const) {
                    const tex = (m as unknown as Record<string, unknown>)[key];
                    if (tex) owned.push(tex as { dispose(): void });
                }
            }
        });
        owned.forEach(watch);
        kit.dispose();
        for (const o of owned) expect(disposed.has(o)).toBe(true);
        expect(kit.root.children).toHaveLength(0);
    });
});

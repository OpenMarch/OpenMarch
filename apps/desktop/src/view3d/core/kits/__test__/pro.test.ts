// cspell:ignore Raycaster
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
    Box3,
    DoubleSide,
    Mesh,
    Raycaster,
    SpotLight,
    Triangle,
    Vector3,
    type Object3D,
    type Vector3Tuple,
} from "three";
import type { FieldFootprint, KitResult, VenueParams } from "../../types";
import { buildCrowd, ft, setTexturePainting } from "../../environment";
import { outlineOffset } from "../bowl";
import {
    buildProKit,
    PRO_BOARD,
    PRO_BOWL_MARGIN,
    PRO_CORNER_RADIUS,
    PRO_ROOF_Y,
    PRO_TIERS,
} from "../pro";

beforeAll(() => setTexturePainting(false));

/** Football field with end zones (design.md section 2). */
const football: FieldFootprint = {
    minX: -54.864,
    maxX: 54.864,
    minZ: -48.768,
    maxZ: 0,
};
/** A smaller indoor-style footprint, off center. */
const small: FieldFootprint = { minX: -20, maxX: 24, minZ: -26, maxZ: 0 };

const params: VenueParams = {
    homeColor: "#6442ff",
    awayColor: "#c23b3b",
    endZoneText: "",
    endZoneColor: "#1f2a5c",
};

const kits: KitResult[] = [];
const build = (footprint = football, quality: "low" | "high" = "high") => {
    const kit = buildProKit({ footprint, params, quality });
    kits.push(kit);
    kit.root.updateMatrixWorld(true);
    return kit;
};
afterEach(() => {
    kits.splice(0).forEach((k) => k.dispose());
});

const meshes = (root: Object3D) => {
    const out: Mesh[] = [];
    root.traverse((o) => {
        if (o instanceof Mesh) out.push(o);
    });
    return out;
};
const byName = (root: Object3D, name: string) => {
    const out: Object3D[] = [];
    root.traverse((o) => {
        if (o.name === name) out.push(o);
    });
    return out;
};
const outline = (fp: FieldFootprint) => ({
    centerX: (fp.minX + fp.maxX) / 2,
    centerZ: (fp.minZ + fp.maxZ) / 2,
    halfX: (fp.maxX - fp.minX) / 2 + PRO_BOWL_MARGIN,
    halfZ: (fp.maxZ - fp.minZ) / 2 + PRO_BOWL_MARGIN,
    cornerRadius: PRO_CORNER_RADIUS,
});

/** World-space triangles of every non-box mesh (the bands). */
function bandTriangles(kit: KitResult): Triangle[] {
    const triangles: Triangle[] = [];
    for (const m of meshes(kit.root)) {
        if (m.geometry.type !== "BufferGeometry") continue;
        const pos = m.geometry.getAttribute("position");
        for (let i = 0; i < pos.count; i += 3) {
            const [a, b, c] = [0, 1, 2].map((k) =>
                new Vector3()
                    .fromBufferAttribute(pos, i + k)
                    .applyMatrix4(m.matrixWorld),
            );
            triangles.push(new Triangle(a, b, c));
        }
    }
    return triangles;
}

describe("pro dome kit", () => {
    it("builds within the expected bounds with no NaN geometry", () => {
        for (const fp of [football, small]) {
            const kit = build(fp);
            const box = new Box3();
            for (const m of meshes(kit.root)) {
                if (m.name === "pro.ground") continue;
                const pos = m.geometry.getAttribute("position");
                for (let i = 0; i < pos.array.length; i++)
                    expect(Number.isNaN(pos.array[i])).toBe(false);
                box.expandByObject(m);
            }
            const o = outline(fp);
            const upper = PRO_TIERS[1];
            const back = upper.offset + upper.rows * upper.depth;
            const reachX = o.halfX + back + ft(10);
            const reachZ = o.halfZ + back + ft(10);
            expect(box.min.x).toBeGreaterThan(o.centerX - reachX);
            expect(box.max.x).toBeLessThan(o.centerX + reachX);
            expect(box.min.z).toBeGreaterThan(o.centerZ - reachZ);
            expect(box.max.z).toBeLessThan(o.centerZ + reachZ);
            expect(box.min.y).toBeGreaterThan(-0.5);
            expect(box.max.y).toBeLessThan(PRO_ROOF_Y + ft(10));
            // The bowl surrounds the field on every side.
            expect(box.min.x).toBeLessThan(fp.minX - 50);
            expect(box.max.z).toBeGreaterThan(fp.maxZ + 50);
            expect(kit.focus).toEqual([o.centerX, 0, o.centerZ]);
        }
    });

    it("roof and suites match the design heights", () => {
        const kit = build();
        const roof = new Box3().setFromObject(
            byName(kit.root, "pro.roofFrame")[0],
        );
        expect((roof.min.y + roof.max.y) / 2).toBeCloseTo(51.2, 1);
        const suites = new Box3().setFromObject(
            byName(kit.root, "pro.suites")[0],
        );
        expect(suites.min.y).toBeCloseTo(11.3, 1);
        expect(suites.max.y).toBeCloseTo(14.9, 1);
        // The roof opening is about 128 x 73 m when open.
        const panels = byName(kit.root, "pro.roofPanel") as Mesh[];
        const width = panels.reduce((s, p) => s + p.scale.x, 0);
        expect(width).toBeCloseTo(128, 0);
        expect(panels[0].scale.z).toBeCloseTo(73.2, 0);
    });

    it("returns closed seat rows that follow the bowl outline", () => {
        const kit = build();
        const rows = PRO_TIERS[0].rows + PRO_TIERS[1].rows;
        expect(kit.seatRows).toHaveLength(rows);
        const o = outline(football);
        let prev = -Infinity;
        kit.seatRows.forEach((row, i) => {
            expect(row.closed).toBe(true);
            expect(row.points.length).toBeGreaterThan(100);
            const d = outlineOffset(o, row.points[0][0], row.points[0][2]);
            for (const [x, y, z] of row.points) {
                expect(outlineOffset(o, x, z)).toBeCloseTo(d, 5);
                expect(y).toBe(row.points[0][1]);
            }
            // Rows step outward within a tier; the upper deck overhangs.
            if (i !== PRO_TIERS[0].rows) expect(d).toBeGreaterThan(prev);
            prev = d;
            expect(row.depth).toBe(
                i < PRO_TIERS[0].rows ? PRO_TIERS[0].depth : PRO_TIERS[1].depth,
            );
        });

        const crowd = buildCrowd(kit.seatRows, { density: 0.6 });
        expect(crowd.count).toBeGreaterThan(10000);
        crowd.dispose();
    });

    it("places seat cameras inside the bowl, clear of geometry", () => {
        const kit = build();
        const o = outline(football);
        const ids = kit.cameras.map((c) => c.id);
        expect(ids).toEqual([
            "pressBox",
            "lowerBowl",
            "upperDeck",
            "endZone",
            "sideline",
            "blimp",
            "topDown",
        ]);
        kit.cameras.forEach((c) =>
            expect(c.labelKey).toBe(`view3d.camera.${c.id}`),
        );

        const triangles = bandTriangles(kit);
        const boxes = meshes(kit.root)
            .filter((m) => m.geometry.type === "BoxGeometry")
            .map((m) => new Box3().setFromObject(m));
        const solid = meshes(kit.root).filter((m) => m.name !== "pro.ground");
        // Raycast both faces of every mesh.
        solid.forEach(
            (m) =>
                ((
                    m.material as Mesh["material"] & {
                        side: number;
                    }
                ).side = DoubleSide),
        );
        const ray = new Raycaster();
        const upper = PRO_TIERS[1];
        const bowlBack = upper.offset + upper.rows * upper.depth;
        const closest = new Vector3();

        for (const c of kit.cameras.filter(
            (c) => c.kind === "seat" || c.kind === "floor",
        )) {
            const p = new Vector3(...c.position);
            const d = outlineOffset(o, p.x, p.z);
            expect(d, c.id).toBeLessThan(bowlBack);
            expect(p.y, c.id).toBeGreaterThan(1);
            expect(p.y, c.id).toBeLessThan(PRO_ROOF_Y - 5);
            for (const b of boxes)
                expect(b.containsPoint(p), `${c.id} inside a box`).toBe(false);
            const near = Math.min(
                ...triangles.map((t) =>
                    t.closestPointToPoint(p, closest).distanceTo(p),
                ),
            );
            expect(near, `${c.id} clearance`).toBeGreaterThan(0.3);
            // Something is underfoot within a few meters, nothing overhead within 1.5 m.
            ray.set(p, new Vector3(0, -1, 0));
            const below = ray.intersectObjects(solid, false)[0];
            expect(below, c.id).toBeDefined();
            expect(below.distance, c.id).toBeGreaterThan(0.3);
            expect(below.distance, c.id).toBeLessThan(3);
            ray.set(p, new Vector3(0, 1, 0));
            const above = ray.intersectObjects(solid, false)[0];
            if (above) expect(above.distance, c.id).toBeGreaterThan(1.5);
            // Every camera looks toward the field.
            const t = new Vector3(...c.target);
            expect(outlineOffset(o, t.x, t.z), c.id).toBeLessThan(0);
        }

        const press = kit.cameras.find((c) => c.id === "pressBox")!;
        expect(press.position[1]).toBeGreaterThan(11.3);
        expect(press.position[1]).toBeLessThan(14.9);
        expect(press.position[2]).toBeGreaterThan(football.maxZ);

        const top = kit.cameras.find((c) => c.id === "topDown")!;
        expect(top.position[1]).toBeGreaterThan(PRO_ROOF_Y);
        expect(top.position[0]).toBeCloseTo(top.target[0]);
        expect(top.position[2]).toBeGreaterThan(top.target[2]);
        expect(top.position[2] - top.target[2]).toBeLessThan(0.5);
    });

    it("seat cameras sit among the crowd, which clears around them", () => {
        const kit = build();
        const crowd = buildCrowd(kit.seatRows, { density: 1 });
        for (const c of kit.cameras.filter((c) => c.kind === "seat")) {
            const hidden = crowd.clearAround(c.position as Vector3Tuple, 4.9);
            expect(hidden, c.id).toBeGreaterThan(c.id === "pressBox" ? -1 : 5);
        }
        crowd.dispose();
    });

    it("keeps the video boards above the seated crowd", () => {
        const kit = build();
        const crowd = buildCrowd(kit.seatRows, { density: 1 });
        const boards = byName(kit.root, "videoBoard").map((b) =>
            new Box3().setFromObject(b),
        );
        expect(boards).toHaveLength(2);
        const arr = crowd.mesh.instanceMatrix.array as Float32Array;
        for (const b of boards) {
            expect(b.min.y).toBeCloseTo(
                PRO_BOARD.y - PRO_BOARD.height / 2 - ft(2),
                1,
            );
            for (let i = 0; i < crowd.mesh.count; i++) {
                const x = arr[i * 16 + 12];
                const y = arr[i * 16 + 13];
                const z = arr[i * 16 + 14];
                if (x < b.min.x || x > b.max.x || z < b.min.z || z > b.max.z)
                    continue;
                expect(y + 0.5).toBeLessThan(b.min.y);
            }
        }
        crowd.dispose();
    });

    it("opens and closes the roof in onFrame, and hides it from above", () => {
        const kit = build();
        expect(kit.lightingPresets).toEqual(["day", "night", "roofClosed"]);
        expect(kit.defaultLighting).toBe("roofClosed");
        const panels = byName(kit.root, "pro.roofPanel") as Mesh[];
        const roof = byName(kit.root, "pro.roof")[0];
        const clerestory = byName(kit.root, "pro.clerestory")[0];
        const closedX = panels.map((p) => p.position.x);
        const inside: Vector3Tuple = [0, 10, -24];
        const run = (frames: number) => {
            for (let i = 0; i < frames; i++)
                kit.onFrame!({ cameraPosition: inside, dt: 1 / 60 });
        };

        // Closed by default: the panels meet over the field.
        expect(closedX[0]).toBeLessThan(0);
        expect(closedX[1]).toBeGreaterThan(0);
        run(5);
        expect(panels.map((p) => p.position.x)).toEqual(closedX);

        kit.setLighting("day");
        run(10);
        expect(panels[0].position.x).toBeLessThan(closedX[0]);
        expect(panels[1].position.x).toBeGreaterThan(closedX[1]);
        run(400);
        const ox = panels[0].scale.x;
        expect(panels[0].position.x).toBeCloseTo(closedX[0] - ox, 5);
        expect(panels[1].position.x).toBeCloseTo(closedX[1] + ox, 5);

        // Frame-rate independent: one long frame moves as far as many short ones.
        kit.setLighting("roofClosed");
        kit.onFrame!({ cameraPosition: inside, dt: 0.5 });
        const afterLong = panels[1].position.x;
        kit.setLighting("day");
        run(400);
        kit.setLighting("roofClosed");
        run(30);
        expect(panels[1].position.x).toBeCloseTo(afterLong, 3);
        run(400);
        expect(panels.map((p) => p.position.x)).toEqual(closedX);

        // Night keeps the roof open; unsupported presets are ignored.
        kit.setLighting("night");
        kit.setLighting("show");
        run(400);
        expect(panels[0].position.x).toBeCloseTo(closedX[0] - ox, 5);

        expect(roof.visible).toBe(true);
        expect(clerestory.visible).toBe(true);
        kit.onFrame!({ cameraPosition: [0, PRO_ROOF_Y + 5, 0], dt: 1 / 60 });
        expect(roof.visible).toBe(false);
        expect(clerestory.visible).toBe(false);
        kit.onFrame!({ cameraPosition: inside, dt: 1 / 60 });
        expect(roof.visible).toBe(true);
    });

    it("drives the roof lights from the preset's kit values", () => {
        const kit = build();
        const spots = byName(kit.root, "pro.roofSpot") as SpotLight[];
        expect(spots).toHaveLength(6);
        kit.setLighting("day");
        spots.forEach((s) => expect(s.intensity).toBe(0));
        kit.setLighting("night");
        spots.forEach((s) => expect(s.intensity).toBe(1.4));
        kit.setLighting("roofClosed");
        spots.forEach((s) => expect(s.intensity).toBe(1.4));
    });

    it("stays under the draw-call budget, crowd included", () => {
        for (const quality of ["high", "low"] as const) {
            const kit = build(football, quality);
            const crowd = buildCrowd(kit.seatRows, { quality });
            kit.root.add(crowd.mesh);
            let draws = 0;
            kit.root.traverse((o) => {
                if (o instanceof Mesh) draws++;
            });
            expect(draws).toBeLessThan(300);
            const casters = meshes(kit.root).filter((m) => m.castShadow);
            if (quality === "low") expect(casters).toHaveLength(0);
            else expect(casters.length).toBeGreaterThan(0);
            kit.root.remove(crowd.mesh);
            crowd.dispose();
        }
    });

    it("disposes every geometry and material it created", () => {
        const kit = buildProKit({
            footprint: football,
            params,
            quality: "high",
        });
        const disposed = new Set<unknown>();
        const resources = new Set<{ dispose(): void }>();
        for (const m of meshes(kit.root)) {
            resources.add(m.geometry);
            (Array.isArray(m.material) ? m.material : [m.material]).forEach(
                (mat) => resources.add(mat),
            );
        }
        resources.forEach((r) => {
            const original = r.dispose.bind(r);
            r.dispose = () => {
                disposed.add(r);
                original();
            };
        });
        kit.dispose();
        resources.forEach((r) => expect(disposed.has(r)).toBe(true));
        expect(kit.root.children).toHaveLength(0);
    });
});

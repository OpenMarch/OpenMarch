// cspell:ignore Raycaster
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
    Box3,
    BufferGeometry,
    InstancedMesh,
    LineSegments,
    Matrix4,
    Mesh,
    MeshStandardMaterial,
    Raycaster,
    SpotLight,
    Vector3,
    type Material,
    type Object3D,
} from "three";
import type { FieldFootprint, KitResult, VenueParams } from "../../types";
import { buildCrowd, setTexturePainting } from "../../environment";
import {
    buildCollege,
    COLLEGE_BAND_ROWS,
    COLLEGE_LOWER,
    collegeLayout,
} from "../college";
import { horseshoe, samplesBetween, sections } from "../college/horseshoe";

beforeAll(() => setTexturePainting(false));

/** College football field with end zones. */
const FOOTBALL: FieldFootprint = {
    minX: -54.864,
    maxX: 54.864,
    minZ: -48.768,
    maxZ: 0,
};
const SMALL: FieldFootprint = { minX: -20, maxX: 28, minZ: -30, maxZ: 0 };
const PARAMS: VenueParams = {
    homeColor: "#6442ff",
    awayColor: "#c23b3b",
    endZoneText: "",
    endZoneColor: "#1f2a5c",
};

const kits: KitResult[] = [];
const build = (footprint = FOOTBALL, quality: "low" | "high" = "high") => {
    const kit = buildCollege({ footprint, params: PARAMS, quality });
    kit.root.updateMatrixWorld(true);
    kits.push(kit);
    return kit;
};
afterEach(() => kits.splice(0).forEach((k) => k.dispose()));

const meshes = (root: Object3D) => {
    const out: Mesh[] = [];
    root.traverse((o) => {
        if (o instanceof Mesh) out.push(o);
    });
    return out;
};

describe("horseshoe path", () => {
    const hs = horseshoe({
        cx: 0,
        cz: -24,
        halfX: 64,
        halfZ: 38,
        radius: 24,
        openX: -64,
    });

    it("runs front, corner, end, corner, back with unit normals", () => {
        expect(hs.segments.map((s) => s.kind)).toEqual([
            "front",
            "arc1",
            "end",
            "arc2",
            "back",
        ]);
        for (let s = 0; s <= hs.length; s += hs.length / 97) {
            const p = hs.at(s);
            expect(Math.hypot(p.nx, p.nz)).toBeCloseTo(1, 6);
        }
        // Starts at the open end on the front wall, ends there on the back.
        expect(hs.at(0)).toMatchObject({ x: -64, z: 14, nz: 1 });
        const last = hs.at(hs.length);
        expect(last.x).toBeCloseTo(-64);
        expect(last.z).toBeCloseTo(-62);
        // The middle of the end straight faces +X.
        const end = hs.segments[2];
        const mid = hs.at((end.s0 + end.s1) / 2);
        expect(mid.x).toBeCloseTo(64);
        expect(mid.nx).toBeCloseTo(1);
    });

    it("is continuous across segment junctions", () => {
        for (const seg of hs.segments.slice(1)) {
            const [a, b] = [hs.point(seg.s0 - 1e-6, 10), hs.point(seg.s0, 10)];
            expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(1e-3);
        }
    });

    it("splits into sections with aisles, none straddling a junction", () => {
        const secs = sections(hs, 0, hs.length, { refOffset: 16 });
        expect(secs.length).toBeGreaterThan(20);
        for (let i = 0; i < secs.length; i++) {
            const s = secs[i];
            expect(s.b).toBeGreaterThan(s.a);
            const seg = hs.segmentAt((s.a + s.b) / 2);
            expect(s.a).toBeGreaterThanOrEqual(seg.s0);
            expect(s.b).toBeLessThanOrEqual(seg.s1);
            if (i > 0) expect(s.a).toBeGreaterThan(secs[i - 1].b);
        }
        // Straight sections fit inside the crowd's 18-person run (11.5 m).
        for (const s of secs.filter((x) => x.segment === "front"))
            expect(s.b - s.a).toBeLessThan(11.5);
    });

    it("samples arcs finely and straights at their ends", () => {
        const front = hs.segments[0];
        expect(samplesBetween(hs, front.s0 + 1, front.s1 - 1)).toHaveLength(2);
        const arc = hs.segments[1];
        expect(samplesBetween(hs, arc.s0, arc.s1).length).toBeGreaterThan(20);
    });
});

describe("college kit", () => {
    it("is a horseshoe: seats on both sidelines and the side-2 end only", () => {
        const kit = build();
        const xs = kit.seatRows.flatMap((r) => r.points.map((p) => p[0]));
        const zs = kit.seatRows.flatMap((r) => r.points.map((p) => p[2]));
        expect(Math.max(...xs)).toBeGreaterThan(FOOTBALL.maxX + 9);
        // Nothing past the side-1 end wall: that end is open.
        const { hs } = collegeLayout(FOOTBALL);
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(
            hs.spec.cx - hs.spec.halfX - 1e-6,
        );
        expect(Math.max(...zs)).toBeGreaterThan(FOOTBALL.maxZ + 13);
        expect(Math.min(...zs)).toBeLessThan(FOOTBALL.minZ - 13);
    });

    it("keeps the seats off the field and out of the wall", () => {
        const kit = build();
        const { hs } = collegeLayout(FOOTBALL);
        for (const row of kit.seatRows)
            for (const [x, y, z] of row.points) {
                expect(y).toBeGreaterThan(COLLEGE_LOWER.base);
                const inField =
                    x > hs.spec.cx - hs.spec.halfX + 0.01 &&
                    x < hs.spec.cx + hs.spec.halfX - 0.01 &&
                    z > hs.spec.cz - hs.spec.halfZ + 0.01 &&
                    z < hs.spec.cz + hs.spec.halfZ - 0.01;
                // Inside the wall's bounding box only in the rounded corners.
                if (inField) {
                    const dx = Math.abs(x - hs.spec.cx) - (hs.spec.halfX - 24);
                    const dz = Math.abs(z - hs.spec.cz) - (hs.spec.halfZ - 24);
                    expect(dx > 0 && dz > 0).toBe(true);
                }
            }
    });

    it("has the stadium cameras plus upper deck and sideline", () => {
        const kit = build();
        expect(kit.cameras.map((c) => c.id)).toEqual([
            "pressBox",
            "frontRow",
            "upperDeck",
            "endZone",
            "sideline",
            "blimp",
            "topDown",
        ]);
        for (const c of kit.cameras) {
            expect(c.labelKey).toBe(`view3d.camera.${c.id}`);
            expect([...c.position, ...c.target].every(Number.isFinite)).toBe(
                true,
            );
        }
        const press = kit.cameras[0];
        // Up in the press box at the 50, in front of the home stand.
        expect(press.position[0]).toBeCloseTo(0);
        expect(press.position[1]).toBeGreaterThan(18);
        expect(press.position[2]).toBeGreaterThan(40);
    });

    it("sees the field from every seat camera (nothing of the kit in the way)", () => {
        const kit = build();
        const solids = meshes(kit.root).filter(
            (m) => !m.userData.ground && !(m instanceof InstancedMesh),
        );
        const ray = new Raycaster();
        for (const c of kit.cameras) {
            const from = new Vector3(...c.position);
            const to = new Vector3(...c.target);
            ray.set(from, to.clone().sub(from).normalize());
            ray.far = from.distanceTo(to) - 1;
            const hits = ray.intersectObjects(solids, false);
            expect(
                hits.map((h) => h.object.name),
                c.id,
            ).toEqual([]);
        }
    });

    it("puts the band in its block and leaves those seats out of the crowd", () => {
        const kit = build();
        const band = kit.root.getObjectByName("college.band") as InstancedMesh;
        expect(band).toBeInstanceOf(InstancedMesh);
        const rows = COLLEGE_BAND_ROWS[1] - COLLEGE_BAND_ROWS[0];
        expect(band.count / 3).toBeGreaterThan(rows * 20);
        const m = new Vector3();
        const box = new Box3();
        band.computeBoundingBox();
        box.copy(band.boundingBox!);
        box.getCenter(m);
        // The block sits in the side-2 back corner.
        expect(m.x).toBeGreaterThan(FOOTBALL.maxX - 5);
        expect(m.z).toBeLessThan(FOOTBALL.minZ);
        // No crowd member sits in a band seat.
        const near = (p: Vector3, q: Vector3) =>
            Math.abs(p.x - q.x) < 0.3 &&
            Math.abs(p.z - q.z) < 0.3 &&
            Math.abs(p.y - q.y) < 0.6;
        const members: Vector3[] = [];
        const at = new Matrix4();
        for (let i = 0; i < band.count; i += 3) {
            band.getMatrixAt(i, at);
            members.push(new Vector3().setFromMatrixPosition(at));
        }
        const crowd = buildCrowd(kit.seatRows, { density: 1 });
        let clashes = 0;
        for (let i = 0; i < crowd.mesh.count; i++) {
            crowd.mesh.getMatrixAt(i, at);
            const p = new Vector3().setFromMatrixPosition(at);
            if (!box.containsPoint(p)) continue;
            if (members.some((q) => near(p, q))) clashes++;
        }
        crowd.dispose();
        expect(clashes).toBe(0);
    });

    it("feeds the crowd builder from section rows", () => {
        const kit = build();
        expect(kit.seatRows.length).toBeGreaterThan(500);
        for (const row of kit.seatRows) {
            expect(row.closed).toBe(false);
            expect(row.points.length).toBeGreaterThanOrEqual(2);
        }
        const sides = new Set(kit.seatRows.map((r) => r.side));
        expect(sides).toEqual(new Set(["home", "away", "neutral"]));
        const crowd = buildCrowd(kit.seatRows, { density: kit.crowdDensity });
        expect(crowd.count).toBeGreaterThan(15000);
        expect(crowd.clearAround(kit.cameras[1].position, 5)).toBeGreaterThan(
            0,
        );
        crowd.dispose();
    });

    it("stays within its draw call budget, high and low", () => {
        const count = (quality: "low" | "high") => {
            const kit = build(FOOTBALL, quality);
            let calls = 0;
            kit.root.traverse((o) => {
                if (o instanceof Mesh || o instanceof LineSegments) calls++;
            });
            return calls;
        };
        expect(count("high")).toBeLessThanOrEqual(40);
        // The crowd adds one more, and the budget is 23.
        expect(count("low")).toBeLessThanOrEqual(22);
    });

    it("drops the trees and seat backs on the low path", () => {
        const high = build();
        const low = build(FOOTBALL, "low");
        expect(high.root.getObjectByName("college.trees")).toBeDefined();
        expect(low.root.getObjectByName("college.trees")).toBeUndefined();
        expect(high.root.getObjectByName("college.seats")).toBeDefined();
        expect(low.root.getObjectByName("college.seats")).toBeUndefined();
    });

    it("has an exterior: a facade, gates and a site that fades into the ground", () => {
        const kit = build();
        expect(kit.root.getObjectByName("college.facade")).toBeDefined();
        const site = kit.root.getObjectByName("college.site") as Mesh;
        expect(site.userData.ground).toBe(true);
        expect((site.material as MeshStandardMaterial).transparent).toBe(true);
    });

    it("lights the building at night and leaves it unlit by day", () => {
        const kit = build();
        const facade = (kit.root.getObjectByName("college.facade") as Mesh)
            .material as MeshStandardMaterial;
        kit.setLighting("day");
        expect(facade.emissiveIntensity).toBe(0);
        kit.setLighting("night");
        expect(facade.emissiveIntensity).toBeGreaterThan(0);
    });

    it("drives the lamp-bank spots from the lighting preset", () => {
        const kit = build();
        const spots: SpotLight[] = [];
        kit.root.traverse((o) => {
            if (o instanceof SpotLight) spots.push(o);
        });
        expect(spots.length).toBe(4);
        expect(kit.defaultLighting).toBe("night");
        expect(kit.lightingPresets).toEqual(["day", "dusk", "night"]);
        kit.setLighting("night");
        for (const s of spots) expect(s.intensity).toBeCloseTo(1.6);
        kit.setLighting("dusk");
        for (const s of spots) expect(s.intensity).toBeCloseTo(1.6 * 0.6);
        kit.setLighting("day");
        for (const s of spots) expect(s.visible).toBe(false);
        kit.setLighting("house");
        for (const s of spots) expect(s.visible).toBe(false);
        // Lamps aim down at the field.
        for (const s of spots) {
            expect(s.position.y).toBeGreaterThan(30);
            expect(s.target.position.y).toBe(0);
        }
    });

    it("builds for an off-center footprint with finite geometry", () => {
        const kit = build(SMALL);
        expect(kit.focus).toEqual([4, 0, -15]);
        for (const m of meshes(kit.root)) {
            const pos = (m.geometry as BufferGeometry).getAttribute("position");
            for (const v of pos.array) expect(Number.isFinite(v)).toBe(true);
        }
        const front = kit.seatRows.find((r) => r.side === "home")!;
        expect(Math.min(...front.points.map((p) => p[2]))).toBeGreaterThan(0);
    });

    it("drops shadows at low quality", () => {
        const kit = build(FOOTBALL, "low");
        kit.root.traverse((o) => expect(o.castShadow).toBe(false));
    });

    it("disposes every geometry and material it created", () => {
        const kit = build();
        const disposed = new Set<unknown>();
        const watched = new Set<BufferGeometry | Material>();
        kit.root.traverse((o) => {
            if (!(o instanceof Mesh)) return;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const item of [o.geometry as BufferGeometry, ...mats]) {
                if (watched.has(item)) continue;
                watched.add(item);
                item.addEventListener("dispose", () => disposed.add(item));
            }
        });
        kits.splice(kits.indexOf(kit), 1);
        kit.dispose();
        for (const item of watched) expect(disposed.has(item)).toBe(true);
    });
});

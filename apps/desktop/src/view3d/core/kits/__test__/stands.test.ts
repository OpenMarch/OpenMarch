import { beforeAll, describe, expect, it } from "vitest";
import {
    BoxGeometry,
    InstancedMesh,
    LineSegments,
    Matrix4,
    Mesh,
    SpotLight,
    Vector3,
    type BufferGeometry,
    type Material,
    type Object3D,
} from "three";
import { setTexturePainting } from "../../environment";
import type {
    FieldFootprint,
    KitBuilder,
    KitResult,
    LightingPreset,
    VenueKitId,
    VenueParams,
} from "../../types";
import { buildBighs } from "../bighs";
import { buildBlank } from "../blank";
import { buildCollege } from "../college";
import { buildHs } from "../hs";

beforeAll(() => setTexturePainting(false));

/** A football field with end zones, in world meters (design.md section 2). */
const FOOTBALL: FieldFootprint = {
    minX: -54.86,
    maxX: 54.86,
    minZ: -48.77,
    maxZ: 0,
};
/** A smaller, off-center surface to prove placement follows the footprint. */
const SMALL: FieldFootprint = { minX: -20, maxX: 28, minZ: -30, maxZ: 0 };
const PARAMS: VenueParams = {
    homeColor: "#6442ff",
    awayColor: "#c23b3b",
    endZoneText: "",
    endZoneColor: "#1f2a5c",
};

const KITS: {
    id: Extract<VenueKitId, "hs" | "bighs" | "college" | "blank">;
    build: KitBuilder;
    cameras: string[];
    defaultLighting: LightingPreset;
    stands: boolean;
}[] = [
    {
        id: "hs",
        build: buildHs,
        cameras: [
            "pressBox",
            "frontRow",
            "podium",
            "endZone",
            "blimp",
            "topDown",
        ],
        defaultLighting: "day",
        stands: true,
    },
    {
        id: "bighs",
        build: buildBighs,
        cameras: [
            "pressBox",
            "frontRow",
            "podium",
            "endZone",
            "blimp",
            "topDown",
        ],
        defaultLighting: "night",
        stands: true,
    },
    {
        id: "college",
        build: buildCollege,
        cameras: ["pressBox", "frontRow", "endZone", "blimp", "topDown"],
        defaultLighting: "night",
        stands: true,
    },
    {
        id: "blank",
        build: buildBlank,
        cameras: ["frontRow", "endZone", "blimp", "topDown"],
        defaultLighting: "day",
        stands: false,
    },
];

const build = (
    kit: KitBuilder,
    footprint = FOOTBALL,
    quality: "low" | "high" = "high",
) => kit({ footprint, params: PARAMS, quality });

/** Solid boxes (unit-box meshes and instances) a camera must not sit in. */
function solids(root: Object3D): Matrix4[] {
    root.updateMatrixWorld(true);
    const out: Matrix4[] = [];
    root.traverse((o) => {
        if (o.userData.crowd || o.userData.ground) return;
        if (!(o instanceof Mesh) || !(o.geometry instanceof BoxGeometry))
            return;
        if (o instanceof InstancedMesh) {
            const m = new Matrix4();
            for (let i = 0; i < o.count; i++) {
                o.getMatrixAt(i, m);
                out.push(new Matrix4().multiplyMatrices(o.matrixWorld, m));
            }
        } else {
            out.push(o.matrixWorld.clone());
        }
    });
    return out;
}

function insideAny(point: [number, number, number], boxes: Matrix4[]) {
    const p = new Vector3();
    for (const box of boxes) {
        p.set(...point).applyMatrix4(box.clone().invert());
        if (Math.abs(p.x) < 0.5 && Math.abs(p.y) < 0.5 && Math.abs(p.z) < 0.5) {
            return true;
        }
    }
    return false;
}

function drawCalls(root: Object3D): number {
    let n = 0;
    root.traverse((o) => {
        if (o instanceof Mesh || o instanceof LineSegments) n++;
    });
    return n;
}

function finiteEverywhere(root: Object3D) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
        for (const e of o.matrixWorld.elements) {
            expect(Number.isFinite(e)).toBe(true);
        }
        if (o instanceof Mesh || o instanceof LineSegments) {
            const pos = (o.geometry as BufferGeometry).getAttribute("position");
            for (const v of pos.array) expect(Number.isFinite(v)).toBe(true);
        }
    });
}

describe.each(KITS)("$id kit", ({ build: builder, ...expected }) => {
    it("returns the contract with finite geometry", () => {
        const kit = build(builder);
        expect(kit.focus[0]).toBeCloseTo(0);
        expect(kit.focus[2]).toBeCloseTo(-24.385);
        expect(kit.defaultLighting).toBe(expected.defaultLighting);
        expect(kit.lightingPresets).toEqual(["day", "dusk", "night"]);
        finiteEverywhere(kit.root);
        kit.dispose();
    });

    it("has the named camera seats, labeled view3d.camera.<id>", () => {
        const kit = build(builder);
        expect(kit.cameras.map((c) => c.id)).toEqual(expected.cameras);
        for (const c of kit.cameras) {
            expect(c.labelKey).toBe(`view3d.camera.${c.id}`);
            for (const v of [...c.position, ...c.target]) {
                expect(Number.isFinite(v)).toBe(true);
            }
        }
        const topDown = kit.cameras.find((c) => c.id === "topDown")!;
        expect(topDown.kind).toBe("topDown");
        expect(topDown.position[1]).toBeGreaterThan(100);
        // Looking down with "up" toward the back: the eye is a hair nearer the audience.
        expect(topDown.position[2]).toBeGreaterThan(topDown.target[2]);
        kit.dispose();
    });

    it("keeps cameras out of walls and inside the venue", () => {
        const kit = build(builder);
        const boxes = solids(kit.root);
        for (const c of kit.cameras) {
            expect(insideAny(c.position, boxes), c.id).toBe(false);
            expect(c.position[1], c.id).toBeGreaterThan(0.5);
            if (expected.stands && c.kind === "seat") {
                // seat cameras sit within 140 m of the field center
                expect(Math.abs(c.position[0]), c.id).toBeLessThan(140);
                expect(Math.abs(c.position[2] + 24.4), c.id).toBeLessThan(140);
            }
        }
        kit.dispose();
    });

    it("keeps the footprint free for the field surface", () => {
        const kit = build(builder);
        // Nothing solid rises inside the footprint.
        for (const m of solids(kit.root)) {
            const center = new Vector3().setFromMatrixPosition(m);
            const inside =
                center.x > FOOTBALL.minX &&
                center.x < FOOTBALL.maxX &&
                center.z > FOOTBALL.minZ &&
                center.z < FOOTBALL.maxZ;
            expect(inside).toBe(false);
        }
        kit.dispose();
    });

    it("returns seat rows only for kits with stands", () => {
        const kit = build(builder);
        if (!expected.stands) {
            expect(kit.seatRows).toEqual([]);
            expect(kit.pickTargets).toEqual([]);
            expect(kit.root.userData.crowd).toBeUndefined();
        } else {
            expect(kit.seatRows.length).toBeGreaterThan(40);
            expect(kit.pickTargets.length).toBeGreaterThanOrEqual(2);
            for (const row of kit.seatRows) {
                expect(row.points.length).toBeGreaterThanOrEqual(2);
                expect(row.closed).toBe(false);
                for (const p of row.points) {
                    expect(p.every(Number.isFinite)).toBe(true);
                    expect(p[1]).toBeGreaterThan(0);
                }
            }
            const crowd = kit.root.userData.crowd;
            expect(crowd.count).toBeGreaterThan(500);
            // the crowd handle works with the rows' frame
            const hidden = crowd.clearAround(kit.cameras[1].position, 5);
            expect(hidden).toBeGreaterThan(0);
            crowd.reset();
            expect(crowd.visibleCount()).toBe(crowd.count);
        }
        kit.dispose();
    });

    it("stays under the draw call budget", () => {
        const kit = build(builder);
        expect(drawCalls(kit.root)).toBeLessThan(300);
        // And in practice well under it.
        expect(drawCalls(kit.root)).toBeLessThan(80);
        kit.dispose();
    });

    it("applies lighting presets and ignores unsupported ones", () => {
        const kit = build(builder);
        const spots: SpotLight[] = [];
        kit.root.traverse((o) => {
            if (o instanceof SpotLight) spots.push(o);
        });
        kit.setLighting("night");
        for (const s of spots) expect(s.intensity).toBeGreaterThan(0);
        kit.setLighting("dusk");
        for (const s of spots) expect(s.intensity).toBeCloseTo(1.6 * 0.6);
        kit.setLighting("day");
        for (const s of spots) expect(s.intensity).toBe(0);
        kit.setLighting("night");
        kit.setLighting("house");
        for (const s of spots) expect(s.intensity).toBeGreaterThan(0);
        kit.dispose();
    });

    it("builds for an off-center footprint, placed relative to it", () => {
        const kit = build(builder, SMALL);
        expect(kit.focus).toEqual([4, 0, -15]);
        finiteEverywhere(kit.root);
        const boxes = solids(kit.root);
        for (const c of kit.cameras) {
            expect(insideAny(c.position, boxes), c.id).toBe(false);
        }
        if (expected.stands) {
            // the front stand starts in front of the front sideline
            const front = kit.seatRows.find((r) => r.side === "home")!;
            expect(Math.min(...front.points.map((p) => p[2]))).toBeGreaterThan(
                0,
            );
            const back = kit.seatRows.find((r) => r.side === "away")!;
            expect(Math.max(...back.points.map((p) => p[2]))).toBeLessThan(-30);
        }
        kit.dispose();
    });

    it("halves the crowd and drops shadows at low quality", () => {
        const high = build(builder);
        const low = build(builder, FOOTBALL, "low");
        low.root.traverse((o) => expect(o.castShadow).toBe(false));
        if (expected.stands) {
            const h = high.root.userData.crowd.count;
            const l = low.root.userData.crowd.count;
            expect(l).toBeLessThan(h * 0.65);
        }
        high.dispose();
        low.dispose();
    });

    it("disposes everything it created", () => {
        const kit: KitResult = build(builder);
        const disposed = new Set<unknown>();
        const watch = (item: BufferGeometry | Material) =>
            item.addEventListener("dispose", () => disposed.add(item));
        const watched: (BufferGeometry | Material)[] = [];
        kit.root.traverse((o) => {
            if (!(o instanceof Mesh || o instanceof LineSegments)) return;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const item of [o.geometry as BufferGeometry, ...mats]) {
                if (!watched.includes(item)) {
                    watched.push(item);
                    watch(item);
                }
            }
        });
        kit.dispose();
        for (const item of watched) expect(disposed.has(item)).toBe(true);
    });
});

describe("stand kit proportions (meters)", () => {
    const rowCount = (kit: KitResult, side: string) =>
        kit.seatRows.filter((r) => r.side === side).length;
    const length = (kit: KitResult, side: string) => {
        const row = kit.seatRows.find((r) => r.side === side)!;
        return Math.hypot(
            row.points[1][0] - row.points[0][0],
            row.points[1][2] - row.points[0][2],
        );
    };

    it("hs: 28 and 14 rows, 79 m and 61 m stands, 15.8 m gap", () => {
        const kit = build(buildHs);
        expect(rowCount(kit, "home")).toBe(28);
        expect(rowCount(kit, "away")).toBe(14);
        expect(length(kit, "home")).toBeCloseTo(79.25, 1);
        expect(length(kit, "away")).toBeCloseTo(60.96, 1);
        const first = kit.seatRows.find((r) => r.side === "home")!;
        expect(first.depth).toBeCloseTo(0.79, 2);
        // the first tread's seat line is 15.8 m + 0.42 tread in front of the sideline
        expect(first.points[0][2]).toBeCloseTo(15.85 + 0.33, 0);
        expect(first.points[0][1]).toBeCloseTo(1.22, 1);
        kit.dispose();
    });

    it("bighs: 44 and 30 rows, 104 m and 91 m stands", () => {
        const kit = build(buildBighs);
        expect(rowCount(kit, "home")).toBe(44);
        expect(rowCount(kit, "away")).toBe(30);
        expect(length(kit, "home")).toBeCloseTo(103.6, 0);
        expect(length(kit, "away")).toBeCloseTo(91.4, 0);
        kit.dispose();
    });

    it("college: 50 rows each side, 34 on each end, 122 m long", () => {
        const kit = build(buildCollege);
        expect(rowCount(kit, "home")).toBe(50);
        expect(rowCount(kit, "away")).toBe(50);
        expect(rowCount(kit, "neutral")).toBe(68);
        expect(length(kit, "home")).toBeCloseTo(121.9, 0);
        const track = kit.root.getObjectByName("track");
        expect(track).toBeUndefined();
        kit.dispose();
    });

    it("hs and bighs have a track; college and blank do not", () => {
        expect(build(buildHs).root.getObjectByName("track")).toBeDefined();
        expect(build(buildBighs).root.getObjectByName("track")).toBeDefined();
        expect(build(buildBlank).root.getObjectByName("track")).toBeUndefined();
    });
});

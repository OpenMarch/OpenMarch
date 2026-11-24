import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
    Box3,
    InstancedMesh,
    Mesh,
    MeshStandardMaterial,
    Vector3,
    type Object3D,
} from "three";
import type { FieldFootprint, VenueParams } from "../../types";
import {
    createSharedMaterials,
    ft,
    setTexturePainting,
} from "../../environment";
import {
    buildDieselFacade,
    dieselFacadeLayout,
    dieselFacadeLighting,
} from "../markDiesel/facade";
import {
    DIESEL_FACADE_BAND_HEIGHT,
    DIESEL_FACADE_BANDS,
} from "../markDiesel/facadeTextures";
import {
    dieselFrame,
    type DieselCtx,
    type DieselPart,
} from "../markDiesel/frame";
import {
    buildDieselSite,
    DIESEL_PLAZA_DEPTH,
    dieselTreeSpots,
} from "../markDiesel/site";

beforeAll(() => setTexturePainting(false));

const football: FieldFootprint = {
    minX: -ft(180),
    maxX: ft(180),
    minZ: -ft(160),
    maxZ: 0,
};
const params: VenueParams = {
    homeColor: "#6442ff",
    awayColor: "#c23b3b",
    endZoneText: "",
    endZoneColor: "#1f2a5c",
};

const shared = createSharedMaterials();
const context = (quality: "low" | "high"): DieselCtx => ({
    footprint: football,
    params,
    quality,
    shared,
    frame: dieselFrame(football),
});
const parts: DieselPart[] = [];
const build = (
    builder: (ctx: DieselCtx) => DieselPart,
    quality: "low" | "high" = "high",
) => {
    const part = builder(context(quality));
    parts.push(part);
    part.object.updateMatrixWorld(true);
    return part;
};
afterEach(() => parts.splice(0).forEach((p) => p.dispose()));

const meshes = (root: Object3D) => {
    const out: Mesh[] = [];
    root.traverse((o) => {
        if (o instanceof Mesh) out.push(o);
    });
    return out;
};
const named = (root: Object3D, name: string) => {
    const mesh = meshes(root).find((m) => m.name === name);
    if (!mesh) throw new Error(`no mesh named ${name}`);
    return mesh;
};
const material = (root: Object3D, name: string) =>
    named(root, name).material as MeshStandardMaterial;
/** Each triangle of a mesh as three points. */
const triangles = (mesh: Mesh) => {
    const p = mesh.geometry.getAttribute("position");
    const out: Vector3[][] = [];
    for (let i = 0; i < p.count; i += 3)
        out.push(
            [0, 1, 2].map((k) => new Vector3().fromBufferAttribute(p, i + k)),
        );
    return out;
};
const triangleCount = (root: Object3D) =>
    meshes(root).reduce(
        (n, m) =>
            n +
            (m.geometry.getAttribute("position").count / 3) *
                (m instanceof InstancedMesh ? m.count : 1),
        0,
    );

const frame = dieselFrame(football);
const { BUILDING, WINDOW_WALL } = frame;
const layout = dieselFacadeLayout(frame);

describe("facade atlas", () => {
    it("has bands that don't overlap and stay inside the texture", () => {
        const ranges = Object.values(DIESEL_FACADE_BANDS).sort(
            (a, b) => a[0] - b[0],
        );
        ranges.forEach(([v0, v1], i) => {
            expect(v0).toBeGreaterThanOrEqual(0);
            expect(v1).toBeLessThanOrEqual(1);
            expect(v1).toBeGreaterThan(v0);
            if (i > 0) expect(v0).toBeGreaterThan(ranges[i - 1][1]);
        });
    });
});

describe("dieselFacadeLayout", () => {
    it("stacks the wall from the ground to the eaves without gaps", () => {
        expect(layout.stack[0].y0).toBe(0);
        layout.stack.forEach((seg, i) => {
            if (i > 0) expect(seg.y0).toBeCloseTo(layout.stack[i - 1].y1, 6);
            // No strip is stretched past what its band was painted for.
            expect(seg.y1 - seg.y0).toBeLessThanOrEqual(
                DIESEL_FACADE_BAND_HEIGHT[seg.band] + 1e-6,
            );
        });
        expect(layout.stack.at(-1)?.y1).toBeCloseTo(BUILDING.eaveY, 6);
    });

    it("keeps the end windows under the gable and the towers under the eaves", () => {
        const edge = layout.window.halfWidth + layout.window.frame;
        expect(BUILDING.roofY(edge)).toBeGreaterThan(layout.window.top + 2.2);
        expect(layout.tower.top).toBeLessThan(BUILDING.eaveY);
    });
});

describe.each(["low", "high"] as const)("buildDieselFacade (%s)", (quality) => {
    it("draws in a few calls and never casts a shadow", () => {
        const { object } = build(buildDieselFacade, quality);
        const all = meshes(object);
        expect(all.length).toBeLessThanOrEqual(8);
        expect(all.length).toBeGreaterThanOrEqual(6);
        expect(new Set(all.map((m) => m.material)).size).toBeLessThanOrEqual(7);
        for (const m of all) expect(m.castShadow).toBe(false);
        expect(triangleCount(object)).toBeLessThan(
            quality === "high" ? 6000 : 600,
        );
    });

    it("fills the envelope from the ground to the ridge and no higher", () => {
        const { object } = build(buildDieselFacade, quality);
        const wall = named(object, "diesel.facade.wall");
        const box = new Box3().setFromObject(wall);
        expect(box.min.x).toBeCloseTo(-BUILDING.halfX, 4);
        expect(box.max.x).toBeCloseTo(BUILDING.halfX, 4);
        expect(box.min.z).toBeCloseTo(-BUILDING.halfZ, 4);
        expect(box.max.z).toBeCloseTo(BUILDING.halfZ, 4);
        expect(box.min.y).toBe(0);
        expect(box.max.y).toBeCloseTo(BUILDING.ridgeY, 4);
        for (const tri of triangles(wall))
            for (const p of tri)
                expect(p.y).toBeLessThanOrEqual(BUILDING.roofY(p.z) + 1e-4);
    });

    it("reaches the roof all along the gables and the eaves", () => {
        const { object } = build(buildDieselFacade, quality);
        const wall = named(object, "diesel.facade.wall");
        // The highest wall point in each 4 m slice of both end walls.
        for (const x of [-BUILDING.halfX, BUILDING.halfX]) {
            const tops = new Map<number, number>();
            for (const tri of triangles(wall))
                for (const p of tri) {
                    if (Math.abs(p.x - x) > 1e-4) continue;
                    const key = Math.round(p.z * 1000);
                    tops.set(key, Math.max(tops.get(key) ?? 0, p.y));
                }
            expect(tops.size).toBeGreaterThan(6);
            for (const [key, top] of tops)
                expect(top).toBeCloseTo(BUILDING.roofY(key / 1000), 3);
        }
        const eave = triangles(wall)
            .flat()
            .filter((p) => Math.abs(p.z - BUILDING.halfZ) < 1e-4);
        expect(Math.max(...eave.map((p) => p.y))).toBeCloseTo(
            BUILDING.eaveY,
            4,
        );
    });

    it("leaves the end windows open in the wall and glazes them", () => {
        const { object } = build(buildDieselFacade, quality);
        const wall = named(object, "diesel.facade.wall");
        const inWindow = (p: Vector3) =>
            Math.abs(Math.abs(p.x) - BUILDING.halfX) < 1e-4 &&
            Math.abs(p.z - WINDOW_WALL.centerZ) <
                WINDOW_WALL.width / 2 - 0.01 &&
            p.y > WINDOW_WALL.bottom + 0.01 &&
            p.y < WINDOW_WALL.top - 0.01;
        for (const tri of triangles(wall)) {
            const mid = tri
                .reduce((a, p) => a.add(p), new Vector3())
                .multiplyScalar(1 / 3);
            expect(inWindow(mid)).toBe(false);
        }
        for (const name of [
            "diesel.windowWall.outside",
            "diesel.windowWall.inside",
        ]) {
            const box = new Box3().setFromObject(named(object, name));
            expect(box.min.y).toBeCloseTo(WINDOW_WALL.bottom, 4);
            expect(box.max.y).toBeCloseTo(WINDOW_WALL.top, 4);
            expect(box.min.z).toBeCloseTo(-WINDOW_WALL.width / 2, 4);
            expect(box.max.z).toBeCloseTo(WINDOW_WALL.width / 2, 4);
            // The north wall is at the frame's WINDOW_WALL.x.
            expect(box.min.x).toBeCloseTo(WINDOW_WALL.x, 0);
        }
    });

    it("faces the glass outward outside and toward the field inside", () => {
        const { object } = build(buildDieselFacade, quality);
        const facing = (name: string) => {
            const mesh = named(object, name);
            const p = mesh.geometry.getAttribute("position");
            const n = mesh.geometry.getAttribute("normal");
            for (let i = 0; i < p.count; i++) {
                // +1 when the normal points away from the field center.
                expect(Math.sign(p.getX(i)) * n.getX(i)).toBeCloseTo(
                    name.endsWith("outside") ? 1 : -1,
                    5,
                );
            }
        };
        facing("diesel.windowWall.outside");
        facing("diesel.windowWall.inside");
    });

    it("faces every wall outward", () => {
        const { object } = build(buildDieselFacade, quality);
        const wall = named(object, "diesel.facade.wall");
        const p = wall.geometry.getAttribute("position");
        const n = wall.geometry.getAttribute("normal");
        for (let i = 0; i < p.count; i++) {
            const out = p.getX(i) * n.getX(i) + p.getZ(i) * n.getZ(i);
            expect(out).toBeGreaterThan(0);
            expect(Math.abs(n.getY(i))).toBeLessThan(1e-6);
        }
    });

    it("closes the inside of the wall with a dark, seamless face", () => {
        const { object } = build(buildDieselFacade, quality);
        const inside = named(object, "diesel.facade.interior");
        const mat = inside.material as MeshStandardMaterial;
        expect(mat.color.getHSL({ h: 0, s: 0, l: 0 }).l).toBeLessThan(0.12);
        const box = new Box3().setFromObject(inside);
        expect(box.min.x).toBeCloseTo(-BUILDING.halfX, 4);
        expect(box.max.x).toBeCloseTo(BUILDING.halfX, 4);
        expect(box.max.z).toBeCloseTo(BUILDING.halfZ, 4);
        expect(box.min.y).toBe(0);
        expect(box.max.y).toBeCloseTo(BUILDING.ridgeY, 4);
        // Every edge is shared by exactly two triangles, except round the
        // two windows (4 edges each) and along the ground and the roof.
        const edges = new Map<string, number>();
        const key = (p: Vector3) =>
            [p.x, p.y, p.z].map((n) => n.toFixed(4)).join(",");
        const faces = triangles(inside);
        for (const tri of faces)
            for (let i = 0; i < 3; i++) {
                const e = [key(tri[i]), key(tri[(i + 1) % 3])].sort().join("|");
                edges.set(e, (edges.get(e) ?? 0) + 1);
            }
        const open = [...edges.entries()].filter(([, n]) => n !== 2);
        for (const [edge, n] of open) {
            expect(n).toBe(1);
            const [p, q] = edge
                .split("|")
                .map((k) => new Vector3(...k.split(",").map(Number)));
            const onGround = p.y === 0 && q.y === 0;
            const onRoof =
                Math.abs(p.y - BUILDING.roofY(p.z)) < 1e-3 &&
                Math.abs(q.y - BUILDING.roofY(q.z)) < 1e-3;
            const onWindow =
                [p, q].every(
                    (v) =>
                        Math.abs(Math.abs(v.x) - BUILDING.halfX) < 1e-3 &&
                        Math.abs(Math.abs(v.z) - WINDOW_WALL.width / 2) < 1e-3,
                ) ||
                [p, q].every(
                    (v) =>
                        Math.abs(v.y - WINDOW_WALL.bottom) < 1e-3 ||
                        Math.abs(v.y - WINDOW_WALL.top) < 1e-3,
                );
            expect(onGround || onRoof || onWindow).toBe(true);
        }
        // And nothing covers the glass.
        for (const tri of faces) {
            const mid = tri
                .reduce((a, p) => a.add(p), new Vector3())
                .multiplyScalar(1 / 3);
            const covers =
                Math.abs(Math.abs(mid.x) - BUILDING.halfX) < 1e-4 &&
                Math.abs(mid.z) < WINDOW_WALL.width / 2 - 0.01 &&
                mid.y > WINDOW_WALL.bottom + 0.01 &&
                mid.y < WINDOW_WALL.top - 0.01;
            expect(covers).toBe(false);
        }
    });
});

describe("corner towers", () => {
    it("stand outside the envelope at all four corners", () => {
        const { object } = build(buildDieselFacade);
        const brick = named(object, "diesel.facade.brick");
        const reach = { x: BUILDING.halfX, z: BUILDING.halfZ };
        const corners = new Set<string>();
        for (const tri of triangles(brick))
            for (const p of tri) {
                // Nothing of the towers or piers is inside the building.
                const inside =
                    Math.abs(p.x) < reach.x - 1e-4 &&
                    Math.abs(p.z) < reach.z - 1e-4;
                expect(inside).toBe(false);
                if (
                    Math.abs(p.x) > reach.x + layout.tower.proud - 0.01 &&
                    Math.abs(p.z) > reach.z + layout.tower.proud - 0.01
                )
                    corners.add(`${Math.sign(p.x)},${Math.sign(p.z)}`);
            }
        expect(corners.size).toBe(4);
    });
});

describe("lighting", () => {
    it("reads each preset the kit offers", () => {
        const closed = dieselFacadeLighting("roofClosed");
        const day = dieselFacadeLighting("day");
        const night = dieselFacadeLighting("night");
        // Roof shut, at night: dark glass from inside, a lit building outside.
        expect(closed.insideView).toBe("night");
        expect(closed.insideGlow).toBeLessThan(0.5);
        expect(closed.wallGlow).toBeGreaterThan(0.3);
        expect(closed.glassOutside).toBeGreaterThan(1);
        // Day: the windows glow with the sky; nothing is lit outside.
        expect(day.insideView).toBe("day");
        expect(day.insideGlow).toBeGreaterThan(1);
        expect(day.wallGlow).toBe(0);
        expect(day.trimGlow).toBe(0);
        expect(day.glassOutside).toBe(0);
        expect(day.entriesLit).toBe(false);
        // Night, roof open: as lit outside, and the town shows brighter.
        expect(night.insideView).toBe("night");
        expect(night.insideGlow).toBeGreaterThan(closed.insideGlow);
        expect(night.wallGlow).toBeGreaterThan(0.3);
        expect(night.glassOutside).toBeGreaterThan(1);
        expect(night.entriesLit).toBe(true);
    });

    it("applies them to the materials", () => {
        const part = build(buildDieselFacade);
        const wall = material(part.object, "diesel.facade.wall");
        const glassIn = material(part.object, "diesel.windowWall.inside");
        const glassOut = material(part.object, "diesel.windowWall.outside");
        const lit = named(part.object, "diesel.facade.lit");

        part.setLighting("day");
        const dayView = glassIn.emissiveMap;
        expect(glassIn.emissiveIntensity).toBeGreaterThan(1);
        expect(wall.emissiveIntensity).toBe(0);
        expect(glassOut.emissiveIntensity).toBe(0);
        expect(lit.visible).toBe(false);

        part.setLighting("roofClosed");
        expect(glassIn.emissiveMap).not.toBe(dayView);
        expect(glassIn.emissiveIntensity).toBeLessThan(0.5);
        expect(wall.emissiveIntensity).toBeGreaterThan(0.3);
        expect(lit.visible).toBe(true);

        part.setLighting("night");
        expect(wall.emissiveIntensity).toBeGreaterThan(0.3);
        expect(glassOut.emissiveIntensity).toBeGreaterThan(1);
        expect(lit.visible).toBe(true);

        part.setLighting("day");
        expect(glassIn.emissiveMap).toBe(dayView);
    });
});

describe("buildDieselSite", () => {
    it("lays the ground below the field and the plan above the land", () => {
        const { object } = build(buildDieselSite);
        const ground = new Box3().setFromObject(named(object, "diesel.ground"));
        expect(ground.max.y).toBeLessThan(0);
        expect(ground.max.x).toBeGreaterThan(1000);
        const plan = new Box3().setFromObject(
            named(object, "diesel.site.plan"),
        );
        expect(plan.min.y).toBeGreaterThanOrEqual(0.02 - 1e-6);
        expect(plan.max.y).toBeLessThan(0.05);
        expect(plan.max.x).toBeGreaterThan(
            BUILDING.halfX + DIESEL_PLAZA_DEPTH + 40,
        );
        for (const m of meshes(object)) expect(m.castShadow).toBe(false);
    });

    it("keeps low quality to one plain mesh", () => {
        const { object } = build(buildDieselSite, "low");
        const all = meshes(object);
        expect(all.map((m) => m.name)).toEqual(["diesel.ground"]);
        expect((all[0].material as MeshStandardMaterial).map).toBeNull();
    });

    it("plants trees outside the building and clear of the avenues", () => {
        const spots = dieselTreeSpots(BUILDING.halfX, BUILDING.halfZ);
        expect(spots.length).toBeGreaterThan(40);
        for (const [x, z] of spots) {
            const outside =
                Math.abs(x) > BUILDING.halfX + 10 ||
                Math.abs(z) > BUILDING.halfZ + 10;
            expect(outside).toBe(true);
            expect(Math.abs(x) >= 15 || Math.abs(z) >= 15).toBe(true);
        }
    });

    it("lights the plaza only when it is dark out", () => {
        const part = build(buildDieselSite);
        const plan = material(part.object, "diesel.site.plan");
        // Finals run at night: it is dark outside under the shut roof too.
        part.setLighting("night");
        expect(plan.emissiveIntensity).toBe(1);
        part.setLighting("roofClosed");
        expect(plan.emissiveIntensity).toBe(1);
        part.setLighting("day");
        expect(plan.emissiveIntensity).toBe(0);
    });
});

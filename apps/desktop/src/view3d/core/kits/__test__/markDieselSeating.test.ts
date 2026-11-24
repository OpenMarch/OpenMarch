// cspell:ignore Raycaster tarped concourse
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
    Box3,
    Color,
    InstancedMesh,
    Matrix4,
    Mesh,
    MeshStandardMaterial,
    Quaternion,
    Raycaster,
    Vector3,
    type Object3D,
    type Vector3Tuple,
} from "three";
import type { FieldFootprint, KitResult, VenueParams } from "../../types";
import {
    buildCrowd,
    crowdBlockGeometry,
    crowdCardGeometry,
    crowdPersonGeometry,
    CROWD_FOLLOW_STEP,
    CROWD_NEAR,
    PERSON_SPACING,
    setTexturePainting,
    STANDING_LIFT,
    type Crowd,
} from "../../environment";
import { outlineOffset } from "../bowl";
import { buildMarkDiesel } from "../markDiesel";
import { RING_PARTS } from "../bowl";
import {
    dieselRings,
    dieselTunnelAxis,
    DIESEL_DIRECTORS,
    DIESEL_PLATFORM,
    DIESEL_SEAT_CLEAR,
    DIESEL_SEAT_HOUSE,
    DIESEL_SEAT_PITCH,
    dieselCrowdFill,
    dieselSectionNumber,
    dieselSpill,
} from "../markDiesel/bowl";
import { dieselFrame } from "../markDiesel/frame";

beforeAll(() => setTexturePainting(false));

const football: FieldFootprint = {
    minX: -54.864,
    maxX: 54.864,
    minZ: -48.768,
    maxZ: 0,
};
const params: VenueParams = {
    homeColor: "#6442ff",
    awayColor: "#c23b3b",
    endZoneText: "",
    endZoneColor: "#1f2a5c",
};
const f = dieselFrame(football);
const { BOWL } = f;
const straight = BOWL.halfX - BOWL.outline.cornerRadius;

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));

const build = (quality: "low" | "high" = "high") => {
    const kit = buildMarkDiesel({ footprint: football, params, quality });
    cleanup.push(() => kit.dispose());
    kit.root.updateMatrixWorld(true);
    return kit;
};
/** The crowd as the scene builds it: the kit's density and its own options. */
const crowdOf = (kit: KitResult, quality: "low" | "high" = "high") => {
    const crowd = buildCrowd(kit.seatRows, {
        density: kit.crowdDensity,
        quality,
        ...kit.crowd,
    });
    cleanup.push(() => crowd.dispose());
    kit.root.add(crowd.object);
    kit.root.updateMatrixWorld(true);
    return crowd;
};
/** A kit camera's eye (scene space, which is the crowd's). */
const eyeOf = (kit: KitResult, id: string): Vector3Tuple =>
    kit.cameras.find((c) => c.id === id)!.position;
/** Triangles in one instance of `mesh`. */
const trianglesOf = (mesh: InstancedMesh) =>
    mesh.geometry.getAttribute("position").count / 3;
/**
 * The cards' uniforms, as the shader gets them: where the full figures are
 * drawn instead, and the cleared seats.
 */
const cardUniforms = (crowd: Crowd) => {
    const shader = {
        uniforms: {} as Record<string, { value: unknown }>,
        vertexShader: "",
        fragmentShader: "",
    };
    (crowd.mesh.material as MeshStandardMaterial).onBeforeCompile(
        shader as never,
        undefined as never,
    );
    const u = shader.uniforms;
    return {
        near: u.uCrowdNear.value as Vector3,
        nearR2: u.uCrowdNearR2.value as number,
        clear: u.uCrowdClear.value as Vector3,
        clearR2: u.uCrowdClearR2.value as number,
    };
};
const positionsOf = (mesh: InstancedMesh): Vector3[] => {
    const m = new Matrix4();
    return Array.from({ length: mesh.count }, (_, i) => {
        mesh.getMatrixAt(i, m);
        return new Vector3().setFromMatrixPosition(m);
    });
};
const named = (root: Object3D, name: string) => {
    const hit = root.getObjectByName(name);
    if (!(hit instanceof Mesh)) throw new Error(`no mesh ${name}`);
    return hit;
};
/** Where everyone sits, in kit-root space (the field center is the origin). */
const people = (crowd: Crowd): Vector3[] => {
    const m = new Matrix4();
    return Array.from({ length: crowd.count }, (_, i) => {
        crowd.mesh.getMatrixAt(i, m);
        return new Vector3()
            .setFromMatrixPosition(m)
            .sub(new Vector3(f.CENTER.x, 0, f.CENTER.z));
    });
};
const offsetOf = (p: Vector3) => outlineOffset(BOWL.outline, p.x, p.z);

describe("Mark Diesel seats", () => {
    it("draws seats as rows of geometry, cut at the aisles, on every open tier", () => {
        const kit = build();
        const seats = named(kit.root, "markDiesel.seats");
        const pos = seats.geometry.getAttribute("position");
        const uv = seats.geometry.getAttribute("uv");
        // Two quads a seat run: the back and the folded pan.
        expect(pos.count % 12).toBe(0);
        expect(pos.count / 3).toBeGreaterThan(15000);
        const box = new Box3().setFromBufferAttribute(pos as never);
        expect(box.min.y).toBeGreaterThan(BOWL.lower.base);
        // The highest seats are the south 600s' last row.
        expect(box.max.y).toBeCloseTo(BOWL.upperSouth.top + 0.88, 2);
        // A whole number of seats along every run, one texture tile each.
        let maxU = 0;
        for (let i = 0; i < uv.count; i++) {
            maxU = Math.max(maxU, uv.getX(i));
            expect(
                uv.getY(i) === 0 || uv.getY(i) === 0.5 || uv.getY(i) === 1,
            ).toBe(true);
        }
        expect(maxU).toBeGreaterThan(15);
        // The longest runs: the south end's front rows, which carry on round
        // the wall's squared corners.
        expect(maxU).toBeLessThan(70);
        // No seats on the draped sideline: it is tarped, or behind the hangs.
        for (let i = 0; i < pos.count; i++)
            if (Math.abs(pos.getX(i)) < straight)
                expect(pos.getZ(i)).toBeGreaterThan(-BOWL.halfZ);
    });

    it("bakes the field's light into the stands: bright at the wall, dark up top", () => {
        const spill = dieselSpill(f);
        const { lower, loge, club, upper } = BOWL;
        const front = spill(0.4, lower.base);
        const back = spill(lower.back - 0.4, lower.top);
        expect(front).toBeGreaterThan(0.7);
        expect(back).toBeLessThan(front * 0.7);
        // Under the overhangs and on the upper deck: a fraction of that.
        expect(spill(loge.offset + 1, loge.base)).toBeLessThan(back);
        expect(spill(club.offset + 1, club.base)).toBeLessThan(back);
        expect(spill(upper.back - 1, upper.top)).toBeLessThan(0.3);
        expect(spill(upper.back - 1, upper.top)).toBeGreaterThan(0.05);

        // The seats carry it as vertex color. Their only glow is the house
        // lights' fill, through their own texture, and it follows the
        // baked tint (`markDiesel.houseLit`).
        const kit = build();
        const seats = named(kit.root, "markDiesel.seats");
        const material = seats.material as MeshStandardMaterial;
        expect(material.vertexColors).toBe(true);
        expect(material.emissiveMap).toBe(material.map);
        expect(material.customProgramCacheKey()).toBe("markDiesel.houseLit");
        kit.setLighting("roofClosed");
        expect(material.emissiveIntensity).toBe(DIESEL_SEAT_HOUSE.lampsOn);
        const pos = seats.geometry.getAttribute("position");
        const color = seats.geometry.getAttribute("color");
        let low = { y: Infinity, c: 0 };
        let high = { y: -Infinity, c: 0 };
        for (let i = 0; i < pos.count; i++) {
            const y = pos.getY(i);
            if (y < low.y) low = { y, c: color.getX(i) };
            if (y > high.y) high = { y, c: color.getX(i) };
        }
        expect(low.c).toBeGreaterThan(high.c * 2.5);
    });

    it("has a wheelchair platform in front of the photo seat, with rails", () => {
        const kit = build();
        const { lower } = BOWL;
        const P = DIESEL_PLATFORM;
        // The 100s' last rows, at the cross-aisle's level.
        expect(P.lastRow).toBe(lower.rows - 1);
        const deck = BOWL.crossAisle;
        const treads = named(kit.root, "markDiesel.treads");
        const down = new Vector3(0, -1, 0);
        const heightAt = (x: number, row: number) => {
            const z = f.CENTER.z + BOWL.halfZ + (row + 0.5) * lower.depth;
            const hit = new Raycaster(
                new Vector3(f.CENTER.x + x, 30, z),
                down,
            ).intersectObject(treads)[0];
            return hit.point.y;
        };
        // On the 50 the deck is flat over its rows, level with the
        // cross-aisle behind it; a section away the rows step as usual.
        for (let row = P.firstRow; row <= P.lastRow; row++)
            expect(heightAt(0, row)).toBeCloseTo(deck, 3);
        const far = straight - 3;
        expect(heightAt(far, P.firstRow)).toBeCloseTo(
            lower.base + P.firstRow * lower.rise,
            3,
        );
        // No seats stand on the deck.
        const pos = named(kit.root, "markDiesel.seats").geometry.getAttribute(
            "position",
        );
        const d0 = lower.offset + P.firstRow * lower.depth;
        const d1 = d0 + (P.lastRow - P.firstRow + 1) * lower.depth;
        for (let i = 0; i < pos.count; i++) {
            const p = new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
            if (Math.abs(p.x) > 5 || p.z < 0 || p.y > lower.top + 2) continue;
            const d = offsetOf(p);
            expect(d < d0 + 0.3 || d > d1 + 0.3).toBe(true);
        }
    });

    it("opens the directors' platform over 139, behind the cross-aisle's glass", () => {
        const kit = build();
        const { loge, lower, crossAisle } = BOWL;
        const D = DIESEL_DIRECTORS;
        // The front straight holds seven sections, the 50's in the middle;
        // 139 starts where it ends, and the platform takes its north part.
        const north = straight / 7;
        const along = (m: number) => north + m;
        const x = along(D.opening.center);
        expect(dieselSectionNumber(f, x, BOWL.halfZ + 5, 1)).toBe(139);
        const treads = named(kit.root, "markDiesel.treads");
        const heightAt = (xl: number, d: number) => {
            const hit = new Raycaster(
                new Vector3(f.CENTER.x + xl, 40, f.CENTER.z + BOWL.halfZ + d),
                new Vector3(0, -1, 0),
            ).intersectObject(treads)[0];
            return hit.point.y;
        };
        // Level with the cross-aisle over the platform's rows, and over the
        // opening all the way back; the rows step as usual past its end.
        expect(heightAt(x, loge.offset + 1)).toBeCloseTo(crossAisle, 3);
        expect(heightAt(x, loge.offset + 6)).toBeCloseTo(crossAisle, 3);
        expect(
            heightAt(along(D.platform[1] + 2), loge.offset + 0.4),
        ).toBeCloseTo(loge.base, 3);
        // No seats on it.
        const pos = named(kit.root, "markDiesel.seats").geometry.getAttribute(
            "position",
        );
        for (let i = 0; i < pos.count; i++) {
            const p = new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
            // (The bowl's geometry is in kit-root space.)
            const d = offsetOf(p);
            const onDeck =
                p.x > along(D.platform[0]) + 0.2 &&
                p.x < along(D.platform[1]) - 0.2 &&
                d > loge.offset + 0.2 &&
                d < loge.offset + D.rows * loge.depth - 0.2 &&
                p.z > 0;
            expect(onDeck).toBe(false);
        }
        // Glass along the cross-aisle's edge in front of it: faint panes
        // on a mesh of their own.
        const glass = named(kit.root, "markDiesel.railGlass");
        const material = glass.material as MeshStandardMaterial;
        expect(material.transparent).toBe(true);
        expect(material.opacity).toBeLessThan(0.2);
        const gp = glass.geometry.getAttribute("position");
        let front = 0;
        for (let i = 0; i < gp.count; i++) {
            const p = new Vector3(gp.getX(i), gp.getY(i), gp.getZ(i));
            if (
                Math.abs(p.x - x) < 8 &&
                Math.abs(offsetOf(p) - lower.back) < 0.2 &&
                p.y > crossAisle
            )
                front++;
        }
        expect(front).toBeGreaterThan(0);
        // People stand on it.
        const crowd = crowdOf(kit);
        const look = crowd.mesh.geometry.getAttribute("aLook");
        const standing = people(crowd).filter(
            (p, i) =>
                look.getY(i) === 1 &&
                Math.abs(p.y - (crossAisle + 0.86)) < 0.05 &&
                p.x > along(D.platform[0]) &&
                p.x < along(D.platform[1]),
        );
        expect(standing.length).toBeGreaterThan(4);
    });

    it("opens the tunnels' mouths in the 200s instead of capping them dark", () => {
        const kit = build();
        const steel = named(kit.root, "markDiesel.structure") as InstancedMesh;
        steel.updateWorldMatrix(true, false);
        const m = new Matrix4();
        const p = new Vector3();
        const color = new Color();
        let dark = 0;
        for (let i = 0; i < steel.count; i++) {
            steel.getMatrixAt(i, m);
            p.setFromMatrixPosition(m).applyMatrix4(steel.matrixWorld);
            steel.getColorAt(i, color);
            // Black boxes on the open (front) side, at the cross-aisle.
            if (
                color.getHex() === 0x08090b &&
                p.z > f.CENTER.z + BOWL.halfZ &&
                p.y > BOWL.crossAisle &&
                p.y < BOWL.loge.base + 2
            )
                dark++;
        }
        expect(dark).toBe(0);
    });

    it("adds the concourse opening and section numbers", () => {
        const kit = build();
        // The north stand's open street-level concourse, between its tall
        // lower bank and the 400 deck under the window.
        // The same mesh shows the concourse through the back of each
        // tunnel's mouth, lower down, at the cross-aisle.
        const { northLower, northMid } = BOWL;
        const pos = named(kit.root, "markDiesel.concourse").geometry.attributes
            .position;
        const opening = new Box3();
        let tunnels = 0;
        for (let i = 0; i < pos.count; i++) {
            const p = new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
            if (p.y >= northLower.top - 1e-3) opening.expandByPoint(p);
            else if (Math.abs(p.y - BOWL.crossAisle) < 1e-3) tunnels++;
        }
        expect(tunnels).toBeGreaterThan(0);
        expect(opening.min.y).toBeCloseTo(northLower.top, 3);
        expect(opening.max.y).toBeCloseTo(northMid.bottom, 3);
        expect(opening.max.y - opening.min.y).toBeGreaterThan(2.2);
        expect(opening.max.x - f.CENTER.x).toBeLessThan(-BOWL.halfX);
        const numbers = named(kit.root, "markDiesel.sectionNumbers");
        // One for every open lower section, and the front sideline's club
        // and upper-deck sections.
        expect(
            numbers.geometry.getAttribute("position").count / 6,
        ).toBeGreaterThan(30);
    });
});

describe("Mark Diesel corner tunnels and field suites", () => {
    /** Kit-root space to the scene's. */
    const world = (x: number, y: number, z: number) =>
        new Vector3(x + f.CENTER.x, y, z + f.CENTER.z);
    /** The first hit straight down from `(x, top, z)` (kit-root space). */
    const down = (meshes: Mesh[], x: number, z: number, top = 30) =>
        new Raycaster(world(x, top, z), new Vector3(0, -1, 0)).intersectObjects(
            meshes,
            false,
        )[0];
    const CT = BOWL.cornerTunnels;
    const lidD = BOWL.lower.offset + CT.lidRow * BOWL.lower.depth;
    const { at } = dieselRings(f);
    /**
     * Each corner's tunnel: its centerline (from the wall's corner, out at
     * about 45 degrees), the ring point down its middle, and how far along
     * the line the lid starts.
     */
    const tunnels = [1, 3, 5, 7].map((k) => {
        const mid =
            RING_PARTS.slice(0, k).reduce((n, p) => n + p.segments, 0) +
            RING_PARTS[k].segments / 2;
        const { origin, axis } = dieselTunnelAxis(f, k);
        const lid = at(mid, lidD, 0).sub(origin).dot(axis);
        return { mid, origin, axis, lid };
    });

    it("opens a tunnel in each corner, with the rows that clear it as its lid", () => {
        const kit = build();
        // (Tarped treads, behind the drape, are in the concrete mesh.)
        const solid = [
            "markDiesel.treads",
            "markDiesel.fascias",
            "markDiesel.concrete",
        ].map((n) => named(kit.root, n));
        expect(lidD).toBeGreaterThan(12);
        // Tall enough for the bands' trucks, wide enough for two.
        expect(CT.height).toBeGreaterThanOrEqual(4.5);
        expect(CT.width).toBeGreaterThanOrEqual(6);
        expect(CT.width).toBeLessThanOrEqual(8);
        for (const { origin, axis, mid } of tunnels) {
            // Off the aisle down the middle (a ray along a seam can slip).
            const side = new Vector3(axis.z, 0, -axis.x).multiplyScalar(0.7);
            const onLine = (d: number) => at(mid, d, 0).add(side);
            // Down the notch: nothing over the floor until the lid.
            for (const d of [2, 6, lidD * 0.6, lidD - 0.5]) {
                const p = onLine(d);
                const hit = down(solid, p.x, p.z);
                expect(hit, `${origin.x} ${d}`).toBeDefined();
                expect(hit.point.y).toBeLessThan(0.1);
                expect(hit.object.name).toBe("markDiesel.fascias");
            }
            // Under the lid: its rows, over the tunnel's lit ceiling and
            // floor.
            const lid = onLine(lidD + 1.5);
            const top = down(solid, lid.x, lid.z);
            expect(
                `${top.object.name} ${top.point.y.toFixed(2)}`,
                `${origin.toArray()}`,
            ).toMatch(/^markDiesel.(treads|concrete) /);
            expect(top.point.y).toBeGreaterThan(CT.height);
            const ceiling = down(solid, lid.x, lid.z, top.point.y - 0.05);
            expect(ceiling.point.y).toBeCloseTo(CT.height, 1);
            const under = down(solid, lid.x, lid.z, CT.height - 0.1);
            expect(under.point.y).toBeLessThan(0.1);
        }
        // The concourse's light at each tunnel's back.
        expect(named(kit.root, "markDiesel.concourse")).toBeDefined();
    });

    it("keeps people on the treads round the tunnels and the suites", () => {
        const kit = build();
        const treads = named(kit.root, "markDiesel.treads");
        let checked = 0;
        for (const row of kit.seatRows) {
            const near = row.points.filter(([x, , z]) => {
                const p = new Vector3(x - f.CENTER.x, 0, z - f.CENTER.z);
                const byTunnel = tunnels.some(
                    ({ origin, lid }) => p.distanceTo(origin) < lid + 8,
                );
                const bySuites =
                    p.x > BOWL.wallX.south - 1 &&
                    Math.abs(p.z) < BOWL.fieldSuites.halfWidth + 4;
                return byTunnel || bySuites;
            });
            for (const [x, y, z] of near) {
                // Nobody inside a tunnel's notch, under its lid.
                const p = new Vector3(x - f.CENTER.x, y, z - f.CENTER.z);
                for (const { origin, axis, lid } of tunnels) {
                    const rel = p.clone().sub(origin).setY(0);
                    const along = rel.dot(axis);
                    const across = Math.abs(rel.x * axis.z - rel.z * axis.x);
                    // (Each row is cut at its front; its back edge leans
                    // out a little with the corner's rays.)
                    if (
                        along > 0 &&
                        along < lid - 0.5 &&
                        across < CT.width / 2 - 0.5
                    )
                        expect(y, `${p.toArray()}`).toBeGreaterThan(CT.height);
                }
                // A seat under every person: a tread just under the hips
                // (people standing on the suites' patio stand on its floor).
                const hit = new Raycaster(
                    new Vector3(x, y, z),
                    new Vector3(0, -1, 0),
                    0,
                    1,
                ).intersectObject(treads, false)[0];
                if (y > 1) {
                    expect(hit, `${p.toArray()}`).toBeDefined();
                    expect(hit.distance).toBeLessThan(0.6);
                }
                checked++;
            }
        }
        expect(checked).toBeGreaterThan(500);
    });

    it("puts the field suites across the south end, behind the wall", () => {
        const kit = build();
        const FS = BOWL.fieldSuites;
        expect(FS.count).toBe(8);
        // The south end's wall stands 10 m behind the end line; the north
        // end's 8.
        expect(BOWL.wallX.south - f.FIELD_HALF_LENGTH).toBeCloseTo(10);
        expect(-BOWL.wallX.north - f.FIELD_HALF_LENGTH).toBeCloseTo(8);
        // Their glass, at field level, a little behind the wall.
        const glass = named(kit.root, "markDiesel.suites").geometry;
        const pos = glass.getAttribute("position");
        let front = 0;
        // (The geometry is in kit-root space.)
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const z = pos.getZ(i);
            if (pos.getY(i) > 3.5) continue;
            front++;
            expect(x).toBeGreaterThan(BOWL.wallX.south + 0.5);
            expect(x).toBeLessThan(BOWL.wallX.south + 3);
            expect(Math.abs(z)).toBeLessThan(FS.halfWidth + 0.01);
            expect(pos.getY(i)).toBeGreaterThanOrEqual(FS.floor);
            expect(pos.getY(i)).toBeLessThanOrEqual(FS.ceiling + 1e-6);
        }
        expect(front).toBeGreaterThan(6);
        // Over them, the suites' roof, then the rows behind rising from it.
        const solid = ["markDiesel.treads", "markDiesel.fascias"].map((n) =>
            named(kit.root, n),
        );
        const roof = down(solid, BOWL.wallX.south + 4, 0);
        expect(roof.point.y).toBeGreaterThan(FS.ceiling);
        expect(roof.point.y).toBeLessThan(FS.ceiling + 0.5);
        const rows = down(solid, BOWL.wallX.south + 12, 0);
        expect(rows.object.name).toBe("markDiesel.treads");
        expect(rows.point.y).toBeGreaterThan(roof.point.y);
        // Outside the suites the 100s still run down to the wall.
        const beside = down(solid, BOWL.wallX.south + 1.5, FS.halfWidth + 6);
        expect(beside.object.name).toBe("markDiesel.treads");
        expect(beside.point.y).toBeLessThan(2);
        // A few people out on the patio in front of the glass.
        const patio = kit.seatRows.filter(
            (row) =>
                row.standing !== undefined &&
                row.points.every(
                    ([x, y]) =>
                        x - f.CENTER.x > BOWL.wallX.south &&
                        x - f.CENTER.x < BOWL.wallX.south + FS.glass &&
                        y < 1,
                ),
        );
        expect(patio.length).toBeGreaterThan(0);
    });
});

describe("Mark Diesel section numbers", () => {
    it("counts 1 to 53 clockwise from the north end, as the building does", () => {
        const { halfX, halfZ } = BOWL;
        const n = (x: number, z: number, level = 1) =>
            dieselSectionNumber(f, x, z, level);
        // The 50: 140 on the west (+Z) sideline, 113 on the east.
        expect(n(0, halfZ + 5)).toBe(140);
        expect(n(0, -halfZ - 5)).toBe(113);
        // South (+X) of the 50 the west numbers fall: 139 is the next one.
        expect(n(12.5, halfZ + 5)).toBe(139);
        expect(n(-12.5, halfZ + 5)).toBe(141);
        expect(n(12.5, -halfZ - 5)).toBe(114);
        // The south end runs 124 to 129, the north end through 153 to 101.
        expect(n(halfX + 5, 0)).toBeGreaterThanOrEqual(126);
        expect(n(halfX + 5, 0)).toBeLessThanOrEqual(127);
        expect([153, 101]).toContain(n(-halfX - 5, 0));
        // Every level shares the count.
        expect(n(0, halfZ + 40, 4)).toBe(440);
        expect(n(0, halfZ + 45, 6)).toBe(640);
        // Clockwise seen from above: west sideline north to south counts
        // down, east sideline north to south counts up.
        expect(n(-30, halfZ + 5)).toBeGreaterThan(n(30, halfZ + 5));
        expect(n(-30, -halfZ - 5)).toBeLessThan(n(30, -halfZ - 5));
    });
});

describe("Mark Diesel crowd", () => {
    it.each(["high", "low"] as const)(
        "keeps everyone on their tread and behind the field wall (%s)",
        (quality) => {
            const kit = build(quality);
            const crowd = crowdOf(kit, quality);
            const treads = named(kit.root, "markDiesel.treads");
            // The field wall's face, as a closed line round the field.
            const wall = dieselRings(f).ring(0, 0);
            const n = wall.length;
            /** Meters behind the wall's face (negative: on the field side). */
            const behindWall = (x: number, z: number) => {
                let best = Infinity;
                let side = 0;
                for (let i = 0; i < n; i++) {
                    const a = wall[i];
                    const b = wall[(i + 1) % n];
                    const ex = b.x - a.x;
                    const ez = b.z - a.z;
                    const t = Math.min(
                        1,
                        Math.max(
                            0,
                            ((x - a.x) * ex + (z - a.z) * ez) /
                                (ex * ex + ez * ez),
                        ),
                    );
                    const d = Math.hypot(x - a.x - ex * t, z - a.z - ez * t);
                    if (d < best) {
                        best = d;
                        side = Math.sign(ex * (z - a.z) - ez * (x - a.x));
                    }
                }
                return best * side;
            };
            const outward = Math.sign(behindWall(0, BOWL.halfZ + 100));

            // The full figure, and the card's foot: both keep the seat's
            // size whatever the person's build (the shaders divide the
            // instance's scale back out below the hips).
            const figure = crowdPersonGeometry(quality);
            cleanup.push(() => figure.dispose());
            const at = figure.getAttribute("position");
            const part = figure.getAttribute("aPart");
            const cardReach = Math.max(
                ...Array.from(
                    crowdCardGeometry().getAttribute("position").array,
                ).filter((_, k) => k % 3 === 0),
            );
            const look = crowd.mesh.geometry.getAttribute("aLook");
            const m = new Matrix4();
            const fit = new Matrix4();
            const seat = new Vector3();
            const turn = new Quaternion();
            const size = new Vector3();
            const v = new Vector3();
            const one = new Vector3(1, 1, 1);
            let nearWall = 0;
            let onTread = 0;
            for (let i = 0; i < crowd.count; i++) {
                crowd.mesh.getMatrixAt(i, m);
                m.decompose(seat, turn, size);
                fit.compose(seat, turn, one);
                const standing = look.getY(i) === 1;
                // Each kit seat is 0.41 m over its tread (the hips).
                let tread = seat.y - 0.41 - (standing ? STANDING_LIFT : 0);
                if (seat.y < 4) {
                    const hit = new Raycaster(
                        seat,
                        new Vector3(0, -1, 0),
                        0,
                        2,
                    ).intersectObject(treads, false)[0];
                    if (hit) {
                        tread = hit.point.y;
                        onTread++;
                    }
                }
                const hips =
                    outward *
                    behindWall(seat.x - f.CENTER.x, seat.z - f.CENTER.z);
                if (hips > 2) {
                    // Far from the wall: only the feet.
                    for (let k = 0; k < at.count; k++) {
                        const p = part.getX(k);
                        if (p !== (standing ? 3 : 2)) continue;
                        v.fromBufferAttribute(at, k).applyMatrix4(fit);
                        expect(v.y).toBeGreaterThan(tread - 1e-3);
                    }
                    continue;
                }
                nearWall++;
                const where = `person ${i} at ${seat.toArray().map((c) => c.toFixed(2))}`;
                // A card turned side on reaches its knees out this far.
                expect(hips, where).toBeGreaterThanOrEqual(cardReach);
                for (let k = 0; k < at.count; k++) {
                    const p = part.getX(k);
                    // Seated people have no legs, standing people no lap.
                    if (p === (standing ? 2 : 3)) continue;
                    const lower = p === 2 || p === 3;
                    v.fromBufferAttribute(at, k).applyMatrix4(lower ? fit : m);
                    const behind =
                        outward *
                        behindWall(v.x - f.CENTER.x, v.z - f.CENTER.z);
                    expect(behind, where).toBeGreaterThanOrEqual(0);
                    if (lower) expect(v.y, where).toBeGreaterThan(tread - 1e-3);
                }
            }
            // The first rows all round, the north stand's and the patio's.
            expect(nearWall).toBeGreaterThan(quality === "high" ? 300 : 150);
            expect(onTread).toBeGreaterThan(quality === "high" ? 300 : 150);
        },
    );

    it("asks for people, seated at the seats' pitch, lit by the venue", () => {
        const kit = build();
        expect(kit.crowd?.style).toBe("people");
        expect(kit.crowd?.spacing).toBe(DIESEL_SEAT_PITCH);
        expect(kit.crowdDensity).toBe(1);
        const crowd = crowdOf(kit);
        // A full house: tens of thousands, in two draw calls, everyone a
        // card and the people around the camera full figures.
        expect(crowd.count).toBeGreaterThan(40000);
        expect(crowd.count).toBeLessThan(52000);
        expect(crowd.mesh).toBeInstanceOf(InstancedMesh);
        expect(crowd.near).toBeInstanceOf(InstancedMesh);
        expect(crowd.object.children).toEqual([crowd.mesh, crowd.near]);
        const card = crowd.mesh.material as MeshStandardMaterial;
        const material = crowd.near!.material as MeshStandardMaterial;
        expect(card.customProgramCacheKey()).toBe("crowd-card");
        expect(material.customProgramCacheKey()).toBe("crowd-people");
        // Nothing of its own to glow with: dark when the hall is dark.
        for (const m of [card, material]) {
            expect(m.emissive.getHex()).toBe(0);
            expect(m.emissiveIntensity * m.emissive.r).toBe(0);
        }
        const look = crowd.mesh.geometry.getAttribute("aLook");
        expect(look.count).toBe(crowd.count);
        const spots = people(crowd);
        const spill = dieselSpill(f);
        let standing = 0;
        spots.forEach((p, i) => {
            const up = look.getY(i) === 1;
            if (up) standing++;
            // The baked light is the stand's own, at the person's seat.
            const tread = p.y - 0.41 - (up ? 0.45 : 0);
            expect(look.getX(i)).toBeCloseTo(spill(offsetOf(p), tread), 5);
        });
        // A few stand; most sit.
        expect(standing).toBeGreaterThan(5);
        expect(standing).toBeLessThan(crowd.count * 0.06);
    });

    it("fills the house: every open deck nearly full, a few more gaps up high", () => {
        const kit = build();
        const crowd = crowdOf(kit);
        const spots = people(crowd);
        const { loge, mid, upperWest } = BOWL;
        const front = (p: Vector3) => p.z > 0 && Math.abs(p.x) <= straight;
        const isBank = (p: Vector3) => p.y < loge.top + 1.5;
        const is400 = (p: Vector3) =>
            p.y > mid.base && p.y < mid.top + 1.5 && offsetOf(p) > mid.offset;
        const is600 = (p: Vector3) => p.y > upperWest.bottom;
        /** Seats in the front sideline's rows between `y0` and `y1`, between the 30s. */
        const seatsBetween30s = (y0: number, y1: number) => {
            let n = 0;
            for (const row of kit.seatRows) {
                const [a, b] = [row.points[0], row.points.at(-1)!];
                if (a[1] < y0 || a[1] > y1 || a[2] < f.CENTER.z + BOWL.halfZ)
                    continue;
                if (Math.abs(a[0] - f.CENTER.x) > straight) continue;
                const length = Math.abs(b[0] - a[0]);
                const step = Math.sign(b[0] - a[0]) * DIESEL_SEAT_PITCH;
                for (let k = 0; k * DIESEL_SEAT_PITCH < length; k++)
                    if (Math.abs(a[0] + k * step - f.CENTER.x) < 18.3) n++;
            }
            return n;
        };
        const between30s = (ps: Vector3[]) =>
            ps.filter((p) => Math.abs(p.x) < 18.3).length;

        // The judges' level, the 100s and 200s and the 600s of the front
        // sideline: nearly every seat taken, the 600s a little less so.
        const judges = spots.filter((p) => front(p) && is400(p));
        const judgesShare =
            between30s(judges) / seatsBetween30s(mid.base, mid.top + 1.5);
        const bank = spots.filter((p) => front(p) && isBank(p));
        const bankShare = between30s(bank) / seatsBetween30s(0, loge.top + 1.5);
        const upper = spots.filter((p) => front(p) && is600(p));
        const upperShare =
            between30s(upper) / seatsBetween30s(upperWest.bottom, Infinity);
        expect(judgesShare).toBeGreaterThan(0.85);
        expect(bankShare).toBeGreaterThan(0.85);
        expect(upperShare).toBeGreaterThan(0.75);
        expect(upperShare).toBeLessThan(bankShare);

        // The ends and the far side are full too, but nobody sits behind
        // the drape.
        const ends = spots.filter((p) => Math.abs(p.x) > BOWL.halfX);
        expect(ends.length).toBeGreaterThan(crowd.count * 0.08);
        expect(spots.filter((p) => p.z < 0).length).toBeGreaterThan(
            crowd.count * 0.1,
        );
        expect(
            spots.filter((p) => p.z < -BOWL.halfZ && Math.abs(p.x) < straight),
        ).toHaveLength(0);

        // The mask itself: full, with the odd gap in groups.
        const fill = dieselCrowdFill(f);
        const mean = (at: (i: number) => Vector3Tuple) => {
            let sum = 0;
            for (let i = 0; i < 400; i++) sum += fill(...at(i));
            return sum / 400;
        };
        const seat = 0.41;
        const across = (i: number) => -15 + (i % 40) * 0.75;
        const judgesMean = mean((i) => [
            across(i),
            mid.base + 1 + seat,
            BOWL.halfZ + mid.offset + 2 + (i % 5),
        ]);
        expect(judgesMean).toBeGreaterThan(0.9);
        expect(
            mean((i) => [across(i), 3, BOWL.halfZ + 4 + (i % 7)]),
        ).toBeGreaterThan(0.9);
        const upperMean = mean((i) => [
            across(i),
            upperWest.base + 5,
            70 + (i % 7),
        ]);
        expect(upperMean).toBeGreaterThan(0.8);
        expect(upperMean).toBeLessThan(judgesMean);
        expect(
            mean((i) => [BOWL.halfX + 4 + (i % 7), 3, -10 + (i % 40) * 0.5]),
        ).toBeGreaterThan(0.9);
        const values = Array.from({ length: 200 }, (_, i) =>
            fill(-40 + i * 0.4, 3, BOWL.halfZ + 4),
        );
        expect(Math.min(...values)).toBeGreaterThan(0.8);
        expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.04);
    });

    it("draws a full house cheaply: cards, and full figures only around the camera", () => {
        const high = crowdOf(build("high"), "high");
        const lowKit = build("low");
        const low = crowdOf(lowKit, "low");
        // Low quality halves the people and uses the cheap figure.
        expect(low.count).toBeLessThan(high.count * 0.6);
        expect(low.count).toBeGreaterThan(high.count * 0.4);
        expect(trianglesOf(high.mesh)).toBe(2);
        expect(trianglesOf(low.mesh)).toBe(2);
        expect(trianglesOf(high.near!)).toBeLessThanOrEqual(165);
        expect(trianglesOf(low.near!)).toBeLessThanOrEqual(56);
        // Seated at each seat camera, the full figures are the people
        // within reach, never more than the cap.
        for (const id of ["judges", "upper", "lowerBowl"]) {
            for (const [crowd, quality] of [
                [high, "high"],
                [low, "low"],
            ] as const) {
                crowd.follow(eyeOf(lowKit, id));
                const near = crowd.near!;
                expect(near.count, id).toBeGreaterThan(100);
                expect(near.count, id).toBeLessThanOrEqual(
                    CROWD_NEAR[quality].count,
                );
                const eye = new Vector3(...eyeOf(lowKit, id));
                for (const p of positionsOf(near))
                    expect(p.distanceTo(eye)).toBeLessThan(
                        CROWD_NEAR[quality].radius,
                    );
                const triangles =
                    crowd.count * trianglesOf(crowd.mesh) +
                    near.count * trianglesOf(near);
                // The prelims crowd this replaced cost about 525k at high
                // and 103k at low.
                expect(triangles, id).toBeLessThan(
                    quality === "high" ? 450e3 : 85e3,
                );
            }
        }
    });

    it("leaves no hole in a seated stand bigger than an aisle", () => {
        const kit = build();
        const crowd = crowdOf(kit);
        // Everyone, on a 1 m grid in plan (kit-root space).
        const grid = new Map<string, Vector3[]>();
        const key = (x: number, z: number) =>
            `${Math.floor(x)},${Math.floor(z)}`;
        for (const p of people(crowd)) {
            const k = key(p.x, p.z);
            if (!grid.has(k)) grid.set(k, []);
            grid.get(k)!.push(p);
        }
        const taken = (s: Vector3) => {
            for (let i = -1; i <= 1; i++)
                for (let j = -1; j <= 1; j++)
                    for (const p of grid.get(key(s.x + i, s.z + j)) ?? [])
                        if (
                            Math.hypot(p.x - s.x, p.z - s.z) < 0.45 &&
                            Math.abs(p.y - s.y) < 1.2
                        )
                            return true;
            return false;
        };
        // Every seat drawn: the middle of each seat back along its row.
        const seats = named(kit.root, "markDiesel.seats").geometry;
        const pos = seats.getAttribute("position");
        const uv = seats.getAttribute("uv");
        const empty: Vector3[] = [];
        let total = 0;
        for (let q = 0; q < pos.count; q += 6) {
            // Seat backs only (their tiles start halfway up the texture).
            if (Math.abs(uv.getY(q) - 0.5) > 1e-6) continue;
            const a = new Vector3(pos.getX(q), pos.getY(q), pos.getZ(q));
            const b = new Vector3(
                pos.getX(q + 1),
                pos.getY(q + 1),
                pos.getZ(q + 1),
            );
            const [u0, u1] = [uv.getX(q), uv.getX(q + 1)];
            for (let k = Math.floor(u0); k + 0.5 < u1; k++) {
                const t = (k + 0.5 - u0) / (u1 - u0);
                if (t < 0 || t > 1) continue;
                const s = a.clone().lerp(b, t);
                // From the seat back to where its person sits.
                const out = new Vector3(s.x, 0, s.z);
                const along = b.clone().sub(a).setY(0).normalize();
                const toward = new Vector3(-along.z, 0, along.x);
                // The person sits in front of the back, toward the field.
                if (toward.dot(out) > 0) toward.negate();
                s.addScaledVector(toward, 0.27).setY(s.y + 0.03);
                total++;
                if (!taken(s)) empty.push(s);
            }
        }
        expect(total).toBeGreaterThan(40000);
        // Odd empty seats, a few percent, never whole wedges.
        expect(empty.length / total).toBeLessThan(0.08);
        // Group the empty seats that touch (within a seat and a row).
        const seen = new Set<number>();
        let biggest = 0;
        let where = new Vector3();
        for (let i = 0; i < empty.length; i++) {
            if (seen.has(i)) continue;
            const stack = [i];
            seen.add(i);
            let size = 0;
            while (stack.length) {
                const k = stack.pop()!;
                size++;
                for (let j = 0; j < empty.length; j++)
                    if (
                        !seen.has(j) &&
                        empty[j].distanceTo(empty[k]) < DIESEL_SEAT_PITCH * 1.9
                    ) {
                        seen.add(j);
                        stack.push(j);
                    }
            }
            if (size > biggest) {
                biggest = size;
                where = empty[i];
            }
        }
        // An aisle is 1.2 m: about two seats. A hole is anything bigger
        // than a small group of empty seats.
        expect(
            biggest,
            `hole near ${where.toArray().map((v) => v.toFixed(1))}`,
        ).toBeLessThanOrEqual(8);
    });

    it("keeps the cameras' seats clear, and the photo seat's view of the field", () => {
        const kit = build();
        const crowd = crowdOf(kit);
        const spots = people(crowd);
        const seats = kit.cameras.filter((c) => c.kind === "seat");
        expect(seats.length).toBeGreaterThanOrEqual(4);
        for (const seat of seats) {
            const eye = new Vector3(...seat.position).sub(
                new Vector3(f.CENTER.x, 0, f.CENTER.z),
            );
            // The camera's own seat is empty before the scene clears
            // anyone, and nobody else's: from the other cameras the house
            // has no holes where the camera seats are.
            const nearest = Math.min(...spots.map((p) => p.distanceTo(eye)));
            expect(nearest, seat.id).toBeGreaterThan(DIESEL_SEAT_CLEAR);
            // (The press box stands over the top of the 600s, not in them.)
            if (seat.id !== "pressBox")
                expect(nearest, seat.id).toBeLessThan(2);
        }
        // The scene clears the rest within arm's reach, and never more
        // than a few meters of people.
        expect(kit.crowd?.clearRadius).toBeLessThan(3.5);
        const photoSeat = seats.find((c) => c.id === "lowerBowl")!;
        const hidden = crowd.clearAround(photoSeat.position, 4.9);
        expect(hidden).toBeGreaterThan(0);
        expect(hidden).toBeLessThan(80);

        // From the photo seat, nothing stands between the eye and the
        // field: not a seat, a rail, a wall or a person.
        const lower = kit.cameras.find((c) => c.id === "lowerBowl")!;
        const eye = new Vector3(...lower.position);
        const blockers = [
            "markDiesel.seats",
            "markDiesel.concrete",
            "markDiesel.treads",
            "markDiesel.structure",
        ].map((name) => named(kit.root, name));
        const targets: Vector3Tuple[] = [];
        for (const x of [-45, -20, 0, 20, 45])
            // (Heads do cover the near sideline, as in the photo.)
            for (const z of [-8, -16, -24, -47])
                targets.push([f.CENTER.x + x, 0.05, z]);
        for (const target of targets) {
            const to = new Vector3(...target).sub(eye);
            const ray = new Raycaster(eye, to.clone().normalize(), 0.05);
            ray.far = to.length() - 0.2;
            const hits = ray.intersectObjects(
                [...blockers, crowd.mesh, crowd.near!],
                false,
            );
            expect(
                hits.map((h) => h.object.name),
                `${target}`,
            ).toEqual([]);
        }
        // People do sit in front of it, further down: the bottom of the
        // photo is heads.
        const eyeLocal = eye
            .clone()
            .sub(new Vector3(f.CENTER.x, 0, f.CENTER.z));
        const ahead = spots.filter(
            (p) =>
                Math.abs(p.x - eyeLocal.x) < 8 &&
                p.z < eyeLocal.z &&
                p.z > eyeLocal.z - 12,
        );
        expect(ahead.length).toBeGreaterThan(40);
        for (const p of ahead) expect(p.y + 0.8).toBeLessThan(eyeLocal.y);
    });
});

describe("crowd styles", () => {
    const rows = Array.from({ length: 6 }, (_, r) => ({
        points: [
            [0, r * 0.4, r * 0.8],
            [30, r * 0.4, r * 0.8],
        ] as Vector3Tuple[],
        closed: false,
        depth: 0.8,
        side: "home" as const,
    }));

    it("leaves the shared block crowd as it was", () => {
        expect(crowdBlockGeometry().getAttribute("position").count).toBe(24);
        const plain = buildCrowd(rows, { density: 0.6 });
        const same = buildCrowd(rows, { density: 0.6, style: "blocks" });
        cleanup.push(
            () => plain.dispose(),
            () => same.dispose(),
        );
        expect(plain.mesh.geometry.getAttribute("position").count).toBe(24);
        expect(plain.mesh.geometry.getAttribute("aLook")).toBeUndefined();
        expect(
            (
                plain.mesh.material as MeshStandardMaterial
            ).customProgramCacheKey(),
        ).toBe("crowd-block");
        expect(same.count).toBe(plain.count);
        expect(Array.from(same.mesh.instanceMatrix.array)).toEqual(
            Array.from(plain.mesh.instanceMatrix.array),
        );
        // Neighbors keep the shared spacing.
        const full = buildCrowd([rows[0]], { density: 1, aisleEvery: 1e6 });
        cleanup.push(() => full.dispose());
        expect(full.count).toBe(Math.ceil(30 / PERSON_SPACING));
    });

    it("shapes a person: a head on shoulders, within one seat", () => {
        for (const detail of ["high", "low"] as const) {
            const geo = crowdPersonGeometry(detail);
            const pos = geo.getAttribute("position");
            const part = geo.getAttribute("aPart");
            const box = new Box3().setFromBufferAttribute(pos as never);
            expect(box.max.x - box.min.x).toBeLessThan(0.58);
            expect(box.max.x).toBeCloseTo(-box.min.x, 5);
            // The head: narrower than the shoulders, on top.
            let headMinY = Infinity;
            let headHalf = 0;
            let shoulderHalf = 0;
            for (let i = 0; i < pos.count; i++) {
                const head = part.getX(i) === 1 || part.getX(i) === 4;
                if (head) {
                    headMinY = Math.min(headMinY, pos.getY(i));
                    headHalf = Math.max(headHalf, Math.abs(pos.getX(i)));
                } else if (part.getX(i) === 0)
                    shoulderHalf = Math.max(
                        shoulderHalf,
                        Math.abs(pos.getX(i)),
                    );
            }
            expect(box.max.y).toBeGreaterThan(0.74);
            expect(box.max.y).toBeLessThan(0.84);
            expect(headMinY).toBeGreaterThan(0.5);
            expect(headHalf).toBeLessThan(shoulderHalf * 0.55);
            geo.dispose();
        }
    });

    it("places people by the kit's fill, shade and pitch, and clears no wider than asked", () => {
        const crowd = buildCrowd(rows, {
            density: 1,
            style: "people",
            spacing: 0.5,
            aisleEvery: 1e6,
            standing: 0.2,
            clearRadius: 2,
            fill: (x) => (x < 15 ? 1 : 0),
            shade: (_x, y) => 1 - y / 4,
            clothes: [0x112233],
        });
        cleanup.push(() => crowd.dispose());
        expect(crowd.count).toBe(6 * 30);
        const m = new Matrix4();
        const look = crowd.mesh.geometry.getAttribute("aLook");
        let standing = 0;
        for (let i = 0; i < crowd.count; i++) {
            crowd.mesh.getMatrixAt(i, m);
            const p = new Vector3().setFromMatrixPosition(m);
            expect(p.x).toBeLessThan(15);
            expect((p.x / 0.5) % 1).toBeCloseTo(0, 5);
            const up = look.getY(i) === 1;
            if (up) standing++;
            const seatY = p.y - (up ? 0.45 : 0);
            expect(look.getX(i)).toBeCloseTo(1 - seatY / 4, 5);
        }
        expect(standing).toBeGreaterThan(10);
        expect(standing).toBeLessThan(70);
        // The scene asks for 4.9 m; this crowd gives up 2.
        const hidden = crowd.clearAround([7, 0, 0], 4.9);
        const within2 = buildCrowd(rows, {
            density: 1,
            style: "people",
            spacing: 0.5,
            aisleEvery: 1e6,
            standing: 0.2,
            fill: (x) => (x < 15 ? 1 : 0),
        });
        cleanup.push(() => within2.dispose());
        expect(hidden).toBe(within2.clearAround([7, 0, 0], 2));
        expect(hidden).toBeGreaterThan(0);
        expect(hidden).toBeLessThan(within2.clearAround([7, 0, 0], 4.9));
    });
    it("hands the people nearest the camera full figures, and hides their cards", () => {
        // A big flat stand: more people within reach than the cap.
        const stand = Array.from({ length: 60 }, (_, r) => ({
            points: [
                [0, r * 0.4, r * 0.8],
                [80, r * 0.4, r * 0.8],
            ] as Vector3Tuple[],
            closed: false,
            depth: 0.8,
            side: "home" as const,
        }));
        const crowd = buildCrowd(stand, {
            density: 1,
            style: "people",
            spacing: 0.5,
            aisleEvery: 1e6,
            standing: 0.1,
        });
        cleanup.push(() => crowd.dispose());
        const near = crowd.near!;
        const cap = CROWD_NEAR.high.count;
        expect(crowd.mesh.count).toBe(crowd.count);
        expect(trianglesOf(crowd.mesh)).toBe(
            crowdCardGeometry().getAttribute("position").count / 3,
        );
        // Before it knows where the camera is: all cards.
        expect(near.count).toBe(0);
        expect(cardUniforms(crowd).nearR2).toBe(0);

        const eye: Vector3Tuple = [40, 13, 24];
        expect(crowd.follow(eye)).toBe(true);
        // Up to the cap; people tied at the cut (the stand is symmetric)
        // stay cards together.
        expect(near.count).toBeLessThanOrEqual(cap);
        expect(near.count).toBeGreaterThan(cap * 0.95);
        // The full figures are the nearest people, exactly as the cards
        // place them (pose, color and light), and the cards step aside for
        // exactly those people.
        const { near: center, nearR2 } = cardUniforms(crowd);
        expect(center.toArray()).toEqual(eye);
        const everyone = positionsOf(crowd.mesh);
        const key = (p: Vector3) =>
            p
                .toArray()
                .map((v) => v.toFixed(4))
                .join();
        const index = new Map(everyone.map((p, i) => [key(p), i]));
        const chosen = new Set<number>();
        const look = crowd.mesh.geometry.getAttribute("aLook");
        const nearLook = near.geometry.getAttribute("aLook");
        const a = new Matrix4();
        const b = new Matrix4();
        positionsOf(near).forEach((p, slot) => {
            const i = index.get(key(p));
            expect(i).toBeDefined();
            chosen.add(i!);
            crowd.mesh.getMatrixAt(i!, a);
            near.getMatrixAt(slot, b);
            expect(b.elements).toEqual(a.elements);
            expect(near.instanceColor!.getX(slot)).toBe(
                crowd.mesh.instanceColor!.getX(i!),
            );
            expect(nearLook.getX(slot)).toBe(look.getX(i!));
            expect(nearLook.getY(slot)).toBe(look.getY(i!));
        });
        const at = new Vector3(...eye);
        everyone.forEach((p, i) =>
            expect(p.distanceToSquared(at) < nearR2, `${i}`).toBe(
                chosen.has(i),
            ),
        );
        expect(Math.sqrt(nearR2)).toBeLessThan(CROWD_NEAR.high.radius);

        // Small moves keep the same people; a step moves them.
        expect(crowd.follow([40.5, 13, 24])).toBe(false);
        expect(crowd.follow([40 + CROWD_FOLLOW_STEP * 1.2, 13, 24])).toBe(true);

        // Cleared seats show neither figures nor cards.
        const hidden = crowd.clearAround(eye, 2);
        expect(hidden).toBeGreaterThan(0);
        expect(crowd.visibleCount()).toBe(crowd.count - hidden);
        const { clear, clearR2 } = cardUniforms(crowd);
        expect(clear.toArray()).toEqual(eye);
        expect(clearR2).toBe(4);
        for (const p of positionsOf(near))
            expect(p.distanceTo(at)).toBeGreaterThanOrEqual(2);
        expect(near.count).toBeGreaterThan(cap * 0.9);
        crowd.reset();
        expect(crowd.visibleCount()).toBe(crowd.count);
        expect(cardUniforms(crowd).clearR2).toBe(0);
    });
});

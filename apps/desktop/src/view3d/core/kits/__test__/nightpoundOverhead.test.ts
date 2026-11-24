import { beforeAll, describe, expect, it } from "vitest";
import {
    Box3,
    InstancedBufferGeometry,
    InstancedMesh,
    Light,
    Mesh,
    SpotLight,
    Vector3,
    type Object3D,
    type Vector3Tuple,
} from "three";
import {
    createSharedMaterials,
    ft,
    lightingValues,
    setTexturePainting,
} from "../../environment";
import type { LightingPreset } from "../../types";
import { BOARD, BOARD_FACE_TOP } from "../nightpound/boardPlan";
import {
    AREA,
    SCOREBOARD_BOTTOM,
    type NightpoundCtx,
    type NightpoundPart,
} from "../nightpound/frame";
import {
    buildLighting,
    nightpoundFloorSpots,
    type NightpoundSpot,
} from "../nightpound/lighting";
import { NIGHTPOUND_VENUE } from "../nightpound/lightLevels";
import { ARENA_CENTER_Z } from "../nightpound/plan";
import { buildRoof } from "../nightpound/roof";
import { FLAG_DESIGNS } from "../nightpound/roofFlags";
import {
    CAN,
    FLAGS,
    OVERHEAD_CLEARANCE,
    ROOF,
    ROOF_WALL_FOOT,
    canLayout,
    flagLeft,
    roofDeckY,
    speakerLayout,
    trussStations,
} from "../nightpound/roofPlan";
import { buildScoreboard } from "../nightpound/scoreboard";

beforeAll(() => setTexturePainting(false));

const ctx = (quality: "low" | "high"): NightpoundCtx => ({
    footprint: { minX: -12.19, maxX: 12.19, minZ: -15.24, maxZ: 0 },
    params: {
        homeColor: "#6442ff",
        awayColor: "#c23b3b",
        endZoneText: "",
        endZoneColor: "#1f2a5c",
    },
    quality,
    shared: createSharedMaterials(),
});

/** The roof, the board and the lights, lit as the kit lights them. */
function overhead(quality: "low" | "high", preset: LightingPreset = "show") {
    const c = ctx(quality);
    const roof = buildRoof(c);
    const board = buildScoreboard(c);
    const lighting = buildLighting(c);
    const parts: NightpoundPart[] = [roof, board, lighting];
    parts.forEach((part) => part.setLighting(preset));
    return { roof, board, lighting, parts };
}

function triangles(root: Object3D): number {
    let n = 0;
    root.traverse((o) => {
        if (!(o instanceof Mesh)) return;
        const g = o.geometry;
        const per = (g.index ?? g.getAttribute("position")).count / 3;
        const instances =
            o instanceof InstancedMesh
                ? o.count
                : g instanceof InstancedBufferGeometry
                  ? g.instanceCount
                  : 1;
        n += per * instances;
    });
    return n;
}

function meshes(root: Object3D): Mesh[] {
    const out: Mesh[] = [];
    root.traverse((o) => o instanceof Mesh && out.push(o));
    return out;
}

/**
 * The bounds of what is drawn. The cans' glare is left out: its quads are
 * placed in the shader, at the cans' faces.
 */
function bounds(root: Object3D): Box3 {
    const box = new Box3();
    root.updateMatrixWorld(true);
    for (const mesh of meshes(root))
        if (mesh.frustumCulled) box.expandByObject(mesh);
    return box;
}

function lights(root: Object3D): Light[] {
    const out: Light[] = [];
    root.traverse((o) => o instanceof Light && out.push(o));
    return out;
}

const named = (root: Object3D, name: string): Mesh => {
    const mesh = root.getObjectByName(name);
    if (!(mesh instanceof Mesh)) throw new Error(`no mesh ${name}`);
    return mesh;
};

/** What three.js's spot gives a surface at `p` with normal `n` (no decay). */
function spotLight(spots: NightpoundSpot[], p: Vector3Tuple, n: Vector3Tuple) {
    const smooth = (a: number, b: number, x: number) => {
        const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
        return t * t * (3 - 2 * t);
    };
    let total = 0;
    for (const s of spots) {
        const toLight = new Vector3(...s.position).sub(new Vector3(...p));
        toLight.normalize();
        const axis = new Vector3(...s.position)
            .sub(new Vector3(...s.target))
            .normalize();
        const cone = smooth(
            Math.cos(s.angle),
            Math.cos(s.angle * (1 - s.penumbra)),
            toLight.dot(axis),
        );
        total +=
            s.intensity * cone * Math.max(0, toLight.dot(new Vector3(...n)));
    }
    return total;
}

/** Light over the competition area: the mean and the widest departure. */
function floorEvenness(spots: NightpoundSpot[]) {
    const levels: number[] = [];
    for (let i = -5; i <= 5; i++)
        for (let j = -5; j <= 5; j++)
            levels.push(
                spotLight(
                    spots,
                    [(i / 5) * AREA.halfX, 0, (j / 5) * AREA.halfZ],
                    [0, 1, 0],
                ),
            );
    const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
    const spread = Math.max(...levels.map((l) => Math.abs(l / mean - 1)));
    return { mean, spread };
}

describe("nightpound roof plan", () => {
    it("stands thirteen trusses 32 ft apart, one over the arena's center", () => {
        const stations = trussStations();
        expect(stations).toHaveLength(13);
        expect(stations[6]).toBeCloseTo(ARENA_CENTER_Z, 6);
        expect(stations[1] - stations[0]).toBeCloseTo(9.75, 6);
        expect(stations[0]).toBeGreaterThan(ROOF.minZ);
        expect(stations[12]).toBeLessThan(ROOF.maxZ);
    });

    it("pitches the deck from the ridge down to the end walls", () => {
        expect(roofDeckY(0)).toBe(ROOF.ridgeY);
        expect(roofDeckY(ROOF.halfX)).toBeCloseTo(ROOF.eaveY, 6);
        expect(roofDeckY(-ROOF.halfX)).toBeCloseTo(ROOF.eaveY, 6);
        expect(roofDeckY(10)).toBeLessThan(roofDeckY(5));
    });

    it("hangs the cans in a grid, closer together over the floor", () => {
        const cans = canLayout();
        expect(cans.length).toBeGreaterThan(100);
        expect(cans.length).toBeLessThan(260);
        for (const { position } of cans) {
            expect(position[1]).toBe(CAN.faceY);
            expect(Math.abs(position[0])).toBeLessThan(ROOF.halfX);
            expect(position[2]).toBeGreaterThan(ROOF.minZ);
            expect(position[2]).toBeLessThan(ROOF.maxZ);
        }
        const floor = cans.filter((c) => c.floor);
        expect(floor.length).toBeGreaterThan(40);
        // A can over each side of the competition area's middle.
        expect(floor.some(({ position: [x, , z] }) => x === 0 && z > 0)).toBe(
            true,
        );
        // No two cans in one place.
        const keys = new Set(cans.map((c) => c.position.join()));
        expect(keys.size).toBe(cans.length);
    });

    it("hangs six arrays around the board and two over each end", () => {
        const speakers = speakerLayout();
        expect(speakers).toHaveLength(10);
        const near = speakers.filter(
            ({ position: [x, , z] }) =>
                Math.abs(Math.hypot(x, z - ARENA_CENTER_Z) - 12) < 1e-6,
        );
        expect(near).toHaveLength(6);
        // Each plays away from the board.
        for (const { position, yaw } of near)
            expect(
                Math.sin(yaw) * position[0] +
                    Math.cos(yaw) * (position[2] - ARENA_CENTER_Z),
            ).toBeCloseTo(12, 5);
    });

    it("hangs two rows of eight flags clear of the board", () => {
        expect(FLAG_DESIGNS).toHaveLength(FLAGS.count);
        const lefts = Array.from({ length: FLAGS.count }, (_, i) =>
            flagLeft(i),
        );
        for (let i = 1; i < lefts.length; i++)
            expect(lefts[i]).toBeGreaterThan(lefts[i - 1]);
        expect(lefts[7] + FLAGS.width).toBeCloseTo(-FLAGS.inner, 6);
        expect(lefts[8]).toBeCloseTo(FLAGS.inner, 6);
        expect(lefts[0]).toBeCloseTo(-(lefts[15] + FLAGS.width), 6);
        expect(FLAGS.inner).toBeGreaterThan(BOARD.faceReach + BOARD.faceLean);
    });
});

describe("nightpound roof", () => {
    it("keeps everything above the stands and inside the walls", () => {
        const { roof } = overhead("high");
        const box = bounds(roof.object);
        expect(box.min.y).toBeGreaterThan(OVERHEAD_CLEARANCE);
        expect(box.min.y).toBeGreaterThan(16);
        expect(box.max.y).toBeLessThan(ROOF.ridgeY + 0.5);
        expect(box.max.x).toBeLessThan(ROOF.halfX + 0.5);
        expect(box.min.z).toBeGreaterThan(ROOF.minZ - 0.5);
        expect(box.max.z).toBeLessThan(ROOF.maxZ + 0.5);
    });

    it("draws the walls only from the roof down to the bowl's rear walls", () => {
        const { roof } = overhead("high");
        const box = new Box3().setFromObject(
            named(roof.object, "nightpound.roofWalls"),
        );
        expect(box.min.y).toBe(
            Math.min(ROOF_WALL_FOOT.sides, ROOF_WALL_FOOT.ends),
        );
        expect(box.max.y).toBe(ROOF.ridgeY);
        // Outside the bowl's own walls, never in the same plane.
        expect(box.min.z).toBeLessThan(ROOF.minZ);
        expect(box.max.z).toBeGreaterThan(ROOF.maxZ);
        expect(box.max.x).toBeGreaterThan(ROOF.halfX);
    });

    it("hides above the bottom chords and shows again below", () => {
        const { roof } = overhead("high");
        roof.onFrame?.({ cameraPosition: [0, 120, 0.15], dt: 0 });
        expect(roof.object.visible).toBe(false);
        roof.onFrame?.({ cameraPosition: [0, 9, 22], dt: 0 });
        expect(roof.object.visible).toBe(true);
        // The top row's eye, under the cans, is still inside.
        roof.onFrame?.({ cameraPosition: [0, 23.4, 60], dt: 0 });
        expect(roof.object.visible).toBe(true);
    });

    it("is a handful of draw calls with no lights and no shadows", () => {
        for (const quality of ["low", "high"] as const) {
            const { roof } = overhead(quality);
            expect(meshes(roof.object).length).toBeLessThanOrEqual(7);
            expect(lights(roof.object)).toHaveLength(0);
            for (const mesh of meshes(roof.object))
                expect(mesh.castShadow).toBe(false);
        }
    });

    it("lights the cans in both presets and hangs one housing per can", () => {
        const { roof } = overhead("high", "house");
        const glare = named(roof.object, "nightpound.canGlare");
        expect(glare.visible).toBe(true);
        const faces = named(roof.object, "nightpound.canFaces");
        expect((faces as InstancedMesh).count).toBe(canLayout().length);
        expect(triangles(named(roof.object, "nightpound.flags"))).toBe(32);
    });
});

describe("nightpound scoreboard", () => {
    it("hangs the ring's bottom 32 ft over the arena's center", () => {
        const { board } = overhead("high");
        const ring = new Box3().setFromObject(
            named(board.object, "nightpound.boardRing"),
        );
        expect(ring.min.y).toBeCloseTo(ft(32), 6);
        expect(SCOREBOARD_BOTTOM).toBeCloseTo(9.7536, 4);
        expect(ring.max.y - ring.min.y).toBeCloseTo(ft(3), 6);
        expect(ring.max.x - ring.min.x).toBeCloseTo(ft(75) / 4, 6);
        const center = ring.getCenter(new Vector3());
        expect(center.x).toBeCloseTo(0, 6);
        expect(center.z).toBeCloseTo(ARENA_CENTER_Z, 6);
    });

    it("is the only thing overhead below 9.75 m... and only just", () => {
        const { parts, board } = overhead("high");
        for (const part of parts) {
            const box = bounds(part.object);
            if (box.isEmpty()) continue;
            expect(box.min.y).toBeGreaterThanOrEqual(SCOREBOARD_BOTTOM - 1e-6);
        }
        expect(bounds(board.object).min.y).toBeCloseTo(SCOREBOARD_BOTTOM, 6);
    });

    it("leans four 20 ft by 13.5 ft faces out over the ring", () => {
        const { board } = overhead("high");
        const shell = new Box3().setFromObject(
            named(board.object, "nightpound.boardShell"),
        );
        const center = shell.getCenter(new Vector3());
        expect(center.x).toBeCloseTo(0, 6);
        expect(center.z).toBeCloseTo(ARENA_CENTER_Z, 6);
        expect(BOARD.faceWidth).toBeCloseTo(ft(20), 6);
        expect(BOARD.faceHeight).toBeCloseTo(ft(13.5), 6);
        expect(BOARD_FACE_TOP).toBeCloseTo(15.05, 1);
        // Wider at the top than at the bottom, and wider than the ring.
        const reach = BOARD.faceReach + BOARD.faceLean;
        expect(shell.max.x).toBeGreaterThan(reach - 0.1);
        expect(shell.max.x).toBeLessThan(reach + 0.1);
        expect(BOARD.faceReach).toBeGreaterThan(BOARD.ringSide / 2);
        // Four faces, four wedges and the auxiliary board.
        const screens = named(board.object, "nightpound.boardScreens");
        expect(triangles(screens)).toBe(18);
    });

    it("shows the show's credits and glows in both presets", () => {
        const { board } = overhead("high");
        expect(() =>
            board.setCredits({ title: "Spring Show", designer: "Sam" }),
        ).not.toThrow();
        const gain = () =>
            (
                named(board.object, "nightpound.boardScreens").material as {
                    uniforms: { gain: { value: number } };
                }
            ).uniforms.gain.value;
        const show = gain();
        expect(show).toBeGreaterThan(0.3);
        // Modest: under white, so the board doesn't flare.
        expect(show).toBeLessThan(1);
        board.setLighting("house");
        expect(gain()).toBeGreaterThan(0.3);
        expect(gain()).toBeLessThan(show);
    });

    it("hides with the roof, so a top-down view sees the floor", () => {
        const { board } = overhead("high");
        board.onFrame?.({ cameraPosition: [0, 120, 0.15], dt: 0 });
        expect(board.object.visible).toBe(false);
        board.onFrame?.({ cameraPosition: [0, 9, 22], dt: 0 });
        expect(board.object.visible).toBe(true);
    });
});

describe("nightpound lighting", () => {
    it("lights the floor with a few spots and one shadow map", () => {
        const high = lights(overhead("high").lighting.object);
        expect(high).toHaveLength(5);
        expect(high.every((l) => l instanceof SpotLight)).toBe(true);
        expect(high.filter((l) => l.castShadow)).toHaveLength(1);
        const low = lights(overhead("low").lighting.object);
        expect(low).toHaveLength(3);
        expect(low.filter((l) => l.castShadow)).toHaveLength(0);
    });

    it("lights the competition area evenly, from under the cans", () => {
        const high = floorEvenness(nightpoundFloorSpots("high"));
        expect(high.mean).toBeGreaterThan(0.9);
        expect(high.mean).toBeLessThan(1.1);
        expect(high.spread).toBeLessThan(0.15);
        const low = floorEvenness(nightpoundFloorSpots("low"));
        expect(low.mean).toBeGreaterThan(0.9);
        expect(low.mean).toBeLessThan(1.1);
        expect(low.spread).toBeLessThan(0.25);
        for (const quality of ["low", "high"] as const)
            for (const spot of nightpoundFloorSpots(quality)) {
                expect(spot.position[1]).toBeLessThan(CAN.faceY);
                expect(spot.position[1]).toBeGreaterThan(20);
            }
    });

    it("leaves the stands dimmer than the floor and the upper deck to the house lights", () => {
        const spots = nightpoundFloorSpots("high");
        // Row F of the front 100s, and a seat high in the front upper deck.
        const lower = spotLight(spots, [0, 2, 18], [0, 0.94, -0.34]);
        const upper = spotLight(spots, [0, 18, 50], [0, 0.9, -0.43]);
        expect(lower).toBeGreaterThan(0.2);
        expect(lower).toBeLessThan(0.75);
        expect(upper).toBeLessThan(0.05);
    });

    it("keeps every spot lit in both presets, the floor plainer in house", () => {
        const { lighting } = overhead("high", "show");
        const spots = lights(lighting.object);
        const show = spots.map((l) => l.intensity);
        expect(spots.every((l) => l.visible && l.intensity > 0)).toBe(true);
        lighting.setLighting("house");
        // The same lights on, so the switch compiles nothing.
        expect(spots.every((l) => l.visible)).toBe(true);
        spots.forEach((l, i) => expect(l.intensity).toBeLessThan(show[i] / 2));
    });

    it("has its own show and house values", () => {
        const show = lightingValues("show", NIGHTPOUND_VENUE);
        const house = lightingValues("house", NIGHTPOUND_VENUE);
        expect(show).not.toBe(lightingValues("show"));
        expect(house).not.toBe(lightingValues("house"));
        expect(house.hemisphere.intensity).toBeGreaterThan(
            show.hemisphere.intensity,
        );
        expect(house.kit.roofSpotIntensity).toBeLessThan(
            show.kit.roofSpotIntensity,
        );
        // One tone curve and one post pass for both.
        expect(house.toneMapping).toBe(show.toneMapping);
        expect(show.bloom).toBeDefined();
        expect(house.bloom).toBeDefined();
        expect(show.sun.intensity).toBe(0);
        expect(show.skyVisible).toBe(false);
    });
});

describe("nightpound overhead budget", () => {
    it("stays within its triangles and draw calls", () => {
        const count = (quality: "low" | "high") => {
            const { parts } = overhead(quality);
            return {
                triangles: parts.reduce(
                    (n, part) => n + triangles(part.object),
                    0,
                ),
                draws: parts.reduce(
                    (n, part) => n + meshes(part.object).length,
                    0,
                ),
            };
        };
        const high = count("high");
        const low = count("low");
        expect(high.triangles).toBeLessThanOrEqual(200_000);
        expect(low.triangles).toBeLessThanOrEqual(70_000);
        expect(low.triangles).toBeLessThan(high.triangles / 3);
        expect(high.draws).toBeLessThanOrEqual(12);
        expect(low.draws).toBeLessThanOrEqual(12);
    });

    it("disposes cleanly", () => {
        const { parts } = overhead("high");
        expect(() => parts.forEach((part) => part.dispose())).not.toThrow();
    });
});

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
    InstancedMesh,
    Matrix4,
    Mesh,
    PointLight,
    SpotLight,
    type Object3D,
} from "three";
import type { FieldFootprint, LightingPreset, VenueParams } from "../../types";
import {
    createSharedMaterials,
    ft,
    lightingValues,
    setTexturePainting,
} from "../../environment";
import {
    buildDieselBoards,
    dieselBoardLevel,
    dieselBoardSpots,
    dieselBoardYaw,
} from "../markDiesel/boards";
import { dieselBankGlows, dieselFixtureLayout } from "../markDiesel/fixtures";
import { DIESEL_TURF } from "../markDiesel/turf";
import { KIT_FIELD_TURF } from "../index";
import {
    dieselFrame,
    type DieselCtx,
    type DieselPart,
} from "../markDiesel/frame";
import {
    buildDieselLighting,
    dieselBounceLights,
    dieselFieldSpots,
    dieselLighting,
    dieselRoofGlow,
    DIESEL_VENUE,
} from "../markDiesel/lighting";

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
const frame = dieselFrame(football);
const context = (quality: "low" | "high"): DieselCtx => ({
    footprint: football,
    params,
    quality,
    shared,
    frame,
});
const parts: DieselPart[] = [];
const build = <T extends DieselPart>(
    builder: (ctx: DieselCtx) => T,
    quality: "low" | "high" = "high",
): T => {
    const part = builder(context(quality));
    parts.push(part);
    return part;
};
afterEach(() => parts.splice(0).forEach((part) => part.dispose()));

const spotsOf = (root: Object3D): SpotLight[] => {
    const out: SpotLight[] = [];
    root.traverse((o) => o instanceof SpotLight && out.push(o));
    return out;
};
const named = (root: Object3D, name: string) => root.getObjectByName(name);

/**
 * Light the five spots put on a point of the field's plane, by three.js's
 * own cone falloff (they don't dim with distance).
 */
function fieldLevel(x: number, z: number): number {
    const smooth = (a: number, b: number, v: number) => {
        const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
        return t * t * (3 - 2 * t);
    };
    return dieselFieldSpots(frame).reduce((sum, s) => {
        const to = [0, 1, 2].map((i) => s.position[i] - [x, 0, z][i]);
        const axis = [0, 1, 2].map((i) => s.position[i] - s.target[i]);
        const len = Math.hypot(...to);
        const cos =
            to.reduce((d, v, i) => d + v * axis[i], 0) /
            (len * Math.hypot(...axis));
        const cone = smooth(
            Math.cos(s.angle),
            Math.cos(s.angle * (1 - s.penumbra)),
            cos,
        );
        return sum + s.intensity * cone * (to[1] / len);
    }, 0);
}

describe("Mark Diesel lighting", () => {
    it("lights the field with five spots, never one per fixture", () => {
        const part = build(buildDieselLighting);
        expect(spotsOf(part.object)).toHaveLength(5);
        expect(dieselFixtureLayout(frame).length).toBeGreaterThan(200);
    });

    it("lights the field evenly", () => {
        const levels: number[] = [];
        for (let x = -54; x <= 54; x += 6)
            for (let z = -24; z <= 24; z += 6) levels.push(fieldLevel(x, z));
        const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
        expect(Math.min(...levels) / mean).toBeGreaterThan(0.88);
        expect(Math.max(...levels) / mean).toBeLessThan(1.1);
    });

    it("turns the spots on under a roof or at night and off by day", () => {
        const part = build(buildDieselLighting);
        const on = () => spotsOf(part.object).filter((s) => s.visible).length;
        part.setLighting("roofClosed");
        expect(on()).toBe(5);
        part.setLighting("night");
        expect(on()).toBe(5);
        part.setLighting("day");
        expect(on()).toBe(0);
    });

    it("casts one shadow map at high quality and none at low", () => {
        const casting = (quality: "low" | "high") =>
            spotsOf(build(buildDieselLighting, quality).object).filter(
                (s) => s.castShadow,
            );
        const [key] = casting("high");
        expect(casting("high")).toHaveLength(1);
        expect(key.name).toBe("markDiesel.keySpot");
        expect(key.shadow.mapSize.x).toBe(2048);
        expect(casting("low")).toHaveLength(0);
    });

    it("draws the fixtures in three calls, two at low quality", () => {
        const meshes = (quality: "low" | "high") => {
            const out: Mesh[] = [];
            build(buildDieselLighting, quality).object.traverse(
                (o) => o instanceof Mesh && out.push(o),
            );
            return out;
        };
        const high = meshes("high");
        expect(high.map((m) => m.name).sort()).toEqual([
            "markDiesel.fixtureFaces",
            "markDiesel.fixtureGlare",
            "markDiesel.fixtureHousings",
        ]);
        expect(high.every((m) => !m.castShadow)).toBe(true);
        expect(
            meshes("low")
                .map((m) => m.name)
                .sort(),
        ).toEqual(["markDiesel.fixtureFaces", "markDiesel.fixtureGlare"]);
    });

    it("hangs a fixture face for every fixture, on the rack's field side", () => {
        const part = build(buildDieselLighting);
        const faces = named(part.object, "markDiesel.fixtureFaces");
        const layout = dieselFixtureLayout(frame);
        expect((faces as InstancedMesh).count).toBe(layout.length);
        const rack = Math.abs(frame.CATWALK_RUNS[0][0][2]) - 0.9;
        for (const f of layout) {
            // In front of the roof's rack pipes, within reach of them.
            expect(Math.abs(f.position[2])).toBeLessThan(rack);
            expect(Math.abs(f.position[2])).toBeGreaterThan(rack - 1);
            expect(Math.abs(f.position[1] - frame.CATWALK_Y)).toBeLessThan(1.3);
            // Every fixture points down at the field.
            expect(f.aim[1]).toBeLessThan(-0.45);
        }
    });

    it("takes each lamp row away with the roof half it hangs from", () => {
        const part = build(buildDieselLighting);
        const faces = named(
            part.object,
            "markDiesel.fixtureFaces",
        ) as InstancedMesh;
        const layout = dieselFixtureLayout(frame);
        const scaleOf = (i: number) => {
            const m = new Matrix4();
            faces.getMatrixAt(i, m);
            return Math.abs(m.determinant());
        };
        // Per side (+Z, -Z): whether all of its fixtures are drawn.
        const sideState = () =>
            [1, -1].map((s) =>
                layout
                    .map(
                        (f, i) =>
                            [Math.sign(f.position[2]), scaleOf(i)] as const,
                    )
                    .filter(([side]) => side === s)
                    .every(([, scale]) => scale > 0),
            );
        const at = (x: number, y: number, z: number) =>
            part.onFrame!({ cameraPosition: [x, y, z], dt: 1 / 60 });

        // From a seat, every row hangs.
        at(0, 22, 76);
        expect(sideState()).toEqual([true, true]);
        expect(named(part.object, "markDiesel.fixtures").visible).toBe(true);
        // From the air on the +Z side, beyond the bowl, its half goes.
        at(-60, 160, frame.BOWL.halfZ + 30);
        expect(sideState()).toEqual([false, true]);
        // Straight overhead, both halves go, and with them every row.
        at(0, 300, 0.15);
        expect(named(part.object, "markDiesel.fixtures").visible).toBe(false);
        // Back in a seat, they return.
        at(0, 22, 76);
        expect(sideState()).toEqual([true, true]);
        expect(named(part.object, "markDiesel.fixtures").visible).toBe(true);
    });

    it("hangs banks of unlike fixtures, and blocks at all four corners", () => {
        const layout = dieselFixtureLayout(frame);
        // The same layout every build.
        expect(dieselFixtureLayout(frame)).toEqual(layout);
        const end = Math.abs(frame.CATWALK_RUNS[0][0][0]);
        const run = layout.filter(
            (f) => f.position[2] > 0 && Math.abs(f.position[0]) <= end,
        );
        // Banks: neighbors a lamp apart, then a gap.
        const xs = run.map((f) => f.position[0]).sort((a, b) => a - b);
        const gaps = xs.slice(1).map((x, i) => x - xs[i]);
        const banks = gaps.filter((g) => g > 1.5).length + 1;
        expect(banks).toBeGreaterThanOrEqual(11);
        expect(banks).toBeLessThanOrEqual(15);
        // A bank mixes aims and outputs: most light their own side, one or
        // two throw across the field.
        const throws = run.filter((f) => f.kind === "throw").length;
        expect(throws).toBeGreaterThanOrEqual(banks);
        expect(throws).toBeLessThanOrEqual(2 * banks);
        expect(
            new Set(run.map((f) => f.power.toFixed(2))).size,
        ).toBeGreaterThan(20);
        for (const sx of [-1, 1])
            for (const sz of [-1, 1])
                expect(
                    layout.filter(
                        (f) =>
                            f.position[0] * sx > end && f.position[2] * sz > 0,
                    ),
                ).toHaveLength(12);
    });

    it("draws one round glare per bank and corner block", () => {
        const layout = dieselFixtureLayout(frame);
        const glows = dieselBankGlows(layout);
        // 13 banks a side, three blocks a corner.
        expect(glows).toHaveLength(2 * 13 + 4 * 3);
        for (const glow of glows) {
            // On the rack, aimed across the field and down.
            expect(Math.abs(glow.center[2])).toBeGreaterThan(40);
            expect(glow.aim[2] * glow.center[2]).toBeLessThan(0);
            expect(glow.aim[1]).toBeLessThan(0);
            // Far wider than one fixture's core, and seen from most seats.
            expect(glow.size).toBeGreaterThan(1.5);
            expect(glow.beam).toBeGreaterThan(0.8);
        }
    });

    it("paints its own yellow-green turf and leaves other kits' alone", () => {
        expect(KIT_FIELD_TURF.markDiesel).toBe(DIESEL_TURF);
        expect(Object.keys(KIT_FIELD_TURF)).toEqual(["markDiesel"]);
        const channels = (hex: string) =>
            [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
        expect(DIESEL_TURF.surface).toBe("synthetic");
        const { base, stripeDark, stripeLight } = DIESEL_TURF;
        for (const color of [base, stripeDark, stripeLight]) {
            const [r, g, b] = channels(color);
            expect(g).toBeGreaterThan(r);
            // Yellow-green: far more red than blue.
            expect(r).toBeGreaterThan(2 * b);
        }
    });

    it("bounces the field's light from under the turf, never from above", () => {
        const bounces = (quality: "low" | "high") => {
            const out: PointLight[] = [];
            const part = build(buildDieselLighting, quality);
            part.setLighting("roofClosed");
            part.object.traverse((o) => o instanceof PointLight && out.push(o));
            return { part, out };
        };
        const high = bounces("high");
        expect(high.out).toHaveLength(4);
        expect(bounces("low").out).toHaveLength(2);
        expect(high.out.map((l) => l.position.toArray())).toEqual(
            dieselBounceLights(frame, "high"),
        );
        for (const light of high.out) {
            expect(light.position.y).toBeLessThan(0);
            expect(Math.abs(light.position.z)).toBeLessThan(
                frame.FIELD_HALF_WIDTH,
            );
            expect(light.castShadow).toBe(false);
            expect(light.visible).toBe(true);
        }
        high.part.setLighting("day");
        expect(high.out.every((l) => !l.visible)).toBe(true);
    });

    it("blooms only what is brighter than white, on every preset", () => {
        for (const preset of ["roofClosed", "day", "night"] as const) {
            const { bloom, toneMapping } = dieselLighting(preset);
            expect(bloom).toBeDefined();
            expect(bloom!.threshold).toBeGreaterThan(1.5);
            // One tone curve for the venue: a preset switch compiles nothing.
            expect(toneMapping).toBe("neutral");
        }
        expect(dieselLighting("day").bloom!.ghost).toBe(0);
        // Other venues have no post pass at all.
        for (const preset of ["roofClosed", "day", "night", "dusk"] as const)
            expect(lightingValues(preset).bloom).toBeUndefined();
    });

    it("hides the glare while the lamps only idle by day", () => {
        const part = build(buildDieselLighting);
        const glare = named(part.object, "markDiesel.fixtureGlare")!;
        part.setLighting("roofClosed");
        expect(glare.visible).toBe(true);
        part.setLighting("day");
        expect(glare.visible).toBe(false);
    });

    it("has its own values for every preset the kit lists", () => {
        for (const preset of ["roofClosed", "day", "night"] as const)
            expect(dieselLighting(preset)).toBe(
                lightingValues(preset, DIESEL_VENUE),
            );
        const closed = dieselLighting("roofClosed");
        expect(closed).not.toBe(lightingValues("roofClosed"));
        expect(closed.sun.intensity).toBe(0);
        expect(closed.kit.roofOpen).toBe(false);
        expect(dieselLighting("night").kit.roofOpen).toBe(true);
        // The hall is far darker than the pro dome's.
        expect(closed.hemisphere.intensity).toBeLessThanOrEqual(
            lightingValues("roofClosed").hemisphere.intensity,
        );
        // Other venues, and presets without an entry, get the shared table.
        expect(lightingValues("roofClosed", "pro")).toBe(
            lightingValues("roofClosed"),
        );
        expect(lightingValues("dusk", DIESEL_VENUE)).toBe(
            lightingValues("dusk"),
        );
    });

    it("glows the roof panels only faintly", () => {
        expect(dieselRoofGlow("roofClosed").intensity).toBeGreaterThan(0);
        expect(dieselRoofGlow("roofClosed").intensity).toBeLessThan(0.3);
        expect(dieselRoofGlow("day").intensity).toBe(0);
    });
});

describe("Mark Diesel video boards", () => {
    it("hangs one board in each of the two corners, facing the field", () => {
        const part = build(buildDieselBoards);
        // Where and how they hang is `boards.ts`'s own (see
        // markDieselBrand.test.ts); here, only that both corners have one.
        for (const spot of dieselBoardSpots(frame)) {
            const board = named(
                part.object,
                `markDiesel.videoBoard.${spot.id}`,
            )!;
            expect(board.position.toArray()).toEqual([spot.x, spot.y, spot.z]);
            expect(board.rotation.y).toBeCloseTo(dieselBoardYaw(spot));
        }
    });

    it("shows the show's credits and follows the preset", () => {
        const part = build(buildDieselBoards);
        expect(() => part.setCredits({ title: "Finals" })).not.toThrow();
        const levels = (["roofClosed", "day", "night"] as LightingPreset[]).map(
            dieselBoardLevel,
        );
        expect(levels.every((l) => l > 0)).toBe(true);
        expect(() => part.setLighting("day")).not.toThrow();
    });
});

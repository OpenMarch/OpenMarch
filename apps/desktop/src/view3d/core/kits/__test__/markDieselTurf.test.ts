import { beforeAll, describe, expect, it } from "vitest";
import { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { planField, venueFootprint } from "../../field";
import { setTexturePainting } from "../../environment";
import { buildMarkDiesel } from "../markDiesel";
import { dieselFrame } from "../markDiesel/frame";
import {
    DIESEL_FIELD,
    DIESEL_SIDELINE,
    DIESEL_TURF,
    dieselTurfOutline,
    planDieselSideline,
} from "../markDiesel/turf";
import { DIESEL_VENUE_PARAMS } from "../markDiesel/brand";
import { fixedFieldFootprint } from "../fixedField";
import { Object3D } from "three";
import { kitFieldProperties, kitFieldStyle, placeKitField } from "..";
import { blockOverhang } from "../../field/blockDigits";
import type { FieldFootprint } from "../../types";

const FT = 0.3048;
/** Football field with end zones: 360 ft by 160 ft. */
const football: FieldFootprint = {
    minX: -54.864,
    maxX: 54.864,
    minZ: -48.768,
    maxZ: 0,
};
const hx = 54.864;
const hz = 24.384;

const area = (points: [number, number][]) =>
    Math.abs(
        points.reduce((sum, [x, z], i) => {
            const [nx, nz] = points[(i + 1) % points.length];
            return sum + x * nz - nx * z;
        }, 0) / 2,
    );
const perimeter = (points: [number, number][]) =>
    points.reduce((sum, [x, z], i) => {
        const [nx, nz] = points[(i + 1) % points.length];
        return sum + Math.hypot(nx - x, nz - z);
    }, 0);

describe("Mark Diesel turf outline", () => {
    const outline = dieselTurfOutline(hx, hz);

    it("matches the turf drawings' area and perimeter", () => {
        // 92,226 sq ft and 1,195 ft (measurements and quantities table).
        expect(area(outline) / FT ** 2).toBeGreaterThan(92226 * 0.99);
        expect(area(outline) / FT ** 2).toBeLessThan(92226 * 1.01);
        expect(perimeter(outline) / FT).toBeGreaterThan(1195 * 0.99);
        expect(perimeter(outline) / FT).toBeLessThan(1195 * 1.01);
    });

    it("is convex and symmetric, and stays inside the field wall", () => {
        const n = outline.length;
        const turns = outline.map(([x, z], i) => {
            const [bx, bz] = outline[(i + 1) % n];
            const [cx, cz] = outline[(i + 2) % n];
            return Math.sign((bx - x) * (cz - bz) - (bz - z) * (cx - bx));
        });
        expect(new Set(turns.filter((t) => t !== 0)).size).toBe(1);
        for (const [x, z] of outline)
            expect(
                outline.some(
                    ([ox, oz]) =>
                        Math.abs(ox + x) < 1e-6 && Math.abs(oz - z) < 1e-6,
                ),
            ).toBe(true);
        // Inside the field wall: a rounded rectangle, its corners 6 m in
        // radius, its nearer end (the north's) 8 m past the end line.
        const { BOWL } = dieselFrame(football);
        const r = BOWL.front.cornerRadius;
        for (const [x, z] of outline) {
            const dx = Math.max(Math.abs(x) - (BOWL.halfX - r), 0);
            const dz = Math.max(Math.abs(z) - (BOWL.halfZ - r), 0);
            expect(Math.hypot(dx, dz)).toBeLessThan(r);
        }
    });
});

describe("Mark Diesel sideline paint", () => {
    const { white, yellow } = planDieselSideline(hx, hz);
    const zs = (positions: number[]) =>
        positions.filter((_, i) => i % 3 === 2).map(Math.abs);
    const xs = (positions: number[]) =>
        positions.filter((_, i) => i % 3 === 0).map(Math.abs);

    it("faces every triangle up", () => {
        for (const flat of [white, yellow]) {
            const p = flat.positions;
            for (let i = 0; i < p.length; i += 9) {
                const [ax, az, bx, bz, cx, cz] = [
                    p[i],
                    p[i + 2],
                    p[i + 3],
                    p[i + 5],
                    p[i + 6],
                    p[i + 8],
                ];
                expect((bz - az) * (cx - ax) - (bx - ax) * (cz - az)).toBe(
                    Math.abs((bz - az) * (cx - ax) - (bx - ax) * (cz - az)),
                );
            }
        }
    });

    it("puts the team areas' limit line 36 ft out and the end limit 12 ft past the end line", () => {
        const yellowZ = Math.max(...zs(yellow.positions));
        expect((yellowZ - hz) / FT).toBeCloseTo(DIESEL_SIDELINE.team.limitD, 1);
        const yellowX = Math.max(...xs(yellow.positions));
        expect((yellowX - hx) / FT).toBeCloseTo(12 + 8 / 12, 1);
        // The border is 6 ft wide; white reaches the team areas' back line.
        const whiteZ = Math.max(...zs(white.positions));
        expect((whiteZ - hz) / FT).toBeCloseTo(30 + 4 / 12, 1);
    });
});

describe("Mark Diesel field marks", () => {
    const plan = planField({
        fieldProperties:
            FieldPropertiesTemplates.PRO_FOOTBALL_FIELD_WITH_END_ZONES,
        style: "turf",
        params: { ...DIESEL_VENUE_PARAMS },
        turf: DIESEL_TURF,
    });
    const role = (r: string) => plan.items.filter((i) => i.role === r);

    it("paints the drawings' pro marks", () => {
        const goals = role("goalLine");
        expect(goals).toHaveLength(2);
        for (const g of goals)
            if (g.type === "rect")
                expect((g.maxX - g.minX) / FT).toBeCloseTo(8 / 12, 3);
        // Red toward the goal, blue toward midfield, on both 20s.
        const accents = role("accent");
        expect(accents).toHaveLength(4);
        for (const a of accents) {
            if (a.type !== "rect") continue;
            const x = (a.minX + a.maxX) / 2;
            const fromTwenty = Math.abs(x) - 30 * 3 * FT;
            expect(a.color).toBe(fromTwenty > 0 ? "#c8102e" : "#003a70");
        }
        expect(role("kickoff")).toHaveLength(4);
        expect(role("patLine")).toHaveLength(2);
        // No frame inside the field and no line inside the end zones: the
        // kit's 6 ft border is the sideline.
        expect(role("border")).toHaveLength(0);
        expect(role("endZoneBorder")).toHaveLength(0);
    });

    it("leaves the shared turf's marks alone without them", () => {
        const shared = planField({
            fieldProperties:
                FieldPropertiesTemplates.PRO_FOOTBALL_FIELD_WITH_END_ZONES,
            style: "turf",
            params: { ...DIESEL_VENUE_PARAMS },
        });
        const has = (r: string) => shared.items.some((i) => i.role === r);
        expect(has("border")).toBe(true);
        for (const r of ["goalLine", "accent", "kickoff", "patLine"])
            expect(has(r)).toBe(false);
    });
});

describe("Mark Diesel on a small floor", () => {
    beforeAll(() => setTexturePainting(false));
    const indoor = venueFootprint(
        FieldPropertiesTemplates.INDOOR_50x80_8to5,
        "turf",
    );

    it("builds the stadium round a football field centered on the floor", () => {
        const { footprint, grown } = fixedFieldFootprint(indoor);
        expect(grown).toBe(true);
        expect((footprint.maxX - footprint.minX) / FT).toBeCloseTo(360);
        expect((footprint.maxZ - footprint.minZ) / FT).toBeCloseTo(160);
        expect(footprint.minX + footprint.maxX).toBeCloseTo(
            indoor.minX + indoor.maxX,
        );
        expect(footprint.minZ + footprint.maxZ).toBeCloseTo(
            indoor.minZ + indoor.maxZ,
        );
        expect(fixedFieldFootprint(football)).toEqual({
            footprint: football,
            grown: false,
        });
    });

    it("grows only the sides that fall short", () => {
        // 400 ft long and 100 ft wide: keeps its length, grows to 160 ft wide.
        const long = { minX: -61, maxX: 61, minZ: -30, maxZ: 0 };
        const { footprint } = fixedFieldFootprint(long);
        expect(footprint.minX).toBe(long.minX);
        expect(footprint.maxX).toBe(long.maxX);
        expect((footprint.maxZ - footprint.minZ) / FT).toBeCloseTo(160);
        expect(footprint.minZ + footprint.maxZ).toBeCloseTo(-30);
    });

    it("keeps a football field with a small step as turf, without a field of its own", () => {
        const small = new FieldProperties({
            ...FieldPropertiesTemplates.PRO_FOOTBALL_FIELD_WITH_END_ZONES,
            stepSizeInches: 22,
        });
        expect(kitFieldStyle("markDiesel", small)).toBe("turf");
        const footprint = venueFootprint(small, "turf");
        expect((footprint.maxX - footprint.minX) / FT).toBeLessThan(359);
        const kit = buildMarkDiesel({
            footprint,
            params: { ...DIESEL_VENUE_PARAMS },
            quality: "low",
            fieldStyle: "turf",
        });
        expect(kit.root.getObjectByName("markDiesel.ownField")).toBeUndefined();
        kit.dispose();
    });

    it("lays a smaller floor on the turf as a tarp, and only in Mark Diesel", () => {
        const fp = FieldPropertiesTemplates;
        expect(kitFieldStyle("markDiesel", fp.INDOOR_50x80_8to5)).toBe("tarp");
        expect(
            kitFieldStyle("markDiesel", fp.PRO_FOOTBALL_FIELD_WITH_END_ZONES),
        ).toBe("turf");
        expect(
            kitFieldStyle(
                "markDiesel",
                fp.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES,
            ),
        ).toBe("turf");
        expect(kitFieldStyle("markDiesel", fp.SOUNDSPORT_8to5)).toBe("tarp");
        expect(kitFieldStyle("pro", fp.INDOOR_50x80_8to5)).toBe("turf");
    });

    it("builds without throwing and paints its own field under the floor", () => {
        const kit = buildMarkDiesel({
            footprint: indoor,
            params: { ...DIESEL_VENUE_PARAMS },
            quality: "low",
            fieldStyle: "tarp",
        });
        const field = kit.root.getObjectByName("markDiesel.ownField");
        expect(field).toBeDefined();
        expect(field!.position.x).toBeCloseTo((indoor.minX + indoor.maxX) / 2);
        expect(field!.position.z).toBeCloseTo((indoor.minZ + indoor.maxZ) / 2);
        kit.dispose();
        const pro = buildMarkDiesel({
            footprint: football,
            params: { ...DIESEL_VENUE_PARAMS },
            quality: "low",
            fieldStyle: "turf",
        });
        expect(pro.root.getObjectByName("markDiesel.ownField")).toBeUndefined();
        pro.dispose();
    });
});

describe("Mark Diesel's own lines", () => {
    const T = FieldPropertiesTemplates;

    it("puts the hashes 70 ft 9 in from each sideline and the numbers 36 to 42 ft", () => {
        const feet = (steps: number) =>
            (Math.abs(steps) * DIESEL_FIELD.stepSizeInches) / 12;
        const hash = (t: string) =>
            DIESEL_FIELD.yCheckpoints.find((c) => c.terseName === t)!;
        expect(feet(hash("FH").stepsFromCenterFront)).toBeCloseTo(70.75, 3);
        expect(160 - feet(hash("BH").stepsFromCenterFront)).toBeCloseTo(
            70.75,
            3,
        );
        const y = DIESEL_FIELD.yardNumberCoordinates;
        expect(feet(y.homeStepsFromFrontToOutside)).toBeCloseTo(36, 1);
        expect(feet(y.homeStepsFromFrontToInside)).toBeCloseTo(42, 1);
    });

    it("paints them in place of the show's only when asked, on turf, in Mark Diesel", () => {
        const hs = T.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES;
        expect(kitFieldProperties("markDiesel", hs, "stadium")).toBe(
            DIESEL_FIELD,
        );
        expect(kitFieldProperties("markDiesel", hs, "show")).toBe(hs);
        expect(kitFieldProperties("markDiesel", hs, undefined)).toBe(hs);
        // A floor stays a tarp; other stadiums have no lines of their own.
        const indoor = T.INDOOR_50x80_8to5;
        expect(kitFieldProperties("markDiesel", indoor, "stadium")).toBe(
            indoor,
        );
        expect(kitFieldProperties("pro", hs, "stadium")).toBe(hs);
    });

    it("lays them on the field the bowl is built round, whatever the show's step", () => {
        // An 18 in step makes the show's field 288 by 128 ft; the bowl grows
        // round its center, and the stadium's lines must fill it exactly.
        const small = new FieldProperties({
            ...T.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES,
            stepSizeInches: 18,
        });
        expect(kitFieldStyle("markDiesel", small)).toBe("turf");
        const painted = kitFieldProperties("markDiesel", small, "stadium");
        const kit = fixedFieldFootprint(
            venueFootprint(small, "turf"),
        ).footprint;
        const own = venueFootprint(painted, "turf");
        const mesh = new Object3D();
        placeKitField(mesh, painted, small, kit);
        const halfX = (own.maxX - own.minX) / 2;
        const halfZ = (own.maxZ - own.minZ) / 2;
        expect(mesh.position.x - halfX).toBeCloseTo(kit.minX, 2);
        expect(mesh.position.x + halfX).toBeCloseTo(kit.maxX, 2);
        expect(mesh.position.z - halfZ).toBeCloseTo(kit.minZ, 2);
        expect(mesh.position.z + halfZ).toBeCloseTo(kit.maxZ, 2);
        // The show's own lines stay where the show's field puts them.
        const shows = new Object3D();
        placeKitField(shows, small, small, kit);
        expect(shows.position.toArray()).toEqual([0, 0, 0]);
    });

    it("measures the arrow from the 4's slanted tip", () => {
        expect(blockOverhang("4")).toBeGreaterThan(0.05);
        for (const c of "012356789") expect(blockOverhang(c)).toBe(0);
    });
});

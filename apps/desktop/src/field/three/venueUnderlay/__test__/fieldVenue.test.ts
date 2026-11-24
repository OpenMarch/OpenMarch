import { describe, expect, it } from "vitest";
import { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { planField, type FieldRole } from "@/view3d/core/field";
import { DEFAULT_VENUE_PARAMS } from "@/view3d/core/venueSettings";
import {
    VENUE_LOOKS,
    planBaseColor,
    styleBaseColor,
    venueAround,
    venueLook,
    venuePasses,
    washedColor,
    withLightLines,
} from "../fieldVenue";

const fp = FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
const turf = planField({
    fieldProperties: fp,
    style: "turf",
    params: { ...DEFAULT_VENUE_PARAMS, endZoneText: "OPENMARCH" },
});
const roles = (items: { role: FieldRole }[]) =>
    new Set(items.map((i) => i.role));
const GRID_DRAWS: FieldRole[] = ["yardLine", "hash", "yardNumber", "border"];

describe("venueLook", () => {
    it("is null when the venue is off or unset", () => {
        expect(venueLook("off", "turf")).toBeNull();
        expect(venueLook(undefined, "turf")).toBeNull();
        expect(venueLook("faint", "turf")).toBe(VENUE_LOOKS.faint);
    });

    it("is null on a Field only venue, whatever look is kept for other shows", () => {
        expect(venueLook("full", "theme")).toBeNull();
        expect(venueLook("full", "tarp")).toBe(VENUE_LOOKS.full);
    });
});

describe("venueAround", () => {
    it("draws Turf edge only on stadium turf, and None elsewhere", () => {
        expect(venueAround(undefined, "turf")).toBe("edge");
        expect(venueAround("edge", "tarp")).toBe("field");
        expect(venueAround("stands", "tarp")).toBe("stands");
    });

    it("washes Faint lighter than Soft, and Soft lighter than Full color", () => {
        expect(VENUE_LOOKS.faint.amount).toBeLessThan(VENUE_LOOKS.soft.amount);
        expect(VENUE_LOOKS.soft.amount).toBeLessThan(VENUE_LOOKS.full.amount);
    });
});

describe("venuePasses", () => {
    it("leaves out what the 2D grid draws, and keeps the turf, end zones and logo", () => {
        const [pass, ...rest] = venuePasses(turf, VENUE_LOOKS.faint);
        expect(rest).toHaveLength(0);
        const kept = roles(pass.items);
        for (const role of GRID_DRAWS) expect(kept.has(role)).toBe(false);
        for (const role of [
            "background",
            "stripe",
            "endZone",
            "endZoneText",
            "centerLogo",
        ] as FieldRole[])
            expect(kept.has(role)).toBe(true);
    });

    it("keeps everything in Full color", () => {
        const [pass] = venuePasses(turf, VENUE_LOOKS.full);
        expect(pass.items).toHaveLength(turf.items.length);
    });

    it("paints only end zones, lightly, then the lettering and logo for Markings only", () => {
        const [zones, marks] = venuePasses(turf, VENUE_LOOKS.markings);
        expect(zones.alpha).toBeLessThan(1);
        expect(roles(zones.items)).toEqual(
            new Set(["endZone", "endZoneBorder"]),
        );
        expect(marks.alpha).toBe(1);
        expect(roles(marks.items)).toEqual(
            new Set(["endZoneText", "centerLogo"]),
        );
    });
});

describe("colors", () => {
    it("reads the turf's base color from the plan", () => {
        const [r, g, b] = planBaseColor(turf);
        expect(g).toBeGreaterThan(r);
        expect(g).toBeGreaterThan(b);
    });

    it("washes toward the background by the look's amount", () => {
        const white = { r: 255, g: 255, b: 255 };
        const base = styleBaseColor("turf", white);
        const faint = washedColor(white, base, VENUE_LOOKS.faint);
        const full = washedColor(white, base, VENUE_LOOKS.full);
        // Faint stays near white; Full color is far darker
        expect(faint.r).toBeGreaterThan(200);
        expect(full.g).toBeLessThan(faint.g);
        // Markings only leaves the background as it is
        expect(washedColor(white, base, VENUE_LOOKS.markings)).toBe(white);
    });

    it("draws the lines in light ink without touching the show's theme", () => {
        const light = withLightLines(fp);
        expect(light).toBeInstanceOf(FieldProperties);
        expect(light.theme.primaryStroke).toMatchObject({
            r: 255,
            g: 255,
            b: 255,
        });
        expect(fp.theme.primaryStroke).toMatchObject({ r: 0, g: 0, b: 0 });
        expect(light.width).toBe(fp.width);
    });
});

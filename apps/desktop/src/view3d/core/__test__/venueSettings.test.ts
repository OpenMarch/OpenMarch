import { describe, expect, it } from "vitest";
import FootballTemplates from "@/global/classes/fieldTemplates/Football";
import GridFieldTemplates from "@/global/classes/fieldTemplates/GridFields";
import {
    DEFAULT_VENUE_PARAMS,
    KIT_LIGHTING,
    VENUE_KIT_IDS,
    defaultVenueForField,
    defaultVenueForKit,
    fieldFamily,
    lightingForKit,
    parseVenueSettings,
    parseVenueSettingsJson,
    venueSettingsSchema,
    type VenueSettings,
} from "../venueSettings";

const valid: VenueSettings = {
    version: 1,
    kit: "college",
    lighting: "dusk",
    crowd: false,
    params: {
        homeColor: "#112233",
        awayColor: "#AABBCC",
        endZoneText: "TIGERS",
        endZoneColor: "#000000",
    },
};

describe("venueSettingsSchema", () => {
    it("accepts valid settings", () => {
        expect(venueSettingsSchema.parse(valid)).toEqual(valid);
    });

    it("accepts every kit with its default settings", () => {
        for (const kit of VENUE_KIT_IDS) {
            expect(
                venueSettingsSchema.safeParse(defaultVenueForKit(kit)).success,
            ).toBe(true);
        }
    });

    it("accepts an empty end-zone text", () => {
        const settings = {
            ...valid,
            params: { ...valid.params, endZoneText: "" },
        };
        expect(venueSettingsSchema.safeParse(settings).success).toBe(true);
    });

    it.each([
        ["a different version", { ...valid, version: 2 }],
        ["a missing version", { ...valid, version: undefined }],
        ["an unknown kit", { ...valid, kit: "arena" }],
        ["an unknown lighting preset", { ...valid, lighting: "noon" }],
        ["a non-boolean crowd", { ...valid, crowd: "yes" }],
        ["missing params", { ...valid, params: undefined }],
        [
            "a short hex color",
            { ...valid, params: { ...valid.params, homeColor: "#123" } },
        ],
        [
            "a named color",
            { ...valid, params: { ...valid.params, awayColor: "red" } },
        ],
        [
            "a color without #",
            { ...valid, params: { ...valid.params, endZoneColor: "1f2a5c" } },
        ],
        [
            "a non-string end-zone text",
            { ...valid, params: { ...valid.params, endZoneText: 5 } },
        ],
        ["null", null],
        ["a string", "hs"],
    ])("rejects %s", (_label, value) => {
        expect(venueSettingsSchema.safeParse(value).success).toBe(false);
        expect(() => parseVenueSettings(value)).toThrow();
    });
});

describe("lighting", () => {
    it("lists each kit's default among its presets", () => {
        for (const kit of VENUE_KIT_IDS) {
            const { presets, defaultLighting } = KIT_LIGHTING[kit];
            expect(presets).toContain(defaultLighting);
        }
    });

    it("keeps lighting the kit supports", () => {
        expect(lightingForKit("pro", "roofClosed")).toBe("roofClosed");
        expect(lightingForKit("gym", "show")).toBe("show");
    });

    it("falls back to the kit's default for unsupported lighting", () => {
        expect(lightingForKit("gym", "night")).toBe("house");
        expect(lightingForKit("hs", "roofClosed")).toBe("day");
        expect(lightingForKit("pro", "dusk")).toBe("roofClosed");
    });

    it("parseVenueSettings applies the fallback", () => {
        expect(
            parseVenueSettings({ ...valid, kit: "gym", lighting: "day" })
                .lighting,
        ).toBe("house");
    });
});

describe("parseVenueSettingsJson", () => {
    it("parses stored JSON", () => {
        expect(parseVenueSettingsJson(JSON.stringify(valid))).toEqual(valid);
    });

    it("returns undefined for malformed or invalid JSON", () => {
        expect(parseVenueSettingsJson("{not json")).toBeUndefined();
        expect(
            parseVenueSettingsJson(JSON.stringify({ ...valid, kit: "x" })),
        ).toBeUndefined();
    });
});

describe("defaultVenueForField", () => {
    it.each(Object.entries(FootballTemplates))(
        "uses hs for the football template %s",
        (_key, field) => {
            expect(fieldFamily(field)).toBe("football");
            expect(defaultVenueForField(field)).toEqual({
                version: 1,
                kit: "hs",
                lighting: "day",
                crowd: true,
                params: DEFAULT_VENUE_PARAMS,
            });
        },
    );

    it.each(Object.entries(GridFieldTemplates))(
        "uses gym for the grid template %s",
        (_key, field) => {
            expect(fieldFamily(field)).toBe("grid");
            expect(defaultVenueForField(field)).toEqual({
                version: 1,
                kit: "gym",
                lighting: "house",
                crowd: true,
                params: DEFAULT_VENUE_PARAMS,
            });
        },
    );

    it("recognizes renamed football and grid fields by their checkpoints", () => {
        const football =
            FootballTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
        const grid = GridFieldTemplates.INDOOR_50x80_8to5;
        expect(defaultVenueForField({ ...football, name: "Home" }).kit).toBe(
            "hs",
        );
        expect(
            defaultVenueForField({
                ...football,
                name: "Home",
                useHashes: false,
            }).kit,
        ).toBe("hs");
        expect(defaultVenueForField({ ...grid, name: "Winter" }).kit).toBe(
            "gym",
        );
    });

    it("uses blank for any other field", () => {
        expect(
            defaultVenueForField({
                name: "Parade route",
                useHashes: false,
                yCheckpoints: [],
            }),
        ).toEqual(defaultVenueForKit("blank"));
    });

    it("returns a fresh params object each time", () => {
        const field = GridFieldTemplates.INDOOR_40x60_8to5;
        const a = defaultVenueForField(field);
        a.params.homeColor = "#000000";
        expect(defaultVenueForField(field).params.homeColor).toBe("#6442ff");
        expect(DEFAULT_VENUE_PARAMS.homeColor).toBe("#6442ff");
    });
});

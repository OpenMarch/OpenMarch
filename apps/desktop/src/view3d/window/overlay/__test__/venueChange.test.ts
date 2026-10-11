import { describe, expect, it } from "vitest";
import { defaultVenueForKit } from "@/view3d/core/venueSettings";
import type { LightingPreset } from "@/view3d/core/types";
import { applyVenueChange, venueChanged } from "../venueChange";

const hsDusk = {
    ...defaultVenueForKit("hs"),
    lighting: "dusk" as const,
    params: {
        homeColor: "#112233",
        awayColor: "#445566",
        endZoneText: "HOME",
        endZoneColor: "#778899",
    },
};

describe("applyVenueChange", () => {
    it("keeps lighting the new kit supports, and the params", () => {
        const next = applyVenueChange(hsDusk, { kind: "kit", kit: "college" });
        expect(next).toEqual({ ...hsDusk, kit: "college" });
    });

    it("uses the new kit's default when it can't keep the lighting", () => {
        expect(
            applyVenueChange(hsDusk, { kind: "kit", kit: "gym" }).lighting,
        ).toBe("house");
        expect(
            applyVenueChange(hsDusk, { kind: "kit", kit: "pro" }).lighting,
        ).toBe("roofClosed");
    });

    it("changes lighting and crowd", () => {
        expect(
            applyVenueChange(hsDusk, { kind: "lighting", lighting: "night" }),
        ).toEqual({ ...hsDusk, lighting: "night" });
        expect(
            applyVenueChange(hsDusk, { kind: "crowd", crowd: false }),
        ).toEqual({ ...hsDusk, crowd: false });
    });

    it("moves lighting the kit doesn't support to its default", () => {
        const next = applyVenueChange(hsDusk, {
            kind: "lighting",
            lighting: "roofClosed",
        });
        expect(next.lighting).toBe("day");
    });

    it("merges params, keeping the ones not given", () => {
        const next = applyVenueChange(hsDusk, {
            kind: "params",
            params: { endZoneText: "EAGLES", homeColor: "#00aa00" },
        });
        expect(next.params).toEqual({
            ...hsDusk.params,
            endZoneText: "EAGLES",
            homeColor: "#00aa00",
        });
    });

    it("rejects a color that isn't #rrggbb", () => {
        expect(() =>
            applyVenueChange(hsDusk, {
                kind: "params",
                params: { awayColor: "red" },
            }),
        ).toThrow();
    });

    it("throws on settings that aren't valid", () => {
        expect(() =>
            applyVenueChange(hsDusk, {
                kind: "lighting",
                lighting: "disco" as LightingPreset,
            }),
        ).toThrow();
    });
});

describe("venueChanged", () => {
    it("compares kit, lighting, crowd and params", () => {
        expect(venueChanged(hsDusk, { ...hsDusk })).toBe(false);
        expect(venueChanged(hsDusk, { ...hsDusk, crowd: false })).toBe(true);
        expect(venueChanged(hsDusk, { ...hsDusk, lighting: "day" })).toBe(true);
        expect(venueChanged(hsDusk, { ...hsDusk, kit: "bighs" })).toBe(true);
        expect(
            venueChanged(hsDusk, {
                ...hsDusk,
                params: { ...hsDusk.params, endZoneText: "AWAY" },
            }),
        ).toBe(true);
        expect(
            venueChanged(hsDusk, { ...hsDusk, params: { ...hsDusk.params } }),
        ).toBe(false);
    });
});

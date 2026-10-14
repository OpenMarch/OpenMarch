import { describe, expect, it } from "vitest";
import {
    PLAUSIBLE_SIZE,
    WGI_MIN_EQUIPMENT_M,
    conversionsIntoRange,
    equipmentWgiNote,
    floorWgiNote,
    isPlausibleSize,
    type ModelKind,
} from "../checks";
import { SIZE_CATALOG, catalogDims, catalogEntries } from "../catalog";
import { toMeters } from "../units";

describe("plausible model sizes", () => {
    it("uses the spec's equipment range", () => {
        expect(PLAUSIBLE_SIZE.equipment).toEqual({ minM: 0.3, maxM: 3 });
        expect(isPlausibleSize("equipment", 1.8288)).toBe(true);
        expect(isPlausibleSize("equipment", 0.29)).toBe(false);
        expect(isPlausibleSize("equipment", 3.01)).toBe(false);
    });

    it("has a sane range for every kind", () => {
        for (const [kind, range] of Object.entries(PLAUSIBLE_SIZE))
            expect(range.minM, kind).toBeLessThan(range.maxM);
    });

    it("finds every catalog pole, rifle and sabre plausible as equipment", () => {
        for (const kind of ["pole", "swingPole", "rifle", "sabre"] as const)
            for (const entry of catalogEntries(kind)) {
                const dims = catalogDims(entry) as { length: { m: number } };
                expect(
                    isPlausibleSize("equipment", dims.length.m),
                    entry.id,
                ).toBe(true);
            }
    });

    it("finds every catalog floor plausible as a base floor", () => {
        for (const entry of catalogEntries("floor")) {
            const { width, depth } = catalogDims(entry);
            expect(
                isPlausibleSize("baseFloor", Math.max(width.m, depth.m)),
            ).toBe(true);
        }
    });

    it("offers the conversions that land in range", () => {
        // a 6 ft pole modeled in centimeters
        expect(conversionsIntoRange("equipment", 182.88)).toEqual([
            { unit: "cm", factor: 0.01 },
        ]);
        // a 36 in rifle modeled in inches: cm and in both land in range
        expect(
            conversionsIntoRange("equipment", 36).map((c) => c.unit),
        ).toEqual(["cm", "in"]);
        // a 60 x 90 ft floor modeled in feet
        expect(
            conversionsIntoRange("baseFloor", 90).map((c) => c.unit),
        ).toEqual(["ft"]);
    });

    it("offers nothing when no conversion fits", () => {
        expect(conversionsIntoRange("equipment", 100000)).toEqual([]);
    });

    it("never offers a conversion for a plausible size", () => {
        const kinds = Object.keys(PLAUSIBLE_SIZE) as ModelKind[];
        for (const kind of kinds)
            expect(
                conversionsIntoRange(kind, PLAUSIBLE_SIZE[kind].minM),
            ).toEqual([]);
    });
});

describe("WGI notes", () => {
    it("notes equipment under 24 in", () => {
        expect(WGI_MIN_EQUIPMENT_M).toBe(0.6096);
        expect(equipmentWgiNote(toMeters(23.875, "in"))).toMatchObject({
            tag: "WGI",
            code: "equipmentUnderMinimum",
        });
        expect(equipmentWgiNote(toMeters(24, "in"))).toBeNull();
        expect(equipmentWgiNote(toMeters(6, "ft"))).toBeNull();
    });

    it("notes floors over 78 x 106 ft either way round", () => {
        const ft = (v: number) => toMeters(v, "ft");
        expect(floorWgiNote(ft(106), ft(78))).toBeNull();
        expect(floorWgiNote(ft(78), ft(106))).toBeNull();
        expect(floorWgiNote(ft(90), ft(60))).toBeNull();
        expect(floorWgiNote(ft(107), ft(60))).toMatchObject({
            tag: "WGI",
            code: "floorOverMaximum",
        });
        expect(floorWgiNote(ft(80), ft(80))).not.toBeNull();
    });

    it("cites the WGI rules", () => {
        expect(equipmentWgiNote(0.1)?.source.name).toMatch(/WGI/);
        expect(floorWgiNote(100, 100)?.source.url).toMatch(/wgi\.org/);
    });

    it("raises no note for any catalog size", () => {
        for (const entry of SIZE_CATALOG) {
            if (entry.kind === "floor") {
                const { width, depth } = catalogDims(entry);
                expect(floorWgiNote(width.m, depth.m), entry.id).toBeNull();
            }
            if (
                entry.kind === "pole" ||
                entry.kind === "swingPole" ||
                entry.kind === "rifle" ||
                entry.kind === "sabre"
            ) {
                const { length } = catalogDims(entry) as {
                    length: { m: number };
                };
                expect(equipmentWgiNote(length.m), entry.id).toBeNull();
            }
        }
    });
});

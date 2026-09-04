import { describe, it, expect } from "vitest";
import {
    ENSEMBLE_SIZES,
    DEFAULT_ENSEMBLE_SIZE,
    ENSEMBLE_PRESETS,
    getEnsemblePreset,
    getEnsemblePresetTotal,
    getPresetMarchers,
    getEnsemblePresetKey,
} from "../EnsembleTemplates";
import { ACTIVITY_LABELS } from "../Activities";
import { SECTIONS, getSectionObjectByName } from "../Sections";

describe("EnsembleTemplates registry", () => {
    it("exposes sizes in order with a Medium default", () => {
        expect(ENSEMBLE_SIZES).toEqual(["Small", "Medium", "Large"]);
        expect(DEFAULT_ENSEMBLE_SIZE).toBe("Medium");
    });

    it("has a preset table for every activity label", () => {
        for (const label of ACTIVITY_LABELS) {
            expect(ENSEMBLE_PRESETS[label]).toBeDefined();
        }
    });

    it("only uses real section names as preset keys", () => {
        const known = new Set(Object.values(SECTIONS).map((s) => s.name));
        for (const table of Object.values(ENSEMBLE_PRESETS)) {
            for (const section of Object.keys(table)) {
                expect(known.has(section)).toBe(true);
            }
        }
    });
});

describe("getEnsemblePreset", () => {
    it("returns nonzero section counts for the chosen size", () => {
        const preset = getEnsemblePreset("Marching Band", "Small");
        const flute = preset.find((p) => p.section === "Flute");
        expect(flute?.count).toBe(4);
        expect(preset.every((p) => p.count > 0)).toBe(true);
    });

    it("skips sections with a zero count at that size", () => {
        const small = getEnsemblePreset("Marching Band", "Small");
        expect(small.find((p) => p.section === "Cymbals")).toBeUndefined();
        const medium = getEnsemblePreset("Marching Band", "Medium");
        expect(medium.find((p) => p.section === "Cymbals")?.count).toBe(2);
    });

    it("returns an empty list for Other and for unknown activities", () => {
        expect(getEnsemblePreset("Other", "Large")).toEqual([]);
        expect(getEnsemblePreset("Basket Weaving", "Large")).toEqual([]);
        expect(getEnsemblePreset(undefined, "Large")).toEqual([]);
    });
});

describe("getEnsemblePresetTotal", () => {
    it("sums every section count for the chosen size", () => {
        expect(getEnsemblePresetTotal("Marching Band", "Small")).toBe(39);
        expect(getEnsemblePresetTotal("Marching Band", "Medium")).toBe(72);
        expect(getEnsemblePresetTotal("Marching Band", "Large")).toBe(107);
    });

    it("is zero for Other and unknown activities", () => {
        expect(getEnsemblePresetTotal("Other", "Large")).toBe(0);
        expect(getEnsemblePresetTotal("Basket Weaving", "Medium")).toBe(0);
    });
});

describe("getPresetMarchers", () => {
    it("expands counts into marchers with per-section drill numbers", () => {
        const marchers = getPresetMarchers("Marching Band", "Small");
        const flutes = marchers.filter((m) => m.section === "Flute");
        expect(flutes).toHaveLength(4);
        const prefix = getSectionObjectByName("Flute").prefix;
        expect(flutes.map((m) => m.drill_order)).toEqual([1, 2, 3, 4]);
        expect(flutes.every((m) => m.drill_prefix === prefix)).toBe(true);
    });

    it("returns an empty list for Other", () => {
        expect(getPresetMarchers("Other", "Medium")).toEqual([]);
    });
});

describe("getEnsemblePresetKey", () => {
    it("builds a stable key from activity and size", () => {
        expect(getEnsemblePresetKey("Drum Corps", "Large")).toBe(
            "Drum Corps|Large",
        );
        expect(getEnsemblePresetKey(undefined, "Small")).toBe("|Small");
    });
});

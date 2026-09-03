import { describe, it, expect } from "vitest";
import type { DrillGrid } from "@openmarch/drill-interop";
import { resolveDrillField, matchTemplate } from "../resolveField";

/** A standard 8-to-5 high-school grid (matches the real sample fixture). */
const highSchoolGrid: DrillGrid = {
    border: { minX: -50, maxX: 50, minY: -26.25, maxY: 26.25 },
    stepsPerUnitX: 1.6,
    stepsPerUnitY: 1.6,
    sidelinesY: [-26.25, 26.25],
    hashesY: [-8.75, 8.75],
    yardLinesX: [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50],
    measurementSystem: "imperial",
    templateName: "default",
};

describe("matchTemplate", () => {
    it("matches a high-school grid to the HS football template", () => {
        const template = matchTemplate(highSchoolGrid);
        expect(template?.name).toBe(
            "High school football field (no end zones)",
        );
    });

    it("matches a college grid (32/53 hashes) to the college template", () => {
        // College hashes are 32 steps from the front sideline: 32 / 1.6 = 20
        // units, so relative to the front sideline (-26.25) they sit at ∓6.25.
        const collegeGrid: DrillGrid = {
            ...highSchoolGrid,
            hashesY: [-6.25, 6.25],
        };
        const template = matchTemplate(collegeGrid);
        expect(template?.name).toBe("College football field (no end zones)");
    });

    it("returns undefined for a non-standard (custom) grid", () => {
        const customGrid: DrillGrid = {
            border: { minX: -20, maxX: 20, minY: -15, maxY: 15 },
            stepsPerUnitX: 1.6,
            stepsPerUnitY: 1.6,
            sidelinesY: [-15, 15],
            hashesY: [],
            yardLinesX: [-20, -10, 0, 10, 20],
            measurementSystem: "imperial",
            templateName: "gym",
        };
        expect(matchTemplate(customGrid)).toBeUndefined();
    });
});

describe("resolveDrillField", () => {
    it("returns the matched HS template for a standard grid", () => {
        const field = resolveDrillField(highSchoolGrid);
        expect(field.isCustom).toBe(false);
        expect(field.name).toContain("High school");
    });

    it("builds a custom field from an unmatched grid's landmarks", () => {
        const customGrid: DrillGrid = {
            border: { minX: -20, maxX: 20, minY: -15, maxY: 15 },
            stepsPerUnitX: 1.6,
            stepsPerUnitY: 1.6,
            sidelinesY: [-15, 15],
            hashesY: [-5],
            yardLinesX: [-20, 0, 20],
            measurementSystem: "imperial",
            templateName: "gym",
        };
        const field = resolveDrillField(customGrid);

        expect(field.isCustom).toBe(true);
        expect(field.name).toContain("gym");

        // The source front sideline is its largest y (+15); the back is -15, so
        // the field is 30 units -> 30 * 1.6 = 48 steps deep.
        const backSideline = Math.min(
            ...field.yCheckpoints.map((c) => c.stepsFromCenterFront),
        );
        expect(backSideline).toBeCloseTo(-48, 5);

        // The hash at -5 units is 20 units behind the front sideline -> 32 steps.
        const hash = field.yCheckpoints.find((c) => /hash/i.test(c.name));
        expect(hash?.stepsFromCenterFront).toBeCloseTo(-32, 5);

        // Widest yard line: 20 units * 1.6 = 32 steps from center.
        const halfWidth = Math.max(
            ...field.xCheckpoints.map((c) => Math.abs(c.stepsFromCenterFront)),
        );
        expect(halfWidth).toBeCloseTo(32, 5);
    });
});

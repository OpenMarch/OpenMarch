import { describe, it, expect } from "vitest";
import { deriveMarcherFromLabel, sourcePointToPixels } from "../drillTransform";
import type { DrillGrid } from "@openmarch/drill-interop";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";

describe("deriveMarcherFromLabel", () => {
    it("splits a label into an alphabetic prefix and numeric order", () => {
        const trumpet = deriveMarcherFromLabel("T3");
        expect(trumpet.drill_prefix).toBe("T");
        expect(trumpet.drill_order).toBe(3);
        expect(trumpet.section).toBe("Trumpet");
    });

    it("maps a color guard label to its section", () => {
        const guard = deriveMarcherFromLabel("G10");
        expect(guard.drill_prefix).toBe("G");
        expect(guard.drill_order).toBe(10);
        expect(guard.section).toBe("Color Guard");
    });

    it("maps a truly unknown prefix to the Other section", () => {
        const derived = deriveMarcherFromLabel("ZZ5");
        expect(derived.drill_prefix).toBe("ZZ");
        expect(derived.section).toBe("Other");
    });

    it("handles labels without a number", () => {
        const derived = deriveMarcherFromLabel("X");
        expect(derived.drill_prefix).toBe("X");
        expect(derived.drill_order).toBe(0);
    });

    it("maps TS labels to tenor sax", () => {
        const derived = deriveMarcherFromLabel("TS1");
        expect(derived.drill_prefix).toBe("TS");
        expect(derived.drill_order).toBe(1);
        expect(derived.section).toBe("Tenor Sax");
    });

    it("maps BS labels to bass drum", () => {
        const derived = deriveMarcherFromLabel("BS1");
        expect(derived.section).toBe("Bass Drum");
    });
});

describe("sourcePointToPixels", () => {
    // A standard 8-to-5 high-school grid: sidelines at ±26.25 units, hashes at
    // ±8.75 units, 1.6 steps per unit (so the field is 84 steps deep).
    const grid: DrillGrid = {
        border: { minX: -50, maxX: 50, minY: -26.25, maxY: 26.25 },
        stepsPerUnitX: 1.6,
        stepsPerUnitY: 1.6,
        sidelinesY: [-26.25, 26.25],
        hashesY: [-8.75, 8.75],
        yardLinesX: [-50, -25, 0, 25, 50],
        measurementSystem: "imperial",
        templateName: "default",
    };
    const field =
        FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
    const pps = field.pixelsPerStep;
    const cfp = field.centerFrontPoint;

    // Steps behind the front sideline -> canvas pixels (negative goes up).
    const yForSteps = (stepsBehindFront: number) =>
        cfp.yPixels - stepsBehindFront * pps;

    // The source's front (audience) sideline is its LARGEST y, +26.25.
    it("places the center-front source point on the field's center front", () => {
        const p = sourcePointToPixels({ x: 0, y: 26.25 }, grid, field);
        expect(p.x).toBeCloseTo(cfp.xPixels, 5);
        expect(p.y).toBeCloseTo(cfp.yPixels, 5);
    });

    it("places the front hash exactly 28 steps behind the front sideline", () => {
        const p = sourcePointToPixels({ x: 0, y: 8.75 }, grid, field);
        expect(p.x).toBeCloseTo(cfp.xPixels, 5);
        expect(p.y).toBeCloseTo(yForSteps(28), 5);
    });

    it("places the back hash exactly 56 steps behind the front sideline", () => {
        const p = sourcePointToPixels({ x: 0, y: -8.75 }, grid, field);
        expect(p.y).toBeCloseTo(yForSteps(56), 5);
    });

    it("places the back sideline at its true depth (84 steps), not stretched", () => {
        const p = sourcePointToPixels({ x: 0, y: -26.25 }, grid, field);
        expect(p.y).toBeCloseTo(yForSteps(84), 5);
    });

    it("does not flip the field front-to-back", () => {
        // The source front sideline must land nearer the bottom of the canvas
        // (larger pixel y) than the source back sideline.
        const front = sourcePointToPixels({ x: 0, y: 26.25 }, grid, field);
        const back = sourcePointToPixels({ x: 0, y: -26.25 }, grid, field);
        expect(front.y).toBeGreaterThan(back.y);
    });

    it("converts x by true step size (side 2 is positive)", () => {
        // The 50 (x = 25 units from center) is 40 steps toward side 2.
        const p = sourcePointToPixels({ x: 25, y: 26.25 }, grid, field);
        expect(p.x).toBeCloseTo(cfp.xPixels + 40 * pps, 5);
    });
});

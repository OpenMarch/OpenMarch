import { describe, it, expect } from "vitest";
import {
    backSidelineUnits,
    centerUnitsY,
    fieldDepthSteps,
    frontSidelineUnits,
    stepsFromNearestSideline,
    yUnitsToStepsFromCenter,
    yUnitsToStepsFromCenterFront,
} from "../coords";
import type { DrillGrid } from "../types";

/** The standard high-school sample grid (1.6 steps/unit, sidelines at ±26.25). */
const GRID: DrillGrid = {
    border: { minX: -50, minY: -26.25, maxX: 50, maxY: 26.25 },
    stepsPerUnitX: 1.6,
    stepsPerUnitY: 1.6,
    sidelinesY: [-26.25, 26.25],
    hashesY: [-8.75, 8.75],
    yardLinesX: [],
    measurementSystem: "imperial",
};

/**
 * The source measures Y positive toward the audience, the opposite of
 * OpenMarch. Getting this backwards flips the whole show front-to-back, and the
 * mistake reads as plausible either way, so it is pinned here rather than left
 * to a doc comment.
 *
 * Ground truth: in a real export the section the designer labeled `FRONT` — the
 * front ensemble — sits at +43 steps from center, one step past the +42 sideline.
 * Positive is the front.
 */
describe("field orientation", () => {
    it("treats the largest sideline value as the front", () => {
        expect(frontSidelineUnits(GRID)).toBe(26.25);
        expect(backSidelineUnits(GRID)).toBe(-26.25);
        expect(frontSidelineUnits(GRID)).toBeGreaterThan(
            backSidelineUnits(GRID),
        );
    });

    it("is not fooled by the order of sidelinesY", () => {
        const reversed: DrillGrid = { ...GRID, sidelinesY: [26.25, -26.25] };
        expect(frontSidelineUnits(reversed)).toBe(26.25);
        expect(backSidelineUnits(reversed)).toBe(-26.25);
    });

    it("measures steps from center positive toward the front", () => {
        // The front ensemble's real position: past the front sideline.
        expect(yUnitsToStepsFromCenter(28.125, GRID)).toBeCloseTo(45, 5);
        // Deep field, toward the back sideline.
        expect(yUnitsToStepsFromCenter(-16.25, GRID)).toBeCloseTo(-26, 5);
        expect(centerUnitsY(GRID)).toBe(0);
    });

    it("measures steps from center-front negative toward the back", () => {
        expect(yUnitsToStepsFromCenterFront(26.25, GRID)).toBeCloseTo(0, 5);
        expect(yUnitsToStepsFromCenterFront(-26.25, GRID)).toBeCloseTo(-84, 5);
        expect(fieldDepthSteps(GRID)).toBeCloseTo(84, 5);
    });

    it("reports sideline distance unsigned, from whichever line is nearer", () => {
        // Three steps past the front sideline and three steps past the back one
        // are the same distance; the helper does not say which.
        expect(stepsFromNearestSideline({ x: 0, y: 28.125 }, GRID)).toBeCloseTo(
            3,
            5,
        );
        expect(
            stepsFromNearestSideline({ x: 0, y: -28.125 }, GRID),
        ).toBeCloseTo(3, 5);
        expect(stepsFromNearestSideline({ x: 0, y: 0 }, GRID)).toBeCloseTo(
            42,
            5,
        );
    });
});

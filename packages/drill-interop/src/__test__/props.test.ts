import { describe, it, expect } from "vitest";
import { isLikelyPropPosition, isLikelyReferenceMarker } from "../props";
import type { DrillGrid } from "../types";

/** The standard high-school sample grid (1.6 steps/unit, front sideline +26.25). */
const SAMPLE_GRID: DrillGrid = {
    border: { minX: -50, minY: -26.25, maxX: 50, maxY: 26.25 },
    stepsPerUnitX: 1.6,
    stepsPerUnitY: 1.6,
    sidelinesY: [-26.25, 26.25],
    hashesY: [-8.75, 8.75],
    yardLinesX: [],
    measurementSystem: "imperial",
};

describe("isLikelyReferenceMarker", () => {
    it("flags sideline and endline ticks", () => {
        expect(isLikelyReferenceMarker({ x: 0, y: 26.25 }, SAMPLE_GRID)).toBe(
            true,
        );
        expect(isLikelyReferenceMarker({ x: -20, y: 26.25 }, SAMPLE_GRID)).toBe(
            true,
        );
        expect(isLikelyReferenceMarker({ x: -50, y: 0 }, SAMPLE_GRID)).toBe(
            true,
        );
    });

    it("flags center reference dots and near-sideline arcs", () => {
        expect(
            isLikelyReferenceMarker({ x: -3.75, y: 1.25 }, SAMPLE_GRID),
        ).toBe(true);
        expect(
            isLikelyReferenceMarker({ x: -5.2, y: 25.01 }, SAMPLE_GRID),
        ).toBe(true);
    });

    it("does not flag interior prop positions", () => {
        expect(
            isLikelyReferenceMarker({ x: 13.31, y: -6.67 }, SAMPLE_GRID),
        ).toBe(false);
        expect(isLikelyReferenceMarker({ x: -35, y: 8.75 }, SAMPLE_GRID)).toBe(
            false,
        );
        expect(isLikelyPropPosition({ x: 13.31, y: -6.67 }, SAMPLE_GRID)).toBe(
            true,
        );
        expect(isLikelyPropPosition({ x: 5, y: 22.5 }, SAMPLE_GRID)).toBe(
            false,
        );
    });
});

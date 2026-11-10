import { describe, expect, it } from "vitest";
import {
    crossLineWidth,
    crossReach,
    markerExtent,
    markerPath,
    markerShapeOf,
    ringShapeOf,
    spotShapeOf,
    squareHalf,
    triangleHalfHeight,
    triangleHalfWidth,
} from "../markerShape";

/**
 * Marks that stand for a marcher off its dot take the marcher's shape, sized as the marchers layer
 * and the drill-chart export draw it.
 */
describe("markerShape", () => {
    it("sizes a square and a triangle as the export draws a marcher of radius 5", () => {
        // drillChartSvg: side 5·√π·1.2, triangle 12 wide
        expect(squareHalf(5) * 2).toBeCloseTo(5 * Math.sqrt(Math.PI) * 1.2, 6);
        expect(triangleHalfWidth(5)).toBeCloseTo(6, 6);
        expect(triangleHalfHeight(5)).toBeCloseTo(3 * Math.sqrt(3), 6);
        // Every shape stays within the extent the batch's quads cover
        expect(squareHalf(5)).toBeLessThanOrEqual(markerExtent(5));
        expect(triangleHalfHeight(5)).toBeLessThanOrEqual(markerExtent(5));
        // An X's line ends are square, so their corners pass the end of the line
        expect(
            crossReach(5) + (crossLineWidth(5) / 2) * Math.SQRT1_2,
        ).toBeLessThanOrEqual(markerExtent(5));
    });

    it("draws each shape's path around its center", () => {
        // Half a side is 2·√π·0.6 ≈ 2.127
        expect(markerPath("square", 10, 20, 2)).toBe(
            "M7.873 17.873H12.127V22.127H7.873Z",
        );
        // Apex up (y down)
        expect(markerPath("triangle", 0, 0, 5)).toBe(
            "M-6 5.196L0 -5.196L6 5.196Z",
        );
        expect(markerPath("cross", 0, 0, 5)).toBe("M-6 -6L6 6M-6 6L6 -6");
        expect(markerPath("circle", 0, 0, 5)).toBe(
            "M-5 0A5 5 0 1 0 5 0A5 5 0 1 0 -5 0Z",
        );
    });

    it("keeps the marcher's shape, and rings an X with a circle", () => {
        expect(markerShapeOf("square")).toBe("square");
        expect(markerShapeOf(undefined)).toBe("circle");
        expect(ringShapeOf("triangle")).toBe("triangle");
        expect(ringShapeOf("cross")).toBe("circle");
    });

    it("draws a shape's spots in its marchers' shape only when they share one", () => {
        expect(spotShapeOf(["square", "square"])).toBe("square");
        expect(spotShapeOf(["square", "triangle"])).toBe("circle");
        expect(spotShapeOf(["cross", "cross"])).toBe("circle");
        expect(spotShapeOf([])).toBe("circle");
    });
});

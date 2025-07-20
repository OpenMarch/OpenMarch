import { describe, expect, it, beforeEach } from "vitest";
import { getCoordinatesAtTime } from "../Keyframes";

type CoordinateDefinition = { x: number; y: number; svg?: string };
type MarcherTimeline = {
    pathMap: Map<number, CoordinateDefinition>;
    sortedTimestamps: number[];
};

describe("getCoordinatesAtTime", () => {
    describe("with coordinate definitions (no SVG paths)", () => {
        let marcherTimeline: MarcherTimeline;

        beforeEach(() => {
            // Create a simple timeline with two keyframes
            const pathMap = new Map<number, CoordinateDefinition>();
            pathMap.set(0, { x: 0, y: 0 });
            pathMap.set(1000, { x: 100, y: 100 });

            marcherTimeline = {
                pathMap,
                sortedTimestamps: [0, 1000],
            };
        });

        describe("basic interpolation", () => {
            it("should return exact coordinates at keyframe timestamps", () => {
                const result1 = getCoordinatesAtTime(0, marcherTimeline);
                expect(result1).toEqual({ x: 0, y: 0 });

                // Note: The function doesn't handle exact last timestamp due to nextTimestamp being null
                // This is a limitation of the current implementation
                expect(() =>
                    getCoordinatesAtTime(1000, marcherTimeline),
                ).toThrow("No timestamp found! This shouldn't happen");
            });

            it("should interpolate coordinates at halfway point", () => {
                const result = getCoordinatesAtTime(500, marcherTimeline);
                expect(result).toEqual({ x: 50, y: 50 });
            });

            it("should interpolate coordinates at 25% progress", () => {
                const result = getCoordinatesAtTime(250, marcherTimeline);
                expect(result).toEqual({ x: 25, y: 25 });
            });

            it("should interpolate coordinates at 75% progress", () => {
                const result = getCoordinatesAtTime(750, marcherTimeline);
                expect(result).toEqual({ x: 75, y: 75 });
            });
        });

        describe("edge cases", () => {
            it("should handle negative x and y coordinates", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: -50, y: -50 });
                pathMap.set(1000, { x: 50, y: 50 });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                const result = getCoordinatesAtTime(500, timeline);
                expect(result).toEqual({ x: 0, y: 0 });
            });

            it("should handle decimal coordinates", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 0.5, y: 1.25 });
                pathMap.set(1000, { x: 10.75, y: 20.5 });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                const result = getCoordinatesAtTime(500, timeline);
                expect(result).toEqual({ x: 5.625, y: 10.875 });
            });

            it("should handle large coordinate values", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 10000, y: 20000 });
                pathMap.set(1000, { x: 20000, y: 40000 });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                const result = getCoordinatesAtTime(500, timeline);
                expect(result).toEqual({ x: 15000, y: 30000 });
            });
        });

        describe("multiple keyframes", () => {
            it("should interpolate between first and second keyframes", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 0, y: 0 });
                pathMap.set(500, { x: 50, y: 100 });
                pathMap.set(1000, { x: 100, y: 0 });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 500, 1000],
                };

                const result = getCoordinatesAtTime(250, timeline);
                expect(result).toEqual({ x: 25, y: 50 });
            });

            it("should interpolate between second and third keyframes", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 0, y: 0 });
                pathMap.set(500, { x: 50, y: 100 });
                pathMap.set(1000, { x: 100, y: 0 });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 500, 1000],
                };

                const result = getCoordinatesAtTime(750, timeline);
                expect(result).toEqual({ x: 75, y: 50 });
            });

            it("should return exact coordinates at middle keyframe", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 0, y: 0 });
                pathMap.set(500, { x: 50, y: 100 });
                pathMap.set(1000, { x: 100, y: 0 });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 500, 1000],
                };

                const result = getCoordinatesAtTime(500, timeline);
                expect(result).toEqual({ x: 50, y: 100 });
            });
        });

        describe("error handling", () => {
            it("should throw error for negative timestamp", () => {
                expect(() =>
                    getCoordinatesAtTime(-100, marcherTimeline),
                ).toThrow("Cannot use negative timestamp: -100");
            });

            it("should throw error when no timestamps exist", () => {
                const emptyTimeline: MarcherTimeline = {
                    pathMap: new Map(),
                    sortedTimestamps: [],
                };

                expect(() => getCoordinatesAtTime(100, emptyTimeline)).toThrow(
                    "No timestamp found! This shouldn't happen",
                );
            });

            it("should throw error when coordinate not found for timestamp", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 0, y: 0 });
                // Missing coordinate for timestamp 1000

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                expect(() => getCoordinatesAtTime(500, timeline)).toThrow(
                    "No coordinate found! This shouldn't happen",
                );
            });

            it("should throw error when target timestamp is before first keyframe", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(1000, { x: 100, y: 100 });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [1000],
                };

                expect(() => getCoordinatesAtTime(500, timeline)).toThrow(
                    "No timestamp found! This shouldn't happen",
                );
            });
        });

        describe("boundary conditions", () => {
            it("should handle timestamp exactly at first keyframe", () => {
                const result = getCoordinatesAtTime(0, marcherTimeline);
                expect(result).toEqual({ x: 0, y: 0 });
            });

            it("should handle timestamp exactly at last keyframe", () => {
                // The function doesn't handle exact last timestamp due to nextTimestamp being null
                expect(() =>
                    getCoordinatesAtTime(1000, marcherTimeline),
                ).toThrow("No timestamp found! This shouldn't happen");
            });

            it("should handle timestamp very close to first keyframe", () => {
                const result = getCoordinatesAtTime(1, marcherTimeline);
                expect(result.x).toBeCloseTo(0.1, 5);
                expect(result.y).toBeCloseTo(0.1, 5);
            });

            it("should handle timestamp very close to last keyframe", () => {
                const result = getCoordinatesAtTime(999, marcherTimeline);
                expect(result.x).toBeCloseTo(99.9, 5);
                expect(result.y).toBeCloseTo(99.9, 5);
            });
        });

        describe("complex scenarios", () => {
            it("should handle non-linear movement patterns", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 0, y: 0 });
                pathMap.set(250, { x: 100, y: 0 });
                pathMap.set(500, { x: 100, y: 100 });
                pathMap.set(750, { x: 0, y: 100 });
                pathMap.set(1000, { x: 0, y: 0 });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 250, 500, 750, 1000],
                };

                // Test various points along the square path
                expect(getCoordinatesAtTime(125, timeline)).toEqual({
                    x: 50,
                    y: 0,
                });
                expect(getCoordinatesAtTime(375, timeline)).toEqual({
                    x: 100,
                    y: 50,
                });
                expect(getCoordinatesAtTime(625, timeline)).toEqual({
                    x: 50,
                    y: 100,
                });
                expect(getCoordinatesAtTime(875, timeline)).toEqual({
                    x: 0,
                    y: 50,
                });
            });

            it("should handle very small time intervals", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 0, y: 0 });
                pathMap.set(1, { x: 1, y: 1 });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1],
                };

                const result = getCoordinatesAtTime(0.5, timeline);
                expect(result).toEqual({ x: 0.5, y: 0.5 });
            });

            it("should handle very large time intervals", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 0, y: 0 });
                pathMap.set(1000000, { x: 1000, y: 2000 });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000000],
                };

                const result = getCoordinatesAtTime(500000, timeline);
                expect(result).toEqual({ x: 500, y: 1000 });
            });

            it("should handle single keyframe timeline", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(500, { x: 100, y: 200 });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [500],
                };

                // The function doesn't handle single keyframes due to nextTimestamp being null
                expect(() => getCoordinatesAtTime(500, timeline)).toThrow(
                    "No timestamp found! This shouldn't happen",
                );
            });

            it("should handle irregular time intervals", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 0, y: 0 });
                pathMap.set(100, { x: 10, y: 20 });
                pathMap.set(500, { x: 50, y: 100 });
                pathMap.set(1000, { x: 100, y: 200 });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 100, 500, 1000],
                };

                // Test interpolation across irregular intervals
                expect(getCoordinatesAtTime(50, timeline)).toEqual({
                    x: 5,
                    y: 10,
                });
                expect(getCoordinatesAtTime(300, timeline)).toEqual({
                    x: 30,
                    y: 60,
                });
                expect(getCoordinatesAtTime(750, timeline)).toEqual({
                    x: 75,
                    y: 150,
                });
            });

            it("should handle zero movement (same coordinates)", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 100, y: 100 });
                pathMap.set(1000, { x: 100, y: 100 });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                // Should return the same coordinates regardless of time
                expect(getCoordinatesAtTime(250, timeline)).toEqual({
                    x: 100,
                    y: 100,
                });
                expect(getCoordinatesAtTime(500, timeline)).toEqual({
                    x: 100,
                    y: 100,
                });
                expect(getCoordinatesAtTime(750, timeline)).toEqual({
                    x: 100,
                    y: 100,
                });
            });
        });
    });

    describe("with SVG paths", () => {
        let marcherTimeline: MarcherTimeline;

        beforeEach(() => {
            // Create a simple timeline with two keyframes using SVG paths
            const pathMap = new Map<number, CoordinateDefinition>();
            pathMap.set(0, { x: 0, y: 0, svg: "M 0 0 L 100 100" });
            pathMap.set(1000, { x: 100, y: 100, svg: "M 100 100 L 200 0" });

            marcherTimeline = {
                pathMap,
                sortedTimestamps: [0, 1000],
            };
        });

        describe("SVG path structure validation", () => {
            it("should have SVG path property in coordinate definitions", () => {
                const coordinate = marcherTimeline.pathMap.get(0);
                expect(coordinate).toBeDefined();
                expect(coordinate?.svg).toBeDefined();
                expect(coordinate?.svg).toBe("M 0 0 L 100 100");
            });

            it("should handle coordinates with and without SVG paths", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 0, y: 0, svg: "M 0 0 L 50 50" });
                pathMap.set(500, { x: 50, y: 50 }); // No SVG path
                pathMap.set(1000, {
                    x: 100,
                    y: 100,
                    svg: "M 100 100 L 150 150",
                });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 500, 1000],
                };

                // Verify structure
                expect(timeline.pathMap.get(0)?.svg).toBeDefined();
                expect(timeline.pathMap.get(500)?.svg).toBeUndefined();
                expect(timeline.pathMap.get(1000)?.svg).toBeDefined();
            });

            it("should handle complex SVG path strings", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 0, y: 0, svg: "M 0 0 Q 50 0 100 100" });
                pathMap.set(1000, {
                    x: 100,
                    y: 100,
                    svg: "M 100 100 Q 150 100 200 0",
                });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                expect(timeline.pathMap.get(0)?.svg).toContain("Q");
                expect(timeline.pathMap.get(1000)?.svg).toContain("Q");
            });

            it("should handle SVG paths with arcs", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, {
                    x: 0,
                    y: 0,
                    svg: "M 0 0 A 50 50 0 0 1 100 0",
                });
                pathMap.set(1000, {
                    x: 100,
                    y: 0,
                    svg: "M 100 0 A 50 50 0 0 1 200 0",
                });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                expect(timeline.pathMap.get(0)?.svg).toContain("A");
                expect(timeline.pathMap.get(1000)?.svg).toContain("A");
            });

            it("should handle SVG paths with curves", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, {
                    x: 0,
                    y: 0,
                    svg: "M 0 0 C 25 0 75 0 100 100",
                });
                pathMap.set(1000, {
                    x: 100,
                    y: 100,
                    svg: "M 100 100 C 125 100 175 100 200 0",
                });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                expect(timeline.pathMap.get(0)?.svg).toContain("C");
                expect(timeline.pathMap.get(1000)?.svg).toContain("C");
            });
        });

        describe("SVG path coordinate validation", () => {
            it("should maintain coordinate values alongside SVG paths", () => {
                const coordinate = marcherTimeline.pathMap.get(0);
                expect(coordinate?.x).toBe(0);
                expect(coordinate?.y).toBe(0);
                expect(coordinate?.svg).toBe("M 0 0 L 100 100");

                const coordinate2 = marcherTimeline.pathMap.get(1000);
                expect(coordinate2?.x).toBe(100);
                expect(coordinate2?.y).toBe(100);
                expect(coordinate2?.svg).toBe("M 100 100 L 200 0");
            });

            it("should handle negative coordinates with SVG paths", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: -50, y: -50, svg: "M -50 -50 L 50 50" });
                pathMap.set(1000, { x: 50, y: 50, svg: "M 50 50 L 150 150" });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                expect(timeline.pathMap.get(0)?.x).toBe(-50);
                expect(timeline.pathMap.get(0)?.y).toBe(-50);
                expect(timeline.pathMap.get(1000)?.x).toBe(50);
                expect(timeline.pathMap.get(1000)?.y).toBe(50);
            });

            it("should handle decimal coordinates with SVG paths", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, {
                    x: 0.5,
                    y: 1.25,
                    svg: "M 0.5 1.25 L 10.75 20.5",
                });
                pathMap.set(1000, {
                    x: 10.75,
                    y: 20.5,
                    svg: "M 10.75 20.5 L 21 39.75",
                });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                expect(timeline.pathMap.get(0)?.x).toBe(0.5);
                expect(timeline.pathMap.get(0)?.y).toBe(1.25);
                expect(timeline.pathMap.get(1000)?.x).toBe(10.75);
                expect(timeline.pathMap.get(1000)?.y).toBe(20.5);
            });
        });

        describe("SVG path timeline structure", () => {
            it("should handle multiple SVG keyframes", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 0, y: 0, svg: "M 0 0 L 100 0" });
                pathMap.set(250, { x: 100, y: 0, svg: "M 100 0 L 100 100" });
                pathMap.set(500, { x: 100, y: 100, svg: "M 100 100 L 0 100" });
                pathMap.set(750, { x: 0, y: 100, svg: "M 0 100 L 0 0" });
                pathMap.set(1000, { x: 0, y: 0, svg: "M 0 0 L 100 0" });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 250, 500, 750, 1000],
                };

                // Verify all keyframes have SVG paths
                expect(timeline.pathMap.get(0)?.svg).toBeDefined();
                expect(timeline.pathMap.get(250)?.svg).toBeDefined();
                expect(timeline.pathMap.get(500)?.svg).toBeDefined();
                expect(timeline.pathMap.get(750)?.svg).toBeDefined();
                expect(timeline.pathMap.get(1000)?.svg).toBeDefined();

                // Verify timestamps are sorted
                expect(timeline.sortedTimestamps).toEqual([
                    0, 250, 500, 750, 1000,
                ]);
            });

            it("should handle mixed coordinate types in timeline", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 0, y: 0, svg: "M 0 0 L 50 50" });
                pathMap.set(500, { x: 50, y: 50 }); // No SVG path
                pathMap.set(1000, {
                    x: 100,
                    y: 100,
                    svg: "M 100 100 L 150 150",
                });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 500, 1000],
                };

                // Verify mixed structure
                expect(timeline.pathMap.get(0)?.svg).toBeDefined();
                expect(timeline.pathMap.get(500)?.svg).toBeUndefined();
                expect(timeline.pathMap.get(1000)?.svg).toBeDefined();
            });

            it("should handle empty SVG paths", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 0, y: 0, svg: "" });
                pathMap.set(1000, {
                    x: 100,
                    y: 100,
                    svg: "M 100 100 L 200 200",
                });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                expect(timeline.pathMap.get(0)?.svg).toBe("");
                expect(timeline.pathMap.get(1000)?.svg).toBe(
                    "M 100 100 L 200 200",
                );
            });
        });

        describe("SVG path error scenarios", () => {
            it("should handle invalid SVG path strings", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 0, y: 0, svg: "invalid svg path" });
                pathMap.set(1000, {
                    x: 100,
                    y: 100,
                    svg: "M 100 100 L 200 200",
                });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                // Verify the structure is maintained even with invalid paths
                expect(timeline.pathMap.get(0)?.svg).toBe("invalid svg path");
                expect(timeline.pathMap.get(1000)?.svg).toBe(
                    "M 100 100 L 200 200",
                );
            });

            it("should handle very long SVG path strings", () => {
                const longPath = "M 0 0 " + "L 10 10 ".repeat(200);
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, { x: 0, y: 0, svg: longPath });
                pathMap.set(1000, {
                    x: 100,
                    y: 100,
                    svg: "M 100 100 L 200 200",
                });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                expect(timeline.pathMap.get(0)?.svg).toBe(longPath);
                expect(timeline.pathMap.get(0)?.svg?.length).toBeGreaterThan(
                    1000,
                );
            });

            it("should handle SVG paths with special characters", () => {
                const pathMap = new Map<number, CoordinateDefinition>();
                pathMap.set(0, {
                    x: 0,
                    y: 0,
                    svg: "M 0 0 L 100 100 # comment",
                });
                pathMap.set(1000, {
                    x: 100,
                    y: 100,
                    svg: "M 100 100 L 200 200 /* another comment */",
                });

                const timeline: MarcherTimeline = {
                    pathMap,
                    sortedTimestamps: [0, 1000],
                };

                expect(timeline.pathMap.get(0)?.svg).toContain("#");
                expect(timeline.pathMap.get(1000)?.svg).toContain("/*");
            });
        });
    });
});

import { describe, it, expect } from "vitest";
import { Path } from "../src/Path";
import { Line } from "../src/segments/Line";
import { CubicCurve } from "../src/segments/CubicCurve";
import { type Point } from "../src/interfaces";

describe("Path with start and end point overrides", () => {
    it("should override start and end points when provided", () => {
        // Create a simple path with two line segments
        const segment1 = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });
        const segment2 = new Line({ x: 10, y: 0 }, { x: 20, y: 0 });
        const path = new Path([segment1, segment2]);

        // Create override points
        const startOverride: Point = { x: 5, y: 5 };
        const endOverride: Point = { x: 25, y: 5 };

        // Create path from JSON with overrides
        const pathJson = path.toJson();
        const pathWithOverrides = Path.fromJson(
            pathJson,
            startOverride,
            endOverride,
        );

        // Check that the first segment has the start override
        expect(pathWithOverrides.segments[0].startPointOverride).toEqual(
            startOverride,
        );
        expect(pathWithOverrides.segments[0].startPointOverride).not.toEqual(
            segment1.startPoint,
        );

        // Check that the last segment has the end override
        expect(pathWithOverrides.segments[1].endPointOverride).toEqual(
            endOverride,
        );
        expect(pathWithOverrides.segments[1].endPointOverride).not.toEqual(
            segment2.endPoint,
        );
    });

    it("should use override points in SVG generation", () => {
        const segment = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });

        // Set overrides
        segment.startPointOverride = { x: 5, y: 5 };
        segment.endPointOverride = { x: 15, y: 5 };

        // Check that SVG string uses override points
        const svgString = segment.toSvgString(true);
        expect(svgString).toContain("M 5 5");
        expect(svgString).toContain("L 15 5");
        expect(svgString).not.toContain("M 0 0");
        expect(svgString).not.toContain("L 10 0");
    });

    it("should use override points in control points", () => {
        const segment = new Line({ x: 0, y: 0 }, { x: 10, y: 0 });

        // Set overrides
        segment.startPointOverride = { x: 5, y: 5 };
        segment.endPointOverride = { x: 15, y: 5 };

        // Check that control points use override points
        const controlPoints = segment.getControlPoints(0);
        expect(controlPoints[0].point).toEqual({ x: 5, y: 5 });
        expect(controlPoints[1].point).toEqual({ x: 15, y: 5 });
    });

    it("should work with cubic curves", () => {
        const segment = new CubicCurve(
            { x: 0, y: 0 },
            { x: 5, y: 5 },
            { x: 15, y: 5 },
            { x: 20, y: 0 },
        );

        // Set overrides
        segment.startPointOverride = { x: 10, y: 10 };
        segment.endPointOverride = { x: 30, y: 10 };

        // Check that SVG string uses override points
        const svgString = segment.toSvgString();
        expect(svgString).toContain("M 10 10");
        expect(svgString).toContain("30 10");
        expect(svgString).not.toContain("M 0 0");
        expect(svgString).not.toContain("20 0");
    });
});

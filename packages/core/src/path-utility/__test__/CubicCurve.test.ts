import { describe, expect, it } from "vitest";
import { CubicCurve } from "../src/segments/CubicCurve";
import type { Point } from "../src/interfaces";
import { parseSvg } from "../src/SvgParser";
import { SplineFactory } from "../src/SplineFactory";

describe("CubicCurve segment", () => {
    it("should correctly calculate the length of a simple S-curve", () => {
        const startPoint: Point = { x: 100, y: 100 };
        const controlPoint1: Point = { x: 150, y: 50 };
        const controlPoint2: Point = { x: 250, y: 150 };
        const endPoint: Point = { x: 300, y: 100 };
        const curve = new CubicCurve(
            startPoint,
            controlPoint1,
            controlPoint2,
            endPoint,
        );
        // Known approximate length for this curve
        expect(curve.getLength()).toBeCloseTo(211.4, 0);
    });

    it("should get the correct point at length", () => {
        const startPoint: Point = { x: 100, y: 100 };
        const controlPoint1: Point = { x: 150, y: 50 };
        const controlPoint2: Point = { x: 250, y: 150 };
        const endPoint: Point = { x: 300, y: 100 };
        const curve = new CubicCurve(
            startPoint,
            controlPoint1,
            controlPoint2,
            endPoint,
        );

        const midPoint = curve.getPointAtLength(curve.getLength() / 2);
        // The midpoint of this symmetrical curve (at t=0.5) is at (200, 100)
        expect(midPoint.x).toBeCloseTo(200, 0);
        expect(midPoint.y).toBeCloseTo(100, 0);
    });
});

describe("SvgParser with CubicCurve commands", () => {
    it("should parse an absolute CubicCurve command", () => {
        const d = "M 100 100 C 150 50, 250 150, 300 100";
        const segments = parseSvg(d);
        expect(segments.length).toBe(1);
        expect(segments[0]).toBeInstanceOf(CubicCurve);
        const curve = segments[0] as CubicCurve;
        expect(curve.startPoint).toEqual({ x: 100, y: 100 });
        expect(curve.controlPoint1).toEqual({ x: 150, y: 50 });
        expect(curve.controlPoint2).toEqual({ x: 250, y: 150 });
        expect(curve.endPoint).toEqual({ x: 300, y: 100 });
    });

    it("should parse a relative cubic curve command", () => {
        const d = "M 10 10 c 50 -50, 150 50, 200 0";
        const segments = parseSvg(d);
        expect(segments.length).toBe(1);
        expect(segments[0]).toBeInstanceOf(CubicCurve);
        const curve = segments[0] as CubicCurve;
        expect(curve.startPoint).toEqual({ x: 10, y: 10 });
        expect(curve.controlPoint1).toEqual({ x: 60, y: -40 });
        expect(curve.controlPoint2).toEqual({ x: 160, y: 60 });
        expect(curve.endPoint).toEqual({ x: 210, y: 10 });
    });
});

describe("SplineFactory", () => {
    it("should create a Catmull-Rom spline with cubic curves", () => {
        const points: Point[] = [
            { x: 0, y: 0 },
            { x: 100, y: 100 },
            { x: 200, y: 0 },
        ];
        const path = SplineFactory.createCatmullRomSpline(points);
        expect(path.segments.length).toBe(2);
        expect(path.segments[0]).toBeInstanceOf(CubicCurve);
        expect(path.segments[1]).toBeInstanceOf(CubicCurve);
    });

    it("should generate a path that passes through all points", () => {
        const points: Point[] = [
            { x: 0, y: 0 },
            { x: 100, y: 100 },
            { x: 200, y: 0 },
        ];
        const path = SplineFactory.createCatmullRomSpline(points);
        const curve0 = path.segments[0] as CubicCurve;
        const curve1 = path.segments[1] as CubicCurve;

        expect(curve0.startPoint).toEqual(points[0]);
        expect(curve0.endPoint).toEqual(points[1]);
        expect(curve1.startPoint).toEqual(points[1]);
        expect(curve1.endPoint).toEqual(points[2]);
    });
});

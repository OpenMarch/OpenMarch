import { describe, expect, it } from "vitest";
import { QuadraticCurve } from "../src/segments/QuadraticCurve";
import { type Point } from "../src/interfaces";
import { parseSvg } from "../src/SvgParser";

describe("QuadraticCurve segment", () => {
    it("should correctly calculate the length of a simple curve", () => {
        const startPoint: Point = { x: 0, y: 0 };
        const controlPoint: Point = { x: 50, y: 100 };
        const endPoint: Point = { x: 100, y: 0 };
        const curve = new QuadraticCurve(startPoint, controlPoint, endPoint);
        // This is a known value for this specific curve, approximately.
        expect(curve.getLength()).toBeCloseTo(147.89, 2);
    });

    it("should get the correct point at length", () => {
        const startPoint: Point = { x: 0, y: 0 };
        const controlPoint: Point = { x: 50, y: 50 };
        const endPoint: Point = { x: 100, y: 0 };
        const curve = new QuadraticCurve(startPoint, controlPoint, endPoint);

        const midPoint = curve.getPointAtLength(curve.getLength() / 2);
        // The midpoint of the curve (t=0.5) is at (50, 25)
        expect(midPoint.x).toBeCloseTo(50, 0);
        expect(midPoint.y).toBeCloseTo(25, 0);
    });
});

describe("SvgParser with QuadraticCurve commands", () => {
    it("should parse an absolute QuadraticCurve command", () => {
        const d = "M 0 0 Q 50 100 100 0";
        const segments = parseSvg(d);
        expect(segments.length).toBe(1);
        expect(segments[0]).toBeInstanceOf(QuadraticCurve);
        const curve = segments[0] as QuadraticCurve;
        expect(curve.startPoint).toEqual({ x: 0, y: 0 });
        expect(curve.controlPoint).toEqual({ x: 50, y: 100 });
        expect(curve.endPoint).toEqual({ x: 100, y: 0 });
    });

    it("should parse a relative quadratic curve command", () => {
        const d = "M 10 10 q 40 90 90 -10";
        const segments = parseSvg(d);
        expect(segments.length).toBe(1);
        expect(segments[0]).toBeInstanceOf(QuadraticCurve);
        const curve = segments[0] as QuadraticCurve;
        expect(curve.startPoint).toEqual({ x: 10, y: 10 });
        expect(curve.controlPoint).toEqual({ x: 50, y: 100 });
        expect(curve.endPoint).toEqual({ x: 100, y: 0 });
    });

    it("should parse multiple quadratic curve commands", () => {
        const d = "M 0 0 Q 50 100 100 0 Q 150 -100 200 0";
        const segments = parseSvg(d);
        expect(segments.length).toBe(2);
        expect(segments[0]).toBeInstanceOf(QuadraticCurve);
        expect(segments[1]).toBeInstanceOf(QuadraticCurve);
        const curve2 = segments[1] as QuadraticCurve;
        expect(curve2.startPoint).toEqual({ x: 100, y: 0 });
        expect(curve2.controlPoint).toEqual({ x: 150, y: -100 });
        expect(curve2.endPoint).toEqual({ x: 200, y: 0 });
    });

    it("should update control points correctly", () => {
        const curve = new QuadraticCurve(
            { x: 0, y: 0 },
            { x: 50, y: 50 },
            { x: 100, y: 0 },
        );

        // Update start point
        const updatedStart = curve.updateControlPoint("start", undefined, {
            x: 10,
            y: 10,
        });
        expect(updatedStart).toBeInstanceOf(QuadraticCurve);
        expect(updatedStart).not.toBe(curve); // Should be a new instance
        expect(updatedStart.startPoint).toEqual({ x: 10, y: 10 });
        expect(updatedStart.controlPoint).toEqual({ x: 50, y: 50 });
        expect(updatedStart.endPoint).toEqual({ x: 100, y: 0 });

        // Update control point
        const updatedControl = curve.updateControlPoint("control1", undefined, {
            x: 60,
            y: 60,
        });
        expect(updatedControl).toBeInstanceOf(QuadraticCurve);
        expect(updatedControl).not.toBe(curve); // Should be a new instance
        expect(updatedControl.startPoint).toEqual({ x: 0, y: 0 });
        expect(updatedControl.controlPoint).toEqual({ x: 60, y: 60 });
        expect(updatedControl.endPoint).toEqual({ x: 100, y: 0 });

        // Update end point
        const updatedEnd = curve.updateControlPoint("end", undefined, {
            x: 110,
            y: 10,
        });
        expect(updatedEnd).toBeInstanceOf(QuadraticCurve);
        expect(updatedEnd).not.toBe(curve); // Should be a new instance
        expect(updatedEnd.startPoint).toEqual({ x: 0, y: 0 });
        expect(updatedEnd.controlPoint).toEqual({ x: 50, y: 50 });
        expect(updatedEnd.endPoint).toEqual({ x: 110, y: 10 });
    });

    it("should throw error for unsupported control point types", () => {
        const curve = new QuadraticCurve(
            { x: 0, y: 0 },
            { x: 50, y: 50 },
            { x: 100, y: 0 },
        );

        expect(() => {
            curve.updateControlPoint("center" as any, undefined, {
                x: 0,
                y: 0,
            });
        }).toThrow(
            "QuadraticCurve segments do not support control point type: center",
        );
    });

    it("should return all control points including start and end", () => {
        const curve = new QuadraticCurve(
            { x: 0, y: 0 },
            { x: 50, y: 50 },
            { x: 100, y: 0 },
        );

        const controlPoints = curve.getControlPoints(0);
        expect(controlPoints).toHaveLength(3);

        // Check start point
        expect(controlPoints[0]).toEqual({
            point: { x: 0, y: 0 },
            segmentIndex: 0,
            pointIndex: 0,
            type: "start",
        });

        // Check control point
        expect(controlPoints[1]).toEqual({
            point: { x: 50, y: 50 },
            segmentIndex: 0,
            pointIndex: 1,
            type: "control1",
        });

        // Check end point
        expect(controlPoints[2]).toEqual({
            point: { x: 100, y: 0 },
            segmentIndex: 0,
            pointIndex: 2,
            type: "end",
        });
    });
});

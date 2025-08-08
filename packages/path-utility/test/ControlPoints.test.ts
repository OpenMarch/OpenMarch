import { describe, it, expect, vi } from "vitest";
import { Path, Line, CubicCurve, Spline, ControlPointManager } from "../src";

describe("Control Points", () => {
    describe("ControlPointManager", () => {
        it("should create control points for all segments", () => {
            const path = new Path([
                new Line({ x: 0, y: 0 }, { x: 100, y: 0 }),
                new CubicCurve(
                    { x: 100, y: 0 },
                    { x: 150, y: -50 },
                    { x: 200, y: 50 },
                    { x: 250, y: 0 },
                ),
                Spline.fromPoints([
                    { x: 250, y: 0 },
                    { x: 300, y: 25 },
                    { x: 350, y: -25 },
                    { x: 400, y: 0 },
                ]),
            ]);

            const manager = new ControlPointManager(path);
            const controlPoints = manager.getAllControlPoints();

            // Line: 2 control points (start, end)
            // CubicCurve: 4 control points (start, control1, control2, end)
            // Spline: 4 control points (one for each spline point)
            expect(controlPoints.length).toBe(10);

            // Check line control points
            const linePoints = manager.getControlPointsForSegment(0);
            expect(linePoints).toHaveLength(2);
            expect(linePoints[0]!.type).toBe("start");
            expect(linePoints[1]!.type).toBe("end");

            // Check cubic curve control points
            const curvePoints = manager.getControlPointsForSegment(1);
            expect(curvePoints).toHaveLength(4);
            expect(curvePoints.map((cp) => cp.type)).toEqual([
                "start",
                "control1",
                "control2",
                "end",
            ]);

            // Check spline control points
            const splinePoints = manager.getControlPointsForSegment(2);
            expect(splinePoints).toHaveLength(4);
            expect(splinePoints[0]!.type).toBe("spline-point");
            expect(splinePoints[0]!.pointIndex).toBe(0);
        });

        it("should move control points efficiently", () => {
            const path = new Path([
                new Line({ x: 0, y: 0 }, { x: 100, y: 0 }),
                new CubicCurve(
                    { x: 100, y: 0 },
                    { x: 150, y: -50 },
                    { x: 200, y: 50 },
                    { x: 250, y: 0 },
                ),
            ]);

            const manager = new ControlPointManager(path);
            const originalCurve = path.segments[1] as CubicCurve;

            // Move the first control point of the cubic curve
            const success = manager.moveControlPoint("cp-1-control1", {
                x: 140,
                y: -60,
            });
            expect(success).toBe(true);

            // Check that the curve was updated
            const updatedCurve = manager.path.segments[1] as CubicCurve;
            expect(updatedCurve.controlPoint1).toEqual({ x: 140, y: -60 });

            // Check that it's a new instance (immutable update)
            expect(updatedCurve).not.toBe(originalCurve);

            // Check that other points weren't affected
            expect(updatedCurve.startPoint).toEqual(originalCurve.startPoint);
            expect(updatedCurve.controlPoint2).toEqual(
                originalCurve.controlPoint2,
            );
            expect(updatedCurve.endPoint).toEqual(originalCurve.endPoint);

            // Check that the first segment wasn't affected
            expect(manager.path.segments[0]).toBe(path.segments[0]);
        });

        it("should handle batch updates efficiently", () => {
            const path = new Path([
                new CubicCurve(
                    { x: 0, y: 0 },
                    { x: 50, y: -50 },
                    { x: 100, y: 50 },
                    { x: 150, y: 0 },
                ),
            ]);

            const manager = new ControlPointManager(path);

            const updates = [
                { id: "cp-0-control1", point: { x: 40, y: -60 } },
                { id: "cp-0-control2", point: { x: 90, y: 60 } },
            ];

            const success = manager.moveControlPoints(updates);
            expect(success).toBe(true);

            const updatedCurve = manager.path.segments[0] as CubicCurve;
            expect(updatedCurve.controlPoint1).toEqual({ x: 40, y: -60 });
            expect(updatedCurve.controlPoint2).toEqual({ x: 90, y: 60 });
        });

        it("should call callbacks when control points move", () => {
            const path = new Path([new Line({ x: 0, y: 0 }, { x: 100, y: 0 })]);

            const manager = new ControlPointManager(path);
            const callback = vi.fn();
            manager.addMoveCallback(callback);

            const controlPoints = manager.getControlPointsForSegment(0);
            if (!controlPoints[0]) {
                throw new Error("Control point not found");
            }
            manager.moveControlPoint(controlPoints[0].id, { x: 10, y: 10 });

            expect(callback).toHaveBeenCalledWith(controlPoints[0].id, {
                x: 10,
                y: 10,
            });
        });

        it("should support hit testing for UI interactions", () => {
            const path = new Path([new Line({ x: 0, y: 0 }, { x: 100, y: 0 })]);

            const manager = new ControlPointManager(path);

            // Should find control point near start
            const controlPoint = manager.getControlPointAt({ x: 5, y: 5 }, 10);
            expect(controlPoint).toBeTruthy();
            expect(controlPoint?.type).toBe("start");

            // Should not find control point far away
            const noPoint = manager.getControlPointAt({ x: 500, y: 500 }, 10);
            expect(noPoint).toBeNull();
        });

        it("should handle spline control points correctly", () => {
            const spline = Spline.fromPoints([
                { x: 0, y: 0 },
                { x: 50, y: 100 },
                { x: 100, y: 0 },
            ]);

            const path = new Path([spline]);
            const manager = new ControlPointManager(path);

            // Move second spline point
            const success = manager.moveControlPoint("cp-0-spline-point-1", {
                x: 60,
                y: 80,
            });
            expect(success).toBe(true);

            const updatedSpline = manager.path.segments[0] as Spline;
            expect(updatedSpline.controlPoints[1]).toEqual({ x: 60, y: 80 });

            // Check that other points weren't affected
            expect(updatedSpline.controlPoints[0]).toEqual({ x: 0, y: 0 });
            expect(updatedSpline.controlPoints[2]).toEqual({ x: 100, y: 0 });
        });
    });

    describe("Segment Control Point Integration", () => {
        it("should provide correct control points for Line segments", () => {
            const line = new Line({ x: 10, y: 20 }, { x: 30, y: 40 });
            const controlPoints = line.getControlPoints(0);

            expect(controlPoints).toHaveLength(2);
            expect(controlPoints[0]).toMatchObject({
                point: { x: 10, y: 20 },
                segmentIndex: 0,
                type: "start",
            });
            expect(controlPoints[1]).toMatchObject({
                point: { x: 30, y: 40 },
                segmentIndex: 0,
                type: "end",
            });
        });

        it("should provide correct control points for CubicCurve segments", () => {
            const curve = new CubicCurve(
                { x: 0, y: 0 },
                { x: 10, y: 20 },
                { x: 30, y: 20 },
                { x: 40, y: 0 },
            );
            const controlPoints = curve.getControlPoints(1);

            expect(controlPoints).toHaveLength(4);
            expect(controlPoints.map((cp) => cp.type)).toEqual([
                "start",
                "control1",
                "control2",
                "end",
            ]);
            if (!controlPoints[1] || !controlPoints[2]) {
                throw new Error("Control points not found");
            }
            expect(controlPoints[1].point).toEqual({ x: 10, y: 20 });
            expect(controlPoints[2].point).toEqual({ x: 30, y: 20 });
        });

        it("should update segments correctly when control points change", () => {
            const line = new Line({ x: 0, y: 0 }, { x: 10, y: 10 });

            const updatedLine = line.updateControlPoint("start", undefined, {
                x: 5,
                y: 5,
            });
            expect(updatedLine).toBeInstanceOf(Line);
            expect((updatedLine as Line).startPoint).toEqual({ x: 5, y: 5 });
            expect((updatedLine as Line).endPoint).toEqual({ x: 10, y: 10 });

            // Original should be unchanged
            expect(line.startPoint).toEqual({ x: 0, y: 0 });
        });
    });

    describe("Path Integration", () => {
        it("should preserve path functionality after control point updates", () => {
            const path = new Path([
                new Line({ x: 0, y: 0 }, { x: 100, y: 0 }),
                new Line({ x: 100, y: 0 }, { x: 100, y: 100 }),
            ]);

            const manager = new ControlPointManager(path);
            const originalLength = path.getTotalLength();

            // Move a control point
            const controlPoints = manager.getControlPointsForSegment(0);
            if (!controlPoints[1]) {
                throw new Error("Control point not found");
            }
            manager.moveControlPoint(controlPoints[1].id, { x: 150, y: 0 });

            // Path should still work correctly
            const newLength = manager.path.getTotalLength();
            expect(newLength).toBeGreaterThan(originalLength);

            const midpoint = manager.path.getPointAtLength(newLength / 2);
            expect(midpoint.x).toBeGreaterThan(50);

            const svgString = manager.path.toSvgString();
            expect(svgString).toContain("150");
        });
    });
});

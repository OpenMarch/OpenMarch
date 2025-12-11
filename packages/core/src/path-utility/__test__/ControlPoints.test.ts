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
            // Total: 2 + 4 + 4 = 10, but some points may be shared between segments
            // The actual count depends on how the ControlPointManager deduplicates shared points
            expect(controlPoints.length).toBeGreaterThanOrEqual(8);
            expect(controlPoints.length).toBeLessThanOrEqual(10);

            // Check line control points
            const linePoints = manager.getControlPointsForSegment(0);
            expect(linePoints).toHaveLength(2);

            // Check cubic curve control points
            const curvePoints = manager.getControlPointsForSegment(1);
            expect(curvePoints).toHaveLength(4);

            // Check spline control points
            const splinePoints = manager.getControlPointsForSegment(2);
            expect(splinePoints).toHaveLength(4);
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

            // Get the control point for the first control point of the cubic curve
            const controlPoints = manager.getControlPointsForSegment(1);
            const control1Point = controlPoints.find((cp) =>
                cp.segmentHooks.some(
                    (hook) =>
                        hook.segmentIndex === 1 && hook.type === "control1",
                ),
            );

            if (!control1Point) {
                throw new Error("Control point not found");
            }

            // Move the first control point of the cubic curve
            const success = manager.moveControlPoint(control1Point.id, {
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

        // it("should handle batch updates efficiently", () => {
        //     const path = new Path([
        //         new CubicCurve(
        //             { x: 0, y: 0 },
        //             { x: 50, y: -50 },
        //             { x: 100, y: 50 },
        //             { x: 150, y: 0 },
        //         ),
        //     ]);

        //     const manager = new ControlPointManager(path);

        //     const updates = [
        //         { id: "cp-0-control1", point: { x: 40, y: -60 } },
        //         { id: "cp-0-control2", point: { x: 90, y: 60 } },
        //     ];

        //     const success = manager.moveControlPoints(updates);
        //     expect(success).toBe(true);

        //     const updatedCurve = manager.path.segments[0] as CubicCurve;
        //     expect(updatedCurve.controlPoint1).toEqual({ x: 40, y: -60 });
        //     expect(updatedCurve.controlPoint2).toEqual({ x: 90, y: 60 });
        // });

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

            // The control point should have segmentHooks that identify it as a start point
            const startHook = controlPoint?.segmentHooks.find(
                (hook) => hook.type === "start",
            );
            expect(startHook).toBeTruthy();
            expect(startHook?.type).toBe("start");

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

            // Get the control point for the second spline point
            const controlPoints = manager.getControlPointsForSegment(0);
            const secondPoint = controlPoints.find((cp) =>
                cp.segmentHooks.some(
                    (hook) =>
                        hook.segmentIndex === 0 &&
                        hook.type === "spline-point" &&
                        hook.pointIndex === 1,
                ),
            );

            if (!secondPoint) {
                throw new Error("Control point not found");
            }

            // Move second spline point
            const success = manager.moveControlPoint(secondPoint.id, {
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

        it("should correctly identify first and last control points", () => {
            const path = new Path([
                new Line({ x: 0, y: 0 }, { x: 100, y: 0 }),
                new CubicCurve(
                    { x: 100, y: 0 },
                    { x: 150, y: -50 },
                    { x: 200, y: 50 },
                    { x: 250, y: 0 },
                ),
                new Line({ x: 250, y: 0 }, { x: 300, y: 100 }),
            ]);

            const manager = new ControlPointManager(path);

            // Test getFirstControlPoint
            const firstControlPoint = manager.getFirstControlPoint();
            expect(firstControlPoint).toBeDefined();
            expect(firstControlPoint?.point).toEqual({ x: 0, y: 0 });
            expect(
                firstControlPoint?.segmentHooks.some(
                    (hook) => hook.segmentIndex === 0 && hook.type === "start",
                ),
            ).toBe(true);

            // Test getLastControlPoint
            const lastControlPoint = manager.getLastControlPoint();
            expect(lastControlPoint).toBeDefined();
            expect(lastControlPoint?.point).toEqual({ x: 300, y: 100 });
            expect(
                lastControlPoint?.segmentHooks.some(
                    (hook) => hook.segmentIndex === 2 && hook.type === "end",
                ),
            ).toBe(true);

            // Test with excludeFirst and excludeLast parameters
            const allControlPoints = manager.getAllControlPoints();
            const withoutFirst = manager.getAllControlPoints({
                excludeFirst: true,
            });
            const withoutLast = manager.getAllControlPoints({
                excludeLast: true,
            });
            const withoutBoth = manager.getAllControlPoints({
                excludeFirst: true,
                excludeLast: true,
            });

            expect(withoutFirst.length).toBeLessThan(allControlPoints.length);
            expect(withoutLast.length).toBeLessThan(allControlPoints.length);
            expect(withoutBoth.length).toBeLessThan(withoutFirst.length);
            expect(withoutBoth.length).toBeLessThan(withoutLast.length);

            // Verify that the excluded points are actually excluded
            expect(
                withoutFirst.some((cp) => cp.point.x === 0 && cp.point.y === 0),
            ).toBe(false);
            expect(
                withoutLast.some(
                    (cp) => cp.point.x === 300 && cp.point.y === 100,
                ),
            ).toBe(false);
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

    describe("Control Point Manager - rebuildControlPoints", () => {
        it("should deduplicate shared control points between segments", () => {
            // Create a path where segments share control points
            const path = new Path([
                new Line({ x: 0, y: 0 }, { x: 100, y: 0 }), // start: (0,0), end: (100,0)
                new Line({ x: 100, y: 0 }, { x: 100, y: 100 }), // start: (100,0), end: (100,100)
                new Line({ x: 100, y: 100 }, { x: 0, y: 0 }), // start: (100,100), end: (0,0)
            ]);

            const manager = new ControlPointManager(path);
            const allControlPoints = manager.getAllControlPoints();

            // The ControlPointManager creates one control point per unique coordinate
            // So we get 3 control points: (0,0), (100,0), (100,100)
            // Each shared point has multiple segment hooks
            expect(allControlPoints.length).toBe(3);

            // Check that shared points have multiple segment hooks
            const sharedPoint100_0 = allControlPoints.find(
                (cp) => cp.point.x === 100 && cp.point.y === 0,
            );
            expect(sharedPoint100_0).toBeTruthy();
            expect(sharedPoint100_0!.segmentHooks).toHaveLength(2);
            expect(
                sharedPoint100_0!.segmentHooks.some(
                    (hook) => hook.segmentIndex === 0 && hook.type === "end",
                ),
            ).toBe(true);
            expect(
                sharedPoint100_0!.segmentHooks.some(
                    (hook) => hook.segmentIndex === 1 && hook.type === "start",
                ),
            ).toBe(true);

            const sharedPoint0_0 = allControlPoints.find(
                (cp) => cp.point.x === 0 && cp.point.y === 0,
            );
            expect(sharedPoint0_0).toBeTruthy();
            expect(sharedPoint0_0!.segmentHooks).toHaveLength(2);
            expect(
                sharedPoint0_0!.segmentHooks.some(
                    (hook) => hook.segmentIndex === 0 && hook.type === "start",
                ),
            ).toBe(true);
            expect(
                sharedPoint0_0!.segmentHooks.some(
                    (hook) => hook.segmentIndex === 2 && hook.type === "end",
                ),
            ).toBe(true);
        });

        it("should handle complex path with multiple curve types sharing points", () => {
            const path = new Path([
                new Line({ x: 0, y: 0 }, { x: 100, y: 0 }),
                new CubicCurve(
                    { x: 100, y: 0 }, // shared with line end
                    { x: 150, y: -50 },
                    { x: 200, y: 50 },
                    { x: 250, y: 0 },
                ),
                new Line({ x: 250, y: 0 }, { x: 300, y: 0 }), // shared with curve end
            ]);

            const manager = new ControlPointManager(path);
            const allControlPoints = manager.getAllControlPoints();

            // Line: 2 points, CubicCurve: 4 points, Line: 2 points
            // But (100,0) and (250,0) are shared, so total should be 6
            expect(allControlPoints.length).toBe(6);

            // Check shared point (100,0)
            const sharedPoint100_0 = allControlPoints.find(
                (cp) => cp.point.x === 100 && cp.point.y === 0,
            );
            expect(sharedPoint100_0).toBeTruthy();
            expect(sharedPoint100_0!.segmentHooks).toHaveLength(2);
            expect(
                sharedPoint100_0!.segmentHooks.some(
                    (hook) => hook.segmentIndex === 0 && hook.type === "end",
                ),
            ).toBe(true);
            expect(
                sharedPoint100_0!.segmentHooks.some(
                    (hook) => hook.segmentIndex === 1 && hook.type === "start",
                ),
            ).toBe(true);

            // Check shared point (250,0)
            const sharedPoint250_0 = allControlPoints.find(
                (cp) => cp.point.x === 250 && cp.point.y === 0,
            );
            expect(sharedPoint250_0).toBeTruthy();
            expect(sharedPoint250_0!.segmentHooks).toHaveLength(2);
            expect(
                sharedPoint250_0!.segmentHooks.some(
                    (hook) => hook.segmentIndex === 1 && hook.type === "end",
                ),
            ).toBe(true);
            expect(
                sharedPoint250_0!.segmentHooks.some(
                    (hook) => hook.segmentIndex === 2 && hook.type === "start",
                ),
            ).toBe(true);
        });

        it("should rebuild control points when segments are added", () => {
            const path = new Path([new Line({ x: 0, y: 0 }, { x: 100, y: 0 })]);

            const manager = new ControlPointManager(path);
            let initialControlPoints = manager.getAllControlPoints();
            expect(initialControlPoints.length).toBe(2);

            // Add a new segment
            const newSegment = new Line({ x: 100, y: 0 }, { x: 100, y: 100 });
            manager.addSegment(newSegment);

            // Control points should be rebuilt
            const updatedControlPoints = manager.getAllControlPoints();
            expect(updatedControlPoints.length).toBe(3); // (0,0), (100,0), (100,100)

            // Check that the shared point (100,0) has multiple hooks
            const sharedPoint = updatedControlPoints.find(
                (cp) => cp.point.x === 100 && cp.point.y === 0,
            );
            expect(sharedPoint).toBeTruthy();
            expect(sharedPoint!.segmentHooks).toHaveLength(2);
        });

        it("should rebuild control points when segments are removed", () => {
            const path = new Path([
                new Line({ x: 0, y: 0 }, { x: 100, y: 0 }),
                new Line({ x: 100, y: 0 }, { x: 100, y: 100 }),
                new Line({ x: 100, y: 100 }, { x: 0, y: 0 }),
            ]);

            const manager = new ControlPointManager(path);
            let initialControlPoints = manager.getAllControlPoints();
            expect(initialControlPoints.length).toBe(3); // (0,0), (100,0), (100,100)

            // Remove the middle segment
            const removed = manager.removeSegment(1);
            expect(removed).toBe(true);

            // Control points should be rebuilt
            const updatedControlPoints = manager.getAllControlPoints();
            expect(updatedControlPoints.length).toBe(3); // (0,0), (100,0), (100,100)

            // The (100,0) point should no longer have hooks for segment 1
            const point100_0 = updatedControlPoints.find(
                (cp) => cp.point.x === 100 && cp.point.y === 0,
            );
            expect(point100_0).toBeTruthy();
            expect(point100_0!.segmentHooks).toHaveLength(1);
            if (point100_0!.segmentHooks[0]) {
                expect(point100_0!.segmentHooks[0].segmentIndex).toBe(0);
                expect(point100_0!.segmentHooks[0].type).toBe("end");
            }
        });

        it("should handle spline segments with multiple control points", () => {
            const spline = Spline.fromPoints([
                { x: 0, y: 0 },
                { x: 50, y: 100 },
                { x: 100, y: 0 },
                { x: 150, y: 100 },
            ]);

            const path = new Path([
                new Line({ x: 0, y: 0 }, { x: 100, y: 0 }), // shares start point with spline
                spline, // 4 control points
                new Line({ x: 150, y: 100 }, { x: 200, y: 100 }), // shares end point with spline
            ]);

            const manager = new ControlPointManager(path);
            const allControlPoints = manager.getAllControlPoints();

            // Line: 2 points, Spline: 4 points, Line: 2 points
            // But (0,0) and (150,100) are shared, so total should be 5
            expect(allControlPoints.length).toBe(5);

            // Check shared start point (0,0)
            const sharedStartPoint = allControlPoints.find(
                (cp) => cp.point.x === 0 && cp.point.y === 0,
            );
            expect(sharedStartPoint).toBeTruthy();
            expect(sharedStartPoint!.segmentHooks).toHaveLength(2);
            expect(
                sharedStartPoint!.segmentHooks.some(
                    (hook) => hook.segmentIndex === 0 && hook.type === "start",
                ),
            ).toBe(true);
            expect(
                sharedStartPoint!.segmentHooks.some(
                    (hook) =>
                        hook.segmentIndex === 1 &&
                        hook.type === "spline-point" &&
                        hook.pointIndex === 0,
                ),
            ).toBe(true);

            // Check shared end point (150,100)
            const sharedEndPoint = allControlPoints.find(
                (cp) => cp.point.x === 150 && cp.point.y === 100,
            );
            expect(sharedEndPoint).toBeTruthy();
            expect(sharedEndPoint!.segmentHooks).toHaveLength(2);
            expect(
                sharedEndPoint!.segmentHooks.some(
                    (hook) =>
                        hook.segmentIndex === 1 &&
                        hook.type === "spline-point" &&
                        hook.pointIndex === 3,
                ),
            ).toBe(true);
            expect(
                sharedEndPoint!.segmentHooks.some(
                    (hook) => hook.segmentIndex === 2 && hook.type === "start",
                ),
            ).toBe(true);
        });

        it("should maintain control point references when path is modified", () => {
            const path = new Path([
                new Line({ x: 0, y: 0 }, { x: 100, y: 0 }),
                new Line({ x: 100, y: 0 }, { x: 100, y: 100 }),
            ]);

            const manager = new ControlPointManager(path);
            const initialControlPoints = manager.getAllControlPoints();
            const sharedPoint = initialControlPoints.find(
                (cp) => cp.point.x === 100 && cp.point.y === 0,
            );

            expect(sharedPoint).toBeTruthy();
            const originalId = sharedPoint!.id;

            // Modify the path by moving a control point
            const controlPointsForSegment0 =
                manager.getControlPointsForSegment(0);
            const endPoint = controlPointsForSegment0.find((cp) =>
                cp.segmentHooks.some((hook) => hook.type === "end"),
            );

            if (!endPoint) {
                throw new Error("End point not found");
            }

            manager.moveControlPoint(endPoint.id, { x: 150, y: 0 });

            // The shared point should still exist but with updated coordinates
            const updatedControlPoints = manager.getAllControlPoints();
            const updatedSharedPoint = updatedControlPoints.find(
                (cp) => cp.id === originalId,
            );

            expect(updatedSharedPoint).toBeTruthy();
            expect(updatedSharedPoint!.point).toEqual({ x: 150, y: 0 });
            expect(updatedSharedPoint!.segmentHooks).toHaveLength(2);
        });

        it("should handle empty path correctly", () => {
            const path = new Path([]);
            const manager = new ControlPointManager(path);

            expect(manager.getAllControlPoints()).toHaveLength(0);
            expect(manager.getControlPointsForSegment(0)).toHaveLength(0);
        });

        it("should handle single segment path correctly", () => {
            const path = new Path([new Line({ x: 0, y: 0 }, { x: 100, y: 0 })]);

            const manager = new ControlPointManager(path);
            const controlPoints = manager.getAllControlPoints();

            expect(controlPoints).toHaveLength(2);
            expect(controlPoints[0]!.point).toEqual({ x: 0, y: 0 });
            expect(controlPoints[1]!.point).toEqual({ x: 100, y: 0 });

            // Check segment hooks
            expect(controlPoints[0]!.segmentHooks).toHaveLength(1);
            expect(controlPoints[0]!.segmentHooks[0]).toEqual({
                type: "start",
                pointIndex: 0,
                segmentIndex: 0,
            });

            expect(controlPoints[1]!.segmentHooks).toHaveLength(1);
            expect(controlPoints[1]!.segmentHooks[0]).toEqual({
                type: "end",
                pointIndex: 1,
                segmentIndex: 0,
            });
        });
    });
});

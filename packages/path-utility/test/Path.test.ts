import { Path, Line, Arc, CubicCurve, Spline, Point } from '../src';

describe('Path JSON Serialization', () => {
    describe('toJson and fromJson', () => {
        test('should serialize and deserialize a path with mixed segment types', () => {
            // Create a path with different segment types
            const originalPath = new Path();
            
            // Add a line segment
            originalPath.addSegment(new Line(
                { x: 0, y: 0 },
                { x: 10, y: 10 }
            ));
            
            // Add an arc segment
            originalPath.addSegment(new Arc(
                { x: 15, y: 15 }, // center
                5,                // radius
                0,                // start angle
                Math.PI / 2,      // end angle
                true              // clockwise
            ));
            
            // Add a cubic curve segment
            originalPath.addSegment(new CubicCurve(
                { x: 20, y: 15 },   // start
                { x: 25, y: 20 },   // control1
                { x: 30, y: 20 },   // control2
                { x: 35, y: 15 }    // end
            ));
            
            // Add a spline segment with control points
            const splinePoints: Point[] = [
                { x: 35, y: 15 },
                { x: 40, y: 25 },
                { x: 50, y: 30 },
                { x: 60, y: 20 },
                { x: 70, y: 15 }
            ];
            originalPath.addSegment(new Spline(splinePoints, 3, undefined, undefined, false, 0.5));
            
            // Serialize to JSON
            const json = originalPath.toJson();
            
            // Verify JSON structure contains segment types
            const parsedJson = JSON.parse(json);
            expect(parsedJson.segments).toHaveLength(4);
            expect(parsedJson.segments[0].type).toBe('line');
            expect(parsedJson.segments[1].type).toBe('arc');
            expect(parsedJson.segments[2].type).toBe('cubic-curve');
            expect(parsedJson.segments[3].type).toBe('spline');
            
            // Deserialize from JSON
            const reconstructedPath = Path.fromJson(json);
            
            // Verify the path has the same number of segments
            expect(reconstructedPath.segments).toHaveLength(4);
            
            // Verify each segment type and data
            const segments = reconstructedPath.segments;
            
            // Check line segment
            expect(segments[0].type).toBe('line');
            const lineSegment = segments[0] as Line;
            expect(lineSegment.startPoint).toEqual({ x: 0, y: 0 });
            expect(lineSegment.endPoint).toEqual({ x: 10, y: 10 });
            
            // Check arc segment
            expect(segments[1].type).toBe('arc');
            const arcSegment = segments[1] as Arc;
            expect(arcSegment.center).toEqual({ x: 15, y: 15 });
            expect(arcSegment.radius).toBe(5);
            expect(arcSegment.startAngle).toBe(0);
            expect(arcSegment.endAngle).toBe(Math.PI / 2);
            expect(arcSegment.clockwise).toBe(true);
            
            // Check cubic curve segment
            expect(segments[2].type).toBe('cubic-curve');
            const curveSegment = segments[2] as CubicCurve;
            expect(curveSegment.startPoint).toEqual({ x: 20, y: 15 });
            expect(curveSegment.controlPoint1).toEqual({ x: 25, y: 20 });
            expect(curveSegment.controlPoint2).toEqual({ x: 30, y: 20 });
            expect(curveSegment.endPoint).toEqual({ x: 35, y: 15 });
            
            // Check spline segment - this is the key test for preserving spline data
            expect(segments[3].type).toBe('spline');
            const splineSegment = segments[3] as Spline;
            expect(splineSegment.controlPoints).toEqual(splinePoints);
            expect(splineSegment.degree).toBe(3);
            expect(splineSegment.closed).toBe(false);
            expect(splineSegment.tension).toBe(0.5);
        });

        test('should preserve spline-specific data vs SVG-converted data', () => {
            // Create a spline with specific parameters
            const originalSplinePoints: Point[] = [
                { x: 0, y: 0 },
                { x: 10, y: 20 },
                { x: 30, y: 25 },
                { x: 50, y: 10 },
                { x: 70, y: 0 }
            ];
            
            const originalSpline = new Spline(
                originalSplinePoints,
                3,              // degree
                undefined,      // knots (will be generated)
                undefined,      // weights
                false,          // closed
                0.7             // tension
            );
            
            const splinePath = new Path([originalSpline]);
            
            // Serialize the spline path
            const splineJson = splinePath.toJson();
            
            // Convert spline to SVG and create a new path from it
            const svgString = originalSpline.toSvgString();
            const svgPath = Path.fromSvgString(svgString);
            const svgJson = svgPath.toJson();
            
            // Parse both JSONs
            const splineData = JSON.parse(splineJson);
            const svgData = JSON.parse(svgJson);
            
            // The spline JSON should preserve the original control points
            expect(splineData.segments[0].type).toBe('spline');
            expect(splineData.segments[0].data.controlPoints).toEqual(originalSplinePoints);
            expect(splineData.segments[0].data.degree).toBe(3);
            expect(splineData.segments[0].data.tension).toBe(0.7);
            
            // The SVG JSON should have multiple line segments (approximation)
            expect(svgData.segments[0].type).toBe('line'); // First segment after M command
            expect(svgData.segments.length).toBeGreaterThan(1); // Multiple line segments
            
            // Reconstruct both paths
            const reconstructedSplinePath = Path.fromJson(splineJson);
            const reconstructedSvgPath = Path.fromJson(svgJson);
            
            // The spline path should have the original spline
            expect(reconstructedSplinePath.segments).toHaveLength(1);
            expect(reconstructedSplinePath.segments[0].type).toBe('spline');
            const reconstructedSpline = reconstructedSplinePath.segments[0] as Spline;
            expect(reconstructedSpline.controlPoints).toEqual(originalSplinePoints);
            
            // The SVG path should have multiple line segments
            expect(reconstructedSvgPath.segments.length).toBeGreaterThan(1);
            expect(reconstructedSvgPath.segments.every(s => s.type === 'line')).toBe(true);
        });

        test('should handle complex spline with knots and weights', () => {
            const controlPoints: Point[] = [
                { x: 0, y: 0 },
                { x: 10, y: 15 },
                { x: 25, y: 20 },
                { x: 40, y: 10 }
            ];
            
            const knots = [0, 0, 0, 0, 1, 1, 1, 1]; // Clamped B-spline knots
            const weights = [1, 2, 1, 1]; // NURBS weights
            
            const originalSpline = new Spline(controlPoints, 3, knots, weights, false, 0.5);
            const path = new Path([originalSpline]);
            
            // Serialize and deserialize
            const json = path.toJson();
            const reconstructedPath = Path.fromJson(json);
            
            // Verify spline data is preserved
            const reconstructedSpline = reconstructedPath.segments[0] as Spline;
            expect(reconstructedSpline.controlPoints).toEqual(controlPoints);
            expect(reconstructedSpline.degree).toBe(3);
            expect(reconstructedSpline.knots).toEqual(knots);
            expect(reconstructedSpline.weights).toEqual(weights);
            expect(reconstructedSpline.closed).toBe(false);
            expect(reconstructedSpline.tension).toBe(0.5);
        });

        test('should maintain path functionality after JSON round-trip', () => {
            // Create a path with multiple segments
            const originalPath = new Path();
            originalPath.addSegment(new Line({ x: 0, y: 0 }, { x: 10, y: 0 }));
            originalPath.addSegment(new Arc({ x: 15, y: 0 }, 5, 0, Math.PI, true));
            originalPath.addSegment(new Spline([
                { x: 20, y: 0 },
                { x: 25, y: 10 },
                { x: 35, y: 5 },
                { x: 40, y: 0 }
            ]));
            
            // Get original measurements
            const originalLength = originalPath.getTotalLength();
            const originalMidpoint = originalPath.getPointAtLength(originalLength / 2);
            const originalSvg = originalPath.toSvgString();
            
            // Round-trip through JSON
            const json = originalPath.toJson();
            const reconstructedPath = Path.fromJson(json);
            
            // Verify functionality is preserved
            expect(reconstructedPath.getTotalLength()).toBeCloseTo(originalLength, 5);
            
            const reconstructedMidpoint = reconstructedPath.getPointAtLength(originalLength / 2);
            expect(reconstructedMidpoint.x).toBeCloseTo(originalMidpoint.x, 5);
            expect(reconstructedMidpoint.y).toBeCloseTo(originalMidpoint.y, 5);
            
            // SVG output should be similar (may have minor floating-point differences)
            expect(reconstructedPath.toSvgString()).toBeTruthy();
        });

        test('should handle empty path', () => {
            const emptyPath = new Path();
            const json = emptyPath.toJson();
            const reconstructedPath = Path.fromJson(json);
            
            expect(reconstructedPath.segments).toHaveLength(0);
            expect(reconstructedPath.getTotalLength()).toBe(0);
            expect(reconstructedPath.toSvgString()).toBe('');
        });

        test('should throw error for invalid JSON', () => {
            expect(() => Path.fromJson('invalid json')).toThrow();
            expect(() => Path.fromJson('{"invalid": "structure"}')).toThrow();
            expect(() => Path.fromJson('{"segments": "not an array"}')).toThrow();
        });
    });
});
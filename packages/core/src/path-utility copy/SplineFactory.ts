import { Path } from "./Path";
import type { IControllableSegment, Point } from "./interfaces";
import { CubicCurve } from "./segments/CubicCurve";

/**
 * A factory for creating spline paths.
 */
export class SplineFactory {
    /**
     * Creates a Catmull-Rom spline that passes through the given points.
     * @param points An array of points for the spline to pass through.
     * @returns A Path object representing the spline.
     */
    public static createCatmullRomSpline(points: Point[]): Path {
        if (points.length < 2) {
            return new Path([]);
        }

        const segments: IControllableSegment[] = [];
        const tension = 1 / 6;

        for (let i = 0; i < points.length - 1; i++) {
            const p0 = i > 0 ? points[i - 1] : points[i];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = i < points.length - 2 ? points[i + 2] : p2;
            if (!p0 || !p1 || !p2 || !p3) {
                throw new Error(
                    "Points required for spline calculation are undefined",
                );
            }

            const c1 = {
                x: p1.x + (p2.x - p0.x) * tension,
                y: p1.y + (p2.y - p0.y) * tension,
            };
            const c2 = {
                x: p2.x - (p3.x - p1.x) * tension,
                y: p2.y - (p3.y - p1.y) * tension,
            };

            segments.push(new CubicCurve(p1, c1, c2, p2));
        }

        return new Path(segments);
    }

    /**
     * Creates a Catmull-Rom spline from a series of points defined by their
     * relative distance from the previous point.
     * @param relativePoints An array of points representing the delta from the previous point.
     * @param origin The starting point of the spline. Defaults to { x: 0, y: 0 }.
     * @returns A Path object representing the spline.
     */
    public static createCatmullRomSplineFromRelativePoints(
        relativePoints: Point[],
        origin: Point = { x: 0, y: 0 },
    ): Path {
        if (relativePoints.length === 0) {
            return new Path([]);
        }

        const absolutePoints: Point[] = [origin];
        let lastPoint = origin;

        for (const relativePoint of relativePoints) {
            const nextPoint = {
                x: lastPoint.x + relativePoint.x,
                y: lastPoint.y + relativePoint.y,
            };
            absolutePoints.push(nextPoint);
            lastPoint = nextPoint;
        }

        return SplineFactory.createCatmullRomSpline(absolutePoints);
    }
}

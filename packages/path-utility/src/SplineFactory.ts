import { Path } from "./Path";
import type { IPathSegment, Point } from "./interfaces";
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

        const segments: IPathSegment[] = [];
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
}

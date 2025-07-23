import { Path } from "./Path";
import { Point } from "./interfaces";

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
        // Implementation would convert the control points into a series
        // of cubic bezier curve segments.
        // This is a placeholder. A full implementation is required.
        console.warn("createCatmullRomSpline is not implemented", points);
        const segments = []; // placeholder
        return new Path(segments);
    }
}

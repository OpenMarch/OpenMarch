// cspell:words Catmull Yuksel Schaefer Keyser
import type { XY } from "../types";
import { add, dist, scale, sub } from "./vec";

const SAME = 1e-9;

/**
 * The Bézier control points of the centripetal Catmull-Rom (alpha 0.5) span from `p1` to `p2`, with
 * `p0` before it and `p3` after. Centripetal spacing doesn't loop or cusp when points are uneven,
 * which uniform Catmull-Rom does. Conversion after Yuksel, Schaefer and Keyser, "Parameterization
 * and applications of Catmull-Rom curves" (2011).
 */
export function catmullRomControls(
    p0: XY,
    p1: XY,
    p2: XY,
    p3: XY,
): { readonly c1: XY; readonly c2: XY } {
    // d = |Δ|^alpha with alpha = 0.5, so d² = |Δ|
    const d1 = Math.sqrt(dist(p0, p1));
    const d2 = Math.sqrt(dist(p1, p2));
    const d3 = Math.sqrt(dist(p2, p3));
    const c1 =
        d1 < SAME
            ? p1
            : scale(
                  add(
                      sub(scale(p2, d1 * d1), scale(p0, d2 * d2)),
                      scale(p1, 2 * d1 * d1 + 3 * d1 * d2 + d2 * d2),
                  ),
                  1 / (3 * d1 * (d1 + d2)),
              );
    const c2 =
        d3 < SAME
            ? p2
            : scale(
                  add(
                      sub(scale(p1, d3 * d3), scale(p3, d2 * d2)),
                      scale(p2, 2 * d3 * d3 + 3 * d3 * d2 + d2 * d2),
                  ),
                  1 / (3 * d3 * (d3 + d2)),
              );
    return { c1, c2 };
}

/**
 * Point `i` of `points`, or past either end a phantom mirrored through the end point, so an end
 * span leaves straight toward its neighbor's tangent
 */
export function mirroredAt(points: readonly XY[], i: number): XY {
    if (i < 0) return sub(scale(points[0]!, 2), points[1]!);
    if (i >= points.length)
        return sub(scale(points.at(-1)!, 2), points.at(-2)!);
    return points[i]!;
}

/** Point `i` of `points` taken round a closed loop, the last point's next the first */
const wrappedAt = (points: readonly XY[], i: number): XY =>
    points[((i % points.length) + points.length) % points.length]!;

/**
 * {@link catmullRomControls} of the span from point `i` of `points` to the next, mirrored past the
 * ends; with `closed`, round the loop instead, the last span back to the first point and the
 * neighbors wrapping, so the curve runs smoothly through the first point too
 */
export const catmullRomSpan = (
    points: readonly XY[],
    i: number,
    closed = false,
): { readonly c1: XY; readonly c2: XY } => {
    const at = closed ? wrappedAt : mirroredAt;
    return catmullRomControls(
        at(points, i - 1),
        wrappedAt(points, i),
        wrappedAt(points, i + 1),
        at(points, i + 2),
    );
};

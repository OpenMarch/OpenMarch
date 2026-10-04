/**
 * Pick-a-seat snapping (P3.2, ui.md UI-3). Pure: finds the seat-row point
 * nearest a raycast hit. Seat rows are polylines in the kit root's frame, so
 * pass the hit point in that frame too.
 */
import type { Vector3Tuple } from "three";
import type { SeatRow } from "@/view3d/core/types";

export interface SeatSnap {
    /** The nearest point on a seat row, in the rows' frame. */
    point: Vector3Tuple;
    /** Index into the `rows` array. */
    rowIndex: number;
    /** Distance from the query point to `point`. */
    distance: number;
}

/** Nearest point to `p` on segment `a`–`b`. */
export function closestOnSegment(
    p: Vector3Tuple,
    a: Vector3Tuple,
    b: Vector3Tuple,
): Vector3Tuple {
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const abz = b[2] - a[2];
    const len2 = abx * abx + aby * aby + abz * abz;
    const t =
        len2 === 0
            ? 0
            : Math.min(
                  1,
                  Math.max(
                      0,
                      ((p[0] - a[0]) * abx +
                          (p[1] - a[1]) * aby +
                          (p[2] - a[2]) * abz) /
                          len2,
                  ),
              );
    return [a[0] + abx * t, a[1] + aby * t, a[2] + abz * t];
}

/**
 * The seat-row point nearest `p`, across every row (closed rows include the
 * segment from the last point back to the first). Null when there are no
 * rows with points.
 */
export function snapToSeatRows(
    p: Vector3Tuple,
    rows: readonly SeatRow[],
): SeatSnap | null {
    let best: SeatSnap | null = null;
    rows.forEach((row, rowIndex) => {
        const pts = row.points;
        if (pts.length === 0) return;
        const consider = (q: Vector3Tuple) => {
            const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
            if (!best || d < best.distance)
                best = { point: q, rowIndex, distance: d };
        };
        if (pts.length === 1) {
            consider([...pts[0]]);
            return;
        }
        const segments = row.closed ? pts.length : pts.length - 1;
        for (let i = 0; i < segments; i++)
            consider(closestOnSegment(p, pts[i], pts[(i + 1) % pts.length]));
    });
    return best;
}

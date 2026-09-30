/**
 * Geometry for the property tests (spec 12.5), written independently of
 * `../geom.ts` and ported from the independent half of
 * `docs/timeline/ref/props.mjs`. Expected values in `properties.test.ts` come
 * from here, so a bug in the model's shared geometry can't hide in both the
 * subject and the expectation.
 *
 * Do not import anything from `../geom` (or `../oracle`) into this file. Where
 * the model uses a binary search, a chord-form arc or a trail object, this file
 * deliberately uses a linear walk, the textbook centre-and-radius arc, and
 * plain point-to-segment distances.
 */
import type { ShapeRow, TimelineSnapshot, XY } from "../types";

/** Euclidean distance. */
export const d2 = (a: XY, b: XY): number =>
    Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The polyline of a polyline-like shape (line, freehand, box perimeter); null for circles and blocks. */
export function polyOf(shape: ShapeRow): XY[] | null {
    if (shape.kind === "line" || shape.kind === "freehand")
        return shape.geometry.points;
    if (shape.kind === "box") {
        const g = shape.geometry;
        const [x, y] = g.origin;
        return [
            [x, y],
            [x + g.width, y],
            [x + g.width, y + g.height],
            [x, y + g.height],
            [x, y],
        ];
    }
    return null;
}

/** The point at arc length `s` along `pts`, by a linear walk (the model uses a binary search). */
export function walk(pts: readonly XY[], s: number): XY {
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!;
        const b = pts[i]!;
        const seg = d2(a, b);
        if (seg > 0 && acc + seg >= s) {
            const f = (s - acc) / seg;
            return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])];
        }
        acc += seg;
    }
    return pts[pts.length - 1]!;
}

/** R-13 destination samples, computed from the shape definition. */
export function exactSamples(shape: ShapeRow, n: number): XY[] {
    if (shape.kind === "block") {
        const g = shape.geometry;
        return Array.from(
            { length: n },
            (_, i): XY => [
                g.origin[0] + (i % g.cols) * g.spacing[0],
                g.origin[1] + Math.floor(i / g.cols) * g.spacing[1],
            ],
        );
    }
    const closed = shape.kind === "circle" || shape.kind === "box";
    const t = (i: number) => (closed ? i / n : n === 1 ? 0 : i / (n - 1));
    if (shape.kind === "circle") {
        const g = shape.geometry;
        return Array.from({ length: n }, (_, i): XY => {
            const a =
                g.start_angle + (g.clockwise ? -1 : 1) * 2 * Math.PI * t(i);
            return [
                g.center[0] + g.radius * Math.cos(a),
                g.center[1] + g.radius * Math.sin(a),
            ];
        });
    }
    const pts = polyOf(shape)!;
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += d2(pts[i - 1]!, pts[i]!);
    return Array.from({ length: n }, (_, i) => walk(pts, t(i) * L));
}

/** Distance from `p` to the segment `ab`. */
export function distToSeg(p: XY, a: XY, b: XY): number {
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const L2 = vx * vx + vy * vy;
    const f =
        L2 === 0
            ? 0
            : Math.max(
                  0,
                  Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2),
              );
    return d2(p, [a[0] + f * vx, a[1] + f * vy]);
}

/** Distance from `p` to a polyline. */
export function distToPoly(p: XY, pts: readonly XY[]): number {
    if (pts.length === 1) return d2(p, pts[0]!);
    let best = Infinity;
    for (let i = 1; i < pts.length; i++)
        best = Math.min(best, distToSeg(p, pts[i - 1]!, pts[i]!));
    return best;
}

/** Distance from `p` to a path-kind shape (a circle is measured radially). */
export function distToShape(p: XY, shape: ShapeRow): number {
    if (shape.kind === "circle")
        return Math.abs(d2(p, shape.geometry.center) - shape.geometry.radius);
    return distToPoly(p, polyOf(shape)!);
}

/**
 * The textbook centre-and-radius construction of the minor arc from A to B
 * with signed bulge k, at angular fraction p. Independent of R-8's chord
 * formula, and only well-conditioned at moderate inputs (spec R-8, Appendix
 * C), so it is used only as a cross-check there.
 */
export function arcCentreForm(A: XY, B: XY, k: number, p: number): XY {
    const c = d2(A, B);
    if (Math.abs(k) < 1e-9 || c === 0)
        return [A[0] + (B[0] - A[0]) * p, A[1] + (B[1] - A[1]) * p];
    const s = k * c;
    const R = (c * c) / 4 + s * s;
    const radius = R / (2 * Math.abs(s));
    const M: XY = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    const n: XY = [-(B[1] - A[1]) / c, (B[0] - A[0]) / c];
    const off = s - Math.sign(s) * radius;
    const C: XY = [M[0] + off * n[0], M[1] + off * n[1]];
    const a0 = Math.atan2(A[1] - C[1], A[0] - C[0]);
    const phi = Math.atan2(c / 2, radius - Math.abs(s));
    const a = a0 + p * (-Math.sign(k) * 2 * phi);
    return [C[0] + radius * Math.cos(a), C[1] + radius * Math.sin(a)];
}

/**
 * β (spec 8.11): the largest distance from the field origin to any authored
 * point: homes, waypoints, individual destinations and every point of every
 * shape (a circle's whole perimeter, a block's whole grid).
 */
export function betaOf(db: TimelineSnapshot): number {
    let b = 0;
    const see = (q: XY) => {
        b = Math.max(b, Math.hypot(q[0], q[1]));
    };
    db.marchers.forEach((m) => see(m.home));
    for (const t of Object.values(db.transitions)) {
        (t.params?.waypoints ?? []).forEach(see);
        (t.points ?? []).forEach(see);
    }
    for (const s of Object.values(db.shapes)) {
        if (s.kind === "circle") {
            const g = s.geometry;
            b = Math.max(b, Math.hypot(g.center[0], g.center[1]) + g.radius);
        } else if (s.kind === "block") {
            const g = s.geometry;
            for (let r = 0; r < g.rows; r++)
                for (let c = 0; c < g.cols; c++)
                    see([
                        g.origin[0] + c * g.spacing[0],
                        g.origin[1] + r * g.spacing[1],
                    ]);
        } else polyOf(s)!.forEach(see);
    }
    return b;
}

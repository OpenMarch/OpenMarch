// cspell:ignore lerp
/**
 * Shared, stateless timeline geometry (spec R-2, R-8, R-13, section 8.10).
 * Ported from `docs/timeline/ref/geom.mjs`.
 *
 * No curve is ever flattened: circles are evaluated from their exact
 * parameterization. All arithmetic is Float64 (plain JS numbers).
 */
import type {
    AssignmentRow,
    DestPath,
    FlatSpan,
    FtlTrail,
    ShapeRow,
    SpanKind,
    TransitionRow,
    XY,
} from "./types";

export const dist = (a: XY, b: XY): number =>
    Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Smallest meaningful distance (8.10): a chord shorter than this is a straight line. */
export const EPS_GEOM = 1e-9;

/** Endpoint-exact interpolation (8.10): t <= 0 returns a, t >= 1 returns b, bit for bit. */
export const lerp = (a: XY, b: XY, t: number): XY =>
    t <= 0
        ? a
        : t >= 1
          ? b
          : [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export const clamp01 = (t: number): number => Math.max(0, Math.min(1, t));

/** Cumulative arc length at each vertex of a polyline. */
export const cumOf = (pts: readonly XY[]): number[] => {
    const c = [0];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
        total += dist(pts[i - 1]!, pts[i]!);
        c.push(total);
    }
    return c;
};

/**
 * Point at arc length d along a polyline (8.10). Zero-length segments are
 * never selected. O(log P).
 */
export function pointAtDistance(
    pts: readonly XY[],
    cum: readonly number[],
    d: number,
): XY {
    if (d <= 0) return pts[0]!;
    const L = cum[cum.length - 1]!;
    if (d >= L) return pts[pts.length - 1]!;
    // first i with cum[i] >= d, so cum[i-1] < d
    let lo = 1;
    let hi = cum.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid]! >= d) hi = mid;
        else lo = mid + 1;
    }
    return lerp(
        pts[lo - 1]!,
        pts[lo]!,
        (d - cum[lo - 1]!) / (cum[lo]! - cum[lo - 1]!),
    );
}

/**
 * R-13: the exact destination path of a path-kind shape.
 * Polylines (line, freehand, box) are exact already; a circle is evaluated
 * from its angle.
 */
export function destPath(shape: ShapeRow): DestPath {
    if (shape.kind === "circle") {
        const g = shape.geometry;
        const L = 2 * Math.PI * g.radius;
        const dir = g.clockwise ? -1 : 1;
        return {
            closed: true,
            L,
            at(s: number): XY {
                const a =
                    g.start_angle +
                    dir * (Math.max(0, Math.min(L, s)) / g.radius);
                return [
                    g.center[0] + g.radius * Math.cos(a),
                    g.center[1] + g.radius * Math.sin(a),
                ];
            },
        };
    }
    let pts: readonly XY[];
    if (shape.kind === "line" || shape.kind === "freehand") {
        pts = shape.geometry.points;
    } else if (shape.kind === "box") {
        const g = shape.geometry;
        const [x, y] = g.origin;
        pts = [
            [x, y],
            [x + g.width, y],
            [x + g.width, y + g.height],
            [x, y + g.height],
            [x, y],
        ];
    } else {
        throw new Error(`${(shape as ShapeRow).kind} is not a path kind`);
    }
    const cum = cumOf(pts);
    return {
        closed: shape.kind === "box",
        L: cum[cum.length - 1]!,
        at: (s) => pointAtDistance(pts, cum, s),
    };
}

/** Parameter of sample `i` of `n` on a path: closed paths wrap, open paths span [0, 1]. */
export const paramT = (closed: boolean, i: number, n: number): number =>
    closed ? i / n : n === 1 ? 0 : i / (n - 1);

/** R-13: slot destinations sampled from a shape, of any kind. */
export function sampleDestinations(shape: ShapeRow, n: number): XY[] {
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
    const P = destPath(shape);
    return Array.from({ length: n }, (_, i) =>
        P.at(paramT(P.closed, i, n) * P.L),
    );
}

/** R-13: a transition's slot destinations, from its shape or from individually placed points (D-16). */
export function destinationsOf(
    t: Pick<TransitionRow, "dest" | "points" | "slots">,
    shapes: Record<number, ShapeRow>,
): XY[] {
    if (t.dest == null)
        return (t.points ?? []).slice(0, t.slots).map((p): XY => [p[0], p[1]]);
    const shape = shapes[t.dest];
    if (!shape) throw new Error(`shape ${t.dest} not found`);
    return sampleDestinations(shape, t.slots);
}

/**
 * R-8: circular MINOR arc from A to B with signed bulge k = sagitta / chord,
 * |k| <= 1/2, at constant angular speed. Numerically stable: everything is
 * expressed relative to the chord (no far-away centre, no radius subtraction,
 * no division by the chord), endpoints are returned exactly, and finite inputs
 * give finite outputs.
 */
export function arcPoint(A: XY, B: XY, k: number, p: number): XY {
    if (p <= 0) return A;
    if (p >= 1) return B;
    const dx = B[0] - A[0];
    const dy = B[1] - A[1];
    const c = Math.hypot(dx, dy);
    if (c < EPS_GEOM) return lerp(A, B, p); // below the geometric scale: straight line
    const h = c / 2;
    // signed half-angle at the centre; = 2*atan(k*c/h) without dividing by h
    const phi = 2 * Math.atan(2 * k);
    if (Math.abs(phi) < 1e-12) return lerp(A, B, p);
    const sinPhi = Math.sin(phi);
    // from chord midpoint, toward B
    const along = (h * Math.sin(phi * (2 * p - 1))) / sinPhi;
    // toward the +90 degree side for k > 0
    const normal =
        (2 * h * Math.sin(phi * p) * Math.sin(phi * (1 - p))) / sinPhi;
    const ux = dx / c;
    const uy = dy / c;
    const mx = (A[0] + B[0]) / 2;
    const my = (A[1] + B[1]) / 2;
    return [mx + ux * along - uy * normal, my + uy * along + ux * normal];
}

/**
 * R-2: one marcher's rows to spans partitioning (-inf, +inf).
 * Each span is `{ row | null, start, end }`.
 */
export function flatten<
    R extends Pick<AssignmentRow, "id" | "layer" | "start" | "end">,
>(rows: readonly R[]): FlatSpan<R>[] {
    const cuts = [...new Set(rows.flatMap((r) => [r.start, r.end]))].sort(
        (a, b) => a - b,
    );
    const raw: FlatSpan<R>[] = [];
    for (let i = 0; i < cuts.length - 1; i++) {
        const s = cuts[i]!;
        const e = cuts[i + 1]!;
        let win: R | null = null;
        for (const r of rows)
            if (r.start <= s && r.end >= e && (!win || r.layer > win.layer))
                win = r;
        raw.push({ row: win, start: s, end: e });
    }
    const all: FlatSpan<R>[] = [
        {
            row: null,
            start: -Infinity,
            end: raw.length ? raw[0]!.start : Infinity,
        },
        ...raw,
    ];
    if (raw.length)
        all.push({ row: null, start: raw[raw.length - 1]!.end, end: Infinity });
    const out: FlatSpan<R>[] = [];
    for (const sp of all) {
        const last = out[out.length - 1];
        if (
            last &&
            (last.row?.id ?? null) === (sp.row?.id ?? null) &&
            last.end === sp.start
        ) {
            last.end = sp.end;
            continue;
        }
        out.push({ ...sp });
    }
    return out;
}

/**
 * R-3: classify a span. `spans` is the marcher's full flattened list (the
 * same objects, so identity decides join versus resume).
 */
export function classifySpan<R extends { id: number; transition: number }>(
    sp: FlatSpan<R & { layer: number }>,
    spans: readonly FlatSpan<R & { layer: number }>[],
    transitionStart: (transitionId: number) => number,
): SpanKind {
    if (!sp.row) return "hold";
    if (sp.start === transitionStart(sp.row.transition)) return "founding";
    const rowId = sp.row.id;
    const firstOfRow = spans.find((x) => x.row && x.row.id === rowId);
    return firstOfRow === sp ? "join" : "resume";
}

/**
 * R-9 steps 3-4: an FTL trail = polyline through member origins and
 * waypoints to the destination's start, followed by the EXACT destination
 * path.
 */
export function makeTrail(
    origins: readonly XY[],
    waypoints: readonly XY[],
    path: DestPath,
): FtlTrail {
    const pre: XY[] = [...origins, ...waypoints, path.at(0)];
    const cum = cumOf(pre);
    const destOffset = cum[cum.length - 1]!;
    return {
        cum,
        destOffset,
        at: (d) =>
            d < destOffset
                ? pointAtDistance(pre, cum, d)
                : path.at(d - destOffset),
    };
}

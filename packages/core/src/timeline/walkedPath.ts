/**
 * Drawable walked paths (spec R-20, pathways step 18): the path a marcher actually walks over a
 * beat range, as exact drawable segments (lines, circular arcs and cubic Bézier curves) for exports and
 * other apps. It reads a resolver and the snapshot the resolver was built from; it never changes
 * a position, and `walkedPathPointAt` agrees with `positionAt` within
 * {@link WALKED_SAMPLE_TOLERANCE}.
 */
import {
    EPS_GEOM,
    ROUTE_ARC_SAMPLES,
    ROUTE_CUBIC_SAMPLES,
    adjustAt,
    arcPoint,
    cubicPoint,
    cumOf,
    destinationsOf,
    dist,
    groupMemberWalk,
    groupSchedule,
    lerp,
    makeAlongTrail,
    makeTrail,
    placed,
    resolveAdjust,
    routePath,
    routePiecePoint,
    type GroupLeg,
    type GroupMemberWalk,
    type GroupSchedule,
    type ResolvedAdjust,
    type RoutePath,
    type RouteWalk,
} from "./geom";
import type {
    Beat,
    FtlEntryInfo,
    LaneRow,
    Resolver,
    ShapeRow,
    SpanInfo,
    TimelineSnapshot,
    TransitionRow,
    XY,
} from "./types";

/**
 * R-20 item 7: how far `walkedPathPointAt` may be from `positionAt` at the same beat, and how far
 * a `polyline` segment may be from the walk it stands for, in field units (the resolver's
 * coordinates). 0.05 is under half a percent of an 8-to-5 step on the default field (11.25).
 */
export const WALKED_SAMPLE_TOLERANCE = 0.05;

/** R-20 item 3: an arc style whose bulge is smaller than this draws as a line. */
export const WALKED_MIN_BULGE = 1e-7;

interface WalkedSegmentBase {
    /** The beat the marcher is at `from` */
    start: Beat;
    /** The beat the marcher is at `to`; later than `start` */
    end: Beat;
    from: XY;
    to: XY;
    /** The move (transition) being walked */
    transitionId: number;
}

/** A straight line, walked at constant speed. */
export interface WalkedLine extends WalkedSegmentBase {
    kind: "line";
}

/**
 * A circular arc, walked at constant speed: the point at fraction `f` of its beats is
 * `center + radius * (cos(a), sin(a))` with `a = startAngle + sweep * f`. `sweep` is signed and at
 * most a quarter turn in size; longer arcs come as several segments. (A quarter turn, not a half:
 * an SVG arc of exactly half a turn loses its centre when its radius is rounded.)
 */
export interface WalkedArc extends WalkedSegmentBase {
    kind: "arc";
    center: XY;
    radius: number;
    /** Radians */
    startAngle: number;
    /** Radians, signed, `|sweep| <= PI / 2` */
    sweep: number;
}

/**
 * A cubic Bézier from `from` to `to` with controls `c1` and `c2`, walked at constant speed along
 * its length as R-14 measures it: on the 64 chords of the whole curve the resolver walks.
 */
export interface WalkedCubic extends WalkedSegmentBase {
    kind: "cubic";
    c1: XY;
    c2: XY;
    /**
     * Set when the segment is a cut of a longer curve (by the beat range, a higher layer or an
     * Adjust key): the whole curve's cumulative chord lengths (R-14's 65-entry table) and the
     * distances along it where this segment starts and ends. The marcher's place at a beat is
     * read from this table, as the resolver reads it, so a cut curve keeps the whole curve's
     * timing. Absent for a whole curve, which is measured on its own 64 chords.
     */
    measured?: { lengths: readonly number[]; from: number; to: number };
}

/**
 * A walk with no exact line, arc or cubic form (R-20 item 5: a curved piece of a group path
 * under a changing Adjust), as points within {@link WALKED_SAMPLE_TOLERANCE} of it. `beats[i]` is
 * when the marcher is at `points[i]`; it moves in a straight line between them.
 */
export interface WalkedPolyline extends WalkedSegmentBase {
    kind: "polyline";
    points: XY[];
    beats: Beat[];
}

export type WalkedSegment =
    | WalkedLine
    | WalkedArc
    | WalkedCubic
    | WalkedPolyline;

/** One marcher's walked path over `[from, to]`: its segments in beat order (R-20). */
export interface WalkedPath {
    marcherId: number;
    from: Beat;
    to: Beat;
    /** Empty when the marcher stands still for the whole range */
    segments: WalkedSegment[];
}

/** A segment's shape before it gets its beats */
type Shape =
    | { kind: "line"; from: XY; to: XY }
    | {
          kind: "arc";
          from: XY;
          to: XY;
          center: XY;
          radius: number;
          startAngle: number;
          sweep: number;
      }
    | {
          kind: "cubic";
          from: XY;
          to: XY;
          c1: XY;
          c2: XY;
          measured?: { lengths: readonly number[]; from: number; to: number };
      }
    /** `us` are the points' fractions of the piece's progress range */
    | { kind: "polyline"; from: XY; to: XY; points: XY[]; us: number[] };

/**
 * A stretch of a span's walk over progress `[pa, pb]`, walked at a constant rate; `cut(u0, u1)`
 * is the part between fractions `u0` and `u1` of it.
 */
interface Piece {
    pa: number;
    pb: number;
    cut(u0: number, u1: number): Shape;
}

const linePiece = (pa: number, pb: number, A: XY, B: XY): Piece => ({
    pa,
    pb,
    cut: (u0, u1) => ({
        kind: "line",
        from: u0 <= 0 ? A : lerp(A, B, u0),
        to: u1 >= 1 ? B : lerp(A, B, u1),
    }),
});

const onCircle = (center: XY, radius: number, a: number): XY => [
    center[0] + radius * Math.cos(a),
    center[1] + radius * Math.sin(a),
];

/**
 * Arc pieces of at most a quarter turn each. `exact(f)` is the resolver's own point at fraction
 * `f` of the whole arc, when it has one: segment ends are read from it, so a cut arc joins what
 * comes next where the resolver puts the marcher.
 */
function arcPieces(
    pa: number,
    pb: number,
    center: XY,
    radius: number,
    startAngle: number,
    sweep: number,
    exact?: (f: number) => XY,
): Piece[] {
    const n = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-12));
    const out: Piece[] = [];
    for (let i = 0; i < n; i++) {
        const a0 = startAngle + (sweep * i) / n;
        const part = sweep / n;
        const last = i === n - 1;
        const end = (u: number): XY =>
            exact
                ? exact(u >= 1 && last ? 1 : (i + u) / n)
                : onCircle(center, radius, a0 + part * u);
        out.push({
            pa: pa + ((pb - pa) * i) / n,
            pb: last ? pb : pa + ((pb - pa) * (i + 1)) / n,
            cut: (u0, u1) => ({
                kind: "arc",
                from: end(u0),
                to: end(u1),
                center,
                radius,
                startAngle: a0 + part * u0,
                sweep: part * (u1 - u0),
            }),
        });
    }
    return out;
}

/** The cubic parameter at distance `x` along a measured cubic, as `routePiecePoint` finds it (R-14). */
function cubicParamAt(e: readonly number[], x: number): number {
    const K = e.length - 1;
    if (x <= 0) return 0;
    let lo = 1;
    let hi = K + 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (x < e[mid]!) hi = mid;
        else lo = mid + 1;
    }
    if (lo > K) return 1;
    return (lo - 1 + (x - e[lo - 1]!) / (e[lo]! - e[lo - 1]!)) / K;
}

/** The part of a cubic between parameters `t0` and `t1`. */
function subCubic(
    p0: XY,
    c1: XY,
    c2: XY,
    p3: XY,
    t0: number,
    t1: number,
): { from: XY; c1: XY; c2: XY; to: XY } {
    if (t0 <= 0 && t1 >= 1) return { from: p0, c1, c2, to: p3 };
    // left part [0, t1]
    let a: [XY, XY, XY, XY] = [p0, c1, c2, p3];
    if (t1 < 1) {
        const q0 = lerp(p0, c1, t1);
        const q1 = lerp(c1, c2, t1);
        const q2 = lerp(c2, p3, t1);
        const r0 = lerp(q0, q1, t1);
        const r1 = lerp(q1, q2, t1);
        a = [p0, q0, r0, lerp(r0, r1, t1)];
    }
    if (t0 <= 0) return { from: a[0], c1: a[1], c2: a[2], to: a[3] };
    // right part of it, from t0 / t1
    const s = t1 > 0 ? t0 / t1 : 0;
    const q0 = lerp(a[0], a[1], s);
    const q1 = lerp(a[1], a[2], s);
    const q2 = lerp(a[2], a[3], s);
    const r0 = lerp(q0, q1, s);
    const r1 = lerp(q1, q2, s);
    return { from: lerp(r0, r1, s), c1: r1, c2: q2, to: a[3] };
}

/**
 * A measured cubic (R-14), from distance `xa` to `xb` along it, moved by `shift`. The whole
 * cubic keeps its own controls.
 */
function cubicPiece(
    pa: number,
    pb: number,
    P0: XY,
    c1: XY,
    c2: XY,
    P3: XY,
    e: readonly number[],
    xa = 0,
    xb = e[e.length - 1]!,
    shift: (q: XY) => XY = (q) => q,
): Piece {
    const total = e[e.length - 1]!;
    return {
        pa,
        pb,
        cut: (u0, u1) => {
            const x0 = xa + (xb - xa) * u0;
            const x1 = xa + (xb - xa) * u1;
            const part = subCubic(
                P0,
                c1,
                c2,
                P3,
                x0 <= 0 ? 0 : cubicParamAt(e, x0),
                x1 >= total ? 1 : cubicParamAt(e, x1),
            );
            const shape: Shape = {
                kind: "cubic",
                from: shift(part.from),
                c1: shift(part.c1),
                c2: shift(part.c2),
                to: shift(part.to),
            };
            // a cut keeps the whole curve's table, so its timing is the resolver's (R-20 item 7)
            if (x0 > 0 || x1 < total)
                shape.measured = {
                    lengths: e,
                    from: Math.max(0, x0),
                    to: Math.min(total, x1),
                };
            return shape;
        },
    };
}

/**
 * A walk known only point by point, as a polyline (R-20 item 5). `knots` are the fractions of the
 * piece between which `at` is a cubic polynomial (here: the 64 chords R-14 measures the curve on,
 * with the Adjust linear between its keys). Every knot inside a cut is a point, and between two
 * knots the points are halved until the bound below is within half the tolerance.
 *
 * The bound: a cubic polynomial `P` over one line of the polyline has Bézier controls `b1`, `b2`
 * (found from `P` at 1/3 and 2/3). `P(s) - lerp(A, B, s)` is then the cubic with controls
 * `0, d1, d2, 0`, `d1 = b1 - lerp(A, B, 1/3)`, `d2 = b2 - lerp(A, B, 2/3)`, so it is never longer
 * than `3s(1 - s) * max(|d1|, |d2|) <= 0.75 * max(|d1|, |d2|)`. That is the distance between
 * where the walk is and where the polyline says it is at the same beat, at every beat.
 */
function sampledPiece(
    pa: number,
    pb: number,
    at: (u: number) => XY,
    knots: readonly number[],
): Piece {
    return {
        pa,
        pb,
        cut: (u0, u1) => {
            const points: XY[] = [];
            const us: number[] = [];
            const limit = WALKED_SAMPLE_TOLERANCE / 2;
            const refine = (
                ua: number,
                A: XY,
                ub: number,
                B: XY,
                depth: number,
            ) => {
                const h = ub - ua;
                const P1 = at(ua + h / 3);
                const P2 = at(ua + (2 * h) / 3);
                let off = 0;
                for (const [w0, w1, w2, w3, f] of [
                    [-5, 18, -9, 2, 1 / 3],
                    [2, -9, 18, -5, 2 / 3],
                ] as const) {
                    const dx =
                        (w0 * A[0] + w1 * P1[0] + w2 * P2[0] + w3 * B[0]) / 6 -
                        (A[0] + (B[0] - A[0]) * f);
                    const dy =
                        (w0 * A[1] + w1 * P1[1] + w2 * P2[1] + w3 * B[1]) / 6 -
                        (A[1] + (B[1] - A[1]) * f);
                    off = Math.max(off, Math.hypot(dx, dy));
                }
                if (depth < 24 && 0.75 * off > limit) {
                    const um = ua + h / 2;
                    const M = at(um);
                    refine(ua, A, um, M, depth + 1);
                    refine(um, M, ub, B, depth + 1);
                    return;
                }
                points.push(B);
                us.push((ub - u0) / (u1 - u0));
            };
            const first = at(u0);
            points.push(first);
            us.push(0);
            let ua = u0;
            let prev = first;
            for (const ub of [...knots.filter((k) => k > u0 && k < u1), u1]) {
                const B = at(ub);
                refine(ua, prev, ub, B, 0);
                ua = ub;
                prev = B;
            }
            us[us.length - 1] = 1;
            return {
                kind: "polyline",
                from: first,
                to: prev,
                points,
                us,
            };
        },
    };
}

/**
 * R-8's arc from `A` to `B` with bulge `k`, as pieces over progress [pa, pb] (R-20 item 3; an arc
 * leg of a route, R-14″, is the same arc).
 */
function bulgePieces(A: XY, B: XY, k: number, pa = 0, pb = 1): Piece[] {
    const dx = B[0] - A[0];
    const dy = B[1] - A[1];
    const c = Math.hypot(dx, dy);
    if (c < EPS_GEOM) return [linePiece(pa, pb, A, B)];
    const exact = (p: number) => arcPoint(A, B, k, p);
    if (Math.abs(k) < WALKED_MIN_BULGE)
        // drawn as a line, but cut where the resolver's arc is, so what comes next joins it
        return [
            {
                pa,
                pb,
                cut: (u0, u1) => ({
                    kind: "line",
                    from: exact(u0),
                    to: exact(u1),
                }),
            },
        ];
    const h = c / 2;
    const s = k * c; // signed sagitta, toward the +90 degree side
    const radius = (h * h + s * s) / (2 * Math.abs(s));
    const nx = -dy / c;
    const ny = dx / c;
    const off = s - Math.sign(s) * radius;
    const center: XY = [
        (A[0] + B[0]) / 2 + nx * off,
        (A[1] + B[1]) / 2 + ny * off,
    ];
    const startAngle = Math.atan2(A[1] - center[1], A[0] - center[0]);
    // the turn from A toward the apex gives the direction; the size is R-8's 2 * phi
    const ax = A[0] - center[0];
    const ay = A[1] - center[1];
    const px = (A[0] + B[0]) / 2 + nx * s - center[0];
    const py = (A[1] + B[1]) / 2 + ny * s - center[1];
    const dir = ax * py - ay * px >= 0 ? 1 : -1;
    const sweep = dir * 4 * Math.atan(2 * Math.abs(k));
    return arcPieces(pa, pb, center, radius, startAngle, sweep, exact);
}

/**
 * The part of R-8's arc from `A` to `B` with bulge `k` between fractions `fa` and `fb` of it: its
 * ends, and the bulge of that part (the same circle, its half-angle `φ·(fb − fa)`).
 */
function subArc(
    A: XY,
    B: XY,
    k: number,
    fa: number,
    fb: number,
): { from: XY; to: XY; k: number } {
    const phi = 2 * Math.atan(2 * k);
    return {
        from: arcPoint(A, B, k, fa),
        to: arcPoint(A, B, k, fb),
        k: fa <= 0 && fb >= 1 ? k : Math.tan((phi * (fb - fa)) / 2) / 2,
    };
}

/** A group member's leg (R-14 group schedule item 5) over progress `[pa, pb]`. */
function legPieces(pa: number, pb: number, leg: GroupLeg): Piece[] {
    const { path } = leg;
    const piece = path.pieces[0]!;
    const S = path.V[0]!;
    const E = path.V[1]!;
    if (piece.kind === "arc") return bulgePieces(S, E, piece.k, pa, pb);
    if (leg.length < EPS_GEOM || piece.kind === "line")
        return [linePiece(pa, pb, S, E)];
    return [cubicPiece(pa, pb, S, piece.c1, piece.c2, E, piece.e)];
}

/** A group lane's walk (R-14 group schedule, R-14′ Adjust) as pieces (R-20 items 4 and 5). */
function groupPieces(walk: GroupMemberWalk): Piece[] {
    const { schedule, A, B, offset, first, last, adjust } = walk;
    if (!first || !last) {
        const only = schedule.W.pieces[0];
        return only?.kind === "arc"
            ? bulgePieces(A, B, only.k)
            : [linePiece(0, 1, A, B)];
    }
    const { W, uFirst, uLast } = schedule;
    const m = W.V.length - 2;
    const out: Piece[] = legPieces(0, uFirst, first);
    const keys = adjust && adjust.xs.length > 0 ? adjust : null;
    for (let j = 1; j < m; j++) {
        const xLo = W.D[j]!;
        const xHi = W.D[j + 1]!;
        const piece = W.pieces[j]!;
        // the piece's parts between Adjust keys: the displacement is linear on each
        const breaks = [xLo];
        if (keys)
            for (const x of keys.xs) if (x > xLo && x < xHi) breaks.push(x);
        breaks.push(xHi);
        for (let i = 0; i + 1 < breaks.length; i++) {
            const xa = breaks[i]!;
            const xb = breaks[i + 1]!;
            const da: XY = keys ? adjustAt(keys, xa) : [0, 0];
            const db: XY = keys ? adjustAt(keys, xb) : [0, 0];
            const place = (q: XY, d: XY): XY => {
                const p = placed(q, offset);
                return keys ? placed(p, d) : p;
            };
            const pa = xa / W.L;
            const pb = xb / W.L;
            const pointAt = (x: number): XY =>
                x <= xLo
                    ? W.V[j]!
                    : x >= xHi
                      ? W.V[j + 1]!
                      : routePiecePoint(W, j, x - xLo);
            if (piece.kind === "line") {
                // a line plus a linear displacement is a line
                out.push(
                    linePiece(
                        pa,
                        pb,
                        place(pointAt(xa), da),
                        place(pointAt(xb), db),
                    ),
                );
            } else if (piece.kind === "arc") {
                const len = xHi - xLo;
                if (da[0] === db[0] && da[1] === db[1]) {
                    // a moved arc is the same arc (R-14″)
                    const part = subArc(
                        W.V[j]!,
                        W.V[j + 1]!,
                        piece.k,
                        (xa - xLo) / len,
                        (xb - xLo) / len,
                    );
                    out.push(
                        ...bulgePieces(
                            place(part.from, da),
                            place(part.to, da),
                            part.k,
                            pa,
                            pb,
                        ),
                    );
                } else
                    out.push(
                        sampledPiece(
                            pa,
                            pb,
                            (u) => {
                                const x = xa + (xb - xa) * u;
                                return place(pointAt(x), adjustAt(keys!, x));
                            },
                            Array.from(
                                { length: ROUTE_ARC_SAMPLES + 1 },
                                (_, i) =>
                                    (xLo + (len * i) / ROUTE_ARC_SAMPLES - xa) /
                                    (xb - xa),
                            ),
                        ),
                    );
            } else if (da[0] === db[0] && da[1] === db[1]) {
                out.push(
                    cubicPiece(
                        pa,
                        pb,
                        W.V[j]!,
                        piece.c1,
                        piece.c2,
                        W.V[j + 1]!,
                        piece.e,
                        xa - xLo,
                        xb - xLo,
                        (q) => place(q, da),
                    ),
                );
            } else {
                out.push(
                    sampledPiece(
                        pa,
                        pb,
                        (u) => {
                            const x = xa + (xb - xa) * u;
                            return place(pointAt(x), adjustAt(keys!, x));
                        },
                        // where R-14's chords of this curve begin, as fractions of the part
                        piece.e.map((e) => (xLo + e - xa) / (xb - xa)),
                    ),
                );
            }
        }
    }
    out.push(...legPieces(uLast, 1, last));
    return out;
}

/** A marcher's own path (R-14; arc legs R-14″) as pieces. */
function routePieces(path: RoutePath): Piece[] {
    const { V, D, L } = path;
    const only = V.length === 2 ? path.pieces[0] : undefined;
    if (only?.kind === "arc") return bulgePieces(V[0]!, V[1]!, only.k);
    if (V.length === 2 || L < EPS_GEOM)
        return [linePiece(0, 1, V[0]!, V[V.length - 1]!)];
    return path.pieces.flatMap((piece, j) =>
        piece.kind === "line"
            ? [linePiece(D[j]! / L, D[j + 1]! / L, V[j]!, V[j + 1]!)]
            : piece.kind === "arc"
              ? bulgePieces(V[j]!, V[j + 1]!, piece.k, D[j]! / L, D[j + 1]! / L)
              : [
                    cubicPiece(
                        D[j]! / L,
                        D[j + 1]! / L,
                        V[j]!,
                        piece.c1,
                        piece.c2,
                        V[j + 1]!,
                        piece.e,
                    ),
                ],
    );
}

/** The corners of a polyline destination path (R-13), or null for a circle. */
function destCorners(shape: ShapeRow): XY[] | null {
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

/** The stretch `[d0, d1]` of a polyline with cumulative lengths `cum`, mapped onto `[pa, pb]`. */
function polylinePieces(
    pts: readonly XY[],
    cum: readonly number[],
    d0: number,
    d1: number,
    progressOf: (d: number) => number,
): Piece[] {
    const out: Piece[] = [];
    for (let i = 1; i < pts.length; i++) {
        const lo = Math.max(d0, cum[i - 1]!);
        const hi = Math.min(d1, cum[i]!);
        const len = cum[i]! - cum[i - 1]!;
        if (hi <= lo || len <= 0) continue;
        const at = (d: number): XY =>
            d <= cum[i - 1]!
                ? pts[i - 1]!
                : d >= cum[i]!
                  ? pts[i]!
                  : lerp(pts[i - 1]!, pts[i]!, (d - cum[i - 1]!) / len);
        out.push(linePiece(progressOf(lo), progressOf(hi), at(lo), at(hi)));
    }
    return out;
}

/** What a walked path is read from: the resolver's spans, positions and follow-the-leader order. */
export type WalkResolver = Pick<
    Resolver,
    "spanInfos" | "positionAt" | "ftlEntry"
>;

/** A follow-the-leader transition's order and targets, indexed by marcher (R-9). */
interface FtlOrder {
    entry: FtlEntryInfo;
    qOf: Map<number, number>;
    targets: Map<number, XY>;
}

/**
 * A follow-the-leader trail as drawable legs (R-9, R-9′, R-12′, R-13′, R-13″): the polyline
 * before the drawn part or the destination (`pre`), the drawn part, then the destination path as
 * walked (reversed for R-12′). An along-way (R-13″) has no destination.
 */
interface FtlTrail {
    pre: XY[];
    cum: number[];
    destOffset: number;
    /** R-9′: the trail route's drawn part and the distance it starts at */
    drawn: { start: number; path: RoutePath } | null;
    /** The destination as walked: a polyline, a circle's arc, or none (R-13″) */
    dest:
        | { kind: "polyline"; corners: XY[]; cum: number[] }
        | {
              kind: "circle";
              center: XY;
              radius: number;
              startAngle: number;
              dir: number;
          }
        | null;
}

/**
 * The walked paths of one snapshot and its resolver (R-20), for asking about many marchers and
 * ranges in a row, as an export does. What every marcher of a move shares (a follow-the-leader
 * trail, a group path's schedule, the destinations) is worked out once and kept, so a path costs
 * what its own segments cost.
 *
 * It holds what it read: make a new one after the snapshot or the resolver changes.
 */
export interface WalkedPaths {
    /** {@link walkedPath} */
    path(marcherId: number, from: Beat, to: Beat): WalkedPath;
    /** {@link walkedPathOfMove} */
    ofMove(marcherId: number, transitionId: number): WalkedPath;
}

/** See {@link WalkedPaths}. `host` is the snapshot `resolver` was built from. */
export function createWalkedPaths(
    host: TimelineSnapshot,
    resolver: WalkResolver,
): WalkedPaths {
    const spans = new Map<number, SpanInfo[]>();
    const spots = new Map<number, XY[]>();
    const orders = new Map<number, FtlOrder>();
    const trails = new Map<number, FtlTrail>();
    const schedules = new Map<number, GroupSchedule>();
    const adjusts = new Map<LaneRow, ResolvedAdjust>();
    let lanes: Map<string, LaneRow> | null = null;

    const spansOf = (marcherId: number): SpanInfo[] => {
        let list = spans.get(marcherId);
        if (!list) spans.set(marcherId, (list = resolver.spanInfos(marcherId)));
        return list;
    };
    const spotsOf = (t: TransitionRow): XY[] => {
        let pts = spots.get(t.id);
        if (!pts) spots.set(t.id, (pts = destinationsOf(t, host.shapes)));
        return pts;
    };
    const laneOf = (transition: number, slot: number): LaneRow | undefined => {
        if (!host.lanes) return undefined;
        lanes ??= new Map(
            Object.values(host.lanes).map((lane) => [
                `${lane.transition}:${lane.slot}`,
                lane,
            ]),
        );
        return lanes.get(`${transition}:${slot}`);
    };
    const scheduleOf = (routeId: number, route: RouteWalk): GroupSchedule => {
        let schedule = schedules.get(routeId);
        if (!schedule)
            schedules.set(routeId, (schedule = groupSchedule(route)));
        return schedule;
    };
    const adjustOf = (
        lane: LaneRow,
        schedule: GroupSchedule,
        route: RouteWalk,
    ): ResolvedAdjust | null => {
        if (!lane.adjust) return null;
        let resolved = adjusts.get(lane);
        if (!resolved)
            adjusts.set(
                lane,
                (resolved = resolveAdjust(schedule, route.points, lane.adjust)),
            );
        return resolved;
    };
    const orderOf = (t: TransitionRow): FtlOrder => {
        let order = orders.get(t.id);
        if (!order) {
            const entry = resolver.ftlEntry(t.id);
            order = {
                entry,
                qOf: new Map(entry.members.map((id, q) => [id, q])),
                targets: new Map(entry.targets),
            };
            orders.set(t.id, order);
        }
        return order;
    };
    const trailOf = (t: TransitionRow, entry: FtlEntryInfo): FtlTrail => {
        let trail = trails.get(t.id);
        if (trail) return trail;
        const reverse = t.params?.reverse === true;
        const along = t.dest == null && t.params?.ends === "along";
        const shape = t.dest == null ? undefined : host.shapes[t.dest];
        if (t.dest != null && !shape)
            throw new Error(
                `follow-the-leader transition ${t.id} has no destination path`,
            );
        // the destination as walked (R-13, R-13′), entered from its far end when reversed (R-12′)
        let dest: FtlTrail["dest"] = null;
        let L = 0;
        if (!along) {
            const corners = shape ? destCorners(shape) : spotsOf(t);
            if (corners) {
                const line = corners.length ? [...corners] : [[0, 0] as XY];
                if (reverse) line.reverse();
                const cum = cumOf(line);
                L = cum[cum.length - 1]!;
                dest = { kind: "polyline", corners: line, cum };
            } else if (shape?.kind === "circle") {
                const g = shape.geometry;
                const dir = g.clockwise ? -1 : 1;
                L = 2 * Math.PI * g.radius;
                dest = reverse
                    ? {
                          kind: "circle",
                          center: g.center,
                          radius: g.radius,
                          startAngle: g.start_angle + dir * (L / g.radius),
                          dir: -dir,
                      }
                    : {
                          kind: "circle",
                          center: g.center,
                          radius: g.radius,
                          startAngle: g.start_angle,
                          dir,
                      };
            }
        }
        const entrance: XY =
            dest?.kind === "polyline"
                ? dest.corners[0]!
                : dest?.kind === "circle"
                  ? onCircle(dest.center, dest.radius, dest.startAngle)
                  : [0, 0];
        // A founding span's origin is where the resolver has its marcher as the move starts
        const origins = entry.members.map((id) =>
            resolver.positionAt(id, t.start),
        );
        const route =
            t.route == null ? null : (host.routes?.[t.route]?.geometry ?? null);
        // the resolver's own trail (R-9, R-9′, R-13″), for the drawn part and where it starts
        const made = along
            ? makeAlongTrail(origins, route)
            : makeTrail(
                  origins,
                  t.params?.waypoints ?? [],
                  { closed: false, L, at: () => entrance },
                  route,
              );
        const pre: XY[] =
            made.drawn || along
                ? origins.length
                    ? origins
                    : [[0, 0]]
                : [
                      ...origins,
                      ...(route && origins.length
                          ? []
                          : (t.params?.waypoints ?? [])),
                      entrance,
                  ];
        const cum = cumOf(pre);
        trail = {
            pre,
            cum,
            destOffset: made.destOffset,
            drawn: made.drawn ?? null,
            dest,
        };
        trails.set(t.id, trail);
        return trail;
    };

    /** The stretch `[d0, d1]` of a trail's drawn part, mapped by `progressOf`. */
    function drawnPieces(
        drawn: { start: number; path: RoutePath },
        d0: number,
        d1: number,
        progressOf: (d: number) => number,
    ): Piece[] {
        const { start, path: W } = drawn;
        const out: Piece[] = [];
        W.pieces.forEach((piece, j) => {
            const lo = Math.max(d0, start + W.D[j]!);
            const hi = Math.min(d1, start + W.D[j + 1]!);
            if (hi <= lo) return;
            const xa = lo - start - W.D[j]!;
            const xb = hi - start - W.D[j]!;
            const P0 = W.V[j]!;
            const P3 = W.V[j + 1]!;
            if (piece.kind === "line") {
                const len = W.D[j + 1]! - W.D[j]!;
                const at = (x: number): XY =>
                    x <= 0 ? P0 : x >= len ? P3 : lerp(P0, P3, x / len);
                out.push(
                    linePiece(progressOf(lo), progressOf(hi), at(xa), at(xb)),
                );
            } else if (piece.kind === "arc") {
                // R-14″: an arc leg is R-8's arc, walked at constant speed, so its stretch is
                // the same circle's part, in pieces of at most a quarter turn
                const len = W.D[j + 1]! - W.D[j]!;
                const part = subArc(P0, P3, piece.k, xa / len, xb / len);
                out.push(
                    ...bulgePieces(
                        part.from,
                        part.to,
                        part.k,
                        progressOf(lo),
                        progressOf(hi),
                    ),
                );
            } else
                out.push(
                    cubicPiece(
                        progressOf(lo),
                        progressOf(hi),
                        P0,
                        piece.c1,
                        piece.c2,
                        P3,
                        piece.e,
                        xa,
                        xb,
                    ),
                );
        });
        return out;
    }

    /** A founding follow-the-leader span (R-10, R-13″): the marcher's stretch of the trail. */
    function ftlPieces(t: TransitionRow, order: FtlOrder, q: number): Piece[] {
        const { entry } = order;
        const d0 = entry.startDist[q]!;
        const d1 = entry.endDist[q]!;
        // R-13″: the way to its end, then straight to its spot, at one speed
        const straight = entry.along?.straight[q] ?? 0;
        const total = d1 - d0 + straight;
        if (!(total >= EPS_GEOM)) return [];
        const trail = trailOf(t, entry);
        const { pre, cum, destOffset, drawn, dest } = trail;
        const progressOf = (d: number) => (d - d0) / total;
        const preEnd = drawn ? drawn.start : destOffset;
        const out = polylinePieces(
            pre,
            cum,
            d0,
            Math.min(d1, preEnd),
            progressOf,
        );
        if (drawn && d1 > drawn.start)
            out.push(
                ...drawnPieces(drawn, d0, Math.min(d1, destOffset), progressOf),
            );
        if (entry.along) {
            if (straight > 0) {
                const target = order.targets.get(entry.members[q]!)!;
                out.push(
                    linePiece(progressOf(d1), 1, entry.along.turn[q]!, target),
                );
            }
            return out;
        }
        if (d1 <= destOffset || !dest) return out;
        const s0 = Math.max(0, d0 - destOffset);
        const s1 = d1 - destOffset;
        if (dest.kind === "polyline") {
            out.push(
                ...polylinePieces(dest.corners, dest.cum, s0, s1, (s) =>
                    progressOf(s + destOffset),
                ),
            );
        } else {
            out.push(
                ...arcPieces(
                    progressOf(s0 + destOffset),
                    1,
                    dest.center,
                    dest.radius,
                    dest.startAngle + dest.dir * (s0 / dest.radius),
                    dest.dir * ((s1 - s0) / dest.radius),
                ),
            );
        }
        return out;
    }

    /** The pieces of one span's walk over progress [0, 1] (the resolver's `evalSpan`, R-20 item 2). */
    function spanPieces(span: SpanInfo, t: TransitionRow): Piece[] {
        // R-4: a span starts where the resolver has its marcher at the span's first beat
        const A = resolver.positionAt(span.marcherId, span.start);
        const founding = span.kind === "founding";
        if (t.style === "follow_the_leader") {
            const order = orderOf(t);
            const q = founding ? order.qOf.get(span.marcherId) : undefined;
            if (q !== undefined) return ftlPieces(t, order, q);
            // R-11: a join or resume walks straight to its target
            const target = order.targets.get(span.marcherId);
            return target ? [linePiece(0, 1, A, target)] : [];
        }
        const B = spotsOf(t)[span.slot!]!;
        const lane = laneOf(t.id, span.slot!);
        if (lane) {
            if (!founding) return [linePiece(0, 1, A, B)];
            const geometry = host.routes?.[lane.route]?.geometry;
            if (!geometry)
                throw new Error(
                    `lane on ${t.id}:${lane.slot} has no route ${lane.route} (I-D3)`,
                );
            const route: RouteWalk = geometry;
            if (lane.offset) {
                const schedule = scheduleOf(lane.route, route);
                return groupPieces(
                    groupMemberWalk(
                        schedule,
                        A,
                        B,
                        lane.offset,
                        adjustOf(lane, schedule, route),
                    ),
                );
            }
            if (route.points.length === 0 && !route.toBulge)
                return [linePiece(0, 1, A, B)];
            return routePieces(routePath(A, route.points, B, route));
        }
        if (t.style === "arc") return bulgePieces(A, B, t.params?.bulge ?? 0);
        return [linePiece(0, 1, A, B)];
    }

    function collect(
        marcherId: number,
        from: Beat,
        to: Beat,
        onlyTransition: number | null,
    ): WalkedPath {
        const segments: WalkedSegment[] = [];
        for (const span of spansOf(marcherId)) {
            if (span.transitionId === null || span.kind === "hold") continue;
            if (onlyTransition !== null && span.transitionId !== onlyTransition)
                continue;
            const b0 = Math.max(from, span.start);
            const b1 = Math.min(to, span.end);
            if (!(b1 > b0)) continue;
            const t = host.transitions[span.transitionId];
            if (!t) continue;
            // R-5: progress runs from the span's start to its transition's end
            const length = t.end - span.start;
            if (!(length > 0)) continue;
            const p0 = (b0 - span.start) / length;
            const p1 = Math.min(1, (b1 - span.start) / length);
            const beatOf = (p: number) => span.start + p * length;
            for (const piece of spanPieces(span, t)) {
                const lo = Math.max(p0, piece.pa);
                const hi = Math.min(p1, piece.pb);
                if (!(hi > lo) || !(piece.pb > piece.pa)) continue;
                const width = piece.pb - piece.pa;
                const shape = piece.cut(
                    lo <= piece.pa ? 0 : (lo - piece.pa) / width,
                    hi >= piece.pb ? 1 : (hi - piece.pa) / width,
                );
                // R-20 item 6: standing still draws nothing
                if (
                    shape.kind === "line" &&
                    dist(shape.from, shape.to) < EPS_GEOM
                )
                    continue;
                const base = {
                    start: beatOf(lo),
                    end: beatOf(hi),
                    transitionId: t.id,
                };
                if (shape.kind === "polyline") {
                    const { us, ...rest } = shape;
                    segments.push({
                        ...base,
                        ...rest,
                        beats: us.map(
                            (u) => base.start + u * (base.end - base.start),
                        ),
                    });
                } else segments.push({ ...base, ...shape });
            }
        }
        return { marcherId, from, to, segments };
    }

    return {
        path: (marcherId, from, to) => collect(marcherId, from, to, null),
        ofMove(marcherId, transitionId) {
            const t = host.transitions[transitionId];
            if (!t) return { marcherId, from: 0, to: 0, segments: [] };
            return collect(marcherId, t.start, t.end, transitionId);
        },
    };
}

/**
 * R-20: the path `marcherId` walks from beat `from` to beat `to`, as drawable segments in beat
 * order. `host` is the snapshot `resolver` was built from (or is kept in step with).
 *
 * Times a marcher stands still (holds, and moves that go nowhere) have no segment, so the path
 * is empty when it never moves in the range. Consecutive segments join end to start.
 *
 * For many paths of one snapshot use {@link createWalkedPaths}: this works out a move's shared
 * parts (such as a follow-the-leader trail) afresh on every call.
 */
export function walkedPath(
    host: TimelineSnapshot,
    resolver: WalkResolver,
    marcherId: number,
    from: Beat,
    to: Beat,
): WalkedPath {
    return createWalkedPaths(host, resolver).path(marcherId, from, to);
}

/**
 * R-20: the path `marcherId` walks in one move (transition), over all the beats it is in it.
 * Empty when the marcher is not in the move.
 */
export function walkedPathOfMove(
    host: TimelineSnapshot,
    resolver: WalkResolver,
    marcherId: number,
    transitionId: number,
): WalkedPath {
    return createWalkedPaths(host, resolver).ofMove(marcherId, transitionId);
}

const cubicTables = new WeakMap<WalkedCubic, number[]>();
function cubicTable(seg: WalkedCubic): number[] {
    let e = cubicTables.get(seg);
    if (!e) {
        const K = ROUTE_CUBIC_SAMPLES;
        e = [0];
        let prev = seg.from;
        let total = 0;
        for (let i = 1; i <= K; i++) {
            const s =
                i === K
                    ? seg.to
                    : cubicPoint(seg.from, seg.c1, seg.c2, seg.to, i / K);
            total += dist(prev, s);
            e.push(total);
            prev = s;
        }
        cubicTables.set(seg, e);
    }
    return e;
}

/** Where a segment's marcher is at fraction `f` of the segment's beats. */
function segmentPoint(seg: WalkedSegment, f: number): XY {
    if (f <= 0) return seg.from;
    if (f >= 1) return seg.to;
    switch (seg.kind) {
        case "line":
            return lerp(seg.from, seg.to, f);
        case "arc":
            return onCircle(
                seg.center,
                seg.radius,
                seg.startAngle + seg.sweep * f,
            );
        case "cubic": {
            const cut = seg.measured;
            if (!cut) {
                const e = cubicTable(seg);
                const t = cubicParamAt(e, f * e[e.length - 1]!);
                return cubicPoint(seg.from, seg.c1, seg.c2, seg.to, t);
            }
            // the whole curve's parameter at this distance, as R-14 finds it, then this cut's
            const t0 = cubicParamAt(cut.lengths, cut.from);
            const t1 = cubicParamAt(cut.lengths, cut.to);
            if (!(t1 > t0)) return lerp(seg.from, seg.to, f);
            const t = cubicParamAt(
                cut.lengths,
                cut.from + f * (cut.to - cut.from),
            );
            return cubicPoint(
                seg.from,
                seg.c1,
                seg.c2,
                seg.to,
                Math.max(0, Math.min(1, (t - t0) / (t1 - t0))),
            );
        }
        case "polyline": {
            const beat = seg.start + f * (seg.end - seg.start);
            const { points, beats } = seg;
            let i = 1;
            while (i < beats.length - 1 && beats[i]! < beat) i++;
            const span = beats[i]! - beats[i - 1]!;
            return span > 0
                ? lerp(
                      points[i - 1]!,
                      points[i]!,
                      (beat - beats[i - 1]!) / span,
                  )
                : points[i]!;
        }
    }
}

/**
 * R-20 item 7: where the path's marcher is at `beat`, within {@link WALKED_SAMPLE_TOLERANCE} of
 * the resolver's `positionAt` for beats in `[path.from, path.to]`. Between segments the marcher
 * stands where the last one ended (before the first, where it starts). null for an empty path:
 * the marcher stands still, and the path doesn't say where.
 */
export function walkedPathPointAt(path: WalkedPath, beat: Beat): XY | null {
    const { segments } = path;
    if (segments.length === 0) return null;
    if (beat <= segments[0]!.start) return segments[0]!.from;
    // the last segment that has started
    let lo = 0;
    let hi = segments.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (segments[mid]!.start <= beat) lo = mid;
        else hi = mid - 1;
    }
    const seg = segments[lo]!;
    if (beat >= seg.end) return seg.to;
    return segmentPoint(seg, (beat - seg.start) / (seg.end - seg.start));
}

export interface WalkedSvgOptions {
    /** Decimal places kept; 3 by default */
    precision?: number;
}

/**
 * R-20 item 8: the path as an SVG path `d` string, in the resolver's coordinates (x right, y
 * down, as SVG's): `M` to the start, then `L`, `A` or `C` per segment (a polyline segment is a
 * run of `L`). A new `M` starts wherever a segment doesn't begin where the last ended. Empty for
 * an empty path.
 */
export function walkedPathToSvg(
    path: WalkedPath,
    options: WalkedSvgOptions = {},
): string {
    const scale = 10 ** (options.precision ?? 3);
    const n = (v: number) => {
        if (!Number.isFinite(v))
            throw new Error(
                `walked path of marcher ${path.marcherId} has a coordinate that is not a number`,
            );
        return String(Math.round(v * scale) / scale);
    };
    const pt = (p: XY) => `${n(p[0])} ${n(p[1])}`;
    const out: string[] = [];
    let at: XY | null = null;
    for (const seg of path.segments) {
        if (!at || dist(at, seg.from) > 1e-6) out.push(`M ${pt(seg.from)}`);
        switch (seg.kind) {
            case "line":
                out.push(`L ${pt(seg.to)}`);
                break;
            case "arc":
                // y points down, so a growing angle turns clockwise on screen: sweep flag 1
                out.push(
                    `A ${n(seg.radius)} ${n(seg.radius)} 0 0 ${seg.sweep > 0 ? 1 : 0} ${pt(seg.to)}`,
                );
                break;
            case "cubic":
                out.push(`C ${pt(seg.c1)} ${pt(seg.c2)} ${pt(seg.to)}`);
                break;
            case "polyline":
                for (let i = 1; i < seg.points.length; i++)
                    out.push(`L ${pt(seg.points[i]!)}`);
                break;
        }
        at = seg.to;
    }
    return out.join(" ");
}

/**
 * R-20 item 9: the path as polylines, for apps that draw no curves: every point is on the walked
 * path (or on a polyline segment's own points), and the lines between them stay within
 * `tolerance` of it. One polyline per connected run; usually one.
 */
export function walkedPathToPolylines(
    path: WalkedPath,
    tolerance: number = WALKED_SAMPLE_TOLERANCE,
): XY[][] {
    const tol = Math.max(tolerance, 1e-6);
    const out: XY[][] = [];
    let run: XY[] | null = null;
    for (const seg of path.segments) {
        if (!run || dist(run[run.length - 1]!, seg.from) > 1e-6) {
            run = [seg.from];
            out.push(run);
        }
        switch (seg.kind) {
            case "line":
                break;
            case "arc": {
                // sagitta of a chord over angle a: r * (1 - cos(a / 2))
                const step =
                    tol >= seg.radius
                        ? Math.PI
                        : 2 * Math.acos(1 - tol / seg.radius);
                const parts = Math.max(
                    1,
                    Math.ceil(Math.abs(seg.sweep) / step),
                );
                for (let i = 1; i < parts; i++)
                    run.push(
                        onCircle(
                            seg.center,
                            seg.radius,
                            seg.startAngle + (seg.sweep * i) / parts,
                        ),
                    );
                break;
            }
            case "cubic": {
                // Wang's bound from the control polygon's second differences
                const second = (a: XY, b: XY, c: XY) =>
                    Math.hypot(a[0] - 2 * b[0] + c[0], a[1] - 2 * b[1] + c[1]);
                const bend = Math.max(
                    second(seg.from, seg.c1, seg.c2),
                    second(seg.c1, seg.c2, seg.to),
                );
                const parts = Math.max(
                    1,
                    Math.ceil(Math.sqrt((0.75 * bend) / tol)),
                );
                for (let i = 1; i < parts; i++)
                    run.push(
                        cubicPoint(seg.from, seg.c1, seg.c2, seg.to, i / parts),
                    );
                break;
            }
            case "polyline":
                for (let i = 1; i < seg.points.length - 1; i++)
                    run.push(seg.points[i]!);
                break;
        }
        run.push(seg.to);
    }
    return out;
}

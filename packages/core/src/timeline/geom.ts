// cspell:ignore lerp
/**
 * Shared, stateless timeline geometry (spec R-2, R-8, R-13, section 8.10).
 * Ported from `docs/timeline/ref/geom.mjs`.
 *
 * No curve is ever flattened: circles are evaluated from their exact
 * parameterization. All arithmetic is Float64 (plain JS numbers).
 */
import type {
    AdjustAnchor,
    AdjustProfile,
    AssignmentRow,
    DestPath,
    Diagnostic,
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

/**
 * R-13′ (pathways step 4): the destination path of a follow-the-leader transition with no shape,
 * the line through its slots' destinations in slot order. Each slot's destination is a vertex,
 * at `stops[i]` along it.
 */
export function pointsPath(points: readonly XY[]): DestPath {
    const pts = points.length ? points : [[0, 0] as XY];
    const cum = cumOf(pts);
    return {
        closed: false,
        L: cum[cum.length - 1]!,
        at: (s) => pointAtDistance(pts, cum, s),
        stops: cum,
    };
}

/** R-9, R-13′: a follow-the-leader transition's destination path, from its shape or its points. */
export function ftlDestPath(
    t: Pick<TransitionRow, "dest" | "points" | "slots">,
    shapes: Record<number, ShapeRow>,
): DestPath {
    if (t.dest == null) return pointsPath(destinationsOf(t, shapes));
    const shape = shapes[t.dest];
    if (!shape) throw new Error(`shape ${t.dest} not found`);
    return destPath(shape);
}

/**
 * How a follow-the-leader entry reads its destination (R-9 steps 4 and 5, R-12′, R-13′): the
 * path as the trail walks it, each member's and each other row's point, and a point's distance
 * along the walked path.
 *
 * - With a shape, member `q` of `m` takes sample `n-m+q` and the `k`-th other row `n-m-1-k`
 *   (R-9). With `reverse` the path is entered from its far end, so they take `m-1-q` and `m+k`:
 *   the vacancies stay at the entrance.
 * - With no shape (R-13′), every row takes its own slot's destination, whoever else is there.
 */
export function ftlDestination(path: DestPath, n: number, reverse: boolean) {
    const stop = (j: number): number =>
        path.stops
            ? (path.stops[j] ?? path.L)
            : paramT(path.closed, j, n) * path.L;
    const own = path.stops !== undefined;
    const walked: DestPath = reverse
        ? {
              closed: path.closed,
              L: path.L,
              at: (s) => path.at(path.L - s),
          }
        : path;
    return {
        walked,
        /** The point of member `q` of `m`, who is in slot `slot` */
        member: (q: number, m: number, slot: number) =>
            own ? slot : reverse ? m - 1 - q : n - m + q,
        /** The point of the `k`-th other row, which is on slot `slot` */
        other: (k: number, m: number, slot: number) =>
            own ? slot : reverse ? m + k : n - m - 1 - k,
        /** Point `j`'s distance along the walked path */
        along: (j: number) => (reverse ? path.L - stop(j) : stop(j)),
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
 *
 * R-9′ (pathways step 4): with a trail route, the line-up through the member origins is
 * followed by the route's drawn part, R-14's walk from the leader's origin through the route's
 * points to the destination's start (curves exact, as R-14 measures them), then the destination
 * path. `waypoints` are not read then. A route with no point kept is R-9 with no waypoints, bit
 * for bit (QA-TR-2).
 */
export function makeTrail(
    origins: readonly XY[],
    waypoints: readonly XY[],
    path: DestPath,
    route?: RouteWalk | null,
): FtlTrail {
    if (route && origins.length > 0) {
        const entrance = path.at(0);
        const W = routePath(
            origins[origins.length - 1]!,
            route.points,
            entrance,
            route,
        );
        // R-14″: a trail of one arc leg is drawn too
        if (
            (W.V.length > 2 || W.pieces[0]!.kind === "arc") &&
            W.L >= EPS_GEOM
        ) {
            const lineUp = [...origins];
            const cum = cumOf(lineUp);
            const lineLen = cum[cum.length - 1]!;
            const destOffset = lineLen + W.L;
            return {
                cum,
                destOffset,
                drawn: { start: lineLen, path: W },
                at: (d) =>
                    d < lineLen
                        ? pointAtDistance(lineUp, cum, d)
                        : d < destOffset
                          ? routePointAtDistance(W, d - lineLen)
                          : path.at(d - destOffset),
            };
        }
        waypoints = [];
    }
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

/**
 * R-13″ (pathways step 4b): the **way** `P` of a follow-the-leader transition whose ends are
 * along it (`path_params.ends = "along"`, no shape). It is the line-up through the member origins
 * (tail first), then the drawn part `W`: R-14's walk from the leader's origin through the trail
 * route's points but the last, to the last (the route's `from` and `to` as tangent neighbours).
 * There is no destination path: `destOffset` is the way's whole length and `at` stops at its end.
 * With no route, or no length drawn, `P` is the line-up.
 */
export function makeAlongTrail(
    origins: readonly XY[],
    route?: RouteWalk | null,
): FtlTrail {
    const lineUp: XY[] = origins.length ? [...origins] : [[0, 0]];
    const cum = cumOf(lineUp);
    const lineLen = cum[cum.length - 1]!;
    const last = route?.points[route.points.length - 1];
    if (route && origins.length > 0 && last) {
        // R-14″: the leg into the last point is an arc by that point's own bulge (the route's
        // `toBulge` is for a leg to `to`, which here has no length)
        const { toBulge: _toTo, ...ends } = route;
        const W = routePath(
            lineUp[lineUp.length - 1]!,
            route.points.slice(0, -1),
            last.at,
            last.bulge === undefined ? ends : { ...ends, toBulge: last.bulge },
        );
        if (W.L >= EPS_GEOM) {
            const total = lineLen + W.L;
            return {
                cum,
                lineUp,
                destOffset: total,
                drawn: { start: lineLen, path: W },
                at: (d) =>
                    d < lineLen
                        ? pointAtDistance(lineUp, cum, d)
                        : routePointAtDistance(W, d - lineLen),
            };
        }
    }
    return {
        cum,
        lineUp,
        destOffset: lineLen,
        at: (d) => pointAtDistance(lineUp, cum, d),
    };
}

/**
 * R-14″: the fraction `f` (0 ≤ f ≤ 1) of R-8's arc from `A` to `B` with bulge `k` whose point is
 * nearest `q`. In the chord's frame (from its midpoint, `x` toward `B`, `y` to the +90° side) the
 * arc's point at `f` is `R·(sin θ, cos θ)` about its centre `(0, −h·cot φ)`, with `θ = φ·(2f − 1)`,
 * `R = h / sin φ` and `φ = 2·atan(2k)`; `q`'s angle there is `atan2(x·sin φ, y·sin φ + h·cos φ)`
 * (nothing far away is formed), clamped to the arc's span `[−|φ|, |φ|]`, the nearer end in angle.
 * A chord under `EPS_GEOM` or a half-angle under `1e-12` is R-8's straight line, projected so.
 */
export function nearestOnArc(A: XY, B: XY, k: number, q: XY): number {
    const dx = B[0] - A[0];
    const dy = B[1] - A[1];
    const c = Math.hypot(dx, dy);
    if (c < EPS_GEOM) return 0;
    const phi = 2 * Math.atan(2 * k);
    const ux = dx / c;
    const uy = dy / c;
    const rx = q[0] - (A[0] + B[0]) / 2;
    const ry = q[1] - (A[1] + B[1]) / 2;
    const x = rx * ux + ry * uy;
    if (Math.abs(phi) < 1e-12) return clamp01(x / c + 0.5);
    const y = -rx * uy + ry * ux;
    const h = c / 2;
    const sinPhi = Math.sin(phi);
    const theta = Math.atan2(x * sinPhi, y * sinPhi + h * Math.cos(phi));
    const span = Math.abs(phi);
    return (Math.max(-span, Math.min(span, theta)) / phi + 1) / 2;
}

/**
 * R-13″: the arc length on an along-way `trail` ({@link makeAlongTrail}) of the point of it
 * nearest `p`, ties to the larger distance. Lines and arc legs (R-14″, {@link nearestOnArc}) are
 * projected exactly; a cubic piece of the drawn part is projected onto the 64 chords R-14
 * measures it on, its distance read from the same table.
 */
export function nearestAlong(trail: FtlTrail, p: XY): number {
    let best = Infinity;
    let at = 0;
    const consider = (a: XY, b: XY, d0: number, len: number) => {
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const l2 = dx * dx + dy * dy;
        const f =
            l2 > 0
                ? clamp01(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)
                : 0;
        const dd = Math.hypot(a[0] + dx * f - p[0], a[1] + dy * f - p[1]);
        if (dd <= best) {
            best = dd;
            at = d0 + f * len;
        }
    };
    const lineUp = trail.lineUp ?? [trail.at(0)];
    const { cum } = trail;
    consider(lineUp[0]!, lineUp[0]!, 0, 0);
    for (let i = 1; i < lineUp.length; i++)
        consider(
            lineUp[i - 1]!,
            lineUp[i]!,
            cum[i - 1]!,
            cum[i]! - cum[i - 1]!,
        );
    const drawn = trail.drawn;
    if (drawn) {
        const W = drawn.path;
        W.pieces.forEach((piece, j) => {
            const P0 = W.V[j]!;
            const P3 = W.V[j + 1]!;
            const base = drawn.start + W.D[j]!;
            if (piece.kind === "line") {
                consider(P0, P3, base, W.D[j + 1]! - W.D[j]!);
                return;
            }
            if (piece.kind === "arc") {
                // R-14″: projected onto the circle exactly, its length linear in the arc's
                // fraction (constant angular speed); the ends are candidates too
                const len = W.D[j + 1]! - W.D[j]!;
                const f = nearestOnArc(P0, P3, piece.k, p);
                consider(P0, P0, base, 0);
                consider(P3, P3, base + len, 0);
                const at = arcPoint(P0, P3, piece.k, f);
                consider(at, at, base + f * len, 0);
                return;
            }
            const K = ROUTE_CUBIC_SAMPLES;
            let prev = P0;
            for (let i = 1; i <= K; i++) {
                const s =
                    i === K
                        ? P3
                        : cubicPoint(P0, piece.c1, piece.c2, P3, i / K);
                consider(
                    prev,
                    s,
                    base + piece.e[i - 1]!,
                    piece.e[i]! - piece.e[i - 1]!,
                );
                prev = s;
            }
        });
    }
    return at;
}

/**
 * R-13″: each member's end on an along-way: `e_q`, its spot's projection onto the way, made
 * strictly increasing in trail order (`e_q ≥ e_{q−1} + ε_geom`, P-5), then never behind its own
 * start (`e_q ≥ startDist[q]`: a member whose spot is behind it waits on the way). `turn[q]` is
 * `P(e_q)` and `straight[q]` the straight leg from there to the spot.
 */
export function alongEnds(
    trail: FtlTrail,
    spots: readonly XY[],
    startDist: readonly number[],
): { endDist: number[]; turn: XY[]; straight: number[] } {
    const e: number[] = [];
    spots.forEach((p, q) => {
        const d = nearestAlong(trail, p);
        e.push(q > 0 ? Math.max(d, e[q - 1]! + EPS_GEOM) : d);
    });
    const endDist = e.map((d, q) => Math.max(d, startDist[q]!));
    const turn = endDist.map((d) => trail.at(d));
    return {
        endDist,
        turn,
        straight: turn.map((t, q) => dist(t, spots[q]!)),
    };
}

/**
 * R-13″: where a founding member of an along-way is at progress `p` (0 < p < 1). It walks the
 * way from `start` to `end`, then straight from `turn` to `spot`, at one steady speed over the
 * whole of it.
 */
export function alongPoint(
    trail: FtlTrail,
    start: number,
    end: number,
    turn: XY,
    straight: number,
    spot: XY,
    p: number,
): XY {
    const a = end - start;
    const d = (a + straight) * p;
    if (d < a || !(straight > 0)) return trail.at(start + Math.min(d, a));
    return lerp(turn, spot, (d - a) / straight);
}

/** Samples a cubic route piece is measured on (R-14, the Line's count). */
export const ROUTE_CUBIC_SAMPLES = 64;

/** An inner point of a route as R-14 reads it: a corner, or smooth with its tension (step 2). */
export interface RouteVertex {
    /** A stored point's id, which anchors name (spec J.2); absent for a bare corner */
    id?: string;
    at: XY;
    /** Roundness in (0, 2]; absent or 0 is a corner */
    tension?: number;
    /**
     * The bulge of the leg arriving at this point (R-14″, step 10a): signed sagitta over chord,
     * `0 < |bulge| <= 1/2`, R-8's minor arc. Absent or 0 is a straight (or curved) leg.
     */
    bulge?: number;
}

/** The ends a route was drawn against (spec 5.2 `from`, `to`): R-14's tangent neighbors F and G. */
export interface RouteEnds {
    from: XY;
    to: XY;
    /** The bulge of the last leg, the one arriving at `B` (R-14″); absent for none */
    toBulge?: number;
}

/** One piece of a route's walked path, from `V[j]` to `V[j+1]` (R-14). */
export type RoutePiece =
    | { kind: "line" }
    /** R-14″ (step 10a): R-8's circular minor arc with bulge `k`, its length `r·θ` exactly */
    | { kind: "arc"; k: number }
    | {
          kind: "cubic";
          c1: XY;
          c2: XY;
          /** Cumulative sample lengths e_0 … e_K (e_0 = 0, e_K the piece's length) */
          e: number[];
      };

/**
 * R-14: a route's cleaned walked path `V` from `A` through the inner points to `B`, its pieces,
 * the cumulative distances `D` (D[0] = 0) and the total length `L`. Every leg is at least
 * `EPS_GEOM` long, except when `V = [A, B]`.
 */
export interface RoutePath {
    V: XY[];
    D: number[];
    L: number;
    /** For each vertex of `V`, the index of the inner point it is, or -1 for `A` and `B` */
    source: number[];
    /** Each vertex's tension: 0 for `A`, `B` and corners */
    tension: number[];
    /** Piece j runs from V[j] to V[j+1] */
    pieces: RoutePiece[];
}

/**
 * A smooth point's handles (R-14 step 2): centripetal Catmull–Rom through its tangent neighbors
 * `a` (before) and `c` (after), scaled by `tau` from `q`. `out` points toward the next point, `in`
 * toward the one before. Every operation in the spec's order, so the oracle agrees bit for bit.
 */
export function smoothHandles(
    a: XY,
    q: XY,
    c: XY,
    tau: number,
): { out: XY; in: XY } {
    let dax = a[0] - q[0];
    let day = a[1] - q[1];
    let dcx = c[0] - q[0];
    let dcy = c[1] - q[1];
    let ra = Math.hypot(dax, day);
    let rc = Math.hypot(dcx, dcy);
    if (ra < EPS_GEOM && rc < EPS_GEOM) return { out: q, in: q };
    if (ra < EPS_GEOM) {
        dax = -dcx;
        day = -dcy;
        ra = rc;
    } else if (rc < EPS_GEOM) {
        dcx = -dax;
        dcy = -day;
        rc = ra;
    }
    const d1 = Math.sqrt(ra);
    const d2 = Math.sqrt(rc);
    const wOut = 3 * d1 * (d1 + d2);
    const wIn = 3 * d2 * (d1 + d2);
    return {
        out: [
            q[0] + (tau * (ra * dcx - rc * dax)) / wOut,
            q[1] + (tau * (ra * dcy - rc * day)) / wOut,
        ],
        in: [
            q[0] + (tau * (rc * dax - ra * dcx)) / wIn,
            q[1] + (tau * (rc * day - ra * dcy)) / wIn,
        ],
    };
}

/** A cubic Bézier at `t`, each coordinate summed left to right as R-14 writes it. */
export function cubicPoint(p0: XY, c1: XY, c2: XY, p3: XY, t: number): XY {
    const u = 1 - t;
    const k0 = u * u * u;
    const k1 = 3 * u * u * t;
    const k2 = 3 * u * t * t;
    const k3 = t * t * t;
    return [
        k0 * p0[0] + k1 * c1[0] + k2 * c2[0] + k3 * p3[0],
        k0 * p0[1] + k1 * c1[1] + k2 * c2[1] + k3 * p3[1],
    ];
}

/** The cumulative sample lengths of a cubic piece (R-14's declared length). */
function measureCubic(p0: XY, c1: XY, c2: XY, p3: XY): number[] {
    const K = ROUTE_CUBIC_SAMPLES;
    const e = [0];
    let prev = p0;
    let total = 0;
    for (let i = 1; i <= K; i++) {
        const s = i === K ? p3 : cubicPoint(p0, c1, c2, p3, i / K);
        total += dist(prev, s);
        e.push(total);
        prev = s;
    }
    return e;
}

/**
 * R-14″: the exact length `r·θ` of R-8's arc from `A` to `B` with bulge `k`, written as
 * `c·|φ| / sin|φ|` (`r = h / sin|φ|`, `θ = 2|φ|`) so nothing far away is formed. A chord under
 * `EPS_GEOM` or a half-angle under `1e-12` is R-8's straight line, so its length is the chord.
 */
export function arcLength(A: XY, B: XY, k: number): number {
    const c = dist(A, B);
    if (c < EPS_GEOM) return c;
    const phi = Math.abs(2 * Math.atan(2 * k));
    if (phi < 1e-12) return c;
    return (c * phi) / Math.sin(phi);
}

/** Whether `k` is a bulge that makes a leg an arc (R-14″): finite and not 0. */
const isBulge = (k: number | undefined): k is number =>
    k !== undefined && Number.isFinite(k) && k !== 0;

const innerAt = (q: XY | RouteVertex): XY =>
    Array.isArray(q) ? (q as XY) : (q as RouteVertex).at;
const innerTension = (q: XY | RouteVertex): number => {
    if (Array.isArray(q)) return 0;
    const t = (q as RouteVertex).tension;
    return t !== undefined && t > 0 ? t : 0;
};
const innerBulge = (q: XY | RouteVertex): number | undefined =>
    Array.isArray(q) ? undefined : (q as RouteVertex).bulge;

/**
 * R-14 cleaning, tangents, pieces and length. `inner` are the route's points (bare corners, or
 * `{at, tension}`); `ends` are its `from` and `to`, the tangent neighbors of the first and last
 * inner points (the real ends when absent, as when a path is drawn).
 */
export function routePath(
    A: XY,
    inner: readonly (XY | RouteVertex)[],
    B: XY,
    ends?: RouteEnds,
): RoutePath {
    const V: XY[] = [A];
    const source = [-1];
    inner.forEach((q, i) => {
        const P = innerAt(q);
        if (dist(V[V.length - 1]!, P) >= EPS_GEOM) {
            V.push(P);
            source.push(i);
        }
    });
    // Inner points within EPS_GEOM of B go (never A, which is V[0]). R-14″: the leg into B is
    // then the leg that arrived at the first of them, so it keeps that point's bulge (the
    // route's `toBulge` was a leg of no length)
    let intoB: number | undefined;
    while (V.length > 1 && dist(V[V.length - 1]!, B) < EPS_GEOM) {
        V.pop();
        intoB = source.pop();
    }
    V.push(B);
    source.push(-1);
    const tension = source.map((i) => (i < 0 ? 0 : innerTension(inner[i]!)));

    // Tangent neighbors from the route alone: N = [F, P'..., G], P' the inner points deduped
    // against the last kept inner point; each inner point is represented by the last kept at or
    // before it
    const smooth = tension.some((t) => t > 0);
    let neighbors: ((i: number) => { a: XY; c: XY }) | null = null;
    if (smooth) {
        const N: XY[] = [ends?.from ?? A];
        const rep: number[] = [];
        inner.forEach((q, i) => {
            const P = innerAt(q);
            if (i === 0 || dist(N[N.length - 1]!, P) >= EPS_GEOM) N.push(P);
            rep.push(N.length - 1);
        });
        N.push(ends?.to ?? B);
        neighbors = (i) => ({ a: N[rep[i]! - 1]!, c: N[rep[i]! + 1]! });
    }
    const handles = V.map((q, k) => {
        if (!neighbors || tension[k]! <= 0) return null;
        const { a, c } = neighbors(source[k]!);
        return smoothHandles(a, q, c, tension[k]!);
    });

    const m = V.length - 2;
    const pieces: RoutePiece[] = [];
    const D = [0];
    let total = 0;
    for (let j = 0; j + 1 < V.length; j++) {
        const P0 = V[j]!;
        const P3 = V[j + 1]!;
        const h0 = handles[j];
        const h3 = handles[j + 1];
        // R-14″: the leg's bulge is its arriving point's, or the route's `toBulge` for the leg into B
        const k =
            j + 1 === V.length - 1
                ? intoB === undefined
                    ? ends?.toBulge
                    : innerBulge(inner[intoB]!)
                : innerBulge(inner[source[j + 1]!]!);
        if (isBulge(k)) {
            pieces.push({ kind: "arc", k });
            total += arcLength(P0, P3, k);
        } else if (!h0 && !h3) {
            pieces.push({ kind: "line" });
            total += dist(P0, P3);
        } else {
            const c1: XY =
                j === 0
                    ? [P0[0] + (P3[0] - P0[0]) / 3, P0[1] + (P3[1] - P0[1]) / 3]
                    : (h0?.out ?? P0);
            const c2: XY =
                j === m
                    ? [P3[0] + (P0[0] - P3[0]) / 3, P3[1] + (P0[1] - P3[1]) / 3]
                    : (h3?.in ?? P3);
            const e = measureCubic(P0, c1, c2, P3);
            pieces.push({ kind: "cubic", c1, c2, e });
            total += e[ROUTE_CUBIC_SAMPLES]!;
        }
        D.push(total);
    }
    return { V, D, L: total, source, tension, pieces };
}

/** The point `x` along piece `j` of `path` (0 ≤ x ≤ its length), as R-14 evaluates it. */
export function routePiecePoint(path: RoutePath, j: number, x: number): XY {
    const { V, D } = path;
    const piece = path.pieces[j]!;
    const P0 = V[j]!;
    const P3 = V[j + 1]!;
    if (piece.kind === "line") return lerp(P0, P3, x / (D[j + 1]! - D[j]!));
    if (piece.kind === "arc")
        return arcPoint(P0, P3, piece.k, x / (D[j + 1]! - D[j]!));
    const { e } = piece;
    const K = ROUTE_CUBIC_SAMPLES;
    // smallest i in 1..K with x < e[i]
    let lo = 1;
    let hi = K + 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (x < e[mid]!) hi = mid;
        else lo = mid + 1;
    }
    if (lo > K) return P3;
    const f = (x - e[lo - 1]!) / (e[lo]! - e[lo - 1]!);
    return cubicPoint(P0, piece.c1, piece.c2, P3, (lo - 1 + f) / K);
}

/**
 * R-14 evaluation at progress `p` along a cleaned path: constant speed along the whole path,
 * points passed without stopping. Endpoints are exact. A path with no inner point left
 * (`V = [A, B]`) is evaluated as R-7 so it is bit-identical to a direct move (QA-RT-2).
 */
export function routePoint(path: RoutePath, p: number): XY {
    const { V, D, L } = path;
    const A = V[0]!;
    const B = V[V.length - 1]!;
    if (p <= 0) return A;
    if (p >= 1) return B;
    // R-14″: a one-leg arc is R-8's arc itself, so `(p · L) / L` can't round it off
    const only = V.length === 2 ? path.pieces[0] : undefined;
    if (only?.kind === "arc") return arcPoint(A, B, only.k, p);
    if (V.length === 2 || L < EPS_GEOM) return lerp(A, B, p);
    const d = p * L;
    // smallest j with d < D[j+1]; the last piece when rounding finds none
    let lo = 0;
    let hi = V.length - 2;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (d < D[mid + 1]!) hi = mid;
        else lo = mid + 1;
    }
    return routePiecePoint(path, lo, d - D[lo]!);
}

/**
 * R-14's Evaluation entered at distance `d` along a cleaned path with at least one kept inner
 * point (`walk_x`, R-14′): `V[0]` at `d <= 0`, the last vertex at `d >= L`.
 */
export function routePointAtDistance(path: RoutePath, d: number): XY {
    const { V, D, L } = path;
    if (d <= 0) return V[0]!;
    if (d >= L) return V[V.length - 1]!;
    // smallest j with d < D[j+1]; the last piece when rounding finds none
    let lo = 0;
    let hi = V.length - 2;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (d < D[mid + 1]!) hi = mid;
        else lo = mid + 1;
    }
    return routePiecePoint(path, lo, d - D[lo]!);
}

/** How many chords an arc piece is drawn and sampled with (R-14″; drawing only, never walked). */
export const ROUTE_ARC_SAMPLES = 48;

/**
 * Points to draw a route's walked path through: its vertices, each cubic piece's samples (the
 * polyline R-14 measures it on) and each arc piece's {@link ROUTE_ARC_SAMPLES} chords.
 */
export function routePolyline(path: RoutePath): XY[] {
    const out: XY[] = [path.V[0]!];
    path.pieces.forEach((piece, j) => {
        const P0 = path.V[j]!;
        const P3 = path.V[j + 1]!;
        if (piece.kind === "arc")
            for (let i = 1; i < ROUTE_ARC_SAMPLES; i++)
                out.push(arcPoint(P0, P3, piece.k, i / ROUTE_ARC_SAMPLES));
        else if (piece.kind === "cubic")
            for (let i = 1; i < ROUTE_CUBIC_SAMPLES; i++)
                out.push(
                    cubicPoint(
                        P0,
                        piece.c1,
                        piece.c2,
                        P3,
                        i / ROUTE_CUBIC_SAMPLES,
                    ),
                );
        out.push(P3);
    });
    return out;
}

/** One leg of a group member's walk (R-14 group schedule, step 15): a single line or cubic piece. */
export interface GroupLeg {
    /** A one-piece path from the leg's start to its end (`V`, `D`, `L` as a route path) */
    path: RoutePath;
    /** The leg's length, measured as a piece is (R-14 Length); may be below `EPS_GEOM` */
    length: number;
}

/**
 * The parts of R-14's group schedule (v0.9 step 15) that come from the route alone: the
 * reference walk `W` from `from` to `to`, and the moments `uFirst` and `uLast` at which it reaches
 * its first and last kept inner points. With no inner point kept (`W.V` is `[F, G]`), both are
 * NaN and every member walks R-7's line.
 */
export interface GroupSchedule {
    W: RoutePath;
    uFirst: number;
    uLast: number;
}

/** R-14 group schedule items 1-3: the reference walk and its moments. */
export function groupSchedule(route: RouteWalk): GroupSchedule {
    const W = routePath(route.from, route.points, route.to, route);
    const m = W.V.length - 2;
    if (m < 1) return { W, uFirst: NaN, uLast: NaN };
    return { W, uFirst: W.D[1]! / W.L, uLast: W.D[m]! / W.L };
}

/** `q + o`, one float64 addition per coordinate (R-14 group schedule item 4). */
export const placed = (q: XY, o: XY): XY => [q[0] + o[0], q[1] + o[1]];

/**
 * `s_min` (spec Appendix J): the least spacing of Adjust keys, one 8-to-5 step on the default
 * field. A file-independent constant, so changing a field's step size never fails a saved show.
 */
export const S_MIN = 11.25;

/** A profile as R-14′ item 6 evaluates it: keys strictly increasing in place, clamped, tie-merged. */
export interface ResolvedAdjust {
    /** The kept keys' places, increasing */
    xs: number[];
    /** Their displacements */
    ds: XY[];
    /** Each kept key's index in the stored profile */
    sources: number[];
    /** How many keys T-3 clamped into `[D_1, D_m]` */
    clamped: number;
    /** How many keys T-4 merged away */
    ties: number;
    /** How many anchors T-1 or T-2 read as best it could */
    badAnchors: number;
}

/** A stored inner point as anchors name it: by id, or none for a point not saved yet. */
type IdentifiedPoint = { readonly id?: string };

/**
 * The place of stored point `index`: `D` of the kept point that represents it (R-14), the last
 * kept at or before it, or 0 when none is (it lay on `F`).
 */
function placeOfIndex(W: RoutePath, index: number): number {
    for (let k = W.V.length - 2; k >= 1; k--)
        if (W.source[k]! <= index) return W.D[k]!;
    return 0;
}

/**
 * R-14′ item 4: the place of `anchor` on the reference walk `W` of a route with stored `points`.
 * An id not in the route reads as `from` for `a` and `to` for `b` (T-1); reversed ends are
 * evaluated as written (T-2). `bad` says either happened (`D-ANCHOR`).
 */
export function anchorPlace(
    W: RoutePath,
    points: readonly IdentifiedPoint[],
    anchor: AdjustAnchor,
): { x: number; bad: boolean } {
    let bad = false;
    const placeOf = (id: string, end: "from" | "to"): number => {
        if (id === end) return end === "from" ? 0 : W.L;
        const i = points.findIndex((p) => p.id === id);
        if (i < 0) {
            bad = true;
            return end === "from" ? 0 : W.L;
        }
        return placeOfIndex(W, i);
    };
    const a = placeOf(anchor.a, "from");
    const b = placeOf(anchor.b, "to");
    if (a > b) bad = true;
    return { x: a + clamp01(anchor.f) * (b - a), bad };
}

/** R-14′ item 6 (i) to (iii): a stored profile on a route's reference walk (T-3, T-4). */
export function resolveAdjust(
    schedule: GroupSchedule,
    points: readonly IdentifiedPoint[],
    profile: AdjustProfile,
): ResolvedAdjust {
    const { W } = schedule;
    const m = W.V.length - 2;
    const out: ResolvedAdjust = {
        xs: [],
        ds: [],
        sources: [],
        clamped: 0,
        ties: 0,
        badAnchors: 0,
    };
    if (m < 1) return out; // T-11
    const lo = W.D[1]!;
    const hi = W.D[m]!;
    const sorted = profile.keys
        .map((key, stored) => {
            const place = anchorPlace(W, points, key);
            if (place.bad) out.badAnchors++;
            const x = Math.min(hi, Math.max(lo, place.x));
            if (x !== place.x) out.clamped++;
            return { x, d: key.d, stored };
        })
        .sort((p, q) => p.x - q.x || p.stored - q.stored);
    // T-4: consecutive gaps below EPS_GEOM make one cluster (single linkage, 07 N5); the key last
    // in stored order stands for it
    for (let i = 0; i < sorted.length; ) {
        let last = sorted[i]!;
        let j = i + 1;
        while (
            j < sorted.length &&
            sorted[j]!.x - sorted[j - 1]!.x < EPS_GEOM
        ) {
            if (sorted[j]!.stored > last.stored) last = sorted[j]!;
            j++;
        }
        out.ties += j - i - 1;
        out.xs.push(last.x);
        out.ds.push(last.d);
        out.sources.push(last.stored);
        i = j;
    }
    return out;
}

/** Section 8.9: the diagnostics of one lane's resolved Adjust (T-1 to T-4). */
export function adjustDiagnostics(
    adjust: ResolvedAdjust,
    transitionId: number,
    slot: number,
): Diagnostic[] {
    const out: Diagnostic[] = [];
    const push = (code: Diagnostic["code"], message: string) =>
        out.push({
            code,
            level: "warning",
            transitionId,
            marcherId: null,
            slot,
            message,
        });
    const where = `the Adjust of slot ${slot} of transition ${transitionId}`;
    if (adjust.badAnchors > 0)
        push("D-ANCHOR", `${where} has ${adjust.badAnchors} unusable anchors`);
    if (adjust.clamped > 0)
        push(
            "D-ADJUST-CLAMP",
            `${where} has ${adjust.clamped} keys outside the shared part`,
        );
    if (adjust.ties > 0)
        push("D-ADJUST-TIE", `${where} has ${adjust.ties} tied keys`);
    return out;
}

/** R-14′ item 6 (iv): the profile's displacement at place `x`. */
export function adjustAt(adjust: ResolvedAdjust, x: number): XY {
    const { xs, ds } = adjust;
    const n = xs.length;
    if (n === 0) return [0, 0];
    if (x <= xs[0]!) return ds[0]!;
    if (x >= xs[n - 1]!) return ds[n - 1]!;
    let i = 0;
    while (x >= xs[i + 1]!) i++;
    const f = (x - xs[i]!) / (xs[i + 1]! - xs[i]!);
    const a = ds[i]!;
    const b = ds[i + 1]!;
    return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])];
}

/** A leg that is R-8's arc with bulge `k` (R-14″), measured exactly. */
function arcLegOf(S: XY, E: XY, k: number): GroupLeg {
    const length = arcLength(S, E, k);
    return {
        path: {
            V: [S, E],
            D: [0, length],
            L: length,
            source: [-1, -1],
            tension: [0, 0],
            pieces: [{ kind: "arc", k }],
        },
        length,
    };
}

function legOf(S: XY, E: XY, c1: XY | null, c2: XY | null): GroupLeg {
    if (!c1 || !c2) {
        const length = dist(S, E);
        return {
            path: {
                V: [S, E],
                D: [0, length],
                L: length,
                source: [-1, -1],
                tension: [0, 0],
                pieces: [{ kind: "line" }],
            },
            length,
        };
    }
    const e = measureCubic(S, c1, c2, E);
    const length = e[ROUTE_CUBIC_SAMPLES]!;
    return {
        path: {
            V: [S, E],
            D: [0, length],
            L: length,
            source: [-1, -1],
            tension: [0, 0],
            pieces: [{ kind: "cubic", c1, c2, e }],
        },
        length,
    };
}

/** A group member's walk: the schedule placed by its offset, with its own legs (R-14 item 5). */
export interface GroupMemberWalk {
    schedule: GroupSchedule;
    A: XY;
    B: XY;
    offset: XY;
    /** null when the reference walk kept no inner point (the member walks R-7's line) */
    first: GroupLeg | null;
    last: GroupLeg | null;
    /** The lane's Adjust, resolved on this schedule; null without one (R-14′ item 6) */
    adjust: ResolvedAdjust | null;
}

/**
 * R-14 group schedule item 5: a member's first leg (from `A` onto `W_1 + o`) and last leg (from
 * `W_m + o` to `B`). A leg is a line when its path end is a corner, else a cubic with the chord
 * rule at the member's own end and the reference handle placed at the path end.
 */
export function groupMemberWalk(
    schedule: GroupSchedule,
    A: XY,
    B: XY,
    offset: XY,
    adjust: ResolvedAdjust | null = null,
): GroupMemberWalk {
    const { W } = schedule;
    const m = W.V.length - 2;
    if (m < 1)
        return {
            schedule,
            A,
            B,
            offset,
            first: null,
            last: null,
            adjust: null,
        };
    // R-14′ item 7: `((q + o) + δ)`, the placed points and handles reading δ at D_1 and D_m. With
    // no Adjust nothing is added, so step 15's walk stays bit-identical (item 9).
    const at1 = adjust ? adjustAt(adjust, W.D[1]!) : null;
    const atm = adjust ? adjustAt(adjust, W.D[m]!) : null;
    const placeFirst = (q: XY): XY => {
        const p = placed(q, offset);
        return at1 ? placed(p, at1) : p;
    };
    const placeLast = (q: XY): XY => {
        const p = placed(q, offset);
        return atm ? placed(p, atm) : p;
    };
    const W1 = placeFirst(W.V[1]!);
    const Wm = placeLast(W.V[m]!);
    const p1 = W.pieces[0]!;
    const pm = W.pieces[m]!;
    // A leg whose ends are within EPS_GEOM is a line, so a member standing on its point doesn't
    // loop out to the handle. A leg's path end is smooth exactly when the reference piece touching it is a cubic whose
    // inner-side handle is that point's own (W_1's `in`, W_m's `out`): the reference's chord-rule
    // control sits at F or G, so only the inner handle is read here.
    // R-14″: an arc leg of the route stays an arc with its bulge on each member's own leg
    const first =
        p1.kind === "arc"
            ? arcLegOf(A, W1, p1.k)
            : W.tension[1]! > 0 &&
                p1.kind === "cubic" &&
                dist(A, W1) >= EPS_GEOM
              ? legOf(
                    A,
                    W1,
                    [A[0] + (W1[0] - A[0]) / 3, A[1] + (W1[1] - A[1]) / 3],
                    placeFirst(p1.c2),
                )
              : legOf(A, W1, null, null);
    const last =
        pm.kind === "arc"
            ? arcLegOf(Wm, B, pm.k)
            : W.tension[m]! > 0 &&
                pm.kind === "cubic" &&
                dist(Wm, B) >= EPS_GEOM
              ? legOf(Wm, B, placeLast(pm.c1), [
                    B[0] + (Wm[0] - B[0]) / 3,
                    B[1] + (Wm[1] - B[1]) / 3,
                ])
              : legOf(Wm, B, null, null);
    return { schedule, A, B, offset, first, last, adjust };
}

function legPoint(leg: GroupLeg, f: number): XY {
    const { path } = leg;
    const piece = path.pieces[0]!;
    if (piece.kind === "arc")
        return arcPoint(path.V[0]!, path.V[1]!, piece.k, f);
    if (leg.length < EPS_GEOM || piece.kind === "line")
        return lerp(path.V[0]!, path.V[1]!, f);
    return routePiecePoint(path, 0, f * leg.length);
}

/**
 * A member of a route with no kept point walks R-7's line, or R-8's arc with the route's
 * `toBulge` when its one leg is an arc (R-14″).
 */
function straightOrArc(schedule: GroupSchedule, A: XY, B: XY, p: number): XY {
    const only = schedule.W.pieces[0];
    return only?.kind === "arc" ? arcPoint(A, B, only.k, p) : lerp(A, B, p);
}

/** R-14 group schedule item 6: where the member is at progress `p`. */
export function groupPoint(walk: GroupMemberWalk, p: number): XY {
    const { schedule, A, B, offset, first, last, adjust } = walk;
    if (p <= 0) return A;
    if (p >= 1) return B;
    if (!first || !last) return straightOrArc(schedule, A, B, p);
    const { uFirst, uLast } = schedule;
    if (p < uFirst) return legPoint(first, p / uFirst);
    if (p <= uLast) {
        const q = placed(routePoint(schedule.W, p), offset);
        return adjust ? placed(q, adjustAt(adjust, p * schedule.W.L)) : q;
    }
    return legPoint(last, (p - uLast) / (1 - uLast));
}

/** What R-14 reads of a route: its points (with tensions and bulges) and the ends it was drawn against. */
export interface RouteWalk {
    points: readonly RouteVertex[];
    from: XY;
    to: XY;
    /** The last leg's bulge (R-14″); absent for none */
    toBulge?: number;
}

/**
 * What a slot's lane gives R-14′ (spec v0.10, D-20): the route it walks, the lane's start offset
 * (null for an own lane), and the route's group schedule when the caller caches it (J.7).
 */
export interface LaneWalk {
    route: RouteWalk;
    offset: XY | null;
    /** `groupSchedule(route)`, cached per route; computed here when absent */
    schedule?: GroupSchedule;
    /** The lane's Adjust on `schedule`, cached per lane (J.7); null or absent for none */
    adjust?: ResolvedAdjust | null;
}

/**
 * The walked path of one span of an order-free transition (R-7, R-8, R-14′): where a marcher
 * that starts at `A` and ends at `B` is at progress `p`. Every direct, arc and laned span goes
 * through here, so later path kinds plug into one place.
 *
 * Lane first (R-14′ dispatch): a slot with a lane walks it whatever the transition's style. A
 * group lane walks the group schedule placed by its offset; an own lane walks R-14's own path.
 *
 * @param lane the slot's lane, if it has one
 * @param founding whether the span is founding (R-3); a lane's join or resume walks straight
 *   until the entry rule (plan step 12)
 */
export function walkedPoint(
    t: Pick<TransitionRow, "style" | "params">,
    A: XY,
    B: XY,
    p: number,
    lane: LaneWalk | undefined,
    founding: boolean,
): XY {
    if (lane) {
        if (!founding) return lerp(A, B, p); // joins and resumes walk straight (step 15)
        const { route, offset } = lane;
        if (offset)
            // a group lane walks the group schedule, placed by its offset and Adjust (R-14′)
            return groupPoint(
                groupMemberWalk(
                    lane.schedule ?? groupSchedule(route),
                    A,
                    B,
                    offset,
                    lane.adjust ?? null,
                ),
                p,
            );
        if (route.points.length === 0 && !isBulge(route.toBulge))
            return lerp(A, B, p);
        return routePoint(routePath(A, route.points, B, route), p);
    }
    switch (t.style) {
        case "arc":
            return arcPoint(A, B, t.params?.bulge ?? 0, p); // R-8
        default:
            return lerp(A, B, p); // R-7
    }
}

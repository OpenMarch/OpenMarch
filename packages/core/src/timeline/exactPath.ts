/**
 * Exact paths (ADR 0018, spec Appendix M): one marcher's walk during one move, stored as fixed
 * shapes plus timing keys. This module is the format: its types, the rules a path must keep
 * (EP-1 to EP-6), how a reader plays it (EP-R), how its ends follow their spots (EP-F) and how it
 * is stretched in time and split (EP-T). It knows nothing of the resolver; the converter that builds exact
 * paths from resolved motion is `exactPathConvert.ts`.
 *
 * The type has no units (DE-8). Inside OpenMarch it holds field units with y down, like every
 * other resolver coordinate.
 *
 * Temporary copy (DE-6): the `schema` package will own these types from step 5, and this file
 * will import them from there.
 */
import type { XY } from "./types";

/** Ticks per beat (DE-2): 480, the MIDI PPQ DAWs use; it divides by 2, 3, 4, 5, 6, 8, 10, 12, 16. */
export const TICKS_PER_BEAT = 480;

/** Straight lines through `points`: each point is a corner, the last is the shape's end. */
export interface ExactPoints {
    kind: "points";
    points: XY[];
}

/**
 * A circular arc to `to`. `bend` is the signed sagitta over the chord: the apex is
 * `M + bend·c·n`, with `M` the chord's midpoint, `c` its length and `n` the chord direction turned
 * +90° in the path's own axes. `0 < |bend| ≤ 1/2` (at most a half turn).
 */
export interface ExactArc {
    kind: "arc";
    to: XY;
    bend: number;
}

/** A cubic Bézier from the shape's start through `c1`, `c2` to `to`. */
export interface ExactCubic {
    kind: "cubic";
    c1: XY;
    c2: XY;
    to: XY;
}

export type ExactShape = ExactPoints | ExactArc | ExactCubic;

/**
 * A timing key: at `tick` (whole ticks from the move's start) the marcher is at place `u`, the
 * piece number plus the share of that piece's length (0 to the piece count).
 */
export interface ExactKey {
    tick: number;
    u: number;
}

export interface ExactPath {
    v: 1;
    /** Where the walk starts */
    from: XY;
    /** At least one; each starts where the last ended */
    shapes: ExactShape[];
    /** At least two; see EP-5 */
    keys: ExactKey[];
}

/** One rule a path breaks (spec M.2), with the rule's id. */
export interface ExactPathProblem {
    rule: "EP-1" | "EP-2" | "EP-3" | "EP-4" | "EP-5" | "EP-6";
    message: string;
}

/** EP-6: a path shorter than this goes nowhere and has no exact path. */
export const EXACT_MIN_LENGTH = 1e-9;

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/**
 * One piece of a path: a straight leg, an arc or a cubic. Lengths are the real ones (EP-2 to
 * EP-4): exact for legs and arcs, a cubic's true arc length to a relative error under 1e-9.
 */
export interface ExactPiece {
    kind: "line" | "arc" | "cubic";
    from: XY;
    to: XY;
    length: number;
    /** The point at share `f` (0 to 1) of the piece's length */
    pointAt(f: number): XY;
}

const sub = (a: XY, b: XY): XY => [a[0] - b[0], a[1] - b[1]];
const hyp = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function linePiece(from: XY, to: XY): ExactPiece {
    return {
        kind: "line",
        from,
        to,
        length: hyp(from, to),
        pointAt: (f) =>
            f <= 0
                ? from
                : f >= 1
                  ? to
                  : [
                        from[0] + (to[0] - from[0]) * f,
                        from[1] + (to[1] - from[1]) * f,
                    ],
    };
}

/** An arc's circle (EP-3): centre, radius, start angle and signed sweep. */
export interface ArcCircle {
    center: XY;
    radius: number;
    startAngle: number;
    sweep: number;
}

/** EP-3. null when the arc breaks the rule (chord 0, or `bend` out of range). */
export function arcCircle(from: XY, to: XY, bend: number): ArcCircle | null {
    const c = hyp(from, to);
    const k = Math.abs(bend);
    if (!(c > 0) || !(k > 0) || k > 0.5) return null;
    const n: XY = [-(to[1] - from[1]) / c, (to[0] - from[0]) / c];
    const M: XY = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
    const s = bend * c;
    const radius = (c * (0.25 + k * k)) / (2 * k);
    // the centre is on the far side of the chord from the apex (or on it, at a half turn)
    const off = s - Math.sign(bend) * radius;
    const center: XY = [M[0] + off * n[0], M[1] + off * n[1]];
    const apex: XY = [M[0] + s * n[0], M[1] + s * n[1]];
    const theta = 4 * Math.atan(2 * k);
    const a = sub(from, center);
    const p = sub(apex, center);
    // the walk turns toward the apex
    const dir = a[0] * p[1] - a[1] * p[0] >= 0 ? 1 : -1;
    return {
        center,
        radius,
        startAngle: Math.atan2(a[1], a[0]),
        sweep: dir * theta,
    };
}

function arcPiece(from: XY, to: XY, bend: number): ExactPiece | null {
    const circle = arcCircle(from, to, bend);
    if (!circle) return null;
    const { center, radius, startAngle, sweep } = circle;
    return {
        kind: "arc",
        from,
        to,
        length: radius * Math.abs(sweep),
        pointAt: (f) => {
            if (f <= 0) return from;
            if (f >= 1) return to;
            const a = startAngle + sweep * f;
            return [
                center[0] + radius * Math.cos(a),
                center[1] + radius * Math.sin(a),
            ];
        },
    };
}

// 8-point Gauss–Legendre on [-1, 1]
const GL_X = [
    -0.9602898564975363, -0.7966664774136267, -0.525532409916329,
    -0.1834346424956498, 0.1834346424956498, 0.525532409916329,
    0.7966664774136267, 0.9602898564975363,
];
const GL_W = [
    0.1012285362903763, 0.2223810344533745, 0.3137066458778873,
    0.362683783378362, 0.362683783378362, 0.3137066458778873,
    0.2223810344533745, 0.1012285362903763,
];

/** A cubic's point and true arc length at any parameter, and its parameter at any length. */
export interface CubicMeasure {
    length: number;
    point(t: number): XY;
    lengthTo(t: number): number;
    paramAt(d: number): number;
}

/** `|B'(t)|` of a cubic: B'(t) = 3[(1-t)²(c1-p0) + 2(1-t)t(c2-c1) + t²(p3-c2)]. */
function cubicSpeed(p0: XY, c1: XY, c2: XY, p3: XY): (t: number) => number {
    const ax = 3 * (c1[0] - p0[0]);
    const ay = 3 * (c1[1] - p0[1]);
    const bx = 3 * (c2[0] - c1[0]);
    const by = 3 * (c2[1] - c1[1]);
    const cx = 3 * (p3[0] - c2[0]);
    const cy = 3 * (p3[1] - c2[1]);
    return (t) => {
        const u = 1 - t;
        const x = u * u * ax + 2 * u * t * bx + t * t * cx;
        const y = u * u * ay + 2 * u * t * by + t * t * cy;
        return Math.hypot(x, y);
    };
}

/** `∫ f` over `[a, b]` by 8-point Gauss–Legendre. */
function gaussLegendre(f: (t: number) => number, a: number, b: number): number {
    const h = (b - a) / 2;
    const m = (a + b) / 2;
    let s = 0;
    for (let i = 0; i < 8; i++) s += GL_W[i]! * f(m + h * GL_X[i]!);
    return s * h;
}

export function measureCubic(p0: XY, c1: XY, c2: XY, p3: XY): CubicMeasure {
    const speed = cubicSpeed(p0, c1, c2, p3);
    const gl = (a: number, b: number) => gaussLegendre(speed, a, b);
    const tableOf = (n: number) => {
        const cum = [0];
        for (let i = 0; i < n; i++) cum.push(cum[i]! + gl(i / n, (i + 1) / n));
        return cum;
    };
    // double the intervals until the total settles (a cusp needs more)
    let n = 16;
    let cum = tableOf(n);
    while (n < 4096) {
        const finer = tableOf(n * 2);
        const a = cum[n]!;
        const b = finer[n * 2]!;
        n *= 2;
        cum = finer;
        if (Math.abs(a - b) <= 1e-12 * Math.max(1, b)) break;
    }
    const length = cum[n]!;
    const lengthTo = (t: number) => {
        if (t <= 0) return 0;
        if (t >= 1) return length;
        const k = Math.min(n - 1, Math.floor(t * n));
        return cum[k]! + gl(k / n, t);
    };
    const point = (t: number): XY => {
        const u = 1 - t;
        const a = u * u * u;
        const b = 3 * u * u * t;
        const c = 3 * u * t * t;
        const d = t * t * t;
        return [
            a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0],
            a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1],
        ];
    };
    const paramAt = (d: number) => {
        if (d <= 0) return 0;
        if (d >= length) return 1;
        // the interval holding d, then Newton kept inside it
        let lo = 0;
        let hi = n;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (cum[mid]! <= d) lo = mid;
            else hi = mid;
        }
        let a = lo / n;
        let b = hi / n;
        const span = cum[hi]! - cum[lo]!;
        let t = span > 0 ? a + ((d - cum[lo]!) / span) * (b - a) : a;
        for (let i = 0; i < 40; i++) {
            const err = lengthTo(t) - d;
            if (Math.abs(err) <= 1e-12 * Math.max(1, length)) break;
            if (err > 0) b = t;
            else a = t;
            const v = speed(t);
            let next = v > 0 ? t - err / v : (a + b) / 2;
            if (!(next > a && next < b)) next = (a + b) / 2;
            t = next;
        }
        return t;
    };
    return { length, point, lengthTo, paramAt };
}

function cubicPiece(from: XY, c1: XY, c2: XY, to: XY): ExactPiece {
    const m = measureCubic(from, c1, c2, to);
    return {
        kind: "cubic",
        from,
        to,
        length: m.length,
        pointAt: (f) =>
            f <= 0 ? from : f >= 1 ? to : m.point(m.paramAt(f * m.length)),
    };
}

/**
 * The path's pieces in order (spec M.2: each leg of a points shape, each arc, each cubic), or
 * null when a shape breaks EP-2 or EP-3.
 */
export function exactPieces(path: ExactPath): ExactPiece[] | null {
    const out: ExactPiece[] = [];
    let at = path.from;
    for (const shape of path.shapes) {
        switch (shape.kind) {
            case "points":
                if (shape.points.length === 0) return null;
                for (const p of shape.points) {
                    out.push(linePiece(at, p));
                    at = p;
                }
                break;
            case "arc": {
                const piece = arcPiece(at, shape.to, shape.bend);
                if (!piece) return null;
                out.push(piece);
                at = shape.to;
                break;
            }
            case "cubic":
                out.push(cubicPiece(at, shape.c1, shape.c2, shape.to));
                at = shape.to;
                break;
        }
    }
    return out;
}

/** The number of pieces, `N` (spec M.2); the last key's `u`. */
export function exactPieceCount(path: ExactPath): number {
    let n = 0;
    for (const s of path.shapes) n += s.kind === "points" ? s.points.length : 1;
    return n;
}

// ---------------------------------------------------------------------------
// Rules (EP-1 to EP-6)
// ---------------------------------------------------------------------------

const finiteXY = (p: XY) => Number.isFinite(p[0]) && Number.isFinite(p[1]);

/** Every rule of spec M.2 the path breaks; empty when it keeps them all. */
export function checkExactPath(path: ExactPath): ExactPathProblem[] {
    const problems: ExactPathProblem[] = [];
    const add = (rule: ExactPathProblem["rule"], message: string) =>
        problems.push({ rule, message });
    if (path.v !== 1) add("EP-1", `version ${String(path.v)} is not 1`);
    let finite = finiteXY(path.from);
    for (const s of path.shapes) {
        if (s.kind === "points") finite &&= s.points.every(finiteXY);
        else if (s.kind === "arc")
            finite &&= finiteXY(s.to) && Number.isFinite(s.bend);
        else finite &&= finiteXY(s.c1) && finiteXY(s.c2) && finiteXY(s.to);
    }
    for (const k of path.keys)
        finite &&= Number.isFinite(k.tick) && Number.isFinite(k.u);
    if (!finite)
        add("EP-1", "a coordinate, bend, tick or place is not a finite number");
    if (path.shapes.length === 0) add("EP-2", "the path has no shapes");
    let at = path.from;
    path.shapes.forEach((s, i) => {
        if (s.kind === "points") {
            if (s.points.length === 0) add("EP-2", `shape ${i} has no points`);
            else at = s.points[s.points.length - 1]!;
            return;
        }
        if (s.kind === "arc") {
            const k = Math.abs(s.bend);
            if (!(k > 0) || k > 0.5)
                add(
                    "EP-3",
                    `arc ${i} has bend ${s.bend}, outside 0 < |bend| ≤ 1/2`,
                );
            else if (!(hyp(at, s.to) > 0))
                add("EP-3", `arc ${i} ends where it starts`);
        }
        at = s.to;
    });
    const N = exactPieceCount(path);
    const keys = path.keys;
    if (keys.length < 2) add("EP-5", "a path needs at least two keys");
    else {
        const first = keys[0]!;
        const last = keys[keys.length - 1]!;
        if (first.tick !== 0 || first.u !== 0)
            add("EP-5", "the first key must be {tick: 0, u: 0}");
        if (last.u !== N)
            add(
                "EP-5",
                `the last key's place is ${last.u}, not the piece count ${N}`,
            );
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i]!;
            if (!Number.isInteger(k.tick))
                add("EP-5", `key ${i}'s tick is not whole`);
            if (k.u < 0 || k.u > N)
                add("EP-5", `key ${i}'s place is outside 0 to ${N}`);
            if (i > 0) {
                const p = keys[i - 1]!;
                if (!(k.tick > p.tick))
                    add(
                        "EP-5",
                        `keys ${i - 1} and ${i} don't have increasing ticks`,
                    );
                if (k.u < p.u) add("EP-5", `key ${i}'s place goes back`);
            }
        }
    }
    if (problems.length === 0) {
        const pieces = exactPieces(path);
        const length = pieces ? pieces.reduce((s, p) => s + p.length, 0) : 0;
        if (!(length >= EXACT_MIN_LENGTH)) add("EP-6", "the path goes nowhere");
    }
    return problems;
}

// ---------------------------------------------------------------------------
// Reading (EP-R)
// ---------------------------------------------------------------------------

/** A path made ready to play: its pieces and their running lengths. */
export interface ExactPlayer {
    pieces: ExactPiece[];
    /** `cum[i]` is the distance where piece `i` starts; `cum[N]` the path's length */
    cum: number[];
    length: number;
    /** The distance of place `u` (EP-R step 1) */
    distanceOf(u: number): number;
    /** The place at distance `d` */
    placeAt(d: number): number;
    /** The point at place `u` */
    pointAtPlace(u: number): XY;
    /** The distance at `tick` (EP-R step 2), clamped to the keys */
    distanceAtTick(tick: number): number;
    /** EP-R: the point at `tick` (fractional ticks allowed) */
    pointAt(tick: number): XY;
}

/** Make a path ready to play. Throws when it breaks a rule (see {@link checkExactPath}). */
export function exactPlayer(path: ExactPath): ExactPlayer {
    const problems = checkExactPath(path);
    if (problems.length)
        throw new Error(
            `exact path breaks ${problems[0]!.rule}: ${problems[0]!.message}`,
        );
    const pieces = exactPieces(path)!;
    const N = pieces.length;
    const cum = [0];
    for (const p of pieces) cum.push(cum[cum.length - 1]! + p.length);
    const length = cum[N]!;
    const split = (u: number): [number, number] => {
        if (u <= 0) return [0, 0];
        if (u >= N) return [N - 1, 1];
        const i = Math.floor(u);
        return [i, u - i];
    };
    const distanceOf = (u: number) => {
        const [i, f] = split(u);
        return cum[i]! + f * pieces[i]!.length;
    };
    const placeAt = (d: number) => {
        if (d <= 0) return 0;
        if (d >= length) return N;
        let lo = 0;
        let hi = N;
        // the last piece starting at or before d, skipping pieces of length 0
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (cum[mid]! <= d) lo = mid;
            else hi = mid;
        }
        const len = pieces[lo]!.length;
        return len > 0 ? lo + Math.min(1, (d - cum[lo]!) / len) : lo;
    };
    const pointAtPlace = (u: number) => {
        const [i, f] = split(u);
        return pieces[i]!.pointAt(f);
    };
    const keys = path.keys;
    const D = keys.map((k) => distanceOf(k.u));
    const distanceAtTick = (tick: number) => {
        if (tick <= 0) return D[0]!;
        const last = keys.length - 1;
        if (tick >= keys[last]!.tick) return D[last]!;
        let lo = 0;
        let hi = last;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (keys[mid]!.tick <= tick) lo = mid;
            else hi = mid;
        }
        const a = keys[lo]!;
        const b = keys[hi]!;
        return (
            D[lo]! + ((tick - a.tick) / (b.tick - a.tick)) * (D[hi]! - D[lo]!)
        );
    };
    return {
        pieces,
        cum,
        length,
        distanceOf,
        placeAt,
        pointAtPlace,
        distanceAtTick,
        pointAt: (tick) => pointAtPlace(placeAt(distanceAtTick(tick))),
    };
}

/** EP-R: where the path puts the marcher at `tick`. */
export function exactPointAt(path: ExactPath, tick: number): XY {
    return exactPlayer(path).pointAt(tick);
}

// ---------------------------------------------------------------------------
// Ends follow their spots (EP-F)
// ---------------------------------------------------------------------------

/**
 * EP-F: the path with its first point moved to `from` and/or its last to `to`. A points shape
 * moves that point; a cubic moves its end and the nearer control by the same amount; an arc moves
 * its end and keeps its bend. Keys are unchanged. The result may break EP-3 (an arc whose ends
 * now meet); the caller checks it.
 */
export function followExactEnds(
    path: ExactPath,
    ends: { from?: XY; to?: XY },
): ExactPath {
    const shapes = path.shapes.map(copyShape);
    let from = path.from;
    if (ends.from) {
        const d = sub(ends.from, path.from);
        from = ends.from;
        const first = shapes[0];
        if (first?.kind === "cubic")
            first.c1 = [first.c1[0] + d[0], first.c1[1] + d[1]];
    }
    if (ends.to) {
        const last = shapes[shapes.length - 1];
        if (last?.kind === "points")
            last.points[last.points.length - 1] = ends.to;
        else if (last?.kind === "arc") last.to = ends.to;
        else if (last?.kind === "cubic") {
            const d = sub(ends.to, last.to);
            last.c2 = [last.c2[0] + d[0], last.c2[1] + d[1]];
            last.to = ends.to;
        }
    }
    return { v: 1, from, shapes, keys: path.keys.map((k) => ({ ...k })) };
}

function copyShape(s: ExactShape): ExactShape {
    if (s.kind === "points")
        return { kind: "points", points: s.points.map((p) => [p[0], p[1]]) };
    if (s.kind === "arc")
        return { kind: "arc", to: [s.to[0], s.to[1]], bend: s.bend };
    return {
        kind: "cubic",
        c1: [s.c1[0], s.c1[1]],
        c2: [s.c2[0], s.c2[1]],
        to: [s.to[0], s.to[1]],
    };
}

// ---------------------------------------------------------------------------
// Retime and split (EP-T)
// ---------------------------------------------------------------------------

/**
 * EP-T: keys whose ticks may collide after rounding, made strictly increasing. A key that lands
 * on or before the tick of the key kept before it is dropped; the first and the last are always
 * kept (so when the last collides, the one before it is the one dropped).
 */
export function dropCollidingKeys(keys: readonly ExactKey[]): ExactKey[] {
    if (keys.length < 2) return keys.map((k) => ({ ...k }));
    const last = keys[keys.length - 1]!;
    const out: ExactKey[] = [{ ...keys[0]! }];
    for (let i = 1; i < keys.length - 1; i++) {
        const k = keys[i]!;
        if (k.tick > out[out.length - 1]!.tick && k.tick < last.tick)
            out.push({ ...k });
    }
    out.push({ ...last });
    return out;
}

/** EP-T retime: the path stretched or squeezed to `ticks` long (at least 1). */
export function retimeExactPath(path: ExactPath, ticks: number): ExactPath {
    if (!(ticks >= 1) || !Number.isInteger(ticks))
        throw new Error(`a move can't be ${ticks} ticks long`);
    const old = path.keys[path.keys.length - 1]!.tick;
    const keys = path.keys.map((k, i) => ({
        tick:
            i === path.keys.length - 1
                ? ticks
                : Math.round((k.tick * ticks) / old),
        u: k.u,
    }));
    return {
        ...path,
        shapes: path.shapes.map(copyShape),
        keys: dropCollidingKeys(keys),
    };
}

/** A piece as stored, before regrouping into shapes */
type RawPiece =
    | { kind: "line"; to: XY }
    | { kind: "arc"; to: XY; bend: number }
    | { kind: "cubic"; c1: XY; c2: XY; to: XY };

function rawPieces(path: ExactPath): RawPiece[] {
    const out: RawPiece[] = [];
    for (const s of path.shapes) {
        if (s.kind === "points")
            for (const p of s.points) out.push({ kind: "line", to: p });
        else out.push(copyShape(s) as RawPiece);
    }
    return out;
}

function shapesOf(raw: RawPiece[]): ExactShape[] {
    const out: ExactShape[] = [];
    for (const r of raw) {
        const last = out[out.length - 1];
        if (r.kind === "line") {
            if (last?.kind === "points") last.points.push(r.to);
            else out.push({ kind: "points", points: [r.to] });
        } else out.push(r);
    }
    return out;
}

const lerpXY = (a: XY, b: XY, t: number): XY => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
];

/** Cut a raw piece at share `f` (0 < f < 1) of its length. */
function cutPiece(
    start: XY,
    r: RawPiece,
    f: number,
): { cut: XY; a: RawPiece; b: RawPiece } {
    if (r.kind === "line") {
        const cut = lerpXY(start, r.to, f);
        return {
            cut,
            a: { kind: "line", to: cut },
            b: { kind: "line", to: r.to },
        };
    }
    if (r.kind === "arc") {
        const circle = arcCircle(start, r.to, r.bend)!;
        const a = circle.startAngle + circle.sweep * f;
        const cut: XY = [
            circle.center[0] + circle.radius * Math.cos(a),
            circle.center[1] + circle.radius * Math.sin(a),
        ];
        const theta = Math.abs(circle.sweep);
        const sign = Math.sign(r.bend);
        return {
            cut,
            a: {
                kind: "arc",
                to: cut,
                bend: (sign * Math.tan((f * theta) / 4)) / 2,
            },
            b: {
                kind: "arc",
                to: r.to,
                bend: (sign * Math.tan(((1 - f) * theta) / 4)) / 2,
            },
        };
    }
    const m = measureCubic(start, r.c1, r.c2, r.to);
    const t = m.paramAt(f * m.length);
    // split at t: interpolate between neighboring controls, then between those, then once more
    const p01 = lerpXY(start, r.c1, t);
    const p12 = lerpXY(r.c1, r.c2, t);
    const p23 = lerpXY(r.c2, r.to, t);
    const p012 = lerpXY(p01, p12, t);
    const p123 = lerpXY(p12, p23, t);
    const cut = lerpXY(p012, p123, t);
    return {
        cut,
        a: { kind: "cubic", c1: p01, c2: p012, to: cut },
        b: { kind: "cubic", c1: p123, c2: p23, to: r.to },
    };
}

/**
 * EP-T split at `tick` (0 < tick < the last key's tick, whole). Each half is an exact path, or
 * null where that half only stands still (a split inside a hold at the very start or end).
 */
export function splitExactPath(
    path: ExactPath,
    tick: number,
): { before: ExactPath | null; after: ExactPath | null } {
    const lastTick = path.keys[path.keys.length - 1]!.tick;
    if (!Number.isInteger(tick) || !(tick > 0) || !(tick < lastTick))
        throw new Error(`can't split a ${lastTick}-tick path at tick ${tick}`);
    const player = exactPlayer(path);
    const N = player.pieces.length;
    const uCut = player.placeAt(player.distanceAtTick(tick));
    const raw = rawPieces(path);
    let i = Math.floor(uCut);
    let f = uCut - i;
    if (i >= N) {
        i = N;
        f = 0;
    }
    // the pieces and the cut point of each half
    let beforeRaw: RawPiece[];
    let afterRaw: RawPiece[];
    let cut: XY;
    if (f > 1e-12 && f < 1 - 1e-12) {
        const piece = cutPiece(player.pieces[i]!.from, raw[i]!, f);
        beforeRaw = [...raw.slice(0, i), piece.a];
        afterRaw = [piece.b, ...raw.slice(i + 1)];
        cut = piece.cut;
    } else {
        if (f >= 1 - 1e-12) i += 1;
        f = 0;
        beforeRaw = raw.slice(0, i);
        afterRaw = raw.slice(i);
        cut = i < N ? player.pieces[i]!.from : player.pieces[N - 1]!.to;
    }
    // place maps: before keeps pieces 0..i (the cut piece's share scaled by f); after renumbers
    const toBefore = (u: number) =>
        f > 0 && u > i
            ? i + Math.min(1, (u - i) / f)
            : Math.min(u, beforeRaw.length);
    const toAfter = (u: number) => {
        if (f > 0)
            return u < i + 1 ? Math.max(0, (u - i - f) / (1 - f)) : u - i;
        return Math.max(0, u - i);
    };
    const beforeKeys: ExactKey[] = [];
    const afterKeys: ExactKey[] = [{ tick: 0, u: 0 }];
    for (const k of path.keys) {
        if (k.tick < tick) beforeKeys.push({ tick: k.tick, u: toBefore(k.u) });
        else if (k.tick > tick)
            afterKeys.push({ tick: k.tick - tick, u: toAfter(k.u) });
    }
    beforeKeys.push({ tick, u: beforeRaw.length });
    const half = (
        from: XY,
        r: RawPiece[],
        keys: ExactKey[],
    ): ExactPath | null => {
        if (r.length === 0) return null;
        const p: ExactPath = { v: 1, from, shapes: shapesOf(r), keys };
        return checkExactPath(p).some((x) => x.rule === "EP-6") ? null : p;
    };
    return {
        before: half(path.from, beforeRaw, beforeKeys),
        after: half(cut, afterRaw, afterKeys),
    };
}

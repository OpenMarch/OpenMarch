import {
    adjustAt,
    arcPoint,
    cubicPoint,
    groupMemberWalk,
    groupSchedule,
    laneSamples,
    limitRouteEdit,
    resolveAdjust,
    routePath,
    routePiecePoint,
    routePoint,
    routePolyline,
    ROUTE_CUBIC_SAMPLES,
    type AdjustProfile,
    type GroupLeg,
    type GroupMemberWalk,
    type LaneSample,
    type GroupSchedule,
    type RouteGeometry,
    type RoutePath,
    MAX_ROUTE_BULGE,
    ROUTE_ARC_SAMPLES,
} from "@openmarch/core";
import tolgee from "@/global/singletons/Tolgee";
import {
    landClicked,
    landPoint,
    MAX_TENSION,
    SMOOTH,
} from "@/shapes/line/lineGeometry";
import type {
    KindHonors,
    ToolEnv,
    ToolHandle,
    ToolHandleMenu,
    ToolMenuSection,
} from "@/shapes/tool/toolKind";
import type { XY } from "@/shapes/types";

/**
 * A path's points as the shape tool's Line edits its points (pathways steps 1 and 2): the same
 * handle interfaces (`ToolHandle`, `ToolHandleMenu`), the same landing (`landClicked`, `landPoint`),
 * the same roles, and the Line's curves: a point is a corner or smooth with a roundness (its
 * `tension`, 0 to 2, 1 the plain curve), a selected smooth point shows its tangent bar, a
 * double-click swaps corner and smooth, and the point and leg menus are the Line's. What differs is
 * the ends: a path's two ends are fixed (where the marcher starts and its end spot), so they have
 * no handles, no roundness and no menu. The curve itself is the resolver's (spec R-14, `routePath`
 * in `@openmarch/core`), so what's drawn is what's walked. Everything is pure.
 */

/** A point as the pen holds it: a stored point keeps its `id`, a new one has none yet. */
export interface PathPoint {
    readonly id?: string;
    readonly at: XY;
    /** Roundness above 0 makes it smooth; 0 or none is a corner */
    readonly tension?: number;
    /**
     * The leg arriving at this point is a circular arc with this bulge, signed sagitta over chord,
     * `0 < |bulge| <= 1/2` (spec R-14″, pathways step 10a); none for a straight or curved leg
     */
    readonly bulge?: number;
}

/** A path as it's edited: its fixed ends and the points between them, in walking order */
export interface PathShape {
    /** Where the marcher stands at the move's start (R-14's A) */
    readonly from: XY;
    /** Its end spot (R-14's B) */
    readonly to: XY;
    readonly points: readonly PathPoint[];
    /**
     * The ends the curve's first and last tangents read (R-14's F and G): the route's stored
     * `from` and `to` while they're kept (AP-R1), else the real ends
     */
    readonly ends?: { readonly from: XY; readonly to: XY };
    /** The last leg's bulge, the leg arriving at `to` (R-14″); none for a straight or curved leg */
    readonly toBulge?: number;
}

/** Point `i`'s handle, as a Line's point `i` is keyed */
export const pointKey = (i: number) => `p${i}`;
/** Leg `i`'s midpoint handle (from the point before point `i`), as a Line's segment midpoint */
export const midpointKey = (i: number) => `m${i}`;
/** Arc leg `i`'s handle at the arc's middle, which sets its bulge (AP-T11) */
export const bulgeKey = (i: number) => `b${i}`;
/** An end of smooth point `i`'s tangent bar: `t<i>` toward the next point, `tb<i>` back */
export const tangentKey = (i: number, side: 1 | -1) =>
    `${side === 1 ? "t" : "tb"}${i}`;

const POINT = /^p(\d+)$/;
const MIDPOINT = /^m(\d+)$/;
const BULGE = /^b(\d+)$/;
const TANGENT = /^(t|tb)(\d+)$/;

/** The point a handle key names, or -1 */
export function pointOf(shape: PathShape, key: string | null): number {
    const m = key ? POINT.exec(key) : null;
    const i = m ? Number(m[1]) : -1;
    return i >= 0 && i < shape.points.length ? i : -1;
}

/** The leg a midpoint key names, or -1 */
export function legOf(shape: PathShape, key: string | null): number {
    const m = key ? MIDPOINT.exec(key) : null;
    const i = m ? Number(m[1]) : -1;
    return i >= 0 && i <= shape.points.length ? i : -1;
}

/** The arc leg a bulge handle's key names, or -1 */
export function bulgeLegOf(shape: PathShape, key: string | null): number {
    const m = key ? BULGE.exec(key) : null;
    const i = m ? Number(m[1]) : -1;
    return i >= 0 && i <= shape.points.length && isArcLeg(shape, i) ? i : -1;
}

/** Leg `leg`'s bulge (it arrives at point `leg`, or at `to` for the last), or undefined */
export const legBulge = (shape: PathShape, leg: number): number | undefined =>
    leg < shape.points.length ? shape.points[leg]?.bulge : shape.toBulge;

/** Whether leg `leg` is an arc (R-14″) */
export const isArcLeg = (shape: PathShape, leg: number): boolean =>
    !!legBulge(shape, leg);

/** Whether point `i` is at an end of an arc leg, so it must stay a corner (R-14″) */
export const besideArc = (shape: PathShape, i: number): boolean =>
    isArcLeg(shape, i) || isArcLeg(shape, i + 1);

/**
 * `shape` with leg `leg`'s bulge set to `k`; 0 or undefined makes it straight again (no bulge is
 * kept). The points and `toBulge` of the result are what's saved.
 */
export function withLegBulge(
    shape: PathShape,
    leg: number,
    k: number | undefined,
): PathShape {
    const arc = k !== undefined && k !== 0;
    if (leg >= shape.points.length) {
        const { toBulge: _was, ...rest } = shape;
        return arc ? { ...rest, toBulge: k } : rest;
    }
    return {
        ...shape,
        points: shape.points.map((c, i) => {
            if (i !== leg) return c;
            const { bulge: _was, ...rest } = c;
            return arc ? { ...rest, bulge: k } : rest;
        }),
    };
}

/** The point and side a tangent bar end's key names, or null */
export function tangentOf(
    shape: PathShape,
    key: string | null,
): { index: number; side: 1 | -1 } | null {
    const m = key ? TANGENT.exec(key) : null;
    if (!m) return null;
    const index = Number(m[2]);
    if (index < 0 || index >= shape.points.length) return null;
    return { index, side: m[1] === "t" ? 1 : -1 };
}

/** Whether point `i` is smooth */
export const isSmooth = (shape: PathShape, i: number): boolean =>
    (shape.points[i]?.tension ?? 0) > 0;

/** Every point the marcher walks through, ends included */
export const pathPoints = (shape: PathShape): XY[] => [
    shape.from,
    ...shape.points.map((c) => c.at),
    shape.to,
];

const tuple = (p: XY): [number, number] => [p.x, p.y];
const xy = (p: readonly [number, number]): XY => ({ x: p[0], y: p[1] });
const mid = (a: XY, b: XY): XY => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

const paths = new WeakMap<PathShape, RoutePath>();

/** A point as R-14 reads it: its place, and its roundness and arriving leg's bulge when it has them */
const vertexOf = (p: PathPoint) => ({
    at: tuple(p.at),
    ...((p.tension ?? 0) > 0 ? { tension: p.tension } : {}),
    ...(p.bulge ? { bulge: p.bulge } : {}),
});

/** The walked path R-14 makes of `shape` (cached per shape object) */
export function curveOf(shape: PathShape): RoutePath {
    let path = paths.get(shape);
    if (!path) {
        path = routePath(
            tuple(shape.from),
            shape.points.map(vertexOf),
            tuple(shape.to),
            {
                from: tuple(shape.ends?.from ?? shape.from),
                to: tuple(shape.ends?.to ?? shape.to),
                ...(shape.toBulge ? { toBulge: shape.toBulge } : {}),
            },
        );
        paths.set(shape, path);
    }
    return path;
}

/** Whether any point of the path is smooth, or any leg an arc */
export const hasCurves = (shape: PathShape): boolean =>
    !!shape.toBulge ||
    shape.points.some((p) => (p.tension ?? 0) > 0 || !!p.bulge);

/**
 * The line the field draws: through the points when every one is a corner and no leg an arc, else
 * along R-14's curve (the samples it measures each curved piece on, and each arc's own)
 */
export function pathOutline(shape: PathShape): XY[] {
    if (!hasCurves(shape)) return pathPoints(shape);
    return routePolyline(curveOf(shape)).map(xy);
}

/**
 * The piece of the walked path that runs along leg `leg` (from the point before point `leg` to
 * point `leg`), or -1 when cleaning merged it away (a point on top of its neighbor)
 */
function pieceOfLeg(shape: PathShape, leg: number): number {
    const { source } = curveOf(shape);
    const want = (k: number) => (k < 0 || k >= shape.points.length ? -1 : k);
    const a = want(leg - 1);
    const b = want(leg);
    for (let j = 0; j + 1 < source.length; j++) {
        const sa = source[j]!;
        const sb = source[j + 1]!;
        const atStart = a < 0 ? j === 0 : sa === a;
        const atEnd = b < 0 ? j + 1 === source.length - 1 : sb === b;
        if (atStart && atEnd) return j;
    }
    return -1;
}

/** Where leg `leg`'s midpoint handle sits: halfway along it, on its curve, as a Line's does */
export function legMidpoint(shape: PathShape, leg: number): XY {
    const points = pathPoints(shape);
    const j = pieceOfLeg(shape, leg);
    if (j < 0) return mid(points[leg]!, points[leg + 1]!);
    const path = curveOf(shape);
    return xy(routePiecePoint(path, j, (path.D[j + 1]! - path.D[j]!) / 2));
}

/**
 * Smooth point `i`'s handle on `side` as R-14 draws it (its tangent bar's end), or null for a
 * corner or a point cleaning dropped
 */
export function tangentHandle(
    shape: PathShape,
    i: number,
    side: 1 | -1,
): XY | null {
    if (!isSmooth(shape, i)) return null;
    const path = curveOf(shape);
    const k = path.source.indexOf(i);
    if (k < 0) return null;
    // A smooth point's pieces are both cubic; its out handle is the next piece's first control,
    // its in handle the previous piece's second
    const piece = path.pieces[side === 1 ? k : k - 1];
    if (!piece || piece.kind !== "cubic") return null;
    return xy(side === 1 ? piece.c1 : piece.c2);
}

/**
 * The handles a path draws: a square on each point, which a click selects; a small round one in
 * the middle of each leg, on its curve, which adds a point there (a Line's points and midpoints,
 * #524, #557); and, for the selected smooth point only, its tangent bar's two ends (#525). The
 * fixed ends have none.
 */
export function pathHandles(
    shape: PathShape,
    selected: string | null = null,
): ToolHandle[] {
    const points: ToolHandle[] = shape.points.map((c, i) => ({
        key: pointKey(i),
        at: c.at,
        cursor: "move",
        selects: true,
    }));
    // An arc leg's middle is its bulge handle instead (AP-T11): drawn on a bar from the chord's
    // middle, the sagitta it sets
    const all = pathPoints(shape);
    const midpoints = Array.from(
        { length: shape.points.length + 1 },
        (_, i): ToolHandle =>
            isArcLeg(shape, i)
                ? {
                      key: bulgeKey(i),
                      at: legMidpoint(shape, i),
                      cursor: "move",
                      bar: mid(all[i]!, all[i + 1]!),
                  }
                : {
                      key: midpointKey(i),
                      at: legMidpoint(shape, i),
                      cursor: "pointer",
                      adds: true,
                  },
    );
    const index = pointOf(shape, selected);
    const bar = shape.points[index];
    const tangents = bar
        ? ([1, -1] as const).flatMap((side) => {
              const at = tangentHandle(shape, index, side);
              return at
                  ? [
                        {
                            key: tangentKey(index, side),
                            at,
                            cursor: "pointer",
                            bar: bar.at,
                        },
                    ]
                  : [];
          })
        : [];
    return [...points, ...midpoints, ...tangents];
}

/** The handle within reach of `at`, nearest first (as a shape's handles are found), or null */
export function pathHandleAt(
    shape: PathShape,
    at: XY,
    env: Pick<ToolEnv, "hitRadius">,
    selected: string | null = null,
): ToolHandle | null {
    let best: { handle: ToolHandle; d: number } | null = null;
    for (const handle of pathHandles(shape, selected)) {
        const d = Math.hypot(handle.at.x - at.x, handle.at.y - at.y);
        if (d <= env.hitRadius && (!best || d < best.d)) best = { handle, d };
    }
    return best?.handle ?? null;
}

/** How far `at` is from the segment `a`–`b` */
function fromSegment(at: XY, a: XY, b: XY): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t =
        l2 === 0
            ? 0
            : Math.max(
                  0,
                  Math.min(1, ((at.x - a.x) * dx + (at.y - a.y) * dy) / l2),
              );
    return Math.hypot(at.x - (a.x + dx * t), at.y - (a.y + dy * t));
}

/** How far `at` is from the polyline `line` (Infinity for a line of one point or none) */
export function lineDistance(line: readonly XY[], at: XY): number {
    return line
        .slice(1)
        .reduce(
            (d, b, i) => Math.min(d, fromSegment(at, line[i]!, b)),
            Infinity,
        );
}

/** Whether `at` is within `radius` of the polyline `line` */
export function onLine(line: readonly XY[], at: XY, radius: number): boolean {
    return line.slice(1).some((b, i) => fromSegment(at, line[i]!, b) <= radius);
}

/**
 * Whether a press at `at` is on the drawn path: within the handle reach (`hitRadius`, a few screen
 * pixels at any zoom) of its line, curves included, as a press is on a Line (`onLine`). Only a
 * double-click or a right-click there is the path's; empty field around it stays the field's.
 */
export function onPath(
    shape: PathShape,
    at: XY,
    env: Pick<ToolEnv, "hitRadius">,
): boolean {
    const line = pathOutline(shape);
    return line
        .slice(1)
        .some((b, i) => fromSegment(at, line[i]!, b) <= env.hitRadius);
}

/**
 * Where a point clicked at `at` lands while drawing, after the points so far (the marcher's
 * start, then the points placed): as a Line's clicked point lands, on the half-step grid or a
 * field line, at 45° from the last with `constrain`, and off the grid with `fine`
 */
export function landCorner(shape: PathShape, at: XY, env: ToolEnv): XY {
    return landClicked([shape.from, ...shape.points.map((c) => c.at)], at, env);
}

/**
 * `to` along the way from `from` through `was`, as far as the pointer goes that way: a point
 * dragged with `constrain` keeps its direction from the point before, only its distance changing,
 * as a Line's corner does. On half steps while snapping.
 */
function alongKept(from: XY, was: XY, to: XY, env: ToolEnv): XY {
    const dx = was.x - from.x;
    const dy = was.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return landPoint(to, env);
    const u = { x: dx / len, y: dy / len };
    let t = (to.x - from.x) * u.x + (to.y - from.y) * u.y;
    if (env.snap) {
        const half = env.stepPx / 2;
        t = Math.round(t / half) * half;
    }
    return { x: from.x + u.x * t, y: from.y + u.y * t };
}

/** Point `index` dragged to `to`: landed as a Line's point is, its direction kept with `constrain` */
export function dragPoint(
    shape: PathShape,
    index: number,
    to: XY,
    env: ToolEnv,
): readonly PathPoint[] {
    const points = pathPoints(shape);
    const was = points[index + 1]!;
    const before = points[index]!;
    const at = env.constrain
        ? alongKept(before, was, to, env)
        : landPoint(to, env);
    return shape.points.map((c, i) => (i === index ? { ...c, at } : c));
}

/** Point `index` with roundness `tension`: 0 a corner (no tension kept), more smooth */
export function withTension(
    shape: PathShape,
    index: number,
    tension: number,
): readonly PathPoint[] {
    return shape.points.map((c, i) => {
        if (i !== index) return c;
        const { tension: _was, ...rest } = c;
        return tension > 0 ? { ...rest, tension } : rest;
    });
}

/** Whether the points are the same, tension included */
export const samePoints = (
    a: readonly PathPoint[],
    b: readonly PathPoint[],
): boolean =>
    a.length === b.length &&
    a.every(
        (p, i) =>
            p.id === b[i]!.id &&
            p.at.x === b[i]!.at.x &&
            p.at.y === b[i]!.at.y &&
            (p.tension ?? 0) === (b[i]!.tension ?? 0) &&
            (p.bulge ?? 0) === (b[i]!.bulge ?? 0),
    );

/** Whether two paths have the same points (tension and bulge included) and the same last leg */
export const sameShape = (a: PathShape, b: PathShape): boolean =>
    samePoints(a.points, b.points) && (a.toBulge ?? 0) === (b.toBulge ?? 0);

/** The leg a midpoint's or an arc's handle names (their menus are the leg's), or -1 */
const menuLegOf = (shape: PathShape, key: string | null): number => {
    const leg = legOf(shape, key);
    return leg >= 0 ? leg : bulgeLegOf(shape, key);
};

/** A point double-clicked turns smooth, or a corner again (a Line's #557) */
export const toggleSmooth = (
    shape: PathShape,
    index: number,
): readonly PathPoint[] =>
    withTension(shape, index, isSmooth(shape, index) ? 0 : SMOOTH);

/**
 * Where smooth point `index`'s handle on `side` sits at roundness 1, as a Line's `fullHandle`: the
 * point's handle with its roundness taken out; null for a corner
 */
function fullHandle(shape: PathShape, index: number, side: 1 | -1): XY | null {
    const at = tangentHandle(shape, index, side);
    const q = shape.points[index];
    const t = q?.tension ?? 0;
    if (!at || !q || !(t > 0)) return null;
    return { x: q.at.x + (at.x - q.at.x) / t, y: q.at.y + (at.y - q.at.y) / t };
}

/**
 * Roundness from a drag to `to` along point `index`'s tangent at roundness 1 (`full`, its handle
 * on that side): how far out along it the pointer went, 0 to {@link MAX_TENSION}, in tenths when
 * snapping, as a Line's tangent bar end sets it (`dragTension`)
 */
function roundnessAlong(q: XY, full: XY, to: XY, env: ToolEnv): number {
    const d = { x: full.x - q.x, y: full.y - q.y };
    const l2 = d.x * d.x + d.y * d.y;
    if (!(l2 > 1e-12)) return 0;
    let t = Math.min(
        MAX_TENSION,
        Math.max(0, ((to.x - q.x) * d.x + (to.y - q.y) * d.y) / l2),
    );
    if (env.snap) t = Math.round(t * 10) / 10;
    return t;
}

/**
 * One end of point `index`'s tangent bar dragged to `to`: the roundness as far out along the
 * curve's way on `side` as the pointer went, a corner at or behind the point (a Line's #525, #557)
 */
export function dragTangent(
    shape: PathShape,
    index: number,
    side: 1 | -1,
    to: XY,
    env: ToolEnv,
): readonly PathPoint[] {
    const full = fullHandle(shape, index, side);
    const q = shape.points[index];
    if (!full || !q) return shape.points;
    return withTension(shape, index, roundnessAlong(q.at, full, to, env));
}

/**
 * The pen's press-and-drag on a point just placed (the last): it turns smooth, its roundness how
 * far the drag went, whichever way, measured against its shorter handle at roundness 1 (so a drag
 * as long as that handle is the plain curve, twice as long the roundest), in tenths when snapping.
 * Back on the point it's a corner again. Only the roundness is set: its direction comes from the
 * points around it, as on a Line.
 */
export function dragNewPoint(
    shape: PathShape,
    to: XY,
    env: ToolEnv,
): readonly PathPoint[] {
    const index = shape.points.length - 1;
    if (index < 0) return shape.points;
    // Its handles at roundness 1, from the point with that roundness
    const smooth: PathShape = {
        ...shape,
        points: withTension(shape, index, SMOOTH),
    };
    const q = smooth.points[index]!.at;
    const lengths = ([1, -1] as const).flatMap((side) => {
        const full = fullHandle(smooth, index, side);
        const l = full ? Math.hypot(full.x - q.x, full.y - q.y) : 0;
        return l > 1e-9 ? [l] : [];
    });
    if (lengths.length === 0) return shape.points;
    let t = Math.min(
        MAX_TENSION,
        Math.hypot(to.x - q.x, to.y - q.y) / Math.min(...lengths),
    );
    if (env.snap) t = Math.round(t * 10) / 10;
    return withTension(shape, index, t);
}

/**
 * The bulge of each half of an arc with bulge `k`: the same circle, half the sweep. R-8's
 * half-angle is `φ = 2·atan(2k)`, so a half's is `φ/2` and its bulge `tan(φ/4)/2`.
 */
export const halfBulge = (k: number): number =>
    Math.tan(Math.atan(2 * k) / 2) / 2;

/**
 * A new point in the middle of leg `leg`, on its curve, which becomes point `leg`: a corner
 * between corners, else as smooth as the smoother end, the fixed ends counting as corners (a
 * Line's `splitSegment`, #525). On an arc leg it is a corner on the arc's middle, and each half
 * stays on the same circle (R-14″).
 */
export function splitLeg(shape: PathShape, leg: number): PathShape {
    const at = legMidpoint(shape, leg);
    const k = legBulge(shape, leg);
    if (k) {
        const half = halfBulge(k);
        const split = withLegBulge(shape, leg, half);
        return {
            ...split,
            points: [
                ...split.points.slice(0, leg),
                { at, bulge: half },
                ...split.points.slice(leg),
            ],
        };
    }
    const t = Math.max(
        shape.points[leg - 1]?.tension ?? 0,
        shape.points[leg]?.tension ?? 0,
    );
    return {
        ...shape,
        points: [
            ...shape.points.slice(0, leg),
            t > 0 ? { at, tension: t } : { at },
            ...shape.points.slice(leg),
        ],
    };
}

/**
 * `shape` without point `index`. The leg the two around it merge into is straight: an arc it was
 * part of doesn't carry over to a new chord (and could then sit beside a smooth point, R-14″).
 */
export function withoutPoint(shape: PathShape, index: number): PathShape {
    const merged = withLegBulge(shape, index + 1, undefined);
    return {
        ...merged,
        points: merged.points.filter((_, i) => i !== index),
    };
}

const cross = (a: XY, b: XY) => a.x * b.y - a.y * b.x;
const dot = (a: XY, b: XY) => a.x * b.x + a.y * b.y;
const sub = (a: XY, b: XY): XY => ({ x: a.x - b.x, y: a.y - b.y });

/**
 * Whether leg `leg` runs straight: a line piece, or a curve whose handles both lie along it, inside
 * it, as a Line's `lineSegments` makes such a segment a line
 */
export function legStraight(shape: PathShape, leg: number): boolean {
    const j = pieceOfLeg(shape, leg);
    if (j < 0) return true;
    const path = curveOf(shape);
    const piece = path.pieces[j]!;
    if (piece.kind === "line") return true;
    if (piece.kind === "arc") return false;
    const a = xy(path.V[j]!);
    const b = xy(path.V[j + 1]!);
    const d = sub(b, a);
    const l2 = dot(d, d);
    const along = (c: XY) => {
        const t = dot(sub(c, a), d);
        return Math.abs(cross(d, sub(c, a))) <= 1e-9 * l2 && t >= 0 && t <= l2;
    };
    return along(xy(piece.c1)) && along(xy(piece.c2));
}

/**
 * Leg `leg` made straight (both its points corners) or curved (both smooth, a corner made
 * {@link SMOOTH}), as a Line's `setSegmentCurved` (#569); the fixed ends have no roundness. Either
 * way it's no longer an arc (R-14″).
 */
export function setLegCurved(
    shape: PathShape,
    leg: number,
    curved: boolean,
): PathShape {
    const flat = withLegBulge(shape, leg, undefined);
    return {
        ...flat,
        points: flat.points.map((c, i) => {
            if (i !== leg - 1 && i !== leg) return c;
            const t = c.tension ?? 0;
            const { tension: _t, ...rest } = c;
            if (!curved) return rest;
            return { ...rest, tension: t > 0 ? t : SMOOTH };
        }),
    };
}

/** The bulge Arc gives a leg: a quarter, the sagitta a quarter of the chord (AP-T11) */
export const ARC_BULGE = 0.25;

/**
 * Leg `leg` made an arc with bulge `k` (AP-T11), its two points corners, as Straight makes them:
 * a point at either end of an arc leg is a corner (R-14″)
 */
export function setLegArc(
    shape: PathShape,
    leg: number,
    k: number = ARC_BULGE,
): PathShape {
    const arc = withLegBulge(setLegCurved(shape, leg, false), leg, k);
    return arc;
}

/** How near a half circle a dragged bulge snaps onto it, in bulge */
const HALF_CIRCLE_SNAP = 0.04;

/**
 * Arc leg `leg`'s middle handle dragged to `to` (AP-T11): the bulge is the pointer's signed
 * distance from the chord over the chord, at most a half circle either way, snapped onto the half
 * circle near it while snapping (fine, the modifier that turns snapping off, places it freely).
 * On the chord it's straight again.
 */
export function dragBulge(
    shape: PathShape,
    leg: number,
    to: XY,
    env: Pick<ToolEnv, "snap">,
): PathShape {
    const all = pathPoints(shape);
    const a = all[leg]!;
    const b = all[leg + 1]!;
    const c = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(c > 1e-9)) return shape;
    // R-8: a positive bulge bends toward +90° of the chord, n = (−u.y, u.x)
    const n = { x: -(b.y - a.y) / c, y: (b.x - a.x) / c };
    const m = mid(a, b);
    let k = ((to.x - m.x) * n.x + (to.y - m.y) * n.y) / c;
    k = Math.max(-MAX_ROUTE_BULGE, Math.min(MAX_ROUTE_BULGE, k));
    if (env.snap && MAX_ROUTE_BULGE - Math.abs(k) <= HALF_CIRCLE_SNAP)
        k = Math.sign(k) * MAX_ROUTE_BULGE;
    return withLegBulge(shape, leg, k);
}

/**
 * Handle `key` dragged to `to` from `base`, the path at the press: a point moves; a midpoint adds
 * a point there and drags it, reading neither constrain nor from center, as a Line's midpoint
 * does; a tangent bar's end sets its point's roundness; an arc's middle sets its bulge (AP-T11).
 * The path after it, or `base` for a key it doesn't know.
 */
export function dragPathHandle(
    base: PathShape,
    key: string,
    to: XY,
    env: ToolEnv,
): PathShape {
    const arc = bulgeLegOf(base, key);
    if (arc >= 0) return dragBulge(base, arc, to, env);
    const with_ = (points: readonly PathPoint[]) => ({ ...base, points });
    const leg = legOf(base, key);
    if (leg >= 0) {
        const split = splitLeg(base, leg);
        return {
            ...split,
            points: dragPoint(split, leg, to, {
                ...env,
                constrain: false,
                fromCenter: false,
            }),
        };
    }
    const tangent = tangentOf(base, key);
    if (tangent)
        return with_(dragTangent(base, tangent.index, tangent.side, to, env));
    const index = pointOf(base, key);
    return index < 0 ? base : with_(dragPoint(base, index, to, env));
}

/** What a click on handle `key` does: a midpoint adds a point there; null for nothing */
export function clickPathHandle(
    shape: PathShape,
    key: string,
): PathShape | null {
    const leg = legOf(shape, key);
    return leg >= 0 ? splitLeg(shape, leg) : null;
}

/**
 * What `constrain` does on a path's handles, for the chip: a point keeps its direction, as a
 * Line's corner does; a midpoint and a tangent bar's end take neither role
 */
export function pathHonors(shape: PathShape, key: string): KindHonors {
    return pointOf(shape, key) >= 0 ? { constrain: "keepDirection" } : {};
}

/** A point's menu: Corner | Smooth with Roundness under it, as a Line's; Delete point */
function pointMenu(shape: PathShape, index: number): ToolMenuSection[] {
    const smooth = isSmooth(shape, index);
    const arc = besideArc(shape, index);
    return [
        {
            label: tolgee.t("pathways.menu.pointType", "Corner type"),
            look: "segmented",
            hint: tolgee.t(
                "pathways.menu.swapHint",
                "Double-click a point to swap",
            ),
            items: [
                {
                    value: "corner",
                    label: tolgee.t("pathways.menu.corner", "Corner"),
                    checked: !smooth,
                },
                {
                    value: "smooth",
                    label: tolgee.t("pathways.menu.smooth", "Smooth"),
                    checked: smooth,
                    // R-14″: a point at an end of an arc leg stays a corner
                    ...(arc && !smooth ? { disabled: besideArcReason() } : {}),
                },
                ...(smooth
                    ? [
                          {
                              value: "roundness",
                              label: tolgee.t(
                                  "pathways.menu.roundness",
                                  "Roundness",
                              ),
                          },
                      ]
                    : []),
            ],
        },
        {
            items: [
                {
                    value: "delete",
                    label: tolgee.t(
                        "pathways.menu.deletePoint",
                        "Delete point",
                    ),
                    icon: "trash",
                    destructive: true,
                },
            ],
        },
    ];
}

/** Why a point beside an arc leg can't be smooth (R-14″), as its menu and the editor bar say */
export const besideArcReason = () =>
    tolgee.t(
        "pathways.menu.besideArc",
        "A point at an end of an arc stays a corner",
    );

/**
 * A leg's menu: Add point here; Straight | Curved | Arc, as a Line's segment menu with Arc added
 * (AP-T11)
 */
function legMenu(shape: PathShape, leg: number): ToolMenuSection[] {
    const arc = isArcLeg(shape, leg);
    const straight = !arc && legStraight(shape, leg);
    const curves = !legStraight(setLegCurved(shape, leg, true), leg);
    // Curved makes this leg's points smooth, which an arc on the next leg either side refuses
    const nextToArc = isArcLeg(shape, leg - 1) || isArcLeg(shape, leg + 1);
    return [
        {
            items: [
                {
                    value: "add",
                    label: tolgee.t("pathways.menu.addPoint", "Add point here"),
                },
            ],
        },
        {
            items: [
                {
                    value: "straight",
                    label: tolgee.t("pathways.menu.straight", "Straight"),
                    checked: straight,
                },
                {
                    value: "curved",
                    label: tolgee.t("pathways.menu.curved", "Curved"),
                    checked: !straight && !arc,
                    ...(nextToArc
                        ? {
                              disabled: tolgee.t(
                                  "pathways.menu.nextToArc",
                                  "An arc meets this leg at a corner",
                              ),
                          }
                        : curves || arc
                          ? {}
                          : {
                                disabled: tolgee.t(
                                    "pathways.menu.noCurve",
                                    "The path runs straight through here",
                                ),
                            }),
                },
                {
                    value: "arc",
                    label: tolgee.t("pathways.menu.arc", "Arc"),
                    checked: arc,
                },
            ],
        },
    ];
}

/** The menu of an Adjust key, or of an adjusted lane elsewhere on its line */
function adjustMenu(onKey: boolean): ToolMenuSection[] {
    return [
        {
            items: [
                ...(onKey
                    ? [
                          {
                              value: "removeKey",
                              label: tolgee.t(
                                  "actions.path.adjustRemoveKey",
                                  "Remove adjustment point",
                              ),
                          },
                      ]
                    : []),
                {
                    value: "resetSpot",
                    label: tolgee.t(
                        "actions.path.adjustResetSpot",
                        "Match group",
                    ),
                    icon: "trash" as const,
                    destructive: true,
                },
            ],
        },
    ];
}

/**
 * A path's right-click menus, as a Line's point and segment menus (#569): a point's Corner |
 * Smooth, its Roundness (which selects it, showing its tangent bar) and Delete point; a leg's Add
 * point here and Straight | Curved. A path has no marchers on its points and no ends to close.
 * Deleting the last point removes the path (one undo step: the app's pick does it), so no path
 * with no point is left behind.
 */
export const PATH_MENU: ToolHandleMenu<PathShape> = {
    sections(shape, _n, key) {
        const adjustKey = adjustKeyOf(key);
        if (adjustKey) return adjustMenu(true);
        if (laneOfKey(key) !== null) return adjustMenu(false);
        const index = pointOf(shape, key);
        if (index >= 0) return pointMenu(shape, index);
        const leg = menuLegOf(shape, key);
        return leg >= 0 ? legMenu(shape, leg) : null;
    },
    pick(shape, _n, key, value) {
        // Adjust's entries are the app's to run (`PathPenMode.openMenu`)
        if (adjustKeyOf(key) || laneOfKey(key) !== null) return null;
        const with_ = (points: readonly PathPoint[]) => ({ ...shape, points });
        const leg = menuLegOf(shape, key);
        if (leg >= 0) {
            if (value === "add")
                return {
                    params: splitLeg(shape, leg),
                    selected: pointKey(leg),
                };
            if (value === "straight" || value === "curved" || value === "arc") {
                const next =
                    value === "arc"
                        ? isArcLeg(shape, leg)
                            ? shape
                            : setLegArc(shape, leg)
                        : setLegCurved(shape, leg, value === "curved");
                return sameShape(next, shape) ? null : { params: next };
            }
            return null;
        }
        const index = pointOf(shape, key);
        if (index < 0) return null;
        switch (value) {
            case "corner":
                return isSmooth(shape, index)
                    ? { params: with_(withTension(shape, index, 0)) }
                    : null;
            // Smooth shows the point's bar straight away, as Roundness does; beside an arc it's
            // disabled (R-14″)
            case "smooth":
                if (besideArc(shape, index) && !isSmooth(shape, index))
                    return null;
                return {
                    params: isSmooth(shape, index)
                        ? shape
                        : with_(withTension(shape, index, SMOOTH)),
                    selected: key,
                };
            case "roundness":
                return isSmooth(shape, index)
                    ? { params: shape, selected: key }
                    : null;
            case "delete":
                return {
                    params: withoutPoint(shape, index),
                    selected: null,
                };
            default:
                return null;
        }
    },
};

// ---------------------------------------------------------------------------
// Group paths (pathways step 15, spec R-14 "Group schedule")
// ---------------------------------------------------------------------------

/** The route a group path's shape describes: its reference line from F to G, as R-14 reads it */
export function scheduleOf(shape: PathShape): GroupSchedule {
    const from = tuple(shape.ends?.from ?? shape.from);
    const to = tuple(shape.ends?.to ?? shape.to);
    return groupSchedule({
        from,
        to,
        points: shape.points.map(vertexOf),
        ...(shape.toBulge ? { toBulge: shape.toBulge } : {}),
    });
}

/** One member's walk on the group path `shape`: its own legs onto and off its lane, with its Adjust */
export const memberWalkOf = (
    schedule: GroupSchedule,
    member: {
        from: XY;
        to: XY;
        offset: XY;
        adjust?: AdjustProfile | null;
    },
    points: readonly { id?: string }[] = [],
): GroupMemberWalk =>
    groupMemberWalk(
        schedule,
        tuple(member.from),
        tuple(member.to),
        tuple(member.offset),
        member.adjust ? resolveAdjust(schedule, points, member.adjust) : null,
    );

/** An Adjust key's handle key: `a<marcher>:<index in the stored profile>` */
export const adjustKey = (marcherId: number, index: number) =>
    `a${marcherId}:${index}`;
const ADJUST_KEY = /^a(\d+):(\d+)$/;
export function adjustKeyOf(
    key: string | null,
): { marcherId: number; index: number } | null {
    const m = key ? ADJUST_KEY.exec(key) : null;
    return m ? { marcherId: Number(m[1]), index: Number(m[2]) } : null;
}
/** A lane's menu key: `l<marcher>` */
export const laneKey = (marcherId: number) => `l${marcherId}`;
export function laneOfKey(key: string | null): number | null {
    const m = key ? /^l(\d+)$/.exec(key) : null;
    return m ? Number(m[1]) : null;
}

/** A lane's Adjust keys as handles, in place order: its stored index, place and where it's drawn */
export function adjustHandlesOf(
    walk: GroupMemberWalk,
): { index: number; x: number; at: XY }[] {
    const { adjust, schedule, offset } = walk;
    if (!adjust) return [];
    return adjust.xs.map((x, i) => {
        const q = routePoint(schedule.W, x / schedule.W.L);
        const d = adjust.ds[i]!;
        return {
            index: adjust.sources[i]!,
            x,
            at: { x: q[0] + offset[0] + d[0], y: q[1] + offset[1] + d[1] },
        };
    });
}

/** The lane's reference place at `x`, before its Adjust: `walk(x) + o` */
export function lanePlain(walk: GroupMemberWalk, x: number): XY {
    const q = routePoint(walk.schedule.W, x / walk.schedule.W.L);
    return { x: q[0] + walk.offset[0], y: q[1] + walk.offset[1] };
}

/** The lane's displacement at `x` now */
export function laneDelta(walk: GroupMemberWalk, x: number): XY {
    if (!walk.adjust) return { x: 0, y: 0 };
    const d = adjustAt(walk.adjust, x);
    return { x: d[0], y: d[1] };
}

/** Where a press landed on a lane: its rigid part at place `x`, or a leg (`x` null). */
export interface LaneHit {
    x: number | null;
    at: XY;
    distance: number;
}

/**
 * The point of `walk`'s lane nearest `at` within `radius`, or null (decision C): on its rigid part
 * the place there, measured along the reference walk, and on a leg no place.
 */
export function laneHitOf(
    walk: GroupMemberWalk,
    at: XY,
    radius: number,
): LaneHit | null {
    let best: LaneHit | null = null;
    const consider = (a: XY, b: XY, x0: number | null, x1: number | null) => {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const l2 = dx * dx + dy * dy;
        const t =
            l2 === 0
                ? 0
                : Math.max(
                      0,
                      Math.min(1, ((at.x - a.x) * dx + (at.y - a.y) * dy) / l2),
                  );
        const point = { x: a.x + dx * t, y: a.y + dy * t };
        const distance = Math.hypot(at.x - point.x, at.y - point.y);
        if (distance > radius || (best && distance >= best.distance)) return;
        best = {
            x: x0 === null || x1 === null ? null : x0 + (x1 - x0) * t,
            at: point,
            distance,
        };
    };
    const samples = samplesOf(walk);
    for (let i = 1; i < samples.length; i++)
        consider(
            xy(samples[i - 1]!.at),
            xy(samples[i]!.at),
            samples[i - 1]!.x,
            samples[i]!.x,
        );
    for (const leg of [walk.first, walk.last]) {
        if (!leg) continue;
        const line = legLine(leg);
        for (let i = 1; i < line.length; i++)
            consider(line[i - 1]!, line[i]!, null, null);
    }
    return best;
}

const laneSampleCache = new WeakMap<GroupMemberWalk, LaneSample[]>();

/** A lane's samples, once per walk: a hover tests every lane on each pointer move */
function samplesOf(walk: GroupMemberWalk): LaneSample[] {
    let samples = laneSampleCache.get(walk);
    if (!samples) {
        samples = laneSamples(walk);
        laneSampleCache.set(walk, samples);
    }
    return samples;
}

/** The route `shape` would store, for the rules that read point ids */
const geometryOf = (shape: PathShape): RouteGeometry => ({
    v: 1,
    from: tuple(shape.ends?.from ?? shape.from),
    to: tuple(shape.ends?.to ?? shape.to),
    ...(shape.toBulge ? { toBulge: shape.toBulge } : {}),
    points: shape.points.map((p) => ({ id: p.id ?? "", ...vertexOf(p) })),
});

/**
 * AP-R11's point drag on the field: `points` dragged from `base` go only as far as keeps every
 * profile's keys at least a step apart, the same rule the save applies.
 */
export function limitDrag(
    base: PathShape,
    next: PathShape,
    profiles: readonly AdjustProfile[],
): PathShape {
    if (profiles.length === 0) return next;
    const { geometry, stopped } = limitRouteEdit(
        geometryOf(base),
        geometryOf(next),
        profiles,
    );
    if (!stopped) return next;
    const { toBulge: _was, ...rest } = next;
    return {
        ...rest,
        ...(geometry.toBulge === undefined
            ? {}
            : { toBulge: geometry.toBulge }),
        points: next.points.map((p, i) => {
            const q = geometry.points[i]!;
            const { tension: _t, bulge: _b, ...kept } = p;
            return {
                ...kept,
                at: xy(q.at),
                ...(q.tension === undefined ? {} : { tension: q.tension }),
                ...(q.bulge === undefined ? {} : { bulge: q.bulge }),
            };
        }),
    };
}

const legLine = (leg: GroupLeg): XY[] => {
    const [S, E] = [leg.path.V[0]!, leg.path.V[1]!];
    const piece = leg.path.pieces[0]!;
    if (piece.kind === "arc")
        return Array.from({ length: ROUTE_ARC_SAMPLES + 1 }, (_, i) =>
            xy(arcPoint(S, E, piece.k, i / ROUTE_ARC_SAMPLES)),
        );
    if (piece.kind === "line" || leg.length < 1e-9) return [xy(S), xy(E)];
    return Array.from({ length: ROUTE_CUBIC_SAMPLES + 1 }, (_, i) =>
        xy(
            i === ROUTE_CUBIC_SAMPLES
                ? E
                : cubicPoint(S, piece.c1, piece.c2, E, i / ROUTE_CUBIC_SAMPLES),
        ),
    );
};

/**
 * The line a member walks on a group path, to draw as its lane: its first leg, its copy of the
 * reference walk between its first and last points, and its last leg (R-14 group schedule)
 */
export function laneOutline(walk: GroupMemberWalk): XY[] {
    const { first, last } = walk;
    if (!first || !last) return [xy(walk.A), xy(walk.B)];
    const middle = laneSamples(walk)
        .slice(1)
        .map((s) => xy(s.at));
    return [...legLine(first), ...middle, ...legLine(last).slice(1)];
}

/**
 * Each leg of each member as Big steps judges it (spec Appendix I.8): the first leg's distance
 * per move as `ℓ_first · L^W / D^W_1`, the middle as `L^W` (once), the last leg's as
 * `ℓ_last · L^W / (L^W − D^W_m)`, Infinity when that difference rounds to 0. A leg under
 * `EPS_GEOM` is never big, so it's left out. Each is the distance a steady walker would cover
 * over the whole move at that leg's speed, to test against the move's counts.
 */
/** A leg of a group path: onto it, along it, off it, or straight to the spot when it has no point */
export type LegWhere = "onto" | "along" | "off" | "straight" | "adjusted";

/** One stretch of a walked leg (`x0`, `x1` set only for an adjusted stretch, J.6) */
export interface LegDistance {
    where: LegWhere;
    marcherId: number | null;
    distance: number;
    x0?: number;
    x1?: number;
}

export function groupLegDistances(
    schedule: GroupSchedule,
    walks: readonly { marcherId: number; walk: GroupMemberWalk }[],
): LegDistance[] {
    const W = schedule.W;
    const m = W.V.length - 2;
    const out: LegDistance[] = [];
    // No point on the path: each member walks straight to its spot, no path to be along
    if (m < 1) {
        for (const { marcherId, walk } of walks) {
            const d = Math.hypot(walk.B[0] - walk.A[0], walk.B[1] - walk.A[1]);
            if (d >= 1e-9)
                out.push({ where: "straight", marcherId, distance: d });
        }
        return out;
    }
    const L = W.L;
    if (m > 1) out.push({ where: "along", marcherId: null, distance: L });
    for (const { marcherId, walk } of walks) {
        const first = walk.first!.length;
        const last = walk.last!.length;
        if (first >= 1e-9)
            out.push({
                where: "onto",
                marcherId,
                distance: (first * L) / W.D[1]!,
            });
        if (last >= 1e-9) {
            const rest = L - W.D[m]!;
            out.push({
                where: "off",
                marcherId,
                distance: rest > 0 ? (last * L) / rest : Infinity,
            });
        }
        out.push(...adjustedStretches(marcherId, walk));
    }
    return out;
}

/**
 * Big steps on an adjusted lane (spec J.6): the rigid part split at every kept point and key place.
 * A stretch whose displacement changes is walked at its own speed, so it is judged by its own
 * travel, expressed as the distance a steady walker would cover over the whole move at that speed.
 * The rest walk at the reference's speed, which "along" already judges.
 */
function adjustedStretches(
    marcherId: number,
    walk: GroupMemberWalk,
): LegDistance[] {
    const { adjust, schedule } = walk;
    if (!adjust || adjust.xs.length === 0) return [];
    const { W } = schedule;
    const m = W.V.length - 2;
    const breaks = [...new Set([...W.D.slice(1, m + 1), ...adjust.xs])].sort(
        (a, b) => a - b,
    );
    const samples = laneSamples(walk);
    const out: LegDistance[] = [];
    for (let i = 1; i < breaks.length; i++) {
        const x0 = breaks[i - 1]!;
        const x1 = breaks[i]!;
        const a = adjustAt(adjust, x0);
        const b = adjustAt(adjust, x1);
        if (a[0] === b[0] && a[1] === b[1]) continue;
        let travel = 0;
        for (let k = 1; k < samples.length; k++) {
            const s0 = samples[k - 1]!;
            const s1 = samples[k]!;
            if (s0.x >= x0 && s1.x <= x1)
                travel += Math.hypot(s1.at[0] - s0.at[0], s1.at[1] - s0.at[1]);
        }
        out.push({
            where: "adjusted",
            marcherId,
            distance: (travel * W.L) / (x1 - x0),
            x0,
            x1,
        });
    }
    return out;
}

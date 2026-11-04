import type { ToolEnv } from "../tool/toolKind";
import type { ShapeFrame } from "../frame/frame";
import type { XY } from "../types";
import {
    bends,
    drawLine,
    isClosed,
    isLineParams,
    lineInFrame,
    lineSegments,
    segmentMidpoint,
    type LineEllipse,
    type LineParams,
    type LinePoint,
} from "../line/lineGeometry";
import { ellipsePoint } from "../geometry/path";
import { linePull } from "../frame/edgeGuides";

/**
 * The Arc (#634): a Line of two points whose segment bends as a circular arc, stored as the
 * Line's params with the first point's `bend` (its sweep in degrees). Closed, it is either the
 * arc and its chord (a straight segment back) or a whole circle (the second point's segment
 * bending round the rest of the way). Its segment can run on an ellipse instead of a circle
 * (`ellipse` on its points, owner on #634): everything round is then done where the ellipse is a
 * circle and stretched back. Everything here is pure.
 */

/** How an arc is closed: open, by its chord, or round to a whole circle */
export type ArcEnds = "open" | "chord" | "circle";

/** The sweep a drawn arc starts with, in degrees: a quarter turn, bowing left of the drag */
export const DRAWN_BEND = 90;
/** The widest an arc can turn: short of a full turn, so its ends stay apart */
export const MAX_BEND = 359;
/** The narrowest: a hair off straight still reads as an arc */
export const MIN_BEND = 1;

/** Whether `params` is an arc this version reads: a Line of two points, the first bent */
export function isArcParams(params: unknown): params is LineParams {
    if (!isLineParams(params)) return false;
    const [a, b, ...rest] = params.points;
    if (!a || !b || rest.length > 0 || !bends(a)) return false;
    // Only the circle's second point bends, the same way round, making up the full turn on the
    // same ellipse
    if (b.bend === undefined) return true;
    return (
        isClosed(params) &&
        Math.sign(b.bend) === Math.sign(a.bend!) &&
        Math.abs(Math.abs(a.bend!) + Math.abs(b.bend) - 360) < 1e-6 &&
        sameEllipse(a.ellipse, b.ellipse)
    );
}

/** Whether two points run on the same ellipse, give or take float noise from turning it */
const sameEllipse = (a?: LineEllipse, b?: LineEllipse): boolean =>
    a === b ||
    (!!a &&
        !!b &&
        Math.abs(a.ratio - b.ratio) < 1e-6 &&
        Math.abs(((a.axis - b.axis + 540) % 360) - 180) < 1e-6);

/** The ellipse the arc runs on, or undefined for a circle */
export const ellipseOf = (p: LineParams): LineEllipse | undefined =>
    p.points[0]?.ellipse;

/** The arc's sweep in degrees, signed (positive bows to the left from its first end) */
export const bendOf = (p: LineParams): number => p.points[0]?.bend ?? 0;

/** How the arc is closed */
export function arcEnds(p: LineParams): ArcEnds {
    if (!isClosed(p)) return "open";
    return p.points[1]?.bend !== undefined ? "circle" : "chord";
}

/** The two points with `bend` on the first, and the circle's rest of the turn on the second */
function withPoints(
    p: LineParams,
    bend: number,
    ends: ArcEnds,
): readonly LinePoint[] {
    const [a, b] = p.points as [LinePoint, LinePoint];
    const { bend: _was, ellipse: _ellipse, ...second } = b;
    return [
        { ...a, bend },
        ends === "circle"
            ? {
                  ...second,
                  bend: Math.sign(bend) * (360 - Math.abs(bend)),
                  ...(a.ellipse ? { ellipse: a.ellipse } : {}),
              }
            : second,
    ];
}

/** The arc turning through `bend` degrees, its ends where they are */
export function withBend(p: LineParams, bend: number): LineParams {
    const clamped =
        Math.sign(bend || 1) *
        Math.min(MAX_BEND, Math.max(MIN_BEND, Math.abs(bend)));
    if (clamped === bendOf(p)) return p;
    return { ...p, points: withPoints(p, clamped, arcEnds(p)) };
}

/**
 * The arc closed by its chord, closed round to a whole circle, or opened again. Its ends and
 * sweep stay, so opening gives back the arc it was. A fill goes only with the opening: closed
 * either way it keeps it, so switching between the two closes gives it back.
 */
export function withEnds(p: LineParams, ends: ArcEnds): LineParams {
    if (ends === arcEnds(p)) return p;
    const points = withPoints(p, bendOf(p), ends);
    const {
        closed: _closed,
        distribution: _distribution,
        corners: _corners,
        ...rest
    } = p;
    if (ends === "open") return { ...rest, points };
    const fill = p.distribution ? { distribution: p.distribution } : {};
    // Round a circle the marchers go evenly, with no corner holding one at the ends
    return ends === "circle"
        ? { ...rest, points, closed: true, corners: false, ...fill }
        : { ...rest, points, closed: true, ...fill };
}

/**
 * The circle or ellipse the arc runs on, in its own axes: `axis` (radians) the way its width
 * (`rx`) points, its depth (`ry`) a quarter turn on; `start` and `sweep` the arc's angles around
 * it from the width axis. A circle's axes follow the arc: its depth runs out through the arc's
 * middle. Null while the arc is straight.
 */
export interface ArcGuide {
    readonly center: XY;
    readonly rx: number;
    readonly ry: number;
    readonly axis: number;
    readonly start: number;
    readonly sweep: number;
}

export function arcGuide(p: LineParams): ArcGuide | null {
    const segment = lineSegments(p)[0];
    if (segment?.type === "ellipse")
        return {
            center: segment.center,
            rx: segment.rx,
            ry: segment.ry,
            axis: segment.rotation,
            start: segment.start,
            sweep: segment.sweep,
        };
    if (segment?.type !== "arc") return null;
    const axis = segment.start + segment.sweep / 2 - Math.PI / 2;
    return {
        center: segment.center,
        rx: segment.r,
        ry: segment.r,
        axis,
        start: segment.start - axis,
        sweep: segment.sweep,
    };
}

/** The point at angle `t` around the guide */
export const guidePoint = (g: ArcGuide, t: number): XY =>
    ellipsePoint(
        {
            type: "ellipse",
            center: g.center,
            rx: g.rx,
            ry: g.ry,
            rotation: g.axis,
            start: 0,
            sweep: 0,
        },
        t,
    );

/** Where the bend handle sits: halfway round the arc */
export function bendHandlePoint(p: LineParams): XY {
    const g = arcGuide(p);
    return g ? guidePoint(g, g.start + g.sweep / 2) : segmentMidpoint(p, 0);
}

/** `p` in the guide's own axes, from its center */
function onAxes(g: ArcGuide, p: XY): XY {
    const dx = p.x - g.center.x;
    const dy = p.y - g.center.y;
    const c = Math.cos(-g.axis);
    const s = Math.sin(-g.axis);
    return { x: dx * c - dy * s, y: dx * s + dy * c };
}

/** The arc on `g`, its ends at its angles, as `base` with its other numbers kept */
function onGuide(base: LineParams, g: ArcGuide): LineParams {
    const a = guidePoint(g, g.start);
    const b = guidePoint(g, g.start + g.sweep);
    const round = Math.abs(g.rx - g.ry) <= 1e-9 * Math.max(g.rx, g.ry);
    const ellipse: LineEllipse | undefined = round
        ? undefined
        : { ratio: g.ry / g.rx, axis: (g.axis * 180) / Math.PI };
    const ends = arcEnds(base);
    const bend = (g.sweep * 180) / Math.PI;
    const [p, q] = base.points as [LinePoint, LinePoint];
    const { ellipse: _p, ...first } = p;
    const { ellipse: _q, ...second } = q;
    const points: LinePoint[] = [
        { ...first, x: a.x, y: a.y, bend, ...(ellipse ? { ellipse } : {}) },
        { ...second, x: b.x, y: b.y },
    ];
    return { ...base, points: withPoints({ ...base, points }, bend, ends) };
}

/** Up to this many degrees, a change of degrees keeps the arc's ends where they are */
export const HALF_TURN = 180;

/**
 * The arc turning `degrees`, as the editor's degrees set it (owner on #634): up to a half turn its
 * ends stay where they are and its middle moves, so the gap between its end marchers holds and the
 * circle grows or shrinks to fit; past a half turn its circle or ellipse stays instead
 * ({@link withSweep}), since its ends close in and the circle would otherwise balloon. A change
 * across the half turn goes to it one way and on the other.
 */
export function withDegrees(p: LineParams, degrees: number): LineParams {
    const size = Math.min(MAX_BEND, Math.max(MIN_BEND, Math.abs(degrees)));
    const now = Math.abs(bendOf(p));
    const sign = Math.sign(bendOf(p)) || 1;
    if (size <= HALF_TURN && now <= HALF_TURN) return withBend(p, sign * size);
    if (size > HALF_TURN && now >= HALF_TURN) return withSweep(p, size);
    if (size <= HALF_TURN)
        return withBend(withSweep(p, HALF_TURN), sign * size);
    return withSweep(withBend(p, sign * HALF_TURN), size);
}

/** How far the arc's middle stands off its ends' line, and which way, for `degrees` of it */
function middleOff(p: LineParams, degrees: number) {
    const q = withDegrees(p, degrees);
    const [a, b] = q.points as [LinePoint, LinePoint];
    const base = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const mid = bendHandlePoint(q);
    const height = Math.hypot(mid.x - base.x, mid.y - base.y);
    const way =
        height > 1e-9
            ? { x: (mid.x - base.x) / height, y: (mid.y - base.y) / height }
            : null;
    return { mid, height, way };
}

/**
 * The degrees a drag of the editor's degrees to `degrees` lands on (owner on #634): up to a half
 * turn, where the arc's ends stay, its middle handle goes onto a field line it comes near (on an
 * arc square to the field), or else its height off the ends' line onto half steps, with a half
 * turn itself a stop. Past a half turn, its middle stays put anyway, so `degrees` as dragged.
 */
export function landedDegrees(
    p: LineParams,
    degrees: number,
    env: ToolEnv,
): number {
    if (degrees > HALF_TURN || !isArcParams(p)) return degrees;
    const { mid, height, way } = middleOff(p, degrees);
    if (!way) return degrees;
    let target: number | null = null;
    if (env.pull !== false && env.fieldLines) {
        const pull = linePull(
            [mid],
            env.fieldLines,
            Math.min(env.pullRadius ?? 0, env.stepPx / 4),
        );
        const SQUARE = 0.999;
        if (Math.abs(way.x) > SQUARE && pull.x !== null)
            target = height + pull.x / way.x;
        else if (Math.abs(way.y) > SQUARE && pull.y !== null)
            target = height + pull.y / way.y;
    }
    const most = middleOff(p, HALF_TURN).height;
    if (target === null) {
        if (!env.snap) return degrees;
        const half = env.stepPx / 2;
        const rounded = Math.max(half, Math.round(height / half) * half);
        target =
            Math.abs(height - most) < Math.abs(height - rounded)
                ? most
                : rounded;
    }
    if (target >= most - 1e-9) return HALF_TURN;
    // Its height grows with its degrees: found by halving
    let low = MIN_BEND;
    let high = HALF_TURN;
    if (target <= middleOff(p, low).height) return low;
    for (let i = 0; i < 48; i++) {
        const at = (low + high) / 2;
        if (middleOff(p, at).height < target) low = at;
        else high = at;
    }
    return (low + high) / 2;
}

/** How near equal the guide's radii stick to a circle, as a share of the larger */
const ROUND_STICK = 0.05;

/**
 * The arc turning `degrees` around its circle or ellipse, which stays where it is (owner on #634):
 * it grows or shrinks evenly from its middle, so in Fit its marchers spread out or close up
 */
export function withSweep(p: LineParams, degrees: number): LineParams {
    const g = arcGuide(p);
    if (!g) return withBend(p, degrees);
    const size = Math.min(MAX_BEND, Math.max(MIN_BEND, Math.abs(degrees)));
    const sweep = ((Math.sign(g.sweep) || 1) * size * Math.PI) / 180;
    if (Math.abs(sweep - g.sweep) < 1e-12) return p;
    const middle = g.start + g.sweep / 2;
    return onGuide(p, { ...g, start: middle - sweep / 2, sweep });
}

/** The handle in the middle of the arc, which stretches it front to back */
export const MIDDLE_KEY = "mid";
/** The arc's ends, as the Line's points: `p0` is the first marcher's end */
export const END_KEYS = ["p0", "p1"] as const;

/** The arc's extent in the guide's own axes, from its center: its ends and every quarter of the
 * way round the guide it passes */
function extentOnAxes(g: ArcGuide): {
    left: number;
    right: number;
    low: number;
    high: number;
} {
    const from = Math.min(g.start, g.start + g.sweep);
    const to = Math.max(g.start, g.start + g.sweep);
    const angles = [from, to];
    const quarter = Math.PI / 2;
    for (let q = Math.ceil(from / quarter); q * quarter <= to; q++)
        angles.push(q * quarter);
    let left = Infinity;
    let right = -Infinity;
    let low = Infinity;
    let high = -Infinity;
    for (const t of angles) {
        const x = g.rx * Math.cos(t);
        const y = g.ry * Math.sin(t);
        left = Math.min(left, x);
        right = Math.max(right, x);
        low = Math.min(low, y);
        high = Math.max(high, y);
    }
    return { left, right, low, high };
}

/**
 * The room the arc takes on the field (owner on #634), in field units on its own axes: how far it
 * reaches side to side (up to a half turn, the distance between its ends) and how deep it is,
 * from its ends' line to its far edge. Null for an arc with no guide.
 */
export function arcFootprint(
    p: LineParams,
): { width: number; depth: number } | null {
    const g = arcGuide(p);
    if (!g) return null;
    const box = extentOnAxes(g);
    return { width: box.right - box.left, depth: box.high - box.low };
}

/** The guide's edge on the arc's ends' side: its back, which a change of depth keeps */
function backOf(g: ArcGuide, box: ReturnType<typeof extentOnAxes>): number {
    return g.ry * Math.sin(g.start + g.sweep / 2) >= 0 ? box.low : box.high;
}

/**
 * The arc on `g` scaled `kx` along its width about `ax` and `ky` along its depth about `ay` (on
 * the guide's axes, from its center), its angles kept
 */
function rescaled(
    base: LineParams,
    g: ArcGuide,
    kx: number,
    ky: number,
    ax: number,
    ay: number,
): LineParams {
    const cx = ax * (1 - kx);
    const cy = ay * (1 - ky);
    const c = Math.cos(g.axis);
    const s = Math.sin(g.axis);
    const center = {
        x: g.center.x + cx * c - cy * s,
        y: g.center.y + cx * s + cy * c,
    };
    return onGuide(base, { ...g, center, rx: g.rx * kx, ry: g.ry * ky });
}

/** `size` on the half-step ladder, no smaller than a half step */
const onHalfSteps = (size: number, stepPx: number) =>
    Math.max(stepPx / 2, Math.round(size / (stepPx / 2)) * (stepPx / 2));

/**
 * The scale the other way follows a change of `scale` with: the same, its size then landed on
 * half steps (`stepPx`) when snapping, so a kept ratio still reads in half steps (owner on #634)
 */
function follower(was: number, scale: number, stepPx: number | null): number {
    if (stepPx === null || !(was > 0)) return scale;
    return onHalfSteps(was * scale, stepPx) / was;
}

/**
 * The arc with its footprint ({@link arcFootprint}) `size` across one way (`width` or depth), as
 * typed or dragged in the editor: a width about its middle, a depth about its ends' line. With
 * `keep` the other way follows in proportion, landed on half steps when `stepPx` is given.
 */
export function withFootprint(
    base: LineParams,
    width: boolean,
    size: number,
    keep: boolean,
    stepPx: number | null,
): LineParams {
    const g = arcGuide(base);
    if (!g || !(size > 0)) return base;
    const box = extentOnAxes(g);
    const was = width ? box.right - box.left : box.high - box.low;
    const other = width ? box.high - box.low : box.right - box.left;
    if (!(was > 0)) return base;
    const scale = size / was;
    const then = keep ? follower(other, scale, stepPx) : 1;
    const middle = (box.left + box.right) / 2;
    const back = backOf(g, box);
    return width
        ? rescaled(base, g, scale, then, middle, back)
        : rescaled(base, g, then, scale, middle, back);
}

/**
 * One of the arc's handles dragged to `to` (owner on #634), stretching the arc as a box's handles
 * do, its sweep kept: an end stretches it side to side along its width, the middle front to back
 * along its depth. The opposite side of the arc stays put, or with `fromCenter` the circle's
 * center; `constrain` keeps its proportions. Sizes land on half steps across with the ladder on,
 * and stick to a circle within {@link ROUND_STICK}. Stretched one way only, a circle becomes an
 * ellipse.
 */
export function stretchArc(
    base: LineParams,
    key: string,
    to: XY,
    env: ToolEnv,
): LineParams {
    const g = arcGuide(base);
    if (!g) return base;
    const end = (END_KEYS as readonly string[]).indexOf(key);
    if (end < 0 && key !== MIDDLE_KEY) return base;
    const width = end >= 0;
    const box = extentOnAxes(g);
    const local = onAxes(g, to);
    const handle = onAxes(
        g,
        width
            ? guidePoint(g, end === 0 ? g.start : g.start + g.sweep)
            : guidePoint(g, g.start + g.sweep / 2),
    );
    // The side that stays: across from the handle, or the circle's center
    const along = (q: XY) => (width ? q.x : q.y);
    const far = env.fromCenter
        ? 0
        : along(handle) >= 0
          ? width
              ? box.left
              : box.low
          : width
            ? box.right
            : box.high;
    const reach = along(handle) - far;
    if (Math.abs(reach) < 1e-9) return base;
    // The handle pulled onto a field line it comes near, as a box's edge is (#425): a yard line
    // for an end, a hash or sideline for the middle, on an arc square to the field
    const pulled = pullAlong(g, width, handle, local, env);
    const k = ((pulled ?? along(local)) - far) / reach;
    // The arc's footprint that way, landed on half steps unless the handle's on a line
    const was = width ? box.right - box.left : box.high - box.low;
    const other = width ? box.high - box.low : box.right - box.left;
    if (!(was > 0)) return base;
    let size = Math.max(env.stepPx / 2, was * k);
    if (env.snap && pulled === null) size = onHalfSteps(size, env.stepPx);
    let scale = size / was;
    // The ratio lock, flipped by constrain for the drag (as a box's side is)
    const keep = env.sizesLocked ?? env.constrain;
    const then = keep
        ? follower(other, scale, env.snap ? env.stepPx : null)
        : 1;
    // Near a circle, it sticks to one
    const rx = g.rx * (width ? scale : then);
    const ry = g.ry * (width ? then : scale);
    if (
        !keep &&
        pulled === null &&
        Math.abs(rx - ry) <= ROUND_STICK * Math.max(rx, ry)
    ) {
        if (width) scale = ry / g.rx;
        else scale = rx / g.ry;
    }
    // Scaled about the side that stays: along the handle's way about `far`; the other way (kept
    // in proportion) about the arc's back, so a stretched arc keeps its ends' line
    const otherFar = env.fromCenter || !width ? 0 : backOf(g, box);
    return width
        ? rescaled(base, g, scale, then, far, otherFar)
        : rescaled(base, g, then, scale, otherFar, far);
}

/**
 * Where along its way (on the guide's axes) a handle at `handle`, dragged to `local`, lands when
 * the field line nearest it is within reach: null when none is, the pulls are off, or the arc is
 * turned off the field's axes (its handle then moves slantwise across the lines)
 */
function pullAlong(
    g: ArcGuide,
    width: boolean,
    handle: XY,
    local: XY,
    env: ToolEnv,
): number | null {
    if (env.pull === false || !env.fieldLines) return null;
    const c = Math.cos(g.axis);
    const s = Math.sin(g.axis);
    // The handle's way on the field, and where it is with the pointer's reach
    const way = width ? { x: c, y: s } : { x: -s, y: c };
    const at = width ? local.x : local.y;
    const off = width ? handle.y : handle.x;
    const ax = width ? at : off;
    const ay = width ? off : at;
    const raw = {
        x: g.center.x + ax * c - ay * s,
        y: g.center.y + ax * s + ay * c,
    };
    const pull = linePull(
        [raw],
        env.fieldLines,
        Math.min(env.pullRadius ?? 0, env.stepPx / 4),
    );
    const SQUARE = 0.999;
    if (Math.abs(way.x) > SQUARE && pull.x !== null) return at + pull.x / way.x;
    if (Math.abs(way.y) > SQUARE && pull.y !== null) return at + pull.y / way.y;
    return null;
}

/** How near 1 a stretch reads as a circle */
const ROUND = 1e-6;

/**
 * How stretched the arc's circle is (owner on #634): its ellipse's depth over its width, 1 on a
 * circle, over 1 deeper than wide and under 1 wider than deep. Null for an arc with no guide.
 */
export function arcStretch(p: LineParams): number | null {
    const g = arcGuide(p);
    return g ? g.ry / g.rx : null;
}

/** Whether the arc runs on a circle rather than an ellipse */
export const isRound = (p: LineParams): boolean => {
    const s = arcStretch(p);
    return s !== null && Math.abs(s - 1) <= ROUND;
};

/**
 * The arc on an ellipse stretched `stretch` (depth over width; 1 a circle), its degrees kept
 * (owner on #634): up to a half turn its ends stay too, so only its depth changes; past it the
 * guide's width stays and its depth grows or shrinks from the arc's back.
 */
export function withStretch(p: LineParams, stretch: number): LineParams {
    const g = arcGuide(p);
    if (!g || !(stretch > 0)) return p;
    const now = g.ry / g.rx;
    if (Math.abs(now - stretch) <= ROUND) return p;
    if (Math.abs(bendOf(p)) <= HALF_TURN) {
        const [a, b] = p.points as [LinePoint, LinePoint];
        const { ellipse: _was, ...first } = a;
        const round = Math.abs(stretch - 1) <= ROUND;
        const axis = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
        const point: LinePoint = round
            ? first
            : { ...first, ellipse: { ratio: stretch, axis } };
        return { ...p, points: [point, b] };
    }
    const box = extentOnAxes(g);
    const k = stretch / now;
    // On a circle exactly, the arc drops its ellipse (onGuide)
    return rescaled(p, g, 1, k, 0, backOf(g, box));
}

/** An arc drawn from `from` to `to`: its ends landed as a Line's, bowing a quarter turn left */
export function drawArc(
    from: XY,
    to: XY,
    env: ToolEnv,
): LineParams | undefined {
    const line = drawLine(from, to, env);
    if (!line) return undefined;
    // A Line's diagonal yard-to-yard measure is for straight lines
    const { measured: _measured, ...rest } = line;
    return withBend(rest, DRAWN_BEND);
}

/** An arc across `frame` (another shape turned into an Arc): its width, as a half circle */
export function arcInFrame(
    frame: ShapeFrame,
    n: number,
    env: ToolEnv,
): LineParams {
    return withBend(lineInFrame(frame, n, env), 180);
}

/** The readout for a sweep: "90°" */
export const formatBend = (degrees: number): string =>
    `${Math.round(Math.abs(degrees) * 10) / 10}°`;

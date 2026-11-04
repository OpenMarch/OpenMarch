import {
    DEGREE,
    fieldToFrame,
    frameToField,
    normalizeAngle,
    pivotAt,
    pivotPoint,
    snapRotation,
    type Pivot,
    type ShapeFrame,
} from "../frame/frame";
import { linePull } from "../frame/edgeGuides";
import { pivotOf } from "../frame/pivot";
import { catmullRomSpan } from "../geometry/catmullRom";
import { makePath, type Path, type Segment } from "../geometry/path";
import { cross, dot, lerp } from "../geometry/vec";
import { chordOffsets, groupGaps, layGroups } from "../spacing";
import { falsePosition, secantFrom } from "../solve";
import {
    canLayOut,
    storedDistribution,
    type Distribution,
} from "../distribute/distribution";
import type { ToolEnv } from "../tool/toolKind";
import type { Slot, XY } from "../types";

/**
 * A Line as the shape host draws it (#523, #524, #525, spec #522): points the line passes through,
 * and how its marchers are spaced along it: by one interval, or by groups of marchers at their own
 * intervals (#526). A point with no tension is a corner, where the line turns sharply; a point with
 * tension is smooth, and the line bends through it (centripetal Catmull-Rom, the tension scaling
 * its handles). Every corner holds a marcher unless the corners switch is off; a smooth point
 * between the ends never does, and the two ends always hold one, smooth or not. A closed line
 * (#529) joins its last point to its first and runs smoothly round through a smooth first point;
 * it can be filled like a box (`lineFill.ts`). Everything here is pure.
 */

/**
 * A point the line passes through. Tension 0 is a corner; above 0 a smooth point, 1 the plain
 * Catmull-Rom curve, more rounder (up to {@link MAX_TENSION})
 */
export interface LinePoint extends XY {
    readonly tension: number;
    /**
     * Whether a marcher stands on this point whatever the line's corners switch says (#569): true
     * always one, false none forced here, so the intervals run straight through. Absent: as the
     * line ({@link holdsMarcher}). An open line's ends always hold one.
     */
    readonly marcher?: boolean;
    /**
     * The segment from this point to the next bent as a circular arc (the Arc, #634): its sweep in
     * degrees, signed as the path's arcs are (positive turns toward +y), more than -360 and less
     * than 360. Absent (or 0) where the segment is straight or follows the points' tension.
     */
    readonly bend?: number;
    /**
     * The bent segment on an ellipse rather than a circle (#634): its depth over its width
     * (`ratio`, never 1) and the way its width axis points (`axis`, degrees clockwise from the
     * field's x axis). The bend is then the angle around the ellipse. Only with a bend.
     */
    readonly ellipse?: LineEllipse;
}

/** An ellipse a bent segment runs on ({@link LinePoint.ellipse}) */
export interface LineEllipse {
    readonly ratio: number;
    readonly axis: number;
}

/** The tension a point made smooth starts with: the plain Catmull-Rom curve (#525) */
export const SMOOTH = 1;
/** The roundest a point can be */
export const MAX_TENSION = 2;

/**
 * A run of marchers at one interval (spec #522, "Mixed intervals"). `count` absent is "the rest",
 * at most one group in a list; with a single group, every gap is `interval`. How the groups share
 * the marchers is `layGroups` (`spacing.ts`).
 */
export interface LineGroup {
    /** Field units between neighbors, as the line measures them ({@link LineParams.measured}) */
    readonly interval: number;
    /** Marchers in the group, a whole number from 1; absent for the rest */
    readonly count?: number;
}

/** Where a run sits on a longer drawn line (Interval on the path) */
export type LineAnchor = "start" | "center" | "end";

/**
 * How the marchers are spaced (docs/timeline/research/shapes/05-interval-modes.md):
 *
 * - `fit` (the interval unlocked): the line as drawn, the interval worked out from it. `groups`
 *   is the interval last typed, only where the line started from (a drag changes the interval);
 *   with mixed groups (#526) their proportions, scaled to fit the drawn line;
 * - `keep` (Keep interval, the interval locked): the interval fixed, the line's length following
 *   from its pivot;
 * - `path` (Interval on the path): both fixed, the run laid on the drawn line from `anchor`.
 */
export type LineSpacing =
    | { readonly mode: "fit"; readonly groups?: readonly LineGroup[] }
    | { readonly mode: "keep"; readonly groups: readonly LineGroup[] }
    | {
          readonly mode: "path";
          readonly groups: readonly LineGroup[];
          readonly anchor: LineAnchor;
      };

/**
 * An axis an interval can measure (spec #522, "Measured"): `x` (↔) is how far neighbors are apart
 * side to side, `y` (↕) front to back
 */
export type LineMeasured = "x" | "y";

/**
 * What an interval measures ({@link LineParams.measured}): along the path when absent, `straight`
 * straight across from marcher to marcher, an axis, or `offset` (rise over run, {@link
 * LineParams.offset})
 */
export type LineMeasure = LineMeasured | "straight" | "offset";

export interface LineParams {
    /** In order from the first marcher's end; two or more */
    readonly points: readonly LinePoint[];
    /**
     * A closed line joins its last point to its first (#529): its marchers have a gap on every
     * stretch, n gaps for n marchers, and it can be filled like a box. Open when absent.
     */
    readonly closed?: boolean;
    readonly spacing: LineSpacing;
    /**
     * False: the intervals run around the corners. Absent (or true): every corner holds a marcher
     * (#524)
     */
    readonly corners?: boolean;
    /**
     * How a closed line is filled, the host's (ADR 0006, amendment of 2026-10-22): Outline (the
     * line itself) when absent. Only on a closed line.
     */
    readonly distribution?: Distribution;
    /**
     * What every interval measures (#527, ADR 0006's Line amendment): along the path (its arc
     * length) when absent; `straight` straight across from marcher to marcher, except that a gap
     * goes on from a corner holding no marcher rather than cutting past it ({@link acrossOf}); `x`
     * (↔) side to side and `y` (↕) front to back; `offset` both at once, {@link offset} from each
     * marcher to the next
     */
    readonly measured?: LineMeasure;
    /**
     * Measured `offset` (rise over run): how far each marcher is from the one before it, side to
     * side (`x`) and front to back (`y`), in field units, signed from the first point on. Only on
     * a one-segment open line with one interval for everyone ({@link offsetOf}); stored with
     * `measured: "offset"` and only with it, and kept while the line has more points, which lay
     * it out along the path until it's one segment again. In Keep interval the line is `n − 1`
     * offsets long; in Fit it's where the line started from, the drawn line giving the offset.
     */
    readonly offset?: XY;
    /**
     * How far the whole line has been turned since it was drawn, in degrees clockwise from 0 up to
     * 360 (ADR 0006, decision 10): what the editor's turn reads, so a line reads 0° as drawn
     * whichever way it was drawn. Only turning the whole shape changes it (the knob, the degrees,
     * ⟳); editing its points never does. Absent is 0, so a Line saved before reads 0° as it is.
     */
    readonly turn?: number;
}

/** Whether `p` joins its last point to its first */
export const isClosed = (p: Pick<LineParams, "closed">): boolean =>
    p.closed === true;

const FIT: LineSpacing = { mode: "fit" };

const halfStep = (env: Pick<ToolEnv, "stepPx">) => env.stepPx / 2;
const sub = (a: XY, b: XY): XY => ({ x: a.x - b.x, y: a.y - b.y });
const length = (d: XY) => Math.hypot(d.x, d.y);
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const corner = ({ x, y }: XY): LinePoint => ({ x, y, tension: 0 });
const withTension =
    (tension: number) =>
    ({ x, y }: XY): LinePoint => ({ x, y, tension });

/** A point's own fields: anything else is a later build's (ADR 0006, decision 5) */
const POINT_KEYS = new Set(["x", "y", "tension", "marcher", "bend", "ellipse"]);

const isPoint = (q: unknown): q is LinePoint =>
    typeof q === "object" &&
    q !== null &&
    Object.keys(q).every((key) => POINT_KEYS.has(key)) &&
    ((q as LinePoint).marcher === undefined ||
        typeof (q as LinePoint).marcher === "boolean") &&
    Number.isFinite((q as LinePoint).x) &&
    Number.isFinite((q as LinePoint).y) &&
    Number.isFinite((q as LinePoint).tension) &&
    (q as LinePoint).tension >= 0 &&
    (q as LinePoint).tension <= MAX_TENSION &&
    isBend((q as LinePoint).bend) &&
    isEllipse((q as LinePoint).ellipse, (q as LinePoint).bend);

/** A stored ellipse: absent, or on a bent segment with a finite ratio other than 1 and an axis */
const isEllipse = (e: unknown, bend: unknown): boolean => {
    if (e === undefined) return true;
    if (typeof e !== "object" || e === null || bend === undefined) return false;
    if (Object.keys(e).some((key) => key !== "ratio" && key !== "axis"))
        return false;
    const { ratio, axis } = e as LineEllipse;
    return (
        Number.isFinite(ratio) &&
        ratio > 0 &&
        Math.abs(ratio - 1) > 1e-9 &&
        Number.isFinite(axis)
    );
};

/** A stored bend: absent, or a finite sweep short of a full turn either way */
const isBend = (b: unknown): boolean =>
    b === undefined ||
    (typeof b === "number" && Number.isFinite(b) && Math.abs(b) < 360);

/** Whether point `q`'s segment to the next bends as a circular arc */
export const bends = (q: Pick<LinePoint, "bend">): boolean =>
    q.bend !== undefined && Math.abs(q.bend) > 1e-9;

const isGroup = (g: unknown): g is LineGroup => {
    if (typeof g !== "object" || g === null) return false;
    // Nothing a newer build adds to a group is read past (ADR 0006, decision 5)
    if (Object.keys(g).some((key) => key !== "interval" && key !== "count"))
        return false;
    const { interval, count } = g as LineGroup;
    if (!Number.isFinite(interval) || !(interval > 0)) return false;
    return count === undefined || (Number.isInteger(count) && count >= 1);
};

const ANCHORS: readonly unknown[] = ["start", "center", "end"];
const MEASURES: readonly unknown[] = ["straight", "x", "y", "offset"];

/** A stored offset: two finite numbers, not both nought */
const isOffset = (o: unknown): o is XY => {
    if (typeof o !== "object" || o === null) return false;
    if (Object.keys(o).some((key) => key !== "x" && key !== "y")) return false;
    const { x, y } = o as XY;
    return (
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        (Math.abs(x) > 1e-9 || Math.abs(y) > 1e-9)
    );
};

/** A list of groups as stored: one or more, at most one of them the rest (#526) */
const isGroupList = (groups: unknown): groups is LineGroup[] =>
    Array.isArray(groups) &&
    groups.length > 0 &&
    groups.every(isGroup) &&
    (groups as LineGroup[]).filter((g) => g.count === undefined).length <= 1;
// `pivot` is the host's (ADR 0006, amendment of 2026-10-20), stored beside the kind's own numbers
const KEYS = new Set([
    "points",
    "closed",
    "spacing",
    "corners",
    "distribution",
    "measured",
    "offset",
    "turn",
    "pivot",
]);

/** A stored turn: degrees from 0 up to 360 */
const isTurn = (t: unknown): t is number =>
    typeof t === "number" && Number.isFinite(t) && t >= 0 && t < 360;

/**
 * Whether `params` is a line this version can lay out exactly as it was saved. Anything a newer
 * build adds is refused, so the recipe shows as plain positions instead of being misread and
 * rewritten on the first edit (ADR 0006, decision 5). Each later ticket widens this as it adds
 * the layout.
 */
export function isLineParams(params: unknown): params is LineParams {
    if (typeof params !== "object" || params === null) return false;
    if (Object.keys(params).some((key) => !KEYS.has(key))) return false;
    const p = params as Partial<LineParams>;
    if (p.closed !== undefined && typeof p.closed !== "boolean") return false;
    if (p.corners !== undefined && typeof p.corners !== "boolean") return false;
    if (p.measured !== undefined && !MEASURES.includes(p.measured))
        return false;
    // An offset only measured as one, and always with it
    if ((p.measured === "offset") !== (p.offset !== undefined)) return false;
    if (p.offset !== undefined && !isOffset(p.offset)) return false;
    if (p.turn !== undefined && !isTurn(p.turn)) return false;
    // A closed line has three points, or two joined by a bent segment (an Arc's chord or circle)
    if (
        !Array.isArray(p.points) ||
        p.points.length <
            (p.closed && !p.points.some((q) => isPoint(q) && bends(q)) ? 3 : 2)
    )
        return false;
    // A closed line's fill (#529): one this version fills, and never on an open line
    if (p.distribution !== undefined) {
        if (p.closed !== true) return false;
        if (!storedDistribution(p, 1) || !canLayOut(p)) return false;
    }
    if (!p.points.every(isPoint)) return false;
    const spacing: unknown = p.spacing;
    if (typeof spacing !== "object" || spacing === null) return false;
    const sp = spacing as {
        mode?: unknown;
        groups?: unknown;
        anchor?: unknown;
    };
    // Only the fields its mode has: anything else is a newer build's (ADR 0006, decision 5)
    const spacingKeys =
        sp.mode === "path" ? ["mode", "groups", "anchor"] : ["mode", "groups"];
    if (Object.keys(spacing).some((key) => !spacingKeys.includes(key)))
        return false;
    // Fit's groups, where the line started from, are optional
    if (sp.mode === "fit")
        return sp.groups === undefined || isGroupList(sp.groups);
    if (sp.mode !== "keep" && sp.mode !== "path") return false;
    // Mixed intervals (#526): any groups, at most one of them the rest
    if (!isGroupList(sp.groups)) return false;
    if (sp.mode === "keep") return true;
    // A closed line has no ends to lay a run from
    return !p.closed && ANCHORS.includes(sp.anchor);
}

/**
 * The line's segments, from each point to the next: straight where it doesn't bend, else a cubic
 * whose handles are the Catmull-Rom curve's at each smooth point, scaled by its tension (none at a
 * corner). A closed line's last runs from its last point to its first, its curve's neighbors
 * wrapping round (#529).
 */
export function lineSegments(p: LineParams): Segment[] {
    const points = p.points;
    const closed = isClosed(p);
    const count = closed ? points.length : points.length - 1;
    return Array.from({ length: count }, (_, i): Segment => {
        const a = points[i]!;
        const b = points[(i + 1) % points.length]!;
        if (bends(a))
            return a.ellipse
                ? ellipseSegment(a, b, a.bend!, a.ellipse)
                : bentSegment(a, b, a.bend!);
        const line: Segment = { type: "line", a, b };
        if (a.tension === 0 && b.tension === 0) return line;
        const full = catmullRomSpan(points, i, closed);
        const c1 = lerp(a, full.c1, a.tension);
        const c2 = lerp(b, full.c2, b.tension);
        // Handles along the segment and inside it (an end beside a corner) bend nothing
        const d = sub(b, a);
        const l2 = dot(d, d);
        const along = (c: XY) => {
            const t = dot(sub(c, a), d);
            return (
                Math.abs(cross(d, sub(c, a))) <= 1e-9 * l2 && t >= 0 && t <= l2
            );
        };
        return along(c1) && along(c2) ? line : { type: "cubic", a, c1, c2, b };
    });
}

/**
 * The circular arc from `a` to `b` turning through `degrees` (signed as the path's arcs): its
 * center on the chord's perpendicular, a half turn's center the chord's midpoint. Straight when
 * `a` and `b` are one point.
 */
export function bentSegment(a: XY, b: XY, degrees: number): Segment {
    const d = sub(b, a);
    const chord = Math.hypot(d.x, d.y);
    const sweep = (degrees * Math.PI) / 180;
    if (chord < 1e-9 || Math.abs(sweep) < 1e-9)
        return { type: "line", a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } };
    const u = { x: d.x / chord, y: d.y / chord };
    const normal = { x: -u.y, y: u.x };
    const away = chord / 2 / Math.tan(sweep / 2);
    const center = {
        x: (a.x + b.x) / 2 + normal.x * away,
        y: (a.y + b.y) / 2 + normal.y * away,
    };
    const r = chord / 2 / Math.abs(Math.sin(sweep / 2));
    return {
        type: "arc",
        center,
        r,
        start: Math.atan2(a.y - center.y, a.x - center.x),
        sweep,
    };
}

/** A point into the space where `ellipse` is a circle: turned to its axis, its depth stretched */
function intoCircle(p: XY, ellipse: LineEllipse): XY {
    const angle = (-ellipse.axis * Math.PI) / 180;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return { x: p.x * c - p.y * s, y: (p.x * s + p.y * c) / ellipse.ratio };
}

/** A point from the space where `ellipse` is a circle back onto the field */
function outOfCircle(p: XY, ellipse: LineEllipse): XY {
    const angle = (ellipse.axis * Math.PI) / 180;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const y = p.y * ellipse.ratio;
    return { x: p.x * c - y * s, y: p.x * s + y * c };
}

/**
 * The arc of `ellipse` from `a` to `b` turning through `degrees` around it: the circular arc
 * through them where the ellipse is a circle ({@link intoCircle}), stretched back
 */
export function ellipseSegment(
    a: XY,
    b: XY,
    degrees: number,
    ellipse: LineEllipse,
): Segment {
    const round = bentSegment(
        intoCircle(a, ellipse),
        intoCircle(b, ellipse),
        degrees,
    );
    if (round.type !== "arc")
        return { type: "line", a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } };
    return {
        type: "ellipse",
        center: outOfCircle(round.center, ellipse),
        rx: round.r,
        ry: round.r * ellipse.ratio,
        rotation: (ellipse.axis * Math.PI) / 180,
        start: round.start,
        sweep: round.sweep,
    };
}

/** The path through the line's points, round to its first again when closed */
export function linePath(p: LineParams): Path {
    return makePath(lineSegments(p), isClosed(p));
}

/** How many gaps `n` marchers have along the line: one per marcher on a closed line (#529) */
export const gapCount = (p: LineParams, n: number): number =>
    isClosed(p) ? n : n - 1;

/** Whether any point of the line is smooth */
const smooth = (p: LineParams) =>
    p.points.some((q) => q.tension > 0 || bends(q));

/** How many pieces a curved segment of a closed outline is cut into */
const CURVE_PIECES = 32;

/**
 * The points a stretch of the line can be drawn through: its points when it's straight from point
 * to point, else about 24 a segment along its curves. A closed line's go once round, the last
 * not repeating the first ({@link closedOutline}).
 */
export function lineOutline(p: LineParams): XY[] {
    if (isClosed(p)) return closedOutline(p).points;
    if (!smooth(p)) return p.points.map(({ x, y }) => ({ x, y }));
    const path = linePath(p);
    // An arc (#634) can be large and round all the way: drawn finer so it never shows corners
    const pieces = p.points.some(bends) ? 120 : 24 * (p.points.length - 1);
    return path.polyline(path.length / pieces);
}

/**
 * A closed line's outline as a polygon (#529): every point, and along each curved segment
 * {@link CURVE_PIECES} pieces of it, so a region filled from it follows the curve as drawn.
 * `corners` are the indices in `points` of the line's corners (tension 0).
 */
export function closedOutline(p: LineParams): {
    readonly points: XY[];
    readonly corners: number[];
} {
    const points: XY[] = [];
    const corners: number[] = [];
    lineSegments(p).forEach((segment, i) => {
        if (p.points[i]!.tension === 0) corners.push(points.length);
        const { x, y } = p.points[i]!;
        points.push({ x, y });
        if (segment.type === "line") return;
        const path = makePath([segment]);
        // An arc (#634) bends all the way along: cut finer, so a large one shows no corners
        const pieces = bends(p.points[i]!) ? 4 * CURVE_PIECES : CURVE_PIECES;
        for (let k = 1; k < pieces; k++)
            points.push(path.at((path.length * k) / pieces));
    });
    return { points, corners };
}

/** Where segment `index`'s midpoint handle sits: halfway along it, on its curve */
export function segmentMidpoint(p: LineParams, index: number): XY {
    const segment = lineSegments(p)[index]!;
    const path = makePath([segment]);
    return path.at(path.length / 2);
}

/**
 * Whether point `index` holds a marcher, in a line whose held points do (Fit and Keep interval,
 * {@link cornerGaps}): an open line's ends always; a point with its own answer (#569) as it says,
 * so one can opt out of the corners switch or in with it off; any other point when it's a corner
 * and the switch is on. A smooth point holds none unless it says so.
 */
export function holdsMarcher(p: LineParams, index: number): boolean {
    const q = p.points[index];
    if (!q) return false;
    const last = p.points.length - 1;
    if (!isClosed(p) && (index === 0 || index === last)) return true;
    if (q.marcher !== undefined) return q.marcher;
    return q.tension === 0 && p.corners !== false;
}

/**
 * The stretches between the points that hold a marcher (#524, #525, #569,
 * {@link holdsMarcher}): from an end or a held point to the next, the points that hold none
 * inside them. `from` and `to` are point indices. A closed line's run from held point to held
 * point round from its first, the last back past its first point to that one (`to` counting on
 * past the last point, #529); with none, one stretch from its first point all the way round.
 */
export function lineStretches(
    p: LineParams,
): { readonly from: number; readonly to: number }[] {
    const count = p.points.length;
    if (isClosed(p)) {
        const held = p.points.flatMap((_, i) =>
            holdsMarcher(p, i) ? [i] : [],
        );
        if (held.length === 0) return [{ from: 0, to: count }];
        return held.map((from, k) => ({
            from,
            to: held[k + 1] ?? held[0]! + count,
        }));
    }
    const last = count - 1;
    const stretches: { from: number; to: number }[] = [];
    let from = 0;
    for (let i = 1; i <= last; i++) {
        if (!holdsMarcher(p, i)) continue;
        stretches.push({ from, to: i });
        from = i;
    }
    return stretches;
}

/** Each stretch's path, in order; a closed line's segments taken round past its last */
function stretchPaths(p: LineParams): Path[] {
    const segments = lineSegments(p);
    return lineStretches(p).map(({ from, to }) =>
        makePath(
            Array.from(
                { length: to - from },
                (_, i) => segments[(from + i) % segments.length]!,
            ),
        ),
    );
}

/** Each stretch's {@link acrossOf}, in order */
function stretchAcross(p: LineParams): (number[] | null)[] {
    const segments = lineSegments(p);
    return lineStretches(p).map(({ from, to }) =>
        acrossOf(
            p,
            from,
            Array.from(
                { length: to - from },
                (_, i) => segments[(from + i) % segments.length]!,
            ),
        ),
    );
}

/**
 * How a gap is measured on a run of `segments` of the line, from its point `from` (#527): null
 * along the path, by arc length (the line's default); measured `straight`, the offsets along the
 * run of the corners on it (its points of tension 0 between its ends, none holding a marcher
 * there), from which a gap goes on straight across ({@link chordOffsets}). A run of
 * straight segments is null either way: straight across within a segment is its arc, and a gap
 * reaching past a corner goes round it. So straight across differs from along the path only on a
 * curve, and never skips a corner.
 */
function acrossOf(
    p: LineParams,
    from: number,
    segments: readonly Segment[],
): number[] | null {
    if (p.measured !== "straight") return null;
    if (segments.every((segment) => segment.type === "line")) return null;
    const bends: number[] = [];
    let at = 0;
    segments.forEach((segment, k) => {
        if (k > 0 && p.points[(from + k) % p.points.length]!.tension === 0)
            bends.push(at);
        at += makePath([segment]).length;
    });
    return bends;
}

/** The whole line's {@link acrossOf}, from its first point */
const lineAcross = (p: LineParams) => acrossOf(p, 0, lineSegments(p));

/**
 * Where neighbors `gaps` apart go along `path`, from `from`: along the path when `across` is
 * null, else straight across past none of its bends ({@link acrossOf})
 */
const offsetsOn = (
    path: Path,
    from: number,
    gaps: readonly number[],
    across: readonly number[] | null,
): number[] =>
    across ? chordOffsets(path, from, gaps, across) : offsetsOf(gaps, from);

/** Whether `path` runs straight from end to end */
const straight = (path: Path) =>
    length(sub(path.at(path.length), path.at(0))) >= path.length * (1 - 1e-9);

/**
 * The scales, as shares of the arc's, that {@link fitScale} steps up through from nought straight
 * across, for the first that reaches the end: quarters, then 32nds from three quarters on, where
 * it nearly always is. Each is where halving from nought to the arc's share goes while it falls
 * short, or between two of those.
 */
const FIT_LADDER = [
    1 / 4,
    1 / 2,
    ...Array.from({ length: 8 }, (_, i) => 3 / 4 + i / 32),
];

/**
 * How narrow, as a share of the arc's, {@link fitScale} halves the step it's reached in before it
 * finishes by false position
 */
const FIT_HALVED = 2 ** -16;

/**
 * How much `gaps`, in order, must be scaled to reach exactly from one end of `path` to the other:
 * the length over their sum along the path, and found by search straight across (`across`) on a
 * curve
 */
function fitScale(
    path: Path,
    gaps: readonly number[],
    across: readonly number[] | null,
): number {
    const whole = sum(gaps);
    if (!(whole > 0) || !(path.length > 0)) return 0;
    const arc = path.length / whole;
    // A chord is as long as its arc only on a straight stretch
    if (!across || straight(path)) return arc;
    const reach = (k: number) =>
        chordOffsets(
            path,
            0,
            gaps.map((gap) => gap * k),
            across,
        ).at(-1)!;
    // Each chord reaches at least its own length along, so the arc's share reaches the end. Where
    // the path curls back, the reach can rise past the end and fall short again as the scale grows,
    // so more than one scale reaches the end. The smallest is taken, every time, so a line lays out
    // the same however it got there: stepped up to from below ({@link FIT_LADDER}), halved within
    // the step it's reached in, where layouts before #596 halved too (so they lay out the same),
    // and false position (Illinois) finishes it in a few layouts, where halving all the way takes
    // over thirty (each a walk along the whole path)
    const g = (k: number) => reach(k) - path.length;
    let lo = 0;
    let atLo = -path.length;
    let hi = arc;
    let atHi = Number.NaN;
    for (const share of FIT_LADDER) {
        const k = arc * share;
        const atK = g(k);
        if (atK >= 0) {
            hi = k;
            atHi = atK;
            break;
        }
        lo = k;
        atLo = atK;
    }
    while (hi - lo > arc * FIT_HALVED) {
        const mid = (lo + hi) / 2;
        const atMid = g(mid);
        if (atMid < 0) {
            lo = mid;
            atLo = atMid;
        } else {
            hi = mid;
            atHi = atMid;
        }
    }
    if (Number.isNaN(atHi)) atHi = g(hi);
    // Float noise short of the end at the arc's share, which reaches it
    if (!(atHi >= 0)) return hi;
    return falsePosition(g, lo, atLo, hi, atHi, arc * 1e-10) ?? (lo + hi) / 2;
}

/**
 * The interval at which `gaps` even neighbors reach exactly from one end of `path` to the other,
 * along it or straight across (`across`)
 */
const evenScale = (
    path: Path,
    gaps: number,
    across: readonly number[] | null,
): number =>
    gaps > 0 ? fitScale(path, Array<number>(gaps).fill(1), across) : 0;

/**
 * Neighbors `gaps` apart (scaled to fit, in order), along the path or straight across
 * (`across`), from one end of `path` to the other, tagged from `from`
 */
function runSpots(
    path: Path,
    gaps: readonly number[],
    from: number,
    across: readonly number[] | null,
): Slot[] {
    const k = fitScale(path, gaps, across);
    const offsets = offsetsOn(
        path,
        0,
        gaps.map((gap) => gap * k),
        across,
    );
    // The last on the end exactly, whatever the search left
    offsets[gaps.length] = path.length;
    return offsets.map((s) => ({ ...path.at(s), s: from + s }));
}

/**
 * The middle of the gap between two of the line's spots along it, and its length that way (the
 * group labels' `ToolGroups.along`): null when either spot isn't on the line where its `s` says
 */
export function gapAlong(
    p: LineParams,
    from: Slot,
    to: Slot,
): { at: XY; length: number } | null {
    if (from.s === undefined || to.s === undefined) return null;
    const path = linePath(p);
    const tolerance = Math.max(path.length, 1) * 1e-6;
    const on = (q: Slot) => length(sub(path.at(q.s!), q)) <= tolerance;
    if (!on(from) || !on(to)) return null;
    // A closed line's last gap runs on past its start
    const end = to.s < from.s && path.closed ? to.s + path.length : to.s;
    if (!(end > from.s)) return null;
    return { at: path.at((from.s + end) / 2), length: end - from.s };
}

/**
 * Whether the line is spaced by groups (#526) rather than one interval for everyone: more than
 * one group, or a group with a count
 */
export const hasGroups = (p: LineParams): boolean => {
    const groups = p.spacing.groups;
    return (
        groups !== undefined &&
        (groups.length > 1 || groups[0]!.count !== undefined)
    );
};

/** In Fit with mixed groups (#526), their gaps as typed, before they're scaled to fit; else null */
function fitRawGaps(p: LineParams, n: number): number[] | null {
    if (p.spacing.mode !== "fit" || !hasGroups(p)) return null;
    return groupGapsRound(p, p.spacing.groups!, n);
}

/**
 * How much Fit's mixed groups (#526) are scaled to reach the drawn line from end to end: as the
 * line measures them, one factor for the whole line (a cornered line's stretches each fit their
 * own, {@link cornerSpots})
 */
function fitGroupScale(p: LineParams, raw: readonly number[]): number {
    const axis = measuredAxis(p);
    if (axis) return axisLength(p, axis) / sum(raw);
    const k = runScale(p, raw);
    return k > 0 ? 1 / k : 1;
}

/**
 * The interval a typed spacing keeps, in field units, the smallest of its groups' when it has
 * several; null in Fit
 */
export function typedInterval(p: LineParams): number | null {
    if (p.spacing.mode === "fit") return null;
    return Math.min(...p.spacing.groups.map((g) => g.interval));
}

/**
 * The gaps between the `n` marchers in a typed spacing, in field units, in order from the first
 * point; null in Fit. A closed line's run goes once round (#529): its last gap, from the last
 * marcher back to the first, is the seam between the last group and the first.
 */
export function lineGaps(p: LineParams, n: number): number[] | null {
    const raw = fitRawGaps(p, n);
    if (raw) {
        const k = fitGroupScale(p, raw);
        return raw.map((gap) => gap * k);
    }
    if (p.spacing.mode === "fit") return null;
    return groupGapsRound(p, p.spacing.groups, n);
}

/** The gaps `groups` give `n` marchers, a closed line's seam back to the first included */
function groupGapsRound(
    p: LineParams,
    groups: readonly LineGroup[],
    n: number,
): number[] {
    const gaps = groupGaps(groups, n, (g) => g.interval);
    if (!isClosed(p) || n < 2) return gaps;
    const laid = layGroups(groups, n);
    const first = groups[laid.findIndex((g) => g.count > 0)]!;
    const last = groups[laid.findLastIndex((g) => g.count > 0)]!;
    return [...gaps, Math.max(first.interval, last.interval)];
}

const coord = (q: XY, axis: LineMeasured) => (axis === "x" ? q.x : q.y);

/**
 * How the drawn line moves along `axis`, step by step from its first point: each straight segment
 * one step, each curve sampled finely (`line` false)
 */
function axisSteps(
    p: LineParams,
    axis: LineMeasured,
): { readonly d: number; readonly line: boolean }[] {
    return lineSegments(p).flatMap(
        (segment): { d: number; line: boolean }[] => {
            if (segment.type === "line")
                return [
                    {
                        d: coord(segment.b, axis) - coord(segment.a, axis),
                        line: true,
                    },
                ];
            const path = makePath([segment]);
            const points = path.polyline(path.length / 32);
            return points.slice(1).map((q, i) => ({
                d: coord(q, axis) - coord(points[i]!, axis),
                line: false,
            }));
        },
    );
}

/**
 * Why the line can't be measured along `axis` (↔ or ↕), or null when it can: over its whole drawn
 * path (curves sampled) it has to keep going one way that way, so each spot has one place on it.
 * `none`: it doesn't go that way at all; `turns`: it turns back; `square`: a straight part of it
 * stands still that way (runs square to it).
 */
export function measuredBlock(
    p: LineParams,
    axis: LineMeasured,
): "none" | "turns" | "square" | null {
    const steps = axisSteps(p, axis);
    if (steps.every(({ d }) => Math.abs(d) < 1e-9)) return "none";
    if (p.closed) return "turns";
    const on = steps.some(({ d }) => d > 1e-9);
    const back = steps.some(({ d }) => d < -1e-9);
    if (on && back) return "turns";
    return steps.some(({ d, line }) => line && Math.abs(d) < 1e-9)
        ? "square"
        : null;
}

/**
 * The axis the line's intervals measure as it's laid out: its Measured setting's, or null when it
 * has none (along the path, or straight across) or the line no longer goes one way along it (a
 * part turned square), which is laid out along the path
 */
export function measuredAxis(p: LineParams): LineMeasured | null {
    return (p.measured === "x" || p.measured === "y") &&
        measuredBlock(p, p.measured) === null
        ? p.measured
        : null;
}

/**
 * Why the line can't be measured as an offset (rise over run), or null when it can: only a
 * one-segment open line (`segments`), with one interval for everyone (`groups`), and not laid on
 * the path (`path`), which keeps the drawn line's length
 */
export function offsetBlock(
    p: LineParams,
): "segments" | "groups" | "path" | null {
    if (isClosed(p) || p.points.length !== 2) return "segments";
    if (hasGroups(p)) return "groups";
    if (p.spacing.mode === "path") return "path";
    return null;
}

/**
 * The offset the line's marchers are laid out by: its stored {@link LineParams.offset}, or null
 * when it's not measured as one, or can't be now ({@link offsetBlock}), which lays it out along
 * the path
 */
export function offsetOf(p: LineParams): XY | null {
    return p.measured === "offset" && p.offset && offsetBlock(p) === null
        ? p.offset
        : null;
}

/**
 * From each of the `n` marchers to the next, as the line lays them out now: in Keep interval its
 * stored offset while the line is that long (exactly, so spots stay on the grid), else the drawn
 * line's (end to end over its gaps)
 */
export function lineOffset(p: LineParams, n: number): XY {
    const d = sub(p.points.at(-1)!, p.points[0]!);
    if (n <= 1) return d;
    const drawn = { x: d.x / (n - 1), y: d.y / (n - 1) };
    const o = p.offset;
    const near = (a: number, b: number) =>
        Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a));
    return p.spacing.mode === "keep" &&
        o &&
        near(o.x, drawn.x) &&
        near(o.y, drawn.y)
        ? o
        : drawn;
}

/**
 * The pivot a new Line starts at (owner on #596): its leftmost point, so it grows to the right from
 * where it starts and its offset reads from there. On a tie (an upright line) the one nearest the
 * front of the field, lowest on the screen (larger y); then the first. A closed line keeps the
 * center, which its outline turns about. An end is its frame's `w` (the first point) or `e` (the
 * last); a point between them is a free pivot on it.
 */
export function linePivot(p: LineParams): Pivot {
    if (isClosed(p) || p.points.length < 2) return "c";
    const tie = 1e-6;
    let best = 0;
    p.points.forEach((q, i) => {
        const b = p.points[best]!;
        if (q.x < b.x - tie || (Math.abs(q.x - b.x) <= tie && q.y > b.y + tie))
            best = i;
    });
    if (best === 0) return "w";
    if (best === p.points.length - 1) return "e";
    return pivotAt(lineFrame(p), p.points[best]!);
}

/**
 * Which end the line's offset is read from (owner on #596): the one nearer its pivot, its first on
 * a tie (a centered pivot). The first marcher stands there, and each next one is an offset on.
 */
export function offsetStart(p: LineParams): "first" | "last" {
    const at = pivotPoint(lineFrame(p), pivotOf(p));
    const first = length(sub(p.points[0]!, at));
    const last = length(sub(p.points.at(-1)!, at));
    return last < first - 1e-6 ? "last" : "first";
}

/**
 * From the marcher at the line's {@link offsetStart} to the next, as the line lays them out now
 * ({@link lineOffset}, turned round when it starts from its last point), in field units
 */
export function startOffset(p: LineParams, n: number): XY {
    const o = lineOffset(p, n);
    return offsetStart(p) === "last" ? { x: -o.x, y: -o.y } : o;
}

/**
 * The line's first gap from its {@link offsetStart} (the field's step drawing, owner on #596):
 * the marcher there and the next one, or null when it isn't measured as an offset
 */
export function offsetStep(
    p: LineParams,
    n: number,
): { from: XY; to: XY } | null {
    if (!offsetOf(p) || n <= 1) return null;
    const from = offsetStart(p) === "last" ? p.points.at(-1)! : p.points[0]!;
    const o = startOffset(p, n);
    return {
        from: { x: from.x, y: from.y },
        to: { x: from.x + o.x, y: from.y + o.y },
    };
}

/**
 * The line measured as `offset` from each marcher to the next (rise over run): as long as `n`
 * marchers so far apart need, grown from its pivot (or `env.anchor`), its first point then onto
 * the grid when snapping, so every spot is on it with offsets on half steps. In Fit that's where
 * it starts from, as a typed interval is. Unchanged where an offset can't measure it.
 */
export function withOffset(
    p: LineParams,
    n: number,
    offset: XY,
    env: SizeEnv,
): LineParams {
    if (offsetBlock(p) !== null || n <= 1) return p;
    const interval = length(offset);
    if (!(interval > 1e-9)) return p;
    const next: LineParams = {
        ...p,
        measured: "offset",
        offset,
        spacing:
            p.spacing.mode === "keep"
                ? { mode: "keep", groups: [{ interval }] }
                : p.spacing,
    };
    return sizedToOffset(next, n, env);
}

/** A one-segment line `n − 1` of its offsets long, grown from its pivot, its start on the grid */
function sizedToOffset(p: LineParams, n: number, env: SizeEnv): LineParams {
    const o = p.offset!;
    const [a, b] = p.points as [LinePoint, LinePoint];
    const grown: LineParams = {
        ...p,
        points: [a, { ...b, x: a.x + (n - 1) * o.x, y: a.y + (n - 1) * o.y }],
    };
    const at = pinned(p, grown, env);
    if (!env.snap || !env.gridSnap) return at;
    const first = at.points[0]!;
    return translated(at, sub(env.gridSnap(first), first));
}

/** `p` moved by `d` */
const translated = (p: LineParams, d: XY): LineParams =>
    d.x === 0 && d.y === 0
        ? p
        : {
              ...p,
              points: p.points.map((q) => ({
                  ...q,
                  x: q.x + d.x,
                  y: q.y + d.y,
              })),
          };

/** How far apart `a` and `b` are along `axis` */
const extent = (a: XY, b: XY, axis: LineMeasured) =>
    Math.abs(coord(b, axis) - coord(a, axis));

/** The line's length along `axis`, end to end */
const axisLength = (p: LineParams, axis: LineMeasured) =>
    extent(p.points[0]!, p.points.at(-1)!, axis);

/** Each stretch's length along `axis` ({@link lineStretches}) */
const stretchExtents = (p: LineParams, axis: LineMeasured): number[] =>
    lineStretches(p).map(({ from, to }) =>
        extent(p.points[from]!, p.points[to]!, axis),
    );

/**
 * Where each of `gaps` puts a neighbor, from `from`: within a run of equal gaps `start + i * gap`
 * rather than a running sum, so a spot on the grid isn't pushed off it by rounding
 */
function offsetsOf(gaps: readonly number[], from: number): number[] {
    const out = [from];
    let start = from;
    let gap = NaN;
    let i = 0;
    for (const g of gaps) {
        if (g !== gap) {
            start = out.at(-1)!;
            gap = g;
            i = 0;
        }
        out.push(start + ++i * g);
    }
    return out;
}

/**
 * The spot on `segments` (a line going one way along `axis`) where that coordinate is `c`,
 * exactly: on the segment that reaches it, or past an end along the end segment. Tagged with its
 * distance along them from `s0`.
 */
function atCoord(
    segments: readonly Segment[],
    axis: LineMeasured,
    c: number,
    s0 = 0,
): Slot {
    let s = s0;
    for (let i = 0; i < segments.length; i++) {
        const path = makePath([segments[i]!]);
        const a = path.at(0);
        const b = path.at(path.length);
        const ca = coord(a, axis);
        const cb = coord(b, axis);
        // Past this segment's far end: on to the next
        if (i < segments.length - 1 && (cb - c) * (cb - ca) < 0) {
            s += path.length;
            continue;
        }
        if (segments[i]!.type === "line") {
            const t = (c - ca) / (cb - ca);
            return { ...lerp(a, b, t), [axis]: c, s: s + path.length * t };
        }
        // Along a curve, found on it; past its ends along its end tangents
        const way = Math.sign(cb - ca);
        const off = (at: number) => (coord(path.at(at), axis) - c) * way;
        const span = Math.max(path.length, 1e-9);
        let lo = 0;
        let hi = path.length;
        for (let k = 0; k < 60 && off(lo) > 0; k++) lo -= span;
        for (let k = 0; k < 60 && off(hi) < 0; k++) hi += span;
        for (let k = 0; k < 60; k++) {
            const mid = (lo + hi) / 2;
            if (off(mid) < 0) lo = mid;
            else hi = mid;
        }
        const at = (lo + hi) / 2;
        return { ...path.at(at), [axis]: c, s: s + at };
    }
    const first = segments[0] ? makePath([segments[0]]).at(0) : { x: 0, y: 0 };
    return { ...first, s: s0 };
}

/**
 * Neighbors `gaps` apart along `axis` (scaled to fit, in order), from one end of `segments` to
 * the other, tagged from `from`: a stretch between corners of a measured line
 */
function axisRunSpots(
    segments: readonly Segment[],
    axis: LineMeasured,
    gaps: readonly number[],
    from: number,
): Slot[] {
    const path = makePath(segments);
    const first = coord(path.at(0), axis);
    const last = coord(path.at(path.length), axis);
    const total = Math.abs(last - first);
    const way = Math.sign(last - first);
    const whole = sum(gaps);
    let k = whole > 0 ? total / whole : 0;
    // A stretch as long as its run takes its gaps as they are, so each lands on the grid
    if (Math.abs(k - 1) < 1e-9) k = 1;
    const offsets = offsetsOf(
        gaps.map((gap) => gap * k),
        0,
    );
    // The last on the end exactly
    offsets[gaps.length] = total;
    return offsets.map((o) => atCoord(segments, axis, first + way * o, from));
}

/**
 * The interval between neighbors, in field units: the typed one, or in Fit the one the drawn
 * line works out to, measured as the line measures it
 */
export function lineInterval(p: LineParams, n: number): number {
    const typed = typedInterval(p);
    if (typed !== null) return typed;
    if (n <= 1) return 0;
    // Fit's mixed groups scaled to the line: their narrowest
    if (hasGroups(p)) return Math.min(...lineGaps(p, n)!);
    const axis = measuredAxis(p);
    if (axis) return axisLength(p, axis) / (n - 1);
    const gaps = gapCount(p, n);
    const path = linePath(p);
    const across = lineAcross(p);
    return across ? evenScale(path, gaps, across) : path.length / gaps;
}

/**
 * How many gaps each stretch (corner to corner, {@link lineStretches}) holds when every corner
 * holds a marcher (#524): a whole number each, at least one. With one interval for everyone (or in
 * Fit) they're in proportion to the stretches' lengths; with groups (#526) each corner takes the
 * seam between gaps nearest it along the run, so a stretch that is a whole run of the groups' gaps
 * holds exactly those. Measured ↔ or ↕ (#527), a stretch's length is how far it goes that way.
 * Null when no point between the ends holds a marcher ({@link holdsMarcher}: the switch off or no
 * corner, and no point asking for one, #569), the run is laid on the path (whatever the points
 * say), or there are fewer gaps than stretches. A closed line's stretches have n gaps between
 * them, round from its first held point (#529).
 */
export function cornerGaps(p: LineParams, n: number): number[] | null {
    if (p.spacing.mode === "path") return null;
    const held = isClosed(p)
        ? p.points.some((_, i) => holdsMarcher(p, i))
        : lineStretches(p).length > 1;
    if (!held) return null;
    const axis = measuredAxis(p);
    const lengths = axis
        ? stretchExtents(p, axis)
        : stretchPaths(p).map((path) => path.length);
    const gaps = gapCount(p, n);
    const total = sum(lengths);
    if (gaps < lengths.length || !(total > 0)) return null;
    if (hasGroups(p)) return seamGaps(lengths, lineGaps(p, n)!);
    const ideal = lengths.map((l) => (gaps * l) / total);
    const counts = ideal.map((x) => Math.max(1, Math.floor(x + 1e-9)));
    let left = sum(counts);
    // Largest remainders first, and never under one gap a stretch
    while (left < gaps) {
        const i = argMax(ideal.map((x, k) => x - counts[k]!));
        counts[i]!++;
        left++;
    }
    while (left > gaps) {
        const i = argMax(
            ideal.map((x, k) => (counts[k]! > 1 ? counts[k]! - x : -Infinity)),
        );
        counts[i]!--;
        left--;
    }
    return counts;
}

/**
 * How many of `gaps`, in order, each stretch of `lengths` holds: each corner at the seam whose
 * share of the run is nearest its share of the line, at least one gap a stretch
 */
function seamGaps(
    lengths: readonly number[],
    gaps: readonly number[],
): number[] {
    const total = sum(lengths);
    const run = sum(gaps);
    const counts: number[] = [];
    let along = 0;
    let seam = 0;
    let reach = 0;
    lengths.slice(0, -1).forEach((l, i) => {
        along += l;
        const want = (along / total) * run;
        // Room for one gap in each stretch still to come
        const last = gaps.length - (lengths.length - 1 - i);
        let best = seam + 1;
        let at = reach + gaps[seam]!;
        let bestAt = at;
        for (let j = seam + 2; j <= last; j++) {
            at += gaps[j - 1]!;
            if (Math.abs(at - want) < Math.abs(bestAt - want) - 1e-9) {
                best = j;
                bestAt = at;
            }
        }
        counts.push(best - seam);
        seam = best;
        reach = bestAt;
    });
    counts.push(gaps.length - seam);
    return counts;
}

/**
 * The gaps each stretch holds, in field units, when every corner holds a marcher: in Fit even
 * shares (1 each, scaled to the stretch), typed the line's gaps in order along it ({@link
 * lineGaps}), {@link cornerGaps} of them a stretch. Null when the corners don't hold marchers.
 */
export function cornerRuns(p: LineParams, n: number): number[][] | null {
    const counts = cornerGaps(p, n);
    if (!counts) return null;
    const gaps = lineGaps(p, n) ?? Array<number>(gapCount(p, n)).fill(1);
    let at = 0;
    return counts.map((count) => gaps.slice(at, (at += count)));
}

const argMax = (xs: readonly number[]): number =>
    xs.reduce((best, x, i) => (x > xs[best]! ? i : best), 0);

/**
 * In Fit with every corner holding a marcher, the narrowest and widest interval of its stretches, in
 * field units; null otherwise
 */
export function intervalRange(
    p: LineParams,
    n: number,
): { readonly min: number; readonly max: number } | null {
    const gaps = p.spacing.mode === "fit" ? cornerGaps(p, n) : null;
    if (!gaps) return null;
    const axis = measuredAxis(p);
    const across = stretchAcross(p);
    const each = axis
        ? stretchExtents(p, axis).map((l, i) => l / gaps[i]!)
        : stretchPaths(p).map((path, i) =>
              evenScale(path, gaps[i]!, across[i]!),
          );
    return { min: Math.min(...each), max: Math.max(...each) };
}

/**
 * In Keep interval with every corner holding a marcher, whether a stretch isn't as long as its run
 * of gaps as the line measures them (a whole number of intervals): a corner dragged with `fine`
 * (#524). Measured ↔ or ↕, as long that way.
 */
export function cornerOffInterval(p: LineParams, n: number): boolean {
    const runs = p.spacing.mode === "fit" ? null : cornerRuns(p, n);
    if (!runs) return false;
    const axis = measuredAxis(p);
    if (axis)
        return stretchExtents(p, axis).some(
            (l, i) => Math.abs(l - sum(runs[i]!)) > 1e-6 * Math.max(l, 1),
        );
    const across = stretchAcross(p);
    return stretchPaths(p).some(
        (path, i) => Math.abs(fitScale(path, runs[i]!, across[i]!) - 1) > 1e-6,
    );
}

/**
 * The spots of a line whose corners hold marchers: stretch by stretch from its first point, each
 * holding its run of gaps as the line measures them, then the last point. In Keep interval a stretch is as
 * long as its run, so the gaps are as typed; a corner `fine` left off its interval scales its
 * stretches' gaps to fit (even gaps, with one interval) instead of running past the corner and
 * stacking marchers on it. Measured ↔ or ↕ (#527), each stretch holds its gaps that way. A closed
 * line's start at its first corner and end back on it (#529).
 */
function cornerSpots(p: LineParams, runs: readonly number[][]): Slot[] {
    const spots: Slot[] = [];
    const axis = measuredAxis(p);
    const segments = lineSegments(p);
    const stretches = lineStretches(p);
    const across = stretchAcross(p);
    const whole = makePath(segments).length;
    let s = sum(
        segments.slice(0, stretches[0]!.from).map((g) => makePath([g]).length),
    );
    stretchPaths(p).forEach((path, i) => {
        const { from, to } = stretches[i]!;
        spots.push(
            ...(axis
                ? axisRunSpots(segments.slice(from, to), axis, runs[i]!, s)
                : runSpots(path, runs[i]!, s, across[i]!)
            ).slice(0, -1),
        );
        s += path.length;
    });
    if (isClosed(p))
        return spots.map((spot) => ({ ...spot, s: spot.s! % whole }));
    const last = p.points.at(-1)!;
    spots.push({ x: last.x, y: last.y, s });
    return spots;
}

/**
 * The `n` spots along the line, tagged with their distance along it. Measured ↔ or ↕ (#527),
 * neighbors are their gaps apart that way, exactly; with `stepPx`, a centered run starts a whole
 * number of half steps from the line's start that way, so it stays on the grid with it.
 */
export function lineSpots(p: LineParams, n: number, stepPx?: number): Slot[] {
    if (n <= 0) return [];
    // Measured as an offset, each marcher that far from the one before, exactly
    if (offsetOf(p) && n > 1) {
        const o = lineOffset(p, n);
        const first = p.points[0]!;
        const step = length(o);
        return Array.from({ length: n }, (_, i) => ({
            x: first.x + i * o.x,
            y: first.y + i * o.y,
            s: i * step,
        }));
    }
    const path = linePath(p);
    const at = (s: number): Slot => ({ ...path.at(s), s });
    const corners = cornerRuns(p, n);
    if (corners) return cornerSpots(p, corners);
    const closed = isClosed(p);
    const axis = measuredAxis(p);
    if (axis) return measuredSpots(p, n, axis, stepPx);
    const gaps = lineGaps(p, n);
    const across = lineAcross(p);
    if (gaps === null) {
        if (n === 1) return [at(closed ? 0 : path.length / 2)];
        const count = gapCount(p, n);
        // Measured straight across along a curve, neighbors evenly apart that way (#525); a
        // closed line's last back on its first
        if (across)
            return runSpots(
                path,
                Array<number>(count).fill(1),
                0,
                across,
            ).slice(0, n);
        return Array.from({ length: n }, (_, i) =>
            at((path.length * i) / count),
        );
    }
    // A closed line's run goes round from its first point, its last gap back to it
    if (closed) return offsetsOn(path, 0, gaps.slice(0, -1), across).map(at);
    // Keep interval is sized to its run, which sits on it whole; on the path it sits at its anchor
    const anchor = p.spacing.mode === "path" ? p.spacing.anchor : "center";
    return anchoredSpots(p, gaps, anchor, across);
}

/** {@link lineSpots} on a line measured along `axis`, its corners holding no marchers */
function measuredSpots(
    p: LineParams,
    n: number,
    axis: LineMeasured,
    stepPx: number | undefined,
): Slot[] {
    const segments = lineSegments(p);
    const first = coord(p.points[0]!, axis);
    const total = axisLength(p, axis);
    const way = Math.sign(coord(p.points.at(-1)!, axis) - first);
    const at = (c: number) => atCoord(segments, axis, first + way * c);
    const gaps = lineGaps(p, n);
    if (gaps === null) {
        if (n === 1) return [at(total / 2)];
        return Array.from({ length: n }, (_, i) =>
            // The last spot is exactly on the end
            i === n - 1 ? at(total) : at((total * i) / (n - 1)),
        );
    }
    const run = sum(gaps);
    // Keep interval is sized to its run, which sits on it whole; on the path it sits at its anchor
    const anchor = p.spacing.mode === "path" ? p.spacing.anchor : "center";
    let from =
        anchor === "start"
            ? 0
            : anchor === "end"
              ? total - run
              : (total - run) / 2;
    // A centered run starts on a half step from the start
    if (stepPx && anchor === "center")
        from = Math.round(from / (stepPx / 2)) * (stepPx / 2);
    return offsetsOf(gaps, from).map(at);
}

const reversed = (segment: Segment): Segment =>
    segment.type === "cubic"
        ? {
              type: "cubic",
              a: segment.b,
              c1: segment.c2,
              c2: segment.c1,
              b: segment.a,
          }
        : segment.type === "line"
          ? { type: "line", a: segment.b, b: segment.a }
          : {
                ...segment,
                start: segment.start + segment.sweep,
                sweep: -segment.sweep,
            };

/**
 * A run of `gaps` laid on the line at `anchor`: from its start, back from its end, or centered
 * with as much of the path spare before it as after it (#523, #525). Along the path that is the
 * run's length from the anchor. Straight across (`across`), the chords cover less path the more it
 * bends there, so the end and the center are found on the path itself, not from the run's length
 * measured somewhere else. A run longer than the line runs past its ends.
 */
function anchoredSpots(
    p: LineParams,
    gaps: readonly number[],
    anchor: LineAnchor,
    across: readonly number[] | null,
): Slot[] {
    const segments = lineSegments(p);
    const path = makePath(segments);
    const at = (s: number): Slot => ({ ...path.at(s), s });
    if (!across) {
        const spare = path.length - sum(gaps);
        const from =
            anchor === "start" ? 0 : anchor === "end" ? spare : spare / 2;
        return offsetsOf(gaps, from).map(at);
    }
    if (anchor === "start") return chordOffsets(path, 0, gaps, across).map(at);
    if (anchor === "end") {
        const back = makePath(segments.map(reversed).reverse());
        const bends = across.map((b) => path.length - b);
        return chordOffsets(back, 0, [...gaps].reverse(), bends)
            .map((s) => ({ ...back.at(s), s: path.length - s }))
            .reverse();
    }
    // The path spare before the run less the path spare after it, which grows as the run starts
    // further along
    const lopsided = (from: number) =>
        from - (path.length - chordOffsets(path, from, gaps, across).at(-1)!);
    const span = Math.max(path.length, sum(gaps), 1e-9);
    let lo = -span;
    let hi = span;
    for (let i = 0; i < 60 && lopsided(lo) > 0; i++) lo -= span;
    for (let i = 0; i < 60 && lopsided(hi) < 0; i++) hi += span;
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (lopsided(mid) < 0) lo = mid;
        else hi = mid;
    }
    return chordOffsets(path, (lo + hi) / 2, gaps, across).map(at);
}

/**
 * A closed line's turn (#529), within an eighth of a turn of 0: the sides of its outline as drawn
 * ({@link closedOutline}, a curve in short pieces), their directions taken a quarter turn at a
 * time so a side and the one square to it agree, averaged by length. It doesn't depend on which
 * point was clicked first or which way round. Only when sides square to each other make up most
 * of the outline (a rectangle, turned or not) does it follow them; anything else (a triangle, a
 * hexagon, a round curve) stands square to the field, so its ranks square to the field like a
 * box's.
 */
function closedTurn(outline: readonly XY[]): number {
    let x = 0;
    let y = 0;
    let around = 0;
    outline.forEach((a, i) => {
        const d = sub(outline[(i + 1) % outline.length]!, a);
        const angle = 4 * Math.atan2(d.y, d.x);
        x += length(d) * Math.cos(angle);
        y += length(d) * Math.sin(angle);
        around += length(d);
    });
    if (Math.hypot(x, y) < around / 2) return 0;
    const turn = Math.atan2(y, x) / 4;
    // A rectangle square to the field is 0, not float noise either side of it
    return Math.abs(turn) < 1e-12 ? 0 : turn;
}

/**
 * The line's frame: centered between its ends, turned along them, as long as they are apart and
 * with no depth. A closed line's is around its outline as drawn, turned square to the field
 * ({@link closedTurn}), so the same outline fills the same way however it was clicked. A line is
 * never flipped: a flip reverses it instead.
 */
export function lineFrame(p: LineParams): ShapeFrame {
    const a = p.points[0]!;
    const b = p.points.at(-1)!;
    const d = sub(b, a);
    const open: ShapeFrame = {
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        halfWidth: length(d) / 2,
        halfDepth: 0,
        rotation: length(d) > 0 ? Math.atan2(d.y, d.x) : 0,
        flipX: false,
        flipY: false,
    };
    if (!isClosed(p)) return open;
    const outline = closedOutline(p).points;
    const turned: ShapeFrame = { ...open, rotation: closedTurn(outline) };
    const local = outline.map((q) => fieldToFrame(turned, q));
    const xs = local.map((q) => q.x);
    const ys = local.map((q) => q.y);
    const [left, right] = [Math.min(...xs), Math.max(...xs)];
    const [top, bottom] = [Math.min(...ys), Math.max(...ys)];
    return {
        ...turned,
        center: frameToField(turned, {
            x: (left + right) / 2,
            y: (top + bottom) / 2,
        }),
        halfWidth: (right - left) / 2,
        halfDepth: (bottom - top) / 2,
    };
}

/**
 * The line moved, turned or flipped into `frame`: each point keeps its place in the frame, mirrored
 * when `frame` is flipped. Its {@link LineParams.turn} goes round with it: turned, by as much as the
 * frame turned; mirrored, to the other way round (a mirror of a line turned 30° clockwise is the
 * mirrored line turned 30° the other way); moved, not at all.
 */
export function withLineFrame(p: LineParams, frame: ShapeFrame): LineParams {
    const was = lineFrame(p);
    const points = p.points.map((q) => {
        const local = fieldToFrame(was, q);
        return {
            ...q,
            ...frameToField(frame, {
                x: frame.flipX ? -local.x : local.x,
                y: frame.flipY ? -local.y : local.y,
            }),
        };
    });
    const mirrored = frame.flipX !== frame.flipY;
    // A mirror bends every arc the other way, and an ellipse's axis goes round with it (#634)
    const moved = (q: XY) => {
        const local = fieldToFrame(was, q);
        return frameToField(frame, {
            x: frame.flipX ? -local.x : local.x,
            y: frame.flipY ? -local.y : local.y,
        });
    };
    const flips = mirrored !== (was.flipX !== was.flipY);
    points.forEach((q, i) => {
        const bend = q.bend !== undefined && flips ? -q.bend : q.bend;
        let ellipse = q.ellipse;
        if (ellipse) {
            // The frame moves every direction alike, so map it from one fixed spot: points
            // sharing an ellipse then keep exactly the same axis
            const angle = (ellipse.axis * Math.PI) / 180;
            const from = moved({ x: 0, y: 0 });
            const to = moved({
                x: Math.cos(angle) * 100,
                y: Math.sin(angle) * 100,
            });
            ellipse = {
                ...ellipse,
                axis:
                    (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI,
            };
        }
        if (bend !== q.bend || ellipse !== q.ellipse)
            points[i] = {
                ...points[i]!,
                ...(bend === undefined ? {} : { bend }),
                ...(ellipse ? { ellipse } : {}),
            };
    });
    const turn = mirrored
        ? -lineTurn(p)
        : lineTurn(p) + (frame.rotation - was.rotation);
    return withTurn({ ...p, points }, turn);
}

/** The line's turn since it was drawn ({@link LineParams.turn}), in radians */
export const lineTurn = (p: Pick<LineParams, "turn">): number =>
    (p.turn ?? 0) * DEGREE;

/**
 * `p` with its turn at `rad` radians, stored in degrees from 0 up to 360 rounded to a millionth
 * (float noise from 15° steps in radians), and left out at 0
 */
export function withTurn<T extends Pick<LineParams, "turn">>(
    p: T,
    rad: number,
): T {
    let degrees = Math.round((normalizeAngle(rad) / DEGREE) * 1e6) / 1e6;
    if (degrees >= 360) degrees = 0;
    const { turn: _turn, ...rest } = p;
    return (degrees === 0 ? rest : { ...rest, turn: degrees }) as T;
}

/**
 * Where a dragged or drawn point lands: on a field line within the pull radius (a yard line, a
 * hash), else on the half-step grid, each axis on its own. `fine` keeps the pulls off the
 * ladder; the Snap toggle off does neither.
 */
export function landPoint(raw: XY, env: ToolEnv): XY {
    const grid = env.gridSnap(raw);
    if (env.pull === false || !env.fieldLines) return grid;
    const pull = linePull(
        [raw],
        env.fieldLines,
        Math.min(env.pullRadius ?? 0, env.stepPx / 4),
    );
    return {
        x: pull.x === null ? grid.x : raw.x + pull.x,
        y: pull.y === null ? grid.y : raw.y + pull.y,
    };
}

/**
 * `to` on the nearest 45° from `from`, as far along as the pointer went, on the half-step grid
 * when snapping (both offsets the same size on a diagonal)
 */
function at45(from: XY, to: XY, env: ToolEnv): XY {
    const d = sub(to, from);
    const step = Math.PI / 4;
    const angle = Math.round(Math.atan2(d.y, d.x) / step) * step;
    const u = { x: Math.cos(angle), y: Math.sin(angle) };
    const t = d.x * u.x + d.y * u.y;
    const free = { x: from.x + u.x * t, y: from.y + u.y * t };
    if (!env.snap) return free;
    const unit = halfStep(env);
    const along =
        Math.round((Math.max(Math.abs(u.x), Math.abs(u.y)) * t) / unit) * unit;
    const sx = Math.abs(u.x) < 1e-9 ? 0 : Math.sign(u.x);
    const sy = Math.abs(u.y) < 1e-9 ? 0 : Math.sign(u.y);
    return { x: from.x + sx * along, y: from.y + sy * along };
}

/** Where an end goes when dragged to `to` with `other` fixed: landed, or at 45° with constrain */
const endAt = (other: XY, to: XY, env: ToolEnv): XY =>
    env.constrain ? at45(other, to, env) : landPoint(to, env);

/**
 * A straight line drawn from `from` to `to`, in Fit, its two points of `tension` (a Curve's are
 * smooth, #525); undefined while it's under half a step
 */
export function drawLine(
    from: XY,
    to: XY,
    env: ToolEnv,
    tension = 0,
): LineParams | undefined {
    const a = landPoint(from, env);
    const b = endAt(a, to, env);
    if (length(sub(b, a)) < halfStep(env) - 1e-9) return undefined;
    const line: LineParams = {
        points: [a, b].map(withTension(tension)),
        spacing: FIT,
    };
    return tension === 0 && yardToYard(a, b, env)
        ? { ...line, measured: "x" }
        : line;
}

/**
 * Whether a line from `a` to `b` runs diagonally from one yard line to another (spec #522): such
 * a line starts measured side to side (↔), the common diagonal needing no setting
 */
function yardToYard(a: XY, b: XY, env: ToolEnv): boolean {
    const yards = env.fieldLines?.x ?? [];
    const onYard = (x: number) =>
        yards.some((line) => Math.abs(line - x) < 1e-6);
    return (
        Math.abs(a.x - b.x) > 1e-6 &&
        Math.abs(a.y - b.y) > 1e-6 &&
        onYard(a.x) &&
        onYard(b.x)
    );
}

/**
 * A Curve drawn by a drag (#525): its two ends and, between them, a smooth point a quarter as far
 * off the line as they are apart, to the left of the way it was dragged, so it starts as a gentle
 * bow rather than straight; straight while the drag is too short for the bow to land between its
 * ends, undefined while it's under half a step
 */
export function drawCurve(
    from: XY,
    to: XY,
    env: ToolEnv,
): LineParams | undefined {
    const line = drawLine(from, to, env, SMOOTH);
    if (!line) return undefined;
    const [a, b] = line.points as [LinePoint, LinePoint];
    const d = sub(b, a);
    const bow = landPoint(
        { x: (a.x + b.x) / 2 + d.y / 4, y: (a.y + b.y) / 2 - d.x / 4 },
        env,
    );
    const onEnd = (q: XY) => q.x === bow.x && q.y === bow.y;
    if (onEnd(a) || onEnd(b)) return line;
    return { ...line, points: [a, withTension(SMOOTH)(bow), b] };
}

/**
 * Where a clicked point lands (#524): the first on a field line or the grid, each next one too, or
 * at 45° from the last with constrain
 */
export function landClicked(previous: readonly XY[], at: XY, env: ToolEnv): XY {
    const last = previous.at(-1);
    return last ? endAt(last, at, env) : landPoint(at, env);
}

/**
 * A line through clicked points, in Fit (#524), each of `tension` (a Curve's are smooth, #525), a
 * point landed on the one before it dropped; undefined while that leaves under two, or a line
 * under half a step long
 */
export function drawPoints(
    clicked: readonly XY[],
    env: ToolEnv,
    tension = 0,
): LineParams | undefined {
    const points = clicked.filter(
        (q, i) =>
            i === 0 || q.x !== clicked[i - 1]!.x || q.y !== clicked[i - 1]!.y,
    );
    if (points.length < 2) return undefined;
    const p: LineParams = {
        points: points.map(withTension(tension)),
        spacing: FIT,
    };
    if (linePath(p).length < halfStep(env) - 1e-9) return undefined;
    return p;
}

/**
 * The way from `other` toward `to`, for an end swung round its neighbor ({@link swungDirection}).
 * Null for no direction.
 */
function directionFrom(other: XY, to: XY, env: ToolEnv): XY | null {
    return swungDirection(sub(to, other), env);
}

/**
 * The way `d` points, as an end swung round its neighbor goes (ADR 0006, decision 10): in the
 * knob's steps ({@link snapRotation}), 15° at a time counted from level, so level and plumb are
 * always reachable whichever way the line was drawn; whole degrees with `fine`; free with the Snap
 * toggle off. One long, or null for no direction.
 */
export function swungDirection(
    d: XY,
    env: Pick<ToolEnv, "fine" | "pull">,
): XY | null {
    if (length(d) < 1e-9) return null;
    const angle = snapRotation(Math.atan2(d.y, d.x), env);
    // Level and plumb exactly, not float noise off them
    const clean = (v: number) => (Math.abs(v) < 1e-12 ? 0 : v);
    return { x: clean(Math.cos(angle)), y: clean(Math.sin(angle)) };
}

/** `d` with each axis on the half-step ladder */
const onHalfSteps = (d: XY, env: Pick<ToolEnv, "stepPx">): XY => {
    const unit = halfStep(env);
    return {
        x: Math.round(d.x / unit) * unit,
        y: Math.round(d.y / unit) * unit,
    };
};

/** `d` made one long, or null when it has no direction */
const unitOf = (d: XY): XY | null => {
    const l = length(d);
    return l < 1e-9 ? null : { x: d.x / l, y: d.y / l };
};

/** `a` plus `t` of `u` */
const along = (a: XY, u: XY, t: number): XY => ({
    x: a.x + u.x * t,
    y: a.y + u.y * t,
});

/**
 * How near half a step must come to this many screen pixels before a dragged interval snaps to
 * half steps rather than whole ones
 */
export const HALF_STEP_SNAP_PX = 8;

/**
 * What a dragged interval snaps to with the interval unlocked: whole steps, or half steps once
 * the field is zoomed in so far that half a step is {@link HALF_STEP_SNAP_PX} on screen
 */
export function intervalUnit(env: Pick<ToolEnv, "stepPx" | "zoom">): number {
    const half = env.stepPx / 2;
    return env.zoom !== undefined && half * env.zoom >= HALF_STEP_SNAP_PX - 1e-9
        ? half
        : env.stepPx;
}

/**
 * `x` on the nearest multiple of `unit`; never nought unless `zero` allows it, one unit the way
 * `x` goes (or `way`) instead
 */
function onUnits(x: number, unit: number, zero = false, way = 1): number {
    const k = Math.round(x / unit);
    if (k !== 0 || zero) return k * unit;
    return (Math.sign(x) || Math.sign(way) || 1) * unit;
}

/** `p` with point `index` at `at` */
const withPointAt = (p: LineParams, index: number, at: XY): LineParams => ({
    ...p,
    points: p.points.map((q, i) =>
        i === index ? { ...q, x: at.x, y: at.y } : q,
    ),
});

/**
 * How many layouts {@link solveFor} narrows a crossing down in, at most. Straight across, an
 * interval is jagged on a fine scale (a gap is walked out along the path in short steps) and jumps
 * where the scale that fits it does ({@link fitScale}): narrowing down onto a jump took dozens of
 * layouts a pointer move, for a spot no nearer whole, where a crossing takes well under this
 */
const SOLVE_STEPS = 16;

/** How near its target, in field units, {@link solveFor} takes an interval to be on it */
const ON_TARGET = 1e-10;

/**
 * The `t` nearest `t0` between `lo` and `hi` where `f(t)` is `target`, or null where it never is:
 * by secant steps from `t0` (`h` the first, {@link secantFrom}), else sampled for where it crosses
 * and narrowed down to it. `near` is a short search, `lo` to `hi` only as far as the caller can
 * use: there a secant step past them is taken to say the nearest crossing isn't in reach, unless
 * the tries so far, or `lo` and `hi` themselves, straddle one ({@link straddled}).
 */
function solveFor(
    f: (t: number) => number,
    target: number,
    t0: number,
    lo: number,
    hi: number,
    near = false,
): number | null {
    const SAMPLES = near ? 12 : 96;
    const tolerance = (hi - lo) * 1e-12;
    // Every try is kept: two either side of the target bracket a crossing without another layout
    const tried: Try[] = [];
    const g = (t: number) => {
        const off = f(t) - target;
        // On it, to well past what any number shows: narrowing further only costs layouts
        const v = Math.abs(off) <= ON_TARGET ? 0 : off;
        tried.push({ t, v });
        return v;
    };
    // `f` is all but straight near `t0` as a rule (an interval against how far a point is
    // dragged), so a secant from `t0` brackets the crossing within a call or two and false
    // position finishes it: a handful of calls where sampling takes over a hundred, each a whole
    // layout (a search of its own straight across, #596)
    const h = (hi - lo) / SAMPLES;
    const b = t0 + h <= hi ? t0 + h : t0 - h;
    const found =
        t0 >= lo && t0 <= hi
            ? secantFrom(g, t0, g(t0), b, g(b), lo, hi, tolerance, SOLVE_STEPS)
            : undefined;
    if (typeof found === "number") return found;
    if (found === "outside" && near) {
        // The step overshot, but a crossing may still be in reach where `f` bends: the reach's
        // ends say so, two layouts where sampling it takes a dozen
        if (!straddles(tried, lo, hi)) {
            g(lo);
            g(hi);
        }
        return straddled(g, tried, t0, lo, hi, tolerance);
    }
    let best: number | null = null;
    let prevT = lo;
    let prev = g(lo);
    for (let i = 1; i <= SAMPLES; i++) {
        const t = lo + ((hi - lo) * i) / SAMPLES;
        const now = g(t);
        if (Number.isFinite(prev) && Number.isFinite(now) && prev * now <= 0) {
            const root = falsePosition(
                g,
                prevT,
                prev,
                t,
                now,
                tolerance,
                SOLVE_STEPS,
            );
            if (
                root !== null &&
                (best === null || Math.abs(root - t0) < Math.abs(best - t0))
            )
                best = root;
        }
        prevT = t;
        prev = now;
    }
    return best;
}

/** One value tried in a search: `f(t)` less the target */
type Try = { readonly t: number; readonly v: number };

/** Tries between `lo` and `hi`, in order along, with a finite value */
const triedIn = (tried: readonly Try[], lo: number, hi: number): Try[] =>
    tried
        .filter((x) => x.t >= lo && x.t <= hi && Number.isFinite(x.v))
        .sort((x, y) => x.t - y.t);

/** Whether two of `tried` between `lo` and `hi` are either side of the target */
const straddles = (tried: readonly Try[], lo: number, hi: number): boolean => {
    const inside = triedIn(tried, lo, hi);
    return inside.some((x, i) => i > 0 && inside[i - 1]!.v * x.v <= 0);
};

/**
 * Where `g` crosses nought between the two neighboring tries, of `tried` between `lo` and `hi`,
 * that straddle it nearest `t0`; null when none do
 */
function straddled(
    g: (t: number) => number,
    tried: readonly Try[],
    t0: number,
    lo: number,
    hi: number,
    tolerance: number,
): number | null {
    const inside = triedIn(tried, lo, hi);
    let best: [Try, Try] | null = null;
    let bestOff = Infinity;
    for (let i = 1; i < inside.length; i++) {
        const a = inside[i - 1]!;
        const b = inside[i]!;
        if (a.v * b.v > 0) continue;
        const off = t0 < a.t ? a.t - t0 : t0 > b.t ? t0 - b.t : 0;
        if (off < bestOff) {
            bestOff = off;
            best = [a, b];
        }
    }
    if (!best) return null;
    const [a, b] = best;
    return falsePosition(g, a.t, a.v, b.t, b.v, tolerance, SOLVE_STEPS);
}

/**
 * The interval a drag of point `index` changes: with points holding marchers (`counts`, each
 * stretch's gaps, held as they were), the interval of the stretch it ends, or the first one for
 * the first point; else the line's
 */
function intervalAt(
    p: LineParams,
    n: number,
    index: number,
    counts: readonly number[] | null,
): number {
    if (!counts) return lineInterval(p, n);
    const stretches = lineStretches(p);
    if (stretches.length !== counts.length) return lineInterval(p, n);
    const r =
        index === 0
            ? 0
            : stretches.findIndex((stretch) => stretch.to === index);
    if (r < 0) return lineInterval(p, n);
    const axis = measuredAxis(p);
    if (axis) return stretchExtents(p, axis)[r]! / counts[r]!;
    return evenScale(stretchPaths(p)[r]!, counts[r]!, stretchAcross(p)[r]!);
}

/**
 * Point `index` dragged to `to`. An end dropped on the other end closes the line (#529).
 *
 * The interval unlocked (Fit): the point snaps where the interval comes out to whole steps (half
 * steps zoomed in, {@link intervalUnit}); `fine` or the Snap toggle off leaves it where it's
 * dragged (landed). Measured ↔ or ↕, an end's coordinate that way snaps and it takes the
 * pointer's place the other way, and so does a corner holding a marcher between straight segments,
 * where both its stretches' runs that way come out whole, keeping its spot that way until the
 * pointer is most of the way to another ({@link stickyOnAxis}). Otherwise a point snaps only where
 * that's near the pointer ({@link softSnap}): a corner holding a marcher between straight
 * segments where both its stretches' intervals come out whole, any other point as far along its
 * direction as makes its interval whole.
 *
 * The interval locked (Keep interval): an end turns about its neighbor, its segment's length (so
 * its intervals) kept, and a corner holding a marcher between straight segments lands where each
 * of them is a whole number of intervals long (#524); `fine` frees it. Measured ↔ or ↕ (#527), an
 * end keeps how far it is that way and takes the pointer's place the other way, and a corner lands
 * a whole run of gaps that way from the point before it, kept as it's dragged
 * ({@link stickyOnAxis}). On the path the point goes where it's dragged.
 *
 * A smooth point, or a corner beside a curve, goes where it's dragged. `constrain` keeps the
 * direction from the point before (an end's segment), only its length changing; `fromCenter` moves
 * the other end the opposite way, so the line changes about its center. A one-segment line has its
 * own rules ({@link dragEnd}).
 */
export function dragPoint(
    base: LineParams,
    n: number,
    index: number,
    to: XY,
    env: ToolEnv,
): LineParams {
    const last = base.points.length - 1;
    const closed = isClosed(base);
    const end = !closed && (index === 0 || index === last);
    if (end && last >= 2) {
        const otherEnd = base.points[index === 0 ? last : 0]!;
        if (length(sub(to, otherEnd)) <= env.hitRadius)
            return closeLine(
                {
                    ...base,
                    points: base.points.filter((_, i) => i !== index),
                },
                n,
                env,
            );
    }
    if (end && last === 1) return dragEnd(base, n, index, to, env);
    const other = base.points[index === 0 ? (closed ? last : 1) : index - 1]!;
    const was = base.points[index]!;
    const keep = base.spacing.mode === "keep" && n > 1;
    const fit = base.spacing.mode === "fit" && n > 1;
    const axis = measuredAxis(base);
    // The direction kept with constrain: from the point before (an end's neighbor)
    const kept = env.constrain ? unitOf(sub(was, other)) : null;
    let point: XY | null;
    if (kept && keep && end) {
        // An end's length is its intervals', and its direction is kept: nothing moves
        return base;
    } else if (kept && keep && env.snap && straightCorner(base, n, index)) {
        point = cornerAlongOnIntervals(base, n, index, kept, to);
    } else if (kept) {
        point = alongKept(base, n, index, other, kept, to, fit, env);
    } else if (keep && axis && end) {
        point = measuredEnd(was, to, axis, env);
    } else if (keep && axis && env.snap && straightCorner(base, n, index)) {
        point = stickyOnAxis(was, to, axis, (at) =>
            cornerOnAxis(base, n, index, at, axis, env),
        );
    } else if (keep && end) {
        const u = directionFrom(other, to, env);
        if (!u) return base;
        point = along(other, u, length(sub(was, other)));
    } else if (keep && env.snap && straightCorner(base, n, index)) {
        point = cornerOnIntervals(base, n, index, to);
    } else if (fit && axis && env.snap && straightCorner(base, n, index)) {
        point = stickyOnAxis(was, to, axis, (at) =>
            cornerOnMeasured(base, n, index, at, axis, env),
        );
    } else if (fit && env.snap && straightCorner(base, n, index)) {
        point = softSnap(
            to,
            cornerOnWholeIntervals(base, n, index, to, env),
            env,
        );
    } else if (fit && env.snap && (end || was.tension === 0)) {
        point = snappedFree(base, n, index, other, to, env);
    } else {
        point = landPoint(to, env);
    }
    if (!point || length(sub(point, other)) < 1e-9) return base;
    if (was.x === point.x && was.y === point.y) return base;
    const moved = withPointAt(base, index, point);
    // From the center, the far end goes the other way (unlocked, or on the path)
    if (env.fromCenter && end && !keep) {
        const far = index === 0 ? last : 0;
        const q = base.points[far]!;
        return withPointAt(moved, far, {
            x: q.x - (point.x - was.x),
            y: q.y - (point.y - was.y),
        });
    }
    return moved;
}

/**
 * Where point `index` goes dragged to `to` with constrain, along `kept` from `other`, unlocked or
 * on the path: with Fit snapped, where the interval comes out whole; else on half steps (snap on)
 */
function alongKept(
    base: LineParams,
    n: number,
    index: number,
    other: XY,
    kept: XY,
    to: XY,
    fit: boolean,
    env: ToolEnv,
): XY {
    const t = Math.max(dot(sub(to, other), kept), halfStep(env));
    if (!(fit && env.snap))
        return along(other, kept, env.snap ? onUnits(t, halfStep(env)) : t);
    // The nearest whole interval is at most half a step of interval away, about half a step on
    // each of its gaps (fewer than n) along: searched for twice that far and no further, since
    // each try is a layout searched for itself straight across (#596)
    const within = intervalUnit(env) * n;
    return snappedAlong(base, n, index, other, kept, t, env, within);
}

/**
 * The line with point `index` moved, the far end mirroring it with `fromCenter` (an end, unlocked)
 */
function placedAt(
    base: LineParams,
    index: number,
    at: XY,
    env: ToolEnv,
): LineParams {
    const moved = withPointAt(base, index, at);
    const last = base.points.length - 1;
    if (!env.fromCenter || isClosed(base) || (index !== 0 && index !== last))
        return moved;
    const far = index === 0 ? last : 0;
    const was = base.points[index]!;
    const q = base.points[far]!;
    return withPointAt(moved, far, {
        x: q.x - (at.x - was.x),
        y: q.y - (at.y - was.y),
    });
}

/**
 * Where point `index` goes along `u` from `from`, about `t` along, so the interval it changes
 * comes out on whole steps (unlocked); `t` itself when there's no such spot near
 */
function snappedAlong(
    base: LineParams,
    n: number,
    index: number,
    from: XY,
    u: XY,
    t: number,
    env: ToolEnv,
    within?: number,
): XY {
    const unit = intervalUnit(env);
    const counts = cornerGaps(placedAt(base, index, along(from, u, t), env), n);
    const interval = (s: number) =>
        intervalAt(
            placedAt(base, index, along(from, u, s), env),
            n,
            index,
            counts,
        );
    // Each is a layout: the one at `t` is asked for again first
    const atT = interval(t);
    const f = (s: number) => (s === t ? atT : interval(s));
    const target = onUnits(atT, unit);
    // Only as far as the caller can use: each try is a whole layout, searched for itself straight
    // across, so a hundred of them over the whole line freezes a drag (#596)
    const span = within ?? Math.max(t, unit * n);
    const s = solveFor(
        f,
        target,
        t,
        Math.max(1e-6, t - span),
        t + span,
        within !== undefined,
    );
    return along(from, u, s ?? t);
}

/**
 * Where an end or a corner dragged to `to` goes, unlocked: measured ↔ or ↕, with its coordinate
 * that way where the interval is whole steps and the pointer's place (landed) the other way; else
 * where the pointer lands, or along its direction from the point before (on half steps) as far as
 * makes the interval whole when that's near the pointer ({@link softSnap})
 */
function snappedFree(
    base: LineParams,
    n: number,
    index: number,
    other: XY,
    to: XY,
    env: ToolEnv,
): XY {
    const landed = landPoint(to, env);
    const axis = measuredAxis(base);
    if (!axis) {
        const u = unitOf(onHalfSteps(sub(landed, other), env));
        if (!u) return landed;
        // A spot `d` along from where the pointer lands is at least `d` from it, so further than
        // this from there it's never near enough the pointer to take
        const within = softSnapReach(env) + length(sub(landed, to));
        const spot = snappedAlong(
            base,
            n,
            index,
            other,
            u,
            length(sub(landed, other)),
            env,
            within,
        );
        return softSnap(to, spot, env);
    }
    const unit = intervalUnit(env);
    const side = coord(landed, across(axis));
    const at = (c: number) => pointOn(axis, c, side);
    const c0 = coord(landed, axis);
    const counts = cornerGaps(placedAt(base, index, at(c0), env), n);
    const f = (c: number) =>
        intervalAt(placedAt(base, index, at(c), env), n, index, counts);
    const target = onUnits(f(c0), unit);
    const span = unit * n * 2;
    const c = solveFor(f, target, c0, c0 - span, c0 + span);
    return c === null ? landed : at(c);
}

/**
 * How far toward another spot, as a share of the way there, the pointer must go before a corner
 * dragged front to back under ↔ (side to side under ↕) changes spots that way ({@link stickyOnAxis})
 */
export const CORNER_STICK = 0.75;

/**
 * Where a corner measured along `axis`, at `was` when the drag started, goes dragged to `to`, with
 * `spotFor` the spot a pointer picks: that way it keeps `was`'s spot until the pointer is
 * {@link CORNER_STICK} of the way to another, not just past halfway, so a hand's wobble dragging
 * it front to back doesn't flip it a spot sideways and hand its marcher to the other stretch; the
 * other way it follows the pointer as `spotFor` has it. A corner that started off every spot
 * goes to the one nearest the pointer.
 */
function stickyOnAxis(
    was: XY,
    to: XY,
    axis: LineMeasured,
    spotFor: (at: XY) => XY,
): XY {
    const spot = spotFor(to);
    const from = coord(was, axis);
    const gone = coord(spot, axis) - from;
    if (Math.abs(gone) < 1e-6) return spot;
    if (Math.abs(coord(spotFor(was), axis) - from) > 1e-6) return spot;
    const off = (coord(to, axis) - from) / gone;
    if (off >= CORNER_STICK) return spot;
    return pointOn(axis, from, coord(spot, across(axis)));
}

/**
 * How near the pointer, in screen pixels, a whole-interval spot must be for an unlocked point
 * dragged in two directions to snap to it ({@link softSnap}); farther, it follows the pointer
 */
export const SOFT_SNAP_PX = 6;

/**
 * Where a point dragged to `to` goes, unlocked, with `spot` where its intervals come out whole:
 * there when it's within {@link SOFT_SNAP_PX} of the pointer on screen, else where the pointer
 * lands, so the point isn't held to a few far-apart spots
 */
/** How near the pointer, in field units, a spot {@link softSnap} takes must be */
const softSnapReach = (env: ToolEnv) => SOFT_SNAP_PX / (env.zoom || 1);

function softSnap(to: XY, spot: XY | null, env: ToolEnv): XY {
    const reach = softSnapReach(env);
    if (spot && length(sub(spot, to)) <= reach + 1e-9) return spot;
    return landPoint(to, env);
}

/**
 * Where corner `index`, holding a marcher between two straight stretches of a line measured along
 * `axis`, goes dragged to `to` unlocked: that way, the spot nearest the pointer where both its
 * stretches' runs that way come out on whole steps (half steps zoomed in, {@link intervalUnit}),
 * their gaps as they'd be with it there; the other way, where the pointer lands. Where the pointer
 * lands when there's no such spot near.
 */
function cornerOnMeasured(
    p: LineParams,
    n: number,
    index: number,
    to: XY,
    axis: LineMeasured,
    env: ToolEnv,
): XY {
    const landed = landPoint(to, env);
    const side = coord(landed, across(axis));
    const at = (c: number) => pointOn(axis, c, side);
    const { r } = stretchesAt(p, index);
    const count = p.points.length;
    const from = coord(p.points[(index - 1 + count) % count]!, axis);
    const unit = intervalUnit(env);
    const onUnit = (x: number) =>
        x > 1e-9 && Math.abs(x / unit - Math.round(x / unit)) < 1e-6;
    const whole = (c: number) => {
        const q = withPointAt(p, index, at(c));
        const counts = cornerGaps(q, n);
        if (!counts) return false;
        const runs = stretchExtents(q, axis);
        const next = (r + 1) % counts.length;
        return (
            onUnit(runs[r]! / counts[r]!) && onUnit(runs[next]! / counts[next]!)
        );
    };
    // Spots a whole number of units from the point before, nearest the pointer first
    const want = (coord(to, axis) - from) / unit;
    const j0 = Math.round(want);
    for (let d = 0; d <= 2 * n + 2; d++) {
        const js = d === 0 ? [j0] : [j0 - d, j0 + d];
        js.sort((x, y) => Math.abs(x - want) - Math.abs(y - want));
        for (const j of js)
            if (whole(from + j * unit)) return at(from + j * unit);
    }
    return landed;
}

/**
 * Where corner `index`, holding a marcher between two straight stretches, goes dragged to `to`
 * unlocked: where both its stretches' intervals come out on whole steps (half steps zoomed in),
 * their gaps as they'd be with it at `to` and still are there; null when there's no such spot
 */
function cornerOnWholeIntervals(
    p: LineParams,
    n: number,
    index: number,
    to: XY,
    env: ToolEnv,
): XY | null {
    const landed = withPointAt(p, index, landPoint(to, env));
    const counts = cornerGaps(landed, n);
    if (!counts) return null;
    const { r } = stretchesAt(landed, index);
    const k1 = counts[r]!;
    const k2 = counts[(r + 1) % counts.length]!;
    const count = p.points.length;
    const a = p.points[(index - 1 + count) % count]!;
    const b = p.points[(index + 1) % count]!;
    const unit = intervalUnit(env);
    const i1 = onUnits(length(sub(to, a)) / k1, unit);
    const i2 = onUnits(length(sub(to, b)) / k2, unit);
    let best: XY | null = null;
    for (const d1 of [0, -1, 1])
        for (const d2 of [0, -1, 1]) {
            const r1 = (i1 + d1 * unit) * k1;
            const r2 = (i2 + d2 * unit) * k2;
            if (r1 <= 0 || r2 <= 0) continue;
            for (const q of circlesMeet(a, r1, b, r2)) {
                if (best && length(sub(q, to)) >= length(sub(best, to)))
                    continue;
                // Only where its stretches keep those gaps, so the intervals are whole there
                const there = cornerGaps(withPointAt(p, index, q), n);
                if (there?.[r] === k1 && there[(r + 1) % there.length] === k2)
                    best = q;
            }
        }
    return best;
}

/**
 * Where corner `index`, holding a marcher between straight stretches, slides along `u` from the
 * point before with the interval locked (constrain): the whole run of its stretch's gaps nearest
 * `to`, so the stretch before it stays on its intervals
 */
function cornerAlongOnIntervals(
    p: LineParams,
    n: number,
    index: number,
    u: XY,
    to: XY,
): XY {
    const runs = cornerRuns(p, n)!;
    const { r } = stretchesAt(p, index);
    const both = [...runs[r]!, ...runs[(r + 1) % runs.length]!];
    const count = p.points.length;
    const a = p.points[(index - 1 + count) % count]!;
    const want = dot(sub(to, a), u);
    const seams = offsetsOf(both, 0).slice(1, -1);
    const t = seams.reduce((b, o) =>
        Math.abs(o - want) < Math.abs(b - want) ? o : b,
    );
    return along(a, u, t);
}

/**
 * An end of a one-segment line dragged to `to`, worked out as the line from its fixed end (or, with
 * `fromCenter`, about its center, both ends moving):
 *
 * - unlocked (Fit), its length snaps so the interval is whole steps (half zoomed in,
 *   {@link intervalUnit}), pointing the way the pointer is from the fixed end on half steps;
 *   measured ↔ or ↕ that way's distance snaps, the pointer's place (landed) the other way; as an
 *   offset, both ways snap, either can be nought, and the stored offset follows;
 * - locked (Keep interval), it swings round, its length kept; ↔ only front to back and ↕ only side
 *   to side; as an offset it doesn't move at all;
 * - on the path, it goes where it's dragged (landed).
 *
 * `constrain` keeps the line's direction, only its length changing (locked, nothing moves);
 * `fine` or the Snap toggle off leaves the interval where it's dragged.
 */
function dragEnd(
    base: LineParams,
    n: number,
    index: number,
    to: XY,
    env: ToolEnv,
): LineParams {
    const a = base.points[1 - index]!;
    const b = base.points[index]!;
    const keep = base.spacing.mode === "keep" && n > 1;
    const offset = offsetOf(base);
    if (keep && (offset || env.constrain)) return base;
    const center = env.fromCenter === true;
    const mid = lerp(a, b, 0.5);
    const scale = center ? 2 : 1;
    // From the fixed end (or, from the center, the whole line as twice that)
    const fromFixed = (q: XY) => {
        const d = sub(q, center ? mid : a);
        return { x: d.x * scale, y: d.y * scale };
    };
    const drag: EndDrag = {
        was: sub(b, a),
        raw: fromFixed(landPoint(to, env)),
        pointer: fromFixed(to),
        gaps: Math.max(1, n - 1),
        axis: measuredAxis(base),
        offset: offset !== null,
        fit: base.spacing.mode === "fit" && n > 1,
    };
    const v = env.constrain
        ? keptDirection(drag, env)
        : keep
          ? lockedVector(drag, env)
          : unlockedVector(drag, env);
    if (!v || length(v) < 1e-9) return base;
    const start = center ? { x: mid.x - v.x / 2, y: mid.y - v.y / 2 } : a;
    const finish = { x: start.x + v.x, y: start.y + v.y };
    if (
        finish.x === b.x &&
        finish.y === b.y &&
        start.x === a.x &&
        start.y === a.y
    )
        return base;
    const ends = index === 1 ? [start, finish] : [finish, start];
    const points = base.points.map((q, i) => ({ ...q, ...ends[i]! }));
    const moved: LineParams = { ...base, points };
    // Unlocked, a line measured as an offset keeps the offset it's drawn at
    return offset && n > 1
        ? {
              ...moved,
              offset: { x: v.x / drag.gaps, y: v.y / drag.gaps },
          }
        : moved;
}

/**
 * An end of a one-segment line being dragged ({@link dragEnd}), each vector from the fixed end
 * (from the center, twice from it): the line as it was, to where the pointer lands, and to where
 * it is
 */
interface EndDrag {
    readonly was: XY;
    readonly raw: XY;
    readonly pointer: XY;
    readonly gaps: number;
    readonly axis: LineMeasured | null;
    readonly offset: boolean;
    /** The interval unlocked: it snaps to whole steps */
    readonly fit: boolean;
}

/**
 * The line kept on its direction (`constrain`), only its length changing: when snapping, the way
 * the interval measures it on its units (whole steps unlocked, else half steps): along the line,
 * or its larger part that way (an axis, or an offset's)
 */
function keptDirection(d: EndDrag, env: ToolEnv): XY | null {
    const u = unitOf(d.was);
    if (!u) return null;
    let k = Math.max(dot(d.pointer, u), 1e-9);
    if (env.snap) {
        const part = d.axis
            ? Math.abs(d.axis === "x" ? u.x : u.y)
            : d.offset
              ? Math.max(Math.abs(u.x), Math.abs(u.y))
              : 1;
        const per = d.fit ? intervalUnit(env) * d.gaps : halfStep(env);
        k = onUnits((k * part) / per, 1) * (per / part);
    }
    return { x: u.x * k, y: u.y * k };
}

/**
 * The line locked (Keep interval): measured ↔ or ↕ it keeps that way's distance and takes the
 * pointer's place the other way; else it swings round, pointing the way the pointer is in the
 * knob's steps ({@link swungDirection}), its length kept
 */
function lockedVector(d: EndDrag, env: ToolEnv): XY | null {
    if (d.axis)
        return pointOn(
            d.axis,
            coord(d.was, d.axis),
            coord(d.raw, across(d.axis)),
        );
    const u = swungDirection(d.pointer, env);
    if (!u) return null;
    const l = length(d.was);
    return { x: u.x * l, y: u.y * l };
}

/**
 * The line unlocked (Fit), snapping so the interval is whole steps (half zoomed in): an offset's
 * two parts each, either nought; measured ↔ or ↕ that way's distance, the pointer's place the
 * other way; else its length, pointing the way the pointer is in the knob's steps
 * ({@link swungDirection}). On the path, with
 * `fine` or the Snap toggle off, where the pointer lands.
 */
function unlockedVector(d: EndDrag, env: ToolEnv): XY | null {
    if (!d.fit || !env.snap) return d.raw;
    const per = intervalUnit(env) * d.gaps;
    if (d.offset)
        return {
            x: onUnits(d.raw.x / per, 1, true) * per,
            y: onUnits(d.raw.y / per, 1, true) * per,
        };
    if (d.axis)
        return pointOn(
            d.axis,
            onUnits(
                coord(d.raw, d.axis) / per,
                1,
                false,
                coord(d.was, d.axis),
            ) * per,
            coord(d.raw, across(d.axis)),
        );
    const u = swungDirection(d.pointer, env);
    if (!u) return null;
    const l = onUnits(length(d.pointer) / per, 1) * per;
    return { x: u.x * l, y: u.y * l };
}

/** The other axis */
const across = (axis: LineMeasured): LineMeasured => (axis === "x" ? "y" : "x");

/** The point `along` that way on `axis` and `side` the other way */
const pointOn = (axis: LineMeasured, along: number, side: number): XY =>
    axis === "x" ? { x: along, y: side } : { x: side, y: along };

/**
 * Where an end of a line measured along `axis` goes, dragged to `to` in Keep interval: where it is
 * that way, so its run keeps its length, and where the pointer lands the other way
 */
function measuredEnd(was: XY, to: XY, axis: LineMeasured, env: ToolEnv): XY {
    return pointOn(
        axis,
        coord(was, axis),
        coord(landPoint(to, env), across(axis)),
    );
}

/**
 * Where corner `index` of a line measured along `axis` can stand in Keep interval: a whole run of
 * the gaps its two stretches hold from the point before it that way, at the seam nearest `to`, and
 * where the pointer lands the other way
 */
function cornerOnAxis(
    p: LineParams,
    n: number,
    index: number,
    to: XY,
    axis: LineMeasured,
    env: ToolEnv,
): XY {
    const runs = cornerRuns(p, n)!;
    const r = lineStretches(p).findIndex((stretch) => stretch.to === index);
    const both = [...runs[r]!, ...runs[r + 1]!];
    const a = p.points[index - 1]!;
    const way = Math.sign(coord(p.points[index + 1]!, axis) - coord(a, axis));
    const seams = offsetsOf(both, 0).slice(1, -1);
    const want = (coord(to, axis) - coord(a, axis)) * way;
    const best = seams.reduce((b, o) =>
        Math.abs(o - want) < Math.abs(b - want) ? o : b,
    );
    return pointOn(
        axis,
        coord(a, axis) + way * best,
        coord(landPoint(to, env), across(axis)),
    );
}

/**
 * The stretches either side of point `index`: the one ending on it and the one after, round a
 * closed line (#529); undefined where there's none
 */
function stretchesAt(p: LineParams, index: number) {
    const stretches = lineStretches(p);
    const count = p.points.length;
    const r = stretches.findIndex((stretch) => stretch.to % count === index);
    if (r < 0) return { r, before: undefined, after: undefined };
    const after = isClosed(p)
        ? stretches[(r + 1) % stretches.length]
        : stretches[r + 1];
    return { r, before: stretches[r], after };
}

/**
 * Whether point `index` is a corner holding a marcher with a straight stretch on each side: the
 * stretches whose lengths {@link cornerOnIntervals} can make whole runs of gaps
 */
function straightCorner(p: LineParams, n: number, index: number): boolean {
    if (p.points[index]!.tension !== 0 || !holdsMarcher(p, index)) return false;
    if (!cornerGaps(p, n)) return false;
    const { before, after } = stretchesAt(p, index);
    const segments = lineSegments(p);
    return [before, after].every(
        (stretch) =>
            stretch !== undefined &&
            stretch.to - stretch.from === 1 &&
            segments[stretch.from % segments.length]!.type === "line",
    );
}

/**
 * Where corner `index` can stand with its neighbors where they are and each of its two straight
 * stretches a whole run of the gaps the two hold now, in order (one typed interval, or the groups'
 * gaps, #526): the spot nearest `to`, or null when there's none
 */
function cornerOnIntervals(
    p: LineParams,
    n: number,
    index: number,
    to: XY,
): XY | null {
    const runs = cornerRuns(p, n)!;
    const { r } = stretchesAt(p, index);
    const both = [...runs[r]!, ...runs[(r + 1) % runs.length]!];
    const whole = sum(both);
    const count = p.points.length;
    const a = p.points[(index - 1 + count) % count]!;
    const b = p.points[(index + 1) % count]!;
    let best: XY | null = null;
    let ra = 0;
    for (let k = 1; k < both.length; k++) {
        ra += both[k - 1]!;
        for (const q of circlesMeet(a, ra, b, whole - ra))
            if (!best || length(sub(q, to)) < length(sub(best, to))) best = q;
    }
    return best;
}

/** Where the circle about `a` of radius `ra` meets the one about `b` of radius `rb` */
function circlesMeet(a: XY, ra: number, b: XY, rb: number): XY[] {
    const d = sub(b, a);
    const l = length(d);
    if (l < 1e-9 || l > ra + rb + 1e-9 || l < Math.abs(ra - rb) - 1e-9)
        return [];
    const along = (l * l + ra * ra - rb * rb) / (2 * l);
    const h = Math.sqrt(Math.max(0, ra * ra - along * along));
    const u = { x: d.x / l, y: d.y / l };
    const mid = { x: a.x + u.x * along, y: a.y + u.y * along };
    if (h < 1e-9) return [mid];
    return [
        { x: mid.x - u.y * h, y: mid.y + u.x * h },
        { x: mid.x + u.y * h, y: mid.y - u.x * h },
    ];
}

/**
 * The line with a point added on segment `index`: a corner between two corners, so a straight
 * line looks the same, else as smooth as the smoother end (#525). A point that holds a marcher
 * ({@link holdsMarcher}) lands on the spot of the `n` marchers nearest the segment's midpoint, so
 * splitting moves no marcher and changes no interval (owner feedback on #596); one that holds none
 * splits halfway along it, on its curve. On a segment with no spot inside it (one gap) the point
 * splits halfway and holds no marcher (`marcher: false`, Even spacing), so every spot stays put.
 */
export function splitSegment(
    p: LineParams,
    index: number,
    n?: number,
): LineParams {
    if (index < 0 || index >= lineSegments(p).length) return p;
    // A closed line's last segment runs back to its first point (#529)
    const a = p.points[index]!;
    const b = p.points[(index + 1) % p.points.length]!;
    const halfway = segmentMidpoint(p, index);
    const split = (at: XY, more?: Partial<LinePoint>): LineParams => ({
        ...p,
        points: [
            ...p.points.slice(0, index + 1),
            { ...withTension(Math.max(a.tension, b.tension))(at), ...more },
            ...p.points.slice(index + 1),
        ],
    });
    const atMidpoint = split(halfway);
    if (n === undefined || !holdsMarcher(atMidpoint, index + 1))
        return atMidpoint;
    // A held point is a corner between corners, so the segment is straight
    const spot = spotInside(lineSpots(p, n), a, b, halfway);
    if (spot) return split(spot);
    // With no spot inside, a marcher there would move the others: the point takes none (owner).
    // On the path no point holds a marcher, so nothing is set there
    return p.spacing.mode === "path"
        ? atMidpoint
        : split(halfway, { marcher: false });
}

/** Of `spots`, the one strictly inside the straight segment from `a` to `b` nearest `to` */
function spotInside(spots: readonly XY[], a: XY, b: XY, to: XY): XY | null {
    const d = sub(b, a);
    const l = length(d);
    if (l < 1e-9) return null;
    let best: XY | null = null;
    for (const spot of spots) {
        const t = dot(sub(spot, a), d) / (l * l);
        const off = Math.abs(cross(d, sub(spot, a))) / l;
        if (off > 1e-6 || t * l < 1e-6 || (1 - t) * l < 1e-6) continue;
        if (!best || length(sub(spot, to)) < length(sub(best, to)))
            best = { x: spot.x, y: spot.y };
    }
    return best;
}

/**
 * The line as long as `n` marchers `interval` apart need, grown or shrunk from its pivot (or the
 * run's anchor, `env.anchor`), in Keep interval. With every corner holding a marcher each stretch
 * becomes a whole number of intervals long, its direction and shape kept (#524). A line on the path keeps
 * its drawn length and takes the interval. One group of {@link withGroups}.
 */
export function withInterval(
    p: LineParams,
    n: number,
    interval: number,
    env: SizeEnv,
): LineParams {
    return withGroups(p, n, [{ interval }], env);
}

/**
 * The line spaced by `groups` (#526), sized to them from its pivot (or `env.anchor`): in Keep
 * interval as long as their gaps add up to, and with every corner holding a marcher each stretch
 * as long as its run of the gaps ({@link cornerRuns}), its direction kept (#524). A line on the
 * path keeps its drawn length and takes the groups. Measured ↔ or ↕ (#527), the lengths are that
 * way, and when snapping its start then slides along it onto the grid that way, so every spot
 * lands on it.
 */
export function withGroups(
    p: LineParams,
    n: number,
    groups: readonly LineGroup[],
    env: SizeEnv,
): LineParams {
    if (p.spacing.mode === "path" && !isClosed(p))
        return { ...p, spacing: { ...p.spacing, groups } };
    const kept: LineParams = { ...p, spacing: { mode: "keep", groups } };
    if (n <= 1) return kept;
    // Measured as an offset, the offset sets the length (its interval is the offset's length)
    const offset = offsetOf(kept);
    if (offset)
        return sizedToOffset(
            {
                ...kept,
                spacing: {
                    mode: "keep",
                    groups: [{ interval: length(offset) }],
                },
            },
            n,
            env,
        );
    const axis = measuredAxis(kept);
    const runs = cornerRuns(kept, n);
    const gaps = lineGaps(kept, n)!;
    const size = sum(gaps);
    // A closed line can't set each stretch on its own and still meet its first point: it's grown
    // as a whole to its gaps round (#529), a corner off its interval noted
    if (runs && isClosed(p))
        return smooth(p)
            ? scaled(kept, runScale(kept, gaps), env)
            : scaled(kept, size / linePath(p).length, env);
    if (runs)
        return onGrid(pinned(kept, onIntervals(kept, runs), env), axis, env);
    if (axis)
        return onGrid(
            scaled(kept, size / axisLength(kept, axis), env),
            axis,
            env,
        );
    if (p.points.length === 2)
        return scaled(kept, size / linePath(p).length, env);
    return scaled(kept, runScale(kept, gaps), env);
}

/** What sizing a line in Keep interval needs: where it grows from, and the grid */
export type SizeEnv = Pick<ToolEnv, "pivot" | "anchor"> &
    Partial<Pick<ToolEnv, "snap" | "gridSnap">>;

/**
 * A line measured along `axis` slid along itself (first point to last) until its start is on the
 * grid that way, when snapping: exactly, so its spots are too
 */
function onGrid(
    p: LineParams,
    axis: LineMeasured | null,
    env: SizeEnv,
): LineParams {
    if (!axis || !env.snap || !env.gridSnap) return p;
    const first = p.points[0]!;
    const off = coord(env.gridSnap(first), axis) - coord(first, axis);
    const d = sub(p.points.at(-1)!, first);
    const k = off / coord(d, axis);
    if (off === 0 || !Number.isFinite(k)) return p;
    return {
        ...p,
        points: p.points.map((q) => ({
            ...q,
            ...pointOn(
                axis,
                coord(q, axis) + off,
                coord(q, across(axis)) + coord(d, across(axis)) * k,
            ),
        })),
    };
}

/**
 * Each stretch (corner to corner) scaled about its start so its run of gaps reaches it end to end
 * as the line measures them (↔ or ↕, that way), in its own direction and shape, from the first
 * point
 */
function onIntervals(p: LineParams, runs: readonly number[][]): LineParams {
    const points = [...p.points];
    const paths = stretchPaths(p);
    const across = stretchAcross(p);
    const axis = measuredAxis(p);
    const extents = axis ? stretchExtents(p, axis) : [];
    let at: XY = p.points[0]!;
    lineStretches(p).forEach(({ from, to }, r) => {
        const fit = axis
            ? extents[r]! / sum(runs[r]!)
            : fitScale(paths[r]!, runs[r]!, across[r]!);
        const k = fit > 0 ? 1 / fit : 1;
        const start = p.points[from]!;
        for (let i = from + 1; i <= to; i++) {
            const q = p.points[i]!;
            points[i] = {
                ...q,
                x: at.x + (q.x - start.x) * k,
                y: at.y + (q.y - start.y) * k,
            };
        }
        at = points[to]!;
    });
    return { ...p, points };
}

/**
 * How much bigger the line must be for a run of `gaps` around its corners to reach from end to end
 */
function runScale(p: LineParams, gaps: readonly number[]): number {
    const path = linePath(p);
    if (!(path.length > 0)) return 1;
    const across = lineAcross(p);
    if (!across) return sum(gaps) / path.length;
    // The run of chords on the line `k` times as big, against its length
    const over = (k: number) =>
        chordOffsets(
            path,
            0,
            gaps.map((gap) => gap / k),
            across,
        ).at(-1)! - path.length;
    let lo = 1e-6;
    let hi = Math.max(1, sum(gaps) / path.length) * 2;
    while (over(hi) > 0) hi *= 2;
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (over(mid) > 0) lo = mid;
        else hi = mid;
    }
    return hi;
}

/** The line `k` times as big, its pivot staying where it is on the field */
export function scaled(
    p: LineParams,
    k: number,
    env: Pick<ToolEnv, "pivot" | "anchor">,
): LineParams {
    // A line with no length has no direction to grow along
    if (!(lineFrame(p).halfWidth > 1e-9) || !Number.isFinite(k)) return p;
    const first = p.points[0]!;
    const grown = {
        ...p,
        points: p.points.map((q) => ({
            ...q,
            x: first.x + (q.x - first.x) * k,
            y: first.y + (q.y - first.y) * k,
        })),
    };
    return pinned(p, grown, env);
}

/** `next` moved so its pivot is where `was`'s is on the field (or the run's anchor) */
function pinned(
    was: LineParams,
    next: LineParams,
    env: Pick<ToolEnv, "pivot" | "anchor">,
): LineParams {
    const key = env.pivot ?? pivotOf(was);
    const fixed = env.anchor ?? pivotPoint(lineFrame(was), key);
    const now = pivotPoint(lineFrame(next), key);
    const d = sub(fixed, now);
    return {
        ...next,
        points: next.points.map((q) => ({ ...q, x: q.x + d.x, y: q.y + d.y })),
    };
}

/** The line in another spacing mode, its points as they are; Keep interval sized to its run */
export function withSpacing(
    p: LineParams,
    n: number,
    mode: "fit" | "keep" | LineAnchor,
    env: ToolEnv,
): LineParams {
    const interval = lineInterval(p, n);
    // Unlocked, the interval it had is kept as where it started from (mixed groups' proportions)
    if (mode === "fit")
        return p.spacing.mode === "fit"
            ? p
            : { ...p, spacing: { mode: "fit", groups: p.spacing.groups } };
    // Nothing to space with one marcher, or a line with no length: Fit is all there is
    if (!(interval > 0)) return p;
    // Unlocked, `offset` follows only some drags (a one-segment end, a settle): a line bent and
    // straightened again, say, keeps an older one. Locking keeps the offset it shows now
    if (p.spacing.mode === "fit" && p.offset && offsetBlock(p) === null) {
        const now = lineOffset(p, n);
        if (Math.hypot(now.x, now.y) > 1e-9) p = { ...p, offset: now };
    }
    const groups =
        p.spacing.mode !== "fit" ? p.spacing.groups : fitLocked(p, n, interval);
    if (mode === "keep")
        return p.spacing.mode === "keep"
            ? p
            : withGroups({ ...p, spacing: FIT }, n, groups, env);
    return { ...p, spacing: { mode: "path", groups, anchor: mode } };
}

/**
 * The groups a line unlocked (Fit) is locked at: as it lays them out now (mixed groups scaled to
 * fit it, else its `interval`), or exactly as typed while it's still the length they give
 */
function fitLocked(p: LineParams, n: number, interval: number): LineGroup[] {
    const typed = p.spacing.groups;
    const now = hasGroups(p) ? fitGroupsNow(p, n) : [{ interval }];
    const same =
        typed !== undefined &&
        typed.length === now.length &&
        typed.every(
            (g, i) =>
                g.count === now[i]!.count &&
                Math.abs(g.interval - now[i]!.interval) <= 1e-9 * g.interval,
        );
    return same ? [...typed] : now;
}

/** Fit's mixed groups (#526) as the line lays them out now, scaled to fit it */
export function fitGroupsNow(p: LineParams, n: number): LineGroup[] {
    const groups = p.spacing.groups ?? [];
    const raw = fitRawGaps(p, n);
    const k = raw ? fitGroupScale(p, raw) : 1;
    return groups.map((g) => ({ ...g, interval: g.interval * k }));
}

/**
 * A typed interval, or groups (#526), set on the line: locked (Keep interval, or the run on the
 * path) it's kept, as {@link withGroups}; unlocked (Fit) the line is sized to it the same way, and
 * stays unlocked with it as where it started from, so a drag changes it again
 */
export function withTyped(
    p: LineParams,
    n: number,
    groups: readonly LineGroup[],
    env: SizeEnv,
): LineParams {
    if (p.spacing.mode !== "fit") return withGroups(p, n, groups, env);
    const sized = withGroups({ ...p, spacing: FIT }, n, groups, env);
    return { ...sized, spacing: { mode: "fit", groups } };
}

/**
 * The line measured `measure`: along the path (null), straight across or along an axis (↔, ↕),
 * from the Measured menu (#527). The typed interval (or groups) stays the same, now measured the
 * new way, so Keep interval resizes; Fit leaves the line as it is. A line that doesn't go one way
 * along an axis can't take it.
 */
export function withMeasured(
    p: LineParams,
    n: number,
    measure: LineMeasure | null,
    env: SizeEnv,
): LineParams {
    if ((p.measured ?? null) === measure) return p;
    if (
        (measure === "x" || measure === "y") &&
        measuredBlock(p, measure) !== null
    )
        return p;
    const { measured: _was, offset: _offset, ...rest } = p;
    // Measured as an offset, from the line as it is: in Keep interval its length doesn't change
    if (measure === "offset") {
        if (offsetBlock(p) !== null || n <= 1) return p;
        const offset = lineOffset(p, n);
        if (!(length(offset) > 1e-9)) return p;
        return keptToRun({ ...rest, measured: "offset", offset }, n, env);
    }
    const next: LineParams = measure ? { ...rest, measured: measure } : rest;
    return keptToRun(next, n, env);
}

/**
 * A line in Keep interval sized to its run again (its groups as they are), after a change that can
 * leave it longer or shorter than its marchers need; anything else as it is
 */
export function keptToRun(p: LineParams, n: number, env: SizeEnv): LineParams {
    return p.spacing.mode === "keep" && n > 1
        ? withGroups(p, n, p.spacing.groups, env)
        : p;
}

/**
 * After a turn or flip (the kind's `settle`): a line turned square to the field goes back onto the
 * grid as a box does ({@link squareOnGrid}); a line in Keep interval measured ↔ or ↕ covers a
 * different distance that way once turned, so it's sized to its run again (#527)
 */
export function settleLine(
    base: LineParams,
    n: number,
    env: SizeEnv & Partial<Pick<ToolEnv, "stepPx">>,
): LineParams {
    const p = squareOnGrid(base, env);
    // Measured as an offset, the offset turns with the line. Turned square to the field it's back
    // on half steps when snapping, rid of the turn's float noise; turned off square it's exactly
    // the turned one, so a locked line keeps its interval and points where it was turned (ADR
    // 0006, decision 10), the numbers then fractions
    if (offsetOf(p) && n > 1) {
        const d = sub(p.points.at(-1)!, p.points[0]!);
        let offset = { x: d.x / (n - 1), y: d.y / (n - 1) };
        if (env.snap && env.stepPx) {
            const unit = env.stepPx / 2;
            const on = {
                x: Math.round(offset.x / unit) * unit,
                y: Math.round(offset.y / unit) * unit,
            };
            const square =
                Math.abs(on.x - offset.x) <= 1e-6 * unit &&
                Math.abs(on.y - offset.y) <= 1e-6 * unit;
            if (square && length(on) > 1e-9) offset = on;
        }
        return keptToRun({ ...p, offset }, n, env);
    }
    return measuredAxis(p) ? keptToRun(p, n, env) : p;
}

/** Whether `q` is on the half-step grid, within float noise */
const onTheGrid = (q: XY, unit: number): boolean =>
    [q.x, q.y].every((v) => Math.abs(v / unit - Math.round(v / unit)) < 1e-6);

/**
 * When snapping, a line turned square to the field put back on the grid as a box is (ADR 0006,
 * decision 10): moved so the point nearest its pivot is on the grid, so every point is when they
 * are a whole number of half steps apart each way. An open line in Fit whose ends are square to
 * each other (level or plumb) is also stretched from that point, along itself, so its far end lands
 * on the grid; locked (Keep interval, or on the path), its length is its intervals', which it keeps.
 * A line with its points off the grid's shape (turned 15° from level, say) stays where it is, as a
 * box turned off the field's axes does.
 */
function squareOnGrid(
    p: LineParams,
    env: SizeEnv & Partial<Pick<ToolEnv, "stepPx">>,
): LineParams {
    if (!env.snap || !env.gridSnap || !env.stepPx) return p;
    const unit = env.stepPx / 2;
    const first = p.points[0]!;
    const shaped = p.points.every((q) => onTheGrid(sub(q, first), unit));
    const ends = sub(p.points.at(-1)!, first);
    // Level or plumb, and straight: every point on the line between the ends, so stretching it
    // along itself reshapes nothing
    const level =
        !isClosed(p) &&
        length(ends) > 1e-9 &&
        Math.min(Math.abs(ends.x), Math.abs(ends.y)) < 1e-9 * length(ends) &&
        p.points.every(
            (q) =>
                Math.abs(cross(ends, sub(q, first))) <= 1e-9 * dot(ends, ends),
        );
    if (!shaped && !level) return p;
    const pivot = pivotPoint(lineFrame(p), env.pivot ?? pivotOf(p));
    let held = 0;
    p.points.forEach((q, i) => {
        if (length(sub(q, pivot)) < length(sub(p.points[held]!, pivot)) - 1e-9)
            held = i;
    });
    const from = p.points[held]!;
    const landed = env.gridSnap(from);
    let points = p.points.map((q) => ({
        ...q,
        x: q.x + landed.x - from.x,
        y: q.y + landed.y - from.y,
    }));
    if (level && p.spacing.mode === "fit") {
        // Stretched from the held point so the end farther from it lands on the grid
        const lastIndex = points.length - 1;
        const far =
            length(sub(points[0]!, landed)) >
            length(sub(points[lastIndex]!, landed))
                ? 0
                : lastIndex;
        const reach = sub(points[far]!, landed);
        const span = length(reach);
        const to = Math.round(span / unit) * unit;
        if (span > 1e-9 && to > 1e-9 && Math.abs(to - span) > 1e-9) {
            const k = to / span;
            points = points.map((q) => ({
                ...q,
                x: landed.x + (q.x - landed.x) * k,
                y: landed.y + (q.y - landed.y) * k,
            }));
        }
    }
    // Float noise from turning: exactly on the grid where a point is within it
    points = points.map((q) =>
        onTheGrid(q, unit) ? { ...q, ...env.gridSnap!(q) } : q,
    );
    const moved = points.some(
        (q, i) => q.x !== p.points[i]!.x || q.y !== p.points[i]!.y,
    );
    return moved ? { ...p, points } : p;
}

/** The line moved by `delta`, its first point on the half-step grid when snapping */
export function moveLine(
    base: LineParams,
    delta: XY,
    env: ToolEnv,
): LineParams {
    const first = base.points[0]!;
    const landed = env.gridSnap({ x: first.x + delta.x, y: first.y + delta.y });
    const d = sub(landed, first);
    if (d.x === 0 && d.y === 0) return base;
    return {
        ...base,
        points: base.points.map((q) => ({ ...q, x: q.x + d.x, y: q.y + d.y })),
    };
}

/** How far `at` is from the segment from `a` to `b` */
function fromSegment(at: XY, a: XY, b: XY): number {
    const d = sub(b, a);
    const l2 = d.x * d.x + d.y * d.y;
    const t =
        l2 === 0
            ? 0
            : Math.max(
                  0,
                  Math.min(1, ((at.x - a.x) * d.x + (at.y - a.y) * d.y) / l2),
              );
    return length(sub(at, { x: a.x + d.x * t, y: a.y + d.y * t }));
}

/**
 * Whether a press at `at` is on the line: within half its interval of it, or of its spots, but
 * never more than a step away (or the handle reach, when that's larger), so a long line with few
 * marchers doesn't take presses meant for the empty field
 */
export function onLine(
    p: LineParams,
    n: number,
    at: XY,
    env?: Pick<ToolEnv, "stepPx" | "hitRadius">,
): boolean {
    const half = lineInterval(p, n) / 2;
    const reach = Math.max(
        env ? Math.max(Math.min(half, env.stepPx), env.hitRadius) : half,
        1e-9,
    );
    const near = (a: XY, b: XY) => fromSegment(at, a, b) <= reach;
    const outline = lineOutline(p);
    if (isClosed(p)) outline.push(outline[0]!);
    if (outline.slice(1).some((b, i) => near(outline[i]!, b))) return true;
    // A run on the path can reach past the drawn line's ends
    const spots = lineSpots(p, n, env?.stepPx);
    return spots.length > 1 && near(spots[0]!, spots.at(-1)!);
}

/**
 * A new line through `frame`, as if drawn along its longer side, through its middle: the shape
 * turned into a line keeps its frame. A frame with no size gets a line of 2-step intervals.
 */
export function lineInFrame(
    frame: ShapeFrame,
    n: number,
    env: ToolEnv,
): LineParams {
    const across = frame.halfWidth >= frame.halfDepth;
    let half = Math.max(frame.halfWidth, frame.halfDepth);
    if (half < halfStep(env)) half = Math.max(1, n - 1) * env.stepPx;
    const end = (side: number) =>
        frameToField(
            frame,
            across ? { x: side * half, y: 0 } : { x: 0, y: side * half },
        );
    const flipped = across ? frame.flipX : frame.flipY;
    const [a, b] = flipped ? [end(1), end(-1)] : [end(-1), end(1)];
    // It reads the turn the shape had (ADR 0006, decision 10), not the way it happens to point
    const line: LineParams = {
        points: [corner(env.gridSnap(a)), corner(env.gridSnap(b))],
        spacing: FIT,
    };
    return withTurn(line, frame.rotation);
}

/**
 * {@link lineInFrame} as a Curve (#525): its two ends and, between them, a point half as far off
 * the line as they are apart, every point smooth
 */
export function curveInFrame(
    frame: ShapeFrame,
    n: number,
    env: ToolEnv,
): LineParams {
    const line = lineInFrame(frame, n, env);
    const [a, b] = line.points as [LinePoint, LinePoint];
    const d = sub(b, a);
    // Toward the back of the field for a line drawn left to right
    const apex = env.gridSnap({
        x: (a.x + b.x) / 2 + d.y / 4,
        y: (a.y + b.y) / 2 - d.x / 4,
    });
    return { ...line, points: [a, apex, b].map(withTension(SMOOTH)) };
}

/** The line with point `index` of `tension` (0 a corner, more a smooth point, #525) */
export function setTension(
    p: LineParams,
    index: number,
    tension: number,
): LineParams {
    const was = p.points[index];
    if (!was || was.tension === tension) return p;
    return {
        ...p,
        points: p.points.map((q, i) => (i === index ? { ...q, tension } : q)),
    };
}

/** A point's own answer to whether it holds a marcher dropped: it follows the line again */
const followsLine = ({ marcher: _marcher, ...q }: LinePoint): LinePoint => q;

/**
 * The line with point `index` holding a marcher always (true), never forced to (false), or as the
 * line says (undefined), from the point's menu (#569). Keep interval is sized to its run again,
 * since its stretches change.
 */
export function setPointMarcher(
    p: LineParams,
    n: number,
    index: number,
    marcher: boolean | undefined,
    env: SizeEnv,
): LineParams {
    const was = p.points[index];
    if (!was || was.marcher === marcher) return p;
    const next: LineParams = {
        ...p,
        points: p.points.map((q, i) =>
            i !== index
                ? q
                : marcher === undefined
                  ? followsLine(q)
                  : { ...q, marcher },
        ),
    };
    return keptToRun(next, n, env);
}

/** The fewest points a line can have: two open, three closed (#529) */
export const minPoints = (p: LineParams): number => (isClosed(p) ? 3 : 2);

/**
 * The line without point `index` (#569), never under {@link minPoints}; Keep interval sized to
 * its run again
 */
export function deletePoint(
    p: LineParams,
    n: number,
    index: number,
    env: SizeEnv,
): LineParams {
    if (!p.points[index] || p.points.length <= minPoints(p)) return p;
    const next = { ...p, points: p.points.filter((_, i) => i !== index) };
    // A new end holds a marcher whatever it said
    const last = next.points.length - 1;
    const points = isClosed(next)
        ? next.points
        : next.points.map((q, i) =>
              i === 0 || i === last ? followsLine(q) : q,
          );
    return keptToRun({ ...next, points }, n, env);
}

/**
 * A closed line opened at point `index` (#569) so its marchers keep their spots: that point its
 * start, holding one, round through every point to its end one gap back along the closing
 * stretch, its fill dropped. When the point holds a spot it opens on it as {@link openLine} does,
 * corners switch turned over if that's what keeps the spots; a curve's new ends bend it a little
 * differently, so its spots stay only nearly. When it holds none (a smooth point, or one kept
 * even through) the spots move along to start on it, the end the width of its gap back, and Keep
 * interval is sized to its run again. Under two marchers it ends at the point before.
 */
export function openAt(
    p: LineParams,
    n: number,
    index: number,
    env: SizeEnv,
): LineParams {
    const at = p.points[index];
    if (!isClosed(p) || !at) return p;
    const { closed: _closed, distribution: _distribution, ...rest } = p;
    const outline: LineParams = { ...rest, closed: true };
    const path = linePath(outline);
    const L = path.length;
    const from = segmentStarts(outline)[index]!;
    const round = (s: number) => ((s % L) + L) % L;
    const start = (q: LineParams): LineParams => ({
        ...q,
        points: [followsLine(at), ...q.points.slice(1)],
    });
    if (n < 2) {
        const points = [
            ...p.points.slice(index),
            ...p.points.slice(0, index),
        ].map((q, i, all) =>
            i === 0 || i === all.length - 1 ? followsLine(q) : q,
        );
        return { ...rest, points };
    }
    const spots = lineSpots(outline, n);
    const tolerance = 1e-6 * Math.max(1, L);
    // How far round from the point each spot is, one on it nought
    const ahead = spots.map((spot) => {
        const d = round((spot.s ?? path.project(spot)) - from);
        return d > L - tolerance ? 0 : d;
    });
    const k = ahead.findIndex((d) => d < tolerance);
    if (k >= 0) {
        const span = ahead[(k - 1 + n) % n]!;
        const opened = start(openedOver(outline, path, from, span));
        const same = sameSpots(spots, n, tolerance);
        if (same(opened)) return opened;
        if (same(flipCorners(opened))) return flipCorners(opened);
        return keptToRun(opened, n, env);
    }
    const gap = Math.min(...ahead) + L - Math.max(...ahead);
    return keptToRun(start(openedOver(outline, path, from, L - gap)), n, env);
}

/** Whether segment `index` runs straight from its point to the next */
export const segmentStraight = (p: LineParams, index: number): boolean =>
    lineSegments(p)[index]?.type === "line";

/**
 * The line with segment `index` straight (both its points corners) or curved (both smooth, a
 * corner made {@link SMOOTH}) (#569)
 */
export function setSegmentCurved(
    p: LineParams,
    index: number,
    curved: boolean,
): LineParams {
    const count = p.points.length;
    if (index < 0 || index >= lineSegments(p).length) return p;
    const ends = new Set([index, (index + 1) % count]);
    const tension = (q: LinePoint) =>
        curved ? (q.tension > 0 ? q.tension : SMOOTH) : 0;
    if (p.points.every((q, i) => !ends.has(i) || q.tension === tension(q)))
        return p;
    return {
        ...p,
        points: p.points.map((q, i) =>
            ends.has(i) ? { ...q, tension: tension(q) } : q,
        ),
    };
}

/**
 * Which way from a smooth point one end of its tangent bar sits (#557): `1` toward the next point,
 * `-1` back toward the one before
 */
export type TangentSide = 1 | -1;

/**
 * Where point `index`'s handle on `side` would be at tension 1: the curve's own handle there, or,
 * at an open line's end, where there's no segment that way, the other side's mirrored through the
 * point so the bar still runs both ways
 */
function fullHandle(p: LineParams, index: number, side: TangentSide): XY {
    const count = p.points.length;
    const closed = isClosed(p);
    const has = (s: TangentSide) =>
        closed || (s === 1 ? index < count - 1 : index > 0);
    const own = (s: TangentSide) =>
        s === 1
            ? catmullRomSpan(p.points, index, closed).c1
            : catmullRomSpan(p.points, (index - 1 + count) % count, closed).c2;
    if (has(side)) return own(side);
    const q = p.points[index]!;
    const other = own(side === 1 ? -1 : 1);
    return { x: 2 * q.x - other.x, y: 2 * q.y - other.y };
}

/**
 * Where one end of smooth point `index`'s tangent bar sits (#525, #557): along the line's way
 * through it on `side`, as far out as its tension takes the curve's handle; null for a corner
 */
export function tensionHandle(
    p: LineParams,
    index: number,
    side: TangentSide = 1,
): XY | null {
    const q = p.points[index];
    if (!q || q.tension === 0) return null;
    return lerp(q, fullHandle(p, index, side), q.tension);
}

/**
 * One end of point `index`'s tangent bar dragged to `to`: the tension as far out along the curve's
 * way on `side` as the pointer went, in tenths when snapping, 0 (a corner) at or behind the point
 * (#525, #557)
 */
export function dragTension(
    base: LineParams,
    index: number,
    to: XY,
    env: ToolEnv,
    side: TangentSide = 1,
): LineParams {
    const q = base.points[index];
    if (!q) return base;
    const d = sub(fullHandle(base, index, side), q);
    const l2 = dot(d, d);
    if (!(l2 > 1e-12)) return base;
    let tension = Math.min(MAX_TENSION, Math.max(0, dot(sub(to, q), d) / l2));
    if (env.snap) tension = Math.round(tension * 10) / 10;
    return setTension(base, index, tension);
}

/** How far along the line a field point is, for keeping marchers' order along it */
export const alongLine = (p: LineParams, point: XY): number =>
    linePath(p).project(point);

/**
 * The line closed (#529): its last point joined to its first, filled as its outline. A typed
 * interval or groups (#526) are kept, the line grown or shrunk from its pivot to its gaps round;
 * a run on the path keeps its spacing that way. Under three points there's nothing to close.
 */
export function closeLine(
    p: LineParams,
    n: number,
    env: Pick<ToolEnv, "pivot" | "anchor">,
): LineParams {
    if (isClosed(p) || p.points.length < 3) return p;
    const closed: LineParams = { ...p, closed: true };
    if (p.spacing.mode === "fit") return closed;
    return withGroups(closed, n, p.spacing.groups, env);
}

/**
 * The line opened (#529) so its marchers keep their spots: from one of its spots round to the
 * one before it, through every point between. Filled any other way, it opens to the spots its
 * outline has. Fit shares a cornered line's gaps by its stretches' lengths, which an open line can
 * share out differently, and a curve's new ends bend it a little differently, so it opens at the
 * first spot (from its first point) that gives the same spots, the corners switch as it is or
 * turned over; failing that, at its first spot.
 */
export function openLine(p: LineParams, n: number): LineParams {
    if (!isClosed(p)) return p;
    const { closed: _closed, distribution: _distribution, ...rest } = p;
    if (n < 2) return rest;
    const outline: LineParams = { ...rest, closed: true };
    const path = linePath(outline);
    const spots = lineSpots(outline, n);
    const same = sameSpots(spots, n, 1e-6 * Math.max(1, path.length));
    let first: LineParams | null = null;
    for (let k = 0; k < n; k++) {
        const opened = openedAt(outline, path, spots, k);
        if (!opened) continue;
        first ??= opened;
        if (same(opened)) return opened;
        if (same(flipCorners(opened))) return flipCorners(opened);
    }
    return first ?? rest;
}

/** Whether a line's `n` spots are `spots`, each within `tolerance` */
const sameSpots =
    (spots: readonly XY[], n: number, tolerance: number) =>
    (q: LineParams): boolean => {
        const now = lineSpots(q, n);
        return spots.every((spot) =>
            now.some((x) => length(sub(x, spot)) < tolerance),
        );
    };

/** The line with its corners switch turned over */
const flipCorners = (q: LineParams): LineParams =>
    q.corners === false
        ? (({ corners: _c, ...r }) => r)(q)
        : { ...q, corners: false };

/** How far along a closed line each of its segments starts */
function segmentStarts(outline: LineParams): number[] {
    const starts: number[] = [];
    let along = 0;
    for (const segment of lineSegments(outline)) {
        starts.push(along);
        along += makePath([segment]).length;
    }
    return starts;
}

/**
 * The closed line opened from spot `k` round to the spot before it ({@link openedOver}). Null when
 * that leaves under two points.
 */
function openedAt(
    outline: LineParams,
    path: Path,
    spots: readonly Slot[],
    k: number,
): LineParams | null {
    const L = path.length;
    const sOf = (spot: Slot) => spot.s ?? path.project(spot);
    const round = (s: number) => ((s % L) + L) % L;
    const from = sOf(spots[k]!);
    const span = round(
        sOf(spots[(k - 1 + spots.length) % spots.length]!) - from,
    );
    const opened = openedOver(outline, path, from, span);
    return opened.points.length < 2 ? null : opened;
}

/**
 * The closed line opened from `from` along it, `span` round, through the points between; a new
 * end inside a segment as smooth as the smoother of its points. Its ends say nothing of holding a
 * marcher: an open line's always hold one.
 */
function openedOver(
    outline: LineParams,
    path: Path,
    from: number,
    span: number,
): LineParams {
    const { closed: _closed, ...rest } = outline;
    const L = path.length;
    const round = (s: number) => ((s % L) + L) % L;
    const eps = 1e-9 * Math.max(1, L);
    const count = outline.points.length;
    const starts = segmentStarts(outline);
    const between = outline.points
        .map((q, i) => ({ q, at: round(starts[i]! - from) }))
        .filter(({ at }) => at > eps && at < span - eps)
        .sort((a, b) => a.at - b.at)
        .map(({ q }) => q);
    /** The point at `s` along: one of the line's, or a new one on the segment there */
    const pointAt = (s: number): LinePoint => {
        const x = path.at(s);
        const on = outline.points.find((q) => length(sub(q, x)) < eps);
        if (on) return followsLine(on);
        const i = Math.max(
            0,
            starts.findLastIndex((t) => t <= round(s) + eps),
        );
        const a = outline.points[i]!;
        const b = outline.points[(i + 1) % count]!;
        return withTension(Math.max(a.tension, b.tension))(x);
    };
    return {
        ...rest,
        points: [pointAt(from), ...between, pointAt(from + span)],
    };
}

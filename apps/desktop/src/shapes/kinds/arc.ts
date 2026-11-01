import tolgee from "@/global/singletons/Tolgee";
import { fitCircle, principalExtremes } from "../geometry/fit";
import { makePath, type Path, type Segment } from "../geometry/path";
import {
    add,
    dist,
    dot,
    len,
    mid,
    perp,
    polar,
    scale,
    snapAngle,
    sub,
    unit,
    xy,
    scaleAbout,
} from "../geometry/vec";
import { gapsInSteps, sampleAlong } from "../spacing";
import { angleOfChords, radiusForChords } from "../geometry/chords";
import {
    followsInterval,
    type HandleDef,
    type ShapeContext,
    type ShapeKind,
    type Spacing,
    type XY,
} from "../types";
import {
    FIT,
    pathReadouts,
    SPACING_GROUP,
    pathGuide,
    pathOutline,
} from "./pathKind";

/**
 * A part of a circle from `a` to `b`. `bulge` is the signed sagitta: how far the arc's middle
 * stands off the chord, along the chord's normal (`perp(b - a)`). Zero is a straight line.
 */
export interface ArcParams {
    readonly a: XY;
    readonly b: XY;
    readonly bulge: number;
    readonly spacing: Spacing;
}

const chordNormal = (p: ArcParams): XY => unit(perp(sub(p.b, p.a)));

/** The arc's middle point, where its bulge handle sits */
export const arcMiddle = (p: ArcParams): XY =>
    add(mid(p.a, p.b), scale(chordNormal(p), p.bulge));

const TAU = 2 * Math.PI;
/** A ring made an arc opens to this sweep */
const OPENED_RING_SWEEP = (240 * Math.PI) / 180;
const positiveAngle = (a: number) => ((a % TAU) + TAU) % TAU;

/** The arc as a path segment; a straight line when the bulge is (nearly) zero */
export function arcSegment(p: ArcParams): Segment {
    const halfChord = dist(p.a, p.b) / 2;
    if (Math.abs(p.bulge) < 1e-9 * Math.max(1, halfChord) || halfChord === 0) {
        return { type: "line", a: p.a, b: p.b };
    }
    const s = p.bulge;
    const r = (halfChord * halfChord + s * s) / (2 * Math.abs(s));
    const n = chordNormal(p);
    const center = add(mid(p.a, p.b), scale(n, s - Math.sign(s) * r));
    const angleOf = (q: XY) => Math.atan2(q.y - center.y, q.x - center.x);
    const start = angleOf(p.a);
    const forward = positiveAngle(angleOf(p.b) - start);
    const toMiddle = positiveAngle(angleOf(arcMiddle(p)) - start);
    const sweep = toMiddle < forward ? forward : forward - TAU;
    return { type: "arc", center, r, start, sweep };
}

const arcPath = (p: ArcParams): Path => makePath([arcSegment(p)]);

/**
 * The arc with radius `r` and sweep `sweep` that keeps this one's middle point, chord direction
 * and side: for typing a radius or sweep while the arc keeps a locked interval.
 */
/** The gaps, in field units, between `n` marchers at the arc's locked interval */
function runGaps(p: ArcParams, n: number, ctx: ShapeContext): number[] {
    if (p.spacing.mode !== "interval") return [];
    return gapsInSteps(p.spacing.runs, n - 1).map((g) => g * ctx.stepPx);
}

const maxHalf = (gaps: readonly number[]) => Math.max(...gaps, 0) / 2;

/**
 * Keeping a locked interval while an end is dragged: the dragged end stays under the cursor and
 * the arc bends so the marchers still reach from end to end, like a chain of fixed links. Ends
 * pulled apart straighten it; pushed together they bend it toward a circle. Past the run's full
 * length the arc goes straight and the end stops on the way to the cursor. Other edits use the
 * generic scale (undefined).
 */
function bendToReach(
    p: ArcParams,
    gaps: readonly number[],
    _ctx: ShapeContext,
    dragged?: HandleDef,
): ArcParams | undefined {
    if (!dragged || (!dragged.start && !dragged.end)) return undefined;
    const fixed = dragged.start ? p.b : p.a;
    const moving = dragged.start ? p.a : p.b;
    const chord = dist(fixed, moving);
    const total = gaps.reduce((sum, g) => sum + g, 0);
    const build = (moved: XY, bulge: number): ArcParams =>
        dragged.start
            ? { ...p, a: moved, b: fixed, bulge }
            : { ...p, a: fixed, b: moved, bulge };
    if (total <= 1e-9) return undefined;
    if (chord >= total - 1e-9) {
        const toward = chord > 1e-9 ? unit(sub(moving, fixed)) : xy(1, 0);
        return build(add(fixed, scale(toward, total)), 0);
    }
    // The chord across the whole run on radius r: 2r·sin(θ/2), with θ the angle the gaps turn
    // through. It grows with r, from nothing on the circle the run closes to the straight run.
    const chordAt = (r: number) => {
        const theta = Math.min(angleOfChords(gaps, r), 2 * Math.PI);
        return 2 * r * Math.sin(theta / 2);
    };
    let lo = radiusForChords(gaps, 2 * Math.PI - 1e-6);
    let hi = Math.max(lo * 2, total);
    while (chordAt(hi) < chord && hi < 1e12) hi *= 2;
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (chordAt(mid) < chord) lo = mid;
        else hi = mid;
    }
    const r = (lo + hi) / 2;
    const theta = angleOfChords(gaps, r);
    const half = chord / 2;
    const rise = Math.sqrt(Math.max(r * r - half * half, 0));
    const sagitta = theta > Math.PI ? r + rise : r - rise;
    const side = p.bulge < 0 ? -1 : 1;
    return build(moving, side * sagitta);
}

function arcAround(p: ArcParams, r: number, sweep: number): ArcParams {
    const theta = Math.min(Math.max(sweep, 1e-3), 2 * Math.PI - 1e-3);
    const u = unit(sub(p.b, p.a));
    const normal = perp(u);
    const side = p.bulge < 0 ? -1 : 1;
    const halfChord = r * Math.sin(theta / 2);
    const sagitta = r * (1 - Math.cos(theta / 2));
    const chordMiddle = sub(arcMiddle(p), scale(normal, side * sagitta));
    return {
        ...p,
        a: sub(chordMiddle, scale(u, halfChord)),
        b: add(chordMiddle, scale(u, halfChord)),
        bulge: side * sagitta,
    };
}

/** Arc params for the part of a circle the points cover: it skips the widest empty gap. */
function arcThroughPoints(
    points: readonly XY[],
    ctx: ShapeContext,
): ArcParams | undefined {
    const circle = fitCircle(points);
    if (!circle) return undefined;
    // A nearly straight row fits a huge circle; a line reads better there.
    if (circle.r > 400 * ctx.stepPx) return undefined;
    const angles = points
        .map((q) => Math.atan2(q.y - circle.center.y, q.x - circle.center.x))
        .sort((x, y) => x - y);
    let gapAfter = angles.length - 1;
    let widest = angles[0]! + TAU - angles.at(-1)!;
    for (let i = 0; i < angles.length - 1; i++) {
        const gap = angles[i + 1]! - angles[i]!;
        if (gap > widest) {
            widest = gap;
            gapAfter = i;
        }
    }
    let startAngle = angles[(gapAfter + 1) % angles.length]!;
    let sweep = TAU - widest;
    // Marchers most of the way round a circle: the circle opened at the back (-y on the canvas) to
    // 240 degrees, so it reads as an arc, not a broken circle (sims, round 12),
    // keeping its center and size, so the ring peels open where it stands (sims, round 9: a
    // half circle of the same marchers at the same interval doubled the radius, off the field)
    if (sweep > (200 * Math.PI) / 180) {
        sweep = OPENED_RING_SWEEP;
        startAngle = -Math.PI / 2 + (TAU - sweep) / 2;
    }
    const a = polar(circle.center, circle.r, startAngle);
    const b = polar(circle.center, circle.r, startAngle + sweep);
    const middle = polar(circle.center, circle.r, startAngle + sweep / 2);
    const params: ArcParams = { a, b, bulge: 0, spacing: FIT };
    const fitted = {
        ...params,
        bulge: dot(sub(middle, mid(a, b)), chordNormal(params)),
    };
    // Start from the left end, as a line does, so "Lay from Start" means the same end. Swapping
    // the ends flips the chord's normal, so the bulge changes sign to keep the same middle.
    return a.x > b.x + 1e-9
        ? { ...fitted, a: b, b: a, bulge: -fitted.bulge }
        : fitted;
}

/** The arc's radius and sweep, when it isn't flat */
function arcGeometry(p: ArcParams): { r: number; sweep: number } | null {
    const segment = arcSegment(p);
    return segment.type === "arc"
        ? { r: segment.r, sweep: Math.abs(segment.sweep) }
        : null;
}

export const arcKind: ShapeKind<ArcParams> = {
    id: "arc",
    version: 1,
    get label() {
        return tolgee.t("shapes.kinds.arc.label", "Arc");
    },
    family: "path",
    groups: [SPACING_GROUP],
    measures: [
        {
            key: "radius",
            get label() {
                return tolgee.t("shapes.kinds.measure.radius", "Radius");
            },
            unit: "length",
            get: (p) => arcGeometry(p)?.r ?? 0,
            // Same ends; the bulge that gives this radius, keeping the arc's side and whether it
            // is more or less than half a circle. A radius under half the chord is a half circle.
            set(p, r, n, ctx) {
                // Keeping a locked interval: same length, so the sweep follows the radius
                if (followsInterval(p.spacing)) {
                    const gaps = runGaps(p, n, ctx);
                    return arcAround(
                        p,
                        r,
                        angleOfChords(gaps, Math.max(r, maxHalf(gaps))),
                    );
                }
                // Otherwise the sweep stays: a bigger radius is a bigger arc of the same bend
                const now = arcGeometry(p);
                if (!now) return p;
                return arcAround(p, Math.max(r, 1e-6), now.sweep);
            },
        },
        {
            key: "sweep",
            get label() {
                return tolgee.t("shapes.kinds.measure.sweep", "Sweep");
            },
            unit: "angle",
            min: 1,
            get: (p) => arcGeometry(p)?.sweep ?? 0,
            // The sagitta of an arc over chord 2h sweeping θ is h·tan(θ/4)
            set(p, sweep, n, ctx) {
                if (followsInterval(p.spacing)) {
                    const gaps = runGaps(p, n, ctx);
                    return arcAround(p, radiusForChords(gaps, sweep), sweep);
                }
                // Otherwise the radius stays: a half circle at the same size, not a squashed one.
                // A flat arc has no radius yet; it bends over its own chord.
                const now = arcGeometry(p);
                if (now) return arcAround(p, now.r, sweep);
                const halfChord = dist(p.a, p.b) / 2;
                const theta = Math.min(
                    Math.max(sweep, 1e-3),
                    2 * Math.PI - 1e-3,
                );
                return arcAround(p, halfChord / Math.sin(theta / 2), theta);
            },
        },
    ],

    path: (p) => arcPath(p),
    float: bendToReach,
    scale: (p, pivot, k) => ({
        ...p,
        a: scaleAbout(p.a, pivot, k),
        b: scaleAbout(p.b, pivot, k),
        bulge: p.bulge * k,
    }),

    fit({ current }, ctx) {
        const fitted = arcThroughPoints(current, ctx);
        if (fitted) return fitted;
        const ends = principalExtremes(current);
        const c = current[0] ?? xy(0, 0);
        const [a, b] = ends ?? [
            xy(c.x - 4 * ctx.stepPx, c.y),
            xy(c.x + 4 * ctx.stepPx, c.y),
        ];
        // Straight or too few marchers: start with a gentle arc bowing toward the front (+y).
        const params: ArcParams = { a, b, bulge: 0, spacing: FIT };
        const towardFront = chordNormal(params).y >= 0 ? 1 : -1;
        return { ...params, bulge: (towardFront * dist(a, b)) / 4 };
    },

    handles: (p) => [
        { key: "a", role: "point", at: p.a, start: true },
        { key: "b", role: "point", at: p.b, end: true },
        {
            key: "bulge",
            role: "bulge",
            at: arcMiddle(p),
            hint: tolgee.t("shapes.kinds.arc.hint.bend", "Bend"),
        },
        { key: "move", role: "move", at: mid(p.a, p.b) },
    ],

    drag(p, key, to, { constrain }) {
        if (key === "move") {
            const delta = sub(to, mid(p.a, p.b));
            return { ...p, a: add(p.a, delta), b: add(p.b, delta) };
        }
        if (key === "bulge") {
            return { ...p, bulge: dot(sub(to, mid(p.a, p.b)), chordNormal(p)) };
        }
        if (key !== "a" && key !== "b") return p;
        // Moving an end keeps the arc's proportions: the bulge scales with the chord.
        const ratio = len(sub(p.b, p.a)) === 0 ? 0 : p.bulge / dist(p.a, p.b);
        const next =
            key === "a"
                ? { ...p, a: constrain ? snapAngle(p.b, to, Math.PI / 4) : to }
                : { ...p, b: constrain ? snapAngle(p.a, to, Math.PI / 4) : to };
        return { ...next, bulge: ratio * dist(next.a, next.b) };
    },

    outline: (p, n, ctx) => pathOutline(arcPath(p), p.spacing, n, ctx),

    guide: (p, _n, ctx) => pathGuide(arcPath(p), p.spacing, ctx),

    generate: (p, n, ctx) => sampleAlong(arcPath(p), p.spacing, n, ctx.stepPx),

    orderKey: (p, point) => [arcPath(p).project(point)],

    readouts: (p, n, ctx) => pathReadouts(arcPath(p), p.spacing, n, ctx),

    validate(p) {
        if (dist(p.a, p.b) === 0) {
            return [
                {
                    level: "error",
                    message: tolgee.t(
                        "shapes.kinds.arc.validate.sameSpot",
                        "The arc's ends are on the same spot",
                    ),
                },
            ];
        }
        if (arcSegment(p).type === "line") {
            return [
                {
                    level: "info",
                    message: tolgee.t(
                        "shapes.kinds.arc.validate.flat",
                        "The arc is flat, so it's a straight line",
                    ),
                },
            ];
        }
        return [];
    },
};

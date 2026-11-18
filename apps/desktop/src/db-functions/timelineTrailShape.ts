/**
 * The dragged-out result as a shape, pathways step 4c (spec Appendix L.5, DL-11 to DL-14): the end
 * spots a trail drag writes (AP-T8) described as a shape the shape tools open as their own.
 *
 * - Spots on one straight line: a **Line** (`line` v2), its two ends.
 * - Spots on one circle, in order round it: an **Arc** (`arc` v2), its two ends, the first bent.
 * - Anything else: a **Curve**, which the shape tools store as a Line whose points are each a
 *   Corner (tension 0) or Smooth. It is the way `P` from the first spot to the last, and passes
 *   through every spot exactly.
 *
 * The recipe records each member where it was written, so opening it moves nobody; the first
 * change to the shape lays it out as the shape tools always do (DL-14). Pure.
 */
import type { FtlTrail, XY as CoreXY } from "@openmarch/core";
import { fitCircle } from "@/shapes/geometry/fit";
import { arcShape } from "@/shapes/arc/arcShape";
import { lineShape } from "@/shapes/line/lineShape";
import {
    SMOOTH,
    type LineParams,
    type LinePoint,
} from "@/shapes/line/lineGeometry";
import type { XY } from "@/shapes/types";
import type { ShapeRecipeMember, ShapeRecipeRecord } from "./shapeRecipes";
import type { TrailDragPlan } from "./timelineTrailDrag";

/** How far a spot may be from a straight line or a circle and still be on it, in field units */
export const ON_SHAPE = 1e-3;
/** Two points closer than this are one point of the shape */
const SAME_POINT = 1e-6;

export type TrailShapeKind = "line" | "arc" | "curve";

/** The shape the end spots stand in, as the shape tools store it */
export interface TrailShape {
    readonly kind: TrailShapeKind;
    readonly params: LineParams;
}

const xy = (p: CoreXY): XY => ({ x: p[0], y: p[1] });
const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
const cross = (a: XY, b: XY, c: XY) =>
    (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
const corner = (p: XY): LinePoint => ({ x: p.x, y: p.y, tension: 0 });

const FIT = { mode: "fit" } as const;

/** Whether `spots` lie on the straight line from the first to the last, in order along it */
function straight(spots: readonly XY[]): boolean {
    const a = spots[0]!;
    const b = spots[spots.length - 1]!;
    const len = dist(a, b);
    if (len < SAME_POINT) return false;
    const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    let last = -Infinity;
    for (const p of spots) {
        const along = (p.x - a.x) * u.x + (p.y - a.y) * u.y;
        const across = Math.abs(-(p.x - a.x) * u.y + (p.y - a.y) * u.x);
        if (across > ON_SHAPE || along < last - ON_SHAPE) return false;
        last = along;
    }
    return true;
}

/**
 * The sweep in degrees (signed as the Line's bends: positive turns the angle up) of the arc from
 * the first spot to the last through the others, when they lie on one circle in order round it;
 * else undefined
 */
function arcSweep(
    spots: readonly XY[],
    /** Points of the way between the first and last spot, which must lie on the circle too */
    between: readonly XY[] = [],
): number | undefined {
    if (spots.length < 3) return undefined;
    const circle = fitCircle(spots);
    if (!circle) return undefined;
    const { center, r } = circle;
    // Any 3 points not on a line lie on a circle, so the way itself is checked as well: a corner
    // walked by 3 marchers is a Curve, not half a circle (#830 review)
    if (
        [...spots, ...between].some(
            (p) => Math.abs(dist(p, center) - r) > ON_SHAPE,
        )
    )
        return undefined;
    let total = 0;
    let sign = 0;
    for (let i = 1; i < spots.length; i++) {
        const a = spots[i - 1]!;
        const b = spots[i]!;
        let d =
            Math.atan2(b.y - center.y, b.x - center.x) -
            Math.atan2(a.y - center.y, a.x - center.x);
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        if (Math.abs(d) < 1e-12) return undefined;
        if (sign !== 0 && Math.sign(d) !== sign) return undefined;
        sign = Math.sign(d);
        total += d;
    }
    const degrees = (total * 180) / Math.PI;
    // The Arc kind's range: short of a whole turn, and more than a sliver (a sliver is a Line)
    return Math.abs(degrees) >= 1 && Math.abs(degrees) < 359
        ? degrees
        : undefined;
}

/** One piece of the way, from distance `d0` to `d1` */
type WayPiece =
    | { kind: "line"; d0: number; d1: number }
    | { kind: "arc"; d0: number; d1: number; k: number }
    | { kind: "cubic"; d0: number; d1: number };

/** The way's pieces and the tension at the end of each, in order (R-13″, R-14″) */
function wayPieces(way: FtlTrail): { piece: WayPiece; endTension: number }[] {
    const out: { piece: WayPiece; endTension: number }[] = [];
    const lineUp = way.lineUp ?? [];
    for (let i = 1; i < lineUp.length; i++) {
        const d0 = way.cum[i - 1]!;
        const d1 = way.cum[i]!;
        if (d1 - d0 > 0)
            out.push({ piece: { kind: "line", d0, d1 }, endTension: 0 });
    }
    const drawn = way.drawn;
    if (drawn) {
        const W = drawn.path;
        W.pieces.forEach((p, j) => {
            const d0 = drawn.start + W.D[j]!;
            const d1 = drawn.start + W.D[j + 1]!;
            if (!(d1 - d0 > 0)) return;
            const piece: WayPiece =
                p.kind === "arc"
                    ? { kind: "arc", d0, d1, k: p.k }
                    : p.kind === "cubic"
                      ? { kind: "cubic", d0, d1 }
                      : { kind: "line", d0, d1 };
            out.push({ piece, endTension: W.tension[j + 1] ?? 0 });
        });
    }
    return out;
}

/**
 * The Curve (DL-12, DL-13): the way from `ends[0]` to the last end as a Line's points. The way's
 * vertices in between are its points, Corners or Smooth as on the way, holding no marcher; an arc
 * leg is the bend of the point before it, cut where an end falls inside it; a spot on a curved
 * piece is a Smooth point of its own, so the Line passes through it exactly.
 */
export function curveThroughSpots(
    way: FtlTrail,
    ends: readonly number[],
    spots: readonly XY[],
): LineParams {
    const a = ends[0]!;
    const b = ends[ends.length - 1]!;
    const points: LinePoint[] = [];
    const push = (p: LinePoint) => {
        const last = points[points.length - 1];
        if (last && dist(last, p) < SAME_POINT) {
            // The same point twice: a spot keeps its marcher, a vertex its tension
            const { marcher: _m, ...rest } = last;
            points[points.length - 1] = {
                ...rest,
                tension: Math.max(last.tension, p.tension),
                ...(last.marcher === false && p.marcher === false
                    ? { marcher: false }
                    : {}),
            };
            return;
        }
        points.push(p);
    };
    const setBend = (bend: number) => {
        const last = points[points.length - 1]!;
        points[points.length - 1] = { ...last, bend };
    };
    push(corner(spots[0]!));
    for (const { piece, endTension } of wayPieces(way)) {
        const s0 = Math.max(a, piece.d0);
        const s1 = Math.min(b, piece.d1);
        if (!(s1 > s0)) continue;
        if (piece.kind === "arc") {
            // R-8's arc turns 4·atan(2k) over the piece at a steady rate: this part's share
            const share = (s1 - s0) / (piece.d1 - piece.d0);
            const degrees =
                ((4 * Math.atan(2 * Math.abs(piece.k)) * 180) / Math.PI) *
                share;
            const from = xy(way.at(s0));
            const mid = xy(way.at((s0 + s1) / 2));
            const to = xy(way.at(s1));
            const turn = Math.sign(cross(from, mid, to));
            if (turn !== 0 && degrees > 1e-9) setBend(turn * degrees);
        }
        if (piece.kind === "cubic") {
            // The Line's curve isn't R-14's: a spot inside a curved piece is a point of its own
            ends.forEach((e, q) => {
                if (e > s0 + SAME_POINT && e < s1 - SAME_POINT)
                    push({ ...spots[q]!, tension: SMOOTH });
            });
        }
        if (s1 < b - SAME_POINT)
            push({
                ...xy(way.at(piece.d1)),
                tension: endTension,
                marcher: false,
            });
    }
    push(corner(spots[spots.length - 1]!));
    // A curve needs two points; spots all at one place can't be (the plan keeps them apart)
    if (points.length < 2) points.push(corner(spots[spots.length - 1]!));
    // The ends are the line's: they always hold a marcher, and never bend past it
    const first = points[0]!;
    const last = points[points.length - 1]!;
    const { marcher: _f, ...firstRest } = first;
    const { marcher: _l, bend: _b, ellipse: _e, ...lastRest } = last;
    points[0] = firstRest;
    points[points.length - 1] = lastRest;
    return { points, spacing: FIT };
}

/** The shape the plan's end spots stand in (DL-12) */
export function trailShapeOf(plan: TrailDragPlan): TrailShape {
    const spots = plan.spots.map(xy);
    if (straight(spots))
        return {
            kind: "line",
            params: {
                points: [corner(spots[0]!), corner(spots[spots.length - 1]!)],
                spacing: FIT,
            },
        };
    const e0 = plan.ends[0]!;
    const e1 = plan.ends[plan.ends.length - 1]!;
    const between = Array.from({ length: 31 }, (_, i) =>
        xy(plan.way.at(e0 + ((e1 - e0) * (i + 1)) / 32)),
    );
    const sweep = arcSweep(spots, between);
    if (sweep !== undefined)
        return {
            kind: "arc",
            params: {
                points: [
                    { ...corner(spots[0]!), bend: sweep },
                    corner(spots[spots.length - 1]!),
                ],
                spacing: FIT,
            },
        };
    return {
        kind: "curve",
        params: curveThroughSpots(plan.way, plan.ends, spots),
    };
}

/**
 * `params` run the other way: the points in reverse, each bend moved to the point its segment now
 * starts at and turned the other way round, so the same path from its other end
 */
export function reversedLineParams(params: LineParams): LineParams {
    const points = params.points;
    const n = points.length;
    return {
        ...params,
        points: points.map((_, r) => {
            const { bend: _b, ellipse: _e, ...p } = points[n - 1 - r]!;
            // The segment from reversed point r to r + 1 was the one from point n - 2 - r
            const from = points[n - 2 - r];
            return from?.bend
                ? {
                      ...p,
                      bend: -from.bend,
                      ...(from.ellipse ? { ellipse: from.ellipse } : {}),
                  }
                : p;
        }),
    };
}

/**
 * The recipe AP-T8 saves beside the spots it writes (DL-11, DL-14): the shape, its members leader
 * first each where it was written, since a Line's slots run from its first point and a Line's
 * first slot is read as its leader (step 4g, `rememberedOrder`). `line` is the trail's order, tail
 * first, and `plan.spots` follow it, so the shape is run from the leader's end.
 */
export function trailShapeRecipe(
    plan: TrailDragPlan,
    line: readonly number[],
): {
    shape: TrailShape;
    recipe: ShapeRecipeRecord;
    members: ShapeRecipeMember[];
} {
    const tailFirst = trailShapeOf(plan);
    const shape = {
        ...tailFirst,
        params: reversedLineParams(tailFirst.params),
    };
    const kind = shape.kind === "arc" ? arcShape : lineShape;
    const last = line.length - 1;
    return {
        shape,
        recipe: {
            kind: kind.id,
            kindVersion: kind.version,
            params: { ...shape.params, spots: line.length },
            // A Line's order, from its first point (#528): the leader's
            orderMode: "keep",
            reverse: false,
        },
        members: line.map((_, slot) => ({
            marcherId: line[last - slot]!,
            slot,
            x: plan.spots[last - slot]![0],
            y: plan.spots[last - slot]![1],
        })),
    };
}

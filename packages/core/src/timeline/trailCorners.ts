/**
 * Corner counts for block letters, pathways step 6 (spec Appendix L.9, TC-1 to TC-4): the corners
 * of a follow-the-leader trail and the count each member turns on at each one.
 *
 * Counts are derived, never stored or pinned (O-1, draft model §4.5). The way is the resolver's
 * own (R-9′, R-13′, R-13″), built by the same functions, so a member is exactly at the corner at
 * the beat its count names (R-10 read backward).
 */
import {
    alongEnds,
    cumOf,
    makeAlongTrail,
    makeTrail,
    pointsPath,
    type RoutePath,
    type RouteWalk,
} from "./geom";
import type { FtlTrail, XY } from "./types";

/** TC-1: the smallest turn that is a corner, in radians (20°) */
export const CORNER_MIN_TURN = (20 * Math.PI) / 180;

/**
 * TC-1: a bend between two legs of the line-up or the end line (where the marchers stand) is a
 * corner only when it turns this much more than each neighboring bend between two such legs
 * (20°), so a line standing in a curve or an arc gets no corner at every marcher
 */
export const CORNER_STAND_OUT = (20 * Math.PI) / 180;

/** TC-2: within this many counts of its own start or stop a member starts or stops, not turns */
export const ON_COUNT_TOLERANCE = 0.05;

/** TC-2: how far past its start, and short of its end, a member must be to turn at a corner */
const PASS_EPS = 1e-6;

/** One member's walk on the way: R-10's (or R-13″'s) start, end and straight leg to its spot */
export interface WayWalk {
    startDist: number;
    endDist: number;
    /** R-13″: the straight leg from the way to the spot; 0 or absent otherwise */
    straight?: number;
    /**
     * When its founding span ends, in counts from the move's start (taken over, or cut by a
     * higher layer, partway): it turns at no corner it would reach after that. Absent: the end.
     */
    until?: number;
}

/** A corner of the way (TC-1) */
export interface WayCorner {
    /** Its distance along the way */
    d: number;
    at: XY;
    /** The turn, signed (positive to the left, counterclockwise), in radians */
    turn: number;
    /** The way's direction arriving and leaving, unit vectors (for placing a label outside it) */
    dirIn: XY;
    dirOut: XY;
}

/** One member's turn at a corner (TC-2, TC-3) */
export interface CornerTurn {
    /** The member's index, tail first (q) */
    q: number;
    /** The count it turns on, from the move's start (TC-3) */
    count: number;
    /** TC-4 */
    onCount: boolean;
}

/** A corner with each member's turn there */
export interface CornerCount extends WayCorner {
    /** Who turns there, leader first (the first to reach it) */
    turns: CornerTurn[];
    /** Members that stop on the way, or leave the trail (taken over), before turning there */
    stopBefore: number;
    /** Whether any member turns between counts there (TC-4, TC-5) */
    offCount: boolean;
}

/** TC-4: a count as shown, rounded to a tenth (the display and the warning use this one value) */
export const roundCount = (count: number): number =>
    Math.round(count * 10) / 10;

/** TC-4: whether a count is on a whole count: it is whole once rounded to a tenth */
export const isOnCount = (count: number): boolean =>
    Number.isInteger(roundCount(count));

/** A stretch of the way with its direction at each end */
interface Stretch {
    d0: number;
    d1: number;
    a: XY;
    dirIn: XY | null;
    dirOut: XY | null;
    /** A leg of the line-up or the end line (through where marchers stand), not the drawn part */
    standing?: boolean;
}

const unit = (v: XY): XY | null => {
    const l = Math.hypot(v[0], v[1]);
    return l > 1e-12 ? [v[0] / l, v[1] / l] : null;
};
const sub = (a: XY, b: XY): XY => [a[0] - b[0], a[1] - b[1]];
const rotate = (u: XY, a: number): XY => [
    u[0] * Math.cos(a) - u[1] * Math.sin(a),
    u[0] * Math.sin(a) + u[1] * Math.cos(a),
];

/** Straight stretches through `pts` from distance `d0`, skipping repeated points */
function polylineStretches(pts: readonly XY[], d0: number): Stretch[] {
    const out: Stretch[] = [];
    const cum = cumOf(pts);
    for (let i = 1; i < pts.length; i++) {
        const dir = unit(sub(pts[i]!, pts[i - 1]!));
        if (!dir) continue;
        out.push({
            d0: d0 + cum[i - 1]!,
            d1: d0 + cum[i]!,
            a: pts[i - 1]!,
            dirIn: dir,
            dirOut: dir,
            standing: true,
        });
    }
    return out;
}

/** R-14's pieces of a drawn part, with each piece's direction at its two ends (TC-1) */
function drawnStretches(W: RoutePath, d0: number): Stretch[] {
    return W.pieces.map((piece, j) => {
        const P0 = W.V[j]!;
        const P3 = W.V[j + 1]!;
        let start: XY | null;
        let end: XY | null;
        if (piece.kind === "line") start = end = unit(sub(P3, P0));
        else if (piece.kind === "arc") {
            // R-8's minor arc: its tangent is the chord turned by the half-angle φ = 2·atan(2k),
            // toward the bulge at its start and back at its end (arcPoint's frame)
            const chord = unit(sub(P3, P0));
            const phi = 2 * Math.atan(2 * piece.k);
            start = chord && rotate(chord, phi);
            end = chord && rotate(chord, -phi);
            // a chord too short for R-8 is drawn straight
            if (chord && Math.abs(phi) < 1e-12) start = end = chord;
        } else {
            start =
                unit(sub(piece.c1, P0)) ??
                unit(sub(piece.c2, P0)) ??
                unit(sub(P3, P0));
            end =
                unit(sub(P3, piece.c2)) ??
                unit(sub(P3, piece.c1)) ??
                unit(sub(P3, P0));
        }
        return {
            d0: d0 + W.D[j]!,
            d1: d0 + W.D[j + 1]!,
            a: P0,
            dirIn: start,
            dirOut: end,
        };
    });
}

/**
 * TC-1: the corners of a trail `trail` whose line-up runs through `origins` (tail first), and
 * whose end line (R-13′, from the entrance) is `endLine`, or none when its ends are along the way.
 */
export function wayCorners(
    trail: FtlTrail,
    origins: readonly XY[],
    endLine: readonly XY[] | null,
    minTurn = CORNER_MIN_TURN,
): WayCorner[] {
    const stretches: Stretch[] = polylineStretches(origins, 0);
    const lineLen = trail.cum[origins.length - 1] ?? 0;
    if (trail.drawn)
        stretches.push(...drawnStretches(trail.drawn.path, trail.drawn.start));
    else if (endLine?.length && origins.length)
        // no drawn part kept: R-9's straight leg from the leader to the entrance
        stretches.push(
            ...polylineStretches(
                [origins[origins.length - 1]!, endLine[0]!],
                lineLen,
            ).map((st) => ({ ...st, standing: false })),
        );
    if (endLine)
        stretches.push(...polylineStretches(endLine, trail.destOffset));
    // the turn at each joint, between stretch i - 1 and stretch i (null where a stretch has no
    // direction)
    const turns: (number | null)[] = stretches.map((st, i) => {
        if (i === 0) return null;
        const a = stretches[i - 1]!.dirOut;
        const b = st.dirIn;
        if (!a || !b) return null;
        return Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]);
    });
    // a bend between two standing legs (the line-up's or the end line's own)
    const standingBend = (i: number) =>
        i > 0 &&
        i < stretches.length &&
        !!stretches[i - 1]!.standing &&
        !!stretches[i]!.standing;
    const corners: WayCorner[] = [];
    for (let i = 1; i < stretches.length; i++) {
        const turn = turns[i];
        if (turn == null || Math.abs(turn) < minTurn) continue;
        // TC-1: a bend in the line-up or the end line (both legs standing) must stand out from
        // the standing bends beside it, so a line in a curve or an arc gets no corner at each
        // marcher; the leader's start and the entrance take the plain rule
        if (standingBend(i)) {
            const outdone = [i - 1, i + 1].some(
                (j) =>
                    standingBend(j) &&
                    Math.abs(turn) < Math.abs(turns[j] ?? 0) + CORNER_STAND_OUT,
            );
            if (outdone) continue;
        }
        corners.push({
            d: stretches[i]!.d0,
            at: stretches[i]!.a,
            turn,
            dirIn: stretches[i - 1]!.dirOut!,
            dirOut: stretches[i]!.dirIn!,
        });
    }
    return corners;
}

/**
 * TC-2 to TC-4: each corner with the members who turn there and their counts, `counts` being the
 * move's length in counts. `walks` are the members' walks on the way, tail first. Corners nobody
 * turns at are left out.
 */
export function cornerCounts(
    corners: readonly WayCorner[],
    walks: readonly WayWalk[],
    counts: number,
): CornerCount[] {
    const out: CornerCount[] = [];
    for (const corner of corners) {
        const turns: CornerTurn[] = [];
        let stopBefore = 0;
        walks.forEach((w, q) => {
            const total = w.endDist - w.startDist + (w.straight ?? 0);
            // a member starting on the corner, or behind its own start (waiting), never turns there
            if (corner.d <= w.startDist + PASS_EPS || !(total > 0)) return;
            const count = ((corner.d - w.startDist) / total) * counts;
            // the count it leaves the way on: the move's end, or its straight leg's start (R-13″)
            const leaves = ((w.endDist - w.startDist) / total) * counts;
            // TC-2: within a twentieth of a count of its own start or stop is starting or
            // stopping there, not turning
            if (
                corner.d >= w.endDist - PASS_EPS ||
                count > leaves - ON_COUNT_TOLERANCE
            ) {
                stopBefore++;
                return;
            }
            if (count < ON_COUNT_TOLERANCE) return;
            // taken over (or cut short) before reaching it: it leaves the trail first (TC-2)
            if (w.until !== undefined && count > w.until - ON_COUNT_TOLERANCE) {
                stopBefore++;
                return;
            }
            turns.push({ q, count, onCount: isOnCount(count) });
        });
        if (turns.length === 0) continue;
        turns.sort((a, b) => a.count - b.count || b.q - a.q);
        out.push({
            ...corner,
            turns,
            stopBefore,
            offCount: turns.some((t) => !t.onCount),
        });
    }
    return out;
}

/** How a trail's members end, as the resolver reads it */
export type TrailEnds =
    /** R-13″: along the way, each to its own spot (tail first) */
    | { kind: "along"; spots: readonly XY[] }
    /**
     * R-9′ with R-13′: into the end line through every slot's destination, in the order the line
     * enters it (slot order, or reversed with R-12′); `at[q]` is member `q`'s index on it
     */
    | { kind: "line"; endLine: readonly XY[]; at: readonly number[] };

/**
 * Step 6 (spec L.9): the corners of a follow-the-leader trail and each member's turning count
 * there. `origins` are the founders' starts, tail first; `route` the trail route (null for none);
 * `counts` the move's length in counts. The way and each member's walk are built exactly as the
 * resolver builds them (`makeTrail` or `makeAlongTrail`, `alongEnds`).
 */
export function trailCornerCounts(input: {
    origins: readonly XY[];
    route: RouteWalk | null;
    ends: TrailEnds;
    counts: number;
    /** Each member's founding span end in counts (`WayWalk.until`), tail first */
    until?: readonly (number | undefined)[];
    minTurn?: number;
}): CornerCount[] {
    const { origins, route, ends, counts } = input;
    if (origins.length === 0) return [];
    const startDist = (trail: FtlTrail) => origins.map((_, q) => trail.cum[q]!);
    const untilOf = (q: number) => {
        const u = input.until?.[q];
        return u === undefined ? {} : { until: u };
    };
    if (ends.kind === "along") {
        const trail = makeAlongTrail(origins, route);
        const s = startDist(trail);
        const e = alongEnds(trail, ends.spots, s);
        return cornerCounts(
            wayCorners(trail, origins, null, input.minTurn),
            s.map((d, q) => ({
                startDist: d,
                endDist: e.endDist[q]!,
                straight: e.straight[q]!,
                ...untilOf(q),
            })),
            counts,
        );
    }
    const line = ends.endLine.length ? ends.endLine : [origins.at(-1)!];
    const trail = makeTrail(origins, [], pointsPath(line), route);
    const s = startDist(trail);
    const along = cumOf(line);
    return cornerCounts(
        wayCorners(trail, origins, line, input.minTurn),
        s.map((d, q) => ({
            startDist: d,
            endDist: trail.destOffset + (along[ends.at[q] ?? 0] ?? 0),
            ...untilOf(q),
        })),
        counts,
    );
}

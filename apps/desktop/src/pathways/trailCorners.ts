/**
 * Corner counts for block letters, pathways step 6 (spec Appendix L.9): the corners of the trail a
 * path session shows, with each member's turning count there (core `trailCornerCounts`, TC-1 to
 * TC-4). Read, never written (TC-8).
 *
 * The way is the resolver's own for the trail as it is drawn now: the points placed (and, while a
 * trail is dragged out, the pointer's landed spot, as DL-20 shows the end spots), each member's
 * start, and its end spot (R-13″) or the end line (R-13′).
 */
import {
    alongEnds,
    cornerCounts,
    roundCount,
    trailCornerCounts,
    wayCorners,
    type CornerCount,
    type RouteWalk,
    type TrailEnds,
    type XY as CoreXY,
} from "@openmarch/core";
import type { XY } from "@/shapes/types";
import { followDrawnPlanOf, keepsEndSpots } from "./followDrag";
import { shapeOf, storedPoints, type PathSession } from "./pathPenStore";

/** A trail's corners as the field shows them */
export interface TrailCornersView {
    /** Corners some member turns at, in order along the way */
    corners: CornerCount[];
    /** The members' drill numbers, tail first (a turn's `q` indexes them) */
    drills: readonly string[];
}

const tuple = (p: XY): CoreXY => [p.x, p.y];

const views = new WeakMap<PathSession, TrailCornersView | null>();

/**
 * The corners of the trail `s` shows and who turns there when (TC-5): a stored trail (selected,
 * open or drawn again), a new one drawn with the pen, or one dragged out of a line in the Follow
 * tool once an end is grabbed. Null for a path that isn't a trail. Worked out once per session.
 */
export function trailCornersOf(s: PathSession): TrailCornersView | null {
    if (views.has(s)) return views.get(s)!;
    const view = computeView(s);
    views.set(s, view);
    return view;
}

function computeView(s: PathSession): TrailCornersView | null {
    const trail = s.target.trail;
    if (!trail || trail.members.length === 0 || trail.unfounded) return null;
    const { members } = trail;
    const drills = members.map((m) => m.drill);
    const counts = s.target.end - s.target.start;
    const origins = members.map((m) => tuple(m.from));
    const f = s.follow;
    if (f) {
        if (f.grabbed === null) return null;
        if (!keepsEndSpots(f)) {
            // From trail (AP-T8): the drawing's own plan, the pointer's spot included (DL-20)
            const plan = followDrawnPlanOf(s);
            if (!plan) return null;
            const e = alongEnds(plan.way, plan.spots, plan.startDist);
            return {
                corners: cornerCounts(
                    wayCorners(plan.way, origins, null),
                    plan.startDist.map((d, q) => ({
                        startDist: d,
                        endDist: e.endDist[q]!,
                        straight: e.straight[q]!,
                    })),
                    counts,
                ),
                drills,
            };
        }
    }
    // The points as drawn now; while a trail is dragged out with Keep end spots, the pointer's
    // landed spot too, as the From trail drawing shows it
    const points = storedPoints(s.points);
    const p = s.pointer;
    const last = s.points.at(-1)?.at;
    if (
        f &&
        s.phase === "drawing" &&
        p &&
        !(last && last.x === p.x && last.y === p.y)
    )
        points.push({ at: [p.x, p.y] });
    const shape = shapeOf(s);
    const route: RouteWalk = {
        from: tuple(shape.ends?.from ?? shape.from),
        // along the way, the route runs to its last point (AP-T8, AP-T10)
        to:
            trail.along && points.length
                ? points.at(-1)!.at
                : tuple(shape.ends?.to ?? shape.to),
        points: points.map((pt) => ({
            at: pt.at,
            ...(pt.tension === undefined ? {} : { tension: pt.tension }),
            ...(pt.bulge === undefined ? {} : { bulge: pt.bulge }),
        })),
        ...(s.toBulge && !f ? { toBulge: s.toBulge } : {}),
    };
    const spots = members.map((m) => m.to);
    let ends: TrailEnds;
    if (trail.along) ends = { kind: "along", spots: spots.map(tuple) };
    else {
        // R-13′: the end line through every slot's destination, from the entrance; a new trail's
        // slots are its members in line order, so it is their end spots
        const line = trail.endLine ?? spots;
        ends = {
            kind: "line",
            endLine: line.map(tuple),
            // each member's own spot by its slot (a new trail's slots are its line order)
            at: members.map((m, q) => m.endAt ?? q),
        };
    }
    return {
        corners: trailCornerCounts({
            origins,
            route,
            ends,
            counts,
            // TC-2: a founder taken over partway turns at no corner after it leaves
            until: members.map((m) =>
                m.until === undefined ? undefined : m.until - s.target.start,
            ),
        }),
        drills,
    };
}

/** TC-4: a count as shown, to a tenth: `6`, `7.5` */
export const formatCount = (count: number): string => {
    // the same rounding as "on a count" (TC-4), so a whole number shown is never warned about
    const t = roundCount(count);
    return Number.isInteger(t) ? `${t}` : t.toFixed(1);
};

/** TC-5: a corner's chip text, the first and last turning counts (`6–20`), or the one */
export function cornerRange(corner: CornerCount): string {
    const first = corner.turns[0]!.count;
    const last = corner.turns.at(-1)!.count;
    return corner.turns.length === 1 || formatCount(first) === formatCount(last)
        ? formatCount(first)
        : `${formatCount(first)}–${formatCount(last)}`;
}

/** TC-7: how many turns fall between counts, and at how many corners */
export function offCountTally(view: TrailCornersView | null): {
    turns: number;
    corners: number;
} {
    let turns = 0;
    let corners = 0;
    for (const c of view?.corners ?? []) {
        const off = c.turns.filter((t) => !t.onCount).length;
        turns += off;
        if (off) corners++;
    }
    return { turns, corners };
}

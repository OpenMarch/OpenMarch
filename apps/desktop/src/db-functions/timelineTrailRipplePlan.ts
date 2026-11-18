/**
 * Ripple into the next form, pathways step 9 (spec Appendix L.10, RP-3 to RP-5): the plan, pure.
 * The Follow tool's drawing and the write (`timelineTrailRipple`) both use it, so what is shown is
 * what plays once written.
 */
import { makeTrail, pointsPath, type FtlTrail, type XY } from "@openmarch/core";
import { text, type TimelineText } from "@/timeline/timelineText";
import type { RoutePointInput } from "./timelineRoutes";

/** The refusals' texts of step 9, translated where they are shown */
export const rippleRefusal = {
    /** RP-2: the members' end spots don't stand in a line, curve or arc */
    notAForm: () => text.t("timeline.refusals.trail.notAForm"),
    /** RP-2: the end spots close into a loop (a circle, a box outline: steps 10 and 11) */
    formLoop: () => text.t("timeline.refusals.trail.formLoop"),
    /** RP-2: the end spots fold back close to themselves (a sharp V, or rows through a box) */
    formFold: () => text.t("timeline.refusals.trail.formFold"),
    /** RP-2: the end spots lie on the line where it stands, so it would walk back through itself */
    formOverlap: () => text.t("timeline.refusals.trail.formOverlap"),
};

const dist = (a: XY, b: XY): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The true median: the middle value, or the mean of the two middle ones */
const median = (xs: readonly number[]): number => {
    const s = [...xs].sort((a, b) => a - b);
    const k = s.length >> 1;
    if (s.length === 0) return 0;
    return s.length % 2 ? s[k]! : (s[k - 1]! + s[k]!) / 2;
};

/** The distance from `p` to the segment `a`–`b` */
function toSegment(p: XY, a: XY, b: XY): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t =
        len2 > 0
            ? Math.max(
                  0,
                  Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2),
              )
            : 0;
    return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
}

/**
 * RP-2: why the next form can't be rippled into, or null. `spots` are the form's spots in its
 * order, one end to the other; `starts` where the line stands. With `s` the form's usual step
 * (the median of its neighbor gaps):
 *
 * - **not a form**: a step more than 2.5 times the usual one (a zigzag through scattered spots);
 * - **a loop**: the two ends within 1.5 `s` of each other and within half the form's length (the
 *   sum of its gaps), so a three-spot L or half circle isn't one (a circle, a box outline;
 *   step 10 follows outlines);
 * - **a fold**: two spots three or more apart in the order within 1.5 `s` (an order snaking
 *   through a box, or a V sharper than about 47°; step 11 snakes);
 * - **overlap**: two or more spots within a quarter `s` of the line where it stands (the form slid
 *   along the line, or the line itself): the line would walk back through itself.
 */
export function rippleFormProblem(
    spots: readonly XY[],
    starts: readonly XY[],
): TimelineText | null {
    const n = spots.length;
    if (n < 2) return null;
    const steps = spots.slice(1).map((p, i) => dist(p, spots[i]!));
    const s = median(steps);
    if (!(s > 0) || Math.max(...steps) > 2.5 * s)
        return rippleRefusal.notAForm();
    const ends = dist(spots[0]!, spots[n - 1]!);
    const length = steps.reduce((a, b) => a + b, 0);
    if (n >= 3 && ends < 1.5 * s && ends < length / 2)
        return rippleRefusal.formLoop();
    for (let i = 0; i < n; i++)
        for (let j = i + 3; j < n; j++)
            if (dist(spots[i]!, spots[j]!) < 1.5 * s)
                return rippleRefusal.formFold();
    const onLine = spots.filter((p) =>
        starts.length === 1
            ? dist(p, starts[0]!) < s / 4
            : starts
                  .slice(1)
                  .some((b, i) => toSegment(p, starts[i]!, b) < s / 4),
    ).length;
    return onLine >= 2 ? rippleRefusal.formOverlap() : null;
}

// ---------------------------------------------------------------------------
// Pure: the deal and the trail
// ---------------------------------------------------------------------------

/** The next form (RP-2): the members' end spots in the form's own order, one end to the other */
export interface RippleForm {
    /** Who stands on each spot now, in the form's order */
    readonly ids: readonly number[];
    /** The spots, in the same order */
    readonly spots: readonly XY[];
}

/** What a ripple does (AP-T12), worked out before anything is written */
export interface RipplePlan {
    /** The trail as the resolver walks it: the line-up, the connector, then the next form */
    trail: FtlTrail;
    /** Each member's start along the trail (`startDist`), tail first */
    startDist: number[];
    /** Each member's end along the trail (`endDist`, R-13′) */
    endDist: number[];
    /** The spot each member of the line takes, tail first: the form from the entrance (RP-3) */
    spots: XY[];
    /** Whose spot each member of the line takes, tail first (who stands there now) */
    takes: number[];
    /** The marcher whose spot is the entrance now (the form's end the line enters, RP-4) */
    entrance: number;
    /** The connector's length: the leader's start, through the drawn points, to the entrance */
    connector: number;
    /**
     * Where the leader reaches the form, as a share of the move (0 to 1, RP-5); null when the
     * leader doesn't move
     */
    arrival: number | null;
}

/**
 * RP-4: the end of `form` the line enters, as the marcher standing on it now. `enter`, when it is
 * one of the form's two ends, wins (a finish on its spot); else the end nearer `at` (where the
 * drawing arrives), ties to the form's first.
 */
export function rippleEntrance(
    form: RippleForm,
    at: XY,
    enter?: number | null,
): number {
    const first = form.ids[0]!;
    const last = form.ids[form.ids.length - 1]!;
    if (enter === first || enter === last) return enter;
    const toLast = dist(at, form.spots[form.spots.length - 1]!);
    return toLast < dist(at, form.spots[0]!) ? last : first;
}

/**
 * AP-T12's deal and trail for the line `starts` (tail first, the leader last) into `form`, with
 * the drawn `points` (the connector's corners, in walking order from the leader; none for a
 * straight connector). `enter` picks the entrance (RP-4) when it is one of the form's ends.
 *
 * The trail is the resolver's own (`makeTrail`, R-9′): the line-up, `W = walk(leader's start,
 * points, entrance)` with the route's `from` the leader's start and `to` the entrance, then the
 * line through the dealt spots (R-13′, `pointsPath`). So the drawing is what plays once written.
 */
export function planRipple(
    starts: readonly XY[],
    form: RippleForm,
    points: readonly RoutePointInput[],
    enter?: number | null,
): RipplePlan {
    const m = starts.length;
    if (form.ids.length !== m)
        throw new Error("a ripple deals one spot to each member of the line");
    const leader = starts[m - 1]!;
    const arrive = points.at(-1)?.at ?? leader;
    const entrance = rippleEntrance(form, arrive, enter);
    const fromFirst = entrance === form.ids[0];
    const takes = fromFirst ? [...form.ids] : [...form.ids].reverse();
    const spots = (fromFirst ? [...form.spots] : [...form.spots].reverse()).map(
        (p): XY => [p[0], p[1]],
    );
    const path = pointsPath(spots);
    const trail = makeTrail(starts, [], path, {
        from: [leader[0], leader[1]],
        to: spots[0]!,
        points: points.map((p) => ({
            at: [p.at[0], p.at[1]],
            ...(p.tension === undefined ? {} : { tension: p.tension }),
            ...(p.bulge === undefined ? {} : { bulge: p.bulge }),
        })),
    });
    const startDist = starts.map((_, q) => trail.cum[q]!);
    const endDist = spots.map((_, q) => trail.destOffset + path.stops![q]!);
    const lead = endDist[m - 1]! - startDist[m - 1]!;
    return {
        trail,
        startDist,
        endDist,
        spots,
        takes,
        entrance,
        connector: trail.destOffset - startDist[m - 1]!,
        arrival:
            lead > 0
                ? Math.min(1, (trail.destOffset - startDist[m - 1]!) / lead)
                : null,
    };
}

/**
 * Where each member of the line (tail first) is at progress `p` of the move (0 to 1): R-10 on the
 * plan's trail, each at its own constant speed, ends exact. For the drawing's ▶ Preview.
 */
export function ripplePreview(plan: RipplePlan, p: number): XY[] {
    return plan.spots.map((spot, q) => {
        if (p <= 0) return plan.trail.at(plan.startDist[q]!);
        if (p >= 1) return spot;
        const a = plan.startDist[q]!;
        return plan.trail.at(a + (plan.endDist[q]! - a) * p);
    });
}

/**
 * RP-5's readout: the count the leader reaches the form on, from the move's start, to the nearest
 * half count. Null when it doesn't move.
 */
export function rippleArrivalCount(
    plan: RipplePlan,
    counts: number,
): number | null {
    if (plan.arrival === null || !(counts > 0)) return null;
    return Math.round(plan.arrival * counts * 2) / 2;
}

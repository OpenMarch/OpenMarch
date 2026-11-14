/**
 * The Follow tool's drag, pathways step 4b (spec Appendix L, DL-1 to DL-8): handles on the two
 * ends of the selected line pulse until one is pressed; the press-drag draws the first leg of the
 * trail out of it, then clicks add corners as with the Path pen. While drawing, the way, where the
 * line stops (the end spots, `P(e_q)`) and the path bar's Spacing and Ends show. Finishing writes
 * it all in one undo step (`dragTrail`, AP-T8; AP-T1 with Keep end spots, AP-T9).
 */
import {
    planTrailDrag,
    trailDragPreview,
    type TrailDragPlan,
    type TrailSpacing,
    type TrailWindow,
} from "@/db-functions/timelineTrailDrag";
import {
    planRipple,
    ripplePreview,
    type RippleForm,
    type RipplePlan,
} from "@/db-functions/timelineTrailRipplePlan";
import type { XY } from "@/shapes/types";
import type { PathTarget } from "./pathTarget";
import {
    storedPoints,
    usePathPenStore,
    type PathSession,
} from "./pathPenStore";

/**
 * Keep end spots (AP-T9): step 4's Follow onto the spots the line has, in the move every member
 * is in at the playhead (step 4's target rule)
 */
export interface FollowKeep {
    readonly timelineId: number;
    /** The move's start and end beats */
    readonly start: number;
    readonly end: number;
    /** Each member's end spot in that move, by id */
    readonly spots: ReadonlyMap<number, XY>;
    /**
     * The line where that move starts, which is where a trail into its spots starts (step 9
     * review): each member's start there and the order there, tail first. Absent when no order is
     * remembered or guessed there; the start flag's line is used then.
     */
    readonly line?: {
        readonly starts: ReadonlyMap<number, XY>;
        readonly order: readonly number[];
    };
}

/** The Follow tool's drag in progress (a session's `follow`) */
export interface FollowDrag {
    /** The edit window `[start flag, end flag)` the move fills (DL-2) */
    readonly window: TrailWindow;
    /** The selected marchers, by id */
    readonly ids: readonly number[];
    /** The selection in order along the shape it stands in, one end to the other (DL-6) */
    readonly order: readonly number[];
    /** Where each stands at the start flag */
    readonly starts: ReadonlyMap<number, XY>;
    /** The end pressed, who leads (DL-1); null while the ends pulse */
    readonly grabbed: number | null;
    readonly spacing: TrailSpacing;
    /** From trail (AP-T8), Keep end spots (AP-T1, AP-T9) or Ripple in (step 9, AP-T12) */
    readonly ends: FollowEnds;
    /** Keep end spots, offered when every member is in one move at the playhead; else null */
    readonly keep: FollowKeep | null;
    /**
     * Ripple in (step 9, RP-2): the next form, the end spots of `keep` in the form's own order.
     * Absent or null when there's no `keep`, or its spots don't stand in a line, curve or arc.
     */
    readonly form?: RippleForm | null;
    /**
     * Why Ripple in isn't offered (translated) when there are end spots but no form to ripple
     * into: not a line, curve or arc; a loop or a block; on the line itself (RP-2)
     */
    readonly formWhy?: string | null;
    /** One step, in field units */
    readonly step: number;
    /**
     * ▶ Preview on the path bar (step 4c, DL-17): the marchers loop the walk along the trail.
     * Off (absent) by default: they stand at their end spots.
     */
    readonly preview?: boolean;
    /**
     * The middle marcher of the line under the pointer while the ends wait to be grabbed (step
     * 4d): it takes no press, and the note by it says to grab an end. Absent or null elsewhere.
     */
    readonly hover?: number | null;
}

/** The path bar's Ends (DL-8, AP-T9, RP-1) */
export type FollowEnds = "trail" | "keep" | "ripple";

/** Even's steps: the finest choice, and the first offered */
export const EVEN_STEP = 0.5;
export const EVEN_FIRST = 2;

/**
 * The line the tool works on: where it stands at the start flag, or with Keep end spots and
 * Ripple in, where it stands at the start of the move it follows into (`FollowKeep.line`)
 */
export function lineOf(follow: FollowDrag): {
    starts: ReadonlyMap<number, XY>;
    order: readonly number[];
} {
    const kept = intoEndSpots(follow) ? follow.keep?.line : undefined;
    return kept ?? { starts: follow.starts, order: follow.order };
}

/** The line, tail first and the leader last, once an end is grabbed */
export function trailLine(follow: FollowDrag): number[] {
    const { grabbed } = follow;
    const { order } = lineOf(follow);
    if (grabbed === null) return [...order];
    return order[0] === grabbed ? [...order].reverse() : [...order];
}

/** The two ends of the selection along its shape (DL-4) */
export const followEnds = (follow: FollowDrag): number[] => {
    const { order } = lineOf(follow);
    return order.length > 1
        ? [order[0]!, order[order.length - 1]!]
        : [...order];
};

type Planned = { plan: TrailDragPlan; spacing: TrailSpacing } | null;

/** AP-T8's plan and the spacing it uses for the line `f` and `points` (stored, as written) */
function planFollow(
    f: FollowDrag,
    points: ReturnType<typeof storedPoints>,
): { plan: TrailDragPlan; spacing: TrailSpacing } {
    const starts = trailLine(f).map((id): [number, number] => {
        const p = f.starts.get(id)!;
        return [p.x, p.y];
    });
    let plan = planTrailDrag(starts, points, f.spacing, f.step);
    // Even never goes past its limit (it shrinks as points are removed): held at the limit,
    // and Keep spacing while the limit is under Even's finest step
    let spacing = f.spacing;
    const limit = evenLimitOf(plan);
    if (spacing.kind === "even" && limit !== null && spacing.steps > limit) {
        spacing =
            limit < EVEN_STEP
                ? { kind: "keep" }
                : { kind: "even", steps: limit };
        plan = planTrailDrag(starts, points, spacing, f.step);
    }
    return { plan, spacing };
}

const plans = new WeakMap<PathSession, Planned>();

/** AP-T8's plan and the spacing it uses for the points placed, worked out once per session state */
function followPlanned(s: PathSession): Planned {
    if (plans.has(s)) return plans.get(s)!;
    const f = s.follow;
    // The points as written, smooth ones with their roundness, so the preview is the write
    const planned =
        f && f.grabbed !== null ? planFollow(f, storedPoints(s.points)) : null;
    plans.set(s, planned);
    return planned;
}

/**
 * The drawing's plan (step 4d): the points placed and, while drawing, the pointer's landed spot
 * as one more, so the line follows the pointer before the click. Kept apart from the write's
 * (`followPlanned`): finishing writes what's placed. One entry, keyed by what the plan reads, so
 * a session that changes something else (▶ Preview, a hover) doesn't plan again.
 */
let drawnCache: {
    starts: FollowDrag["starts"];
    order: FollowDrag["order"];
    grabbed: number | null;
    spacing: TrailSpacing;
    step: number;
    points: PathSession["points"];
    x: number;
    y: number;
    planned: Planned;
} | null = null;

function followDrawnPlanned(s: PathSession): Planned {
    const f = s.follow;
    const p = s.pointer;
    const last = s.points.at(-1)?.at;
    if (
        !f ||
        f.grabbed === null ||
        s.phase !== "drawing" ||
        !p ||
        (last && last.x === p.x && last.y === p.y)
    )
        return followPlanned(s);
    const c = drawnCache;
    if (
        c &&
        c.starts === f.starts &&
        c.order === f.order &&
        c.grabbed === f.grabbed &&
        sameSpacing(c.spacing, f.spacing) &&
        c.step === f.step &&
        c.points === s.points &&
        c.x === p.x &&
        c.y === p.y
    )
        return c.planned;
    const planned = planFollow(f, [
        ...storedPoints(s.points),
        { at: [p.x, p.y] },
    ]);
    drawnCache = {
        starts: f.starts,
        order: f.order,
        grabbed: f.grabbed,
        spacing: f.spacing,
        step: f.step,
        points: s.points,
        x: p.x,
        y: p.y,
        planned,
    };
    return planned;
}

const sameSpacing = (a: TrailSpacing, b: TrailSpacing) =>
    a.kind === b.kind &&
    (a.kind !== "even" || (b.kind === "even" && a.steps === b.steps));

/**
 * What the drawing shows while a trail is drawn (step 4d): `followPlanOf` with the pointer's
 * landed spot as a provisional last point, so the end spots and the marchers follow the pointer.
 * Without a pointer (or with it on the last point placed) it is `followPlanOf`'s own.
 */
export const followDrawnPlanOf = (s: PathSession): TrailDragPlan | null =>
    followDrawnPlanned(s)?.plan ?? null;

/**
 * AP-T8's Ends for the session as drawn so far: the way, each member's end on it and its spot.
 * Null before an end is grabbed. What the preview draws is what the write stores.
 */
export const followPlanOf = (s: PathSession): TrailDragPlan | null =>
    followPlanned(s)?.plan ?? null;

/**
 * The spacing the drawing uses and writes: the chosen one, with Even held to its limit now
 * (`followPlanOf`'s)
 */
export const followSpacingOf = (s: PathSession): TrailSpacing =>
    followPlanned(s)?.spacing ?? s.follow?.spacing ?? { kind: "keep" };

/**
 * The selected marcher whose start is under `at` (within `radius`): an end of the line, or one in
 * the middle, which takes no press (DL-4). Null elsewhere.
 */
export function followHit(
    follow: FollowDrag,
    at: XY,
    radius: number,
): { id: number; end: boolean } | null {
    let best: { id: number; d: number } | null = null;
    const { order, starts } = lineOf(follow);
    for (const id of order) {
        const p = starts.get(id)!;
        const d = Math.hypot(p.x - at.x, p.y - at.y);
        if (d <= radius && (!best || d < best.d)) best = { id, d };
    }
    if (!best) return null;
    return { id: best.id, end: followEnds(follow).includes(best.id) };
}

/** Whether the session is Follow onto the spots the line has (AP-T9's Keep end spots) */
export const keepsEndSpots = (follow: FollowDrag): boolean =>
    follow.ends === "keep" && follow.keep !== null;

/** Whether the session ripples into the form the line's end spots make (step 9, RP-1) */
export const ripplesIn = (follow: FollowDrag): boolean =>
    follow.ends === "ripple" && follow.keep !== null && !!follow.form;

/**
 * Whether the trail runs on into end spots (Keep end spots or Ripple in): its route ends at the
 * tail's spot, and it may finish with nothing drawn (RP-6)
 */
export const intoEndSpots = (follow: FollowDrag): boolean =>
    keepsEndSpots(follow) || ripplesIn(follow);

/** The line's starts in trail order, tail first */
const lineStarts = (f: FollowDrag): [number, number][] =>
    trailLine(f).map((id): [number, number] => {
        const p = lineOf(f).starts.get(id)!;
        return [p.x, p.y];
    });

const ripplePlans = new WeakMap<PathSession, RipplePlan | null>();

/**
 * Ripple in's plan for the points placed (AP-T12, RP-4): the entrance by the last point, or the
 * leader's start. What finishing writes (with `enter` when the finish is on an end's spot).
 */
export function ripplePlanOf(
    s: PathSession,
    enter?: number | null,
): RipplePlan | null {
    const f = s.follow;
    if (!f || f.grabbed === null || !ripplesIn(f)) return null;
    if (enter != null)
        return planRipple(
            lineStarts(f),
            f.form!,
            storedPoints(s.points),
            enter,
        );
    if (ripplePlans.has(s)) return ripplePlans.get(s)!;
    const plan = planRipple(lineStarts(f), f.form!, storedPoints(s.points));
    ripplePlans.set(s, plan);
    return plan;
}

/**
 * How near an end of the next form counts as on it, in steps (RP-4): the same for what the
 * drawing shows and for a finish, and wide enough for a finger
 */
export const RIPPLE_END_STEPS = 2;

/**
 * The end of the next form whose spot is within `RIPPLE_END_STEPS` of `at`, as the marcher
 * standing there now, or null: a finish there enters there (RP-4)
 */
export function rippleEndAt(follow: FollowDrag, at: XY): number | null {
    const form = follow.form;
    if (!form || !ripplesIn(follow)) return null;
    const radius = RIPPLE_END_STEPS * follow.step;
    let best: { id: number; d: number } | null = null;
    for (const i of [0, form.ids.length - 1]) {
        const p = form.spots[i]!;
        const d = Math.hypot(p[0] - at.x, p[1] - at.y);
        if (d <= radius && (!best || d < best.d))
            best = { id: form.ids[i]!, d };
    }
    return best?.id ?? null;
}

const rippleDrawn = new WeakMap<PathSession, RipplePlan | null>();

/**
 * Ripple in's plan as the drawing shows it (DL-20, RP-4): while drawing, the pointer counts as
 * the last point, and on an end's spot it enters there instead of adding a corner. Else the
 * placed plan (`ripplePlanOf`).
 */
export function rippleDrawnPlanOf(s: PathSession): RipplePlan | null {
    const f = s.follow;
    if (!f || f.grabbed === null || !ripplesIn(f)) return null;
    const p = s.pointer;
    if (s.phase !== "drawing" || !p) return ripplePlanOf(s);
    if (rippleDrawn.has(s)) return rippleDrawn.get(s)!;
    const end = rippleEndAt(f, p);
    const last = s.points.at(-1)?.at;
    const onLast = last && last.x === p.x && last.y === p.y;
    const plan =
        end !== null || onLast
            ? planRipple(lineStarts(f), f.form!, storedPoints(s.points), end)
            : planRipple(lineStarts(f), f.form!, [
                  ...storedPoints(s.points),
                  { at: [p.x, p.y] },
              ]);
    rippleDrawn.set(s, plan);
    return plan;
}

/**
 * The target as drawn once `follow` is grabbed: its line in trail order, the leader last. With
 * Keep end spots it is step 4's trail: over the kept move, each member to its end spot there, the
 * trail running on into the tail's.
 */
export function followTarget(
    target: PathTarget,
    follow: FollowDrag,
    drills: ReadonlyMap<number, string>,
): PathTarget {
    const line = trailLine(follow);
    const keep = intoEndSpots(follow) ? follow.keep : null;
    // Ripple in (RP-3): each takes its spot in the next form, dealt from the end nearer the
    // leader's start until a point is placed (`ripplePlanOf` has it after)
    const dealt =
        ripplesIn(follow) && follow.grabbed !== null
            ? planRipple(lineStarts(follow), follow.form!, []).spots
            : null;
    const { starts } = lineOf(follow);
    const members = line.map((id, q) => ({
        marcherId: id,
        drill: drills.get(id) ?? `${id}`,
        from: starts.get(id)!,
        to: dealt
            ? { x: dealt[q]![0], y: dealt[q]![1] }
            : (keep?.spots.get(id) ?? starts.get(id)!),
    }));
    const leader = members.at(-1)!;
    return {
        ...target,
        marcherId: leader.marcherId,
        start: keep?.start ?? follow.window.start,
        end: keep?.end ?? follow.window.end,
        from: leader.from,
        to: keep ? members[0]!.to : leader.from,
        trail: { members, leaderId: leader.marcherId, reverse: false },
    };
}

/** The drill numbers the session's target names, by id */
const drillsOf = (s: PathSession): Map<number, string> =>
    new Map((s.target.trail?.members ?? []).map((m) => [m.marcherId, m.drill]));

const updateFollow = (
    fn: (s: PathSession, f: FollowDrag) => PathSession,
): void => {
    const { session } = usePathPenStore.getState();
    if (session?.follow)
        usePathPenStore.setState({ session: fn(session, session.follow) });
};

/** An end pressed: it leads, and the drawing starts from it (DL-1) */
export function grabEnd(id: number): void {
    updateFollow((s, f) => {
        if (!followEnds(f).includes(id)) return s;
        const follow = { ...f, grabbed: id, hover: null };
        return {
            ...s,
            follow,
            target: followTarget(s.target, follow, drillsOf(s)),
            points: [],
            pointer: null,
            dragging: null,
        };
    });
}

/**
 * Escape while dragging out a trail: the drawing goes and the ends pulse again; false when there
 * is nothing drawn to cancel, so Escape leaves the tool
 */
export function cancelFollowDrawing(): boolean {
    const { session } = usePathPenStore.getState();
    const f = session?.follow;
    if (!session || !f || f.grabbed === null) return false;
    usePathPenStore.setState({
        session: {
            ...session,
            follow: { ...f, grabbed: null },
            points: [],
            pointer: null,
            dragging: null,
        },
    });
    return true;
}

/** The middle marcher under the pointer before an end is grabbed (step 4d), or null */
export function setFollowHover(id: number | null): void {
    updateFollow((s, f) =>
        (f.hover ?? null) === id || (f.grabbed !== null && id !== null)
            ? s
            : { ...s, follow: { ...f, hover: id } },
    );
}

/** The path bar's Spacing (DL-7): Keep spacing, or Even N steps */
export function setFollowSpacing(spacing: TrailSpacing): void {
    updateFollow((s, f) => ({ ...s, follow: { ...f, spacing } }));
}

/** The path bar's Ends (DL-8, AP-T9, RP-1): From trail, Keep end spots, or Ripple in */
export function setFollowEnds(ends: FollowEnds): void {
    updateFollow((s, f) => {
        if (ends === "keep" && !f.keep) return s;
        if (ends === "ripple" && !(f.keep && f.form)) return s;
        const follow = { ...f, ends };
        // The line changes where it's read (the kept move's start, step 9 review): a grabbed
        // marcher that isn't an end of it there lets go, and the ends pulse again
        if (f.grabbed !== null && !followEnds(follow).includes(f.grabbed))
            return {
                ...s,
                follow: { ...follow, grabbed: null },
                points: [],
                pointer: null,
                dragging: null,
            };
        return {
            ...s,
            follow,
            target:
                f.grabbed === null
                    ? s.target
                    : followTarget(s.target, follow, drillsOf(s)),
        };
    });
}

/** Even's limit in the finest steps offered: the largest N that keeps everyone walking forward */
export const evenLimitOf = (plan: TrailDragPlan | null): number | null =>
    plan?.evenLimit == null
        ? null
        : Math.floor(plan.evenLimit / EVEN_STEP + 1e-9) * EVEN_STEP;

/** The path bar's ▶ Preview (step 4c, DL-17): the marchers loop the walk, or stand at their ends */
export function setFollowPreview(on: boolean): void {
    updateFollow((s, f) =>
        !!f.preview === on ? s : { ...s, follow: { ...f, preview: on } },
    );
}

/**
 * ▶ Preview's loop (DL-17), in milliseconds: a moment at the start, the walk, a pause at the end,
 * then again. A fixed loop rather than the move's counts at its tempo, so a long move still reads
 * at a glance and a short one isn't a flicker.
 */
export const FOLLOW_PREVIEW_LOOP = {
    hold: 400,
    walk: 2400,
    rest: 800,
} as const;

/** Where in the walk ▶ Preview is `ms` after it started: 0 at the start, 1 at the end spots */
export function followPreviewProgress(ms: number): number {
    const { hold, walk, rest } = FOLLOW_PREVIEW_LOOP;
    const t =
        ((ms % (hold + walk + rest)) + hold + walk + rest) %
        (hold + walk + rest);
    if (t <= hold) return 0;
    if (t >= hold + walk) return 1;
    return (t - hold) / walk;
}

/** The real marchers the Follow drawing shows (step 4c, DL-16, DL-17) */
export interface FollowMarchers {
    /** The line, tail first */
    readonly ids: readonly number[];
    /** Where each stands once the move ends: the spots written */
    readonly spots: readonly XY[];
    /** With ▶ Preview on: where each is at progress `p` of the move (0 to 1), R-13″ */
    readonly walk?: (p: number) => readonly XY[];
}

/**
 * The line's marchers at their end spots while a trail is drawn (DL-16): the spots AP-T8 writes,
 * with the pointer as the next point while drawing (step 4d), and ▶ Preview's walk when it's on.
 * Null until there's a trail (`followHasTrail`), and with Keep end spots, whose marchers already stand on theirs.
 */
export function followMarchersOf(s: PathSession | null): FollowMarchers | null {
    if (!s) return null;
    const f = s.follow;
    if (!f || !followHasTrail(s) || keepsEndSpots(f)) return null;
    // Ripple in (step 9): the marchers on their dealt spots, and the walk into the next form
    if (ripplesIn(f)) {
        const ripple = rippleDrawnPlanOf(s);
        if (!ripple) return null;
        const ids = trailLine(f);
        const spots = ripple.spots.map(([x, y]) => ({ x, y }));
        if (!f.preview) return { ids, spots };
        return {
            ids,
            spots,
            walk: (p) => ripplePreview(ripple, p).map(([x, y]) => ({ x, y })),
        };
    }
    const plan = followDrawnPlanOf(s);
    if (!plan) return null;
    const ids = trailLine(f);
    const spots = plan.spots.map(([x, y]) => ({ x, y }));
    if (!f.preview) return { ids, spots };
    return {
        ids,
        spots,
        walk: (p) => trailDragPreview(plan, p).map(([x, y]) => ({ x, y })),
    };
}

/**
 * Whether the drawing has a trail to show yet (step 4d): a point placed, or the pointer out on
 * the field while an end is grabbed
 */
export function followHasTrail(s: PathSession): boolean {
    return (
        !!s.follow &&
        s.follow.grabbed !== null &&
        // Ripple in always has one once an end is grabbed: the straight connector (RP-5)
        (s.points.length > 0 || s.pointer !== null || ripplesIn(s.follow))
    );
}

/**
 * What the path bar keeps clear of while the Follow tool is open (step 4e): the line's starts,
 * where it ends now (the drawing's plan, so the pointer's leg too) and the pointer. Empty for
 * any other session.
 */
export function followFootprint(s: PathSession): XY[] {
    const f = s.follow;
    if (!f || s.phase !== "drawing") return [];
    const at: XY[] = [...lineOf(f).starts.values()];
    const plan = ripplesIn(f) ? rippleDrawnPlanOf(s) : followDrawnPlanOf(s);
    if (plan) for (const [x, y] of plan.spots) at.push({ x, y });
    if (s.pointer) at.push(s.pointer);
    return at;
}

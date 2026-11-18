/**
 * Follow by dragging out a trail, pathways step 4b (spec Appendix L, procedures AP-T8 and AP-T9):
 * the selected marchers stand in a line, curve or arc at the start flag; a trail dragged out of
 * one end of it is followed by the line, and where the line stops at the end flag becomes the next
 * page's spots, in one undo step.
 *
 * - `followOrderAt`: the line's order and so its two ends (DL-4, DL-6): the order the show
 *   remembers (step 4f, DL-21), or else `followSource`, the line the marchers stand in as the
 *   shape tool fits it (a line, an arc, or a curve with corners or smooth).
 * - `planTrailDrag`: the way, each member's end on it and its spot (AP-T8's Ends), for Keep
 *   spacing or Even N steps, with Even's limit. Pure: the preview and the write both use it, and
 *   it is the resolver's own geometry (R-13″), so the preview is where the marchers will be.
 * - `dragTrailInTransaction`: the write (AP-T8, From trail), or AP-T1 onto the spots the members
 *   already have (AP-T9, Keep end spots).
 */
import { and, eq, gt, inArray, lt } from "drizzle-orm";
import {
    alongEnds,
    createResolver,
    EPS_GEOM,
    makeAlongTrail,
    type FtlTrail,
    type XY,
} from "@openmarch/core";
import { schema } from "@/global/database/db";
import { readTimelineTables } from "@/timeline/timelineRows";
import { text, type TimelineText } from "@/timeline/timelineText";
import { fitCircle } from "@/shapes/geometry/fit";
import type { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { refuse, TimelineWriteError } from "./timelineErrors";
import { firstLanedRow } from "./timelineLanes";
import { marcherName, type RoutePointInput } from "./timelineRoutes";
import { moveMarchersInRangeInTransaction } from "./timelineMoves";
import { readPageGrid } from "./timelinePageGrid";
import { addPageFlagInTransaction } from "./pageFlags";
import { saveShapeRecipeInTransaction } from "./shapeRecipes";
import { trailShapeRecipe } from "./timelineTrailShape";
import { rememberedOrderAt } from "./rememberedOrder";
import {
    followTrailInTransaction,
    lineOrder,
    trailRefusal,
    type FollowTrailResult,
} from "./timelineTrails";

/** The refusals' texts of step 4b, translated where they are shown. */
export const trailDragRefusal = {
    /** AP-T8: the marchers don't stand in a line, curve or arc */
    notFitted: () => text.t("timeline.refusals.trail.notFitted"),
    /** AP-T8: the trail was started from a marcher who isn't an end of the line */
    notAnEnd: () => text.t("timeline.refusals.trail.notAnEnd"),
    /** AP-T8: a trail shorter than ε_geom */
    tooShort: () => text.t("timeline.refusals.trail.tooShort"),
    /** AP-T8: Even N wider than lets everyone walk forward */
    evenTooWide: (limit: number) =>
        text.t("timeline.refusals.trail.evenTooWide", { limit }),
    /** AP-T9: Keep end spots, with members who have no spots in the window's move */
    noSpots: () => text.t("timeline.refusals.trail.noSpots"),
    /** AP-T8: a member's new spot couldn't be written into the one move over the window */
    notOneMove: (marcher: string) =>
        text.t("timeline.refusals.trail.notOneMove", { marcher }),
    /** The edit window is at home, or not a range */
    noWindow: () => text.t("timeline.refusals.trail.noWindow"),
};

// ---------------------------------------------------------------------------
// Pure: the source shape
// ---------------------------------------------------------------------------

/** The line the marchers stand in (DL-6): its kind, and the marchers in order along it. */
export interface FollowSource {
    kind: "line" | "arc" | "curve";
    /** Indexes into the starts, from one end of the shape to the other */
    order: number[];
}

const median = (xs: readonly number[]): number => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)] ?? 0;
};

/** Each start's distance to its nearest other start */
const nearestGaps = (starts: readonly XY[]): number[] =>
    starts.map((p, i) =>
        Math.min(
            ...starts.map((q, j) =>
                i === j ? Infinity : Math.hypot(p[0] - q[0], p[1] - q[1]),
            ),
        ),
    );

/**
 * Whether `order` runs through `starts` as a chain of near neighbors: each marcher's nearest
 * other is next to it in the order, and no step is much longer than the usual one. A shape fitted
 * through scattered marchers fails it.
 */
function chained(
    starts: readonly XY[],
    order: readonly number[],
    gaps: readonly number[],
    tol: number,
): boolean {
    const at = (j: number) => starts[j]!;
    const steps = order
        .slice(1)
        .map((j, k) =>
            Math.hypot(
                at(j)[0] - at(order[k]!)[0],
                at(j)[1] - at(order[k]!)[1],
            ),
        );
    const position = new Map(order.map((j, k) => [j, k]));
    const nearOk = starts.every((p, i) => {
        const k = position.get(i)!;
        const near = Math.min(
            ...[order[k - 1], order[k + 1]]
                .filter((j): j is number => j !== undefined)
                .map((j) => Math.hypot(p[0] - at(j)[0], p[1] - at(j)[1])),
        );
        return near <= gaps[i]! + tol;
    });
    return nearOk && Math.max(...steps) <= 2.5 * median(steps);
}

/**
 * The shape the marchers stand in at the start flag (AP-T8's Source), fitted as the shape tool
 * fits: a **line** (principal axis; order along it, left to right as drill is read), an **arc**
 * (the circle fit the Arc kind uses; order around it from the end after its widest gap), or a
 * **curve** (corners or smooth: from one of the two marchers farthest apart, each next the
 * nearest, with no neighbor much farther than the usual one). Every marcher must lie within a
 * quarter of the usual spacing of the shape. Null when none fits: a free pick of marchers is
 * later (DL-6).
 */
export function followSource(starts: readonly XY[]): FollowSource | null {
    const n = starts.length;
    if (n < 2) return null;
    const gaps = nearestGaps(starts);
    const usual = median(gaps);
    if (!(usual > EPS_GEOM)) return null;
    const tol = usual / 4;
    // A line: the principal axis
    const cx = starts.reduce((s, p) => s + p[0], 0) / n;
    const cy = starts.reduce((s, p) => s + p[1], 0) / n;
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (const [x, y] of starts) {
        sxx += (x - cx) ** 2;
        sxy += (x - cx) * (y - cy);
        syy += (y - cy) ** 2;
    }
    const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    let ux = Math.cos(angle);
    let uy = Math.sin(angle);
    // Read left to right (then top to bottom), as the shape tool's line is
    if (ux < -1e-9 || (Math.abs(ux) <= 1e-9 && uy < 0)) {
        ux = -ux;
        uy = -uy;
    }
    const along = starts.map(([x, y]) => (x - cx) * ux + (y - cy) * uy);
    const across = starts.map(([x, y]) =>
        Math.abs(-(x - cx) * uy + (y - cy) * ux),
    );
    if (Math.max(...across) <= tol)
        return {
            kind: "line",
            order: starts
                .map((_, i) => i)
                .sort((a, b) => along[a]! - along[b]! || a - b),
        };
    // An arc: the Arc kind's circle fit, the marchers on it
    const circle = fitCircle(starts.map(([x, y]) => ({ x, y })));
    if (circle) {
        const { center, r } = circle;
        const off = starts.map(([x, y]) =>
            Math.abs(Math.hypot(x - center.x, y - center.y) - r),
        );
        if (n >= 3 && Math.max(...off) <= tol) {
            const angles = starts.map(([x, y]) =>
                Math.atan2(y - center.y, x - center.x),
            );
            const byAngle = starts
                .map((_, i) => i)
                .sort((a, b) => angles[a]! - angles[b]! || a - b);
            // Start after the widest empty gap, so the arc runs end to end
            let after = n - 1;
            let widest =
                angles[byAngle[0]!]! + 2 * Math.PI - angles[byAngle[n - 1]!]!;
            for (let i = 0; i + 1 < n; i++) {
                const gap = angles[byAngle[i + 1]!]! - angles[byAngle[i]!]!;
                if (gap > widest) {
                    widest = gap;
                    after = i;
                }
            }
            const order = [
                ...byAngle.slice(after + 1),
                ...byAngle.slice(0, after + 1),
            ];
            // From its left end, as a line
            const first = starts[order[0]!]!;
            const last = starts[order[n - 1]!]!;
            if (first[0] > last[0] + 1e-9) order.reverse();
            if (chained(starts, order, gaps, tol))
                return { kind: "arc", order };
        }
    }
    // A curve, with corners or smooth: a chain of near neighbors, none skipped
    const order = lineOrder(starts);
    if (chained(starts, order, gaps, tol)) {
        const first = starts[order[0]!]!;
        const last = starts[order[n - 1]!]!;
        if (first[0] > last[0] + 1e-9) order.reverse();
        return { kind: "curve", order };
    }
    return null;
}

/**
 * The order of the marchers `ids` along their line at `beat` (the start flag), as indexes into
 * `ids` and `starts`: the order the show remembers for them (step 4f, DL-21, `rememberedOrder`),
 * or else the one `followSource` guesses from where they stand (`starts`). Null when neither has
 * one. The Follow tool opening and the write both ask this, so they agree on the line's ends.
 *
 * `leaderFirst` says which end leads before an end is grabbed: a remembered order runs leader
 * first; a guessed one has no leader, and the Follow tool offers its last as the leader.
 */
export async function followOrderAt(
    db: DbConnection | DbTransaction,
    ids: readonly number[],
    beat: number,
    starts: readonly XY[],
): Promise<{ order: number[]; leaderFirst: boolean } | null> {
    const remembered = await rememberedOrderAt(db, ids, beat);
    if (remembered && remembered.length === ids.length)
        return {
            order: remembered.map((m) => ids.indexOf(m)),
            leaderFirst: true,
        };
    const guess = followSource(starts)?.order;
    return guess ? { order: guess, leaderFirst: false } : null;
}

/** `followOrderAt`'s order as a trail runs it, tail first and its leader last */
export const tailFirstOf = ({
    order,
    leaderFirst,
}: {
    order: readonly number[];
    leaderFirst: boolean;
}): number[] => (leaderFirst ? [...order].reverse() : [...order]);

/**
 * The trail order (tail first, leader last) for the source `order` grabbed at `grabbed` (an index
 * into the starts), or null when `grabbed` isn't one of its two ends (DL-4).
 */
export function trailOrderFrom(
    order: readonly number[],
    grabbed: number,
): number[] | null {
    if (order[order.length - 1] === grabbed) return [...order];
    if (order[0] === grabbed) return [...order].reverse();
    return null;
}

// ---------------------------------------------------------------------------
// Pure: the ends (AP-T8)
// ---------------------------------------------------------------------------

/** Spacing on the path bar (DL-7): keep each member's distance along the way, or even steps */
export type TrailSpacing = { kind: "keep" } | { kind: "even"; steps: number };

/** What a dragged trail does (AP-T8), worked out before anything is written */
export interface TrailDragPlan {
    /** The way `P` (R-13″): the line-up through the starts, then the drawn part */
    way: FtlTrail;
    /** Each member's start along the way (`startDist`), tail first */
    startDist: number[];
    /** Each member's end along the way (`e_q`) */
    ends: number[];
    /** The spots written, `P(e_q)` */
    spots: XY[];
    /** The drawn part's length `W.L` (0 when nothing is drawn yet) */
    drawn: number;
    /**
     * Even's limit, in steps: the largest N that keeps every member walking forward. Null for
     * fewer than two members.
     */
    evenLimit: number | null;
    /** Whether every member walks forward (`e_q ≥ startDist[q]`); Even past its limit doesn't */
    forward: boolean;
}

/**
 * AP-T8's Ends for the line `starts` (tail first, leader last) and the drawn `points` (in walking
 * order from the leader, the last one the trail's end). `step` is one step in field units. With
 * Keep spacing `e_q = startDist[q] + W.L`; with Even N, `e_q = lineLen + W.L − (m − 1 − q)·N·step`.
 * The way is the resolver's own (`makeAlongTrail`), so `P(e_q)` is where R-13″ ends them.
 */
export function planTrailDrag(
    starts: readonly XY[],
    points: readonly RoutePointInput[],
    spacing: TrailSpacing,
    step: number,
): TrailDragPlan {
    const leader = starts[starts.length - 1] ?? [0, 0];
    const last = points.at(-1)?.at ?? leader;
    const way = makeAlongTrail(starts, {
        from: leader,
        to: [last[0], last[1]],
        points: points.map((p) => ({
            at: [p.at[0], p.at[1]],
            ...(p.tension === undefined ? {} : { tension: p.tension }),
            // R-14″: an arc leg into a point keeps its bulge, so the plan is the way written
            ...(p.bulge === undefined ? {} : { bulge: p.bulge }),
        })),
    });
    const startDist = starts.map((_, q) => way.cum[q]!);
    const m = starts.length;
    const lineLen = startDist[m - 1] ?? 0;
    const total = way.destOffset;
    const drawn = total - lineLen;
    const ends =
        spacing.kind === "keep"
            ? startDist.map((s) => s + drawn)
            : startDist.map(
                  (_, q) => total - (m - 1 - q) * spacing.steps * step,
              );
    // N ≤ (total − startDist[q]) / ((m − 1 − q)·step) for every member behind the leader
    let evenLimit: number | null = null;
    for (let q = 0; q < m - 1; q++) {
        const n = (total - startDist[q]!) / ((m - 1 - q) * step);
        evenLimit = evenLimit === null ? n : Math.min(evenLimit, n);
    }
    return {
        way,
        startDist,
        ends,
        spots: ends.map((e) => way.at(e)),
        drawn,
        evenLimit,
        forward: ends.every((e, q) => e >= startDist[q]! - EPS_GEOM),
    };
}

/**
 * Where each member is at progress `p` of the move (0 to 1) with spots `spots`: R-13″, as the
 * resolver will have it once written (QA-DL-1). For the drawing's preview.
 */
export function trailDragPreview(plan: TrailDragPlan, p: number): XY[] {
    const { endDist, turn, straight } = alongEnds(
        plan.way,
        plan.spots,
        plan.startDist,
    );
    return plan.spots.map((spot, q) => {
        if (p <= 0) return plan.way.at(plan.startDist[q]!);
        if (p >= 1) return spot;
        const a = endDist[q]! - plan.startDist[q]!;
        const d = (a + straight[q]!) * p;
        if (d < a || !(straight[q]! > 0))
            return plan.way.at(plan.startDist[q]! + Math.min(d, a));
        const f = (d - a) / straight[q]!;
        return [
            turn[q]![0] + (spot[0] - turn[q]![0]) * f,
            turn[q]![1] + (spot[1] - turn[q]![1]) * f,
        ];
    });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The edit window a trail is dragged in (DL-2): `[start flag, end flag)`, in beats */
export interface TrailWindow {
    start: number;
    end: number;
}

/** Which move over exactly `window` each of `marcherIds` is in, row by row */
async function windowRows(
    db: DbConnection | DbTransaction,
    window: TrailWindow,
    marcherIds: readonly number[],
): Promise<{ timelineId: number; marcherId: number }[]> {
    const T = schema.timeline_transitions;
    const A = schema.timeline_assignments;
    const L = schema.timelines;
    return await db
        .select({ timelineId: T.timeline_id, marcherId: A.marcher_id })
        .from(A)
        .innerJoin(T, eq(T.id, A.transition_id))
        .innerJoin(L, eq(L.id, T.timeline_id))
        .where(
            and(
                inArray(A.marcher_id, [...marcherIds]),
                eq(L.start_beat, window.start),
                eq(L.end_beat, window.end),
            ),
        )
        .all();
}

/**
 * The move over exactly `window` that holds every one of `marcherIds` (their spots there, AP-T9),
 * or null. Ends: Keep end spots is offered only with one.
 */
export async function windowMoveOf(
    db: DbConnection | DbTransaction,
    window: TrailWindow,
    marcherIds: readonly number[],
): Promise<number | null> {
    const rows = await windowRows(db, window, marcherIds);
    const moves = new Set(rows.map((r) => r.timelineId));
    if (moves.size !== 1) return null;
    const holding = new Set(rows.map((r) => r.marcherId));
    return marcherIds.every((m) => holding.has(m)) ? [...moves][0]! : null;
}

/**
 * A member of `line` (tail first) who isn't in the leader's move over exactly `window`: the first
 * one from the leader back, or the leader when it has none.
 */
async function outOfWindowMove(
    tx: DbTransaction,
    window: TrailWindow,
    line: readonly number[],
): Promise<number> {
    const rows = await windowRows(tx, window, line);
    const leader = line[line.length - 1]!;
    const move = rows.find((r) => r.marcherId === leader)?.timelineId;
    if (move === undefined) return leader;
    const holding = new Set(
        rows.filter((r) => r.timelineId === move).map((r) => r.marcherId),
    );
    return [...line].reverse().find((m) => !holding.has(m)) ?? leader;
}

// ---------------------------------------------------------------------------
// AP-T8 and AP-T9
// ---------------------------------------------------------------------------

export interface TrailDragInput {
    /** The edit window `[start flag, end flag)` */
    window: TrailWindow;
    /** The selected marchers (two or more) */
    marcherIds: readonly number[];
    /** The end of the line the trail was dragged out of: the leader (DL-1) */
    leaderId: number;
    /** The drawn points, in walking order from the leader; the last is the trail's end */
    points: readonly RoutePointInput[];
    spacing: TrailSpacing;
    /** One step, in field units */
    step: number;
    /** AP-T9: From trail (AP-T8, the default) or Keep end spots (AP-T1) */
    ends: "trail" | "keep";
    /**
     * Keep end spots: the move the line follows into, step 4's (the one move every member is in
     * at the playhead). The one over exactly the window when absent.
     */
    keepMove?: number | null;
}

export interface TrailDragResult extends FollowTrailResult {
    /** The page added at the end flag (the window was past the last page), or null */
    addedPage: { startBeat: number; endBeat: number } | null;
    /** From trail (step 4c, DL-11): the shape recipe saved for the end spots; absent otherwise */
    recipeId?: number;
}

/**
 * The start beat of the move Keep end spots follows into (`keepMove`, else the one over exactly
 * the window), or the start flag when there's none (Keep end spots then refuses, `noSpots`).
 */
async function keptMoveStart(
    tx: DbTransaction,
    input: Pick<TrailDragInput, "window" | "marcherIds" | "keepMove">,
): Promise<number> {
    const move =
        input.keepMove ??
        (await windowMoveOf(tx, input.window, input.marcherIds));
    if (move === null) return input.window.start;
    const row = await tx
        .select({ start: schema.timelines.start_beat })
        .from(schema.timelines)
        .where(eq(schema.timelines.id, move))
        .get();
    return row?.start ?? input.window.start;
}

/** AP-T8's reads and refusals, with nothing written. */
async function planDragInTransaction(
    tx: DbTransaction,
    input: TrailDragInput,
    /** False before anything is drawn: the trail's length isn't asked about yet */
    drawn = true,
): Promise<{ line: number[]; plan: TrailDragPlan }> {
    const { window, leaderId, points, spacing, step } = input;
    const ids = [...new Set(input.marcherIds)].sort((a, b) => a - b);
    if (ids.length < 2) refuse(trailRefusal.tooFew());
    if (!(window.end > window.start) || window.start < 0)
        refuse(trailDragRefusal.noWindow());
    const resolver = createResolver((await readTimelineTables(tx)).snapshot);
    // Where the marchers stand at the start flag; with Keep end spots, at the start of the move
    // they follow into, where AP-T1's trail starts (step 9 review)
    const from =
        input.ends === "keep" ? await keptMoveStart(tx, input) : window.start;
    const starts = ids.map((m): XY => {
        const [x, y] = resolver.positionAt(m, from);
        return [x, y];
    });
    const along = await followOrderAt(tx, ids, from, starts);
    if (!along) refuse(trailDragRefusal.notFitted());
    const order = trailOrderFrom(along.order, ids.indexOf(leaderId));
    if (!order) refuse(trailDragRefusal.notAnEnd());
    const plan = planTrailDrag(
        order.map((i) => starts[i]!),
        points,
        spacing,
        step,
    );
    // Keep end spots may run straight in with nothing drawn (step 9, RP-6): the leg from the
    // leader's start to the tail's spot is its trail, as step 4's Follow with no points
    if (drawn && input.ends !== "keep" && !(plan.drawn >= EPS_GEOM))
        refuse(trailDragRefusal.tooShort());
    // Keep end spots has no spacing of its own: the members go to the spots they have
    if (input.ends !== "keep" && spacing.kind === "even" && !plan.forward)
        refuse(
            trailDragRefusal.evenTooWide(
                Math.floor((plan.evenLimit ?? 0) * 4) / 4,
            ),
        );
    const line = order.map((i) => ids[i]!);
    if (input.ends === "keep") return { line, plan };
    // AP-T1's refusals on the moves the members have in the window now (AP-T8's peel)
    const T = schema.timeline_transitions;
    const A = schema.timeline_assignments;
    const rows = await tx
        .select({ assignment: A, transition: T })
        .from(A)
        .innerJoin(T, eq(T.id, A.transition_id))
        .where(
            and(
                inArray(A.marcher_id, ids),
                lt(A.start_beat, window.end),
                gt(A.end_beat, window.start),
            ),
        )
        .all();
    for (const r of rows)
        if (r.transition.path_style === "follow_the_leader")
            refuse(
                trailRefusal.alreadyFollows(
                    await marcherName(tx, r.assignment.marcher_id),
                ),
            );
    const laned = await firstLanedRow(
        tx,
        rows.map((r) => r.assignment),
    );
    if (laned)
        refuse(trailRefusal.hasPath(await marcherName(tx, laned.marcher_id)));
    return { line, plan };
}

/**
 * Why a trail dragged out of the line `marcherIds` in `window` from `leaderId` would be refused,
 * asked before anything is drawn, or null (the trail's own length is the drawing's). Writes
 * nothing.
 */
export async function trailDragRefusalFor(
    tx: DbTransaction,
    window: TrailWindow,
    marcherIds: readonly number[],
    leaderId: number,
    ends: "trail" | "keep",
    /** Keep end spots: the move the line follows into (`TrailDragInput.keepMove`) */
    keepMove?: number | null,
): Promise<TimelineText | null> {
    try {
        await planDragInTransaction(
            tx,
            {
                window,
                marcherIds,
                leaderId,
                points: [],
                spacing: { kind: "keep" },
                step: 1,
                ends,
                keepMove,
            },
            false,
        );
        if (
            ends === "keep" &&
            (keepMove ?? (await windowMoveOf(tx, window, marcherIds))) === null
        )
            refuse(trailDragRefusal.noSpots());
        return null;
    } catch (error) {
        if (error instanceof TimelineWriteError && error.text)
            return error.text;
        throw error;
    }
}

/**
 * AP-T8 (From trail) or AP-T9's Keep end spots, inside one write-wrapper transaction.
 *
 * From trail: refusals first (AP-T1's for the moves the members have in the window, a source
 * that isn't a line, curve or arc, a start that isn't an end, a trail shorter than ε_geom, Even
 * past its limit). Then a page is added at the end flag when the window is past the last page;
 * the members' spots in the window are written at `P(e_q)` (replacing any they had, DL-2) by the
 * canvas's own range writer, which makes the move over the window as needed; and AP-T1 peels
 * them into one new follow-the-leader transition in that move, in trail order (the grabbed end
 * leading), with those spots as its placed destinations, a trail route for the drawn points
 * (`from` the leader's start, `to` the last point) and `path_params.ends = "along"`.
 *
 * Step 4c (DL-11): From trail also saves the end spots as a shape recipe (a Line, an Arc or a
 * Curve, `trailShapeRecipe`), each member where it was written, in the same transaction.
 *
 * Keep end spots: AP-T1 onto the spots the members have in the window's move, in the same trail
 * order, the drawn points kept.
 */
export async function dragTrailInTransaction(
    tx: DbTransaction,
    input: TrailDragInput,
): Promise<TrailDragResult> {
    const { window, points } = input;
    const { line, plan } = await planDragInTransaction(tx, input);
    if (input.ends === "keep") {
        const move = input.keepMove ?? (await windowMoveOf(tx, window, line));
        if (move === null) refuse(trailDragRefusal.noSpots());
        const followed = await followTrailInTransaction({
            tx,
            timelineId: move,
            marcherIds: line,
            points,
            line,
        });
        return { ...followed, addedPage: null };
    }
    // Past the last page: a page at the end flag first (DL-2)
    let addedPage: TrailDragResult["addedPage"] = null;
    const grid = await readPageGrid(tx);
    const lastEnd = grid.pages.at(-1)?.end ?? 0;
    if (window.end > lastEnd) {
        const added = await addPageFlagInTransaction({ tx, beat: window.end });
        addedPage = { startBeat: added.startBeat, endBeat: added.endBeat };
    }
    // The next page's spots, where the line stops
    await moveMarchersInRangeInTransaction({
        tx,
        range: window,
        moves: line.map((marcherId, q) => ({
            marcherId,
            x: plan.spots[q]![0],
            y: plan.spots[q]![1],
        })),
        keepUnchanged: true,
    });
    const move = await windowMoveOf(tx, window, line);
    // The range writer left someone out of the window's one move (a member who ends where it
    // starts and is taken out, or a shape's member kept in its own): named, all of it undone
    if (move === null)
        refuse(
            trailDragRefusal.notOneMove(
                await marcherName(tx, await outOfWindowMove(tx, window, line)),
            ),
        );
    const followed = await followTrailInTransaction({
        tx,
        timelineId: move,
        marcherIds: line,
        points,
        line,
        along: true,
    });
    // Step 4c (DL-11): the spots as a shape the shape tools open, each member where it was written
    const { recipe, members } = trailShapeRecipe(plan, line);
    const recipeId = await saveShapeRecipeInTransaction({
        tx,
        timelineId: move,
        recipe,
        members,
    });
    return { ...followed, addedPage, recipeId };
}

/** AP-T8 or AP-T9 as one undoable edit. */
export async function dragTrail(
    args: { db: DbConnection } & TrailDragInput,
): Promise<TrailDragResult> {
    const { db, ...input } = args;
    return await transactionWithHistory(db, "dragTrail", (tx) =>
        dragTrailInTransaction(tx, input),
    );
}

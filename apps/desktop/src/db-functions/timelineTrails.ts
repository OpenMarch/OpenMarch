/**
 * Follow a drawn trail, pathways step 4 (spec Appendix K, procedures AP-T1 to AP-T6): a line of
 * marchers follows the leader along a trail drawn with the pen, into the end spots they already
 * have.
 *
 * - **AP-T1** `followTrailInTransaction`: the chosen marchers of a move get one follow-the-leader
 *   transition of their own in that move, with their end spots as its placed destinations and a
 *   trail route for the drawn part. Nobody's end spot moves.
 * - **AP-T2** `editTrailPointsInTransaction`: the trail's points change (the pen, a point drag).
 * - **AP-T3** `reverseTrailInTransaction`: the other end leads (`path_params.reverse`, R-12′).
 * - **AP-T4** `removeTrailInTransaction`: the move is straight again, with the same end spots.
 * - **AP-T5** `refuseTrailsInMoves`, `refuseTrailRows`: edits that can't keep a follow move
 *   exact refuse, naming it.
 * - **AP-T6** lives in `removeAssignmentRowsInTransaction`: a marcher who leaves a follow move
 *   leaves a gap, so the order and the others' end spots stay.
 *
 * Each is one undoable edit, and every refusal is decided before the first write.
 */
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import {
    createResolver,
    validateRouteGeometry,
    type RouteGeometry,
    type XY,
} from "@openmarch/core";
import { schema } from "@/global/database/db";
import { readTimelineTables } from "@/timeline/timelineRows";
import {
    text,
    type TimelineText,
    type TimelineTextArg,
} from "@/timeline/timelineText";
import type { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import {
    assertValid,
    mapDbErrors,
    refuse,
    TimelineWriteError,
} from "./timelineErrors";
import { createTimelineAssignmentsInTransaction } from "./timelineAssignments";
import {
    lastLegBulge,
    markArcsInTransaction,
    writeRouteGeometryInTransaction,
} from "./timelineRouteGeometry";
import {
    firstLanedRow,
    markTrailModelInTransaction,
    sweepOrphanRoutesInTransaction,
} from "./timelineLanes";
import {
    destinationOf,
    marcherName,
    moveNameOf,
    routeRefusal,
    samePoint,
    type RoutePointInput,
} from "./timelineRoutes";
import { pointsToStore } from "./timelineGroupRoutes";
import { memberRows, type MemberRow } from "./timelineMemberRows";
import { removeAssignmentRowsInTransaction } from "./timelineMembership";
import { dropOrderMarksInTransaction } from "./shapeRecipes";

type TransitionDbRow = typeof schema.timeline_transitions.$inferSelect;

const FTL = "follow_the_leader";

/** The refusals' texts, translated where they are shown. */
export const trailRefusal = {
    /** AP-T1: one marcher has nobody to follow */
    tooFew: () => text.t("timeline.refusals.trail.tooFew"),
    /** AP-T1: the marcher's row doesn't span the move */
    partWay: (marcher: string) =>
        text.t("timeline.refusals.trail.partWay", { marcher }),
    /** AP-T1: a drawn path on a chosen marcher */
    hasPath: (marcher: string) =>
        text.t("timeline.refusals.trail.hasPath", { marcher }),
    /** AP-T1: some of a follow move's line chosen, or a line with others added */
    alreadyFollows: (marcher: string) =>
        text.t("timeline.refusals.trail.alreadyFollows", { marcher }),
    /** AP-T1: a move into a stored shape, shared with marchers who stay */
    sharedShape: (move: TimelineTextArg) =>
        text.t("timeline.refusals.trail.sharedShape", { move }),
    /** AP-T5: an edit that can't keep a follow move exact */
    notYet: (move: TimelineTextArg) =>
        text.t("timeline.refusals.trail.notYet", { move }),
    /** AP-T5: split at the playhead on a follow move */
    split: (move: TimelineTextArg) =>
        text.t("timeline.refusals.trail.split", { move }),
    /** AP-T5: the Move card's Straight and Arc on a follow move */
    removeTrailFirst: (move: TimelineTextArg) =>
        text.t("timeline.refusals.trail.removeTrailFirst", { move }),
    /** A trail that is gone (deleted, or undone) */
    noTrail: () => text.t("timeline.refusals.trail.noTrail"),
    /** Owner, 2026-11-10: Reverse is off for a dragged-out line (R-13″) */
    reverseAlong: () => text.t("timeline.refusals.trail.reverseAlong"),
};

// ---------------------------------------------------------------------------
// Pure: the order of a line
// ---------------------------------------------------------------------------

const distance = (a: XY, b: XY) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/**
 * The order of marchers along the line they stand in (AP-T1): from one of the two marchers
 * farthest apart, each next one is the nearest not yet taken (ties by index). A straight or bent
 * line comes out end to end, and a ring comes out around. Returns indexes into `starts`.
 */
export function lineOrder(starts: readonly XY[]): number[] {
    const n = starts.length;
    if (n < 2) return starts.map((_, i) => i);
    let first = 0;
    let far = -1;
    for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
            const d = distance(starts[i]!, starts[j]!);
            if (d > far) {
                far = d;
                first = i;
            }
        }
    const order = [first];
    const left = new Set(starts.map((_, i) => i));
    left.delete(first);
    while (left.size > 0) {
        const from = starts[order[order.length - 1]!]!;
        let next = -1;
        let best = Infinity;
        for (const i of left) {
            const d = distance(from, starts[i]!);
            if (d < best) {
                best = d;
                next = i;
            }
        }
        order.push(next);
        left.delete(next);
    }
    return order;
}

/**
 * The trail order Follow starts with (AP-T1), tail first: `lineOrder`, led by whichever end
 * gives the shorter way from the leader's start to the tail's end spot, where the line is
 * entered. A tie keeps `lineOrder`'s direction. Reverse makes the other end lead.
 */
export function followOrder(
    starts: readonly XY[],
    ends: readonly XY[],
): number[] {
    const order = lineOrder(starts);
    if (order.length < 2) return order;
    const tail = order[0]!;
    const head = order[order.length - 1]!;
    const asIs = distance(starts[head]!, ends[tail]!);
    const turned = distance(starts[tail]!, ends[head]!);
    return turned < asIs ? [...order].reverse() : order;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** A follow move's trail: its transition, route and who is on which slot. */
export interface MoveTrail {
    timelineId: number;
    transitionId: number;
    routeId: number;
    start: number;
    end: number;
    /** Whether the other end leads (R-12′) */
    reverse: boolean;
    /** Whether the members end along the way (R-13″, step 4b) */
    along: boolean;
    geometry: RouteGeometry;
    /** The marchers in the line, by slot: the tail first, or the leader first when reversed */
    marcherIds: number[];
}

const isReversed = (transition: TransitionDbRow): boolean =>
    transition.path_params !== null &&
    (JSON.parse(transition.path_params) as { reverse?: boolean }).reverse ===
        true;

/** Whether a follow move's members end along the way (R-13″, pathways step 4b) */
export const isAlong = (transition: TransitionDbRow): boolean =>
    transition.path_params !== null &&
    (JSON.parse(transition.path_params) as { ends?: string }).ends === "along";

/** A trail's last drawn point, where a route with its ends along the way runs to (AP-T8) */
const lastPoint = (
    points: readonly { at: readonly [number, number] }[],
    none: XY,
): XY => {
    const last = points.at(-1);
    return last ? [last.at[0], last.at[1]] : none;
};

/**
 * Every trail of move `timelineId` (or of any of several moves), or of the show, by transition id.
 * Two reads, however many trails.
 */
export async function readTrails(
    db: DbConnection | DbTransaction,
    timelineId?: number | readonly number[],
): Promise<MoveTrail[]> {
    const T = schema.timeline_transitions;
    const R = schema.timeline_routes;
    const A = schema.timeline_assignments;
    if (Array.isArray(timelineId) && timelineId.length === 0) return [];
    const rows = await db
        .select({ transition: T, geometry: R.geometry })
        .from(T)
        .innerJoin(R, eq(R.id, T.route_id))
        .where(
            and(
                eq(T.path_style, FTL),
                isNotNull(T.route_id),
                timelineId === undefined
                    ? undefined
                    : typeof timelineId === "number"
                      ? eq(T.timeline_id, timelineId)
                      : inArray(T.timeline_id, [...timelineId]),
            ),
        )
        .orderBy(asc(T.id))
        .all();
    if (rows.length === 0) return [];
    const members = await db
        .select({ transitionId: A.transition_id, marcherId: A.marcher_id })
        .from(A)
        .where(
            inArray(
                A.transition_id,
                rows.map((r) => r.transition.id),
            ),
        )
        .orderBy(asc(A.slot_index), asc(A.marcher_id))
        .all();
    const lines = new Map<number, number[]>();
    for (const m of members) {
        const line = lines.get(m.transitionId) ?? [];
        line.push(m.marcherId);
        lines.set(m.transitionId, line);
    }
    return rows.map(({ transition, geometry }) => ({
        timelineId: transition.timeline_id,
        transitionId: transition.id,
        routeId: transition.route_id!,
        start: transition.start_beat,
        end: transition.end_beat,
        reverse: isReversed(transition),
        along: isAlong(transition),
        geometry: JSON.parse(geometry) as RouteGeometry,
        marcherIds: [...new Set(lines.get(transition.id) ?? [])],
    }));
}

/** The follow-the-leader transition that carries trail `routeId`, or a refusal. */
async function trailTransition(
    tx: DbTransaction,
    routeId: number,
): Promise<TransitionDbRow> {
    const T = schema.timeline_transitions;
    const transition = await tx
        .select()
        .from(T)
        .where(and(eq(T.route_id, routeId), eq(T.path_style, FTL)))
        .get();
    if (!transition) refuse(trailRefusal.noTrail());
    return transition;
}

/**
 * A trail of `transition` was made or edited (pathways step 4g): the order marks its members have
 * at its move's end go, so the trail's order holds over an order set by hand before it (the latest
 * action wins), in the same undo step
 */
async function trailEditedInTransaction(
    tx: DbTransaction,
    transition: Pick<TransitionDbRow, "id" | "timeline_id">,
): Promise<void> {
    const A = schema.timeline_assignments;
    const line = await tx
        .selectDistinct({ id: A.marcher_id })
        .from(A)
        .where(eq(A.transition_id, transition.id))
        .all();
    await dropOrderMarksInTransaction(
        tx,
        transition.timeline_id,
        line.map((m) => m.id),
    );
}

/**
 * Where a trail's drawn part starts and ends now (R-9′): the leader's start, and the end spot
 * the line is entered at (the first slot's, or the last one's when reversed). Null with nobody
 * founding the move.
 */
async function trailEnds(
    tx: DbTransaction,
    transition: TransitionDbRow,
): Promise<{ from: XY; to: XY } | null> {
    const resolver = createResolver((await readTimelineTables(tx)).snapshot);
    const { members } = resolver.ftlEntry(transition.id);
    const leader = members.at(-1);
    if (leader === undefined) return null;
    const from = resolver.explain(leader, transition.start_beat).origin;
    const to = await destinationOf(
        tx,
        transition,
        isReversed(transition) ? transition.slot_count - 1 : 0,
    );
    return { from: [from[0], from[1]], to: [to[0], to[1]] };
}

// ---------------------------------------------------------------------------
// AP-T5: refusals for edits that can't keep a follow move exact
// ---------------------------------------------------------------------------

/** The first of `timelineIds` with a trail, or undefined. */
export async function firstMoveWithTrail(
    tx: DbTransaction,
    timelineIds: readonly number[],
): Promise<number | undefined> {
    if (timelineIds.length === 0) return undefined;
    const T = schema.timeline_transitions;
    const row = await tx
        .select({ timelineId: T.timeline_id })
        .from(T)
        .where(
            and(
                inArray(T.timeline_id, [...timelineIds]),
                eq(T.path_style, FTL),
                isNotNull(T.route_id),
            ),
        )
        .orderBy(asc(T.timeline_id))
        .get();
    return row?.timelineId;
}

/**
 * AP-T5: refuses (`E-ARGS`, "follows a drawn trail") when any of the moves `timelineIds` has a
 * trail. For edits that can't keep it exact yet: merging, Remove keyframe's join.
 */
export async function refuseTrailsInMoves(
    tx: DbTransaction,
    timelineIds: Iterable<number>,
    why: "notYet" | "split" | "removeTrailFirst" = "notYet",
): Promise<void> {
    const withTrail = await firstMoveWithTrail(tx, [...new Set(timelineIds)]);
    if (withTrail !== undefined)
        refuse(trailRefusal[why](await moveNameOf(tx, withTrail)));
}

/**
 * AP-T5: refuses when any of `rows` is in a follow move's transition. For edits that would take
 * such a row to another transition or cut it: split by marchers, the holds cuts.
 */
export async function refuseTrailRows(
    tx: DbTransaction,
    rows: readonly { transition_id: number }[],
    why: "notYet" | "split" = "notYet",
): Promise<void> {
    const ids = [...new Set(rows.map((r) => r.transition_id))];
    if (ids.length === 0) return;
    const T = schema.timeline_transitions;
    const row = await tx
        .select({ timelineId: T.timeline_id })
        .from(T)
        .where(
            and(
                inArray(T.id, ids),
                eq(T.path_style, FTL),
                isNotNull(T.route_id),
            ),
        )
        .orderBy(asc(T.id))
        .get();
    if (row) refuse(trailRefusal[why](await moveNameOf(tx, row.timelineId)));
}

/**
 * Each of `ids`'s end spot in move `timelineId`: its slot's stored destination (R-13), as AP-T1
 * reads it. Null when one of them has no row in the move. The Follow tool and Ripple in's write
 * both read end spots this way (step 9), so they agree.
 */
export async function endSpotsInMove(
    tx: DbTransaction,
    timelineId: number,
    ids: readonly number[],
): Promise<Map<number, XY> | null> {
    const rows = await memberRows(tx, timelineId);
    const spots = new Map<number, XY>();
    for (const m of ids) {
        const row = rows.find((r) => r.assignment.marcher_id === m);
        if (!row) return null;
        const [x, y] = await destinationOf(
            tx,
            row.transition,
            row.assignment.slot_index,
        );
        spots.set(m, [x, y]);
    }
    return spots;
}

// ---------------------------------------------------------------------------
// AP-T1: Follow
// ---------------------------------------------------------------------------

export interface FollowTrailResult {
    routeId: number;
    transitionId: number;
    /** The line, tail first */
    marcherIds: number[];
    /** Who leads */
    leaderId: number;
    /** Whether the line already followed this trail, and only its points changed (AP-T2) */
    redrawn: boolean;
}

/** The trail's geometry for `points`, against `current` (kept ids, kept tangent ends, AP-R1). */
function trailGeometry(
    points: readonly RoutePointInput[],
    current: RouteGeometry | null,
    ends: { from: XY; to: XY },
    toBulge?: number | null,
): RouteGeometry {
    const routePoints = pointsToStore(points, current);
    const keepFrom =
        current !== null && samePoint(current.points[0], routePoints[0]);
    const keepTo =
        current !== null &&
        samePoint(current.points.at(-1), routePoints.at(-1));
    const geometry: RouteGeometry = {
        v: 1,
        from: keepFrom ? current.from : ends.from,
        to: keepTo ? current.to : ends.to,
        ...lastLegBulge(current, toBulge),
        points: routePoints,
    };
    assertValid(validateRouteGeometry(geometry), "route");
    return geometry;
}

/** What Follow will do for a choice of marchers (`planFollow`), decided before any write. */
type FollowPlan =
    | {
          kind: "redraw";
          routeId: number;
          transitionId: number;
          /** The line, tail first */
          line: number[];
      }
    | { kind: "new"; chosen: MemberRow[]; starts: XY[]; ends: XY[] };

/**
 * AP-T1's reads and refusals, with nothing written: the trail drawn again when `marcherIds` are a
 * follow move's line (every marcher of it who founds the move, and none outside it, so a member
 * taken over at the start doesn't stop a redraw), else the new line's rows, starts and ends.
 * Refuses (`E-ARGS`) as `followTrailInTransaction` says.
 */
// eslint-disable-next-line max-lines-per-function
async function planFollow(
    tx: DbTransaction,
    timelineId: number,
    marcherIds: readonly number[],
): Promise<FollowPlan> {
    const ids = [...new Set(marcherIds)].sort((a, b) => a - b);
    if (ids.length < 2) refuse(trailRefusal.tooFew());
    const rows = await memberRows(tx, timelineId);
    const chosen: MemberRow[] = [];
    for (const id of ids) {
        const mine = rows.filter((r) => r.assignment.marcher_id === id);
        if (mine.length === 0)
            refuse(routeRefusal.notInMove(await marcherName(tx, id)));
        const row = mine[0]!;
        if (
            mine.length > 1 ||
            row.assignment.start_beat !== row.transition.start_beat ||
            row.assignment.end_beat !== row.transition.end_beat
        )
            refuse(trailRefusal.partWay(await marcherName(tx, id)));
        chosen.push(row);
    }
    const resolver = createResolver((await readTimelineTables(tx)).snapshot);

    // The line of a follow move: its trail drawn again
    const trails = new Set(
        chosen
            .filter(
                (r) =>
                    r.transition.path_style === FTL &&
                    r.transition.route_id !== null,
            )
            .map((r) => r.transition.id),
    );
    if (trails.size === 1) {
        const [transitionId] = [...trails];
        const line = rows.filter((r) => r.transition.id === transitionId);
        const founders = resolver.ftlEntry(transitionId!).members;
        const chosenIds = new Set(chosen.map((r) => r.assignment.marcher_id));
        if (
            chosen.every((r) => r.transition.id === transitionId) &&
            (line.length === chosen.length ||
                (founders.length > 0 &&
                    founders.every((m) => chosenIds.has(m))))
        ) {
            const order = [...line].sort(
                (a, b) => a.assignment.slot_index - b.assignment.slot_index,
            );
            const tailFirst = isReversed(chosen[0]!.transition)
                ? order.reverse()
                : order;
            return {
                kind: "redraw",
                routeId: chosen[0]!.transition.route_id!,
                transitionId: transitionId!,
                line: tailFirst.map((r) => r.assignment.marcher_id),
            };
        }
    }
    for (const r of chosen) {
        const name = () => marcherName(tx, r.assignment.marcher_id);
        if (r.transition.path_style === FTL)
            refuse(trailRefusal.alreadyFollows(await name()));
        if (r.transition.dest_shape_id !== null) {
            const staying = rows.some(
                (o) =>
                    o.transition.id === r.transition.id &&
                    !ids.includes(o.assignment.marcher_id),
            );
            if (staying)
                refuse(
                    trailRefusal.sharedShape(await moveNameOf(tx, timelineId)),
                );
        }
    }
    const laned = await firstLanedRow(
        tx,
        chosen.map((r) => r.assignment),
    );
    if (laned) {
        const who = chosen.find(
            (r) =>
                r.assignment.transition_id === laned.transition_id &&
                r.assignment.slot_index === laned.slot_index,
        )!;
        refuse(
            trailRefusal.hasPath(
                await marcherName(tx, who.assignment.marcher_id),
            ),
        );
    }

    // Where everyone starts and ends
    const starts: XY[] = [];
    const ends: XY[] = [];
    for (const r of chosen) {
        const id = r.assignment.marcher_id;
        const founding = resolver
            .spanInfos(id)
            .find(
                (s) =>
                    s.assignmentId === r.assignment.id &&
                    s.start === r.transition.start_beat &&
                    s.kind === "founding",
            );
        if (!founding)
            refuse(routeRefusal.takenOverAtStart(await marcherName(tx, id)));
        const from = resolver.explain(id, r.transition.start_beat).origin;
        starts.push([from[0], from[1]]);
        const to = await destinationOf(
            tx,
            r.transition,
            r.assignment.slot_index,
        );
        ends.push([to[0], to[1]]);
    }
    return { kind: "new", chosen, starts, ends };
}

/**
 * Why Follow would refuse `marcherIds` of move `timelineId` (AP-T1), or null when it wouldn't:
 * the pen asks before drawing starts, so nobody draws a trail that can't be kept. Writes nothing.
 */
export async function followTrailRefusal(
    tx: DbTransaction,
    timelineId: number,
    marcherIds: readonly number[],
): Promise<TimelineText | null> {
    try {
        await planFollow(tx, timelineId, marcherIds);
        return null;
    } catch (error) {
        if (error instanceof TimelineWriteError && error.text)
            return error.text;
        throw error;
    }
}

/**
 * AP-T1 (spec Appendix K): marchers `marcherIds` of move `timelineId` follow the leader along
 * `points` (the trail's drawn part, in walking order; none for a straight way in).
 *
 * When they are a follow move's line (`planFollow`), its trail is drawn again (AP-T2). Otherwise
 * they leave the transitions they are in (as split by marchers peels them: the others stay as
 * they are, AP-R15) for one new follow-the-leader transition in the same move:
 *
 * - its slots are the line in order (`followOrder`), the leader last;
 * - each slot's placed destination is that marcher's end spot now, so nobody's end moves (R-13′);
 * - `order_mode` is `slot`, and its trail route holds `points` (R-9′);
 * - each marcher's row keeps its counts and layer.
 *
 * Refused (`E-ARGS`, nothing written): fewer than two marchers; a marcher not in the move, taken
 * over at its start, or in it for only part of its counts; a marcher with a drawn path (Remove
 * path first); some of a follow move's line, or its line with others; a marcher who shares a
 * move into a stored shape with marchers who stay. Invalid points are `E-R1`.
 */
// One procedure, read then written in the order the spec gives (AP-T1)
// eslint-disable-next-line max-lines-per-function
export async function followTrailInTransaction({
    tx,
    timelineId,
    marcherIds,
    points,
    line,
    along = false,
    destinations,
}: {
    tx: DbTransaction;
    timelineId: number;
    marcherIds: readonly number[];
    points: readonly RoutePointInput[];
    /**
     * The line's order, tail first (step 4b: the order along the shape the line stands in, the
     * grabbed end leading); `followOrder`'s when absent. The same marchers as `marcherIds`.
     */
    line?: readonly number[];
    /**
     * Step 4b (AP-T8, R-13″): the end spots are on the way, `path_params.ends = "along"`, and
     * the route runs to its last point (`to`), not to an end spot. A new line only.
     */
    along?: boolean;
    /**
     * Step 9 (AP-T12, RP-3): each member's end spot by id, in place of the one it has, so a
     * ripple deals the next form's spots in trail order; the route then runs to the tail's. A
     * new line only.
     */
    destinations?: ReadonlyMap<number, XY>;
}): Promise<FollowTrailResult> {
    const plan = await planFollow(tx, timelineId, marcherIds);
    if (plan.kind === "redraw") {
        await editTrailPointsInTransaction({
            tx,
            routeId: plan.routeId,
            points,
        });
        return {
            routeId: plan.routeId,
            transitionId: plan.transitionId,
            marcherIds: plan.line,
            leaderId: plan.line.at(-1)!,
            redrawn: true,
        };
    }
    const { chosen, starts } = plan;
    const ends = destinations
        ? chosen.map((r) => {
              const to = destinations.get(r.assignment.marcher_id);
              if (!to) refuse("the end spots name other marchers");
              return to;
          })
        : plan.ends;
    const order = line
        ? line.map((id) => {
              const i = chosen.findIndex((r) => r.assignment.marcher_id === id);
              if (i < 0 || line.length !== chosen.length)
                  refuse("the line's order names other marchers");
              return i;
          })
        : followOrder(starts, ends);
    const leader = order[order.length - 1]!;
    const geometry = trailGeometry(points, null, {
        from: starts[leader]!,
        to: along ? lastPoint(points, starts[leader]!) : ends[order[0]!]!,
    });
    const timeline = chosen[0]!.timeline;

    return await mapDbErrors(async () => {
        // Old rows go first, so the new ones don't overlap them at the same layer (I-A3)
        await removeAssignmentRowsInTransaction({
            tx,
            removed: chosen.map((r) => r.assignment),
            compact: true,
            deleteEmptied: true,
        });
        const route = (await tx
            .insert(schema.timeline_routes)
            .values({ geometry: JSON.stringify(geometry) })
            .returning()
            .get())!;
        await markArcsInTransaction(tx, geometry);
        const transition = (await tx
            .insert(schema.timeline_transitions)
            .values({
                timeline_id: timeline.id,
                dest_shape_id: null,
                path_style: FTL,
                path_params: JSON.stringify(
                    along
                        ? { waypoints: [], ends: "along" }
                        : { waypoints: [] },
                ),
                route_id: route.id,
                order_mode: "slot",
                slot_count: order.length,
                start_beat: timeline.start_beat,
                end_beat: timeline.end_beat,
            })
            .returning()
            .get())!;
        await tx.insert(schema.timeline_slot_destinations).values(
            order.map((i, slot) => ({
                transition_id: transition.id,
                slot_index: slot,
                x: ends[i]![0],
                y: ends[i]![1],
            })),
        );
        await createTimelineAssignmentsInTransaction({
            tx,
            newAssignments: order.map((i, slot) => ({
                marcherId: chosen[i]!.assignment.marcher_id,
                transitionId: transition.id,
                slotIndex: slot,
                startBeat: chosen[i]!.assignment.start_beat,
                endBeat: chosen[i]!.assignment.end_beat,
                layer: chosen[i]!.assignment.layer,
            })),
        });
        await markTrailModelInTransaction(tx);
        await trailEditedInTransaction(tx, transition);
        const line = order.map((i) => chosen[i]!.assignment.marcher_id);
        return {
            routeId: route.id,
            transitionId: transition.id,
            marcherIds: line,
            leaderId: line.at(-1)!,
            redrawn: false,
        };
    });
}

/** AP-T1 as one undoable edit. */
export async function followTrail(args: {
    db: DbConnection;
    timelineId: number;
    marcherIds: readonly number[];
    points: readonly RoutePointInput[];
}): Promise<FollowTrailResult> {
    const { db, ...rest } = args;
    return await transactionWithHistory(db, "followTrail", (tx) =>
        followTrailInTransaction({ tx, ...rest }),
    );
}

// ---------------------------------------------------------------------------
// AP-T2: edit the trail's points
// ---------------------------------------------------------------------------

/**
 * AP-T2: trail `routeId`'s points become `points` (kept ids stay, new points get fresh ones).
 * The geometry is written through the one route writer; a trail has no Adjust yet (step 27).
 */
export async function editTrailPointsInTransaction({
    tx,
    routeId,
    points,
    toBulge,
}: {
    tx: DbTransaction;
    routeId: number;
    points: readonly RoutePointInput[];
    /** The last leg's bulge (R-14″, AP-T11): a number sets it, null clears it, undefined keeps it */
    toBulge?: number | null;
}): Promise<void> {
    const transition = await trailTransition(tx, routeId);
    const row = await tx
        .select()
        .from(schema.timeline_routes)
        .where(eq(schema.timeline_routes.id, routeId))
        .get();
    if (!row) refuse(trailRefusal.noTrail());
    const current = JSON.parse(row.geometry) as RouteGeometry;
    const ends = (await trailEnds(tx, transition)) ?? {
        from: current.from,
        to: current.to,
    };
    // AP-T10: with its ends along the way, the route runs to its own last point (R-13″), so its
    // last leg to `to` is empty and has no bulge; the leg into the last point carries its own
    const along = isAlong(transition);
    const geometry = trailGeometry(
        points,
        current,
        along ? { from: ends.from, to: lastPoint(points, ends.from) } : ends,
        along ? null : toBulge,
    );
    await mapDbErrors(() =>
        writeRouteGeometryInTransaction(tx, routeId, geometry),
    );
    await trailEditedInTransaction(tx, transition);
}

/** AP-T2 as one undoable edit. */
export async function editTrailPoints(args: {
    db: DbConnection;
    routeId: number;
    points: readonly RoutePointInput[];
    toBulge?: number | null;
}): Promise<void> {
    const { db, ...rest } = args;
    await transactionWithHistory(db, "editTrailPoints", (tx) =>
        editTrailPointsInTransaction({ tx, ...rest }),
    );
}

// ---------------------------------------------------------------------------
// AP-T3: Reverse
// ---------------------------------------------------------------------------

/**
 * AP-T3: the other end of the line leads (R-12′). One row changes, the transition's
 * `path_params.reverse`; the trail's `from` and `to` are then set to the new leader's start and
 * the end spot the line is now entered at. Everyone keeps their own end spot, and the drawn
 * points stay where they are. Returns who leads now.
 */
export async function reverseTrailInTransaction({
    tx,
    routeId,
}: {
    tx: DbTransaction;
    routeId: number;
}): Promise<{ leaderId: number | null; reverse: boolean }> {
    const transition = await trailTransition(tx, routeId);
    // Owner, 2026-11-10: a dragged-out line ends along its trail, which starts at the old leader's
    // end; reversed, everyone would walk back through the line. Drag out of the other end instead
    if (isAlong(transition)) refuse(trailRefusal.reverseAlong());
    const reverse = !isReversed(transition);
    const T = schema.timeline_transitions;
    return await mapDbErrors(async () => {
        const updated = (await tx
            .update(T)
            .set({
                path_params: JSON.stringify({
                    waypoints: [],
                    ...(reverse ? { reverse: true } : {}),
                    // AP-T10: Reverse keeps the ends along the way
                    ...(isAlong(transition) ? { ends: "along" } : {}),
                }),
            })
            .where(eq(T.id, transition.id))
            .returning()
            .get())!;
        const row = await tx
            .select()
            .from(schema.timeline_routes)
            .where(eq(schema.timeline_routes.id, routeId))
            .get();
        const ends = await trailEnds(tx, updated);
        if (row && ends) {
            const current = JSON.parse(row.geometry) as RouteGeometry;
            await writeRouteGeometryInTransaction(tx, routeId, {
                ...current,
                from: ends.from,
                // with its ends along the way the route still runs to its own last point
                to: isAlong(updated)
                    ? lastPoint(current.points, ends.from)
                    : ends.to,
            });
        }
        await markTrailModelInTransaction(tx);
        await trailEditedInTransaction(tx, transition);
        const resolver = createResolver(
            (await readTimelineTables(tx)).snapshot,
        );
        return {
            leaderId: resolver.ftlEntry(transition.id).members.at(-1) ?? null,
            reverse,
        };
    });
}

/** AP-T3 as one undoable edit. */
export async function reverseTrail(args: {
    db: DbConnection;
    routeId: number;
}): Promise<{ leaderId: number | null; reverse: boolean }> {
    const { db, ...rest } = args;
    return await transactionWithHistory(db, "reverseTrail", (tx) =>
        reverseTrailInTransaction({ tx, ...rest }),
    );
}

// ---------------------------------------------------------------------------
// AP-T4: Remove trail
// ---------------------------------------------------------------------------

/**
 * AP-T4: the follow move is a straight move again. Its transition becomes `direct` with no
 * params, no route and `inherit` order, keeping its rows, slots and placed destinations, so
 * everyone still ends where they did; then the route goes (the foreign key refuses the other
 * order). Returns the marchers of the line.
 */
export async function removeTrailInTransaction({
    tx,
    routeId,
}: {
    tx: DbTransaction;
    routeId: number;
}): Promise<{ marcherIds: number[] }> {
    const transition = await trailTransition(tx, routeId);
    const T = schema.timeline_transitions;
    const A = schema.timeline_assignments;
    const members = await tx
        .select({ marcherId: A.marcher_id })
        .from(A)
        .where(eq(A.transition_id, transition.id))
        .orderBy(asc(A.marcher_id))
        .all();
    await mapDbErrors(async () => {
        await tx
            .update(T)
            .set({
                path_style: "direct",
                path_params: null,
                route_id: null,
                order_mode: "inherit",
            })
            .where(eq(T.id, transition.id));
        await sweepOrphanRoutesInTransaction(tx);
    });
    return { marcherIds: [...new Set(members.map((m) => m.marcherId))] };
}

/** AP-T4 as one undoable edit. */
export async function removeTrail(args: {
    db: DbConnection;
    routeId: number;
}): Promise<{ marcherIds: number[] }> {
    const { db, ...rest } = args;
    return await transactionWithHistory(db, "removeTrail", (tx) =>
        removeTrailInTransaction({ tx, ...rest }),
    );
}

/**
 * Routes, pathways steps 1, 2 and 24 (ADR 0016 and 0017; spec v0.10 R-14′, Appendix J.8): a
 * move's marcher walks a drawn path of corners and smooth points from where it starts to its end
 * spot. Since step 24 a slot walks a route through a **lane** (`timeline_lanes`), so drawing a path
 * never moves a marcher out of its move: a shaped or shared move stays as it is. This module holds
 * the app procedures that write own paths, and the refusals other procedures use:
 *
 * - **AP-R1** `drawRouteInTransaction`: draw a route for one marcher's move, or draw it again.
 * - **AP-R2** `removeRouteInTransaction`: Remove path deletes the route's lanes, then the route.
 *   The Move card's Straight and Arc (`setMovePath`) refuse a move with a path
 *   (`refuseMoveRoutesForPath`).
 * - **AP-R3** a deleted transition takes its lanes with it, and a route nobody walks goes, in
 *   `deleteTimelineTransitionRowsInTransaction` (`timelineLanes`).
 * - **AP-R6** `refuseRoutesInMoves`, `refuseLanedRows`: edits that can't keep a path exact refuse,
 *   and write nothing.
 * - **AP-R7** the cut at a count lives in `timelineSplitAtBeat` (`planRouteCut` here).
 *
 * Range edits (AP-R4) and end and start changes (AP-R5) leave routes alone: R-14 always walks from
 * the marcher's real start to its real destination.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
    createResolver,
    EPS_GEOM,
    routePath,
    routePoint,
    validateRouteGeometry,
    type RoutePath,
    type AdjustProfile,
    type RouteGeometry,
    type RoutePoint,
    type XY,
} from "@openmarch/core";
import { schema } from "@/global/database/db";
import { readTimelineTables } from "@/timeline/timelineRows";
import { moveName } from "@/timeline/timelineRangeWords";
import { text, type TimelineTextArg } from "@/timeline/timelineText";
import type { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { assertValid, mapDbErrors, refuse } from "./timelineErrors";
import { readMoveWords } from "./timelineMoveNames";
import { sampleShape } from "./timelineMoveHelpers";
import { createTimelineTransitionsInTransaction } from "./timelineTransitionsInTransaction";
import { createTimelineAssignmentsInTransaction } from "./timelineAssignments";
import {
    markArcsInTransaction,
    NOTHING_REHOMED,
    writeRouteGeometryInTransaction,
    type RehomeReport,
} from "./timelineRouteGeometry";
import {
    deleteRouteSourcesInTransaction,
    firstLanedRow,
    laneOn,
    lanesOfRoute,
    lanesOfTransitions,
    markLaneModelInTransaction,
    sweepOrphanRoutesInTransaction,
    type DatabaseTimelineLane,
} from "./timelineLanes";

// ---------------------------------------------------------------------------
// Refusals (E-ARGS with the spec's reasons)
// ---------------------------------------------------------------------------

/** The refusals' texts, translated where they are shown. */
export const routeRefusal = {
    /** AP-R1, AP-R7: the marcher's span at the move's start is a join, so it would never walk it */
    takenOverAtStart: (marcher: string) =>
        text.t("timeline.refusals.route.takenOverAtStart", { marcher }),
    /** AP-R7: a resume at or before the count would walk the rest of the route after the cut */
    takenOverEarlier: (marcher: string) =>
        text.t("timeline.refusals.route.takenOverEarlier", { marcher }),
    /** AP-R1: leaving a follow-the-leader move would move the others' targets */
    followsTheLeader: (marcher: string) =>
        text.t("timeline.refusals.route.followsTheLeader", { marcher }),
    /** AP-R2: the Move card's Straight and Arc on a move with a route */
    removePathFirst: (move: TimelineTextArg) =>
        text.t("timeline.refusals.route.removePathFirst", { move }),
    /** AP-R6: an edit this step can't do on a move with a route */
    notYet: (move: TimelineTextArg) =>
        text.t("timeline.refusals.route.notYet", { move }),
    /** The marcher has no part in the move */
    notInMove: (marcher: string) =>
        text.t("timeline.refusals.route.notInMove", { marcher }),
    /** AP-R7 (step 15): split at the playhead on a group path, or a Detached copy of one */
    groupSplit: () => text.t("timeline.refusals.route.groupSplit"),
    /** AP-R9: Detach for a marcher not on a group path */
    notOnGroupPath: (marcher: string) =>
        text.t("timeline.refusals.route.notOnGroupPath", { marcher }),
    /** AP-R9: Detach for a marcher whose spot is the only one on its path (a copy, or the last) */
    onlyOnPath: (marcher: string) =>
        text.t("timeline.refusals.route.onlyOnPath", { marcher }),
    /**
     * Interaction round 7: an edit of a loose path whose marchers' copies no longer match (one was
     * edited alone since it was shown), so there's no one path to edit for them all
     */
    copiesApart: () => text.t("timeline.refusals.route.copiesApart"),
    /** AP-R10: Rejoin onto a Detached copy (its marcher rejoins the group path it came from) */
    rejoinOntoCopy: () => text.t("timeline.refusals.route.rejoinOntoCopy"),
    /** AP-R10 (step 15): Rejoin with no group path in the move */
    noGroupPath: (move: TimelineTextArg) =>
        text.t("timeline.refusals.route.noGroupPath", { move }),
    /** AP-R10 (step 15): Rejoin naming only marchers already on the group path */
    alreadyOnGroupPath: () =>
        text.t("timeline.refusals.route.alreadyOnGroupPath"),
    /** AP-R8 (step 15): a group path needs two or more marchers */
    groupTooSmall: () => text.t("timeline.refusals.route.groupTooSmall"),
    /** D-22: a personal edit while another marcher holds the spot at some count of the move */
    spotShared: (spot: number, marcher: string, count: number) =>
        text.t("timeline.refusals.route.spotShared", { spot, marcher, count }),
    /** AP-R11: a key off the shared part of the path */
    adjustOutside: () => text.t("timeline.refusals.route.adjustOutside"),
    /** AP-R11, I-J4: keys closer than a step */
    adjustTooClose: () => text.t("timeline.refusals.route.adjustTooClose"),
    /** AP-R11: a shared part shorter than two steps */
    adjustTooShort: () => text.t("timeline.refusals.route.adjustTooShort"),
    /** Re-fit with the ends where the path already has them */
    refitNotNeeded: () => text.t("timeline.refusals.route.refitNotNeeded"),
    /** Re-fit with nobody starting on the path */
    refitNoFounder: () => text.t("timeline.refusals.route.refitNoFounder"),
};

/**
 * D-22 (spec J.8 `SHARED`): refuses a personal edit of slot `slot` of transition `t` for marcher
 * `marcherId` while another marcher holds that slot at any count of the move, naming the first and
 * the count it starts on. Path edits never come here (07 N3). Before step 12 the UNIQUE indexes
 * keep two marchers off one slot, so only tests that drop them reach the refusal (QA-AP-L2).
 */
export async function refuseSharedSpot(
    tx: DbTransaction,
    t: { id: number; start_beat: number },
    slot: number,
    marcherId: number,
): Promise<void> {
    const A = schema.timeline_assignments;
    const rows = await tx
        .select()
        .from(A)
        .where(and(eq(A.transition_id, t.id), eq(A.slot_index, slot)))
        .orderBy(asc(A.start_beat), asc(A.id))
        .all();
    const other = rows.find((r) => r.marcher_id !== marcherId);
    if (other)
        refuse(
            routeRefusal.spotShared(
                slot + 1,
                await marcherName(tx, other.marcher_id),
                other.start_beat - t.start_beat,
            ),
        );
}

/** A marcher's drill number, as refusals name it. */
export const marcherName = async (tx: DbTransaction, marcherId: number) => {
    const m = await tx
        .select({
            prefix: schema.marchers.drill_prefix,
            order: schema.marchers.drill_order,
        })
        .from(schema.marchers)
        .where(eq(schema.marchers.id, marcherId))
        .get();
    return m ? `${m.prefix}${m.order}` : `${marcherId}`;
};

/** How refusals name the move (timeline) `timelineId`. */
export const moveNameOf = async (tx: DbTransaction, timelineId: number) => {
    const t = await tx
        .select()
        .from(schema.timelines)
        .where(eq(schema.timelines.id, timelineId))
        .get();
    if (!t) return `${timelineId}`;
    const words = await readMoveWords(tx);
    return moveName(
        { start: t.start_beat, end: t.end_beat },
        words.boxes,
        words.moves,
    );
};

/** The first of `timelineIds` (ascending) with a lane on any of its transitions. */
async function firstMoveWithLanes(
    tx: DbTransaction,
    timelineIds: readonly number[],
): Promise<number | undefined> {
    if (timelineIds.length === 0) return undefined;
    const T = schema.timeline_transitions;
    const L = schema.timeline_lanes;
    const row = await tx
        .select({ timelineId: T.timeline_id })
        .from(L)
        .innerJoin(T, eq(T.id, L.transition_id))
        .where(inArray(T.timeline_id, [...timelineIds]))
        .orderBy(asc(T.timeline_id))
        .get();
    return row?.timelineId;
}

/**
 * AP-R6: refuses (`E-ARGS`, "this move has a drawn path") when any of the moves `timelineIds`
 * has a lane. For edits that can't keep a path through yet: merging, Remove keyframe's join.
 */
export async function refuseRoutesInMoves(
    tx: DbTransaction,
    timelineIds: Iterable<number>,
): Promise<void> {
    const withLanes = await firstMoveWithLanes(tx, [...new Set(timelineIds)]);
    if (withLanes !== undefined)
        refuse(routeRefusal.notYet(await moveNameOf(tx, withLanes)));
}

/**
 * AP-H2 (refuse half): refuses (`E-ARGS`, "this move has a drawn path") when any of `rows` sits on
 * a laned slot. For edits that would move such a row to another transition and can't carry its
 * lane yet: split by marchers, and holds that would take a path's marcher into a move of its own.
 */
export async function refuseLanedRows(
    tx: DbTransaction,
    rows: readonly { transition_id: number; slot_index: number }[],
): Promise<void> {
    const laned = await firstLanedRow(tx, rows);
    if (!laned) return;
    const t = await tx
        .select({ timelineId: schema.timeline_transitions.timeline_id })
        .from(schema.timeline_transitions)
        .where(eq(schema.timeline_transitions.id, laned.transition_id))
        .get();
    refuse(routeRefusal.notYet(await moveNameOf(tx, t?.timelineId ?? 0)));
}

/** AP-R2: the Move card's Straight and Arc refuse a move with a path; the path stays. */
export async function refuseMoveRoutesForPath(
    tx: DbTransaction,
    timelineId: number,
): Promise<void> {
    if ((await firstMoveWithLanes(tx, [timelineId])) !== undefined)
        refuse(routeRefusal.removePathFirst(await moveNameOf(tx, timelineId)));
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** One marcher's route in one move: a lane with a marcher on its slot. */
export interface MoveRoute {
    routeId: number;
    laneId: number;
    transitionId: number;
    slot: number;
    timelineId: number;
    marcherId: number;
    start: number;
    end: number;
    /** The lane's start offset (a group path's), or null for an own path */
    offset: XY | null;
    /** The spot's Adjust, or null (spec J.2) */
    adjust: AdjustProfile | null;
    geometry: RouteGeometry;
    /** How many lanes the route has, vacant ones too */
    laneCount: number;
    /** The group path the route was Detached from (K6, AP-R9), or null */
    detachedFrom: number | null;
}

/**
 * Every route with a marcher on one of its lanes, one entry per lane and marcher, with the lane's
 * transition, move and slot; or only those of `timelineId`. By route, then marcher.
 */
export async function readRoutes(
    db: DbConnection | DbTransaction,
    timelineId?: number,
): Promise<MoveRoute[]> {
    const T = schema.timeline_transitions;
    const R = schema.timeline_routes;
    const A = schema.timeline_assignments;
    const L = schema.timeline_lanes;
    const rows = await db
        .select({
            routeId: R.id,
            laneId: L.id,
            geometry: R.geometry,
            transitionId: T.id,
            slot: L.slot_index,
            timelineId: T.timeline_id,
            start: T.start_beat,
            end: T.end_beat,
            marcherId: A.marcher_id,
            offsetX: L.offset_x,
            offsetY: L.offset_y,
            adjust: L.adjust,
            laneCount: sql<number>`(SELECT count(*) FROM timeline_lanes c WHERE c.route_id = ${R.id})`,
            detachedFrom: sql<
                number | null
            >`(SELECT s.source_route_id FROM timeline_route_sources s WHERE s.route_id = ${R.id} AND s.kind = 'detached_from' ORDER BY s.id LIMIT 1)`,
        })
        .from(L)
        .innerJoin(R, eq(R.id, L.route_id))
        .innerJoin(T, eq(T.id, L.transition_id))
        .innerJoin(
            A,
            and(
                eq(A.transition_id, L.transition_id),
                eq(A.slot_index, L.slot_index),
            ),
        )
        .where(
            timelineId === undefined
                ? undefined
                : eq(T.timeline_id, timelineId),
        )
        .orderBy(asc(R.id), asc(A.marcher_id), asc(A.start_beat))
        .all();
    return rows.map(({ offsetX, offsetY, geometry, adjust, ...r }) => ({
        ...r,
        laneCount: Number(r.laneCount),
        detachedFrom: r.detachedFrom === null ? null : Number(r.detachedFrom),
        offset:
            offsetX === null || offsetY === null ? null : [offsetX, offsetY],
        adjust: adjust === null ? null : (JSON.parse(adjust) as AdjustProfile),
        geometry: JSON.parse(geometry) as RouteGeometry,
    }));
}

// ---------------------------------------------------------------------------
// AP-R1: draw a route, or draw it again
// ---------------------------------------------------------------------------

/**
 * A point to draw: an existing point's `id` keeps it (a drag); a point without one is new. A
 * `tension` above 0 makes it smooth (step 2); 0 or none is a corner.
 */
export interface RoutePointInput {
    id?: string;
    at: XY;
    tension?: number;
    /** The leg arriving at this point is an arc with this bulge (R-14″, step 10a) */
    bulge?: number;
}

/**
 * A stored point as R-14 reads it: a corner has no `tension` key, and a point whose arriving leg
 * isn't an arc no `bulge` key (spec 5.2, R-14″).
 */
export const storedPoint = (
    id: string,
    at: XY,
    tension?: number,
    bulge?: number,
): RoutePoint => ({
    id,
    at: [at[0], at[1]],
    ...(tension !== undefined && tension > 0 ? { tension } : {}),
    ...(bulge !== undefined && bulge !== 0 ? { bulge } : {}),
});

/** Whether two points are the same point in the same place, bit for bit */
export const samePoint = (
    a: RoutePoint | undefined,
    b: RoutePoint | undefined,
) =>
    !!a &&
    !!b &&
    a.id === b.id &&
    Object.is(a.at[0], b.at[0]) &&
    Object.is(a.at[1], b.at[1]);

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * A fresh point id (spec 5.2): random, so an id that has left a route never comes back to it.
 * Exported for tests.
 */
export function freshPointId(taken: ReadonlySet<string>): string {
    for (;;) {
        let id = "";
        for (let i = 0; i < 8; i++)
            id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
        if (!taken.has(id)) return id;
    }
}

/** Writes the lane-model file version (11) with a file's first path (ADR 0017 §9). */
export const markRouteModelInTransaction = markLaneModelInTransaction;

export interface DrawRouteResult {
    routeId: number;
    transitionId: number;
    /** The slot whose lane walks the route (the marcher's, in its own move) */
    slot: number;
    /** What drawing it again did to anchored Adjusts (an own lane has none today) */
    rehome: RehomeReport;
    /** Whether the spot's Adjust went: it left a group path for an own one (AP-R1) */
    adjustRemoved: boolean;
}

/**
 * AP-R1 (spec v0.10 J.8): marcher `marcherId` walks `points` (inner points, in walking order) in
 * move `timelineId`, on an own lane of its slot. The marcher stays in its move, so a shape or a
 * shared move stays as it is. With no lane on the slot, the route is inserted, then its lane; with
 * an own lane, the route's geometry is updated in place, keeping its id; on a group path's lane, a
 * new own route is inserted and the lane re-pointed at it with no offset, and the group path stays
 * with the others. `from` and `to` are the founding span's origin and destination. No transition
 * or row is written.
 *
 * Refused (`E-ARGS`, nothing written): a marcher not in the move; one taken over at the move's
 * start (its span there is a join, which walks straight); one following the leader (a lane there
 * would have to be a trail lane, a later step). Invalid points are `E-R1`.
 */
// One procedure, read then written in the order the spec gives (AP-R1)
// eslint-disable-next-line max-lines-per-function
export async function drawRouteInTransaction({
    tx,
    timelineId,
    marcherId,
    points,
}: {
    tx: DbTransaction;
    timelineId: number;
    marcherId: number;
    points: readonly RoutePointInput[];
}): Promise<DrawRouteResult> {
    const T = schema.timeline_transitions;
    const A = schema.timeline_assignments;
    const found = await tx
        .select({ row: A, transition: T })
        .from(A)
        .innerJoin(T, eq(A.transition_id, T.id))
        .where(and(eq(T.timeline_id, timelineId), eq(A.marcher_id, marcherId)))
        .orderBy(asc(A.start_beat), asc(A.id))
        .get();
    if (!found)
        refuse(routeRefusal.notInMove(await marcherName(tx, marcherId)));
    const { row, transition } = found;
    if (transition.path_style === "follow_the_leader")
        refuse(routeRefusal.followsTheLeader(await marcherName(tx, marcherId)));
    await refuseSharedSpot(tx, transition, row.slot_index, marcherId);

    // The founding span: read before anything is written
    const resolver = createResolver((await readTimelineTables(tx)).snapshot);
    const founding = resolver
        .spanInfos(marcherId)
        .find(
            (s) =>
                s.assignmentId === row.id &&
                s.start === transition.start_beat &&
                s.kind === "founding",
        );
    if (!founding)
        refuse(routeRefusal.takenOverAtStart(await marcherName(tx, marcherId)));
    const from = resolver.explain(marcherId, transition.start_beat).origin;
    const to = await destinationOf(tx, transition, row.slot_index);

    // The route's points: kept ids stay, new points get fresh ones. A spot on a group path gets a
    // new own route; the group path stays with the others
    const lane = await laneOn(tx, transition.id, row.slot_index);
    const ownLane = lane !== undefined && lane.offset_x === null;
    const current = ownLane
        ? await tx
              .select()
              .from(schema.timeline_routes)
              .where(eq(schema.timeline_routes.id, lane.route_id))
              .get()
        : undefined;
    const currentGeometry = current
        ? (JSON.parse(current.geometry) as RouteGeometry)
        : null;
    const currentIds = new Set(currentGeometry?.points.map((p) => p.id) ?? []);
    const taken = new Set(currentIds);
    for (const p of points)
        if (p.id !== undefined && !currentIds.has(p.id))
            refuse(`point ${p.id} is not a point of this route`);
    const routePoints: RoutePoint[] = points.map((p) => {
        const id = p.id ?? freshPointId(taken);
        taken.add(id);
        return storedPoint(id, p.at, p.tension, p.bulge);
    });
    // Step 2 (AP-R1): an edit keeps `from` while the first point stays put, and `to` while the
    // last does, so a point edited bends only the pieces near it; otherwise the real ends
    const keepFrom =
        currentGeometry !== null &&
        samePoint(currentGeometry.points[0], routePoints[0]);
    const keepTo =
        currentGeometry !== null &&
        samePoint(currentGeometry.points.at(-1), routePoints.at(-1));
    const geometry: RouteGeometry = {
        v: 1,
        from: keepFrom ? currentGeometry.from : [from[0], from[1]],
        to: keepTo ? currentGeometry.to : [to[0], to[1]],
        points: routePoints,
    };
    assertValid(validateRouteGeometry(geometry), "route");
    const json = JSON.stringify(geometry);
    const result = (
        routeId: number,
        rehome: RehomeReport = NOTHING_REHOMED,
    ): DrawRouteResult => ({
        routeId,
        transitionId: transition.id,
        slot: row.slot_index,
        rehome,
        adjustRemoved: lane?.adjust != null,
    });

    return await mapDbErrors(async () => {
        if (current)
            return result(
                current.id,
                await writeRouteGeometryInTransaction(tx, current.id, geometry),
            );
        const route = (await tx
            .insert(schema.timeline_routes)
            .values({ geometry: json })
            .returning()
            .get())!;
        await markArcsInTransaction(tx, geometry);
        const L = schema.timeline_lanes;
        if (lane)
            // Off the group path: its lane walks the new own route, with no offset and no Adjust,
            // which was anchored on the group's route (I-LN4, AP-R1)
            await tx
                .update(L)
                .set({
                    route_id: route.id,
                    offset_x: null,
                    offset_y: null,
                    adjust: null,
                })
                .where(eq(L.id, lane.id));
        else
            await tx.insert(L).values({
                transition_id: transition.id,
                slot_index: row.slot_index,
                route_id: route.id,
                offset_x: null,
                offset_y: null,
            });
        // AP-H3: a group path left by its last marcher goes
        if (lane) await sweepOrphanRoutesInTransaction(tx);
        await markLaneModelInTransaction(tx);
        return result(route.id);
    });
}

/** Where slot `slot` of `transition` ends (R-13): its shape's sample or its placed point. */
export async function destinationOf(
    tx: DbTransaction,
    transition: typeof schema.timeline_transitions.$inferSelect,
    slot: number,
): Promise<XY> {
    if (transition.dest_shape_id !== null) {
        const shape = await tx
            .select()
            .from(schema.timeline_shapes)
            .where(eq(schema.timeline_shapes.id, transition.dest_shape_id))
            .get();
        if (!shape) refuse(`shape ${transition.dest_shape_id} does not exist`);
        return sampleShape(shape, transition.slot_count)[slot]!;
    }
    const D = schema.timeline_slot_destinations;
    const point = await tx
        .select()
        .from(D)
        .where(and(eq(D.transition_id, transition.id), eq(D.slot_index, slot)))
        .get();
    if (!point)
        refuse(
            `transition ${transition.id} has no destination for slot ${slot}`,
        );
    return [point.x, point.y];
}

/** AP-R1 as one undoable edit. */
export async function drawRoute(args: {
    db: DbConnection;
    timelineId: number;
    marcherId: number;
    points: readonly RoutePointInput[];
}): Promise<DrawRouteResult> {
    const { db, ...rest } = args;
    return await transactionWithHistory(db, "drawRoute", (tx) =>
        drawRouteInTransaction({ tx, ...rest }),
    );
}

// ---------------------------------------------------------------------------
// AP-R2: Remove path
// ---------------------------------------------------------------------------

/**
 * AP-R2 (spec v0.10 J.8): Remove path. The route's lanes go, then the route (the foreign key
 * refuses the other order, I-D3, and undo replays it reversed). Its marchers never left their
 * moves, so a shaped move is a shape again and nobody else moves. On a group path the whole
 * group's path goes, whichever marcher is named. Name the path by `routeId`, or by a transition
 * whose lanes walk one route (`transitionId`, step 15's form). Returns the marchers that lost it.
 */
export async function removeRouteInTransaction({
    tx,
    routeId,
    transitionId,
}: {
    tx: DbTransaction;
    routeId?: number;
    transitionId?: number;
}): Promise<{ marcherIds: number[] }> {
    let rid = routeId;
    if (rid === undefined) {
        if (transitionId === undefined) refuse("name the path to remove");
        const routes = new Set(
            (await lanesOfTransitions(tx, [transitionId])).map(
                (l) => l.route_id,
            ),
        );
        if (routes.size !== 1) refuse(`transition ${transitionId} has no path`);
        rid = [...routes][0]!;
    }
    const lanes = await lanesOfRoute(tx, rid);
    if (lanes.length === 0) refuse(`route ${rid} has no lane`);
    const marcherIds = await marchersOnLanes(tx, lanes);
    await mapDbErrors(async () => {
        await tx.delete(schema.timeline_lanes).where(
            inArray(
                schema.timeline_lanes.id,
                lanes.map((l) => l.id),
            ),
        );
        await deleteRouteSourcesInTransaction(tx, [rid]);
        await tx
            .delete(schema.timeline_routes)
            .where(eq(schema.timeline_routes.id, rid));
    });
    return { marcherIds };
}

/** The marchers on `lanes`' slots, at any beat, ascending. */
export async function marchersOnLanes(
    db: DbConnection | DbTransaction,
    lanes: readonly DatabaseTimelineLane[],
): Promise<number[]> {
    const A = schema.timeline_assignments;
    const out = new Set<number>();
    for (const l of lanes)
        for (const r of await db
            .select({ m: A.marcher_id })
            .from(A)
            .where(
                and(
                    eq(A.transition_id, l.transition_id),
                    eq(A.slot_index, l.slot_index),
                ),
            )
            .all())
            out.add(r.m);
    return [...out].sort((a, b) => a - b);
}

/** AP-R2 as one undoable edit. */
export async function removeRoute({
    db,
    routeId,
    transitionId,
}: {
    db: DbConnection;
    routeId?: number;
    transitionId?: number;
}): Promise<{ marcherIds: number[] }> {
    return await transactionWithHistory(db, "removeRoute", (tx) =>
        removeRouteInTransaction({ tx, routeId, transitionId }),
    );
}

// ---------------------------------------------------------------------------
// AP-R7: cut a route at a count
// ---------------------------------------------------------------------------

/** How one own lane is cut at a count (AP-R7), planned before anything is written. */
export interface RouteCut {
    /** The lane's transition, slot and route, which stay with the half from the count */
    transitionId: number;
    slot: number;
    routeId: number;
    /** The route's geometry from the count: `from = C`, the points past `d` */
    after: RouteGeometry;
    /** The new route of the half before: `from = A`, `to = C`, the points before `d` */
    before: RouteGeometry;
    /** Where the marcher is on the route at the count */
    C: XY;
}

/**
 * Plans AP-R7 for the own lane `lane` of transition `t`, whose one row (`rows`, the rows on its
 * slot) must have a founding span: `C` is R-14's evaluation of that span at the count, and the
 * cleaned path's points split at `d`. A point at or within `EPS_GEOM` of `C` goes to neither half,
 * and points R-14's cleaning drops are dropped from storage too. Kept points keep their ids.
 *
 * Refused (`E-ARGS`): a row not starting with `t`, or no founding span ("taken over at the
 * start"); more than one row, or a visible piece of the row
 * other than it starting at or before the count ("taken over earlier"), since that resume would
 * become a founding span after the cut and walk the rest of the route.
 */
export async function planRouteCut(
    tx: DbTransaction,
    {
        resolver,
        t,
        lane,
        rows,
        beat,
    }: {
        resolver: ReturnType<typeof createResolver>;
        t: typeof schema.timeline_transitions.$inferSelect;
        lane: DatabaseTimelineLane;
        /** Every row on the lane's slot (one, unless an edit left more) */
        rows: readonly (typeof schema.timeline_assignments.$inferSelect)[];
        beat: number;
    },
): Promise<RouteCut> {
    const row = rows[0]!;
    const m = row.marcher_id;
    // A row starting after the move starts is a join now and would become founding after the
    // cut, walking the route; a second row would be cut blind. Neither is drawn by AP-R1.
    if (rows.some((r) => r.start_beat !== t.start_beat))
        refuse(routeRefusal.takenOverAtStart(await marcherName(tx, m)));
    if (rows.length > 1)
        refuse(routeRefusal.takenOverEarlier(await marcherName(tx, m)));
    const pieces = resolver
        .spanInfos(m)
        .filter((s) => s.assignmentId === row.id)
        .sort((a, b) => a.start - b.start);
    const founding = pieces.find((s) => s.kind === "founding");
    if (!founding)
        refuse(routeRefusal.takenOverAtStart(await marcherName(tx, m)));
    if (pieces.some((p) => p !== founding && p.start <= beat))
        refuse(routeRefusal.takenOverEarlier(await marcherName(tx, m)));
    const route = await tx
        .select()
        .from(schema.timeline_routes)
        .where(eq(schema.timeline_routes.id, lane.route_id))
        .get();
    if (!route) refuse(`route ${lane.route_id} does not exist`);
    const geometry = JSON.parse(route.geometry) as RouteGeometry;
    const A = resolver.explain(m, t.start_beat).origin;
    const B = await destinationOf(tx, t, row.slot_index);
    // R-14 with the route's tensions and the ends it was drawn against (step 2)
    const path = routePath(A, geometry.points, B, geometry);
    const pB = (beat - t.start_beat) / (t.end_beat - t.start_beat);
    const d = pB * path.L;
    const C = routePoint(path, pB);
    const far = (k: number) =>
        Math.hypot(path.V[k]![0] - C[0], path.V[k]![1] - C[1]) >= EPS_GEOM;
    const inner = path.source
        .map((src, k) => ({ src, k }))
        .filter(({ src }) => src >= 0);
    return {
        transitionId: t.id,
        slot: lane.slot_index,
        routeId: route.id,
        C,
        ...cutHalves(
            geometry,
            path,
            d,
            C,
            inner.filter(({ k }) => far(k)),
        ),
    };
}

/**
 * AP-R7's two halves of `geometry` cut at distance `d` (at `C`) along its walked `path`: the
 * kept inner points (`inner`, none within `EPS_GEOM` of `C`) split by place, ids kept. Step 2: the
 * half before keeps the route's `from`, the route from the count keeps its `to`, so the tangents
 * near the ends stay as they were. R-14″: an arc leg cut at `C` leaves each half on the same
 * circle, so each part's bulge is worked out from its share of the sweep; a leg next to the cut,
 * whose end is within `EPS_GEOM` of `C`, keeps its own.
 */
function cutHalves(
    geometry: RouteGeometry,
    path: RoutePath,
    d: number,
    C: XY,
    inner: readonly { src: number; k: number }[],
): Pick<RouteCut, "before" | "after"> {
    const xy = (p: XY): XY => [p[0], p[1]];
    const beforeKept = inner.filter(({ k }) => path.D[k]! < d);
    const afterKept = inner.filter(({ k }) => path.D[k]! > d);
    const arcs = cutArcs(path, d, beforeKept.at(-1)?.k ?? 0, afterKept[0]?.k);
    const pointAt = (src: number, bulge?: number | null): RoutePoint => {
        const p = geometry.points[src]!;
        return storedPoint(
            p.id,
            p.at,
            p.tension,
            bulge === undefined ? p.bulge : (bulge ?? undefined),
        );
    };
    // With no point after the cut, its first leg is the last: `toBulge` is the cut arc's part
    const afterTo =
        afterKept.length > 0
            ? geometry.toBulge
            : arcs.after === undefined
              ? geometry.toBulge
              : (arcs.after ?? undefined);
    return {
        before: {
            v: 1,
            from: xy(geometry.from),
            to: xy(C),
            ...(arcs.before ? { toBulge: arcs.before } : {}),
            points: beforeKept.map(({ src }) => pointAt(src)),
        },
        after: {
            v: 1,
            from: xy(C),
            to: xy(geometry.to),
            ...(afterTo ? { toBulge: afterTo } : {}),
            points: afterKept.map(({ src }, i) =>
                pointAt(src, i === 0 ? arcs.after : undefined),
            ),
        },
    };
}

/**
 * R-14″ for AP-R7: the bulges of the two legs that meet at the cut. `kb` is the last vertex of
 * `path` kept before the cut, `ka` the first kept after it (undefined: `B`). The before half's
 * last leg runs from `V[kb]` to `C`, the after half's first leg from `C` to `V[ka]`. When such a
 * leg is part of one arc piece its bulge is that part's (the same circle, its share of the sweep);
 * when it stands for a whole arc piece whose end was dropped near `C`, that piece's bulge. `after`
 * is undefined to keep the stored bulge, null for none.
 */
function cutArcs(
    path: RoutePath,
    d: number,
    kb: number,
    ka: number | undefined,
): { before?: number; after?: number | null } {
    const { D, pieces } = path;
    // the piece holding the cut, as R-14 finds it
    let j = 0;
    while (j < pieces.length - 1 && !(d < D[j + 1]!)) j++;
    const piece = pieces[j]!;
    const share = (from: number, to: number) => {
        if (piece.kind !== "arc") return undefined;
        const phi = 2 * Math.atan(2 * piece.k);
        const k = Math.tan((phi * (to - from)) / 2) / 2;
        return k === 0 ? undefined : k;
    };
    const f = Math.min(1, Math.max(0, (d - D[j]!) / (D[j + 1]! - D[j]!)));
    const arcOf = (i: number) => {
        const p = pieces[i];
        return p?.kind === "arc" ? p.k : undefined;
    };
    const before =
        kb === j ? share(0, f) : kb === j - 1 ? arcOf(j - 1) : undefined;
    const end = ka ?? path.V.length - 1;
    const after =
        end === j + 1
            ? (share(f, 1) ?? null)
            : end === j + 2
              ? undefined // its own leg, as stored
              : null;
    return { before, after };
}

/**
 * Writes the half before the count of an own lane's cut: a new route, the first half's own
 * one-slot transition in `beforeTimelineId` ending at `C`, `row`'s part before the count on its
 * slot 0, and the lane binding that slot to the new route.
 */
export async function writeRouteCutBeforeInTransaction(
    tx: DbTransaction,
    {
        cut,
        beforeTimelineId,
        row,
        end,
        orderMode,
    }: {
        cut: RouteCut;
        beforeTimelineId: number;
        row: typeof schema.timeline_assignments.$inferSelect;
        end: number;
        orderMode: "inherit" | "slot";
    },
): Promise<void> {
    assertValid(validateRouteGeometry(cut.before), "route");
    const route = (await tx
        .insert(schema.timeline_routes)
        .values({ geometry: JSON.stringify(cut.before) })
        .returning()
        .get())!;
    await markArcsInTransaction(tx, cut.before);
    const [created] = await createTimelineTransitionsInTransaction({
        tx,
        newTransitions: [
            {
                timelineId: beforeTimelineId,
                slotCount: 1,
                destination: { kind: "individual", points: [cut.C] },
                orderMode,
            },
        ],
    });
    await createTimelineAssignmentsInTransaction({
        tx,
        newAssignments: [
            {
                marcherId: row.marcher_id,
                transitionId: created!.id,
                slotIndex: 0,
                startBeat: row.start_beat,
                endBeat: end,
                layer: row.layer,
            },
        ],
    });
    await tx.insert(schema.timeline_lanes).values({
        transition_id: created!.id,
        slot_index: 0,
        route_id: route.id,
        offset_x: null,
        offset_y: null,
    });
}

/** Updates the route from the count in place, keeping its id (AP-R7). */
export async function writeRouteCutAfterInTransaction(
    tx: DbTransaction,
    cut: RouteCut,
): Promise<void> {
    await writeRouteGeometryInTransaction(tx, cut.routeId, cut.after);
}

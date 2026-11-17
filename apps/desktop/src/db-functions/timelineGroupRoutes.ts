/**
 * Group paths, pathways steps 15 and 24 (spec v0.10 R-14′, Appendix J.8; ADR 0015): several
 * marchers of one move walk one route, each slot on its own **lane** (the route's reference line
 * moved by the lane's offset), and every member passes its copy of each point at the same
 * moment. Since step 24 a group path writes lanes on the members' slots and never moves a marcher
 * out of its move: a shaped or shared move stays as it is, and Remove path leaves it as it was.
 *
 * - **AP-R8** `drawGroupRouteInTransaction`: draw a group path for two or more marchers, or again.
 * - **AP-R1** (group branch) `editGroupRoutePointsInTransaction`: point edits on the open group
 *   path move every lane; no offset changes.
 * - **AP-R9** `detachInTransaction`: members break off with a verbatim copy of the group path,
 *   keeping offset and Adjust, so nobody moves (step 3c; it replaced step 15's baked Own path).
 * - **AP-R10** `rejoinGroupPathInTransaction`: marchers follow the group path (back from Detach,
 *   or new).
 *
 * AP-R2 (Remove path removes the whole group's) lives with the own-path procedures; AP-R3 and the
 * orphan sweep (AP-H3) in `timelineLanes`; AP-R7 refuses a group path in `timelineSplitAtBeat`.
 */
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import {
    createResolver,
    validateLaneOffset,
    type Resolver,
    validateRouteGeometry,
    type RouteGeometry,
    type RoutePoint,
    type XY,
} from "@openmarch/core";
import { schema } from "@/global/database/db";
import { readTimelineTables } from "@/timeline/timelineRows";
import type { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { assertValid, mapDbErrors, refuse } from "./timelineErrors";
import {
    destinationOf,
    freshPointId,
    marcherName,
    moveNameOf,
    refuseSharedSpot,
    routeRefusal,
    samePoint,
    storedPoint,
    type RoutePointInput,
} from "./timelineRoutes";
import {
    lastLegBulge,
    markArcsInTransaction,
    NOTHING_REHOMED,
    writeRouteGeometryInTransaction,
    type RehomeReport,
} from "./timelineRouteGeometry";
import {
    detachedSourceOf,
    laneOffset,
    laneOn,
    lanesOfRoute,
    markLaneModelInTransaction,
    sweepOrphanRoutesInTransaction,
    type DatabaseTimelineLane,
} from "./timelineLanes";

type TransitionRow = typeof schema.timeline_transitions.$inferSelect;
type AssignmentRow = typeof schema.timeline_assignments.$inferSelect;

/** A marcher of the move as the group procedures read it, before anything is written. */
interface Member {
    marcherId: number;
    row: AssignmentRow;
    transition: TransitionRow;
    /** Its real start at the move's start (the origin of its founding span), R-14's A */
    A: XY;
    /** Its destination (R-13), R-14's B */
    B: XY;
    /** The lane on its slot, if any */
    lane: DatabaseTimelineLane | undefined;
}

/** A lane's offset columns for `offset` (spec J.1), validated (`E-P1`). */
export function offsetColumns(offset: XY): {
    offset_x: number;
    offset_y: number;
} {
    assertValid(validateLaneOffset([offset[0], offset[1]]), "lane offset");
    return { offset_x: offset[0], offset_y: offset[1] };
}

/**
 * The spec's mean (Appendix I.8): per coordinate, the sum in the order given from left to right in
 * float64, then one division by `n`. Callers pass members in ascending marcher id.
 */
export function meanOf(points: readonly XY[]): XY {
    let x = 0;
    let y = 0;
    for (const p of points) {
        x += p[0];
        y += p[1];
    }
    return [x / points.length, y / points.length];
}

const sub = (p: XY, q: XY): XY => [p[0] - q[0], p[1] - q[1]];

/**
 * Reads `marcherIds` in move `timelineId`, in ascending marcher id, with AP-R1's refusals naming
 * the first such marcher: not in the move, follows the leader there, taken over at its start.
 */
async function readMembers(
    tx: DbTransaction,
    timelineId: number,
    marcherIds: readonly number[],
): Promise<Member[]> {
    const T = schema.timeline_transitions;
    const A = schema.timeline_assignments;
    const ids = [...new Set(marcherIds)].sort((a, b) => a - b);
    const resolver = createResolver((await readTimelineTables(tx)).snapshot);
    const out: Member[] = [];
    for (const marcherId of ids) {
        const found = await tx
            .select({ row: A, transition: T })
            .from(A)
            .innerJoin(T, eq(A.transition_id, T.id))
            .where(
                and(eq(T.timeline_id, timelineId), eq(A.marcher_id, marcherId)),
            )
            .orderBy(asc(A.start_beat), asc(A.id))
            .get();
        if (!found)
            refuse(routeRefusal.notInMove(await marcherName(tx, marcherId)));
        const { row, transition } = found;
        if (transition.path_style === "follow_the_leader")
            refuse(
                routeRefusal.followsTheLeader(await marcherName(tx, marcherId)),
            );
        const founding = resolver
            .spanInfos(marcherId)
            .find(
                (s) =>
                    s.assignmentId === row.id &&
                    s.start === transition.start_beat &&
                    s.kind === "founding",
            );
        if (!founding)
            refuse(
                routeRefusal.takenOverAtStart(await marcherName(tx, marcherId)),
            );
        const origin = resolver.explain(
            marcherId,
            transition.start_beat,
        ).origin;
        out.push({
            marcherId,
            row,
            transition,
            A: [origin[0], origin[1]],
            B: await destinationOf(tx, transition, row.slot_index),
            lane: await laneOn(tx, transition.id, row.slot_index),
        });
    }
    return out;
}

/** One lane of a route with the row on its slot (its marcher) and its transition. */
export interface Walker {
    lane: DatabaseTimelineLane;
    transition: TransitionRow;
    row: AssignmentRow;
}

/** Every lane of `routeId` with a marcher on its slot, by marcher id. */
export async function walkersOf(
    tx: DbTransaction,
    routeId: number,
): Promise<Walker[]> {
    const T = schema.timeline_transitions;
    const A = schema.timeline_assignments;
    const L = schema.timeline_lanes;
    return await tx
        .select({ lane: L, transition: T, row: A })
        .from(L)
        .innerJoin(T, eq(T.id, L.transition_id))
        .innerJoin(
            A,
            and(
                eq(A.transition_id, L.transition_id),
                eq(A.slot_index, L.slot_index),
            ),
        )
        .where(eq(L.route_id, routeId))
        .orderBy(asc(A.marcher_id), asc(A.start_beat))
        .all();
}

/** Every lane of `routeId`, with its transition, by id (vacant ones too, owner Q1). */
async function lanesWithTransitions(tx: DbTransaction, routeId: number) {
    const T = schema.timeline_transitions;
    const L = schema.timeline_lanes;
    return await tx
        .select({ lane: L, transition: T })
        .from(L)
        .innerJoin(T, eq(T.id, L.transition_id))
        .where(eq(L.route_id, routeId))
        .orderBy(asc(L.id))
        .all();
}

export async function routeGeometryOf(
    tx: DbTransaction,
    routeId: number,
): Promise<RouteGeometry> {
    const r = await tx
        .select()
        .from(schema.timeline_routes)
        .where(eq(schema.timeline_routes.id, routeId))
        .get();
    if (!r) refuse(`route ${routeId} does not exist`);
    return JSON.parse(r.geometry) as RouteGeometry;
}

/**
 * Puts member `m`'s slot on route `routeId` with `offset`: updates the slot's lane, or inserts
 * one. No transition or row is written (AP-R8, AP-R10). A lane moved to another route loses its
 * Adjust, whose anchors named the old one (AP-R8); returns whether it had one.
 */
async function setLane(
    tx: DbTransaction,
    m: Member,
    routeId: number,
    offset: XY,
): Promise<boolean> {
    const L = schema.timeline_lanes;
    const columns = offsetColumns(offset);
    const leaves = m.lane !== undefined && m.lane.route_id !== routeId;
    const hadAdjust = leaves && m.lane!.adjust !== null;
    if (m.lane)
        await tx
            .update(L)
            .set({
                route_id: routeId,
                ...columns,
                ...(leaves ? { adjust: null } : {}),
            })
            .where(eq(L.id, m.lane.id));
    else
        await tx.insert(L).values({
            transition_id: m.transition.id,
            slot_index: m.row.slot_index,
            route_id: routeId,
            ...columns,
        });
    return hadAdjust;
}

/** Points to store: kept ids stay (refused when not `current`'s), new points get fresh ids. */
export function pointsToStore(
    points: readonly RoutePointInput[],
    current: RouteGeometry | null,
): RoutePoint[] {
    const currentIds = new Set(current?.points.map((p) => p.id) ?? []);
    const taken = new Set(currentIds);
    for (const p of points)
        if (p.id !== undefined && !currentIds.has(p.id))
            refuse(`point ${p.id} is not a point of this route`);
    return points.map((p) => {
        const id = p.id ?? freshPointId(taken);
        taken.add(id);
        return storedPoint(id, p.at, p.tension, p.bulge);
    });
}

// ---------------------------------------------------------------------------
// AP-R8: draw a group path, or draw it again
// ---------------------------------------------------------------------------

export interface DrawGroupRouteResult {
    routeId: number;
    /** Each member's transition, by marcher id (its own move's, unchanged) */
    transitions: Record<number, number>;
    /** Drawn again: what it did to the group path's Adjusts (AP-H1) */
    rehome: RehomeReport;
    /** A new path: how many spots lost an Adjust anchored on the route they left (AP-R8) */
    adjustsRemoved: number;
}

/**
 * AP-R8 (spec v0.10 J.8): the marchers `marcherIds` (two or more) in move `timelineId` walk one
 * group path through `points` (the reference line). `from` and `to` are the means of the members'
 * starts and destinations, and each member's lane offset is its start less `from`, so every
 * member starts on its lane. When the marchers are exactly the walkers of one group path in the
 * move, that route is updated in place and the offsets rewritten (draw it again); otherwise a new
 * route is inserted with a lane on each member's slot (a slot that had a lane is re-pointed), and
 * routes nobody walks any more are deleted (AP-H3). A group path keeping members outside the
 * selection stays as it is. No transition or row is written: members stay in their moves.
 */
// One procedure, read then written in the order the spec gives (AP-R8)
// eslint-disable-next-line max-lines-per-function
export async function drawGroupRouteInTransaction({
    tx,
    timelineId,
    marcherIds,
    points,
}: {
    tx: DbTransaction;
    timelineId: number;
    marcherIds: readonly number[];
    points: readonly RoutePointInput[];
}): Promise<DrawGroupRouteResult> {
    if (new Set(marcherIds).size < 2) refuse(routeRefusal.groupTooSmall());
    const members = await readMembers(tx, timelineId, marcherIds);
    const F = meanOf(members.map((m) => m.A));
    const G = meanOf(members.map((m) => m.B));
    const offsets = new Map(members.map((m) => [m.marcherId, sub(m.A, F)]));

    // Again: the selection is exactly the walkers of one group path in the move
    const groupRoutes = new Set(
        members
            .filter((m) => m.lane !== undefined && m.lane.offset_x !== null)
            .map((m) => m.lane!.route_id),
    );
    let again: { routeId: number; geometry: RouteGeometry } | null = null;
    if (groupRoutes.size === 1) {
        const [rid] = groupRoutes;
        const walkers = await walkersOf(tx, rid!);
        const walkerIds = new Set(walkers.map((w) => w.row.marcher_id));
        if (
            walkerIds.size === members.length &&
            members.every((m) => walkerIds.has(m.marcherId))
        )
            again = {
                routeId: rid!,
                geometry: await routeGeometryOf(tx, rid!),
            };
    }
    // D-22: a new path is personal; drawing it again from its own walkers is a path edit (07 N3)
    if (!again) {
        const inSelection = new Set(members.map((m) => m.marcherId));
        for (const m of members) await refuseSharedOutside(tx, m, inSelection);
    }
    const geometry: RouteGeometry = {
        v: 1,
        from: F,
        to: G,
        points: pointsToStore(points, again?.geometry ?? null),
    };
    assertValid(validateRouteGeometry(geometry), "route");
    const json = JSON.stringify(geometry);
    const transitions: Record<number, number> = Object.fromEntries(
        members.map((m) => [m.marcherId, m.transition.id]),
    );

    return await mapDbErrors(async () => {
        if (again) {
            const rehome = await writeRouteGeometryInTransaction(
                tx,
                again.routeId,
                geometry,
            );
            for (const m of members)
                await setLane(tx, m, again.routeId, offsets.get(m.marcherId)!);
            return {
                routeId: again.routeId,
                transitions,
                rehome,
                adjustsRemoved: 0,
            };
        }
        const route = (await tx
            .insert(schema.timeline_routes)
            .values({ geometry: json })
            .returning()
            .get())!;
        await markArcsInTransaction(tx, geometry);
        let adjustsRemoved = 0;
        for (const m of members)
            if (await setLane(tx, m, route.id, offsets.get(m.marcherId)!))
                adjustsRemoved++;
        await sweepOrphanRoutesInTransaction(tx);
        await markLaneModelInTransaction(tx);
        return {
            routeId: route.id,
            transitions,
            rehome: NOTHING_REHOMED,
            adjustsRemoved,
        };
    });
}

/** AP-R8's `SHARED`: refused when the other holder of a member's spot isn't in the selection. */
async function refuseSharedOutside(
    tx: DbTransaction,
    m: Member,
    inSelection: ReadonlySet<number>,
): Promise<void> {
    const A = schema.timeline_assignments;
    const rows = await tx
        .select({ marcher: A.marcher_id })
        .from(A)
        .where(
            and(
                eq(A.transition_id, m.transition.id),
                eq(A.slot_index, m.row.slot_index),
            ),
        )
        .all();
    if (rows.some((r) => !inSelection.has(r.marcher)))
        await refuseSharedSpot(tx, m.transition, m.row.slot_index, m.marcherId);
}

/** AP-R8 as one undoable edit. */
export async function drawGroupRoute(args: {
    db: DbConnection;
    timelineId: number;
    marcherIds: readonly number[];
    points: readonly RoutePointInput[];
}): Promise<DrawGroupRouteResult> {
    const { db, ...rest } = args;
    return await transactionWithHistory(db, "drawGroupRoute", (tx) =>
        drawGroupRouteInTransaction({ tx, ...rest }),
    );
}

// ---------------------------------------------------------------------------
// AP-R1, group branch: point edits on the open group path
// ---------------------------------------------------------------------------

/**
 * AP-R1 on a group path: the reference line's points become `points` (ids kept, as step 2's
 * edits), so every lane moves; no offset changes. `from` is kept while the first point keeps its
 * id and position, else written as the mean of `A_m − o_m` over the members with a founding span
 * at the move's start (kept when none has one); `to` likewise with the last point and the mean of
 * `B_k − o_k` over the route's lanes' slots (spec J.8). A path edit, never refused for who holds
 * the spots: it moves every occupant of them (07 N3).
 */
export async function editGroupRoutePointsInTransaction({
    tx,
    routeId,
    points,
    drag = false,
    toBulge,
}: {
    tx: DbTransaction;
    routeId: number;
    points: readonly RoutePointInput[];
    /** A point drag: it stops short rather than crowd Adjust keys (AP-R11) */
    drag?: boolean;
    /** The last leg's bulge (R-14″): a number sets it, null clears it, undefined keeps it */
    toBulge?: number | null;
}): Promise<RehomeReport> {
    const current = await routeGeometryOf(tx, routeId);
    const walkers = await walkersOf(tx, routeId);
    const lanes = await lanesWithTransitions(tx, routeId);
    if (
        walkers.length === 0 ||
        lanes.some(({ lane }) => lane.offset_x === null)
    )
        refuse(`route ${routeId} is not a group path`);
    const routePoints = pointsToStore(points, current);
    const keepFrom = samePoint(current.points[0], routePoints[0]);
    const keepTo = samePoint(current.points.at(-1), routePoints.at(-1));
    let from = current.from;
    let to = current.to;
    if (!keepFrom || !keepTo) {
        const resolver = createResolver(
            (await readTimelineTables(tx)).snapshot,
        );
        const starts: XY[] = [];
        const ends: XY[] = [];
        // `from`: over the founding occupants; `to`: over the lanes' slots (spec J.8 AP-R1)
        for (const w of walkers) {
            const o = laneOffset(w.lane)!;
            const founding = resolver
                .spanInfos(w.row.marcher_id)
                .some(
                    (s) =>
                        s.assignmentId === w.row.id &&
                        s.start === w.transition.start_beat &&
                        s.kind === "founding",
                );
            if (founding) {
                const A = resolver.explain(
                    w.row.marcher_id,
                    w.transition.start_beat,
                ).origin;
                starts.push(sub([A[0], A[1]], o));
            }
        }
        for (const { lane, transition } of lanes)
            ends.push(
                sub(
                    await destinationOf(tx, transition, lane.slot_index),
                    laneOffset(lane)!,
                ),
            );
        if (!keepFrom && starts.length > 0) from = meanOf(starts);
        if (!keepTo) to = meanOf(ends);
    }
    const geometry: RouteGeometry = {
        v: 1,
        from,
        to,
        ...lastLegBulge(current, toBulge),
        points: routePoints,
    };
    return await mapDbErrors(() =>
        writeRouteGeometryInTransaction(tx, routeId, geometry, { drag }),
    );
}

/** AP-R1 on a group path as one undoable edit. */
export async function editGroupRoutePoints(args: {
    db: DbConnection;
    routeId: number;
    points: readonly RoutePointInput[];
}): Promise<RehomeReport> {
    const { db, ...rest } = args;
    return await transactionWithHistory(db, "editGroupRoute", (tx) =>
        editGroupRoutePointsInTransaction({ tx, ...rest }),
    );
}

// ---------------------------------------------------------------------------
// AP-R9: Detach
// ---------------------------------------------------------------------------

/**
 * The marcher's rows in move `timelineId` whose slot has a group lane (one with an offset), each
 * with its transition and lane, earliest first. A marcher may have a row without a lane before its laned
 * one (a hold, a join), so the lane is looked for on every row, not only the first.
 */
export async function groupLanedRows(
    tx: DbTransaction,
    timelineId: number,
    marcherId: number,
): Promise<
    {
        row: AssignmentRow;
        transition: TransitionRow;
        lane: DatabaseTimelineLane;
    }[]
> {
    const T = schema.timeline_transitions;
    const A = schema.timeline_assignments;
    const L = schema.timeline_lanes;
    return await tx
        .select({ row: A, transition: T, lane: L })
        .from(A)
        .innerJoin(T, eq(A.transition_id, T.id))
        .innerJoin(
            L,
            and(
                eq(L.transition_id, A.transition_id),
                eq(L.slot_index, A.slot_index),
            ),
        )
        .where(
            and(
                eq(T.timeline_id, timelineId),
                eq(A.marcher_id, marcherId),
                isNotNull(L.offset_x),
            ),
        )
        .orderBy(asc(A.start_beat), asc(A.id))
        .all();
}

/**
 * AP-R9 Detach (spec v0.10 J.8, owner Q3 and Q5): each of `marcherIds` on a group path in move
 * `timelineId` gets its own copy of the path. The copy is the group path's route verbatim (its
 * geometry text, so every point id, tension and bulge, and `from` and `to`), and the marcher's lane
 * moves to it keeping its offset and Adjust, so every position stays bit-identical: the marcher
 * passes each point on the group's counts until the copy (or the group path) is edited. A K6 link
 * (`detached_from`) remembers the group path for Rejoin. Group paths nobody walks any more go, with
 * the links naming them (AP-H3), so detaching every member leaves copies only. One copy per spot;
 * the marcher stays in its move. Refused when a marcher doesn't walk a group path there, walks the
 * only lane of its path already (a copy), or shares its spot (D-22).
 */
export async function detachInTransaction({
    tx,
    timelineId,
    marcherIds,
    routeId,
}: {
    tx: DbTransaction;
    timelineId: number;
    marcherIds: readonly number[];
    /**
     * Detach from this group path: each marcher's row whose lane is on it (a marcher may have
     * laned rows in two transitions of the move). Absent: the earliest laned row, as the Detach
     * command has it.
     */
    routeId?: number;
}): Promise<{ routes: Record<number, number> }> {
    const ids = [...new Set(marcherIds)].sort((a, b) => a - b);
    if (ids.length === 0) refuse("name the marchers to detach");
    const plan: { lane: DatabaseTimelineLane; marcherId: number }[] = [];
    const geometries = new Map<number, string>();
    for (const marcherId of ids) {
        const rows = await groupLanedRows(tx, timelineId, marcherId);
        const found =
            routeId === undefined
                ? rows[0]
                : rows.find((r) => r.lane.route_id === routeId);
        if (!found)
            refuse(
                routeRefusal.notOnGroupPath(await marcherName(tx, marcherId)),
            );
        const { lane } = found;
        await refuseSharedSpot(
            tx,
            found.transition,
            lane.slot_index,
            marcherId,
        );
        if ((await lanesOfRoute(tx, lane.route_id)).length < 2)
            refuse(routeRefusal.onlyOnPath(await marcherName(tx, marcherId)));
        if (!geometries.has(lane.route_id)) {
            const r = await tx
                .select({ geometry: schema.timeline_routes.geometry })
                .from(schema.timeline_routes)
                .where(eq(schema.timeline_routes.id, lane.route_id))
                .get();
            if (!r) refuse(`route ${lane.route_id} does not exist`);
            geometries.set(lane.route_id, r.geometry);
        }
        plan.push({ lane, marcherId });
    }
    return await mapDbErrors(async () => {
        const routes: Record<number, number> = {};
        for (const { lane, marcherId } of plan) {
            const copy = (await tx
                .insert(schema.timeline_routes)
                .values({ geometry: geometries.get(lane.route_id)! })
                .returning()
                .get())!;
            // Offset and Adjust stay: the same inputs walk the same positions
            await tx
                .update(schema.timeline_lanes)
                .set({ route_id: copy.id })
                .where(eq(schema.timeline_lanes.id, lane.id));
            // The lane's offset and the group path's `from` at Detach: Rejoin restores this offset
            // while `from` is the same, so a round trip moves nobody even with a Re-fit pending
            const from = (
                JSON.parse(geometries.get(lane.route_id)!) as RouteGeometry
            ).from;
            const link: DetachedLinkData = {
                offset: [lane.offset_x!, lane.offset_y!],
                from: [from[0], from[1]],
            };
            await tx.insert(schema.timeline_route_sources).values({
                route_id: copy.id,
                kind: "detached_from",
                source_route_id: lane.route_id,
                data: JSON.stringify(link),
            });
            routes[marcherId] = copy.id;
        }
        await sweepOrphanRoutesInTransaction(tx);
        return { routes };
    });
}

/** AP-R9 Detach as one undoable edit (every marcher at once is one undo step). */
export async function detachFromGroupPath(args: {
    db: DbConnection;
    timelineId: number;
    marcherIds: readonly number[];
}): Promise<{ routes: Record<number, number> }> {
    const { db, ...rest } = args;
    return await transactionWithHistory(db, "detachPath", (tx) =>
        detachInTransaction({ tx, ...rest }),
    );
}

// ---------------------------------------------------------------------------
// AP-R10: Rejoin
// ---------------------------------------------------------------------------

/** What a `detached_from` link records at Detach (K6 `data`): the lane's offset and R's `from` */
interface DetachedLinkData {
    offset: XY;
    from: XY;
}

/** A Detached copy's K6 link: the group path it came from, and what Detach recorded */
interface DetachedLink {
    source: number | null;
    data: DetachedLinkData | null;
}

/** The `detached_from` link of route `routeId`, or null when it isn't a Detached copy */
async function detachedLinkOf(
    tx: DbTransaction,
    routeId: number,
): Promise<DetachedLink | null> {
    const S = schema.timeline_route_sources;
    const row = await tx
        .select({ source: S.source_route_id, data: S.data })
        .from(S)
        .where(and(eq(S.route_id, routeId), eq(S.kind, "detached_from")))
        .orderBy(asc(S.id))
        .get();
    if (!row) return null;
    const parsed = row.data === null ? null : (JSON.parse(row.data) as unknown);
    const pair = (v: unknown): v is XY =>
        Array.isArray(v) &&
        v.length === 2 &&
        v.every((n) => typeof n === "number" && Number.isFinite(n));
    const data =
        parsed !== null &&
        typeof parsed === "object" &&
        pair((parsed as DetachedLinkData).offset) &&
        pair((parsed as DetachedLinkData).from)
            ? (parsed as DetachedLinkData)
            : null;
    return { source: row.source, data };
}

/** A marcher back from Detach (AP-R10): its lane, and the offset Rejoin writes on it */
interface BackFromDetach {
    marcherId: number;
    lane: DatabaseTimelineLane;
    transitionId: number;
    /** Where its marcher starts less R's `from`, or null to keep the stored one */
    offset: { offset_x: number; offset_y: number } | null;
}

/**
 * Whether `marcherId` comes back from Detach onto group path `routeId` (geometry `R`): its row in
 * the move (any row, not only the first, review of #900 S3) whose lane walks a copy K6 names
 * `detached_from` it; null when none, so it is new to the path. Refused when that spot is shared
 * (D-22). **The offset:** while R's `from` is bit for bit the one the link recorded at Detach, the
 * offset recorded then, so a round trip moves nobody (whatever the copy went through, and even
 * with a Re-fit pending); once `from` changed (Re-fit, a first-point edit, drawing it again), the
 * offset is written from where the marcher starts, as at draw time (`A − R.from`), so it lands in
 * its place in the group (review of #900, B1). A link with no data (written by no build so far)
 * takes that second branch; a spot whose marcher doesn't start on it then keeps its stored offset.
 * `resolver` is built once, on the first marcher back.
 */
async function backFromDetach(
    tx: DbTransaction,
    timelineId: number,
    routeId: number,
    R: RouteGeometry,
    marcherId: number,
    resolver: { current: Resolver | null },
): Promise<BackFromDetach | null> {
    let found: Awaited<ReturnType<typeof groupLanedRows>>[number] | undefined;
    let link: DetachedLink | null = null;
    for (const r of await groupLanedRows(tx, timelineId, marcherId)) {
        link = await detachedLinkOf(tx, r.lane.route_id);
        if (link?.source === routeId) {
            found = r;
            break;
        }
    }
    if (!found || !link) return null;
    // A personal edit of the spot: refused while someone else holds it (D-22)
    await refuseSharedSpot(
        tx,
        found.transition,
        found.lane.slot_index,
        marcherId,
    );
    const res = (resolver.current ??= createResolver(
        (await readTimelineTables(tx)).snapshot,
    ));
    const row = found.row.id;
    const start = found.transition.start_beat;
    const founds = res
        .spanInfos(marcherId)
        .some(
            (sp) =>
                sp.assignmentId === row &&
                sp.start === start &&
                sp.kind === "founding",
        );
    const A = res.explain(marcherId, start).origin;
    // R's `from` as it was at Detach: the offset recorded then, so a round trip moves nobody even
    // when the marcher's start had moved before Detach with a Re-fit pending (review of #900)
    const sameFrom =
        link.data !== null &&
        Object.is(link.data.from[0], R.from[0]) &&
        Object.is(link.data.from[1], R.from[1]);
    return {
        marcherId,
        lane: found.lane,
        transitionId: found.transition.id,
        offset: sameFrom
            ? offsetColumns(link.data!.offset)
            : founds
              ? offsetColumns(sub([A[0], A[1]], R.from))
              : null,
    };
}

/**
 * AP-R10: the marchers `marcherIds` in move `timelineId` follow the group path `routeId` there.
 *
 * - **Back from Detach** (K6 says the marcher's lane walks a copy `detached_from` this path): the
 *   lane goes back to the group path with its Adjust cleared, always (owner Q4); undo brings the
 *   Adjust back. Its offset is the one it had at Detach while the group path's `from` is still the
 *   one recorded then, else `A_j − R.from` (`backFromDetach`). An unadjusted spot is then
 *   bit-identical to before Detach unless the group path's `from` changed. The copy goes with its
 *   link (AP-H3).
 * - **New to the path:** each with the offset of where it stands now (`A_j − R.from`), so a member
 *   that drew its own path gets a lane again and a marcher on a straight, arc or shape move joins
 *   the group. Nobody leaves their move.
 *
 * Marchers already on it are left as they are. Routes nobody walks any more go (AP-H3).
 */
export async function rejoinGroupPathInTransaction({
    tx,
    timelineId,
    routeId,
    marcherIds,
}: {
    tx: DbTransaction;
    timelineId: number;
    routeId: number;
    marcherIds: readonly number[];
}): Promise<RejoinResult> {
    const walkers = (await walkersOf(tx, routeId)).filter(
        (w) => w.transition.timeline_id === timelineId,
    );
    if (walkers.length === 0 || walkers.some((w) => w.lane.offset_x === null))
        refuse(routeRefusal.noGroupPath(await moveNameOf(tx, timelineId)));
    // A Detached copy is one marcher's path: its marcher Rejoins the group path it came from,
    // and nobody joins the copy (review of #900, S1)
    if ((await detachedSourceOf(tx, routeId)) !== null)
        refuse(routeRefusal.rejoinOntoCopy());
    const on = new Set(walkers.map((w) => w.row.marcher_id));
    const joining = [...new Set(marcherIds)]
        .filter((id) => !on.has(id))
        .sort((a, b) => a - b);
    // Nothing to rejoin: refused, not an empty edit (review of #683)
    if (joining.length === 0) refuse(routeRefusal.alreadyOnGroupPath());
    const R = await routeGeometryOf(tx, routeId);
    const back: BackFromDetach[] = [];
    const newcomers: number[] = [];
    const resolver = { current: null as Resolver | null };
    for (const marcherId of joining) {
        const found = await backFromDetach(
            tx,
            timelineId,
            routeId,
            R,
            marcherId,
            resolver,
        );
        if (found) back.push(found);
        else newcomers.push(marcherId);
    }
    const members = await readMembers(tx, timelineId, newcomers);
    const dropped = await changedCopies(tx, routeId, back);
    return await mapDbErrors(async () => {
        const transitions: Record<number, number> = {};
        for (const { marcherId, lane, transitionId, offset } of back) {
            await tx
                .update(schema.timeline_lanes)
                .set({ route_id: routeId, adjust: null, ...(offset ?? {}) })
                .where(eq(schema.timeline_lanes.id, lane.id));
            transitions[marcherId] = transitionId;
        }
        for (const m of members) {
            await setLane(tx, m, routeId, sub(m.A, R.from));
            transitions[m.marcherId] = m.transition.id;
        }
        await sweepOrphanRoutesInTransaction(tx);
        return { transitions, dropped };
    });
}

/** What Rejoin did: each rejoined marcher's row, and who lost changes of their own */
export interface RejoinResult {
    transitions: Record<number, number>;
    /**
     * The marchers back from Detach whose copy had changed from the group path, or whose line
     * had bends: Rejoin drops those, and says so (sim round 3)
     */
    dropped: number[];
}

/** Of `back`, the marchers whose copy differs from group path `routeId`, or whose line is bent */
async function changedCopies(
    tx: DbTransaction,
    routeId: number,
    back: readonly BackFromDetach[],
): Promise<number[]> {
    if (back.length === 0) return [];
    const R = schema.timeline_routes;
    const textOf = async (id: number) =>
        (
            await tx
                .select({ geometry: R.geometry })
                .from(R)
                .where(eq(R.id, id))
                .limit(1)
        )[0]?.geometry;
    const group = await textOf(routeId);
    const dropped: number[] = [];
    for (const { marcherId, lane } of back)
        if (lane.adjust !== null || (await textOf(lane.route_id)) !== group)
            dropped.push(marcherId);
    return dropped;
}

/** AP-R10 as one undoable edit. */
export async function rejoinGroupPath(args: {
    db: DbConnection;
    timelineId: number;
    routeId: number;
    marcherIds: readonly number[];
}): Promise<RejoinResult> {
    const { db, ...rest } = args;
    return await transactionWithHistory(db, "rejoinPath", (tx) =>
        rejoinGroupPathInTransaction({ tx, ...rest }),
    );
}

/**
 * The group paths walked in move `timelineId`, each with its walkers' marcher ids, how many lanes
 * it has (vacant ones too) and the group path it was Detached from (K6), if any.
 */
export async function readGroupPaths(
    db: DbConnection | DbTransaction,
    timelineId: number,
): Promise<
    {
        routeId: number;
        marcherIds: number[];
        laneCount: number;
        detachedFrom: number | null;
    }[]
> {
    const T = schema.timeline_transitions;
    const A = schema.timeline_assignments;
    const L = schema.timeline_lanes;
    // One query: the lane count and the K6 source come along as subqueries, as `readRoutes` has
    // them, so a selection change reads the move's group paths once (review of #900, N1)
    const rows = await db
        .select({
            routeId: L.route_id,
            marcherId: A.marcher_id,
            laneCount: sql<number>`(SELECT count(*) FROM timeline_lanes c WHERE c.route_id = ${L.route_id})`,
            detachedFrom: sql<
                number | null
            >`(SELECT s.source_route_id FROM timeline_route_sources s WHERE s.route_id = ${L.route_id} AND s.kind = 'detached_from' ORDER BY s.id LIMIT 1)`,
        })
        .from(L)
        .innerJoin(T, eq(T.id, L.transition_id))
        .innerJoin(
            A,
            and(
                eq(A.transition_id, L.transition_id),
                eq(A.slot_index, L.slot_index),
            ),
        )
        .where(and(eq(T.timeline_id, timelineId), isNotNull(L.offset_x)))
        .orderBy(asc(L.route_id), asc(A.marcher_id))
        .all();
    const out = new Map<
        number,
        {
            routeId: number;
            marcherIds: number[];
            laneCount: number;
            detachedFrom: number | null;
        }
    >();
    for (const r of rows) {
        const path = out.get(r.routeId) ?? {
            routeId: r.routeId,
            marcherIds: [],
            laneCount: Number(r.laneCount),
            detachedFrom:
                r.detachedFrom === null ? null : Number(r.detachedFrom),
        };
        if (!path.marcherIds.includes(r.marcherId))
            path.marcherIds.push(r.marcherId);
        out.set(r.routeId, path);
    }
    return [...out.values()];
}

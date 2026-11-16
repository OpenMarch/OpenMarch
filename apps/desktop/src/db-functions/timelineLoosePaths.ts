/**
 * Loose group paths (interaction round 7, owner 2026-11-15): a group path drawn for a selection
 * that isn't a placed shape doesn't stay one. Every write on it is one undo step that, in one
 * transaction, gathers the members' copies back onto one route (`regroupCopiesInTransaction`),
 * makes the edit on that route, and gives each member its own copy again (AP-R9's Detach for
 * all of them), so nothing is left linking the marchers once the edit is saved, and nothing
 * happens on deselect. A group path whose members are a placed shape stays live (`keepLive`).
 *
 * Selecting the same marchers again finds their copies, identical while nobody's was edited
 * alone, and shows them as one line to edit together (`findGroupTarget`'s loose target).
 */
import { schema } from "@/global/database/db";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { mapDbErrors, refuse, TimelineWriteError } from "./timelineErrors";
import { detachInTransaction, groupLanedRows } from "./timelineGroupRoutes";
import { marcherName, routeRefusal } from "./timelineRoutes";
import {
    lanesOfRoute,
    sweepOrphanRoutesInTransaction,
    type DatabaseTimelineLane,
} from "./timelineLanes";

/**
 * Which of a member's laned rows a loose write means: the one in its transition (`transitions`, by
 * marcher, from the path shown), else its earliest
 */
export type MemberTransitions = Readonly<Record<number, number>>;

/**
 * The members' group lanes in move `timelineId`, by marcher: each one's row in its transition in
 * `transitions` (a marcher may have laned rows in two transitions of the move), else its earliest
 * laned row. Null when one has none.
 */
async function memberLanes(
    tx: DbTransaction,
    timelineId: number,
    marcherIds: readonly number[],
    transitions?: MemberTransitions,
): Promise<DatabaseTimelineLane[] | null> {
    const lanes: DatabaseTimelineLane[] = [];
    for (const id of [...new Set(marcherIds)].sort((a, b) => a - b)) {
        const rows = await groupLanedRows(tx, timelineId, id);
        const want = transitions?.[id];
        const found =
            want === undefined
                ? rows[0]
                : rows.find((r) => r.transition.id === want);
        if (!found) return null;
        lanes.push(found.lane);
    }
    return lanes;
}

/**
 * The copies `lanes` walk, when each is alone on its route and every route's geometry is the same
 * text (copies made together and edited together since); null otherwise
 */
async function copiesOf(
    tx: DbTransaction,
    lanes: readonly DatabaseTimelineLane[],
): Promise<{ routeIds: number[]; geometry: string } | null> {
    const routeIds = [...new Set(lanes.map((l) => l.route_id))];
    if (routeIds.length !== lanes.length || routeIds.length < 2) return null;
    for (const rid of routeIds)
        if ((await lanesOfRoute(tx, rid)).length !== 1) return null;
    const R = schema.timeline_routes;
    const rows = await tx
        .select({ geometry: R.geometry })
        .from(R)
        .where(inArray(R.id, routeIds))
        .all();
    const texts = new Set(rows.map((r) => r.geometry));
    if (rows.length !== routeIds.length || texts.size !== 1) return null;
    return { routeIds, geometry: rows[0]!.geometry };
}

/** Puts `lanes` (each on a copy, `copies`) on one new route with the copies' geometry */
async function regroup(
    tx: DbTransaction,
    lanes: readonly DatabaseTimelineLane[],
    geometry: string,
): Promise<number> {
    return await mapDbErrors(async () => {
        const route = (await tx
            .insert(schema.timeline_routes)
            .values({ geometry })
            .returning()
            .get())!;
        // Offset and Adjust stay: the same inputs walk the same positions, as Detach keeps them
        await tx
            .update(schema.timeline_lanes)
            .set({ route_id: route.id })
            .where(
                inArray(
                    schema.timeline_lanes.id,
                    lanes.map((l) => l.id),
                ),
            );
        await sweepOrphanRoutesInTransaction(tx);
        return route.id;
    });
}

/**
 * Detach's inverse: `marcherIds` (two or more) in move `timelineId`, each alone on its own copy
 * of one path (the same geometry text), walk one group path again: a new route with that
 * geometry, every lane re-pointed to it keeping its offset and Adjust, so every position stays
 * bit-identical; the copies go (AP-H3). Refused when a marcher has no lane there, shares its
 * route, or the copies differ. Returns the group path's route.
 */
export async function regroupCopiesInTransaction({
    tx,
    timelineId,
    marcherIds,
    transitions,
}: {
    tx: DbTransaction;
    timelineId: number;
    marcherIds: readonly number[];
    transitions?: MemberTransitions;
}): Promise<number> {
    const lanes = await memberLanes(tx, timelineId, marcherIds, transitions);
    if (!lanes) refuse("every marcher to regroup needs a lane in the move");
    const copies = await copiesOf(tx, lanes);
    if (!copies) refuse("the marchers aren't on identical copies of one path");
    return await regroup(tx, lanes, copies.geometry);
}

/**
 * The one route the members walk together for a write: the group path they're on, or their
 * identical copies regrouped first. Null when they're on neither (a new group path is drawn).
 */
async function membersRouteInTransaction(
    tx: DbTransaction,
    timelineId: number,
    marcherIds: readonly number[],
    transitions?: MemberTransitions,
): Promise<{ routeId: number; fromCopies: boolean } | null> {
    const lanes = await memberLanes(tx, timelineId, marcherIds, transitions);
    if (!lanes) return null;
    const routes = new Set(lanes.map((l) => l.route_id));
    if (routes.size === 1 && lanes.length > 1)
        return { routeId: [...routes][0]!, fromCopies: false };
    const copies = await copiesOf(tx, lanes);
    if (!copies) return null;
    return {
        routeId: await regroup(tx, lanes, copies.geometry),
        fromCopies: true,
    };
}

/** What a group path write did, besides its edit's own result */
export interface GroupWrite<R> {
    result: R;
    /** Each member was left on its own copy (a loose group path) */
    baked: boolean;
    /** The members were on copies before it: a loose path edited again */
    fromCopies: boolean;
    /** Each member's copy, when baked */
    routes: Record<number, number>;
    /**
     * Left one live group path because these marchers share a spot with another (D-22): the
     * members whose spot is shared and whoever shares it, by drill number. Empty otherwise.
     */
    shared: string[];
}

/** The edit a group path write makes: on the members' route, or a new group path (`draw`) */
export type GroupEdit<R> =
    | {
          /** A new drawing: there may be no route yet (`routeId` null) */
          draw: true;
          edit: (tx: DbTransaction, routeId: number | null) => Promise<R>;
          /** The route the drawing wrote, to Detach the members from */
          routeOf: (result: R) => number;
      }
    | {
          draw?: false;
          edit: (tx: DbTransaction, routeId: number) => Promise<R>;
      };

/**
 * The drill numbers of the members whose spot on group path `routeId` another marcher shares
 * (D-22), with whoever shares it; empty when nobody's is shared
 */
async function sharedSpotNames(
    tx: DbTransaction,
    timelineId: number,
    marcherIds: readonly number[],
    routeId: number,
): Promise<string[]> {
    const A = schema.timeline_assignments;
    const names = new Set<string>();
    for (const id of [...new Set(marcherIds)].sort((a, b) => a - b)) {
        const row = (await groupLanedRows(tx, timelineId, id)).find(
            (r) => r.lane.route_id === routeId,
        );
        if (!row) continue;
        const others = await tx
            .select({ marcher: A.marcher_id })
            .from(A)
            .where(
                and(
                    eq(A.transition_id, row.transition.id),
                    eq(A.slot_index, row.lane.slot_index),
                    ne(A.marcher_id, id),
                ),
            )
            .all();
        if (others.length === 0) continue;
        names.add(await marcherName(tx, id));
        for (const o of others) names.add(await marcherName(tx, o.marcher));
    }
    return [...names];
}

/** Whether `error` is Detach's refusal of a shared spot (D-22), the one a loose write keeps live for */
const isSharedSpotRefusal = (error: unknown): boolean =>
    error instanceof TimelineWriteError &&
    error.code === "E-ARGS" &&
    error.text?.key === "timeline.refusals.route.spotShared";

/**
 * One write on a group path as one undoable edit named `name`: the members' route found (their
 * copies regrouped onto one), the edit run on it, then, unless `keepLive`, every member Detached
 * from that route, so each keeps its own copy. A new drawing (`draw`) may find no route and
 * write one; any other edit is refused when the members aren't on one group path or on identical
 * copies (a copy edited alone since), so one copy is never edited for them all. When a member's
 * spot is shared (D-22) the group path stays live, and `shared` names who share.
 */
export async function writeGroupPath<R>({
    db,
    name,
    timelineId,
    marcherIds,
    keepLive,
    transitions,
    ...edit
}: {
    db: DbConnection;
    name: string;
    timelineId: number;
    marcherIds: readonly number[];
    keepLive: boolean;
    /** Each member's transition on the path shown (`memberLanes`) */
    transitions?: MemberTransitions;
} & GroupEdit<R>): Promise<GroupWrite<R>> {
    return await transactionWithHistory(db, name, async (tx) => {
        const found = await membersRouteInTransaction(
            tx,
            timelineId,
            marcherIds,
            transitions,
        );
        let result: R;
        let routeId: number;
        if (edit.draw) {
            result = await edit.edit(tx, found?.routeId ?? null);
            routeId = edit.routeOf(result);
        } else {
            if (!found) refuse(routeRefusal.copiesApart());
            result = await edit.edit(tx, found.routeId);
            routeId = found.routeId;
        }
        const fromCopies = found?.fromCopies ?? false;
        const live = { result, baked: false, fromCopies, routes: {} };
        if (keepLive || new Set(marcherIds).size < 2)
            return { ...live, shared: [] };
        const shared = await sharedSpotNames(
            tx,
            timelineId,
            marcherIds,
            routeId,
        );
        if (shared.length > 0) return { ...live, shared };
        try {
            const { routes } = await detachInTransaction({
                tx,
                timelineId,
                marcherIds,
                routeId,
            });
            // Copies made together carry no link to a group path that's gone (AP-H3 swept it)
            return { result, baked: true, fromCopies, routes, shared: [] };
        } catch (error) {
            if (isSharedSpotRefusal(error)) return { ...live, shared: [] };
            throw error;
        }
    });
}

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
import { inArray } from "drizzle-orm";
import type { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { mapDbErrors, refuse, TimelineWriteError } from "./timelineErrors";
import { detachInTransaction, groupLanedRows } from "./timelineGroupRoutes";
import {
    lanesOfRoute,
    sweepOrphanRoutesInTransaction,
    type DatabaseTimelineLane,
} from "./timelineLanes";

/** The members' group lanes in move `timelineId`, by marcher, or null when one has none */
async function memberLanes(
    tx: DbTransaction,
    timelineId: number,
    marcherIds: readonly number[],
): Promise<DatabaseTimelineLane[] | null> {
    const lanes: DatabaseTimelineLane[] = [];
    for (const id of [...new Set(marcherIds)].sort((a, b) => a - b)) {
        const found = (await groupLanedRows(tx, timelineId, id))[0];
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
}: {
    tx: DbTransaction;
    timelineId: number;
    marcherIds: readonly number[];
}): Promise<number> {
    const lanes = await memberLanes(tx, timelineId, marcherIds);
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
): Promise<{ routeId: number; fromCopies: boolean } | null> {
    const lanes = await memberLanes(tx, timelineId, marcherIds);
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
}

/**
 * One write on a group path as one undoable edit named `name`: the members' route found (their
 * copies regrouped onto one), `edit` run on it (`routeId` null when there's none yet: a new group
 * path), then, unless `keepLive`, every member Detached, so each keeps its own copy. A member
 * Detach refuses (a shared spot, D-22) keeps the group path live rather than refuse the edit.
 */
export async function writeGroupPath<R>({
    db,
    name,
    timelineId,
    marcherIds,
    keepLive,
    edit,
}: {
    db: DbConnection;
    name: string;
    timelineId: number;
    marcherIds: readonly number[];
    keepLive: boolean;
    edit: (tx: DbTransaction, routeId: number | null) => Promise<R>;
}): Promise<GroupWrite<R>> {
    return await transactionWithHistory(db, name, async (tx) => {
        const found = await membersRouteInTransaction(
            tx,
            timelineId,
            marcherIds,
        );
        const result = await edit(tx, found?.routeId ?? null);
        const fromCopies = found?.fromCopies ?? false;
        if (keepLive || new Set(marcherIds).size < 2)
            return { result, baked: false, fromCopies, routes: {} };
        try {
            const { routes } = await detachInTransaction({
                tx,
                timelineId,
                marcherIds,
            });
            // Copies made together carry no link to a group path that's gone (AP-H3 swept it)
            return { result, baked: true, fromCopies, routes };
        } catch (error) {
            if (error instanceof TimelineWriteError && error.code === "E-ARGS")
                return { result, baked: false, fromCopies, routes: {} };
            throw error;
        }
    });
}

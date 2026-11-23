/**
 * Adjust, pathways step 3b (spec v0.10 AP-R11, D-21, D-22; decision C in J.8): one spot's own
 * displacement along a group path. Each edit here is one undo step and rewrites the lane's whole
 * `adjust` value. The rules are pure, in `@openmarch/core`'s `adjust.ts`, and shared with the live
 * preview on the field; here they meet the stored rows.
 */
import {
    adjustRefusal,
    groupSchedule,
    placeAdjustKey,
    pruneZeroKeys,
    removeAdjustKey as removeKey,
    validateAdjustProfile,
    type AdjustProfile,
    type AdjustRefusal,
    type GroupSchedule,
    type RouteGeometry,
    type RouteWalk,
    type XY,
} from "@openmarch/core";
import { eq } from "drizzle-orm";
import { schema } from "@/global/database/db";
import type { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { assertValid, mapDbErrors, refuse } from "./timelineErrors";
import { lanesOfRoute, markAdjustModelInTransaction } from "./timelineLanes";
import { marcherName, refuseSharedSpot, routeRefusal } from "./timelineRoutes";
import { profileOfLane } from "./timelineRouteGeometry";

const refusalText = (reason: AdjustRefusal) =>
    reason === "tooShort"
        ? routeRefusal.adjustTooShort()
        : reason === "outside"
          ? routeRefusal.adjustOutside()
          : routeRefusal.adjustTooClose();

/** A lane an Adjust edit is about, with its route, after AP-R11's first refusals. */
async function readAdjustable(
    tx: DbTransaction,
    laneId: number,
    marcherId: number,
) {
    const L = schema.timeline_lanes;
    const lane = await tx.select().from(L).where(eq(L.id, laneId)).get();
    if (!lane) refuse(`lane ${laneId} does not exist`);
    if (lane.offset_x === null)
        refuse(routeRefusal.notOnGroupPath(await marcherName(tx, marcherId)));
    const T = schema.timeline_transitions;
    const t = await tx
        .select()
        .from(T)
        .where(eq(T.id, lane.transition_id))
        .get();
    await refuseSharedSpot(tx, t!, lane.slot_index, marcherId);
    const R = schema.timeline_routes;
    const route = await tx
        .select()
        .from(R)
        .where(eq(R.id, lane.route_id))
        .get();
    if (!route) refuse(`route ${lane.route_id} does not exist`);
    const geometry = JSON.parse(route.geometry) as RouteGeometry;
    return {
        lane,
        geometry,
        schedule: groupSchedule(geometry as unknown as RouteWalk),
        profile: profileOfLane(lane),
    };
}

/** I-J3's shape and I-J4 on the route, then the whole new value (null: no Adjust). */
async function writeProfile(
    tx: DbTransaction,
    laneId: number,
    schedule: GroupSchedule,
    geometry: RouteGeometry,
    profile: AdjustProfile | null,
): Promise<void> {
    if (profile) {
        assertValid(validateAdjustProfile(profile), "adjust");
        const reason = adjustRefusal(schedule, geometry.points, profile.keys);
        if (reason) refuse(refusalText(reason));
    }
    await mapDbErrors(async () => {
        await tx
            .update(schema.timeline_lanes)
            .set({ adjust: profile ? JSON.stringify(profile) : null })
            .where(eq(schema.timeline_lanes.id, laneId));
        if (profile) await markAdjustModelInTransaction(tx);
    });
}

interface LaneEdit {
    laneId: number;
    /** The marcher whose lane was grabbed: D-22 names whoever else holds the spot */
    marcherId: number;
}

/**
 * AP-R11 as amended by decision C: the lane is displaced by `d` at place `x` along its route.
 * `d` is the whole displacement there, not an increment.
 */
export async function adjustLaneInTransaction({
    tx,
    laneId,
    marcherId,
    x,
    d,
}: LaneEdit & { tx: DbTransaction; x: number; d: XY }): Promise<void> {
    const { lane, geometry, schedule, profile } = await readAdjustable(
        tx,
        laneId,
        marcherId,
    );
    const placed = placeAdjustKey({
        schedule,
        points: geometry.points,
        profile,
        x,
        d,
    });
    if (!placed.ok) refuse(refusalText(placed.reason));
    await writeProfile(tx, lane.id, schedule, geometry, placed.profile);
}

/** A dragged key handle: key `index` takes displacement `d`, its place unchanged. */
export async function setAdjustKeyInTransaction({
    tx,
    laneId,
    marcherId,
    index,
    d,
}: LaneEdit & { tx: DbTransaction; index: number; d: XY }): Promise<void> {
    const { lane, geometry, schedule, profile } = await readAdjustable(
        tx,
        laneId,
        marcherId,
    );
    if (!profile?.keys[index]) refuse(`lane ${laneId} has no key ${index}`);
    const keys = pruneZeroKeys(
        profile.keys.map((k, i) =>
            i === index ? { ...k, d: [d[0], d[1]] as XY } : k,
        ),
    );
    await writeProfile(
        tx,
        lane.id,
        schedule,
        geometry,
        keys ? { v: 1, keys } : null,
    );
}

/** Removes key `index`, and any zero key it leaves stranded. */
export async function removeAdjustKeyInTransaction({
    tx,
    laneId,
    marcherId,
    index,
}: LaneEdit & { tx: DbTransaction; index: number }): Promise<void> {
    const { lane, geometry, schedule, profile } = await readAdjustable(
        tx,
        laneId,
        marcherId,
    );
    if (!profile?.keys[index]) refuse(`lane ${laneId} has no key ${index}`);
    await writeProfile(
        tx,
        lane.id,
        schedule,
        geometry,
        removeKey(profile, index),
    );
}

/** AP-R11's reset: the spot walks the plain lane again (`adjust = NULL`). */
export async function resetLaneAdjustInTransaction({
    tx,
    laneId,
    marcherId,
}: LaneEdit & { tx: DbTransaction }): Promise<void> {
    const { lane, geometry, schedule } = await readAdjustable(
        tx,
        laneId,
        marcherId,
    );
    await writeProfile(tx, lane.id, schedule, geometry, null);
}

/** Takes the "re-homed" badge off every Adjust on route `routeId`. Positions don't change. */
export async function acknowledgeRehomedInTransaction({
    tx,
    routeId,
}: {
    tx: DbTransaction;
    routeId: number;
}): Promise<void> {
    for (const lane of await lanesOfRoute(tx, routeId)) {
        const profile = profileOfLane(lane);
        if (!profile?.rehomed) continue;
        await tx
            .update(schema.timeline_lanes)
            .set({ adjust: JSON.stringify({ v: 1, keys: profile.keys }) })
            .where(eq(schema.timeline_lanes.id, lane.id));
    }
}

/** Runs `edit` as one undoable edit named `name`. */
const undoable =
    <A extends { tx: DbTransaction }>(
        name: string,
        edit: (args: A) => Promise<void>,
    ) =>
    ({ db, ...rest }: Omit<A, "tx"> & { db: DbConnection }): Promise<void> =>
        transactionWithHistory(db, name, (tx) =>
            edit({ tx, ...rest } as unknown as A),
        );

export const adjustLane = undoable("adjustLane", adjustLaneInTransaction);
export const setAdjustKey = undoable("setAdjustKey", setAdjustKeyInTransaction);
export const removeAdjustKey = undoable(
    "removeAdjustKey",
    removeAdjustKeyInTransaction,
);
export const resetLaneAdjust = undoable(
    "resetLaneAdjust",
    resetLaneAdjustInTransaction,
);
export const acknowledgeRehomed = undoable(
    "acknowledgeRehomed",
    acknowledgeRehomedInTransaction,
);

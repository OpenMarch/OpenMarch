import { asc, eq, type SQL } from "drizzle-orm";
import { schema } from "@/global/database/db";
import type { DbTransaction } from "./types";
import type { DatabaseTimeline } from "./timelines";

/**
 * Reads of a move's members: assignment rows with their transitions and timelines. Split and
 * merge (`timelineSplitMoves.ts`) and Remove keyframe's join (`timelineJoinAtBeat.ts`) share them.
 */

/** One assignment row with its transition's and timeline's columns. */
export interface MemberRow {
    assignment: typeof schema.timeline_assignments.$inferSelect;
    transition: typeof schema.timeline_transitions.$inferSelect;
    timeline: DatabaseTimeline;
}

/** The assignment rows matching `where`, each with its transition and timeline, by row id. */
export const memberRowsWhere = async (
    tx: DbTransaction,
    where: SQL | undefined,
): Promise<MemberRow[]> => {
    const a = schema.timeline_assignments;
    const t = schema.timeline_transitions;
    const l = schema.timelines;
    return await tx
        .select({ assignment: a, transition: t, timeline: l })
        .from(a)
        .innerJoin(t, eq(t.id, a.transition_id))
        .innerJoin(l, eq(l.id, t.timeline_id))
        .where(where)
        .orderBy(asc(a.id))
        .all();
};

/** Every assignment row of timeline `timelineId`, by row id. */
export const memberRows = (
    tx: DbTransaction,
    timelineId: number,
): Promise<MemberRow[]> =>
    memberRowsWhere(
        tx,
        eq(schema.timeline_transitions.timeline_id, timelineId),
    );

export const readTimeline = async (
    tx: DbTransaction,
    timelineId: number,
): Promise<DatabaseTimeline | undefined> =>
    await tx
        .select()
        .from(schema.timelines)
        .where(eq(schema.timelines.id, timelineId))
        .get();

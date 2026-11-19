import { asc, eq, inArray, sql } from "drizzle-orm";
import { schema } from "@/global/database/db";
import type { BasicRow } from "@/timeline/basicSimple";
import type { DbConnection, DbTransaction } from "./types";

/**
 * Every stored assignment with what Basic mode's simple predicate needs from its transition
 * (`BasicRow`, `basicSimple.ts`), by marcher, then start. With `marcherIds`, only theirs.
 */
export async function readBasicRows(
    db: DbConnection | DbTransaction,
    { marcherIds }: { marcherIds?: readonly number[] } = {},
): Promise<BasicRow[]> {
    const a = schema.timeline_assignments;
    const t = schema.timeline_transitions;
    const query = db
        .select({
            assignmentId: a.id,
            marcherId: a.marcher_id,
            transitionId: a.transition_id,
            slotIndex: a.slot_index,
            timelineId: t.timeline_id,
            start: a.start_beat,
            end: a.end_beat,
            layer: a.layer,
            slotCount: t.slot_count,
            shapeId: t.dest_shape_id,
            pathStyle: t.path_style,
            // v0.10: the row's slot walks a drawn path (a lane), whatever the style
            laned: sql<boolean>`EXISTS (SELECT 1 FROM timeline_lanes l WHERE l.transition_id = ${a.transition_id} AND l.slot_index = ${a.slot_index})`.mapWith(
                Boolean,
            ),
        })
        .from(a)
        .innerJoin(t, eq(a.transition_id, t.id));
    const filtered =
        marcherIds === undefined
            ? query
            : query.where(inArray(a.marcher_id, [...marcherIds]));
    return await filtered
        .orderBy(
            asc(a.marcher_id),
            asc(a.start_beat),
            asc(a.end_beat),
            asc(a.id),
        )
        .all();
}

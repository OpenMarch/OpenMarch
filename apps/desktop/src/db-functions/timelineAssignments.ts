import { eq, inArray } from "drizzle-orm";
import * as schema from "@om-electron/database/migrations/schema";
import { DbTransaction } from "./types";
import { mapDbErrors, refuse } from "./timelineErrors";

/** A row of `timeline_assignments`. */
export type DatabaseTimelineAssignment =
    typeof schema.timeline_assignments.$inferSelect;

export interface NewTimelineAssignmentArgs {
    marcherId: number;
    transitionId: number;
    slotIndex: number;
    startBeat: number;
    endBeat: number;
    /** Defaults to 0 */
    layer?: number;
}

export interface ModifiedTimelineAssignmentArgs {
    id: number;
    marcherId?: number;
    slotIndex?: number;
    startBeat?: number;
    endBeat?: number;
    layer?: number;
}

/**
 * Creates assignments. The database rejects one outside its transition's range or slots
 * (E-A1, E-A2), or one that overlaps another of the same marcher and layer (E-A3).
 */
export const createTimelineAssignmentsInTransaction = async ({
    newAssignments,
    tx,
}: {
    newAssignments: NewTimelineAssignmentArgs[];
    tx: DbTransaction;
}): Promise<DatabaseTimelineAssignment[]> => {
    if (newAssignments.length === 0) return [];
    const created: DatabaseTimelineAssignment[] = [];
    // One insert at a time, so each overlap check sees the ones before it
    for (const a of newAssignments) {
        const row = await mapDbErrors(() =>
            tx
                .insert(schema.timeline_assignments)
                .values({
                    marcher_id: a.marcherId,
                    transition_id: a.transitionId,
                    slot_index: a.slotIndex,
                    start_beat: a.startBeat,
                    end_beat: a.endBeat,
                    layer: a.layer ?? 0,
                })
                .returning()
                .get(),
        );
        created.push(row);
    }
    return created;
};

/**
 * Rows per multi-row INSERT in the bulk paths. Six values a row stays far below SQLite's limit of
 * 32,766 bound parameters, and the statement text stays small.
 */
export const BULK_INSERT_ROWS = 500;

/** Splits `rows` into chunks of at most `size`. */
export const chunked = <T>(
    rows: readonly T[],
    size = BULK_INSERT_ROWS,
): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < rows.length; i += size)
        chunks.push(rows.slice(i, i + size));
    return chunks;
};

/**
 * Creates assignments with chunked multi-row inserts and returns how many it inserted, without
 * reading the rows back. For large writes such as the page conversion (P9.8). SQLite inserts the
 * rows of one statement one at a time, so the row triggers still run for every row and each
 * check sees the rows before it: an overlap inside one chunk is refused like one across calls
 * (E-A1, E-A2, E-A3).
 */
export const insertTimelineAssignmentsBulkInTransaction = async ({
    newAssignments,
    tx,
}: {
    newAssignments: readonly NewTimelineAssignmentArgs[];
    tx: DbTransaction;
}): Promise<number> => {
    for (const chunk of chunked(newAssignments))
        await mapDbErrors(() =>
            tx
                .insert(schema.timeline_assignments)
                .values(
                    chunk.map((a) => ({
                        marcher_id: a.marcherId,
                        transition_id: a.transitionId,
                        slot_index: a.slotIndex,
                        start_beat: a.startBeat,
                        end_beat: a.endBeat,
                        layer: a.layer ?? 0,
                    })),
                )
                .run(),
        );
    return newAssignments.length;
};

export const updateTimelineAssignmentsInTransaction = async ({
    modifiedAssignments,
    tx,
}: {
    modifiedAssignments: ModifiedTimelineAssignmentArgs[];
    tx: DbTransaction;
}): Promise<DatabaseTimelineAssignment[]> => {
    const updated: DatabaseTimelineAssignment[] = [];
    for (const m of modifiedAssignments) {
        const set: Partial<typeof schema.timeline_assignments.$inferInsert> =
            {};
        if (m.marcherId !== undefined) set.marcher_id = m.marcherId;
        if (m.slotIndex !== undefined) set.slot_index = m.slotIndex;
        if (m.startBeat !== undefined) set.start_beat = m.startBeat;
        if (m.endBeat !== undefined) set.end_beat = m.endBeat;
        if (m.layer !== undefined) set.layer = m.layer;
        const row = await mapDbErrors(async () =>
            Object.keys(set).length === 0
                ? await tx
                      .select()
                      .from(schema.timeline_assignments)
                      .where(eq(schema.timeline_assignments.id, m.id))
                      .get()
                : await tx
                      .update(schema.timeline_assignments)
                      .set(set)
                      .where(eq(schema.timeline_assignments.id, m.id))
                      .returning()
                      .get(),
        );
        if (!row) refuse(`assignment ${m.id} does not exist`);
        updated.push(row);
    }
    return updated;
};

export const deleteTimelineAssignmentsInTransaction = async ({
    assignmentIds,
    tx,
}: {
    assignmentIds: Set<number>;
    tx: DbTransaction;
}): Promise<DatabaseTimelineAssignment[]> => {
    if (assignmentIds.size === 0) return [];
    return await mapDbErrors(() =>
        tx
            .delete(schema.timeline_assignments)
            .where(inArray(schema.timeline_assignments.id, [...assignmentIds]))
            .returning(),
    );
};

import { eq, inArray } from "drizzle-orm";
import * as schema from "@om-electron/database/migrations/schema";
import { DbTransaction } from "./types";
import { mapDbErrors, refuse } from "./timelineErrors";
import { deleteTimelineTransitionsInTransaction } from "./timelineTransitionsInTransaction";

/** A row of `timelines`. */
export type DatabaseTimeline = typeof schema.timelines.$inferSelect;

export interface NewTimelineArgs {
    name?: string | null;
    startBeat: number;
    endBeat: number;
}

export interface ModifiedTimelineArgs {
    id: number;
    name?: string | null;
    /**
     * A range that no longer contains the timeline's transitions is rejected (E-T1). It never
     * moves transitions.
     */
    startBeat?: number;
    endBeat?: number;
}

export const createTimelinesInTransaction = async ({
    newTimelines,
    tx,
}: {
    newTimelines: NewTimelineArgs[];
    tx: DbTransaction;
}): Promise<DatabaseTimeline[]> => {
    if (newTimelines.length === 0) return [];
    return await mapDbErrors(() =>
        tx
            .insert(schema.timelines)
            .values(
                newTimelines.map((t) => ({
                    name: t.name ?? null,
                    start_beat: t.startBeat,
                    end_beat: t.endBeat,
                })),
            )
            .returning(),
    );
};

export const updateTimelinesInTransaction = async ({
    modifiedTimelines,
    tx,
}: {
    modifiedTimelines: ModifiedTimelineArgs[];
    tx: DbTransaction;
}): Promise<DatabaseTimeline[]> => {
    const updated: DatabaseTimeline[] = [];
    for (const m of modifiedTimelines) {
        const set: Partial<typeof schema.timelines.$inferInsert> = {};
        if (m.name !== undefined) set.name = m.name;
        if (m.startBeat !== undefined) set.start_beat = m.startBeat;
        if (m.endBeat !== undefined) set.end_beat = m.endBeat;
        const row = await mapDbErrors(async () =>
            Object.keys(set).length === 0
                ? await tx
                      .select()
                      .from(schema.timelines)
                      .where(eq(schema.timelines.id, m.id))
                      .get()
                : await tx
                      .update(schema.timelines)
                      .set(set)
                      .where(eq(schema.timelines.id, m.id))
                      .returning()
                      .get(),
        );
        if (!row) refuse(`timeline ${m.id} does not exist`);
        updated.push(row);
    }
    return updated;
};

/**
 * Deletes timelines and everything under them, child first (C-1, P4.6): each timeline's
 * assignments and slot destinations, then its transitions, then the timeline. The foreign keys
 * are RESTRICT, and the history trigger logs rows in deletion order, so deleting a parent first
 * would break undo. Shapes are shared and are left alone. Missing ids are ignored.
 */
export const deleteTimelinesInTransaction = async ({
    timelineIds,
    tx,
}: {
    timelineIds: Set<number>;
    tx: DbTransaction;
}): Promise<DatabaseTimeline[]> => {
    if (timelineIds.size === 0) return [];
    const ids = [...timelineIds];
    const transitions = await tx
        .select({ id: schema.timeline_transitions.id })
        .from(schema.timeline_transitions)
        .where(inArray(schema.timeline_transitions.timeline_id, ids))
        .all();
    await deleteTimelineTransitionsInTransaction({
        transitionIds: new Set(transitions.map((t) => t.id)),
        tx,
    });
    return await mapDbErrors(() =>
        tx
            .delete(schema.timelines)
            .where(inArray(schema.timelines.id, ids))
            .returning(),
    );
};

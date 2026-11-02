import { inArray } from "drizzle-orm";
import {
    createResolver,
    type TimelineSnapshot,
    type XY,
} from "@openmarch/core";
import { schema } from "@/global/database/db";
import { shapeFromRow } from "@/timeline/timelineRows";
import type { DbTransaction } from "./types";
import type { DatabaseTimelineAssignment } from "./timelineAssignments";
import { removeAssignmentRowsInTransaction } from "./timelineMembership";
import { deleteTimelinesInTransaction, oldestOnSharedRange } from "./timelines";
import { dropUngroupedLeavers } from "./shapeRecipes";

/**
 * Two helpers the move writers share (`timelineMoves`, `timelinePointMoves`, `timelineUnset` and
 * the holds cuts in `timelineMoveCuts`), kept apart so those modules don't import each other.
 */

/**
 * The exact sample points of `shapeId` for `slotCount` slots (R-13), through the public resolver:
 * a throwaway show where marcher `i + 1` fills slot `i` of one direct transition. Arrivals are the
 * shape's own samples, bit for bit (spec R-13, P-7).
 */
export const sampleShape = (
    shape: typeof schema.timeline_shapes.$inferSelect,
    slotCount: number,
): XY[] => {
    const ids = Array.from({ length: slotCount }, (_, i) => i + 1);
    const snapshot: TimelineSnapshot = {
        marchers: ids.map((id) => ({ id, home: [0, 0] })),
        shapes: { [shape.id]: shapeFromRow(shape) },
        transitions: {
            1: {
                id: 1,
                start: 0,
                end: 1,
                dest: shape.id,
                slots: slotCount,
                style: "direct",
                order: "slot",
                params: null,
            },
        },
        assignments: ids.map((id) => ({
            id,
            marcher: id,
            transition: 1,
            slot: id - 1,
            start: 0,
            end: 1,
            layer: 0,
        })),
    };
    const resolver = createResolver(snapshot);
    return ids.map((id) => resolver.positionAt(id, 1));
};

/**
 * Deletes `rows` (marchers' own page moves, `ownPageMoves`) with their one-slot
 * transitions, and then each of their timelines that has no transition left, children first.
 *
 * With `tidyShared` (Basic's writes, whose rows may be slots of a converted page's shared
 * transition), a shared transition they leave is compacted (`compact`) and one they empty is
 * deleted, so the edit makes no vacant slot (D-VACANT). A vacancy already in the last slot, or in
 * a transition sharing a marcher with an inheriting follow-the-leader one, stays (`compact`).
 *
 * An emptied page timeline that a move split off it still shares the range with is kept, empty
 * (UI-25, `oldestOnSharedRange`). Ungrouped marks on the moves let go of `dropUngrouped`, the
 * marchers the edit clears off them (`dropUngroupedLeavers`).
 */
export const clearOwnPageMoves = async (
    tx: DbTransaction,
    rows: readonly DatabaseTimelineAssignment[],
    {
        tidyShared = false,
        dropUngrouped = [],
    }: {
        tidyShared?: boolean;
        /** The marchers cleared off these moves, who leave the moves' ungrouped marks */
        dropUngrouped?: readonly number[];
    } = {},
): Promise<void> => {
    if (rows.length === 0) return;
    const t = schema.timeline_transitions;
    const timelineIds = (
        await tx
            .selectDistinct({ id: t.timeline_id })
            .from(t)
            .where(
                inArray(
                    t.id,
                    rows.map((r) => r.transition_id),
                ),
            )
            .all()
    ).map((r) => r.id);
    await removeAssignmentRowsInTransaction({
        tx,
        removed: rows,
        compact: tidyShared,
        deleteEmptied: tidyShared,
    });
    // An Ungroup on a page they're cleared off no longer claims them (`dropUngroupedLeavers`)
    await dropUngroupedLeavers(tx, timelineIds, dropUngrouped);
    const left = new Set(
        (
            await tx
                .selectDistinct({ id: t.timeline_id })
                .from(t)
                .where(inArray(t.timeline_id, timelineIds))
                .all()
        ).map((r) => r.id),
    );
    const emptied = timelineIds.filter((id) => !left.has(id));
    await deleteTimelinesInTransaction({
        tx,
        timelineIds: new Set(emptied),
        // UI-25: the page's own timeline stays, empty, while a move split off it shares its
        // range, so that move doesn't become the page's
        keep: await oldestOnSharedRange(tx, emptied),
    });
};

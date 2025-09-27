import { DB, DBTransaction } from "../database/db";
import * as schema from "../../../electron/database/migrations/schema";
import { max, sql } from "drizzle-orm";
import { desc, not, inArray } from "drizzle-orm";
import { DbTransaction } from "@/db-functions";

type HistoryType = "undo" | "redo";

export async function incrementUndoGroup(orm: DBTransaction | DB) {
    orm.transaction(async (tx) => {
        return incrementHistoryGroupInTransaction(tx as DbTransaction, "undo");
    });
}

export const incrementHistoryGroupInTransaction = async (
    tx: DbTransaction,
    type: HistoryType,
) => {
    const historyTable =
        type === "undo" ? schema.history_undo : schema.history_redo;

    const groupLimitResult = await tx.select().from(schema.history_stats).get();
    const groupLimit = groupLimitResult?.group_limit ?? 500;

    const maxGroup = (await tx
        .select({
            max: sql`COALESCE(MAX(${historyTable.history_group}), 0) + 1`,
        })
        .from(historyTable)
        .get())!.max;

    const groupColumn = type === "undo" ? "cur_undo_group" : "cur_redo_group";

    await tx
        .update(schema.history_stats)
        .set({ [groupColumn]: maxGroup })
        .run();

    const recentGroupsQuery = tx
        .selectDistinct({ history_group: historyTable.history_group })
        .from(historyTable)
        .orderBy(desc(historyTable.history_group))
        .limit(groupLimit);

    // Delete all groups except the most recent group_limit groups
    await tx
        .delete(historyTable)
        .where(not(inArray(historyTable.history_group, recentGroupsQuery)))
        .run();

    return maxGroup;
};

/**
 *
 * @param tx - The database transaction
 * @param type - The type of history to get the current group for
 * @param checkMax - Whether to check if the real max group and the stats max group match. This will be slower.
 * @returns The current history group for the given type
 */
export const getCurrentHistoryGroup = async (
    tx: DbTransaction,
    type: HistoryType,
    checkMax = false,
): Promise<number> => {
    const historyTable =
        type === "undo" ? schema.history_undo : schema.history_redo;

    let realMaxGroup = null;
    if (checkMax) {
        const result = await tx
            .select({
                maxGroup: max(historyTable.history_group),
            })
            .from(historyTable)
            .get();
        realMaxGroup = result?.maxGroup;
    }

    const statsResult = await tx
        .select({
            statsMaxGroup:
                schema.history_stats[
                    type === "undo" ? "cur_undo_group" : "cur_redo_group"
                ],
        })
        .from(schema.history_stats)
        .get();
    const statsMaxGroup = statsResult?.statsMaxGroup;

    if (
        checkMax &&
        (statsMaxGroup !== realMaxGroup ||
            statsMaxGroup == null ||
            realMaxGroup == null)
    )
        console.warn(
            `Real max group ${realMaxGroup} and stats max group ${statsMaxGroup} do not match`,
        );

    return statsMaxGroup ?? 0;
};

import { DB, DBTransaction } from "../database/db";
import * as schema from "../../../electron/database/migrations/schema";
import { sql } from "drizzle-orm";
import { desc, not, inArray } from "drizzle-orm";

type HistoryType = "undo" | "redo";

export async function incrementUndoGroup(orm: DBTransaction | DB) {
    return incrementGroup(orm, "undo");
}

async function incrementGroup(orm: DBTransaction | DB, type: HistoryType) {
    const historyTable =
        type === "undo" ? schema.history_undo : schema.history_redo;

    return orm.transaction(async (tx) => {
        const groupLimit = (await tx
            .select({ group_limit: schema.history_stats.group_limit })
            .from(schema.history_stats)
            .get())!.group_limit;

        const maxGroup = (await tx
            .select({
                max: sql`COALESCE(MAX(${historyTable.history_group}), 0) + 1`,
            })
            .from(historyTable)
            .get())!.max;

        const groupColumn =
            type === "undo" ? "cur_undo_group" : "cur_redo_group";

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
    });
}

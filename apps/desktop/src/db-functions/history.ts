import {
    incrementHistoryGroupInTransaction,
    getCurrentHistoryGroup,
} from "@/global/classes/History";
import { assert } from "@/utilities/utils";
import { DbConnection, DbTransaction } from "./types";
import { count, max } from "drizzle-orm";
import { schema } from "@/global/database/db";

/**
 * Runs a function in a transaction with undo/redo history tracking.
 *
 * @param db - The database connection
 * @param funcName - The name of the function to run in the transaction. This is for  logging.
 * @param func - The function to run in the transaction
 * @returns The result of the function
 */
export const transactionWithHistory = async <T>(
    db: DbConnection,
    funcName: string,
    func: (tx: DbTransaction) => Promise<T>,
): Promise<T> => {
    return await db.transaction(async (tx) => {
        console.log(`=========== start ${funcName} ============`);
        try {
            await incrementHistoryGroupInTransaction(tx, "undo");
            let groupBefore = (
                await tx.query.history_stats.findFirst({
                    columns: {
                        cur_undo_group: true,
                    },
                })
            )?.cur_undo_group;

            if (!groupBefore) {
                const currentUndoElements = await tx
                    .select({ count: count() })
                    .from(schema.history_undo)
                    .get();
                assert(
                    currentUndoElements != null,
                    "Current undo elements is undefined",
                );
                if (currentUndoElements.count > 0) {
                    const maxGroup = await tx
                        .select({ max: max(schema.history_undo.history_group) })
                        .from(schema.history_undo)
                        .get();
                    assert(maxGroup != null, "Max group is undefined");
                    groupBefore = maxGroup.max ?? 0;
                }
            } else {
                assert(groupBefore != null, "Group before is undefined");
            }

            // Execute the function
            const result = await func(tx);

            const historyRows = await tx
                .select()
                .from(schema.history_undo)
                .all();
            console.log("historyRows", historyRows);
            const groupAfter = (
                await tx
                    .select({ max: max(schema.history_undo.history_group) })
                    .from(schema.history_undo)
                    .get()
            )?.max;

            // Ensure that the group was not changed by the function
            // This is important to ensure predictable undo/redo behavior
            assert(groupAfter != null, "Group after is undefined");
            assert(
                groupBefore === groupAfter,
                `Group before and after do not match. Expected ${groupBefore} but got ${groupAfter}`,
            );
            await incrementHistoryGroupInTransaction(tx, "undo");

            const groupAfterIncremented = await getCurrentHistoryGroup(
                tx,
                "undo",
            );

            // Ensure that the group was incremented by the function
            // This is important to ensure predictable undo/redo behavior
            assert(
                groupAfterIncremented === groupBefore + 1,
                `Group after incremented does not match. Expected ${groupBefore + 1} but got ${groupAfterIncremented}`,
            );
            // NOTE - the group will not be incremented if no database action was performed in the 'func' callback

            return result;
        } finally {
            console.log(`=========== end ${funcName} ============\n`);
        }
    });
};

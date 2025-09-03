import {
    incrementHistoryGroupInTransaction,
    getCurrentHistoryGroup,
} from "@/global/classes/History";
import { assert } from "@/utilities/utils";
import { DbConnection, DbTransaction } from "./types";

/**
 * Runs a function in a transaction with undo/redo history tracking.
 *
 * @param db - The database connection
 * @param func - The function to run in the transaction
 * @returns The result of the function
 */
export const transactionWithHistory = async <T>(
    db: DbConnection,
    func: (tx: DbTransaction) => Promise<T>,
): Promise<T> => {
    return await db.transaction(async (tx) => {
        await incrementHistoryGroupInTransaction(tx, "undo");
        const groupBefore = (
            await tx.query.history_stats.findFirst({
                columns: {
                    cur_undo_group: true,
                },
            })
        )?.cur_undo_group;

        assert(groupBefore != null, "Group before is undefined");

        // Execute the function
        const result = await func(tx);

        const groupAfter = (
            await tx.query.history_stats.findFirst({
                columns: {
                    cur_undo_group: true,
                },
            })
        )?.cur_undo_group;

        // Ensure that the group was not changed by the function
        // This is important to ensure predictable undo/redo behavior
        assert(groupAfter != null, "Group after is undefined");
        assert(
            groupBefore === groupAfter,
            `Group before and after do not match. Expected ${groupBefore} but got ${groupAfter}`,
        );
        await incrementHistoryGroupInTransaction(tx, "undo");

        const groupAfterIncremented = await getCurrentHistoryGroup(tx, "undo");

        // Ensure that the group was incremented by the function
        // This is important to ensure predictable undo/redo behavior
        assert(
            groupAfterIncremented === groupBefore + 1,
            `Group after incremented does not match. Expected ${groupBefore + 1} but got ${groupAfterIncremented}`,
        );
        // NOTE - the group will not be incremented if no database action was performed in the 'func' callback

        return result;
    });
};

import {
    incrementHistoryGroupInTransaction,
    getCurrentHistoryGroup,
} from "../global/classes/History";
import { assert } from "../utilities/assert";
import { mainProcessLog } from "../utilities/mainProcessLog";
import { DbConnection, DbTransaction } from "./types";
import { asc, lt, max } from "drizzle-orm";
import { DB, schema } from "../global/database/db";
import { Constants } from "../global/Constants";
import { getTableName, gt, sql, eq, desc, count, inArray } from "drizzle-orm";
import { tableNamesToQueryKeys } from "../hooks/queries/utils";
import type { ChangeBatch } from "@openmarch/core";
import {
    checkAndDrainTimelineChangesInTransaction,
    emitTimelineChange,
    notifyTimelineBatch,
} from "./timelineChanges";
import { timelineHistoryFocus, timelineModeOn } from "./timelineHistoryFocus";
import { isPageEraFrozenError } from "./pageEraFreezeMarker";
import {
    bumpTimelineDisplayVersion,
    historyStatementTable,
    touchesTimelineDisplayTables,
    undoGroupTouchesDisplayTables,
} from "./timelineDisplay";
import { createTriggers, type HistoryType } from "./historyTriggers";

export {
    buildHistoryTriggerSql,
    createAllUndoTriggers,
    createUndoTriggers,
    dropAllUndoTriggers,
    dropUndoTriggers,
} from "./historyTriggers";

let transactionWithHistoryTail = Promise.resolve<void>(undefined);

const withTransactionWithHistoryLock = async <T>(
    operation: () => Promise<T>,
): Promise<T> => {
    const run = transactionWithHistoryTail.then(operation);
    transactionWithHistoryTail = run.then(
        () => undefined,
        () => undefined,
    );
    return run;
};

/**
 * Runs `operation` while no wrapped write (an edit, undo, redo or change-log reset) is running.
 * Wrapped writes deliver their timeline batches before releasing this lock, so a read made under
 * it sees exactly the state after every batch delivered so far, and no later one. The timeline
 * resolver host reads its cold build this way. Never call it from inside a wrapped write: it
 * would wait for itself.
 */
export const withTimelineWriteLock = <T>(
    operation: () => Promise<T>,
): Promise<T> => withTransactionWithHistoryLock(operation);

const historyChangeListeners = new Set<() => void>();

/**
 * Calls `listener` after every committed undoable edit, undo and redo, until the returned function
 * unsubscribes it. A toast whose action undoes one edit (UI-14's delete toast) closes on the next
 * change, so its Undo can't undo something else.
 */
export function subscribeHistoryChanges(listener: () => void): () => void {
    historyChangeListeners.add(listener);
    return () => historyChangeListeners.delete(listener);
}

function notifyHistoryChange(): void {
    for (const listener of [...historyChangeListeners]) {
        try {
            listener();
        } catch (error) {
            console.error("A history change listener failed", error);
        }
    }
}

/**
 * Runs a function in a transaction with undo/redo history tracking.
 *
 * This function will group all of the database actions performed inside of it into a single undo/redo group.
 * Using a regular transaction will cause each database action to be its own undo/redo event.
 *
 * It is also the spec §6 write wrapper for the timeline tables: after `func`, it rejects the whole
 * edit if `timeline_commit_violations` returns any row, then drains `timeline_change_log` in the
 * same transaction. Once the transaction commits, and before the next queued write starts, the
 * drained batch goes to the `subscribeTimelineChanges` listeners. A failed edit delivers nothing.
 *
 * @param db - The database connection
 * @param funcName - The name of the function to run in the transaction. This is for  logging.
 * @param func - The function to run in the transaction
 * @returns The result of the function
 */
// eslint-disable-next-line max-lines-per-function
export const transactionWithHistory = async <T>(
    db: DbConnection,
    funcName: string,
    func: (tx: DbTransaction) => Promise<T>,
): Promise<T> => {
    // eslint-disable-next-line max-lines-per-function
    async function runLockedTransactionWithHistory(): Promise<T> {
        let drained: ChangeBatch | undefined;
        let touchedDisplayTables = false;
        // eslint-disable-next-line max-lines-per-function
        const output = await db.transaction(async (tx) => {
            const startMessage = `=========== start ${funcName} ============`;
            let result: T;
            if (window.electron)
                void window.electron?.log("info", startMessage);
            // eslint-disable-next-line no-console
            else console.log(startMessage);
            let error: Error | undefined;

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
                            .select({
                                max: max(schema.history_undo.history_group),
                            })
                            .from(schema.history_undo)
                            .get();
                        assert(maxGroup != null, "Max group is undefined");
                        groupBefore = maxGroup.max ?? 0;
                    }
                }
                assert(groupBefore != null, "Group before is undefined");

                // Execute the function
                result = await func(tx);

                const groupAfter =
                    (
                        await tx
                            .select({
                                max: max(schema.history_undo.history_group),
                            })
                            .from(schema.history_undo)
                            .get()
                    )?.max ??
                    (
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
                    `Group before and after do not match. Expected ${groupBefore} but got ${groupAfter}.
                    ${
                        groupBefore > groupAfter
                            ? "The expected group is greater, meaning that the function didn't perform any database actions on tables that are tracked by undo/redo history triggers"
                            : "Group after is greater than the expected. This means that the function incremented the group number after performing database actions. This will cause these actions to be treated separately in the undo/redo history"
                    }`,
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
                    `Undo group after incrementing is not correct. This often happens when we expect an action to be performed in the database during the test that increments the history group, but it did not. Expected group to be '${groupBefore + 1}', but it was '${groupAfterIncremented}'`,
                );
                // NOTE - the group will not be incremented if no database action was performed in the 'func' callback
                /**
                 * If you're getting this error, here's a quick checklist to validate:
                 *    - Are there triggers for the table that the function is performing actions on?
                 *    - Do the functions actually perform actions on the database?
                 */

                // Spec §6: commit-time invariants, then drain the change log
                drained = await checkAndDrainTimelineChangesInTransaction(tx);

                // P7.15: edits the change log doesn't carry still refresh the views that read rows
                touchedDisplayTables = await undoGroupTouchesDisplayTables(
                    tx,
                    groupBefore,
                );
            } catch (err: any) {
                // Remove the items from the history tables that were added by the transaction
                error = err as Error;
                console.debug("Rolling back history state");
            } finally {
                const endMessage = `=========== end ${funcName} ============\n`;
                mainProcessLog("info", endMessage);
            }
            if (error) throw error;

            return result!;
        });
        // Only reached once the transaction has committed
        notifyTimelineBatch(drained);
        if (touchedDisplayTables) bumpTimelineDisplayVersion();
        notifyHistoryChange();
        return output;
    }

    return withTransactionWithHistoryLock(runLockedTransactionWithHistory);
};

/**
 * Response from the history table after performing an undo or redo action.
 */
export type HistoryResponse = {
    /**
     * True if the action was successful.
     */
    success: boolean;
    /**
     * The name of the tables that were modified.
     */
    tableNames: Set<string>;
    /**
     * The SQL statements that were executed to perform the undo or redo action.
     */
    sqlStatements: string[];
    /**
     * The error that occurred when performing the action.
     */
    error?: { message: string; stack: string };
    /**
     * The timeline change batch the action committed (empty or absent when it changed no
     * timeline rows).
     */
    timelineBatch?: ChangeBatch;
    /**
     * True when the page-era freeze (P9.5) refused the action's replay. The group can never be
     * applied in timeline mode, so it was removed from its stack; nothing else changed.
     */
    skippedFrozenGroup?: boolean;
};

/**
 * A row in the history stats table.
 */
export type HistoryStatsRow = {
    /** useless id */
    readonly id: 1;
    /**
     * The current undo group the undo stack is on.
     * When adding a new records to the undo table, this number is used to group the records together.
     *
     * To separate different undo groups, increment this number.
     * It is automatically decremented when performing an undo action.
     */
    cur_undo_group: number;
    /**
     * The current redo group the undo stack is on.
     * When adding a new records to the redo table, this number is used to group the records together.
     *
     * This should never be adjusted manually.
     * It is automatically incremented/decremented automatically when performing an undo action.
     */
    cur_redo_group: number;
    /**
     * The maximum number of undo groups to keep in the history table.
     *
     * If this number is positive, the oldest undo group is deleted when the number of undo groups exceeds this limit.
     * If this number is negative, there is no limit to the number of undo groups.
     */
    group_limit: number;
};

/**
 * A row in the undo or redo history table.
 */
export type HistoryTableRow = {
    /**
     * The sequence number of the action in the history table.
     * Primary key of the table.
     */
    sequence: number;
    /**
     * The group number of the action in the history table.
     * This is used to group actions together and is taken from the history stats table.
     *
     * To separate different groups of actions, increment the number in the history stats table.
     */
    history_group: number;
    /**
     * The SQL statement to undo or redo the action.
     */
    sql: string;
};

/**
 * Increment the undo group in the database to create a new group for undo history.
 *
 * This will always return 1 + the max group number in the undo history table.
 *
 * @param db The database connection
 * @returns the new undo group number
 */
export async function incrementUndoGroup(db: DbConnection | DB) {
    return await incrementGroup(db, "undo");
}

/**
 * Performs an undo action on the database.
 *
 * Undo history is collected based on triggers that are created for each table in the database if desired.
 * Does nothing if there is nothing on the undo stack.
 *
 * @param db the database connection
 * @returns the response from the undo action
 */
export async function performUndo(db: DbConnection | DB) {
    return await executeHistoryAction(db, "undo");
}

/**
 * Performs redo action on the database.
 *
 * Redo history is collected based on performed undo actions.
 * The redo stack is cleared after a new action is entered into the undo stack.
 * Does nothing if there is nothing on the redo stack.
 *
 * @param db the database connection
 * @returns the response from the redo action
 */
export async function performRedo(db: DbConnection | DB) {
    return await executeHistoryAction(db, "redo");
}

/**
 * Increment the group number for either the undo or redo history table.
 *
 * This is done by getting the max group number from the respective history table and incrementing it by 1.
 *
 * @param db database connection
 * @param type "undo" or "redo"
 * @returns The new group number for the respective history table
 */
async function incrementGroup(
    db: DbConnection | DbTransaction,
    type: HistoryType,
) {
    const historyTable =
        type === "undo" ? schema.history_undo : schema.history_redo;

    // Get the max group number from the respective history table
    const maxGroupResult = await db
        .select({ current_group: max(historyTable.history_group) })
        .from(historyTable)
        .get();
    const maxGroup = maxGroupResult?.current_group || 0;

    const groupString = type === "undo" ? "cur_undo_group" : "cur_redo_group";
    const newGroup = maxGroup + 1;
    await db
        .update(schema.history_stats)
        .set({ [groupString]: newGroup })
        .run();

    const groupLimitResult = await db
        .select({ group_limit: schema.history_stats.group_limit })
        .from(schema.history_stats)
        .get();
    const groupLimit = groupLimitResult?.group_limit || -1;

    // If the group limit is positive and is reached, delete the oldest group
    if (groupLimit > 0) {
        const distinctGroupIds = await db
            .selectDistinct({ history_group: historyTable.history_group })
            .from(historyTable)
            .orderBy(asc(historyTable.history_group))
            .all();

        if (distinctGroupIds.length > groupLimit) {
            // Delete all of the groups that are older than the group limit
            const groupIdLt =
                distinctGroupIds[distinctGroupIds.length - groupLimit]
                    .history_group;
            await db
                .delete(historyTable)
                .where(lt(historyTable.history_group, groupIdLt))
                .run();
        }
    }

    return newGroup;
}

/**
 * Refresh the current both the undo and redo group number in the history stats table
 * to max(group) + 1 of the respective history table.
 *
 * @param db database connection
 * @param type "undo" or "redo"
 */
async function refreshCurrentGroups(db: DbConnection | DbTransaction) {
    const refreshCurrentGroup = async (type: HistoryType) => {
        const tableName =
            type === "undo" ? schema.history_undo : schema.history_redo;
        const groupColumn =
            type === "undo" ? "cur_undo_group" : "cur_redo_group";
        const currentGroupResponse = await db
            .select({ max_group: max(tableName.history_group) })
            .from(tableName)
            .get();

        const currentGroup = currentGroupResponse?.max_group ?? 0;

        // TODO, why was this here?
        // if (currentGroup === 0) {
        //     // Double check that there is nothing in the history table
        //     const countResponse = await db
        //         .select({ count: count(tableName.history_group) })
        //         .from(tableName)
        //         .get();
        //     const countAmount = countResponse?.count ?? 0;
        //     if (countAmount > 0) {
        //         throw new Error(
        //             `There are ${countAmount} rows in the ${type} history table`,
        //         );
        //     }
        // }

        await db.run(
            sql.raw(`
            UPDATE ${Constants.HistoryStatsTableName} SET "${groupColumn}"=${
                currentGroup + 1
            };
        `),
        );
    };

    await refreshCurrentGroup("undo");
    await refreshCurrentGroup("redo");
}

/**
 * Switch the triggers to either undo or redo mode.
 * This is so when performing an undo action, the redo history is updated and vice versa.
 *
 * It runs inside the undo or redo's own transaction (`db` is the transaction), so the switch,
 * the replay and the switch back commit together: one commit (one sync to disk) instead of one
 * per trigger statement, and a failure part way rolls the switch back with everything else.
 *
 * @param db The transaction
 * @param mode The mode to switch to, either "undo" or "redo"
 * @param deleteRedoRows true if the redo rows should be deleted when inserting new undo rows.
 */
const switchTriggerModeInTransaction = async (
    db: DbTransaction,
    mode: HistoryType,
    deleteRedoRows: boolean,
    tableNames?: Set<string>,
) => {
    mainProcessLog("info", `------ Switching triggers to ${mode} mode ------`);
    // assert that the table names, if provided, are all valid tables in the database
    if (tableNames) {
        for (const tableName of tableNames) {
            const table = await db.get(
                sql.raw(
                    `SELECT * FROM sqlite_master WHERE name='${tableName}'`,
                ),
            );
            if (!table) {
                throw new Error(`Table ${tableName} does not exist`);
            }
        }
    }
    let sqlQuery = `SELECT "name", "tbl_name" FROM sqlite_master WHERE type='trigger' AND ("name" LIKE '%$_ut' ESCAPE '$' OR "name" LIKE  '%$_it' ESCAPE '$' OR "name" LIKE  '%$_dt' ESCAPE '$')`;
    if (tableNames) {
        sqlQuery += ` AND tbl_name IN (${Array.from(tableNames)
            .map((t) => `'${t}'`)
            .join(",")})`;
    }
    sqlQuery += ";";

    // TODO TEST THIS
    const existingTriggersResponse = await db.all(sql.raw(sqlQuery));
    type ExistingTriggers = {
        name: string;
        tbl_name: string;
    }[];
    let existingTriggers: ExistingTriggers = [];
    if (existingTriggersResponse.length > 0) {
        if (Array.isArray(existingTriggersResponse[0])) {
            existingTriggers = (
                existingTriggersResponse as unknown as string[][]
            ).map((t) => {
                return {
                    name: t[0],
                    tbl_name: t[1],
                };
            });
        } else {
            existingTriggers = existingTriggersResponse as ExistingTriggers;
        }
    }

    // as {
    //     name: string;
    //     tbl_name: string;
    // }[];
    mainProcessLog("info", "Existing triggers", existingTriggers);
    const tables = tableNames
        ? new Set(tableNames)
        : new Set(existingTriggers.map((t) => t.tbl_name));
    for (const trigger of existingTriggers) {
        await db.run(sql.raw(`DROP TRIGGER IF EXISTS ${trigger.name};`));
    }
    for (const table of tables) {
        await createTriggers(db, table, mode, deleteRedoRows, true);
    }
    mainProcessLog(
        "info",
        `------ Done switching triggers to ${mode} mode ------`,
    );
};

/** An error's message followed by the messages of its causes (SQLite's reason is often a cause). */
const messageWithCauses = (err: unknown): string => {
    const messages: string[] = [];
    for (let e: unknown = err; e instanceof Error; e = e.cause)
        if (e.message) messages.push(e.message);
    if (messages.length === 0 && err != null) messages.push(String(err));
    return messages.join("\nCaused by: ");
};

/**
 * Performs an undo or redo action on the database.
 *
 * Undo/redo history is collected based on triggers that are created for each table in the database if desired.
 *
 * @param db the database connection
 * @param type either "undo" or "redo"
 */
function executeHistoryAction(
    db: DbConnection,
    type: HistoryType,
): Promise<HistoryResponse> {
    // Queue with wrapped edits, so batches reach listeners in commit order and no edit runs
    // while the history triggers are switched to the other mode
    return withTransactionWithHistoryLock(() =>
        executeHistoryActionUnlocked(db, type),
    );
}

// eslint-disable-next-line max-lines-per-function
async function executeHistoryActionUnlocked(
    db: DbConnection,
    type: HistoryType,
): Promise<HistoryResponse> {
    mainProcessLog(
        "info",
        `\n============ PERFORMING ${type.toUpperCase()} ============`,
    );
    let response: HistoryResponse = {
        success: false,
        tableNames: new Set(),
        sqlStatements: [],
        error: { message: "No error to show", stack: "No stack to show" },
    };
    try {
        const tableName =
            type === "undo"
                ? Constants.UndoHistoryTableName
                : Constants.RedoHistoryTableName;
        const table =
            type === "undo" ? schema.history_undo : schema.history_redo;
        const currentGroupResult = await db
            .select({ max_group: max(table.history_group) })
            .from(table)
            .get();
        const currentGroup = currentGroupResult?.max_group ?? 0;

        // Get all of the SQL statements in the current undo group
        // const getSqlStatements = async (group: number) =>
        //     (
        //         (await db.all(
        //             sql.raw(`
        //             SELECT sql FROM
        //             ${
        //                 type === "undo"
        //                     ? Constants.UndoHistoryTableName
        //                     : Constants.RedoHistoryTableName
        //             }
        //             WHERE "history_group"=${group} ORDER BY sequence DESC;
        //         `),
        //         )) as HistoryTableRow[]
        //     ).map((row) => row.sql);
        const sqlStatements = (
            await db
                .select({ sql: table.sql })
                .from(table)
                .where(eq(table.history_group, currentGroup))
                .orderBy(desc(table.sequence))
                .all()
        ).map((row) => row.sql);

        // sqlStatements = await getSqlStatements(currentGroup);
        if (sqlStatements.length === 0) {
            mainProcessLog("info", "No actions to " + type);
            console.debug("No actions to " + type);
            await refreshCurrentGroups(db);
            return {
                success: true,
                tableNames: new Set(),
                sqlStatements: [],
            };
        }

        const tableNames = new Set<string>();
        for (const sql of sqlStatements) {
            const tableName = historyStatementTable(sql);
            if (tableName) {
                tableNames.add(tableName);
            }
        }

        let error: Error | undefined;
        let committedBatch: ChangeBatch | undefined;
        try {
            // Temporarily disable foreign key checks (a no-op inside a transaction, so first)
            await db.run(sql.raw("PRAGMA foreign_keys = OFF;"));

            // Every write of the action is in one transaction, so a rejected undo or redo rolls
            // back and leaves the data, both stacks and the triggers unchanged (spec §6.1): the
            // switch of the triggers to the other stack, the new redo group and its pruning, the
            // replay, the removal of the replayed group, the group refresh and the switch back
            const drained = await db.transaction(async (tx) => {
                // Switch the triggers so that the replay's inverses go to the other stack. In
                // undo mode, don't clear the redo table while redoing.
                if (type === "undo")
                    await switchTriggerModeInTransaction(
                        tx,
                        "redo",
                        false,
                        tableNames,
                    );
                else
                    await switchTriggerModeInTransaction(
                        tx,
                        "undo",
                        false,
                        tableNames,
                    );

                // The redo triggers log the undo's inverses under this new group
                if (type === "undo") await incrementGroup(tx, "redo");

                // Execute all of the SQL statements in the current history group
                for (const sqlStatement of sqlStatements)
                    await tx.run(sqlStatement);

                // Delete all of the SQL statements in the current history group
                await tx.run(
                    sql.raw(
                        `DELETE FROM ${tableName} WHERE "history_group"=${currentGroup};`,
                    ),
                );
                // Refresh the current group number in the history stats table
                await refreshCurrentGroups(tx);

                // Undo and redo are edits (spec §6.1, C-6): the same commit-time check and
                // change-log drain as `transactionWithHistory`
                const batch =
                    await checkAndDrainTimelineChangesInTransaction(tx);

                // Switch the triggers back to undo mode, deleting the redo rows when new undo
                // rows come in
                await switchTriggerModeInTransaction(
                    tx,
                    "undo",
                    true,
                    tableNames,
                );
                return batch;
            });
            committedBatch = drained;
        } catch (err: any) {
            error = err;
        } finally {
            // Re-enable foreign key checks
            await db.run(sql.raw("PRAGMA foreign_keys = ON;"));
        }

        if (error) {
            // The page-era freeze (P9.5) refused the replay: a group that writes frozen page-era
            // rows can never be applied in timeline mode. Drop it from its stack (the rolled-back
            // transaction left no counterpart on the other stack), so it doesn't stay on top.
            if (isPageEraFrozenError(error)) {
                await db.transaction(async (tx) => {
                    await tx.run(
                        sql.raw(
                            `DELETE FROM ${tableName} WHERE "history_group"=${currentGroup};`,
                        ),
                    );
                    await refreshCurrentGroups(tx);
                });
                mainProcessLog(
                    "warn",
                    `Skipped ${type} group ${currentGroup}: it writes page-era rows, which are frozen in timeline mode`,
                );
                return {
                    success: false,
                    tableNames: new Set(),
                    sqlStatements: [],
                    skippedFrozenGroup: true,
                    error: {
                        message: messageWithCauses(error),
                        stack: error.stack ?? "Failed to get stack",
                    },
                };
            }
            throw error;
        }

        // The action has committed; deliver its batch
        notifyTimelineBatch(committedBatch);
        if (touchesTimelineDisplayTables(tableNames))
            bumpTimelineDisplayVersion();
        notifyHistoryChange();

        response = {
            success: true,
            tableNames,
            sqlStatements,
            timelineBatch: committedBatch,
        };
    } catch (err: any) {
        console.error(err);
        mainProcessLog("error", err);
        response = {
            success: false,
            tableNames: new Set(),
            sqlStatements: [],
            error: {
                message: messageWithCauses(err) || "failed to get error",
                stack: err?.stack || "Failed to get stack",
            },
        };
    } finally {
        mainProcessLog(
            "info",
            `============ FINISHED ${type.toUpperCase()} =============\n`,
        );
    }

    return response;
}

/**
 * Clears `timeline_change_log` and tells the listeners to cold-build (ADR 0001 §5). Call it when a
 * file is opened, and after any write that bypasses the wrapper (migrations, repair, conversion),
 * so rows those writes logged are never delivered as part of a later edit's batch.
 *
 * @param db database connection
 */
export async function resetTimelineChangeLog(db: DbConnection | DB) {
    await withTransactionWithHistoryLock(async () => {
        await db.delete(schema.timeline_change_log).run();
        emitTimelineChange({ kind: "reset" });
    });
}

/**
 * Clear the most recent redo actions from the most recent group.
 *
 * This should be used when there was an error that required changes to be
 * rolled back but the redo history should not be kept.
 *
 * @param db database connection
 */
export async function clearMostRecentRedo(db: DbConnection | DB) {
    mainProcessLog("info", `-------- Clearing most recent redo --------`);
    const maxGroupResult = (await db.get(sql`
        SELECT MAX(history_group) as max_redo_group FROM ${Constants.RedoHistoryTableName}
    `)) as { max_redo_group: number };
    const maxGroup = maxGroupResult.max_redo_group;
    await db.run(sql`
        DELETE FROM ${Constants.RedoHistoryTableName} WHERE history_group = ${maxGroup}
    `);
    mainProcessLog("info", `-------- Done clearing most recent redo --------`);
}

/**
 * @param db database connection
 * @returns The current undo group number in the history stats table
 */
export async function getCurrentUndoGroup(db: DbConnection | DB) {
    const result = await db.query.history_stats.findFirst({
        columns: {
            cur_undo_group: true,
        },
    });
    return result?.cur_undo_group ?? 0;
}

/**
 * @param db database connection
 * @returns The current redo group number in the history stats table
 */
export async function getCurrentRedoGroup(db: DbConnection | DB) {
    const result = await db.query.history_stats.findFirst({
        columns: {
            cur_redo_group: true,
        },
    });
    return result?.cur_redo_group ?? 0;
}

export async function getUndoStackLength(db: DbConnection): Promise<number> {
    const result = await db
        .select({ count: count() })
        .from(schema.history_undo)
        .get();
    return result?.count ?? 0;
}

export async function getRedoStackLength(db: DbConnection): Promise<number> {
    const result = await db
        .select({ count: count() })
        .from(schema.history_redo)
        .get();
    return result?.count ?? 0;
}

/**
 * Decrement all of the undo actions in the most recent group down by one.
 *
 * This should be used when a database action should not create its own group, but the group number
 * was incremented to allow for rolling back changes due to error.
 *
 * @param db database connection
 */
export async function decrementLastUndoGroup(db: DbConnection | DB) {
    mainProcessLog("info", `-------- Decrementing last undo group --------`);
    const maxGroupResult = (await db.get(sql`
        SELECT MAX(history_group) as max_undo_group FROM ${Constants.UndoHistoryTableName}
    `)) as { max_undo_group: number };
    const maxGroup = maxGroupResult.max_undo_group;

    const previousGroupResult = (await db.get(sql`
        SELECT MAX(history_group) as previous_group FROM ${Constants.UndoHistoryTableName} WHERE history_group < ${maxGroup}
    `)) as { previous_group: number };
    const previousGroup = previousGroupResult.previous_group;

    if (previousGroup) {
        await db.run(sql`
            UPDATE ${Constants.UndoHistoryTableName} SET history_group = ${previousGroup} WHERE history_group = ${maxGroup}
        `);
        await db.run(sql`
            UPDATE ${Constants.HistoryStatsTableName} SET cur_undo_group = ${previousGroup}
        `);
    }
    mainProcessLog(
        "info",
        `-------- Done decrementing last undo group --------`,
    );
}

/**
 * Flatten all of the undo groups above the given group number.
 *
 * This is used when subsequent undo groups are created, but they should be part of the same group.
 *
 * @param db database connection
 * @param group the group number to flatten above
 */
export async function flattenUndoGroupsAbove(
    db: DbConnection | DB,
    group: number,
) {
    mainProcessLog(
        "info",
        `-------- Flattening undo groups above ${group} --------`,
    );
    await db
        .update(schema.history_undo)
        .set({ history_group: group })
        .where(gt(schema.history_undo.history_group, group));
    mainProcessLog(
        "info",
        `-------- Done flattening undo groups above ${group} --------`,
    );
}

/**
 * Calculate the size of the undo and redo history tables in bytes.
 *
 * @param db database connection
 * @returns the size of the undo and redo history tables in bytes
 */
/**
 * Calculate the approximate size of the undo and redo history tables in bytes.
 * This method estimates size based on row count and average row size.
 *
 * @param db database connection
 * @returns the estimated size of the undo and redo history tables in bytes
 */
export async function calculateHistorySize(db: DbConnection | DB) {
    // Get average SQL statement length
    const getSqlLength = async (tableName: string): Promise<number> => {
        const rows = (await db.all(
            sql.raw(`SELECT sql FROM ${tableName}`),
        )) as string[][];

        if (rows.length === 0) return 0;

        const totalLength = rows.reduce(
            (sum, row) => sum + (row[0]?.length ?? 0),
            0,
        );
        return totalLength;
    };

    const undoAvgLength = await getSqlLength(Constants.UndoHistoryTableName);
    const redoAvgLength = await getSqlLength(Constants.RedoHistoryTableName);

    // Estimate size: row count * (avg SQL length + overhead for other columns)
    // Assuming 2 bytes per character for SQL
    const undoSize = undoAvgLength * 2;
    const redoSize = redoAvgLength * 2;

    return undoSize + redoSize;
}

/**
 * Retrieves the table name from an SQL statement.
 * Assumes the table name is surrounded by double quotes. E.g.`UPDATE "table_name"`
 *
 * @param sql The SQL statement to get the table name from
 * @returns The table name from the SQL statement
 */
const tableNameFromSql = (sql: string): string => {
    return sql.match(/"(.*?)"/)?.[0].replaceAll('"', "") || "";
};

/**
 * Get the action from an SQL statement used in the history table.
 * Only "UPDATE", "DELETE", or "INSERT" - "ERROR" if invalid
 *
 * @param sql The SQL statement to get the action from
 * @returns The action from the SQL statement.
 */
const sqlActionFromSql = (
    sql: string,
): "UPDATE" | "DELETE" | "INSERT" | "ERROR" => {
    const action = sql.split(" ")[0].toUpperCase();
    if (action === "UPDATE" || action === "DELETE" || action === "INSERT")
        return action;
    return "ERROR";
};

/** The row id a history statement's `WHERE rowid=N` names, or -1 when it names none. */
export const rowIdFromSql = (sql: string): number => {
    return parseInt(sql.match(/WHERE rowid=(\d+)/)?.[1] ?? "-1");
};

/**
 * The page with the lowest start beat among the given marcher page rows, and the marchers changed
 * on it. One query per 500 rows rather than one per statement.
 */
async function earliestChangedPage(
    db: DB | DbConnection,
    marcherPageIds: number[],
): Promise<{
    pageIdToGoTo: number | undefined;
    marcherIdsToSelect: Set<number> | undefined;
}> {
    let earliest: { pageId: number; position: number } | undefined;
    const marchersByPage = new Map<number, Set<number>>();
    for (let i = 0; i < marcherPageIds.length; i += 500) {
        const rows = await (db as DbConnection)
            .select({
                page_id: schema.marcher_pages.page_id,
                marcher_id: schema.marcher_pages.marcher_id,
                position: schema.beats.position,
            })
            .from(schema.marcher_pages)
            .innerJoin(
                schema.pages,
                eq(schema.pages.id, schema.marcher_pages.page_id),
            )
            .innerJoin(
                schema.beats,
                eq(schema.beats.id, schema.pages.start_beat),
            )
            .where(
                inArray(
                    schema.marcher_pages.id,
                    marcherPageIds.slice(i, i + 500),
                ),
            )
            .all();
        for (const row of rows) {
            const marchers = marchersByPage.get(row.page_id) ?? new Set();
            marchers.add(row.marcher_id);
            marchersByPage.set(row.page_id, marchers);
            if (earliest === undefined || row.position < earliest.position)
                earliest = { pageId: row.page_id, position: row.position };
        }
    }
    return {
        pageIdToGoTo: earliest?.pageId,
        marcherIdsToSelect: earliest
            ? marchersByPage.get(earliest.pageId)
            : undefined,
    };
}

type PerformHistoryActionResponse = {
    pageIdToGoTo: number | undefined;
    marcherIdsToSelect: Set<number> | undefined;
    queriesToInvalidate: string[][] | undefined;
    /**
     * Set when the action didn't apply: `page-era-frozen` when the freeze (P9.5) refused it and
     * the group was dropped from its stack; `error` for any other failure, which leaves both
     * stacks as they were.
     */
    failure?: { kind: "page-era-frozen" } | { kind: "error"; message: string };
};

/**
 * Performs an undo or redo and works out what to show afterwards: the page to jump to and the
 * marchers to select.
 *
 * In page mode they come from the `marcher_pages` statements the action replayed. In timeline mode
 * (P7.13) those rows are frozen, so they come from the action's timeline change batch instead
 * (`timelineHistoryFocus`).
 *
 * @param type The type of history action to perform, either "undo" or "redo"
 * @param db The database connection to use, or undefined to create a new connection
 * @param options.currentPageId the selected page; timeline mode stays on it when the action
 * changed it
 * @returns Response from the history action
 */
export async function performHistoryAction(
    type: "undo" | "redo",
    db: DB | DbConnection,
    options: { currentPageId?: number } = {},
): Promise<PerformHistoryActionResponse> {
    // The focus is read in the action's own lock turn, after it commits and delivers its batch, so
    // a queued undo, redo or edit can't run in between (two quick undo actions would otherwise both read
    // the state after the second)
    const { response, timelineFocus } = await withTransactionWithHistoryLock(
        async () => {
            const response = await executeHistoryActionUnlocked(db, type);
            const timelineFocus =
                response.success && (await timelineModeOn(db))
                    ? await timelineHistoryFocus(
                          db,
                          response.timelineBatch ?? { changes: [] },
                          {
                              currentPageId: options.currentPageId,
                              beatsChanged: response.tableNames.has(
                                  getTableName(schema.beats),
                              ),
                          },
                      )
                    : undefined;
            return { response, timelineFocus };
        },
    );

    if (!response.success)
        return {
            pageIdToGoTo: undefined,
            marcherIdsToSelect: undefined,
            queriesToInvalidate: undefined,
            failure: response.skippedFrozenGroup
                ? { kind: "page-era-frozen" }
                : {
                      kind: "error",
                      message: response.error?.message ?? "unknown error",
                  },
        };

    const queriesToInvalidate: string[][] = tableNamesToQueryKeys(
        response.tableNames,
    );

    if (timelineFocus)
        return {
            pageIdToGoTo: timelineFocus.pageIdToGoTo,
            marcherIdsToSelect: timelineFocus.marcherIdsToSelect,
            queriesToInvalidate,
        };

    // Page mode: go to the earliest page the action changed, and select its changed marchers
    const marcherPageIds = new Set<number>();
    for (const sqlStatement of response.sqlStatements) {
        if (
            tableNameFromSql(sqlStatement) === "marcher_pages" &&
            sqlActionFromSql(sqlStatement) !== "DELETE"
        ) {
            const marcherPageId = rowIdFromSql(sqlStatement);
            if (marcherPageId >= 0) marcherPageIds.add(marcherPageId);
        }
    }
    const { pageIdToGoTo, marcherIdsToSelect } = await earliestChangedPage(db, [
        ...marcherPageIds,
    ]);

    return { pageIdToGoTo, marcherIdsToSelect, queriesToInvalidate };
}

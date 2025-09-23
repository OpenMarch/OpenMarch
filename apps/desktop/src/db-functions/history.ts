import {
    incrementHistoryGroupInTransaction,
    getCurrentHistoryGroup,
} from "@/global/classes/History";
import { assert } from "@/utilities/utils";
import { DbConnection, DbTransaction } from "./types";
import { max } from "drizzle-orm";
import { DB, schema } from "@/global/database/db";
import { Constants } from "../../src/global/Constants";
import { getTableName, gt, sql, eq, desc, count } from "drizzle-orm";
import { tableNamesToQueryKeys } from "@/hooks/queries/utils";

const tablesWithHistory = [
    schema.beats,
    schema.pages,
    schema.measures,
    schema.marchers,
    schema.marcher_pages,
    schema.shapes,
    schema.shape_pages,
    schema.shape_page_marchers,
    schema.field_properties,
    schema.section_appearances,
    schema.utility,
];

/**
 * Runs a function in a transaction with undo/redo history tracking.
 *
 * This function will group all of the database actions performed inside of it into a single undo/redo group.
 * Using a regular transaction will cause each database action to be its own undo/redo event.
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
    return await db.transaction(async (tx) => {
        void window.electron.log(
            "info",
            `=========== start ${funcName} ============`,
        );
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
            }
            assert(groupBefore != null, "Group before is undefined");

            // Execute the function
            const result = await func(tx);

            const groupAfter =
                (
                    await tx
                        .select({ max: max(schema.history_undo.history_group) })
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

            return result;
        } finally {
            void window.electron.log(
                "info",
                `=========== end ${funcName} ============\n`,
            );
        }
    });
};

type HistoryType = "undo" | "redo";

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
 * Creates the tables to track history in the database
 *
 * @param db The database connection
 */
export async function createHistoryTables(db: DbConnection | DB) {
    const sqlStr = (tableName: string) => `
    CREATE TABLE ${tableName} (
        "sequence" INTEGER PRIMARY KEY,
        "history_group" INTEGER NOT NULL,
        "sql" TEXT NOT NULL
    );`;

    await db.run(sql.raw(sqlStr(Constants.UndoHistoryTableName)));
    await db.run(sql.raw(sqlStr(Constants.RedoHistoryTableName)));

    await db.run(
        sql.raw(`
        CREATE TABLE ${Constants.HistoryStatsTableName} (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        cur_undo_group INTEGER NOT NULL,
        cur_redo_group INTEGER NOT NULL,
        group_limit INTEGER NOT NULL
    );`),
    );

    await db.run(
        sql.raw(`
        INSERT OR IGNORE INTO ${Constants.HistoryStatsTableName}
        (id, cur_undo_group, cur_redo_group, group_limit) VALUES (1, 0, 0, 500);`),
    );
}

/**
 * Creates triggers for a table to record undo/redo history in the database.
 * These actions happen automatically when a row is inserted, updated, or deleted.
 *
 * @param db The database connection
 * @param tableName name of the table to create triggers for
 */
export async function createUndoTriggers(
    db: DbConnection | DB,
    tableName: string,
) {
    await createTriggers(db, tableName, "undo", true);
}

/**
 * Creates triggers for all tables in the database that are not undo/redo history tables.
 *
 * @param db The database connection
 */
export async function createAllUndoTriggers(db: DbConnection | DB) {
    // await db.transaction(async (tx) => {
    const promises: Promise<void>[] = [];
    for (const table of tablesWithHistory) {
        promises.push(createUndoTriggers(db, getTableName(table)));
    }
    await Promise.all(promises);
    // });
}

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
 * Drops the triggers for a table if they exist. I.e. disables undo tracking for the given table.
 *
 * @param db database connection
 * @param tableName name of the table to drop triggers for
 */
export async function dropUndoTriggers(
    db: DbConnection | DB,
    tableName: string,
) {
    await db.run(sql.raw(`DROP TRIGGER IF EXISTS "${tableName}_it";`));
    await db.run(sql.raw(`DROP TRIGGER IF EXISTS "${tableName}_ut";`));
    await db.run(sql.raw(`DROP TRIGGER IF EXISTS "${tableName}_dt";`));
}

/**
 * Drops all undo triggers from all user tables in the database.
 * Excludes SQLite internal tables and history/undo/redo tables.
 *
 * @param db database connection
 */
export async function dropAllUndoTriggers(db: DbConnection | DB) {
    for (const table of tablesWithHistory) {
        const name = getTableName(table);
        await dropUndoTriggers(db, name);
    }
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
async function incrementGroup(db: DbConnection, type: HistoryType) {
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
        const allGroupsResult = await db
            .select({ history_group: historyTable.history_group })
            .from(historyTable)
            .orderBy(historyTable.history_group)
            .all();
        // const allGroupsResult = (await db.all(
        //     sql.raw(`
        //     SELECT DISTINCT "history_group" FROM ${historyTableName} ORDER BY "history_group";
        // `),
        // )) as { history_group: number }[];
        const allGroups = allGroupsResult.map((row) => row.history_group);

        if (allGroups.length > groupLimit) {
            // Delete all of the groups that are older than the group limit
            const groupsToDelete = allGroups.slice(
                0,
                allGroups.length - groupLimit,
            );
            for (const group of groupsToDelete) {
                await db
                    .delete(historyTable)
                    .where(eq(historyTable.history_group, group))
                    .run();
                // await db.run(
                //     sql.raw(`
                //     DELETE FROM ${historyTableName} WHERE "history_group"=${group};
                // `),
                // );
            }
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
async function refreshCurrentGroups(db: DbConnection) {
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
        if (currentGroup === 0) {
            // Double check that there is nothing in the history table
            const countResponse = await db
                .select({ count: count(tableName.history_group) })
                .from(tableName)
                .get();
            const countAmount = countResponse?.count ?? 0;
            if (countAmount > 0) {
                throw new Error(
                    `There are ${countAmount} rows in the ${type} history table`,
                );
            }
        }

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
 * Creates triggers for a table to insert undo/redo history.
 *
 * @param db The database connection
 * @param tableName name of the table to create triggers for
 * @param type either "undo" or "redo"
 * @param deleteRedoRows True if the redo rows should be deleted when inserting new undo rows.
 * This is only used when switching to "undo" mode.
 * The default behavior of the application has this to true so that the redo history is cleared when a new undo action is inserted.
 * It should be false when a redo is being performed and there are triggers inserting into the undo table.
 */
async function createTriggers(
    db: DbConnection | DB,
    tableName: string,
    type: HistoryType,
    deleteRedoRows: boolean = true,
) {
    const forbiddenTables = new Set<string>([
        Constants.UndoHistoryTableName,
        Constants.RedoHistoryTableName,
        Constants.HistoryStatsTableName,
    ]);

    if (forbiddenTables.has(tableName))
        throw new Error(
            `Cannot create triggers for ${tableName} as it is a forbidden table`,
        );

    const columns = (await db.all(
        sql`SELECT name FROM pragma_table_info(${tableName});`,
    )) as { name: string }[];

    const historyTableName =
        type === "undo"
            ? Constants.UndoHistoryTableName
            : Constants.RedoHistoryTableName;
    const groupColumn = type === "undo" ? "cur_undo_group" : "cur_redo_group";

    // const currentGroupResult = db.query.history_stats.findFirst();

    // const currentGroup = currentGroupResult?.[groupColumn];
    // if (currentGroup == null) {
    //     const column = type === "undo" ? "cur_undo_group" : "cur_redo_group";
    //     db.insert(schema.history_stats)
    //         .values({
    //             [column]: 0,
    //         } as HistoryStatsRow)
    //         .run();
    // }

    // When the triggers are in undo mode, we need to delete all of the items from the redo table once an item is entered in the redo table
    const sideEffect =
        type === "undo" && deleteRedoRows
            ? `DELETE FROM ${Constants.RedoHistoryTableName};
            UPDATE ${Constants.HistoryStatsTableName} SET "cur_redo_group" = 0;`
            : "";

    // // Drop the triggers if they already exist
    // dropUndoTriggers(db, tableName);

    const columnNames = columns.map((c) => {
        let columnName: string;
        if (Array.isArray(c)) columnName = c[0];
        else if (typeof c === "object") columnName = c.name;
        else throw new Error(`Unknown column type: ${typeof c}`);
        return columnName;
    });

    // INSERT trigger
    let insertTrigger = `CREATE TRIGGER IF NOT EXISTS '${tableName}_it'
        AFTER INSERT ON "${tableName}"
        BEGIN
            INSERT INTO ${historyTableName} ("sequence" , "history_group", "sql")
            VALUES(
                NULL,
                (SELECT ${groupColumn} FROM history_stats),
                'DELETE FROM "${tableName}" WHERE rowid=' || NEW.rowid
            );
        END;`;
    // This had to be done because using the drizzle proxy led to SQLITE syntax errors
    // Likely, because drizzle tries to prepare the SQL statement and then execute it
    const isViteTest = typeof process !== "undefined" && process.env.VITEST;
    if (isViteTest) db.run(sql.raw(insertTrigger));
    else await window.electron.unsafeSqlProxy(insertTrigger);
    // UPDATE trigger
    const updateTrigger = `CREATE TRIGGER IF NOT EXISTS '${tableName}_ut' AFTER UPDATE ON "${tableName}"
        BEGIN
        INSERT INTO ${historyTableName} ("sequence" , "history_group", "sql")
            VALUES(
                NULL,
                (SELECT ${groupColumn} FROM history_stats),
                'UPDATE "${tableName}" SET ${columnNames
                    .map((c) => `"${c}"='||quote(old."${c}")||'`)
                    .join(",")} WHERE rowid='||old.rowid);
        ${sideEffect}
    END;`;
    if (isViteTest) db.run(sql.raw(updateTrigger));
    else await window.electron.unsafeSqlProxy(updateTrigger);

    // DELETE trigger
    const deleteTrigger = `CREATE TRIGGER IF NOT EXISTS '${tableName}_dt' BEFORE DELETE ON "${tableName}"
        BEGIN
        INSERT INTO ${historyTableName} ("sequence" , "history_group", "sql")
        VALUES(NULL, (
            SELECT ${groupColumn} FROM history_stats),
            'INSERT INTO "${tableName}" (${columnNames
                .map((c) => `"${c}"`)
                .join(",")}) VALUES (${columnNames
                .map((c) => `'||quote(old."${c}")||'`)
                .join(",")})');
          ${sideEffect}
      END;`;
    if (isViteTest) db.run(sql.raw(deleteTrigger));
    else await window.electron.unsafeSqlProxy(deleteTrigger);
}

/**
 * Switch the triggers to either undo or redo mode.
 * This is so when performing an undo action, the redo history is updated and vice versa.
 *
 * @param db The database connection
 * @param mode The mode to switch to, either "undo" or "redo"
 * @param deleteRedoRows true if the redo rows should be deleted when inserting new undo rows.
 */
const switchTriggerMode = async (
    db: DbConnection | DB,
    mode: HistoryType,
    deleteRedoRows: boolean,
    tableNames?: Set<string>,
) => {
    void window.electron.log(
        "info",
        `------ Switching triggers to ${mode} mode ------`,
    );
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
    void window.electron.log("info", "Existing triggers", existingTriggers);
    const tables = tableNames
        ? new Set(tableNames)
        : new Set(existingTriggers.map((t) => t.tbl_name));
    for (const trigger of existingTriggers) {
        await db.run(sql.raw(`DROP TRIGGER IF EXISTS ${trigger.name};`));
    }
    for (const table of tables) {
        await createTriggers(db, table, mode, deleteRedoRows);
    }
    void window.electron.log(
        "info",
        `------ Done switching triggers to ${mode} mode ------`,
    );
};

/**
 * Performs an undo or redo action on the database.
 *
 * Undo/redo history is collected based on triggers that are created for each table in the database if desired.
 *
 * @param db the database connection
 * @param type either "undo" or "redo"
 */
// eslint-disable-next-line max-lines-per-function
async function executeHistoryAction(
    db: DbConnection,
    type: HistoryType,
): Promise<HistoryResponse> {
    void window.electron.log(
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
            void window.electron.log("info", "No actions to " + type);
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
            const tableName = sql.match(/"(.*?)"/)?.[0].replaceAll('"', "");
            if (tableName) {
                tableNames.add(tableName);
            }
        }

        if (type === "undo") {
            // Switch the triggers to redo mode so that the redo history is updated
            await incrementGroup(db, "redo");
            await switchTriggerMode(db, "redo", false, tableNames);
        } else {
            // Switch the triggers so that the redo table does not have its rows deleted
            await switchTriggerMode(db, "undo", false, tableNames);
        }

        // Temporarily disable foreign key checks
        await db.run(sql.raw("PRAGMA foreign_keys = OFF;"));

        /// Execute all of the SQL statements in the current history group
        for (const sqlStatement of sqlStatements) {
            await db.run(sqlStatement);
        }

        // Re-enable foreign key checks
        await db.run(sql.raw("PRAGMA foreign_keys = ON;"));

        // Delete all of the SQL statements in the current history group
        await db.run(
            sql.raw(`
            DELETE FROM ${tableName} WHERE "history_group"=${currentGroup};
        `),
        );

        // Refresh the current group number in the history stats table
        await refreshCurrentGroups(db);

        // Switch the triggers back to undo mode and delete the redo rows when inputting new undo rows
        await switchTriggerMode(db, "undo", true, tableNames);
        response = {
            success: true,
            tableNames,
            sqlStatements,
        };
    } catch (err: any) {
        console.error(err);
        void window.electron.log("error", err);
        response = {
            success: false,
            tableNames: new Set(),
            sqlStatements: [],
            error: {
                message: err?.message || "failed to get error",
                stack: err?.stack || "Failed to get stack",
            },
        };
    } finally {
        void window.electron.log(
            "info",
            `============ FINISHED ${type.toUpperCase()} =============\n`,
        );
    }

    return response;
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
    void window.electron.log(
        "info",
        `-------- Clearing most recent redo --------`,
    );
    const maxGroupResult = (await db.get(sql`
        SELECT MAX(history_group) as max_redo_group FROM ${Constants.RedoHistoryTableName}
    `)) as { max_redo_group: number };
    const maxGroup = maxGroupResult.max_redo_group;
    await db.run(sql`
        DELETE FROM ${Constants.RedoHistoryTableName} WHERE history_group = ${maxGroup}
    `);
    void window.electron.log(
        "info",
        `-------- Done clearing most recent redo --------`,
    );
}

/**
 * @param db database connection
 * @returns The current undo group number in the history stats table
 */
export async function getCurrentUndoGroup(db: DbConnection | DB) {
    const result = (await db.get(
        sql.raw(`
        SELECT cur_undo_group FROM ${Constants.HistoryStatsTableName};
    `),
    )) as { cur_undo_group: number };
    return result.cur_undo_group;
}

/**
 * @param db database connection
 * @returns The current redo group number in the history stats table
 */
export async function getCurrentRedoGroup(db: DbConnection | DB) {
    const result = (await db.get(
        sql.raw(`
        SELECT cur_redo_group FROM ${Constants.HistoryStatsTableName};
    `),
    )) as { cur_redo_group: number };
    return result.cur_redo_group;
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
    void window.electron.log(
        "info",
        `-------- Decrementing last undo group --------`,
    );
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
    void window.electron.log(
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
    void window.electron.log(
        "info",
        `-------- Flattening undo groups above ${group} --------`,
    );
    await db
        .update(schema.history_undo)
        .set({ history_group: group })
        .where(gt(schema.history_undo.history_group, group));
    void window.electron.log(
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
        )) as HistoryTableRow[];

        if (rows.length === 0) return 0;

        const totalLength = rows.reduce((sum, row) => sum + row.sql.length, 0);
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

const rowIdFromSql = (sql: string): number => {
    return parseInt(sql.match(/WHERE rowid=(\d+)/)?.[0] || "-1");
};

type PerformHistoryActionResponse = {
    pageIdToGoTo: number | undefined;
    marcherIdsToSelect: Set<number> | undefined;
    queriesToInvalidate: string[][] | undefined;
};

/**
 *
 * @param type The type of history action to perform, either "undo" or "redo"
 * @param db The database connection to use, or undefined to create a new connection
 * @returns Response from the history action
 */
export async function performHistoryAction(
    type: "undo" | "redo",
    db: DB,
): Promise<PerformHistoryActionResponse> {
    const dbToUse = db;
    let response: HistoryResponse;

    if (type === "undo") response = await performUndo(dbToUse);
    else response = await performRedo(dbToUse);

    const modifiedPageIds: Set<number> = new Set();
    const modifiedMarcherIdsForPage: Record<number, Set<number>> = {};

    for (const sqlStatement of response.sqlStatements) {
        const tableName = tableNameFromSql(sqlStatement);
        if (
            tableName === "marcher_pages" &&
            sqlActionFromSql(sqlStatement) !== "DELETE"
        ) {
            const marcherPageId = rowIdFromSql(sqlStatement);
            const marcherPage = await db.query.marcher_pages.findFirst({
                where: (marcher_pages, { eq }) =>
                    eq(marcher_pages.id, marcherPageId),
            });
            if (marcherPage) {
                if (!modifiedMarcherIdsForPage[marcherPage.page_id]) {
                    modifiedMarcherIdsForPage[marcherPage.page_id] = new Set();
                }
                modifiedMarcherIdsForPage[marcherPage.page_id].add(
                    marcherPage.marcher_id,
                );
                modifiedPageIds.add(marcherPage.page_id);
            }
        }
    }

    const queriesToInvalidate: string[][] = tableNamesToQueryKeys(
        response.tableNames,
    );

    const pageIdToGoTo =
        modifiedPageIds.size > 0
            ? Math.max(...Array.from(modifiedPageIds))
            : undefined;
    const marcherIdsToSelect = pageIdToGoTo
        ? modifiedMarcherIdsForPage[pageIdToGoTo]
        : undefined;

    return { pageIdToGoTo, marcherIdsToSelect, queriesToInvalidate };
}

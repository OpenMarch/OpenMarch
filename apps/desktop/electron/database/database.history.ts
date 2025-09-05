import { Constants } from "../../src/global/Constants";
import { gt, sql } from "drizzle-orm";
import { DbConnection } from "./tables/__test__/testUtils";
import { schema } from "./db";

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
     * The name of the tables that was modified.
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
export async function createHistoryTables(db: DbConnection) {
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
export async function createUndoTriggers(db: DbConnection, tableName: string) {
    await createTriggers(db, tableName, "undo", true);
}

/**
 * Increment the undo group in the database to create a new group for undo history.
 *
 * This will always return 1 + the max group number in the undo history table.
 *
 * @param db The database connection
 * @returns the new undo group number
 */
export async function incrementUndoGroup(db: DbConnection) {
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
export async function performUndo(db: DbConnection) {
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
export async function performRedo(db: DbConnection) {
    return await executeHistoryAction(db, "redo");
}

/**
 * Drops the triggers for a table if they exist. I.e. disables undo tracking for the given table.
 *
 * @param db database connection
 * @param tableName name of the table to drop triggers for
 */
export async function dropUndoTriggers(db: DbConnection, tableName: string) {
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
export async function dropAllUndoTriggers(db: DbConnection) {
    // Get all user tables (exclude sqlite internal and history tables)
    const tables = (await db.all(sql`
        SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN (${Constants.UndoHistoryTableName}, ${Constants.RedoHistoryTableName}, ${Constants.HistoryStatsTableName});
    `)) as { name: string }[];

    for (const { name } of await tables) {
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
    const historyTableName =
        type === "undo"
            ? Constants.UndoHistoryTableName
            : Constants.RedoHistoryTableName;

    // Get the max group number from the respective history table
    const maxGroupResult = (await db.get(
        sql.raw(`
        SELECT max("history_group") as current_group FROM ${historyTableName};
    `),
    )) as { current_group?: number };
    const maxGroup = maxGroupResult.current_group || 0;

    const groupString = type === "undo" ? "cur_undo_group" : "cur_redo_group";
    const newGroup = maxGroup + 1;
    await db.run(
        sql.raw(`
        UPDATE ${Constants.HistoryStatsTableName} SET "${groupString}"=${newGroup};
    `),
    );

    const groupLimitResult = (await db.get(
        sql.raw(`
        SELECT group_limit FROM ${Constants.HistoryStatsTableName};
    `),
    )) as HistoryStatsRow;
    const groupLimit = groupLimitResult?.group_limit || -1;

    // If the group limit is positive and is reached, delete the oldest group
    if (groupLimit > 0) {
        const allGroupsResult = (await db.all(
            sql.raw(`
            SELECT DISTINCT "history_group" FROM ${historyTableName} ORDER BY "history_group";
        `),
        )) as { history_group: number }[];
        const allGroups = allGroupsResult.map((row) => row.history_group);

        if (allGroups.length > groupLimit) {
            // Delete all of the groups that are older than the group limit
            const groupsToDelete = allGroups.slice(
                0,
                allGroups.length - groupLimit,
            );
            for (const group of groupsToDelete) {
                await db.run(
                    sql.raw(`
                    DELETE FROM ${historyTableName} WHERE "history_group"=${group};
                `),
                );
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
            type === "undo"
                ? Constants.UndoHistoryTableName
                : Constants.RedoHistoryTableName;
        const groupColumn =
            type === "undo" ? "cur_undo_group" : "cur_redo_group";
        const currentGroupResult = (await db.get(
            sql.raw(`
            SELECT max("history_group") as max_group FROM ${tableName};
        `),
        )) as { max_group: number };
        const currentGroup = currentGroupResult.max_group || 0; // default to 0 if there are no rows in the history table

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
    db: DbConnection,
    tableName: string,
    type: HistoryType,
    deleteRedoRows: boolean = true,
) {
    const columns = (await db.all(
        sql.raw(`SELECT name FROM pragma_table_info('${tableName}');`),
    )) as { name: string }[];

    const historyTableName =
        type === "undo"
            ? Constants.UndoHistoryTableName
            : Constants.RedoHistoryTableName;
    const groupColumn = type === "undo" ? "cur_undo_group" : "cur_redo_group";
    const currentGroupResult = (await db.get(
        sql.raw(`
        SELECT ${groupColumn} as current_group
        FROM ${Constants.HistoryStatsTableName};
    `),
    )) as { current_group: number };
    const currentGroup = currentGroupResult.current_group;
    if (currentGroup === undefined) {
        console.error(
            "Could not get current group number from history stats table",
        );
        return;
    }

    // When the triggers are in undo mode, we need to delete all of the items from the redo table once an item is entered in the redo table
    const sideEffect =
        type === "undo" && deleteRedoRows
            ? `DELETE FROM ${Constants.RedoHistoryTableName};
            UPDATE ${Constants.HistoryStatsTableName} SET "cur_redo_group" = 0;`
            : "";

    // Drop the triggers if they already exist
    await dropUndoTriggers(db, tableName);

    // INSERT trigger
    let sqlStmt = `CREATE TRIGGER IF NOT EXISTS "${tableName}_it" AFTER INSERT ON "${tableName}" BEGIN
        INSERT INTO ${historyTableName} ("sequence" , "history_group", "sql")
            VALUES(NULL, (SELECT ${groupColumn} FROM history_stats), 'DELETE FROM "${tableName}" WHERE rowid='||new.rowid);
        ${sideEffect}
    END;`;
    await db.run(sql.raw(sqlStmt));
    // UPDATE trigger
    sqlStmt = `CREATE TRIGGER IF NOT EXISTS "${tableName}_ut" AFTER UPDATE ON "${tableName}" BEGIN
        INSERT INTO ${historyTableName} ("sequence" , "history_group", "sql")
            VALUES(NULL, (SELECT ${groupColumn} FROM history_stats), 'UPDATE "${tableName}" SET ${columns
                .map((c) => `"${c.name}"='||quote(old."${c.name}")||'`)
                .join(",")} WHERE rowid='||old.rowid);
        ${sideEffect}
    END;`;
    await db.run(sql.raw(sqlStmt));
    // DELETE trigger
    sqlStmt = `CREATE TRIGGER IF NOT EXISTS "${tableName}_dt" BEFORE DELETE ON "${tableName}" BEGIN
          INSERT INTO ${historyTableName} ("sequence" , "history_group", "sql")
            VALUES(NULL, (SELECT ${groupColumn} FROM history_stats), 'INSERT INTO "${tableName}" (${columns
                .map((column) => `"${column.name}"`)
                .join(",")}) VALUES (${columns
                .map((c) => `'||quote(old."${c.name}")||'`)
                .join(",")})');
          ${sideEffect}
      END;`;
    await db.run(sql.raw(sqlStmt));
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
    db: DbConnection,
    mode: HistoryType,
    deleteRedoRows: boolean,
    tableNames?: Set<string>,
) => {
    console.log(`------ Switching triggers to ${mode} mode ------`);
    let sqlQuery = `SELECT * FROM sqlite_master WHERE type='trigger' AND ("name" LIKE '%$_ut' ESCAPE '$' OR "name" LIKE  '%$_it' ESCAPE '$' OR "name" LIKE  '%$_dt' ESCAPE '$')`;
    if (tableNames) {
        sqlQuery += ` AND tbl_name IN (${Array.from(tableNames)
            .map((t) => `'${t}'`)
            .join(",")})`;
    }
    sqlQuery += ";";
    // TODO TEST THIS
    const triggers = (await db.all(sql.raw(sqlQuery))) as {
        name: string;
        tbl_name: string;
    }[];
    const tables = new Set(triggers.map((t) => t.tbl_name));
    for (const trigger of triggers) {
        await db.run(sql.raw(`DROP TRIGGER IF EXISTS ${trigger.name};`));
    }
    for (const table of tables) {
        await createTriggers(db, table, mode, deleteRedoRows);
    }
    console.log(`------ Done switching triggers to ${mode} mode ------`);
};

/**
 * Performs an undo or redo action on the database.
 *
 * Undo/redo history is collected based on triggers that are created for each table in the database if desired.
 *
 * @param db the database connection
 * @param type either "undo" or "redo"
 */
async function executeHistoryAction(
    db: DbConnection,
    type: HistoryType,
): Promise<HistoryResponse> {
    console.log(`\n============ PERFORMING ${type.toUpperCase()} ============`);
    let response: HistoryResponse = {
        success: false,
        tableNames: new Set(),
        sqlStatements: [],
        error: { message: "No error to show", stack: "No stack to show" },
    };
    let sqlStatements: string[] = [];
    try {
        const tableName =
            type === "undo"
                ? Constants.UndoHistoryTableName
                : Constants.RedoHistoryTableName;
        const currentGroupResult = (await db.get(
            sql.raw(`
            SELECT max("history_group") as max_group FROM ${tableName};
        `),
        )) as { max_group: number };
        let currentGroup = currentGroupResult.max_group;

        // Get all of the SQL statements in the current undo group
        const getSqlStatements = async (group: number) =>
            (
                (await db.all(
                    sql.raw(`
                    SELECT sql FROM
                    ${
                        type === "undo"
                            ? Constants.UndoHistoryTableName
                            : Constants.RedoHistoryTableName
                    }
                    WHERE "history_group"=${group} ORDER BY sequence DESC;
                `),
                )) as HistoryTableRow[]
            ).map((row) => row.sql);

        sqlStatements = await getSqlStatements(currentGroup);
        if (sqlStatements.length === 0) {
            console.log("No actions to " + type);
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
            await db.run(sql.raw(sqlStatement));
        }

        // Re-enable foreign key checks
        await db.run(sql.raw("PRAGMA foreign_keys = ON;"));

        // Delete all of the SQL statements in the current undo group
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
        console.log(
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
export async function clearMostRecentRedo(db: DbConnection) {
    console.log(`-------- Clearing most recent redo --------`);
    const maxGroupResult = (await db.get(sql`
        SELECT MAX(history_group) as max_redo_group FROM ${Constants.RedoHistoryTableName}
    `)) as { max_redo_group: number };
    const maxGroup = maxGroupResult.max_redo_group;
    await db.run(sql`
        DELETE FROM ${Constants.RedoHistoryTableName} WHERE history_group = ${maxGroup}
    `);
    console.log(`-------- Done clearing most recent redo --------`);
}

/**
 * @param db database connection
 * @returns The current undo group number in the history stats table
 */
export async function getCurrentUndoGroup(db: DbConnection) {
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
export async function getCurrentRedoGroup(db: DbConnection) {
    const result = (await db.get(
        sql.raw(`
        SELECT cur_redo_group FROM ${Constants.HistoryStatsTableName};
    `),
    )) as { cur_redo_group: number };
    return result.cur_redo_group;
}

export async function getUndoStackLength(db: DbConnection): Promise<number> {
    const result = (await db.get(
        sql.raw(`
        SELECT COUNT(*) as count FROM ${Constants.UndoHistoryTableName};
    `),
    )) as { count: number };
    return result.count;
}

export async function getRedoStackLength(db: DbConnection): Promise<number> {
    const result = (await db.get(
        sql.raw(`
        SELECT COUNT(*) as count FROM ${Constants.RedoHistoryTableName};
    `),
    )) as { count: number };
    return result.count;
}

/**
 * Decrement all of the undo actions in the most recent group down by one.
 *
 * This should be used when a database action should not create its own group, but the group number
 * was incremented to allow for rolling back changes due to error.
 *
 * @param db database connection
 */
export async function decrementLastUndoGroup(db: DbConnection) {
    console.log(`-------- Decrementing last undo group --------`);
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
    console.log(`-------- Done decrementing last undo group --------`);
}

/**
 * Flatten all of the undo groups above the given group number.
 *
 * This is used when subsequent undo groups are created, but they should be part of the same group.
 *
 * @param db database connection
 * @param group the group number to flatten above
 */
export async function flattenUndoGroupsAbove(db: DbConnection, group: number) {
    console.log(`-------- Flattening undo groups above ${group} --------`);
    await db
        .update(schema.history_undo)
        .set({ history_group: group })
        .where(gt(schema.history_undo.history_group, group));
    console.log(`-------- Done flattening undo groups above ${group} --------`);
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
export async function calculateHistorySize(db: DbConnection) {
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

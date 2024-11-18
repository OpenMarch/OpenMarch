import { Constants } from "../../src/global/Constants";
import Database from "better-sqlite3";

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
export function createHistoryTables(db: Database.Database) {
    const sqlStr = (tableName: string) => `
    CREATE TABLE IF NOT EXISTS ${tableName} (
        "sequence" INTEGER PRIMARY KEY,
        "history_group" INTEGER NOT NULL,
        "sql" TEXT NOT NULL
    );`;

    db.prepare(sqlStr(Constants.UndoHistoryTableName)).run();
    db.prepare(sqlStr(Constants.RedoHistoryTableName)).run();

    db.prepare(
        `CREATE TABLE IF NOT EXISTS ${Constants.HistoryStatsTableName} (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        cur_undo_group INTEGER NOT NULL,
        cur_redo_group INTEGER NOT NULL,
        group_limit INTEGER NOT NULL
    );`,
    ).run();
    db.prepare(
        `INSERT OR IGNORE INTO ${Constants.HistoryStatsTableName}
        (id, cur_undo_group, cur_redo_group, group_limit) VALUES (1, 0, 0, 500);`,
    ).run();
}

/**
 * Creates triggers for a table to record undo/redo history in the database.
 * These actions happen automatically when a row is inserted, updated, or deleted.
 *
 * @param db The database connection
 * @param tableName name of the table to create triggers for
 */
export function createUndoTriggers(db: Database.Database, tableName: string) {
    createTriggers(db, tableName, "undo", true);
}

/**
 * Increment the undo group in the database to create a new group for undo history.
 *
 * This will always return 1 + the max group number in the undo history table.
 *
 * @param db The database connection
 * @returns the new undo group number
 */
export function incrementUndoGroup(db: Database.Database) {
    return incrementGroup(db, "undo");
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
export function performUndo(db: Database.Database) {
    return executeHistoryAction(db, "undo");
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
export function performRedo(db: Database.Database) {
    return executeHistoryAction(db, "redo");
}

/**
 * Drops the triggers for a table if they exist. I.e. disables undo tracking for the given table.
 *
 * @param db database connection
 * @param tableName name of the table to drop triggers for
 */
export function dropUndoTriggers(db: Database.Database, tableName: string) {
    db.prepare(`DROP TRIGGER IF EXISTS "${tableName}_it";`).run();
    db.prepare(`DROP TRIGGER IF EXISTS "${tableName}_ut";`).run();
    db.prepare(`DROP TRIGGER IF EXISTS "${tableName}_dt";`).run();
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
function incrementGroup(db: Database.Database, type: HistoryType) {
    const historyTableName =
        type === "undo"
            ? Constants.UndoHistoryTableName
            : Constants.RedoHistoryTableName;

    // Get the max group number from the respective history table
    const maxGroup =
        (
            db
                .prepare(
                    `SELECT max("history_group") as current_group FROM ${historyTableName};`,
                )
                .get() as { current_group?: number }
        ).current_group || 0;

    const groupString = type === "undo" ? "cur_undo_group" : "cur_redo_group";
    const newGroup = maxGroup + 1;
    db.prepare(
        `UPDATE ${Constants.HistoryStatsTableName} SET "${groupString}"=${newGroup};`,
    ).run();

    const groupLimit =
        (
            db
                .prepare(
                    `SELECT group_limit FROM ${Constants.HistoryStatsTableName};`,
                )
                .get() as HistoryStatsRow
        )?.group_limit || -1;

    // If the group limit is positive and is reached, delete the oldest group
    if (groupLimit > 0) {
        const allGroups = (
            db
                .prepare(
                    `SELECT DISTINCT "history_group" FROM ${historyTableName} ORDER BY "history_group";`,
                )
                .all() as { history_group: number }[]
        ).map((row) => row.history_group);

        if (allGroups.length > groupLimit) {
            // Delete all of the groups that are older than the group limit
            const groupsToDelete = allGroups.slice(
                0,
                allGroups.length - groupLimit,
            );
            for (const group of groupsToDelete) {
                db.prepare(
                    `DELETE FROM ${historyTableName} WHERE "history_group"=${group};`,
                ).run();
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
function refreshCurrentGroups(db: Database.Database) {
    const refreshCurrentGroup = (type: HistoryType) => {
        const tableName =
            type === "undo"
                ? Constants.UndoHistoryTableName
                : Constants.RedoHistoryTableName;
        const groupColumn =
            type === "undo" ? "cur_undo_group" : "cur_redo_group";
        const currentGroup =
            (
                db
                    .prepare(
                        `SELECT max("history_group") as max_group FROM ${tableName};`,
                    )
                    .get() as { max_group: number }
            ).max_group || 0; // default to 0 if there are no rows in the history table

        db.prepare(
            `UPDATE ${Constants.HistoryStatsTableName} SET "${groupColumn}"=${
                currentGroup + 1
            };`,
        ).run();
    };

    refreshCurrentGroup("undo");
    refreshCurrentGroup("redo");
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
function createTriggers(
    db: Database.Database,
    tableName: string,
    type: HistoryType,
    deleteRedoRows: boolean = true,
) {
    const columns = db
        .prepare(`SELECT name FROM pragma_table_info('${tableName}');`)
        .all() as { name: string }[];

    const historyTableName =
        type === "undo"
            ? Constants.UndoHistoryTableName
            : Constants.RedoHistoryTableName;
    const groupColumn = type === "undo" ? "cur_undo_group" : "cur_redo_group";
    const currentGroup = (
        db
            .prepare(
                `SELECT ${groupColumn} as current_group
                FROM ${Constants.HistoryStatsTableName};`,
            )
            .get() as { current_group: number }
    ).current_group;
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
    dropUndoTriggers(db, tableName);

    // INSERT trigger
    let sqlStmt = `CREATE TRIGGER IF NOT EXISTS "${tableName}_it" AFTER INSERT ON "${tableName}" BEGIN
        INSERT INTO ${historyTableName} ("sequence" , "history_group", "sql")
            VALUES(NULL, (SELECT ${groupColumn} FROM history_stats), 'DELETE FROM "${tableName}" WHERE rowid='||new.rowid);
        ${sideEffect}
    END;`;
    db.prepare(sqlStmt).run();
    // UPDATE trigger
    sqlStmt = `CREATE TRIGGER IF NOT EXISTS "${tableName}_ut" AFTER UPDATE ON "${tableName}" BEGIN
        INSERT INTO ${historyTableName} ("sequence" , "history_group", "sql")
            VALUES(NULL, (SELECT ${groupColumn} FROM history_stats), 'UPDATE "${tableName}" SET ${columns
                .map((c) => `"${c.name}"='||quote(old."${c.name}")||'`)
                .join(",")} WHERE rowid='||old.rowid);
        ${sideEffect}
    END;`;
    db.prepare(sqlStmt).run();
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
    db.prepare(sqlStmt).run();
}

/**
 * Switch the triggers to either undo or redo mode.
 * This is so when performing an undo action, the redo history is updated and vice versa.
 *
 * @param db The database connection
 * @param mode The mode to switch to, either "undo" or "redo"
 * @param deleteRedoRows true if the redo rows should be deleted when inserting new undo rows.
 */
const switchTriggerMode = (
    db: Database.Database,
    mode: HistoryType,
    deleteRedoRows: boolean,
    tableNames?: Set<string>,
) => {
    let sql = `SELECT * FROM sqlite_master WHERE type='trigger' AND ("name" LIKE '%$_ut' ESCAPE '$' OR "name" LIKE  '%$_it' ESCAPE '$' OR "name" LIKE  '%$_dt' ESCAPE '$')`;
    if (tableNames) {
        sql += ` AND tbl_name IN (${Array.from(tableNames)
            .map((t) => `'${t}'`)
            .join(",")})`;
    }
    sql += ";";
    // TODO TEST THIS
    const triggers = db.prepare(sql).all() as {
        name: string;
        tbl_name: string;
    }[];
    const tables = new Set(triggers.map((t) => t.tbl_name));
    for (const trigger of triggers) {
        db.prepare(`DROP TRIGGER IF EXISTS ${trigger.name};`).run();
    }
    for (const table of tables) {
        createTriggers(db, table, mode, deleteRedoRows);
    }
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
    db: Database.Database,
    type: HistoryType,
): HistoryResponse {
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
        let currentGroup = (
            db
                .prepare(
                    `SELECT max("history_group") as max_group FROM ${tableName};`,
                )
                .get() as { max_group: number }
        ).max_group;

        // Get all of the SQL statements in the current undo group
        const getSqlStatements = (group: number) =>
            (
                db
                    .prepare(
                        `SELECT sql FROM
                ${
                    type === "undo"
                        ? Constants.UndoHistoryTableName
                        : Constants.RedoHistoryTableName
                }
                WHERE "history_group"=${group} ORDER BY sequence DESC;`,
                    )
                    .all() as HistoryTableRow[]
            ).map((row) => row.sql);

        sqlStatements = getSqlStatements(currentGroup);
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
            incrementGroup(db, "redo");
            switchTriggerMode(db, "redo", false, tableNames);
        } else {
            // Switch the triggers so that the redo table does not have its rows deleted
            switchTriggerMode(db, "undo", false, tableNames);
        }

        // Temporarily disable foreign key checks
        db.prepare("PRAGMA foreign_keys = OFF;").run();

        /// Execute all of the SQL statements in the current history group
        for (const sqlStatement of sqlStatements) {
            db.prepare(sqlStatement).run();
        }

        // Re-enable foreign key checks
        db.prepare("PRAGMA foreign_keys = ON;").run();

        // Delete all of the SQL statements in the current undo group
        db.prepare(
            `DELETE FROM ${tableName} WHERE "history_group"=${currentGroup};`,
        ).run();

        // Refresh the current group number in the history stats table
        refreshCurrentGroups(db);

        // Switch the triggers back to undo mode and delete the redo rows when inputting new undo rows
        switchTriggerMode(db, "undo", true, tableNames);
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
export function clearMostRecentRedo(db: Database.Database) {
    const maxGroup = (
        db
            .prepare(
                `SELECT MAX(history_group) as max_redo_group FROM ${Constants.RedoHistoryTableName}`,
            )
            .get() as { max_redo_group: number }
    ).max_redo_group;
    db.prepare(
        `DELETE FROM ${Constants.RedoHistoryTableName} WHERE history_group = ?`,
    ).run(maxGroup);
}

/**
 * @param db database connection
 * @returns The current undo group number in the history stats table
 */
export function getCurrentUndoGroup(db: Database.Database) {
    return (
        db
            .prepare(
                `SELECT cur_undo_group FROM ${Constants.HistoryStatsTableName};`,
            )
            .get() as { cur_undo_group: number }
    ).cur_undo_group;
}

import Database from "better-sqlite3";
import * as History from "../database.history";
import Constants from "@/global/Constants";

/**
 * Response from the database
 */
export interface DatabaseResponse<DatabaseItemType> {
    /** Whether the operation was a success */
    readonly success: boolean;
    /** Error message if the operation failed */
    readonly error?: { message: string; stack?: string };
    /** The data that was affected or returned by the operation */
    readonly data: DatabaseItemType;
}

export interface DefaultDatabaseItem {
    id: number;
    updated_at?: string;
    created_at?: string;
}

/**
 * Decrement all of the undo actions in the most recent group down by one.
 *
 * This should be used when a database action should not create its own group, but the group number
 * was incremented to allow for rolling back changes due to error.
 *
 * @param db database connection
 */
function decrementLastUndoGroup(db: Database.Database) {
    const maxGroup = (
        db
            .prepare(
                `SELECT MAX(history_group) as max_undo_group FROM ${Constants.UndoHistoryTableName}`
            )
            .get() as { max_undo_group: number }
    ).max_undo_group;

    const previousGroup = (
        db
            .prepare(
                `SELECT MAX(history_group) as previous_group FROM ${Constants.UndoHistoryTableName} WHERE history_group < ?`
            )
            .get(maxGroup) as { previous_group: number }
    ).previous_group;

    db.prepare(
        `UPDATE ${Constants.UndoHistoryTableName} SET history_group = ? WHERE history_group = ?`
    ).run(previousGroup, maxGroup);
}

/**
 * Clear the most recent redo actions from the most recent group.
 *
 * This should be used when there was an error that required changes to be
 * rolled back but the redo history should not be kept.
 *
 * @param db database connection
 */
function clearMostRecentRedo(db: Database.Database) {
    const maxGroup = (
        db
            .prepare(
                `SELECT MAX(history_group) as max_redo_group FROM ${Constants.RedoHistoryTableName}`
            )
            .get() as { max_redo_group: number }
    ).max_redo_group;
    db.prepare(
        `DELETE FROM ${Constants.RedoHistoryTableName} WHERE history_group = ?`
    ).run(maxGroup);
}

/**
 * Gets a single item from the table. If the item does not exist, an error is returned in the DatabaseResponse.
 *
 * @param db The database connection, or undefined to create a new connection
 * @param id The id of the item to get
 * @param tableName The name of the table to get the item from
 * @param closeDbOnError Whether to close the database connection if an error occurs, default is true
 * @returns A DatabaseResponse with the item
 */
export function getItem<DatabaseItemType extends DefaultDatabaseItem>({
    id,
    db,
    tableName,
    closeDbOnError = true,
}: {
    id: number;
    db: Database.Database;
    tableName: string;
    closeDbOnError?: boolean;
}): DatabaseResponse<DatabaseItemType | undefined> {
    let output: DatabaseResponse<DatabaseItemType | undefined>;
    try {
        const stmt = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`);
        const result = stmt.get(id) as DatabaseItemType;
        if (!result) {
            output = {
                success: false,
                data: result,
                error: {
                    message: `No item with "id"=${id} in table "${tableName}"`,
                },
            };
        } else {
            output = {
                success: true,
                data: result,
            };
        }
    } catch (error: any) {
        output = {
            success: false,
            data: undefined,
            error: {
                message: error.message || `Error getting item ${id}`,
                stack: error.stack || "Unable to get error stack",
            },
        };
        console.error(`Failed to get item ${id}:`, error);
    } finally {
        // if (closeDbOnError) db.close();
    }
    return output;
}

/**
 * Retrieves a set of columns for the specified table
 *
 * @param db database connection
 * @param tableName name of the table to get the columns for
 * @returns the set of columns for the given table
 */
function getColumns(db: Database.Database, tableName: string): Set<string> {
    return new Set(
        (
            db.prepare(`PRAGMA table_info(${tableName});`).all() as {
                name: string;
            }[]
        ).map((response) => response.name)
    );
}

/**
 * Gets all the items from the table
 *
 * @param db The database connection, or undefined to create a new connection
 * @param id The id of the item to get
 * @param tableName The name of the table to get the item from
 * @param incrementUndoGroup Whether to increment the undo group, default is true
 * @param closeDbOnError Whether to close the database connection if an error occurs, default is true
 * @returns A DatabaseResponse with the item
 */
export function getAllItems<DatabaseItemType extends DefaultDatabaseItem>({
    db,
    tableName,
    incrementUndoGroup = true,
    closeDbOnError = true,
}: {
    db: Database.Database;
    tableName: string;
    incrementUndoGroup?: boolean;
    closeDbOnError?: boolean;
}): DatabaseResponse<DatabaseItemType[] | undefined> {
    let output: DatabaseResponse<DatabaseItemType[] | undefined>;
    try {
        if (incrementUndoGroup) History.incrementUndoGroup(db);
        const stmt = db.prepare(`SELECT * FROM ${tableName}`);
        const result = stmt.all() as DatabaseItemType[];
        if (!result) {
            output = {
                success: false,
                data: [],
                error: {
                    message: `No items in table "${tableName}"`,
                },
            };
        } else {
            output = {
                success: true,
                data: result,
            };
        }
    } catch (error: any) {
        output = {
            success: false,
            data: [],
            error: {
                message:
                    error.message || `Error getting items from ${tableName}`,
                stack: error.stack || "Unable to get error stack",
            },
        };
        console.error(`Failed to get item from ${tableName}:`, error);
    } finally {
        if (incrementUndoGroup) History.incrementUndoGroup(db);
        // if (closeDbOnError) db.close();
    }
    return output;
}

/**
 * Builds the insert query for the arguments (e.g. "(name, age) VALUES (@name, @age)")
 *
 * @param args The arguments to build the insert query
 * @returns String with the query
 */
function insertClause<NewItemArgs extends Object>(args: NewItemArgs) {
    const keys = Object.keys(args);
    keys.sort();
    const columns = keys.join(", ");
    const values = keys.map((key) => `@${key}`).join(", ");
    return `(${columns}) VALUES (${values})`;
}

/**
 * @param db The database connection, or undefined to create a new connection
 * @param items The items to insert
 * @param tableName The name of the table to get the item from
 * @param incrementUndoGroup Whether to increment the undo group, default is true
 * @returns The id of the inserted item
 */
export function createItems<
    DatabaseItemType extends DefaultDatabaseItem,
    NewItemArgs extends Object
>({
    db,
    items,
    tableName,
    incrementUndoGroup = true,
}: {
    db: Database.Database;
    items: NewItemArgs[];
    tableName: string;
    incrementUndoGroup?: boolean;
}): DatabaseResponse<DatabaseItemType[]> {
    let output: DatabaseResponse<DatabaseItemType[]> = {
        success: false,
        data: [],
        error: { message: "Failed to insert item" },
    };
    try {
        History.incrementUndoGroup(db);
        const newItemIds: number[] = [];
        const columns = getColumns(db, tableName);

        for (const oldItem of items) {
            const item = { ...oldItem }; // copy the object as to not modify the original reference
            // Remove the id from the new item if it exists
            let itemToInsert = item;
            if (Object.keys(item).includes("id")) {
                const { id, ...rest } = item as any;
                itemToInsert = rest;
            }

            const createdAt = new Date().toISOString();
            let newItem = itemToInsert as any;
            if (columns.has("created_at")) newItem.created_at = createdAt;
            if (columns.has("updated_at")) newItem.updated_at = createdAt;

            const stmt = db.prepare(
                `INSERT INTO ${tableName} ${insertClause(newItem)}`
            );
            const insertResult = stmt.run(newItem);
            const id = insertResult.lastInsertRowid as number;
            newItemIds.push(id);
        }
        const newItems: DatabaseItemType[] = [];
        for (const id of newItemIds) {
            const newItem = getItem<DatabaseItemType>({
                id,
                db,
                tableName,
            }).data;
            if (!newItem) {
                throw new Error(
                    `No item with id ${id} in table "${tableName}"`
                );
            } else {
                newItems.push(newItem);
            }
        }
        output = {
            success: true,
            data: newItems as DatabaseItemType[],
        };

        // If the undo group was not supposed to be incremented, decrement all of the undo actions in the most recent group down by one
        if (!incrementUndoGroup) decrementLastUndoGroup(db);
    } catch (error: any) {
        output = {
            success: false,
            data: [],
            error: {
                message:
                    error.message || `Error getting items from ${tableName}`,
                stack: error.stack || "Unable to get error stack",
            },
        };

        // Roll back the changes caused by this action
        History.performUndo(db);
        clearMostRecentRedo(db);
    } finally {
        if (incrementUndoGroup) History.incrementUndoGroup(db);
    }
    return output;
}

/**
 * @param db The database connection, or undefined to create a new connection
 * @param items The items to update
 * @returns A DatabaseResponse with the updated items
 */
export function updateItems<
    DatabaseItemType extends DefaultDatabaseItem,
    UpdatedItemArgs extends { id: number }
>({
    db,
    items,
    tableName,
    incrementUndoGroup = true,
}: {
    items: UpdatedItemArgs[];
    db: Database.Database;
    tableName: string;
    incrementUndoGroup?: boolean;
}): DatabaseResponse<DatabaseItemType[]> {
    // Check if all of the items exist
    const notFoundIds: number[] = [];
    const ids = new Set<number>(items.map((item) => item.id));
    let actionWasPerformed = false;

    // Verify all of the items exist before deleting any of them
    for (const id of ids) {
        if (
            getItem<DatabaseItemType>({ id, db, tableName }).data === undefined
        ) {
            notFoundIds.push(id);
        }
    }
    // Return an error if any of the items do not exist
    if (notFoundIds.length > 0) {
        return {
            success: false,
            data: [],
            error: {
                message: `No items with ids [${notFoundIds.join(
                    ", "
                )}] in table "${tableName}"`,
            },
        };
    }

    let output: DatabaseResponse<DatabaseItemType[]> = {
        success: false,
        data: [],
        error: { message: "Failed to update item" },
    };
    try {
        // Increment the undo group so this action can be rolled back if needed
        History.incrementUndoGroup(db);
        const columns = getColumns(db, tableName);

        const updateIds: number[] = [];
        for (const oldItem of items) {
            const item = { ...oldItem }; // Copy the old item as to not modify the original reference
            const updatedAt = new Date().toISOString();
            let updatedItem: DefaultDatabaseItem = item;
            if (columns.has("updated_at")) updatedItem.updated_at = updatedAt;

            // remove the id from the updated item
            const { id, ...rest } = updatedItem;
            const setClause = Object.keys(rest)
                .map((key) => `"${key}" = @${key}`)
                .join(", ");

            if (!Object.keys(updatedItem).includes("id")) {
                console.warn("No id provided for update, skipping item");
                continue;
            }
            const stmt = db.prepare(
                `UPDATE ${tableName} SET ${setClause} WHERE "rowid" = @id`
            );
            stmt.run(updatedItem);
            actionWasPerformed = true;
            updateIds.push(id);
        }
        const updatedItems: DatabaseItemType[] = [];
        for (const id of updateIds) {
            const updatedItem = getItem<DatabaseItemType>({
                id,
                db,
                tableName,
            });
            if (!updatedItem || !updatedItem.data || !updatedItem.success) {
                throw new Error(updatedItem.error?.message || "No item found");
            } else {
                updatedItems.push(updatedItem.data);
            }
        }
        // If the undo group was not supposed to be incremented, decrement all of the undo actions in the most recent group down by one
        if (!incrementUndoGroup && actionWasPerformed)
            decrementLastUndoGroup(db);

        output = {
            success: true,
            data: updatedItems,
        };
    } catch (error: any) {
        output = {
            success: false,
            data: [],
            error: {
                message:
                    error.message || `Error updating items from ${tableName}`,
                stack: error.stack || "Unable to get error stack",
            },
        };

        console.error(`Failed to update items from ${tableName}:`, error);

        // Roll back the changes caused by this action
        if (actionWasPerformed) {
            History.performUndo(db);
            clearMostRecentRedo(db);
        }
    } finally {
        if (incrementUndoGroup) History.incrementUndoGroup(db);
    }
    return output;
}

/**
 * @param db The database connection, or undefined to create a new connection
 * @param ids The ids of the items to delete
 * @param tableName The name of the table to get the item from
 * @param idColumn The column to check with WHERE to delete the row. By default "rowid"
 * @param closeDbOnError Whether to close the database connection if an error occurs, default is true
 * @returns A DatabaseResponse with the deleted item
 */
export function deleteItems<DatabaseItemType extends DefaultDatabaseItem>({
    ids,
    db,
    tableName,
    incrementUndoGroup,
    idColumn = "rowid",
}: {
    ids: Set<number>;
    db: Database.Database;
    tableName: string;
    incrementUndoGroup?: boolean;
    idColumn?: string;
}): DatabaseResponse<DatabaseItemType[] | undefined> {
    const deletedObjects: DatabaseItemType[] = [];
    let output: DatabaseResponse<DatabaseItemType[] | undefined>;
    let currentId: number | undefined;
    const notFoundIds: number[] = [];
    let actionWasPerformed = false;

    // Verify all of the items exist before deleting any of them
    for (const id of ids) {
        if (
            getItem<DatabaseItemType>({ id, db, tableName }).data === undefined
        ) {
            notFoundIds.push(id);
        }
    }
    // Return an error if any of the items do not exist
    if (notFoundIds.length > 0) {
        return {
            success: false,
            data: [],
            error: {
                message: `No items with ids [${notFoundIds.join(
                    ", "
                )}] in table "${tableName}"`,
            },
        };
    }

    try {
        // Increment the undo group so this action can be rolled back if needed
        History.incrementUndoGroup(db);

        for (const id of ids) {
            currentId = id;
            const item = getItem<DatabaseItemType>({
                id,
                db,
                tableName,
            });
            if (!item || !item.success || !item.data) {
                throw new Error(item.error?.message || "No item found");
            } else {
                const stmt = db.prepare(
                    `DELETE FROM ${tableName} WHERE "${idColumn}" = ?`
                );
                stmt.run(id);
                deletedObjects.push(item.data);
                actionWasPerformed = true;
            }
        }

        // If the undo group was not supposed to be incremented, decrement all of the undo actions in the most recent group down by one
        if (!incrementUndoGroup && actionWasPerformed)
            decrementLastUndoGroup(db);

        output = {
            success: true,
            data: deletedObjects,
        };
    } catch (error: any) {
        output = {
            success: false,
            data: undefined,
            error: {
                message:
                    error.message ||
                    `Error deleting item ${currentId} while trying to delete items ${idColumn}"=${ids}`,
                stack: error.stack || "Unable to get error stack",
            },
        };
        console.error(
            `Failed to delete item ${currentId} while trying to delete items ${idColumn}"=${ids}:`,
            error
        );

        // Roll back the changes caused by this action
        if (actionWasPerformed) {
            History.performUndo(db);
            clearMostRecentRedo(db);
        }
    } finally {
        if (incrementUndoGroup) History.incrementUndoGroup(db);
    }
    return output;
}

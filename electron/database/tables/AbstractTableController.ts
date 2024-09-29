import type Database from "better-sqlite3";
import { ipcMain } from "electron";

/**
 * Base class for all tables in the database.
 *
 * @type DatabaseItemType The type of the data in the database. Must have an "id", "updated_at", and "created_at" property
 * @type NewItemArgs The type used to create a new item in the database. Must not have an "id", "updated_at", or "created_at" property
 * @type UpdatedItemArgs The type used to modify an existing item in the database. Must have an "id" property, but not an "updated_at" or "created_at" property
 */
export default abstract class TableController<
    DatabaseItemType extends {
        id: number;
        updated_at: string;
        created_at: string;
    },
    NewItemArgs extends Object,
    UpdatedItemArgs extends { id: number }
> {
    /** Method to connect to the database */
    readonly connect: () => Database.Database;

    /** Method to create the SQL table */
    abstract createTable(db: Database.Database): void;
    /** The name of this table */
    abstract readonly tableName: string;

    /**
     * @param connect Method to connect to the database
     */
    constructor(connect: () => Database.Database) {
        this.connect = connect;
    }

    /**
     * Initiate the ipc communication that the database will use.
     * Call this in electron's main process (or database.services) to set up the CRUD handlers for this table.
     */
    ipcCrudHandlers = (): void => {
        ipcMain.handle(
            `${this.tableName}:insert`,
            (_, newItems: NewItemArgs[]) => this.create({ items: newItems })
        );
        ipcMain.handle(`${this.tableName}:getAll`, () => this.readAll());
        ipcMain.handle(`${this.tableName}:get`, (_, id: number) =>
            this.read({ id })
        );
        ipcMain.handle(
            `${this.tableName}:update`,
            (_, items: UpdatedItemArgs[]) => this.update({ items })
        );
        ipcMain.handle(`${this.tableName}:delete`, (_, id: number) =>
            this.delete({ id })
        );
    };

    /**
     * Builds the insert query for the arguments (e.g. "(name, age) VALUES (@name, @age)")
     *
     * @param args The arguments to build the insert query
     * @returns String with the query
     */
    private insertClause = (args: NewItemArgs) => {
        const keys = Object.keys(args);
        keys.sort();
        const columns = keys.join(", ");
        const values = keys.map((key) => `@${key}`).join(", ");
        return `(${columns}) VALUES (${values})`;
    };

    /**
     * @param db The database connection, or undefined to create a new connection
     * @param items The items to insert
     * @returns The id of the inserted item
     */
    create = ({
        items,
        db,
    }: {
        items: NewItemArgs[];
        db?: Database.Database;
    }): DatabaseResponse<DatabaseItemType[]> => {
        const dbToUse = db || this.connect();
        let output: DatabaseResponse<DatabaseItemType[]> = {
            success: false,
            data: [],
            error: { message: "Failed to insert item" },
        };
        try {
            const newItemIds: number[] = [];
            for (const item of items) {
                // Remove the id from the new item if it exists
                let itemToInsert = item;
                if (Object.keys(item).includes("id")) {
                    const { id, ...rest } = item as any;
                    itemToInsert = rest;
                }

                const created_at = new Date().toISOString();
                const newItem = {
                    ...itemToInsert,
                    created_at,
                    updated_at: created_at,
                };

                const stmt = dbToUse.prepare(
                    `INSERT INTO ${this.tableName} ${this.insertClause(
                        newItem
                    )}`
                );
                const insertResult = stmt.run(newItem);
                const id = insertResult.lastInsertRowid as number;
                newItemIds.push(id);
            }
            const newItems: DatabaseItemType[] = [];
            for (const id of newItemIds) {
                const newItem = this.read({ id, db: dbToUse }).data;
                if (!newItem) {
                    throw new Error(
                        `No item with id ${id} in table "${this.tableName}"`
                    );
                } else {
                    newItems.push(newItem);
                }
            }
            output = {
                success: true,
                data: newItems as DatabaseItemType[],
            };
        } catch (error: any) {
            output = {
                success: false,
                data: [],
                error: {
                    message:
                        error.message ||
                        `Error getting items from ${this.tableName}`,
                    stack: error.stack || "Unable to get error stack",
                },
            };
        } finally {
            if (!db) dbToUse.close();
        }
        return output;
    };

    /**
     * Gets all of the items in the table
     *
     * @param db The database connection, or undefined to create a new connection
     * @returns A DatabaseResponse with all items in the table
     */
    readAll = ({
        db,
    }: {
        db?: Database.Database;
    } = {}): DatabaseResponse<DatabaseItemType[]> => {
        const dbToUse = db || this.connect();
        let output: DatabaseResponse<DatabaseItemType[]>;
        try {
            const stmt = dbToUse.prepare(`SELECT * FROM ${this.tableName}`);
            const result = stmt.all() as DatabaseItemType[];
            output = {
                success: true,
                data: result,
            };
        } catch (error: any) {
            output = {
                success: false,
                data: [],
                error: {
                    message:
                        error.message ||
                        `Error getting items from ${this.tableName}`,
                    stack: error.stack || "Unable to get error stack",
                },
            };
        } finally {
            if (!db) dbToUse.close();
        }
        return output;
    };

    /**
     * Gets a single item from the table. If the item does not exist, an error is returned in the DatabaseResponse.
     *
     * @param db The database connection, or undefined to create a new connection
     * @param id The id of the item to get
     * @returns A DatabaseResponse with the item
     */
    read = ({
        id,
        db,
    }: {
        id: number;
        db?: Database.Database;
    }): DatabaseResponse<DatabaseItemType | undefined> => {
        const dbToUse = db || this.connect();
        let output: DatabaseResponse<DatabaseItemType | undefined>;
        try {
            const stmt = dbToUse.prepare(
                `SELECT * FROM ${this.tableName} WHERE id = ?`
            );
            const result = stmt.get(id) as DatabaseItemType;
            if (!result) {
                output = {
                    success: false,
                    data: result,
                    error: {
                        message: `No item with id ${id} in table "${this.tableName}"`,
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
            if (!db) dbToUse.close();
        }
        return output;
    };

    /**
     * @param db The database connection, or undefined to create a new connection
     * @param items The items to update
     * @returns A DatabaseResponse with the updated items
     */
    update = ({
        items,
        db,
    }: {
        items: UpdatedItemArgs[];
        db?: Database.Database;
    }): DatabaseResponse<DatabaseItemType[]> => {
        // TODO, check that all of the item exist BEFORE updating
        const dbToUse = db || this.connect();

        // Check if all of the items exist
        const notFoundIds: number[] = [];
        const ids = new Set<number>(items.map((item) => item.id));
        ids.forEach((id) => {
            if (this.read({ id, db: dbToUse }).data === undefined) {
                notFoundIds.push(id);
            }
        });
        // Return an error if any of the items do not exist
        if (notFoundIds.length > 0) {
            return {
                success: false,
                data: [],
                error: {
                    message: `No items with ids [${notFoundIds.join(
                        ", "
                    )}] in table "${this.tableName}"`,
                },
            };
        }

        let output: DatabaseResponse<DatabaseItemType[]> = {
            success: false,
            data: [],
            error: { message: "Failed to update item" },
        };
        try {
            const updateIds: number[] = [];
            for (const item of items) {
                const updated_at = new Date().toISOString();
                const updatedItem = {
                    ...item,
                    updated_at,
                };
                // remove the id from the updated item
                const { id, ...rest } = updatedItem;
                const setClause = Object.keys(rest)
                    .map((key) => `${key} = @${key}`)
                    .join(", ");

                if (!Object.keys(updatedItem).includes("id")) {
                    console.warn("No id provided for update, skipping item");
                    continue;
                }
                const stmt = dbToUse.prepare(
                    `UPDATE ${this.tableName} SET ${setClause} WHERE id = @id`
                );
                stmt.run(updatedItem);
                updateIds.push(id);
            }
            const updatedItems: DatabaseItemType[] = [];
            for (const id of updateIds) {
                const updatedItem = this.read({ id, db: dbToUse }).data;
                if (!updatedItem) {
                    console.error(
                        `No item with id ${id} in table "${this.tableName}"`
                    );
                } else {
                    updatedItems.push(updatedItem);
                }
            }
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
                        error.message ||
                        `Error updating items from ${this.tableName}`,
                    stack: error.stack || "Unable to get error stack",
                },
            };
        } finally {
            if (!db) dbToUse.close();
        }
        return output;
    };

    /**
     * @param db The database connection, or undefined to create a new connection
     * @param id The id of the item to delete
     * @returns A DatabaseResponse with the deleted item
     */
    delete = ({
        id,
        db,
    }: {
        id: number;
        db?: Database.Database;
    }): DatabaseResponse<DatabaseItemType | undefined> => {
        const dbToUse = db || this.connect();
        const item = this.read({ id, db: dbToUse });
        let output: DatabaseResponse<DatabaseItemType | undefined>;
        try {
            if (!item || !item.data) {
                output = {
                    success: false,
                    data: undefined,
                    error: {
                        message: `No item with id ${id} in table "${this.tableName}"`,
                    },
                };
            } else {
                const stmt = dbToUse.prepare(
                    `DELETE FROM ${this.tableName} WHERE id = ?`
                );
                stmt.run(id);
                output = {
                    success: true,
                    data: item.data,
                };
            }
        } catch (error: any) {
            output = {
                success: false,
                data: undefined,
                error: {
                    message: error.message || `Error deleting item ${id}`,
                    stack: error.stack || "Unable to get error stack",
                },
            };
            console.error(`Failed to delete item ${id}:`, error);
        } finally {
            if (!db) dbToUse.close();
        }
        return output;
    };
}

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

import Constants from "../../../src/global/Constants";
import Database from "better-sqlite3";
import * as DbActions from "../DatabaseActions";
import * as History from "../database.history";

/**
 * A Shape can have many ShapePages to signify its existence on multiple pages.
 * A ShapePageMarcher is a link between a ShapePage and a Marcher to signify the marcher's position on the ShapePage.
 */

export interface ShapePageMarcher {
    id: number;
    shape_page_id: number;
    marcher_id: number;
    position_order: number;
    created_at: string;
    updated_at: string;
    notes: string | null;
}

export interface NewShapePageMarcherArgs {
    shape_page_id: number;
    marcher_id: number;
    position_order: number;
    notes?: string | null;
}

export interface ModifiedShapePageMarcherArgs {
    id: number;
    position_order?: number;
    notes?: string | null;
}

/**
 * Creates the ShapePageMarcher table in the database.
 * Also sets up undo triggers for history tracking.
 *
 * @param db The database instance
 */
export function createShapePageMarcherTable(db: Database.Database) {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS "${Constants.ShapePageMarcherTableName}" (
                "id"                INTEGER PRIMARY KEY,
                "shape_page_id"     INTEGER NOT NULL REFERENCES "${Constants.ShapePageTableName}" ("id"),
                "marcher_id"        INTEGER NOT NULL REFERENCES "${Constants.MarcherTableName}" ("id"),
                "position_order"    INTEGER,
                "created_at"        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updated_at"        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "notes"             TEXT,
                UNIQUE (shape_page_id, position_order),
                UNIQUE (shape_page_id, marcher_id)
            );
            CREATE INDEX "idx-spm-shape_page_id" ON "${Constants.ShapePageMarcherTableName}" (shape_page_id);
            CREATE INDEX "idx-spm-marcher_id" ON "${Constants.ShapePageMarcherTableName}" (marcher_id);
        `);
        History.createUndoTriggers(db, Constants.ShapePageMarcherTableName);
    } catch (error: any) {
        throw new Error(
            `Failed to create ${Constants.ShapePageMarcherTableName} table: ${error}`,
            error,
        );
    }
}
/**
 * Retrieves all shapePageMarchers from the database
 * @param db The database instance
 * @returns DatabaseResponse containing an array of ShapePageMarcher objects
 */
export function getShapePageMarchers({
    db,
}: {
    db: Database.Database;
}): DbActions.DatabaseResponse<ShapePageMarcher[]> {
    return DbActions.getAllItems<ShapePageMarcher>({
        db,
        tableName: Constants.ShapePageMarcherTableName,
    });
}

/**
 * Increments the position_order of all ShapePageMarcher records with a position_order greater than or equal to the provided positionOrder for the given shapePageId.
 * This is used to shift the position_order of existing records when a new ShapePageMarcher is inserted.
 *
 * If it fails, an error is thrown
 *
 * @param db The database instance
 * @param shapePageId The ID of the ShapePage that the ShapePageMarchers belong to
 * @param positionOrder The position_order to start incrementing from
 */
function incrementPositionOrder({
    db,
    shapePageId,
    positionOrder,
}: {
    db: Database.Database;
    shapePageId: number;
    positionOrder: number;
}): void {
    try {
        const allResponse = DbActions.getItemsByColValue<ShapePageMarcher>({
            db,
            col: "shape_page_id",
            value: shapePageId,
            tableName: Constants.ShapePageMarcherTableName,
        });
        if (allResponse.error)
            throw new Error(
                `Error getting all ShapePageMarchers: ${allResponse.error}`,
            );
        const allShapePageSpms = allResponse.data.sort(
            (a, b) => a.position_order - b.position_order,
        );
        const positionIndex = allShapePageSpms.findIndex(
            (spm) => spm.position_order === positionOrder,
        );

        // If there are no SPMs for the given shapePageId or there are no SPMs with the specified position_order, return early
        if (allResponse.data.length === 0 || positionIndex === -1) return;

        const modifiedSpms: ModifiedShapePageMarcherArgs[] = [];
        for (let i = positionIndex; i < allShapePageSpms.length; i++) {
            const spm = allShapePageSpms[i];
            modifiedSpms.push({
                id: spm.id,
                position_order: positionOrder + (i - positionIndex) + 1,
            });
        }
        // reverse the order of the modifiedSpms array so that the unique constraint is not violated
        modifiedSpms.reverse();

        const response = DbActions.updateItems<
            ShapePageMarcher,
            ModifiedShapePageMarcherArgs
        >({
            db,
            tableName: Constants.ShapePageMarcherTableName,
            items: modifiedSpms,
            printHeaders: false,
            useNextUndoGroup: false,
        });
        if (!response.success) throw new Error(response.error?.message ?? "");
    } catch (error: any) {
        throw new Error(
            `Error incrementing position_order on ShapePageMarcher: ${error}`,
        );
    }
}

/**
 * Flattens the position_order values for all ShapePageMarcher records associated with the given shapePageId.
 * This ensures that the position_order values are sequential and contiguous.
 * If it fails, an error is thrown
 *
 * @param db The database instance
 * @param shapePageId The ID of the ShapePage associated with the ShapePageMarchers to be flattened
 * @returns void
 */
function flattenOrder({
    db,
    shapePageId,
}: {
    db: Database.Database;
    shapePageId: number;
}): void {
    try {
        // Get all SPMs for the given shapePageId
        const allResponse = DbActions.getItemsByColValue<ShapePageMarcher>({
            db,
            col: "shape_page_id",
            value: shapePageId,
            tableName: Constants.ShapePageMarcherTableName,
        });

        if (allResponse.error) {
            throw new Error(
                `Error getting all ShapePageMarchers: ${allResponse.error}`,
            );
        }

        // Sort SPMs by position_order
        const sortedSpms = allResponse.data.sort(
            (a, b) => a.position_order - b.position_order,
        );

        // Create array of modified SPMs with incremental position_order values
        const modifiedSpms: ModifiedShapePageMarcherArgs[] = [];
        sortedSpms.forEach((spm, index) => {
            const newIndex = index + 1;
            if (spm.position_order !== newIndex)
                modifiedSpms.push({
                    id: spm.id,
                    position_order: index + 1,
                });
        });

        // Update all SPMs with new position_order values
        const response = DbActions.updateItems<
            ShapePageMarcher,
            ModifiedShapePageMarcherArgs
        >({
            db,
            tableName: Constants.ShapePageMarcherTableName,
            items: modifiedSpms,
            printHeaders: false,
            useNextUndoGroup: false,
        });

        if (!response.success) {
            throw new Error(response.error?.message ?? "");
        }
    } catch (error: any) {
        throw new Error(
            `Error flattening position_order on ShapePageMarcher: ${error}`,
        );
    }
}

/**
 * Creates new shapePageMarchers in the database
 * @param db The database instance
 * @param args Array of NewShapePageMarcherArgs containing name and optional notes
 * @returns DatabaseResponse containing the created Shape objects
 */
export function createShapePageMarchers({
    db,
    args,
}: {
    db: Database.Database;
    args: NewShapePageMarcherArgs[];
}): DbActions.DatabaseResponse<ShapePageMarcher[]> {
    let output: DbActions.DatabaseResponse<ShapePageMarcher[]>;
    const createdSPMIds: Set<number> = new Set();
    console.log("\n=========== start createShapePageMarchers ===========");
    // Track if any action was performed so that we can undo if necessary
    let actionWasPerformed = false;

    try {
        History.incrementUndoGroup(db);

        // Loop through the new SPMs and create them in the database, maintaining the linked list when necessary
        for (const newItem of args) {
            // Check if there is an item with the same position_order and shape_page_id
            const existingItemWithPositionOrder = db
                .prepare(
                    `SELECT * FROM "${Constants.ShapePageMarcherTableName}" WHERE shape_page_id = ? AND position_order = ?`,
                )
                .get(newItem.shape_page_id, newItem.position_order);
            // If there is an existing item, increment the position_order of all items with a position_order greater than or equal to the existing item's position_order
            if (existingItemWithPositionOrder) {
                // Throws an error if the incrementPositionOrder function fails
                incrementPositionOrder({
                    db,
                    shapePageId: newItem.shape_page_id,
                    positionOrder: newItem.position_order,
                });
                actionWasPerformed = true;
            }
            // Create the new item
            const response = DbActions.createItems<
                ShapePageMarcher[],
                NewShapePageMarcherArgs
            >({
                db,
                tableName: Constants.ShapePageMarcherTableName,
                items: [newItem],
                printHeaders: false,
                useNextUndoGroup: false,
            });
            if (!response.success)
                throw new Error(response.error?.message ?? "");
            actionWasPerformed = true;
        }
        const createdSpms = DbActions.getAllItems<ShapePageMarcher>({
            db,
            tableName: Constants.ShapePageMarcherTableName,
        }).data.filter((spm) => !createdSPMIds.has(spm.id));
        output = {
            success: true,
            data: createdSpms,
        };

        // Flatten the order of the shape page marchers
        const shapePageIdsThatWereModified = new Set<number>();
        for (const spm of output.data) {
            shapePageIdsThatWereModified.add(spm.shape_page_id);
        }
        for (const shapePageId of shapePageIdsThatWereModified)
            flattenOrder({ db, shapePageId });
    } catch (error: any) {
        console.error(
            "Error creating ShapePageMarchers. Rolling back changes.",
            error,
        );
        if (actionWasPerformed) {
            History.performUndo(db);
            History.clearMostRecentRedo(db);
        }
        output = {
            success: false,
            error: {
                message: error,
                stack: error.stack || "could not get stack",
            },
            data: [],
        };
    } finally {
        console.log("=========== end createShapePageMarchers ===========\n");
    }

    return output;
}

/**
 * Updates existing shapePageMarchers in the database.
 *
 * When updating an item's position_order, the position_order of the item is incremented by 1 for all items with a position_order greater than or equal to the updated item's position_order.
 * E.g. [a:1,b:2,c:3,d:4,e:5] when updating c to position_order 5 becomes [a:1,b:2,d:4,c:5,e:6]
 *
 * @param db The database instance
 * @param args Array of ModifiedShapePageMarcherArgs containing id and optional name/notes updates
 * @returns DatabaseResponse containing the updated Shape objects
 */
export function updateShapePageMarchers({
    db,
    args,
}: {
    db: Database.Database;
    args: ModifiedShapePageMarcherArgs[];
}): DbActions.DatabaseResponse<ShapePageMarcher[]> {
    let output: DbActions.DatabaseResponse<ShapePageMarcher[]>;
    const updatedSpmIds = new Set<number>();
    console.log("\n=========== start updateShapePageMarchers ===========");
    // Track if any action was performed so that we can undo if necessary
    let actionWasPerformed = false;

    try {
        History.incrementUndoGroup(db);

        // Loop through the new SPMs and create them in the database, maintaining the linked list when necessary
        for (const updatedItem of args) {
            // If the position_order is being updated, increment the position_order of all items with a position_order greater than or equal to the updated item's position_order
            if (updatedItem.position_order !== undefined) {
                const itemToUpdate = DbActions.getItem<ShapePageMarcher>({
                    db,
                    tableName: Constants.ShapePageMarcherTableName,
                    id: updatedItem.id,
                }).data;
                if (!itemToUpdate) throw new Error("Item to update not found");
                // Check if there is an item with the same position_order and shape_page_id
                const existingItem = db
                    .prepare(
                        `SELECT * FROM "${Constants.ShapePageMarcherTableName}" WHERE shape_page_id = ? AND position_order = ?`,
                    )
                    .get(
                        itemToUpdate.shape_page_id,
                        updatedItem.position_order,
                    );
                // If there is an existing item, increment the position_order of all items with a position_order greater than or equal to the existing item's position_order
                if (existingItem) {
                    // Throws an error if the incrementPositionOrder function fails
                    incrementPositionOrder({
                        db,
                        shapePageId: itemToUpdate.shape_page_id,
                        positionOrder: updatedItem.position_order,
                    });
                    actionWasPerformed = true;
                }
            }
            // Create the new item
            const response = DbActions.updateItems<
                ShapePageMarcher[],
                ModifiedShapePageMarcherArgs
            >({
                db,
                tableName: Constants.ShapePageMarcherTableName,
                items: [updatedItem],
                printHeaders: false,
                useNextUndoGroup: false,
            });
            if (!response.success)
                throw new Error(response.error?.message ?? "");
            actionWasPerformed = true;
            updatedSpmIds.add(updatedItem.id);
        }

        const updatedSPMs = DbActions.getAllItems<ShapePageMarcher>({
            db,
            tableName: Constants.ShapePageMarcherTableName,
        }).data.filter((spm) => updatedSpmIds.has(spm.id));
        output = {
            success: true,
            data: updatedSPMs,
        };

        // Flatten the order of the shape page marchers
        const shapePageIdsThatWereModified = new Set<number>();
        for (const spm of output.data) {
            shapePageIdsThatWereModified.add(spm.shape_page_id);
        }
        for (const shapePageId of shapePageIdsThatWereModified)
            flattenOrder({ db, shapePageId });
    } catch (error: any) {
        console.error(
            "Error updating ShapePageMarchers. Rolling back changes.",
            error,
        );
        if (actionWasPerformed) {
            History.performUndo(db);
            History.clearMostRecentRedo(db);
        }
        output = {
            success: false,
            error: {
                message: error,
                stack: error.stack || "could not get stack",
            },
            data: [],
        };
    } finally {
        console.log("=========== end updateShapePageMarchers ===========\n");
    }

    return output;
}

/**
 * Deletes shapePageMarchers from the database by their IDs
 *
 * @param db The database instance
 * @param ids Set of shape IDs to delete
 * @returns DatabaseResponse containing the deleted Shape objects
 */
export function deleteShapePageMarchers({
    db,
    ids,
}: {
    db: Database.Database;
    ids: Set<number>;
}): DbActions.DatabaseResponse<ShapePageMarcher[]> {
    console.log("=========== begin deleteShapePageMarchers ===========");
    let output: DbActions.DatabaseResponse<ShapePageMarcher[]>;

    try {
        output = DbActions.deleteItems<ShapePageMarcher>({
            db,
            tableName: Constants.ShapePageMarcherTableName,
            ids,
            printHeaders: false,
        });

        // Flatten the order of the shape page marchers
        const shapePageIdsThatWereModified = new Set<number>();
        for (const spm of output.data) {
            shapePageIdsThatWereModified.add(spm.shape_page_id);
        }
        for (const shapePageId of shapePageIdsThatWereModified)
            flattenOrder({ db, shapePageId });
    } catch (error: any) {
        console.error(
            "Error deleting ShapePageMarcher. Rolling back changes.",
            error,
        );
        output = {
            success: false,
            error: {
                message: error,
                stack: error.stack || "could not get stack",
            },
            data: [],
        };
    } finally {
        console.log("=========== end deleteShapePageMarchers ===========\n");
    }

    return output;
}

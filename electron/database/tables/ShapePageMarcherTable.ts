import Constants from "../../../src/global/Constants";
import Database from "better-sqlite3";
import * as DbActions from "../DatabaseActions";
import * as History from "../database.history";
import { deleteShapePages, ShapePage } from "./ShapePageTable";

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
 * Retrieves all shapePageMarchers from the database or filters by shapePageId.
 *
 * @param db The database instance
 * @param shapePageId The shapePageId to filter by. If undefined, SPMs with all page_ids are returned
 * @param marcherIds The marcherIds to filter by.  If undefined, SPMs with all marcher_ids are returned
 * @returns DatabaseResponse containing an array of ShapePageMarcher objects
 */
export function getShapePageMarchers({
    db,
    shapePageId,
    marcherIds,
}: {
    db: Database.Database;
    shapePageId?: number;
    marcherIds?: Set<number>;
}): DbActions.DatabaseResponse<ShapePageMarcher[]> {
    let response: DbActions.DatabaseResponse<ShapePageMarcher[]>;
    if (shapePageId !== undefined)
        response = DbActions.getItemsByColValue<ShapePageMarcher>({
            db,
            tableName: Constants.ShapePageMarcherTableName,
            col: "shape_page_id",
            value: shapePageId,
        });
    else
        response = DbActions.getAllItems<ShapePageMarcher>({
            db,
            tableName: Constants.ShapePageMarcherTableName,
        });

    let outputData = response.data;
    if (marcherIds)
        outputData = outputData.filter((spm) => marcherIds.has(spm.marcher_id));
    return { ...response, data: outputData };
}

/**
 * Retrieves a single ShapePageMarcher record from the database based on the provided marcher_id and page_id.
 *
 * @param db The database instance
 * @param marcherPage An object containing the marcher_id and page_id to filter the query
 * @returns A DatabaseResponse containing the matching ShapePageMarcher record, or null if no record is found
 */
export function getSpmByMarcherPage({
    db,
    marcherPage,
}: {
    db: Database.Database;
    marcherPage: { marcher_id: number; page_id: number };
}): DbActions.DatabaseResponse<ShapePageMarcher | null> {
    let output: DbActions.DatabaseResponse<ShapePageMarcher | null>;
    try {
        const response = db
            .prepare(
                `SELECT spm.id as spm_id FROM ${Constants.ShapePageMarcherTableName} spm
                INNER JOIN ${Constants.ShapePageTableName} sp ON sp.id = spm.shape_page_id
                WHERE "marcher_id" = (@marcher_id) AND "page_id" = (@page_id)`,
            )
            .get({
                marcher_id: marcherPage.marcher_id,
                page_id: marcherPage.page_id,
            }) as { spm_id: number };
        if (response) {
            const spmId = response.spm_id;
            const spmResponse = DbActions.getItem<ShapePageMarcher>({
                db,
                tableName: Constants.ShapePageMarcherTableName,
                id: spmId,
            });
            return {
                ...spmResponse,
                data: spmResponse.data ?? null,
            };
        } else
            output = {
                success: true,
                data: null,
            };
    } catch (error: any) {
        output = {
            success: false,
            data: null,
            error: {
                message: `Failed to get ShapePageMarcher by marcherPage ${JSON.stringify(marcherPage)}: ${error}\n`,
                stack: error.stack || "Unable to get stack trace",
            },
        };
    }
    return output;
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
            const newIndex = index;
            if (spm.position_order !== newIndex) {
                modifiedSpms.push({
                    id: spm.id,
                    position_order: index + 1,
                });
            }
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
 * @param isChildAction Whether the action is a child action of another action
 * @param force If a marcher is already assigned to a shapePage on the same page, delete that shapePage to allow the new SPM to be created
 * @returns DatabaseResponse containing the created Shape objects
 */
export function createShapePageMarchers({
    db,
    args,
    isChildAction = false,
    force = false,
}: {
    db: Database.Database;
    args: NewShapePageMarcherArgs[];
    isChildAction?: boolean;
    force?: boolean;
}): DbActions.DatabaseResponse<ShapePageMarcher[]> {
    let output: DbActions.DatabaseResponse<ShapePageMarcher[]>;
    const createdSPMIds: Set<number> = new Set();
    if (!isChildAction)
        console.log("\n=========== start createShapePageMarchers ===========");
    else
        console.log(
            "=========== start createShapePageMarchers (child action) ===========",
        );
    // Track if any action was performed so that we can undo if necessary
    let actionWasPerformed = false;

    try {
        if (!isChildAction) History.incrementUndoGroup(db);

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

            const shapePage = DbActions.getItem<ShapePage>({
                db,
                tableName: Constants.ShapePageTableName,
                id: newItem.shape_page_id,
            });
            if (!shapePage.success)
                throw new Error(shapePage.error?.message ?? "");
            if (!shapePage.data)
                throw new Error(
                    `ShapePage for this SPM not found: id ${newItem.shape_page_id}`,
                );

            const shapePagesForThisPage =
                DbActions.getItemsByColValue<ShapePage>({
                    db,
                    tableName: Constants.ShapePageTableName,
                    col: "page_id",
                    value: shapePage.data.page_id,
                });
            const shapePageIds = new Set(
                shapePagesForThisPage.data.map((sp) => sp.id),
            );

            let shapePageMarchersForThisMarcher = getShapePageMarchers({
                db,
                marcherIds: new Set([newItem.marcher_id]),
            });
            if (!shapePageMarchersForThisMarcher.success)
                throw new Error(
                    "Error getting shapePageMarchersForThisMarcher ",
                );

            if (force) {
                const conflictingShapePageIds =
                    shapePageMarchersForThisMarcher.data
                        .filter((spm) => shapePageIds.has(spm.shape_page_id))
                        .map((spm) => spm.shape_page_id);

                console.log(
                    `Deleting conflicting shape pages:`,
                    conflictingShapePageIds,
                );

                const deleteShapePagesResponse = deleteShapePages({
                    db,
                    ids: new Set(conflictingShapePageIds),
                    isChildAction: true,
                });

                if (!deleteShapePagesResponse.success) {
                    throw new Error(
                        `Error deleting conflicting shape pages: ${deleteShapePagesResponse.error?.message}`,
                    );
                }

                // Re-fetch the shapePageMarchers for this marcher to ensure they are up to date after deletion
                shapePageMarchersForThisMarcher = getShapePageMarchers({
                    db,
                    marcherIds: new Set([newItem.marcher_id]),
                });
                if (!shapePageMarchersForThisMarcher.success)
                    throw new Error(
                        "Error getting shapePageMarchersForThisMarcher ",
                    );
            }

            // Even if force is true, still do this check to prevent erroneous shape page creation
            const marcherAndPageCombinationExists =
                shapePageMarchersForThisMarcher.data.some((spm) =>
                    shapePageIds.has(spm.shape_page_id),
                );

            if (marcherAndPageCombinationExists) {
                throw new Error(
                    `ShapePageMarcher with marcher_id ${newItem.marcher_id} and page_id ${shapePage.data.page_id} already exists`,
                );
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
        const rollBackChanges = actionWasPerformed && !isChildAction;
        const errorMessage =
            "Error creating ShapePageMarchers. " +
            (rollBackChanges
                ? "Rolling back changes."
                : "Not rolling back changes.");
        console.error(errorMessage, error);
        if (rollBackChanges) {
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
        if (!isChildAction)
            console.log(
                "=========== end createShapePageMarchers ===========\n",
            );
        else
            console.log(
                "=========== end createShapePageMarchers (child action) ===========",
            );
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
 * Swaps the position order of two ShapePageMarcher objects in the database.
 *
 * @param db - The database instance to use.
 * @param spmId1 - The ID of the first ShapePageMarcher object.
 * @param spmId2 - The ID of the second ShapePageMarcher object.
 * @param useNextUndoGroup - Whether to use the next undo group for the operation (optional).
 * @returns A DatabaseResponse containing the updated ShapePageMarcher objects.
 */
export function swapPositionOrder({
    db,
    spmId1,
    spmId2,
    useNextUndoGroup = true,
}: {
    db: Database.Database;
    spmId1: number;
    spmId2: number;
    useNextUndoGroup?: boolean;
}): DbActions.DatabaseResponse<ShapePageMarcher[]> {
    console.log("=========== begin swapPositionOrder ===========");
    let output: DbActions.DatabaseResponse<ShapePageMarcher[]>;
    const spm1Response = DbActions.getItem<ShapePageMarcher>({
        db,
        tableName: Constants.ShapePageMarcherTableName,
        id: spmId1,
    });
    const spm2Response = DbActions.getItem<ShapePageMarcher>({
        db,
        tableName: Constants.ShapePageMarcherTableName,
        id: spmId2,
    });
    if (!spm1Response.success || !spm2Response.success) {
        output = {
            success: false,
            error: {
                message:
                    "Error getting shape page marchers" +
                    spm1Response.error?.message +
                    spm2Response.error?.message,
                stack: spm1Response.error?.stack || spm2Response.error?.stack,
            },
            data: [],
        };
        return output;
    }
    if (spm1Response.data === undefined || spm2Response.data === undefined) {
        output = {
            success: false,
            error: {
                message:
                    spm1Response.data === null && spm2Response.data === null
                        ? `SPM with id ${spmId1} and SPM with id ${spmId2} not found`
                        : spm1Response.data === null
                          ? `SPM with id ${spmId1} not found`
                          : `SPM with id ${spmId2} not found`,

                stack: "No stack",
            },
            data: [],
        };
        return output;
    }

    if (spm1Response.data.shape_page_id !== spm2Response.data.shape_page_id) {
        output = {
            success: false,
            error: {
                message:
                    "ShapePageMarchers must be on the same shape page to be swapped",
                stack: "No stack",
            },
            data: [],
        };
        return output;
    }
    const spm1 = spm1Response.data;
    const spm2 = spm2Response.data;
    History.incrementUndoGroup(db);
    const deleteSql = db.prepare(
        `UPDATE ${Constants.ShapePageMarcherTableName} SET position_order = NULL WHERE id = ?`,
    );
    deleteSql.run(spm1.id);
    deleteSql.run(spm2.id);

    const updateSql = db.prepare(
        `UPDATE ${Constants.ShapePageMarcherTableName} SET position_order = ? WHERE id = ?`,
    );
    updateSql.run(spm2.position_order, spm1.id);
    updateSql.run(spm1.position_order, spm2.id);

    const newSpm1 = DbActions.getItem<ShapePageMarcher>({
        db,
        tableName: Constants.ShapePageMarcherTableName,
        id: spm1.id,
    });
    const newSpm2 = DbActions.getItem<ShapePageMarcher>({
        db,
        tableName: Constants.ShapePageMarcherTableName,
        id: spm2.id,
    });
    if (
        !newSpm1.success ||
        !newSpm2.success ||
        !newSpm1.data ||
        !newSpm2.data
    ) {
        console.error(
            "Error swapping shape page marchers. Rolling back changes.",
            newSpm1.error,
            newSpm2.error,
        );
        History.performUndo(db);
        History.clearMostRecentRedo(db);
        output = {
            success: false,
            error: {
                message:
                    "Error swapping shape page marchers. Rolling back changes.",
                stack: "No stack",
            },
            data: [],
        };
        return output;
    }

    if (useNextUndoGroup) {
        History.decrementLastUndoGroup(db);
    }

    return {
        success: true,
        data: [newSpm1.data, newSpm2.data],
    };
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

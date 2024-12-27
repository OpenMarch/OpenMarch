import Constants from "../../../src/global/Constants";
import Database from "better-sqlite3";
import * as DbActions from "../DatabaseActions";
import { DatabaseResponse } from "../DatabaseActions";
import * as History from "../database.history";
import { createShapePageMarchers } from "./ShapePageMarcherTable";
import { ModifiedMarcherPageArgs } from "../../../src/global/classes/MarcherPage";
import { updateMarcherPages } from "./MarcherPageTable";
import { createShapes, Shape } from "./ShapeTable";

export interface ShapePage {
    id: number;
    shape_id: number;
    page_id: number;
    svg_path: string;
    created_at: string;
    updated_at: string;
    notes: string | null;
}

export interface NewShapePageArgs {
    marcher_coordinates: {
        marcher_id: number;
        x: number;
        y: number;
    }[];
    shape_id?: number;
    page_id: number;
    svg_path: string;
    notes?: string | null;
}
interface ActualNewShapePageArgs {
    shape_id: number;
    page_id: number;
    svg_path: string;
    notes?: string | null;
}

export interface ModifiedShapePageArgs {
    marcher_coordinates?: {
        marcher_id: number;
        x: number;
        y: number;
    }[];
    id: number;
    svg_path?: string;
    notes?: string | null;
}

/**
 * Creates the ShapePage table in the database with columns for id, name, timestamps, and notes.
 * Also sets up undo triggers for history tracking.
 * @param db The database instance
 */
export function createShapePageTable(db: Database.Database) {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS "${Constants.ShapePageTableName}" (
                "id"            INTEGER PRIMARY KEY,
                "shape_id"      INTEGER NOT NULL,
                "page_id"       INTEGER NOT NULL,
                "svg_path"      TEXT NOT NULL,
                "created_at"    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updated_at"    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "notes"         TEXT,
                FOREIGN KEY (shape_id) REFERENCES "${Constants.ShapeTableName}" ("id") ON DELETE CASCADE,
                FOREIGN KEY (page_id) REFERENCES "${Constants.PageTableName}" ("id") ON DELETE CASCADE,
                UNIQUE (shape_id, page_id)
            );
        `);
        History.createUndoTriggers(db, Constants.ShapePageTableName);
    } catch (error) {
        throw new Error(
            `Failed to create ${Constants.ShapePageTableName} table: ${error}`,
        );
    }
}
/**
 * Retrieves all ShapePages from the database
 * @param db The database instance
 * @returns DatabaseResponse containing an array of ShapePage objects
 */
export function getShapePages({
    db,
}: {
    db: Database.Database;
}): DatabaseResponse<ShapePage[]> {
    return DbActions.getAllItems<ShapePage>({
        db,
        tableName: Constants.ShapePageTableName,
    });
}

/**
 * Updates the MarcherPages associated with the provided ShapePage.
 * This function retrieves the ShapePageMarchers for the given ShapePage,
 * calculates new coordinates for the Marchers along the ShapePage's SVG path,
 * and then updates the MarcherPages in the database with the new coordinates.
 *
 * @param db The database instance
 * @param shapePage The ShapePage for which to update the associated MarcherPages
 * @param
 * @throws Error if there is an issue retrieving the ShapePageMarchers or updating the MarcherPages
 */
function updateChildMarcherPages({
    db,
    pageId,
    marcherCoordinates,
}: {
    db: Database.Database;
    pageId: number;
    marcherCoordinates: {
        marcher_id: number;
        x: number;
        y: number;
    }[];
}) {
    const marcherPageUpdates: ModifiedMarcherPageArgs[] =
        marcherCoordinates.map((coordinate) => {
            return {
                marcher_id: coordinate.marcher_id,
                page_id: pageId,
                x: coordinate.x,
                y: coordinate.y,
            };
        });
    // Update the MarcherPages in the database
    const updateMarcherPagesResponse = updateMarcherPages({
        db,
        marcherPageUpdates,
        isChildAction: true,
    });
    if (!updateMarcherPagesResponse.success)
        throw new Error(
            `Failed to get update child MarcherPages: ${updateMarcherPagesResponse.error?.message}\n`,
        );
}

/**
 * Creates new ShapePages in the database
 *
 * @param db The database instance
 * @param args Array of NewShapePageArgs containing name and optional notes
 * @returns DatabaseResponse containing the created Shape objects
 */
export function createShapePages({
    db,
    args,
}: {
    db: Database.Database;
    args: NewShapePageArgs[];
}): DatabaseResponse<ShapePage[]> {
    if (args.length === 0)
        return {
            success: false,
            data: [],
            error: { message: "No ShapePages to create" },
        };

    let output: DbActions.DatabaseResponse<ShapePage[]>;
    const createdShapePages: ShapePage[] = [];
    console.log("\n=========== start createShapePages ===========");

    // Track if any action was performed so that we can undo if necessary
    let actionWasPerformed = false;

    try {
        History.incrementUndoGroup(db);
        for (const newShapePage of args) {
            let shapeIdToUse = newShapePage.shape_id;
            // If no shape_id is provided, create a new shape
            if (shapeIdToUse === undefined) {
                const createdShapeResponse = createShapes({
                    db,
                    args: [{}],
                    isChildAction: true,
                });
                if (!createdShapeResponse.success)
                    throw new Error(
                        `Failed to create Shape: ${createdShapeResponse.error?.message}\n`,
                    );
                shapeIdToUse = createdShapeResponse.data[0].id;
                actionWasPerformed = true;
            }

            // Create the ShapePage
            const { marcher_coordinates, ...shapePageToCreate } = {
                ...newShapePage,
                shape_id: shapeIdToUse,
            };
            const createdShapePageResponse = DbActions.createItems<
                ShapePage,
                ActualNewShapePageArgs
            >({
                db,
                items: [shapePageToCreate],
                tableName: Constants.ShapePageTableName,
                printHeaders: false,
                useNextUndoGroup: false,
            });
            if (!createdShapePageResponse.success)
                throw new Error(
                    `Failed to create ShapePages: ${createdShapePageResponse.error?.message}\n`,
                );
            actionWasPerformed = true;
            createdShapePages.push(createdShapePageResponse.data[0]);

            // Create needed ShapePageMarchers
            const marcherIds = newShapePage.marcher_coordinates.map(
                (coordinate) => coordinate.marcher_id,
            );
            const spmsToCreate = marcherIds.map((marcher_id, i) => {
                return {
                    shape_page_id: createdShapePageResponse.data[0].id,
                    marcher_id,
                    position_order: i,
                };
            });
            const createSpmResponse = createShapePageMarchers({
                db,
                args: spmsToCreate,
                isChildAction: true,
            });
            if (!createSpmResponse.success)
                throw new Error(
                    `Error creating StaticMarcherShape: ${createSpmResponse.error?.message}`,
                );

            // Update MarcherPages with new coordinates
            updateChildMarcherPages({
                db,
                pageId: newShapePage.page_id,
                marcherCoordinates: newShapePage.marcher_coordinates,
            });
        }
        output = {
            success: true,
            data: createdShapePages,
        };
    } catch (error: any) {
        const rollBackChanges = actionWasPerformed;
        const errorMessage =
            "Error creating ShapePages. " +
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
        console.log("=========== end createShapePages ===========\n");
    }

    return output;
}

/**
 * Updates existing ShapePages in the database.
 * This also updates the MarcherPages that are associated with the ShapePages.
 *
 * @param db The database instance
 * @param args Array of ModifiedShapePageArgs containing id and optional name/notes updates
 * @returns DatabaseResponse containing the updated Shape objects
 */
export function updateShapePages({
    db,
    args,
}: {
    db: Database.Database;
    args: ModifiedShapePageArgs[];
}): DatabaseResponse<ShapePage[]> {
    let output: DbActions.DatabaseResponse<ShapePage[]>;
    const updatedShapePageIds = new Set<number>();
    console.log("\n=========== start updateShapePages ===========");
    // Track if any action was performed so that we can undo if necessary
    let actionWasPerformed = false;

    try {
        History.incrementUndoGroup(db);
        for (const updatedShapePage of args) {
            const { marcher_coordinates, ...updatedShapePageToUse } =
                updatedShapePage;
            // Update the ShapePage in the database
            const updateShapePageResponse = DbActions.updateItems<
                ShapePage,
                ModifiedShapePageArgs
            >({
                db,
                items: [updatedShapePageToUse],
                tableName: Constants.ShapePageTableName,
                printHeaders: false,
                useNextUndoGroup: false,
            });
            if (!updateShapePageResponse.success)
                throw new Error(
                    `Failed to update ShapePage: ${updateShapePageResponse.error?.message}\n`,
                );
            actionWasPerformed = true;
            updatedShapePageIds.add(updatedShapePage.id);

            // If the SVG path was updated, update the MarcherShapes that are associated with this ShapePage
            if (updatedShapePage.svg_path !== undefined) {
                if (!updatedShapePage.marcher_coordinates) {
                    throw new Error(
                        "New SVG path was set but no marcher coordinates were provided.",
                    );
                }
                const thisShapePageResponse = DbActions.getItem<ShapePage>({
                    db,
                    tableName: Constants.ShapePageTableName,
                    id: updatedShapePage.id,
                });
                if (
                    !thisShapePageResponse.success ||
                    !thisShapePageResponse.data
                )
                    throw new Error(
                        `Failed to get this ShapePage: ${thisShapePageResponse.error?.message}\n`,
                    );
                updateChildMarcherPages({
                    db,
                    pageId: thisShapePageResponse.data.page_id,
                    marcherCoordinates: updatedShapePage.marcher_coordinates,
                });
            }
        }
        const allModifiedShapePages = getShapePages({ db }).data.filter((sp) =>
            updatedShapePageIds.has(sp.id),
        );
        output = {
            success: true,
            data: allModifiedShapePages,
        };
    } catch (error: any) {
        console.error(
            "Error updating ShapePages. Rolling back changes.",
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
        console.log("=========== end updateShapePages ===========\n");
    }

    return output;
}

/**
 * Deletes ShapePages from the database by their IDs
 *
 * @param db The database instance
 * @param ids Set of ShapePage IDs to delete
 * @returns DatabaseResponse containing the deleted Shape objects
 */
export function deleteShapePages({
    db,
    ids,
}: {
    db: Database.Database;
    ids: Set<number>;
}): DatabaseResponse<ShapePage[]> {
    console.log("\n=========== start deleteShapePages ===========");
    History.incrementUndoGroup(db);
    const response = DbActions.deleteItems<ShapePage>({
        db,
        tableName: Constants.ShapePageTableName,
        ids,
        useNextUndoGroup: false,
        printHeaders: false,
    });

    // Check if the shape that belonged to the deleted shapePage still has any shapePages referencing it
    const shapeIds = response.data.map((sp) => sp.shape_id);
    const allShapePages = getShapePages({ db }).data;
    const shapeIdsWithShapePages = new Set(
        allShapePages.map((sp) => sp.shape_id),
    );
    const shapeIdsWithNoShapePages = shapeIds.filter(
        (shapeId) => !shapeIdsWithShapePages.has(shapeId),
    );

    console.log(
        "Shape has no more shapePages referencing it. Deleting shape with ids:",
        shapeIdsWithNoShapePages,
    );
    const deleteShapeResponse = DbActions.deleteItems<Shape>({
        db,
        tableName: Constants.ShapeTableName,
        ids: new Set(shapeIdsWithNoShapePages),
        useNextUndoGroup: false,
        printHeaders: false,
    });

    if (!deleteShapeResponse.success) {
        console.error(
            "Error deleting shapes with no shapePages referencing them:",
            deleteShapeResponse.error,
        );
    }
    console.log("=========== end deleteShapePages ===========\n");

    return response;
}

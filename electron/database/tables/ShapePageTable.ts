import Constants from "../../../src/global/Constants";
import Database from "better-sqlite3";
import * as DbActions from "../DatabaseActions";
import { DatabaseResponse } from "../DatabaseActions";
import * as History from "../database.history";
import { getShapePageMarchers } from "./ShapePageMarcherTable";
import { ModifiedMarcherPageArgs } from "../../../src/global/classes/MarcherPage";
import { StaticMarcherShape } from "../../../src/global/classes/canvasObjects/StaticMarcherShape";
import { updateMarcherPages } from "./MarcherPageTable";

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
    shape_id: number;
    page_id: number;
    svg_path: string;
    notes?: string | null;
}

export interface ModifiedShapePageArgs {
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
 * @throws Error if there is an issue retrieving the ShapePageMarchers or updating the MarcherPages
 */
function updateChildMarcherPages({
    db,
    shapePage,
}: {
    db: Database.Database;
    shapePage: ShapePage;
}) {
    // Get all of the ShapePageMarchers that are associated with this ShapePage
    const shapePageMarchersResponse = getShapePageMarchers({
        db,
        shapePageId: shapePage.id,
    });
    if (!shapePageMarchersResponse.success)
        throw new Error(
            `Failed to get ShapePageMarchers: ${shapePageMarchersResponse.error?.message}\n`,
        );
    const marcherIds: { id: number }[] = shapePageMarchersResponse.data.map(
        (spm) => {
            return { id: spm.marcher_id };
        },
    );
    if (marcherIds.length > 0) {
        // Get the new coordinates for the marcher shapes
        const newCoordinates = StaticMarcherShape.distributeAlongPath({
            itemIds: marcherIds,
            svgPath: shapePage?.svg_path,
        });
        const marcherPageUpdates: ModifiedMarcherPageArgs[] =
            newCoordinates.map((coordinate) => {
                return {
                    marcher_id: coordinate.id,
                    page_id: shapePage.page_id,
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
                `Failed to get update child MarcherPages: ${shapePageMarchersResponse.error?.message}\n`,
            );
    }
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
    const createdShapePages = new Set<number>();
    console.log("\n=========== start createShapePages ===========");

    // Track if any action was performed so that we can undo if necessary
    let actionWasPerformed = false;

    try {
        History.incrementUndoGroup(db);
        const createdShapePagesResponse = DbActions.createItems<
            ShapePage,
            NewShapePageArgs
        >({
            db,
            items: args,
            tableName: Constants.ShapePageTableName,
            printHeaders: false,
            useNextUndoGroup: false,
        });
        if (!createdShapePagesResponse.success)
            throw new Error(
                `Failed to create ShapePages: ${createdShapePagesResponse.error?.message}\n`,
            );
        actionWasPerformed = true;
        for (const createdShapePage of createdShapePagesResponse.data) {
            createdShapePages.add(createdShapePage.id);
        }

        for (const createdShapePage of createdShapePagesResponse.data) {
            updateChildMarcherPages({
                db,
                shapePage: createdShapePage,
            });
        }
        output = {
            success: true,
            data: createdShapePagesResponse.data,
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
            // Update the ShapePage in the database
            const updateShapePageResponse = DbActions.updateItems<
                ShapePage,
                ModifiedShapePageArgs
            >({
                db,
                items: [updatedShapePage],
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
                    shapePage: thisShapePageResponse.data,
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
    return DbActions.deleteItems<ShapePage>({
        db,
        tableName: Constants.ShapePageTableName,
        ids,
    });
}

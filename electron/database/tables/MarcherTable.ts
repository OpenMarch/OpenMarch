import Constants from "../../../src/global/Constants";
import * as History from "../database.history";
import Database from "better-sqlite3";
import * as DbActions from "../DatabaseActions";
import Marcher, {
    ModifiedMarcherArgs,
    NewMarcherArgs,
} from "../../../src/global/classes/Marcher";
import * as PageTable from "./PageTable";
import * as MarcherPageTable from "./MarcherPageTable";
import { DatabaseResponse } from "../DatabaseActions";

export function createMarcherTable(db: Database.Database) {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS "${Constants.MarcherTableName}" (
                "id"	        INTEGER PRIMARY KEY,
                "id_for_html"	TEXT UNIQUE,
                "name"	        TEXT,
                "section"	    TEXT NOT NULL,
                "year"	        TEXT,
                "notes"	        TEXT,
                "drill_prefix"	TEXT NOT NULL,
                "drill_order"	INTEGER NOT NULL,
                "drill_number"	TEXT UNIQUE NOT NULL,
                "created_at"	TEXT NOT NULL,
                "updated_at"	TEXT NOT NULL,
                UNIQUE ("drill_prefix", "drill_order")
            );
        `);
        History.createUndoTriggers(db, Constants.MarcherTableName);
    } catch (error) {
        console.error("Failed to create marcher table:", error);
    }
    console.log("Marcher table created.");
}

/**
 * @param db The database connection, or undefined to create a new connection
 * @returns An array of all marchers in the database
 */
export function getMarchers({
    db,
}: {
    db: Database.Database;
}): DatabaseResponse<Marcher[]> {
    const response = DbActions.getAllItems<Marcher>({
        db,
        tableName: Constants.MarcherTableName,
    });
    return response;
}

/**
 * Updates a list of marchers with the given values.
 *
 * @param newMarcherArgs
 * @returns - {success: boolean, error?: string}
 */
export function createMarchers({
    newMarchers,
    db,
}: {
    newMarchers: NewMarcherArgs[];
    db: Database.Database;
}): DatabaseResponse<Marcher[]> {
    History.incrementUndoGroup(db);

    const marchersToInsert: any[] = [];
    // Combine drill prefix and order to create drill number
    for (const marcher of newMarchers) {
        marchersToInsert.push({
            ...marcher,
            drill_number: `${marcher.drill_prefix}${marcher.drill_order}`,
        });
    }

    try {
        const marcherInsertResponse = DbActions.createItems<
            Marcher,
            NewMarcherArgs
        >({
            items: marchersToInsert,
            tableName: Constants.MarcherTableName,
            db,
            useNextUndoGroup: false,
        });
        if (!marcherInsertResponse.success) {
            throw new Error(
                marcherInsertResponse.error?.message ||
                    "Failed to create marchers"
            );
        }

        // Create a marcherPage for each marcher and page
        const allPages = PageTable.getPages({ db });
        if (!allPages.success) {
            throw new Error(
                allPages.error?.message || "Failed to get all pages"
            );
        }
        // Create a marcherPage for each marcher
        for (const marcher of marcherInsertResponse.data) {
            for (const page of allPages.data) {
                const createMarcherPageResponse =
                    MarcherPageTable.createMarcherPage({
                        newMarcherPage: {
                            marcher_id: marcher.id,
                            page_id: page.id,
                            x: 100,
                            y: 100,
                        },
                        db,
                        useNextUndoGroup: false,
                    });
                if (!createMarcherPageResponse.success) {
                    throw new Error(
                        createMarcherPageResponse.error?.message ||
                            "Failed to create marcherPage"
                    );
                }
            }
        }
        History.incrementUndoGroup(db);
        return marcherInsertResponse;
    } catch (error: any) {
        console.error("Failed to create marchers:", error);
        History.performUndo(db);
        History.clearMostRecentRedo(db);
        return {
            success: false,
            error: { message: error.message, stack: error.stack },
            data: [],
        };
    }
}

/**
 * Update a list of marchers with the given values.
 *
 * @param modifiedMarchers Array of ModifiedMarcherArgs that contain the id of the
 *                    marcher to update and the values to update it with
 * @returns - {success: boolean, error: string}
 */
export function updateMarchers({
    modifiedMarchers,
    db,
}: {
    modifiedMarchers: ModifiedMarcherArgs[];
    db: Database.Database;
}): DatabaseResponse<Marcher[]> {
    const updateResponse = DbActions.updateItems<Marcher, ModifiedMarcherArgs>({
        db,
        items: modifiedMarchers,
        tableName: Constants.MarcherTableName,
    });
    return updateResponse;
}

/**
 * Deletes the marcher with the given id and all of their marcherPages.
 * CAUTION - This will also delete all of the marcherPages associated with the marcher.
 *
 * @param marcherIds
 * @returns {success: boolean, error?: string}
 */
export function deleteMarchers({
    marcherIds,
    db,
}: {
    marcherIds: Set<number>;
    db: Database.Database;
}): DbActions.DatabaseResponse<Marcher[]> {
    History.incrementUndoGroup(db);
    const marcherDeleteResponse = DbActions.deleteItems<Marcher>({
        ids: marcherIds,
        tableName: Constants.MarcherTableName,
        db,
        useNextUndoGroup: false,
    });

    if (!marcherDeleteResponse.success) {
        console.error(
            "Failed to delete marchers:",
            marcherDeleteResponse.error
        );
        return marcherDeleteResponse;
    }

    // Check if there are any marcherPages
    const marcherPagesNum = (
        db
            .prepare(
                `SELECT COUNT(*) as mp_count FROM ${Constants.MarcherPageTableName}`
            )
            .get() as { mp_count: number }
    ).mp_count;

    if (marcherPagesNum > 0) {
        const marcherPageDeleteResponse = DbActions.deleteItems({
            ids: marcherIds,
            tableName: Constants.MarcherPageTableName,
            db,
            useNextUndoGroup: false,
            idColumn: "marcher_id",
        });

        if (!marcherPageDeleteResponse.success) {
            console.error(
                "Failed to delete marcher pages:",
                marcherPageDeleteResponse.error
            );
            History.performUndo(db);
            History.clearMostRecentRedo(db);
            return {
                success: false,
                error: marcherPageDeleteResponse.error,
                data: [],
            };
        }
    }

    return marcherDeleteResponse;
}

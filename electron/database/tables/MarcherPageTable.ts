import MarcherPage, {
    ModifiedMarcherPageArgs,
} from "@/global/classes/MarcherPage";
import Constants from "../../../src/global/Constants";
import Database from "better-sqlite3";
import * as DbActions from "../DatabaseActions";
import { DatabaseResponse } from "../DatabaseActions";
import * as History from "../database.history";

export function createMarcherPageTable(db: Database.Database) {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS "${Constants.MarcherPageTableName}" (
                "id"            INTEGER PRIMARY KEY,
                "id_for_html"   TEXT UNIQUE,
                "marcher_id"    INTEGER NOT NULL,
                "page_id"       INTEGER NOT NULL,
                "x"             REAL,
                "y"             REAL,
                "created_at"    TEXT NOT NULL,
                "updated_at"    TEXT NOT NULL,
                "notes"         TEXT
            );
            CREATE INDEX IF NOT EXISTS "index_marcher_pages_on_marcher_id" ON "marcher_pages" ("marcher_id");
            CREATE INDEX IF NOT EXISTS "index_marcher_pages_on_page_id" ON "marcher_pages" ("page_id");
        `);
        History.createUndoTriggers(db, Constants.MarcherPageTableName);
    } catch (error) {
        console.error("Failed to create marcher_page table:", error);
    }
}

/**
 * Gets all of the marcherPages, or the marcherPages with the given marcher_id and/or page_id.
 *
 * @param args { marcher_id?: number, page_id?: number}
 * @returns Array of marcherPages
 */
export function getMarcherPages(args: {
    db: Database.Database;
    marcher_id?: number;
    page_id?: number;
}): DatabaseResponse<MarcherPage[]> {
    const db = args.db;
    let stmt = db.prepare(`SELECT * FROM ${Constants.MarcherPageTableName}`);
    if (args) {
        if (args.marcher_id && args.page_id)
            stmt = db.prepare(
                `SELECT * FROM ${Constants.MarcherPageTableName} WHERE marcher_id = ${args.marcher_id} AND page_id = ${args.page_id}`
            );
        else if (args.marcher_id)
            stmt = db.prepare(
                `SELECT * FROM ${Constants.MarcherPageTableName} WHERE marcher_id = ${args.marcher_id}`
            );
        else if (args.page_id)
            stmt = db.prepare(
                `SELECT * FROM ${Constants.MarcherPageTableName} WHERE page_id = ${args.page_id}`
            );
    }
    const result = stmt.all() as MarcherPage[];
    return { success: true, data: result };
}

/**
 * Gets the marcherPage with the given marcher_id and page_id.
 * TODO: NOT TESTED
 *
 * @param args { marcher_id: number, page_id: number}
 * @returns The marcherPage
 */
export function getMarcherPage(args: {
    db: Database.Database;
    marcher_id: number;
    page_id: number;
}): DatabaseResponse<MarcherPage | null> {
    const response = getMarcherPages(args);
    return {
        success: response.success,
        data: response.data[0] || null,
        error: response.error,
    };
}

/**
 * Adds a new marcherPage to the database.
 * NOTE - this function should only be called from createMarcher and createPage.
 * A marcherPage should not be created manually by the user.
 * ALSO NOTE - this function does not open or close the database connection.
 *
 * @param db The database connection
 * @param newMarcherPage The marcherPage to add
 * @param useNextUndoGroup Whether or not to use the next undo group
 * @returns
 */
export function createMarcherPage({
    db,
    newMarcherPage,
    useNextUndoGroup,
}: {
    db: Database.Database;
    newMarcherPage: ModifiedMarcherPageArgs;
    useNextUndoGroup: boolean;
}): DatabaseResponse<MarcherPage | null> {
    const response = DbActions.createItems<
        MarcherPage,
        ModifiedMarcherPageArgs
    >({
        db,
        items: [newMarcherPage],
        tableName: Constants.MarcherPageTableName,
        useNextUndoGroup,
    });

    return {
        success: response.success,
        data: response.data[0] || null,
        error: response.error,
    };
}

interface NewModifiedMarcherPageArgs extends ModifiedMarcherPageArgs {
    id: number;
}
/**
 * Updates a list of marcherPages with the given values.
 *
 * @param marcherPageUpdates: Array of UpdateMarcherPage objects that contain the marcher_id and page_id of the
 *                  marcherPage to update and the values to update it with
 * @returns - {success: boolean, result: Database.result | string}
 */
export function updateMarcherPages({
    db,
    marcherPageUpdates,
}: {
    db: Database.Database;
    marcherPageUpdates: ModifiedMarcherPageArgs[];
}): DatabaseResponse<MarcherPage[]> {
    const newUpdatedItems: NewModifiedMarcherPageArgs[] =
        marcherPageUpdates.map((update) => {
            const id = (
                db
                    .prepare(
                        `SELECT id FROM ${Constants.MarcherPageTableName}
            WHERE "marcher_id" = (@marcher_id) AND "page_id" = (@page_id)`
                    )
                    .get({
                        marcher_id: update.marcher_id,
                        page_id: update.page_id,
                    }) as { id: number }
            ).id;
            return {
                ...update,
                id,
            };
        });

    const response = DbActions.updateItems<
        MarcherPage,
        NewModifiedMarcherPageArgs
    >({
        db,
        items: newUpdatedItems,
        tableName: Constants.MarcherPageTableName,
    });

    return response;
}

import { ipcMain } from "electron";
import Database from "better-sqlite3";
import path from "path";
import Constants from "../../src/global/Constants";
import * as fs from "fs";
import * as History from "./database.history";
import Marcher, {
    ModifiedMarcherArgs,
    NewMarcherArgs,
} from "../../src/global/classes/Marcher";
import Page, {
    ModifiedPageContainer,
    NewPageContainer,
} from "../../src/global/classes/Page";
import MarcherPage, {
    ModifiedMarcherPageArgs,
} from "@/global/classes/MarcherPage";
import FieldProperties from "../../src/global/classes/FieldProperties";
import AudioFile, { ModifiedAudioFileArgs } from "@/global/classes/AudioFile";
import FieldPropertiesTemplates from "../../src/global/classes/FieldProperties.templates";

export class DatabaseResponse<T> {
    readonly success: boolean;
    /**
     * Resulting data from the database action. This isn't very well implemented
     * and likely will not be used.
     */
    readonly result?: T;
    readonly error?: { message: string; stack?: string };

    constructor(success: boolean, result?: any, error?: Error) {
        this.success = success;
        this.result = result;
        this.error = error;
    }
}

/* ============================ DATABASE ============================ */
let DB_PATH = "";

/**
 * Change the location of the database file the application and actively updates.
 *
 * @param path the path to the database file
 * @returns 200 if successful, -1 if the file does not exist
 */
export function setDbPath(path: string, isNewFile = false) {
    if (!fs.existsSync(path) && !isNewFile) {
        console.error(`setDbPath: File does not exist at path: ${path}`);
        DB_PATH = "";
        return -1;
    }
    DB_PATH = path;
    return 200;
}

export function getDbPath() {
    return DB_PATH;
}

export function databaseIsReady() {
    return DB_PATH.length > 0 && fs.existsSync(DB_PATH);
}

/**
 * Initiates the database by creating the tables if they do not exist.
 */
export function initDatabase() {
    const db = connect();
    console.log(db);
    console.log("Creating database...");
    if (!db) return;
    createMarcherTable(db);
    createPageTable(db);
    createMarcherPageTable(db);
    createFieldPropertiesTable(
        db,
        FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES
    );
    createMeasureTable(db);
    createAudioFileTable(db);
    History.createHistoryTables(db);
    // for (const table of Object.values(ALL_TABLES)) {
    //     console.log("TABLE", table.tableName);
    //     table.createTable(db);
    // }
    console.log("Database created.");
    db.close();
}

export function connect() {
    try {
        const dbPath =
            DB_PATH.length > 0
                ? DB_PATH
                : path.resolve(
                      __dirname,
                      "../../",
                      "electron/database/",
                      "database.db"
                  );
        return Database(dbPath, { verbose: console.log });
    } catch (error: any) {
        throw new Error(
            "Failed to connect to database:\nPLEASE RUN 'node_modules/.bin/electron-rebuild -f -w better-sqlite3' to resolve this",
            error
        );
    }
}

function createMarcherTable(db: Database.Database) {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS "${Constants.MarcherTableName}" (
                "id"	        INTEGER PRIMARY KEY AUTOINCREMENT,
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
    } catch (error) {
        console.error("Failed to create marcher table:", error);
    }
    console.log("Marcher table created.");
}

function createPageTable(db: Database.Database) {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS "${Constants.PageTableName}" (
                "id"	        INTEGER PRIMARY KEY AUTOINCREMENT,
                "id_for_html"	TEXT UNIQUE,
                "name"	        TEXT NOT NULL UNIQUE,
                "notes"	        TEXT,
                "order"	        INTEGER NOT NULL UNIQUE,
                "counts"	    INTEGER NOT NULL,
                "created_at"	TEXT NOT NULL,
                "updated_at"	TEXT NOT NULL
            );
        `);
    } catch (error) {
        console.error("Failed to create page table:", error);
    }
}

function createMarcherPageTable(db: Database.Database) {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS "${Constants.MarcherPageTableName}" (
                "id"            INTEGER PRIMARY KEY AUTOINCREMENT,
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
    } catch (error) {
        console.error("Failed to create marcher_page table:", error);
    }
}

function createFieldPropertiesTable(
    db: Database.Database,
    fieldProperties: FieldProperties
) {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS "${Constants.FieldPropertiesTableName}" (
                id INTEGER PRIMARY KEY,
                json_data TEXT
            );
        `);
    } catch (error) {
        console.error("Failed to create field properties table:", error);
    }
    const stmt = db.prepare(`
        INSERT INTO ${Constants.FieldPropertiesTableName} (
            id,
            json_data
        ) VALUES (
            1,
            @json_data
        );
    `);
    stmt.run({ json_data: JSON.stringify(fieldProperties) });
    console.log("Field properties table created.");
}

/**
 * Measures in OpenMarch use a simplified version of ABC notation.
 * There is only ever one entry in this table, and it is the ABC notation string.
 * When updating measures, this string will be modified.
 *
 * @param db Database object to use
 */
function createMeasureTable(db: Database.Database) {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS "${Constants.MeasureTableName}" (
                id INTEGER PRIMARY KEY,
                abc_data TEXT,
                "created_at"	TEXT NOT NULL,
                "updated_at"	TEXT NOT NULL
            );
        `);
        // Create a default entry
        const stmt = db.prepare(`
            INSERT INTO ${Constants.MeasureTableName} (
                id,
                abc_data,
                "created_at",
                "updated_at"
            ) VALUES (
                1,
                @abc_data,
                @created_at,
                @updated_at
            );
        `);
        const created_at = new Date().toISOString();
        stmt.run({
            abc_data: defaultMeasures,
            created_at,
            updated_at: created_at,
        });
        console.log("Measures table created.");
    } catch (error) {
        console.error("Failed to create Measures table:", error);
    }
}

/**
 * Audio files are stored in the database as BLOBs.
 * There can be multiple audio files in the database, but only one is used at a time.
 * They can be used to differentiate tracks with metronome, simplified parts, etc.
 *
 * @param db Database object to use
 */
function createAudioFileTable(db: Database.Database) {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS "${Constants.AudioFilesTableName}" (
                id INTEGER PRIMARY KEY,
                path TEXT NOT NULL,
                nickname TEXT,
                data BLOB,
                selected INTEGER NOT NULL DEFAULT 0,
                "created_at"	TEXT NOT NULL,
                "updated_at"	TEXT NOT NULL
            );
        `);
    } catch (error) {
        console.error("Failed to create audio file table:", error);
    }
    console.log("audio file table created.");
}

/* ============================ Handlers ============================ */
/**
 * Handlers for the app api.
 * Whenever modifying this, you must also modify the app api in electron/preload/index.ts
 */
export function initHandlers() {
    // Field properties
    ipcMain.handle("field_properties:get", async () => getFieldProperties());
    ipcMain.handle("field_properties:update", async (_, field_properties) =>
        updateFieldProperties(field_properties)
    );

    // File IO handlers located in electron/main/index.ts

    // Marcher
    ipcMain.handle("marcher:getAll", async () => getMarchers());
    ipcMain.handle("marcher:insert", async (_, args) => createMarcher(args));
    ipcMain.handle("marcher:update", async (_, args) => updateMarchers(args));
    ipcMain.handle("marcher:delete", async (_, marcher_id) =>
        deleteMarcher(marcher_id)
    );

    // Page
    ipcMain.handle("page:getAll", async () => getPages());
    ipcMain.handle("page:insert", async (_, args) => createPages(args));
    ipcMain.handle(
        "page:update",
        async (
            _,
            pages: ModifiedPageContainer[],
            addToHistoryQueue: boolean,
            updateInReverse: boolean
        ) => updatePages(pages, addToHistoryQueue, updateInReverse)
    );
    ipcMain.handle("page:delete", async (_, page_id) => deletePage(page_id));

    // MarcherPage
    ipcMain.handle("marcher_page:getAll", async (_, args) =>
        getMarcherPages(args)
    );
    ipcMain.handle("marcher_page:get", async (_, args) => getMarcherPage(args));
    ipcMain.handle("marcher_page:update", async (_, args) =>
        updateMarcherPages(args)
    );

    // Measure
    ipcMain.handle("measure:getAll", async () => getMeasures());
    ipcMain.handle("measure:update", async (_, abcString: string) =>
        updateMeasuresAbcString(abcString)
    );

    // Audio Files
    // Insert audio file is defined in main index.ts
    ipcMain.handle("audio:getAll", async () => getAudioFilesDetails());
    ipcMain.handle("audio:getSelected", async () => getSelectedAudioFile());
    ipcMain.handle("audio:select", async (_, audioFileId: number) =>
        setSelectAudioFile(audioFileId)
    );
    ipcMain.handle("audio:update", async (_, args: ModifiedAudioFileArgs[]) =>
        updateAudioFiles(args)
    );
    ipcMain.handle("audio:delete", async (_, audioFileId: number) =>
        deleteAudioFile(audioFileId)
    );

    // for (const tableController of Object.values(ALL_TABLES)) {
    //     tableController.ipcCrudHandlers();
    // }
}

/* ======================= Exported Functions ======================= */
// From the history file
export async function historyAction(
    type: "undo" | "redo",
    db?: Database.Database
) {
    return await History.historyAction(type, db);
}

/* ======================== Field Properties ======================== */
/**
 * Gets the field properties from the database.
 *
 * @param db
 * @returns
 */
export async function getFieldProperties(
    db?: Database.Database
): Promise<FieldProperties> {
    const dbToUse = db || connect();
    const stmt = dbToUse.prepare(
        `SELECT * FROM ${Constants.FieldPropertiesTableName}`
    );
    const result = await stmt.get({});
    const jsonData = (result as any).json_data;
    const fieldProperties = JSON.parse(jsonData) as FieldProperties;
    if (!db) dbToUse.close();
    return fieldProperties;
}

/**
 * Updates the field properties in the database.
 *
 * @param fieldProperties The new field properties
 * @returns {success: boolean, result?: FieldProperties, error?: string}
 */
export async function updateFieldProperties(
    fieldProperties: FieldProperties
): Promise<DatabaseResponse<FieldProperties>> {
    const db = connect();
    let output: DatabaseResponse<FieldProperties> = { success: true };

    try {
        const stmt = db.prepare(`
            UPDATE ${Constants.FieldPropertiesTableName}
            SET json_data = @json_data
            WHERE id = 1
        `);
        stmt.run({ json_data: JSON.stringify(fieldProperties) });
        const newFieldProperties = await getFieldProperties(db);
        output = { success: true, result: newFieldProperties };
    } catch (error: any) {
        console.error(error);
        output = {
            success: false,
            error: { message: error.message, stack: error.stack },
        };
    } finally {
        db.close();
    }
    return output;
}

/* ============================ Marcher ============================ */
/**
 * @param db The database connection, or undefined to create a new connection
 * @returns An array of all marchers in the database
 */
async function getMarchers(db?: Database.Database): Promise<Marcher[]> {
    const dbToUse = db || connect();
    const stmt = dbToUse.prepare(`SELECT * FROM ${Constants.MarcherTableName}`);
    const result = (await stmt.all()) as Marcher[];
    if (!db) dbToUse.close();
    return result;
}

async function getMarcher(
    marcherId: number,
    db?: Database.Database
): Promise<Marcher> {
    const dbToUse = db || connect();
    const stmt = dbToUse.prepare(
        `SELECT * FROM ${Constants.MarcherTableName} WHERE id = @marcherId`
    );
    const result = await stmt.get({ marcherId });
    if (!db) dbToUse.close();
    return result as Marcher;
}

async function createMarcher(newMarcher: NewMarcherArgs) {
    return createMarchers([newMarcher]);
}

/**
 * Updates a list of marchers with the given values.
 *
 * @param newMarcherArgs
 * @returns - {success: boolean, error?: string}
 */
async function createMarchers(
    newMarchers: NewMarcherArgs[]
): Promise<DatabaseResponse<Marcher[]>> {
    const db = connect();
    let output: DatabaseResponse<Marcher[]> = { success: true };

    // List of queries executed in this function to be added to the history table
    // const historyQueries: History.historyQuery[] = [];
    try {
        for (const newMarcher of newMarchers) {
            const marcherToAdd: Marcher = new Marcher({
                id: 0, // Not used, needed for interface
                id_for_html: "", // Not used, needed for interface
                name: newMarcher.name || "",
                section: newMarcher.section,
                drill_prefix: newMarcher.drill_prefix,
                drill_order: newMarcher.drill_order,
            });
            const db = connect();
            const insertStmt = db.prepare(`
                INSERT INTO ${Constants.MarcherTableName} (
                    name,
                    section,
                    drill_prefix,
                    drill_order,
                    drill_number,
                    created_at,
                    updated_at
                ) VALUES (
                    @name,
                    @section,
                    @drill_prefix,
                    @drill_order,
                    @drill_number,
                    @created_at,
                    @updated_at
                )
            `);
            const created_at = new Date().toISOString();
            const insertResult = insertStmt.run({
                ...marcherToAdd,
                created_at,
                updated_at: created_at,
            });

            // Get the id of the inserted row
            const id = insertResult.lastInsertRowid as number;

            // Update the id_for_html field
            const updateStmt = db.prepare(`
                UPDATE ${Constants.MarcherTableName}
                SET id_for_html = @id_for_html
                WHERE id = @id
            `);
            updateStmt.run({
                id_for_html: Constants.MarcherPrefix + "_" + id,
                id,
            });

            // Add the page to the history table
            // historyQueries.push({
            //     action: 'DELETE',
            //     tableName: Constants.MarcherTableName,
            //     obj: { id }
            // });

            /* Add a marcherPage for this marcher for each page */
            // Get all existing pages
            const pages = await getPages(db);

            // For each page, create a new MarcherPage
            for (const page of pages) {
                createMarcherPage(db, {
                    marcher_id: id,
                    page_id: page.id,
                    x: 100,
                    y: 100,
                });

                // Add the marcherPage to the history table
                // historyQueries.push({
                //     action: 'DELETE',
                //     tableName: Constants.MarcherPageTableName,
                //     obj: { marcher_id: id, page_id: page.id }
                // });
            }
        }
    } catch (error: any) {
        console.error(error);
        output = {
            success: false,
            error: { message: error.message, stack: error.stack },
        };
    } finally {
        db.close();
    }
    return output;
}

/**
 * Update a list of marchers with the given values.
 *
 * @param modifiedMarchers Array of ModifiedMarcherArgs that contain the id of the
 *                    marcher to update and the values to update it with
 * @returns - {success: boolean, error: string}
 */
async function updateMarchers(
    modifiedMarchers: ModifiedMarcherArgs[]
): Promise<DatabaseResponse<Marcher[]>> {
    const db = connect();
    let output: DatabaseResponse<Marcher[]> = { success: true };

    // List of queries executed in this function to be added to the history table
    const historyActions: History.UpdateHistoryEntry[] = [];
    // List of properties to exclude
    const excludedProperties = ["id"];

    try {
        for (const modifiedMarcher of modifiedMarchers) {
            // Generate the SET clause of the SQL query
            const setClause = Object.keys(modifiedMarcher)
                .filter((key) => !excludedProperties.includes(key))
                .map((key) => `${key} = @${key}`)
                .join(", ");

            // Check if the SET clause is empty
            if (setClause.length === 0) {
                throw new Error("No valid properties to update");
            }
            // Record the original values of the marcher
            const originalMarcher = await getMarcher(modifiedMarcher.id, db);

            const stmt = db.prepare(`
                UPDATE ${Constants.MarcherTableName}
                SET ${setClause}, updated_at = @new_updated_at
                WHERE id = @id
            `);

            stmt.run({
                ...modifiedMarcher,
                new_updated_at: new Date().toISOString(),
            });

            historyActions.push({
                tableName: Constants.MarcherTableName,
                setClause: setClause,
                previousState: originalMarcher,
                reverseAction: {
                    tableName: Constants.MarcherTableName,
                    setClause: setClause,
                    previousState: await getMarcher(modifiedMarcher.id, db),
                },
            });
        }
        History.insertUpdateHistory(historyActions, db);
    } catch (error: any) {
        console.error(error);
        output = {
            success: false,
            error: { message: error.message, stack: error.stack },
        };
    } finally {
        db.close();
    }
    return output;
}

/**
 * CAUTION - this will delete all of the marcherPages associated with the marcher.
 * THIS CANNOT BE UNDONE.
 *
 * Deletes the marcher with the given id and all of their marcherPages.
 *
 * @param marcher_id
 * @returns {success: boolean, error?: string}
 */
async function deleteMarcher(
    marcher_id: number
): Promise<DatabaseResponse<Marcher>> {
    const db = connect();
    let output: DatabaseResponse<Marcher> = { success: true };
    try {
        const marcherStmt = db.prepare(`
            DELETE FROM ${Constants.MarcherTableName}
            WHERE id = @marcher_id
        `);
        marcherStmt.run({ marcher_id });

        const marcherPageStmt = db.prepare(`
            DELETE FROM ${Constants.MarcherPageTableName}
            WHERE marcher_id = @marcher_id
        `);
        marcherPageStmt.run({ marcher_id });
    } catch (error: any) {
        console.error(error);
        output = {
            success: false,
            error: { message: error.message, stack: error.stack },
        };
    } finally {
        db.close();
    }
    return output;
}

/* ============================ Page ============================ */
/**
 * Gets all of the pages in the database.
 *
 * @param db The database connection, or undefined to create a new connection
 * @returns List of all pages
 */
async function getPages(db?: Database.Database): Promise<Page[]> {
    const dbToUse = db || connect();
    const stmt = dbToUse.prepare(`SELECT * FROM ${Constants.PageTableName}`);
    const result = (await stmt.all()) as Page[];
    if (!db) dbToUse.close();
    return result;
}

/**
 * Gets a single page from the database.
 *
 * @param pageId The id of the page to get
 * @param db The database connection, or undefined to create a new connection
 * @returns The page with the given ID. (I think returns null for no match)
 */
async function getPage(pageId: number, db?: Database.Database): Promise<Page> {
    const dbToUse = db || connect();
    const stmt = dbToUse.prepare(
        `SELECT * FROM ${Constants.PageTableName} WHERE id = @pageId`
    );
    const result = await stmt.get({ pageId });
    if (!db) dbToUse.close();
    return result as Page;
}

/**
 * Create one or many new pages.
 *
 * @param newPages The new pages to create.
 * @returns The response from the database.
 */
async function createPages(
    newPages: NewPageContainer[]
): Promise<DatabaseResponse<Page[]>> {
    const db = connect();
    let output: DatabaseResponse<Page[]> = { success: true };

    // List of queries executed in this function to be added to the history table
    // const historyQueries: History.InsertHistoryEntry[] = [];

    try {
        for (const newPage of newPages) {
            if (newPage.order === 0) {
                // Ensure the first page has no counts
                newPage.counts = 0;
            }
            // Get the max order
            const pageToAdd: NewPageContainer = {
                name: newPage.name,
                notes: newPage.notes || "",
                order: newPage.order,
                counts: newPage.counts,
            };
            const insertStmt = db.prepare(`
                INSERT INTO ${Constants.PageTableName} (
                    name,
                    notes,
                    "order",
                    counts,
                    created_at,
                    updated_at
                ) VALUES (
                    @name,
                    @notes,
                    @order,
                    @counts,
                    @created_at,
                    @updated_at
                )
            `);
            const created_at = new Date().toISOString();
            const insertResult = insertStmt.run({
                ...pageToAdd,
                created_at,
                updated_at: created_at,
            });
            // Get the id of the inserted row
            const id = insertResult.lastInsertRowid as number;
            // Update the id_for_html field
            const updateStmt = db.prepare(`
                UPDATE ${Constants.PageTableName}
                SET id_for_html = @id_for_html
                WHERE id = @id
            `);
            const new_id_for_html = Constants.PagePrefix + "_" + id;
            updateStmt.run({
                id_for_html: new_id_for_html,
                id,
            });

            // Add a marcherPage for this page for each marcher
            // Get all existing marchers
            const marchers = await getMarchers();
            // For each marcher, create a new MarcherPage
            for (const marcher of marchers) {
                let previousMarcherPageCoords = await getCoordsOfPreviousPage(
                    marcher.id,
                    id
                );
                if (!previousMarcherPageCoords)
                    previousMarcherPageCoords = { x: 100, y: 100 };
                createMarcherPage(db, {
                    marcher_id: marcher.id,
                    page_id: id,
                    x: previousMarcherPageCoords.x,
                    y: previousMarcherPageCoords.y,
                });
            }
        }
    } catch (error: any) {
        console.error(error);
        output = {
            success: false,
            error: { message: error.message, stack: error.stack },
        };
    } finally {
        db.close();
    }
    return output;
}

/**
 * Update a list of pages with the given values.
 *
 * @param modifiedPages Array of UpdatePage objects that contain the id of the
 *                    page to update and the values to update it with
 * @param addToHistoryQueue - whether to add the changes to the history queue. Default is true.
 *                    Only set to false when updating as the response to adding a new page.
 * @param updateInReverse - whether to update the pages in reverse order. Default is false.
 *                    This is used to satisfy the unique constraint on the order and name column when adding pages.
 * @returns - {success: boolean, error?: string}
 */
async function updatePages(
    modifiedPages: ModifiedPageContainer[],
    addToHistoryQueue: Boolean = true,
    updateInReverse = false
): Promise<DatabaseResponse<Page[]>> {
    const db = connect();
    let output: DatabaseResponse<Page[]> = { success: true };

    // List of queries executed in this function to be added to the history table
    const historyActions: History.UpdateHistoryEntry[] = [];
    // List of properties to exclude
    const excludedProperties = ["id"];
    const sortedModifiedPages = modifiedPages.sort(
        (a, b) => (a.order ? a.order : 0) - (b.order ? b.order : 0)
    );

    try {
        for (const pageUpdate of updateInReverse
            ? sortedModifiedPages.toReversed()
            : sortedModifiedPages) {
            if (pageUpdate.order === 0) {
                // Ensure the first page has no counts
                pageUpdate.counts = 0;
            }
            // Generate the SET clause of the SQL query
            const setClause = Object.keys(pageUpdate)
                .filter((key) => !excludedProperties.includes(key))
                .map((key) => `"${key}" = @${key}`)
                .join(", ");

            // Check if the SET clause is empty
            if (setClause.length === 0) {
                console.error("No valid properties to update");
                continue;
            }

            // Record the original values of the page
            const originalPage = await getPage(pageUpdate.id, db);
            // Update the page
            const stmt = db.prepare(`
                UPDATE ${Constants.PageTableName}
                SET ${setClause}, updated_at = @new_updated_at
                WHERE id = @id
            `);
            stmt.run({
                ...pageUpdate,
                new_updated_at: new Date().toISOString(),
            });

            if (addToHistoryQueue) {
                historyActions.push({
                    tableName: Constants.PageTableName,
                    setClause: setClause,
                    previousState: originalPage,
                    reverseAction: {
                        tableName: Constants.PageTableName,
                        setClause: setClause,
                        previousState: await getPage(pageUpdate.id, db),
                    },
                });
            }
        }
        if (addToHistoryQueue) History.insertUpdateHistory(historyActions, db);
    } catch (error: any) {
        console.error(error);
        output = {
            success: false,
            error: { message: error.message, stack: error.stack },
        };
    } finally {
        db.close();
    }
    return output;
}

/**
 * CAUTION - this will delete all of the marcherPages associated with the page.
 * THIS CANNOT BE UNDONE.
 *
 * Deletes the page with the given id and all of its marcherPages.
 *
 * @param page_id
 * @returns {success: boolean, error?: string}
 */
async function deletePage(page_id: number): Promise<DatabaseResponse<Page>> {
    const db = connect();
    let output: DatabaseResponse<Page> = { success: true };
    try {
        const pageStmt = db.prepare(`
            DELETE FROM ${Constants.PageTableName}
            WHERE id = @page_id
        `);
        pageStmt.run({ page_id });

        const marcherPageStmt = db.prepare(`
            DELETE FROM ${Constants.MarcherPageTableName}
            WHERE page_id = @page_id
        `);
        marcherPageStmt.run({ page_id });
    } catch (error: any) {
        console.error(error);
        output = { success: false, error: error };
    } finally {
        db.close();
    }
    return output;
}

/* ============================ MarcherPage ============================ */
/**
 * Gets all of the marcherPages, or the marcherPages with the given marcher_id and/or page_id.
 *
 * @param args { marcher_id?: number, page_id?: number}
 * @returns Array of marcherPages
 */
async function getMarcherPages(args: {
    marcher_id?: number;
    page_id?: number;
}): Promise<MarcherPage[]> {
    const db = connect();
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
    const result = await stmt.all();
    db.close();
    return result as MarcherPage[];
}

/**
 * Gets the marcherPage with the given marcher_id and page_id.
 * TODO: NOT TESTED
 *
 * @param args { marcher_id: number, page_id: number}
 * @returns The marcherPage
 */
async function getMarcherPage(args: {
    marcher_id: number;
    page_id: number;
}): Promise<MarcherPage> {
    const marcherPages = await getMarcherPages(args);
    return marcherPages[0];
}

/**
 * Adds a new marcherPage to the database.
 * NOTE - this function should only be called from createMarcher and createPage.
 * A marcherPage should not be created manually by the user.
 * ALSO NOTE - this function does not open or close the database connection.
 *
 * @param db The database connection
 * @param newMarcherPage The marcherPage to add
 * @returns
 */
async function createMarcherPage(
    db: Database.Database,
    newMarcherPage: ModifiedMarcherPageArgs
) {
    if (!newMarcherPage.marcher_id || !newMarcherPage.page_id)
        throw new Error("MarcherPage must have marcher_id and page_id");

    const marcherPageToAdd: MarcherPage = {
        id: 0, // Not used, needed for interface
        id_for_html: "", // Not used, needed for interface
        marcher_id: newMarcherPage.marcher_id,
        page_id: newMarcherPage.page_id,
        x: newMarcherPage.x,
        y: newMarcherPage.y,
    };
    const insertStmt = db.prepare(`
        INSERT INTO ${Constants.MarcherPageTableName} (
            marcher_id,
            page_id,
            x,
            y,
            created_at,
            updated_at
        ) VALUES (
            @marcher_id,
            @page_id,
            @x,
            @y,
            @created_at,
            @updated_at
        )
    `);
    const created_at = new Date().toISOString();
    const insertResult = insertStmt.run({
        ...marcherPageToAdd,
        created_at,
        updated_at: created_at,
    });
    // Get the id of the inserted row
    const id = insertResult.lastInsertRowid;
    // Update the id_for_html field
    const updateStmt = db.prepare(`
        UPDATE ${Constants.MarcherPageTableName}
        SET id_for_html = @id_for_html
        WHERE id = @id
    `);
    const updateResult = updateStmt.run({
        id_for_html: Constants.MarcherPagePrefix + "_" + id,
        id,
    });
    return updateResult;
}

/**
 * Updates a list of marcherPages with the given values.
 *
 * @param marcherPageUpdates: Array of UpdateMarcherPage objects that contain the marcher_id and page_id of the
 *                  marcherPage to update and the values to update it with
 * @returns - {success: boolean, result: Database.result | string}
 */
async function updateMarcherPages(
    marcherPageUpdates: ModifiedMarcherPageArgs[]
): Promise<DatabaseResponse<MarcherPage[]>> {
    const db = connect();
    let output: DatabaseResponse<MarcherPage[]> = { success: true };
    const historyActions: History.UpdateHistoryEntry[] = [];
    try {
        for (const marcherPageUpdate of marcherPageUpdates) {
            // Generate the SET clause of the SQL query
            const setClause = Object.keys(marcherPageUpdate)
                .map((key) => `${key} = @${key}`)
                .join(", ");

            // Check if the SET clause is empty
            if (setClause.length === 0) {
                throw new Error("No valid properties to update");
            }

            // Record the original values of the marcherPage for the history table
            const previousState = await getMarcherPage({
                marcher_id: marcherPageUpdate.marcher_id,
                page_id: marcherPageUpdate.page_id,
            });

            const stmt = db.prepare(`
                UPDATE ${Constants.MarcherPageTableName}
                SET x = @x, y = @y, updated_at = @new_updated_at
                WHERE marcher_id = @marcher_id AND page_id = @page_id
            `);

            await stmt.run({
                ...marcherPageUpdate,
                new_updated_at: new Date().toISOString(),
            });

            const updateHistoryEntry = {
                tableName: Constants.MarcherPageTableName,
                setClause: setClause,
                previousState: previousState,
                reverseAction: {
                    tableName: Constants.MarcherPageTableName,
                    setClause: setClause,
                    previousState: await getMarcherPage({
                        marcher_id: marcherPageUpdate.marcher_id,
                        page_id: marcherPageUpdate.page_id,
                    }),
                },
            };

            historyActions.push(updateHistoryEntry);
        }
        History.insertUpdateHistory(historyActions, db);

        output = { success: true };
    } catch (error: any) {
        console.error(error);
        output = {
            success: false,
            error: { message: error.message, stack: error.stack },
        };
    } finally {
        db.close();
    }
    return output;
}

/**
 * Changes the coordinates of the marcherPage with the given marcher_id and page_id to the coordinates of the previous page.
 *
 * @param db database connection
 * @param marcher_id marcher_id of the marcher whose coordinates will change
 * @param page_id the page_id of the page that the coordinates will be updated on (not the previous page's id). Null if the page is the first page.
 */
async function getCoordsOfPreviousPage(marcher_id: number, page_id: number) {
    const db = connect();

    /* Get the previous marcherPage */
    const currPageStmt = db.prepare(
        `SELECT * FROM ${Constants.PageTableName} WHERE id = @page_id`
    );
    const currPage = currPageStmt.get({ page_id }) as Page;
    if (!currPage) throw new Error(`Page with id ${page_id} does not exist`);
    if (currPage.order === 1) {
        console.log(
            `page_id ${page_id} is the first page, skipping setCoordsToPreviousPage`
        );
        return;
    }
    const previousPage = await getPreviousPage(page_id, db);
    if (!previousPage) return null;
    const previousMarcherPage = (await getMarcherPage({
        marcher_id,
        page_id: previousPage.id,
    })) as MarcherPage;

    if (!previousPage)
        throw new Error(`Previous page with page_id ${page_id} does not exist`);

    db.close();
    return {
        x: previousMarcherPage.x,
        y: previousMarcherPage.y,
    };
}

/**
 * Returns the previous page in the order of pages.
 *
 * @param pageId
 * @param db
 * @returns The page prior to the page with the given id. Null if the page is the first page.
 */
async function getPreviousPage(
    pageId: number,
    db?: Database.Database
): Promise<Page> {
    const dbToUse = db || connect();
    const currentOrder = (await getPage(pageId, dbToUse)).order;

    const stmt = dbToUse.prepare(`
        SELECT *
        FROM pages
        WHERE "order" < @currentOrder
        ORDER BY "order" DESC
        LIMIT 1
    `);

    const result = (await stmt.get({ currentOrder })) as Page;
    if (!db) dbToUse.close();
    return (result as Page) || null;
}

/* ============================ Measures ============================ */
const defaultMeasures = `X:1
Q:1/4=120
M:4/4
V:1 baritone
V:1
z4 | z4 | z4 | z4 | z4 | z4 | z4 | z4 |
`;
/***** NOTE - Measures are currently not part of the history table *****/

/**
 * Gets all of the measures from the database.
 *
 * @param db The database connection
 * @returns Array of measures
 */
async function getMeasures(db?: Database.Database): Promise<string> {
    const dbToUse = db || connect();
    const stmt = dbToUse.prepare(
        `SELECT * FROM ${Constants.MeasureTableName} WHERE id = 1`
    );
    const response = stmt.all() as {
        abc_data: string;
        created_at: string;
        updated_at: string;
    }[];
    if (response.length === 0 || response[0].abc_data.length < 20) {
        response[0].abc_data = defaultMeasures;
        updateMeasuresAbcString(defaultMeasures);
    }
    if (!db) dbToUse.close();
    return response[0].abc_data;
}

/**
 * Updates the ABC representation of the measures in the database.
 *
 * @param abcString The new ABC string to put into the database
 * @returns DatabaseResponse
 */
async function updateMeasuresAbcString(
    abcString: string
): Promise<DatabaseResponse<string>> {
    const db = connect();
    let output: DatabaseResponse<string> = { success: false };
    try {
        const stmt = db.prepare(`
                UPDATE ${Constants.MeasureTableName}
                SET abc_data = @abc_data, updated_at = @new_updated_at
                WHERE id = 1
            `);
        await stmt.run({
            abc_data: abcString,
            new_updated_at: new Date().toISOString(),
        });
        output = { success: true };
    } catch (error: any) {
        console.error(error);
        output = {
            success: false,
            error: { message: error.message, stack: error.stack },
        };
    } finally {
        db.close();
    }
    return output;
}

/* ============================ Audio Files ============================ */
/**
 * Gets the information on the audio files in the database.
 * I.e. just the path and nickname. This is to save memory so the whole audio file isn't loaded when not needed.
 *
 * @param db The database connection
 * @returns Array of measures
 */
async function getAudioFilesDetails(
    db?: Database.Database
): Promise<AudioFile[]> {
    const dbToUse = db || connect();
    const stmt = dbToUse.prepare(
        `SELECT id, path, nickname, selected FROM ${Constants.AudioFilesTableName}`
    );
    const response = stmt.all() as AudioFile[];
    if (!db) dbToUse.close();
    return response;
}

/**
 * Gets the currently selected audio file in the database.
 *
 * If no audio file is selected, the first audio file in the database is selected.
 *
 * @returns The currently selected audio file in the database. Includes audio data.
 */
export async function getSelectedAudioFile(
    db?: Database.Database
): Promise<AudioFile | null> {
    const dbToUse = db || connect();
    const stmt = dbToUse.prepare(
        `SELECT * FROM ${Constants.AudioFilesTableName} WHERE selected = 1`
    );
    const result = await stmt.get();
    if (!result) {
        const firstAudioFileStmt = dbToUse.prepare(
            `SELECT * FROM ${Constants.AudioFilesTableName} LIMIT 1`
        );
        const firstAudioFile = (await firstAudioFileStmt.get()) as AudioFile;
        if (!firstAudioFile) {
            console.error("No audio files in the database");
            return null;
        }
        await setSelectAudioFile(firstAudioFile.id);
        return firstAudioFile as AudioFile;
    }
    dbToUse.close();
    return result as AudioFile;
}

/**
 * Sets the audio file with the given ID as "selected" meaning that this audio file will be used for playback.
 * This is done by setting the selected column to 1 for the selected audio file and 0 for all others.
 *
 * @param audioFileId The ID of the audio file to get
 * @returns The newly selected AudioFile object including the audio data
 */
async function setSelectAudioFile(
    audioFileId: number
): Promise<AudioFile | null> {
    const db = connect();
    const stmt = db.prepare(
        `UPDATE ${Constants.AudioFilesTableName} SET selected = 0`
    );
    stmt.run();
    const selectStmt = db.prepare(
        `UPDATE ${Constants.AudioFilesTableName} SET selected = 1 WHERE id = @audioFileId`
    );
    await selectStmt.run({ audioFileId });
    const result = await getSelectedAudioFile(db);
    db.close();
    return result as AudioFile;
}

/**
 * Creates new measures in the database, completely replacing the old ABC string.
 * See documentation in createMeasureTable for how measures in OpenMarch are stored.
 * This also selects the newly created audio file.
 *
 * @param new_ABC_data The new ABC string to put into the database
 * @returns DatabaseResponse
 */
export async function insertAudioFile(
    audioFile: AudioFile
): Promise<DatabaseResponse<AudioFile[]>> {
    const db = connect();
    const stmt = db.prepare(
        `UPDATE ${Constants.AudioFilesTableName} SET selected = 0`
    );
    stmt.run();
    let output: DatabaseResponse<AudioFile[]> = { success: false };
    try {
        const insertStmt = db.prepare(`
                INSERT INTO ${Constants.AudioFilesTableName} (
                    data,
                    path,
                    nickname,
                    selected,
                    created_at,
                    updated_at
                )
                VALUES (
                    @data,
                    @path,
                    @nickname,
                    @selected,
                    @created_at,
                    @updated_at
                )
            `);
        const created_at = new Date().toISOString();
        const insertResult = insertStmt.run({
            ...audioFile,
            selected: 1,
            created_at,
            updated_at: created_at,
        });
        const id = insertResult.lastInsertRowid;

        output = {
            success: true,
            result: [{ ...audioFile, id: id as number }],
        };
    } catch (error: any) {
        console.error("Insert audio file error:", error);
        output = {
            success: false,
            error: { message: error.message, stack: error.stack },
        };
    } finally {
        db.close();
    }
    return output;
}

/**
 * Updates a list of audio files. The only thing that can be changed is the nickname.
 *
 * @param audioFileUpdates: Array of ModifiedAudioFileArgs objects to update the objects with
 * @returns - DatabaseResponse{success: boolean, result: Database.result | string}
 */
async function updateAudioFiles(
    audioFileUpdates: ModifiedAudioFileArgs[]
): Promise<DatabaseResponse<AudioFile[]>> {
    const db = connect();
    let output: DatabaseResponse<AudioFile[]> = { success: true };
    try {
        for (const audioFileUpdate of audioFileUpdates) {
            // Generate the SET clause of the SQL query
            const setClause = Object.keys(audioFileUpdate)
                .map((key) => `${key} = @${key}`)
                .join(", ");

            // Check if the SET clause is empty
            if (setClause.length === 0) {
                throw new Error("No valid properties to update");
            }

            let existingAudioFiles = await getAudioFilesDetails();
            const previousState = existingAudioFiles.find(
                (audioFile) => audioFile.id === audioFileUpdate.id
            );
            if (!previousState) {
                console.error(
                    `No audio file found with ID ${audioFileUpdate.id}`
                );
                continue;
            }
            const stmt = db.prepare(`
                UPDATE ${Constants.AudioFilesTableName}
                SET ${setClause}, updated_at = @new_updated_at
                WHERE id = @id
            `);

            await stmt.run({
                ...audioFileUpdate,
                new_updated_at: new Date().toISOString(),
            });

            // Get the new audio file
            existingAudioFiles = await getAudioFilesDetails();
            const newAudioFile = existingAudioFiles.find(
                (audioFile) => audioFile.id === audioFileUpdate.id
            );
            if (!newAudioFile) {
                console.error(
                    `No audio file found with ID ${audioFileUpdate.id}`
                );
                continue;
            }
        }
        output = { success: true };
    } catch (error: any) {
        console.error(error);
        output = {
            success: false,
            error: { message: error.message, stack: error.stack },
        };
    } finally {
        db.close();
    }
    return output;
}

/**
 * Deletes an audio file with the given id.
 *
 * @param audioFileId
 * @returns {success: boolean, error?: string}
 */
async function deleteAudioFile(
    audioFileId: number
): Promise<DatabaseResponse<AudioFile>> {
    const db = connect();
    let output: DatabaseResponse<AudioFile> = { success: true };
    try {
        const pageStmt = db.prepare(`
            DELETE FROM ${Constants.AudioFilesTableName}
            WHERE id = @audioFileId
        `);
        pageStmt.run({ audioFileId });
    } catch (error: any) {
        console.error(error);
        output = { success: false, error: error };
    } finally {
        db.close();
    }
    return output;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { ipcMain } from 'electron';
import Database from 'better-sqlite3';
import path from 'path';
import Constants from '../../src/global/Constants';
import * as fs from 'fs';
import * as History from './database.history';
import Marcher, { ModifiedMarcherArgs, NewMarcherArgs } from '../../src/global/classes/Marcher';
import Page, { ModifiedPageContainer, NewPageContainer } from '../../src/global/classes/Page';
import MarcherPage, { ModifiedMarcherPageArgs } from '@/global/classes/MarcherPage';
import FieldProperties from '../../src/global/classes/FieldProperties';
import { MeasureDatabaseContainer } from '@/global/classes/Measure';

export class DatabaseResponse {
    readonly success: boolean;
    /**
     * Resulting data from the database action. This isn't very well implemented
     * and likely will not be used.
     */
    readonly result?: Marcher[] | Page[] | MarcherPage[] | FieldProperties;
    readonly error?: { message: string, stack?: string };

    constructor(success: boolean, result?: any, error?: Error) {
        this.success = success;
        this.result = result;
        this.error = error;
    }
}

/* ============================ DATABASE ============================ */
let DB_PATH = '';

/**
 * Change the location of the database file the application and actively updates.
 *
 * @param path the path to the database file
 * @returns 200 if successful, -1 if the file does not exist
 */
export function setDbPath(path: string, isNewFile = false) {
    if (!fs.existsSync(path) && !isNewFile) {
        console.error(`setDbPath: File does not exist at path: ${path}`);
        DB_PATH = '';
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
    console.log('Creating database...');
    if (!db) return;
    createMarcherTable(db);
    createPageTable(db);
    createMarcherPageTable(db);
    createFieldPropertiesTable(db, FieldProperties.Template.NCAA);
    createMeasureTable(db);
    History.createHistoryTables(db);
    console.log('Database created.');
    db.close();
}

export function connect() {
    try {
        const dbPath = DB_PATH.length > 0 ? DB_PATH : path.resolve(__dirname, '../../', 'electron/database/', 'database.db');
        return Database(dbPath, { verbose: console.log });
    } catch (error: any) {
        throw new Error('Failed to connect to database:\nPLEASE RUN \'node_modules/.bin/electron-rebuild -f -w better-sqlite3\' to resolve this', error);
    }
}

function createMarcherTable(db: Database.Database) {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS "${Constants.MarcherTableName}" (
                "id"	INTEGER PRIMARY KEY AUTOINCREMENT,
                "id_for_html"	TEXT UNIQUE,
                "name"	TEXT,
                "section"	TEXT NOT NULL,
                "year"	TEXT,
                "notes"	TEXT,
                "drill_prefix"	TEXT NOT NULL,
                "drill_order"	INTEGER NOT NULL,
                "drill_number"	TEXT UNIQUE NOT NULL,
                "created_at"	TEXT NOT NULL,
                "updated_at"	TEXT NOT NULL,
                UNIQUE ("drill_prefix", "drill_order")
            );
        `);
    } catch (error) {
        console.error('Failed to create marcher table:', error);
    }
    console.log('Marcher table created.');
}

function createPageTable(db: Database.Database) {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS "${Constants.PageTableName}" (
                "id"	INTEGER PRIMARY KEY AUTOINCREMENT,
                "id_for_html"	TEXT UNIQUE,
                "name"	TEXT NOT NULL UNIQUE,
                "notes"	TEXT,
                "order"	INTEGER NOT NULL UNIQUE,
                "measure"	TEXT,
                "tempo"	REAL NOT NULL,
                "counts"	INTEGER NOT NULL,
                "created_at"	TEXT NOT NULL,
                "updated_at"	TEXT NOT NULL
            );
        `);
    } catch (error) {
        console.error('Failed to create page table:', error);
    }
}

function createMarcherPageTable(db: Database.Database) {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS "${Constants.MarcherPageTableName}" (
                "id" INTEGER PRIMARY KEY AUTOINCREMENT,
                "id_for_html" TEXT UNIQUE,
                "marcher_id" INTEGER NOT NULL,
                "page_id" INTEGER NOT NULL,
                "x" REAL,
                "y" REAL,
                "created_at" TEXT NOT NULL,
                "updated_at" TEXT NOT NULL,
                "notes" TEXT
            );
            CREATE INDEX IF NOT EXISTS "index_marcher_pages_on_marcher_id" ON "marcher_pages" ("marcher_id");
            CREATE INDEX IF NOT EXISTS "index_marcher_pages_on_page_id" ON "marcher_pages" ("page_id");
        `);
    } catch (error) {
        console.error('Failed to create marcher_page table:', error);
    }
}

function createFieldPropertiesTable(db: Database.Database, template: FieldProperties.Template) {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS "${Constants.FieldPropertiesTableName}" (
                id INTEGER PRIMARY KEY,
                json_data TEXT
            );
        `);
    } catch (error) {
        console.error('Failed to create field properties table:', error);
    }
    const fieldProperties: FieldProperties = new FieldProperties(template);
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
    console.log('Field properties table created.');
}

function createMeasureTable(db: Database.Database) {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS "${Constants.MeasureTableName}" (
                "id" INTEGER PRIMARY KEY AUTOINCREMENT,
                "number" INTEGER NOT NULL,
                "rehearsal_mark" TEXT,
                "tempo" REAL NOT NULL,
                "beat_unit" TEXT NOT NULL,
                "time_signature" TEXT NOT NULL,
                "duration" REAL NOT NULL,
                "notes" TEXT
            );
        `);
    } catch (error) {
        console.error('Failed to create measures table:', error);
    }
}

/* ============================ Handlers ============================ */
/**
 * Handlers for the app api.
 * Whenever modifying this, you must also modify the app api in electron/preload/index.ts
 */
export function initHandlers() {
    // Field properties
    ipcMain.handle('field_properties:get', async () => getFieldProperties());

    // File IO handlers located in electron/main/index.ts

    // Marcher
    ipcMain.handle('marcher:getAll', async () => getMarchers());
    ipcMain.handle('marcher:insert', async (_, args) => createMarcher(args));
    ipcMain.handle('marcher:update', async (_, args) => updateMarchers(args));
    ipcMain.handle('marcher:delete', async (_, marcher_id) => deleteMarcher(marcher_id));

    // Page
    ipcMain.handle('page:getAll', async () => getPages());
    ipcMain.handle('page:insert', async (_, args) => createPages(args));
    ipcMain.handle('page:update', async (
        _, pages: ModifiedPageContainer[], addToHistoryQueue: boolean, updateInReverse: boolean
    ) =>
        updatePages(pages, addToHistoryQueue, updateInReverse));
    ipcMain.handle('page:delete', async (_, page_id) => deletePage(page_id));

    // MarcherPage
    ipcMain.handle('marcher_page:getAll', async (_, args) => getMarcherPages(args));
    ipcMain.handle('marcher_page:get', async (_, args) => getMarcherPage(args));
    ipcMain.handle('marcher_page:update', async (_, args) => updateMarcherPages(args));

    // Measure
    ipcMain.handle('measure:getAll', async () => getMeasures());
    ipcMain.handle('measure:insert', async (_, newMeasures) => createMeasures(newMeasures));
    ipcMain.handle('measure:update', async (_, modifiedMeasures) => updateMeasures(modifiedMeasures));
    ipcMain.handle('measure:delete', async (_, measureIds) => deleteMeasures(measureIds));
}

/* ======================= Exported Functions ======================= */
// From the history file
export async function historyAction(type: 'undo' | 'redo', db?: Database.Database) {
    return await History.historyAction(type, db);
}

/* ======================== Field Properties ======================== */
/**
 * Gets the field properties from the database.
 *
 * @param db
 * @returns
 */
export async function getFieldProperties(db?: Database.Database): Promise<FieldProperties> {
    const dbToUse = db || connect();
    const stmt = dbToUse.prepare(`SELECT * FROM ${Constants.FieldPropertiesTableName}`);
    const result = await stmt.get({});
    const jsonData = (result as any).json_data;
    const fieldProperties = JSON.parse(jsonData) as FieldProperties;
    if (!db) dbToUse.close();
    return fieldProperties;
}


/* ============================ Marcher ============================ */
/**
 * @param db The database connection, or undefined to create a new connection
 * @returns A sorted array of marchers, sorted by the Marcher.compareTo method
 */
async function getMarchers(db?: Database.Database): Promise<Marcher[]> {
    const dbToUse = db || connect();
    const stmt = dbToUse.prepare(`SELECT * FROM ${Constants.MarcherTableName}`);
    const result = await stmt.all() as Marcher[];
    if (!db) dbToUse.close();
    return result;
}

async function getMarcher(marcherId: number, db?: Database.Database): Promise<Marcher> {
    const dbToUse = db || connect();
    const stmt = dbToUse.prepare(`SELECT * FROM ${Constants.MarcherTableName} WHERE id = @marcherId`);
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
async function createMarchers(newMarchers: NewMarcherArgs[]): Promise<DatabaseResponse> {
    const db = connect();
    let output: DatabaseResponse = { success: true };

    // List of queries executed in this function to be added to the history table
    // const historyQueries: History.historyQuery[] = [];
    try {
        for (const newMarcher of newMarchers) {
            const marcherToAdd: Marcher = new Marcher({
                id: 0, // Not used, needed for interface
                id_for_html: '', // Not used, needed for interface
                name: newMarcher.name || '',
                section: newMarcher.section,
                drill_prefix: newMarcher.drill_prefix,
                drill_order: newMarcher.drill_order
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
                updated_at: created_at
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
                id
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
                createMarcherPage(db, { marcher_id: id, page_id: page.id, x: 100, y: 100 });

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
        output = { success: false, error: { message: error.message, stack: error.stack } };
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
async function updateMarchers(modifiedMarchers: ModifiedMarcherArgs[]): Promise<DatabaseResponse> {
    const db = connect();
    let output: DatabaseResponse = { success: true };

    // List of queries executed in this function to be added to the history table
    const historyActions: History.UpdateHistoryEntry[] = [];
    // List of properties to exclude
    const excludedProperties = ['id'];

    try {
        for (const modifiedMarcher of modifiedMarchers) {
            // Generate the SET clause of the SQL query
            const setClause = Object.keys(modifiedMarcher)
                .filter(key => !excludedProperties.includes(key))
                .map(key => `${key} = @${key}`)
                .join(', ');

            // Check if the SET clause is empty
            if (setClause.length === 0) {
                throw new Error('No valid properties to update');
            }
            // Record the original values of the marcher
            const originalMarcher = await getMarcher(modifiedMarcher.id, db);

            const stmt = db.prepare(`
                UPDATE ${Constants.MarcherTableName}
                SET ${setClause}, updated_at = @new_updated_at
                WHERE id = @id
            `);

            stmt.run({ ...modifiedMarcher, new_updated_at: new Date().toISOString() });

            historyActions.push({
                tableName: Constants.MarcherTableName,
                setClause: setClause,
                previousState: originalMarcher,
                reverseAction: {
                    tableName: Constants.MarcherTableName,
                    setClause: setClause,
                    previousState: await getMarcher(modifiedMarcher.id, db)
                }
            });
        }
        History.insertUpdateHistory(historyActions, db);
    } catch (error: any) {
        console.error(error);
        output = { success: false, error: { message: error.message, stack: error.stack } };
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
async function deleteMarcher(marcher_id: number): Promise<DatabaseResponse> {
    const db = connect();
    let output: DatabaseResponse = { success: true };
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
    }
    catch (error: any) {
        console.error(error);
        output = { success: false, error: { message: error.message, stack: error.stack } };
    }
    finally {
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
    const result = await stmt.all() as Page[];
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
    const stmt = dbToUse.prepare(`SELECT * FROM ${Constants.PageTableName} WHERE id = @pageId`);
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
async function createPages(newPages: NewPageContainer[]): Promise<DatabaseResponse> {
    const db = connect();
    let output: DatabaseResponse = { success: true };

    // List of queries executed in this function to be added to the history table
    // const historyQueries: History.InsertHistoryEntry[] = [];

    try {
        for (const newPage of newPages) {
            // Get the max order
            const pageToAdd: NewPageContainer = {
                name: newPage.name,
                notes: newPage.notes || '',
                order: newPage.order,
                tempo: newPage.tempo,
                counts: newPage.counts
            };
            const insertStmt = db.prepare(`
                INSERT INTO ${Constants.PageTableName} (
                    name,
                    notes,
                    "order",
                    tempo,
                    counts,
                    created_at,
                    updated_at
                ) VALUES (
                    @name,
                    @notes,
                    @order,
                    @tempo,
                    @counts,
                    @created_at,
                    @updated_at
                )
            `);
            const created_at = new Date().toISOString();
            const insertResult = insertStmt.run({
                ...pageToAdd,
                created_at,
                updated_at: created_at
            });
            // Get the id of the inserted row
            const id = insertResult.lastInsertRowid as number;
            // Update the id_for_html field
            const updateStmt = db.prepare(`
                UPDATE ${Constants.PageTableName}
                SET id_for_html = @id_for_html
                WHERE id = @id
            `);
            const new_id_for_html = Constants.PagePrefix + '_' + id;
            updateStmt.run({
                id_for_html: new_id_for_html,
                id
            });

            // Add a marcherPage for this page for each marcher
            // Get all existing marchers
            const marchers = await getMarchers();
            // For each marcher, create a new MarcherPage
            for (const marcher of marchers) {
                const previousMarcherPageCoords = await getCoordsOfPreviousPage(marcher.id, id);
                createMarcherPage(db, {
                    marcher_id: marcher.id,
                    page_id: id,
                    x: previousMarcherPageCoords?.x || 100,
                    y: previousMarcherPageCoords?.y || 100
                });
            }
        }

    } catch (error: any) {
        console.error(error);
        output = { success: false, error: { message: error.message, stack: error.stack } };
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
async function updatePages(modifiedPages: ModifiedPageContainer[],
    addToHistoryQueue: Boolean = true, updateInReverse = false
):
    Promise<DatabaseResponse> {

    const db = connect();
    let output: DatabaseResponse = { success: true };

    // List of queries executed in this function to be added to the history table
    const historyActions: History.UpdateHistoryEntry[] = [];
    // List of properties to exclude
    const excludedProperties = ['id'];
    const sortedModifiedPages = modifiedPages.sort((a, b) => (a.order ? a.order : 0) - (b.order ? b.order : 0));

    try {
        for (const pageUpdate of updateInReverse ? sortedModifiedPages.toReversed() : sortedModifiedPages) {
            // Generate the SET clause of the SQL query
            const setClause = Object.keys(pageUpdate)
                .filter(key => !excludedProperties.includes(key))
                .map(key => `"${key}" = @${key}`)
                .join(', ');

            // Check if the SET clause is empty
            if (setClause.length === 0) {
                console.error('No valid properties to update');
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
            stmt.run({ ...pageUpdate, new_updated_at: new Date().toISOString() });

            if (addToHistoryQueue) {
                historyActions.push({
                    tableName: Constants.PageTableName,
                    setClause: setClause,
                    previousState: originalPage,
                    reverseAction: {
                        tableName: Constants.PageTableName,
                        setClause: setClause,
                        previousState: await getPage(pageUpdate.id, db)
                    }
                });
            }
        }
        if (addToHistoryQueue)
            History.insertUpdateHistory(historyActions, db);
    } catch (error: any) {
        console.error(error);
        output = { success: false, error: { message: error.message, stack: error.stack } };
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
async function deletePage(page_id: number): Promise<DatabaseResponse> {
    const db = connect();
    let output: DatabaseResponse = { success: true };
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
    }
    catch (error: any) {
        console.error(error);
        output = { success: false, error: error };
    }
    finally {
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
async function getMarcherPages(args: { marcher_id?: number, page_id?: number }): Promise<MarcherPage[]> {
    const db = connect();
    let stmt = db.prepare(`SELECT * FROM ${Constants.MarcherPageTableName}`);
    if (args) {
        if (args.marcher_id && args.page_id)
            stmt = db.prepare(`SELECT * FROM ${Constants.MarcherPageTableName} WHERE marcher_id = ${args.marcher_id} AND page_id = ${args.page_id}`);
        else if (args.marcher_id)
            stmt = db.prepare(`SELECT * FROM ${Constants.MarcherPageTableName} WHERE marcher_id = ${args.marcher_id}`);
        else if (args.page_id)
            stmt = db.prepare(`SELECT * FROM ${Constants.MarcherPageTableName} WHERE page_id = ${args.page_id}`);
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
async function getMarcherPage(args: { marcher_id: number, page_id: number }): Promise<MarcherPage> {
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
async function createMarcherPage(db: Database.Database, newMarcherPage: ModifiedMarcherPageArgs) {
    if (!newMarcherPage.marcher_id || !newMarcherPage.page_id)
        throw new Error('MarcherPage must have marcher_id and page_id');

    const marcherPageToAdd: MarcherPage = {
        id: 0, // Not used, needed for interface
        id_for_html: '', // Not used, needed for interface
        marcher_id: newMarcherPage.marcher_id,
        page_id: newMarcherPage.page_id,
        x: newMarcherPage.x,
        y: newMarcherPage.y
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
        updated_at: created_at
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
        id_for_html: Constants.MarcherPagePrefix + '_' + id,
        id
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
async function updateMarcherPages(marcherPageUpdates: ModifiedMarcherPageArgs[]): Promise<DatabaseResponse> {
    const db = connect();
    let output: DatabaseResponse = { success: true };
    const historyActions: History.UpdateHistoryEntry[] = [];
    try {
        for (const marcherPageUpdate of marcherPageUpdates) {
            // Generate the SET clause of the SQL query
            const setClause = Object.keys(marcherPageUpdate)
                .map(key => `${key} = @${key}`)
                .join(', ');

            // Check if the SET clause is empty
            if (setClause.length === 0) {
                throw new Error('No valid properties to update');
            }

            // Record the original values of the marcherPage for the history table
            const previousState = await getMarcherPage({
                marcher_id: marcherPageUpdate.marcher_id,
                page_id: marcherPageUpdate.page_id
            });

            const stmt = db.prepare(`
                UPDATE ${Constants.MarcherPageTableName}
                SET x = @x, y = @y, updated_at = @new_updated_at
                WHERE marcher_id = @marcher_id AND page_id = @page_id
            `);

            await stmt.run({ ...marcherPageUpdate, new_updated_at: new Date().toISOString() });

            const updateHistoryEntry = {
                tableName: Constants.MarcherPageTableName,
                setClause: setClause,
                previousState: previousState,
                reverseAction: {
                    tableName: Constants.MarcherPageTableName,
                    setClause: setClause,
                    previousState: await getMarcherPage({
                        marcher_id: marcherPageUpdate.marcher_id,
                        page_id: marcherPageUpdate.page_id
                    }),
                }
            }

            historyActions.push(updateHistoryEntry);
        }
        History.insertUpdateHistory(historyActions, db);

        output = { success: true };
    } catch (error: any) {
        console.error(error);
        output = { success: false, error: { message: error.message, stack: error.stack } };
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
 * @param page_id the page_id of the page that the coordinates will be updated on (not the previous page's id).
 */
async function getCoordsOfPreviousPage(marcher_id: number, page_id: number) {
    const db = connect();

    /* Get the previous marcherPage */
    const currPageStmt = db.prepare(`SELECT * FROM ${Constants.PageTableName} WHERE id = @page_id`);
    const currPage = currPageStmt.get({ page_id }) as Page;
    if (!currPage)
        throw new Error(`Page with id ${page_id} does not exist`);
    if (currPage.order === 1) {
        console.log(`page_id ${page_id} is the first page, skipping setCoordsToPreviousPage`);
        return;
    }
    const previousPage = await getPreviousPage(page_id, db);
    const previousMarcherPage = await getMarcherPage({ marcher_id, page_id: previousPage.id }) as MarcherPage;

    if (!previousPage)
        throw new Error(`Previous page with page_id ${page_id} does not exist`);

    db.close();
    return {
        x: previousMarcherPage.x,
        y: previousMarcherPage.y
    }
}

/**
 * Returns the previous page in the order of pages.
 *
 * @param pageId
 * @param db
 * @returns The page prior to the page with the given id. Null if the page is the first page.
 */
async function getPreviousPage(pageId: number, db?: Database.Database): Promise<Page> {
    const dbToUse = db || connect();
    const currentOrder = (await getPage(pageId, dbToUse)).order;

    const stmt = dbToUse.prepare(`
        SELECT *
        FROM pages
        WHERE "order" < @currentOrder
        ORDER BY "order" DESC
        LIMIT 1
    `);

    const result = await stmt.get({ currentOrder }) as Page;
    if (!db) dbToUse.close();
    return result as Page || null;

}

/* ============================ Measures ============================ */
/***** NOTE - Measures are currently not part of the history table *****/

/**
 * Gets all of the measures from the database.
 *
 * @param db The database connection
 * @returns Array of measures
 */
async function getMeasures(db?: Database.Database): Promise<MeasureDatabaseContainer[]> {
    const dbToUse = db || connect();
    const stmt = dbToUse.prepare(`SELECT * FROM ${Constants.MeasureTableName}`);
    const measures = stmt.all() as MeasureDatabaseContainer[];
    if (!db) dbToUse.close();
    return measures;
}

/**
 * Creates a new measure in the database.
 *
 * @param newMeasure The new measure to create
 * @returns The ID of the newly created measure
 */
async function createMeasures(newMeasures: MeasureDatabaseContainer[]): Promise<DatabaseResponse> {
    const db = connect();
    let output: DatabaseResponse = { success: false }
    try {
        for (const newMeasure of newMeasures) {
            const insertStmt = db.prepare(`
                INSERT INTO ${Constants.MeasureTableName} (
                    number,
                    rehearsal_mark,
                    tempo,
                    beat_unit,
                    time_signature,
                    duration,
                    notes,
                    created_at,
                    updated_at
                )
                VALUES (
                    @number,
                    @rehearsal_mark,
                    @tempo,
                    @beat_unit,
                    @time_signature,
                    @duration,
                    @notes,
                    @created_at,
                    @updated_at
                )
            `);
            const created_at = new Date().toISOString();
            insertStmt.run(
                {
                    ...newMeasure,
                    created_at,
                    updated_at: created_at
                }
            );
        }
        output = { success: true }
    } catch (error: any) {
        console.error(error);
        output = { success: false, error: { message: error.message, stack: error.stack } };
    } finally {
        db.close();
    }
    return output;
}

/**
 * Updates measures with the given values.
 *
 * @param modifiedMeasures The modified measures. The ID is what identifies the measure to be changed.
 * @returns {success: boolean, error?: string}
 */
async function updateMeasures(modifiedMeasures: MeasureDatabaseContainer[]): Promise<DatabaseResponse> {
    const db = connect();
    let output: DatabaseResponse = { success: false }
    try {
        for (const modifiedMeasure of modifiedMeasures) {
            // Generate the SET clause of the SQL query
            const setClause = Object.keys(modifiedMeasure)
                .map(key => `${key} = @${key}`)
                .join(', ');

            // Check if the SET clause is empty
            if (setClause.length === 0) {
                throw new Error('No valid properties to update in the Measure table');
            }

            const updateStmt = db.prepare(`
                UPDATE ${Constants.MeasureTableName}
                SET ${setClause}, updated_at = @new_updated_at
                WHERE id = @id
            `);

            updateStmt.run({ ...modifiedMeasure, new_updated_at: new Date().toISOString() });
        }
        output = { success: true }
    } catch (error: any) {
        console.error(error);
        output = { success: false, error: { message: error.message, stack: error.stack } };
    } finally {
        db.close();
    }
    return output
}

/**
 * Delete measures from the database.
 *
 * @param measureIds The IDs of the measures to delete
 * @returns {success: boolean, error?: string}
 */
async function deleteMeasures(measureIds: number[]): Promise<DatabaseResponse> {
    const db = connect();
    let output: DatabaseResponse = { success: false }
    try {
        for (const measureId of measureIds) {
            const deleteStmt = db.prepare(`DELETE FROM ${Constants.MeasureTableName} WHERE id = @measureId`);
            deleteStmt.run({ measureId });
        }
    } catch (error: any) {
        console.error(error);
        output = { success: false, error: { message: error.message, stack: error.stack } };
    }
    finally {
        db.close();
    }
    return output;
}

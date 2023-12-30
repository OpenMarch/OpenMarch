import { app, dialog, ipcMain } from 'electron';
import Database from 'better-sqlite3';
import path from 'path';
import { Constants } from '../../src/Constants';
import * as Interfaces from '../../src/Interfaces';
import * as fs from 'fs';
import { Update } from 'vite/types/hmrPayload';

/* ============================ DATABASE ============================ */
var DB_PATH = '';

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

export function initDatabase() {
    const db = connect();
    console.log(db);
    console.log('Creating database...');
    if(!db) return;
    createMarcherTable(db);
    createPageTable(db);
    createMarcherPageTable(db);
    console.log('Database created.');
    db.close();
}

export function connect() {
    try {
        const dbPath = DB_PATH.length > 0 ? DB_PATH : path.resolve(__dirname, '../../','electron/database/', 'database.db');
        return Database(dbPath, { verbose: console.log });
    } catch (error: any) {
        throw new Error('Failed to connect to database:\
        PLEASE RUN \'node_modules/.bin/electron-rebuild -f -w better-sqlite3\' to resolve this', error);
    }
}

function createMarcherTable(db: Database.Database) {
    console.log('Creating marcher table...');
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS "marchers" (
                "id"	INTEGER NOT NULL UNIQUE,
                "id_for_html"	TEXT UNIQUE,
                "name"	TEXT,
                "section"	TEXT NOT NULL,
                "year"	INTEGER,
                "notes"	TEXT,
                "drill_prefix"	TEXT NOT NULL,
                "drill_order"	INTEGER NOT NULL,
                "drill_number"	TEXT UNIQUE NOT NULL,
                "created_at"	TEXT NOT NULL,
                "updated_at"	TEXT NOT NULL,
                PRIMARY KEY("id" AUTOINCREMENT)
            );
        `);
    } catch (error) {
        console.error('Failed to create marcher table:', error);
    }
    console.log('Marcher table created.');
}

function createPageTable(db: Database.Database) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS "pages" (
            "id"	INTEGER NOT NULL UNIQUE,
            "id_for_html"	TEXT UNIQUE,
            "name"	TEXT NOT NULL UNIQUE,
            "notes"	TEXT,
            "order"	INTEGER NOT NULL UNIQUE,
            "tempo"	REAL NOT NULL,
            "time_signature"	TEXT,
            "counts"	INTEGER NOT NULL,
            "created_at"	TEXT NOT NULL,
            "updated_at"	TEXT NOT NULL,
            PRIMARY KEY("id" AUTOINCREMENT)
        );
    `);
}

function createMarcherPageTable(db: Database.Database) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS "marcher_pages" (
            "id" INTEGER NOT NULL UNIQUE,
            "id_for_html" TEXT UNIQUE,
            "marcher_id" INTEGER NOT NULL,
            "page_id" INTEGER NOT NULL,
            "x" REAL,
            "y" REAL,
            "created_at" TEXT NOT NULL,
            "updated_at" TEXT NOT NULL,
            "notes" TEXT,
            PRIMARY KEY("id" AUTOINCREMENT)
        );
        CREATE INDEX IF NOT EXISTS "index_marcher_pages_on_marcher_id" ON "marcher_pages" ("marcher_id");
        CREATE INDEX IF NOT EXISTS "index_marcher_pages_on_page_id" ON "marcher_pages" ("page_id");
    `);
}

// export function init() {
//     ipcMain.handle('database', async (event, query, ...params) => {
//         const db = connect();
//         const stmt = db.prepare(query);
//         const result = stmt.all(...params);
//         db.close();
//         return result;
//     });
// }

/**
 * Handlers for the app api.
 * Whenever modifying this, you must also modify the app api in electron/preload/index.ts
 */
export function initHandlers() {
    // Marcher
    ipcMain.handle('marcher:getAll', async (_, args) => getMarchers());
    ipcMain.handle('marcher:insert', async (_, args) => createMarcher(args));
    ipcMain.handle('marcher:update', async (_, args) => updateMarcher(args));
    ipcMain.handle('marcher:delete', async (_, marcher_id) => deleteMarcher(marcher_id));

    // Page
    ipcMain.handle('page:getAll', async (_, args) => getPages());
    ipcMain.handle('page:insert', async (_, args) => createPage(args));
    ipcMain.handle('page:update', async (_, args) => updatePage(args));

    // MarcherPage
    ipcMain.handle('marcher_page:getAll', async (_, args) => getMarcherPages(args));
    ipcMain.handle('marcher_page:get', async (_, args) => getMarcherPage(args));
    ipcMain.handle('marcher_page:update', async (_, args) => updateMarcherPage(args));
}

/* ============================ Marcher ============================ */
async function getMarchers(): Promise<Interfaces.Marcher[]> {
    const db = connect();
    const stmt = db.prepare(`SELECT * FROM ${Constants.MarcherTableName}`);
    const result = stmt.all();
    db.close();
    return result as Interfaces.Marcher[];
}

async function createMarcher(newMarcher: Interfaces.NewMarcher) {
    const marcherToAdd: Interfaces.Marcher = {
        id: 0, // Not used, needed for interface
        id_for_html: '', // Not used, needed for interface
        name: newMarcher.name || '',
        section: newMarcher.section,
        drill_number: newMarcher.drill_prefix + newMarcher.drill_order,
        drill_prefix: newMarcher.drill_prefix,
        drill_order: newMarcher.drill_order
    };
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
    const updateResult = updateStmt.run({
        id_for_html: Constants.MarcherPrefix + "_" + id,
        id
    });

    /* Add a marcherPage for this marcher for each page */
    // Get all existing pages
    const pages = await getPages();

    // For each page, create a new MarcherPage
    for (const page of pages) {
        createMarcherPage(db, { marcher_id: id, page_id: page.id, x: 100, y: 100 });
    }

    db.close();
    return updateResult;
}

/**
 * Updates a marcher with the given values.
 *
 * @param marcher_id: number - The id of the marcher to update
 * @param args: obj {} - The values to update the marcher with
 * @returns
 */
async function updateMarcher(args: Partial<Interfaces.Marcher> & {id: number}) {
    const db = connect();

    // List of properties to exclude
    const excludedProperties = ['id', 'id_for_html', 'drill_number', 'created_at', 'updated_at'];

    // Generate the SET clause of the SQL query
    let setClause = Object.keys(args)
        .filter(key => !excludedProperties.includes(key))
        .map(key => `${key} = @${key}`)
        .join(', ');

    // Check if the SET clause is empty
    if (setClause.length === 0) {
        throw new Error('No valid properties to update');
    }

    if(args.drill_prefix || args.drill_order) {
        setClause += ', drill_number = @drill_prefix || @drill_order';
    }

    // console.log("setClause:", setClause);

    const stmt = db.prepare(`
        UPDATE ${Constants.MarcherTableName}
        SET ${setClause}, updated_at = @new_updated_at
        WHERE id = @id
    `);

    // console.log("stmt:", stmt);

    const result = stmt.run({ ...args,  new_updated_at: new Date().toISOString()});
    db.close();
    return result;
}

async function deleteMarcher(marcher_id: number) {
    const db = connect();
    const stmt = db.prepare(`
        DELETE FROM ${Constants.MarcherTableName}
        WHERE id = @marcher_id
    `);
    const result = stmt.run({ marcher_id });
    db.close();
    return result;
}

/* ============================ Page ============================ */
async function getPages(): Promise<Interfaces.Page[]> {
    const db = connect();
    const stmt = db.prepare(`SELECT * FROM ${Constants.PageTableName}`);
    const result = stmt.all();
    db.close();
    return result as Interfaces.Page[];
}

async function createPage(newPage: Interfaces.NewPage) {
    const db = connect();

    // Get the max order
    const stmt = db.prepare(`SELECT MAX("order") as maxOrder FROM ${Constants.PageTableName}`);
    const result: any = stmt.get();
    const newOrder = result.maxOrder + 1;
    const pageToAdd: Interfaces.Page = {
        id: 0, // Not used, needed for interface
        id_for_html: '', // Not used, needed for interface
        name: newPage.name || '',
        notes: newPage.notes || '',
        order: newOrder,
        tempo: newPage.tempo,
        time_signature: newPage.time_signature,
        counts: newPage.counts
    };
    const insertStmt = db.prepare(`
        INSERT INTO ${Constants.PageTableName} (
            name,
            notes,
            "order",
            tempo,
            time_signature,
            counts,
            created_at,
            updated_at
        ) VALUES (
            @name,
            @notes,
            @order,
            @tempo,
            @time_signature,
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
    const updateResult = updateStmt.run({
        id_for_html: Constants.PagePrefix + '_' + id,
        id
    });

    /* Add a marcherPage for this page for each marcher */
    // Get all existing marchers
    const marchers = await getMarchers();

    // For each marcher, create a new MarcherPage
    for (const marcher of marchers) {
        const previousMarcherPageCoords = await getCoordsOfPreviousPage(marcher.id, id);
        createMarcherPage(db, {
            marcher_id: marcher.id,
            page_id: id,
            x: previousMarcherPageCoords?.x || 100,
            y: previousMarcherPageCoords?.y || 100 });
    }

    db.close();
    return updateResult;
}

async function updatePage(args: Partial<Interfaces.Page> & {id: number}) {
    const db = connect();

    // List of properties to exclude
    const excludedProperties = ['id', 'id_for_html', 'order', 'created_at', 'updated_at'];

    // Generate the SET clause of the SQL query
    let setClause = Object.keys(args)
        .filter(key => !excludedProperties.includes(key))
        .map(key => `${key} = @${key}`)
        .join(', ');

    // Check if the SET clause is empty
    if (setClause.length === 0) {
        throw new Error('No valid properties to update');
    }

    // console.log("setClause:", setClause);

    const stmt = db.prepare(`
        UPDATE ${Constants.PageTableName}
        SET ${setClause}, updated_at = @new_updated_at
        WHERE id = @id
    `);

    // console.log("stmt:", stmt);

    const result = stmt.run({ ...args,  new_updated_at: new Date().toISOString()});
    db.close();
    return result;
}

/* ============================ MarcherPage ============================ */
/**
 * Gets all of the marcherPages, or the marcherPages with the given marcher_id or page_id.
 *
 * @param args { marcher_id?: number, page_id?: number}
 * @returns Array of marcherPages
 */
async function getMarcherPages(args: { marcher_id?: number, page_id?: number}): Promise<Interfaces.MarcherPage[]> {
    const db = connect();
    let stmt = db.prepare(`SELECT * FROM ${Constants.MarcherPageTableName}`);
    if(args) {
        if(args.marcher_id && args.page_id)
            stmt = db.prepare(`SELECT * FROM ${Constants.MarcherPageTableName} WHERE marcher_id = ${args.marcher_id} AND page_id = ${args.page_id}`);
        else if(args.marcher_id)
            stmt = db.prepare(`SELECT * FROM ${Constants.MarcherPageTableName} WHERE marcher_id = ${args.marcher_id}`);
        else if(args.page_id)
            stmt = db.prepare(`SELECT * FROM ${Constants.MarcherPageTableName} WHERE page_id = ${args.page_id}`);
    }
    const result = stmt.all();
    db.close();
    return result as Interfaces.MarcherPage[];
}

/**
 * Gets the marcherPage with the given marcher_id and page_id.
 * TODO: NOT TESTED
 *
 * @param args { marcher_id: number, page_id: number}
 * @returns The marcherPage
 */
async function getMarcherPage(args: { marcher_id: number, page_id: number}): Promise<Interfaces.MarcherPage> {
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
async function createMarcherPage(db: Database.Database, newMarcherPage: Interfaces.UpdateMarcherPage) {
    if(!newMarcherPage.marcher_id || !newMarcherPage.page_id)
        throw new Error('MarcherPage must have marcher_id and page_id');

    const marcherPageToAdd: Interfaces.MarcherPage = {
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

async function updateMarcherPage(args: Interfaces.UpdateMarcherPage) {
    const db = connect();

    // Generate the SET clause of the SQL query
    let setClause = Object.keys(args)
        .map(key => `${key} = @${key}`)
        .join(', ');

    // Check if the SET clause is empty
    if (setClause.length === 0) {
        throw new Error('No valid properties to update');
    }

    // console.log("setClause:", setClause);

    const stmt = db.prepare(`
        UPDATE ${Constants.MarcherPageTableName}
        SET x = @x, y = @y, updated_at = @new_updated_at
        WHERE marcher_id = @marcher_id AND page_id = @page_id
    `);

    // console.log("stmt:", stmt);

    const result = stmt.run({ ...args,  new_updated_at: new Date().toISOString()});
    db.close();
    return result;
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
    const currPage = currPageStmt.get({ page_id }) as Interfaces.Page;
    if(!currPage)
        throw new Error(`Page with id ${page_id} does not exist`);
    if(currPage.order === 1){
        console.log(`page_id ${page_id} is the first page, skipping setCoordsToPreviousPage`);
        return;
    }
    const previousPageStmt = db.prepare(`SELECT * FROM ${Constants.PageTableName} WHERE "order" = @order`);
    const previousPage = previousPageStmt.get({ order: currPage.order - 1 }) as Interfaces.Page;
    const previousMarcherPage = await getMarcherPage({ marcher_id, page_id: previousPage.id }) as Interfaces.MarcherPage;

    if(!previousPage)
        throw new Error(`Previous page with page_id ${page_id} does not exist`);

    db.close();
    return {
        x: previousMarcherPage.x,
        y: previousMarcherPage.y
    }
}

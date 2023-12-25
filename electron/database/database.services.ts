import { app, ipcMain } from 'electron';
import Database from 'better-sqlite3';
import path from 'path';
import * as Interfaces from '../../src/Interfaces';

/* ============================ DATABASE ============================ */
function connect() {
    try {
        return Database(
            path.resolve(__dirname, '../../','electron/database/', 'database.db'),
            { verbose: console.log, fileMustExist: true },
        );
    } catch (error) {
        console.error('Failed to connect to database:\
        PLEASE RUN \'node_modules/.bin/electron-rebuild -f -w better-sqlite3\' to resolve this', error);
    }
    return undefined;
}

export function createDatabase() {
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
            "id_for_html"	TEXT NOT NULL UNIQUE,
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
            "marcher_id" INTEGER NOT NULL,
            "page_id" INTEGER NOT NULL,
            "x" REAL,
            "y" REAL,
            "created_at" TEXT NOT NULL,
            "updated_at" TEXT NOT NULL,
            "id_for_html" TEXT NOT NULL,
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

export function initHandlers() {
    ipcMain.handle('marcher:getAll', async (event, ...args) => getMarchers());
    ipcMain.handle('marcher:insert', async (event, ...args) => createMarcher(args[0]));
}

/* ============================ Marcher ============================ */
export function getMarchers() {
    const db = connect();
    const stmt = db.prepare('SELECT * FROM marchers');
    const result = stmt.all();
    db.close();
    return result;
}

export function createMarcher(newMarcher: Interfaces.NewMarcher) {
    return () => ipcMain.handle('createMarcher', async (event, ...args) => {
        const marcherToAdd: Interfaces.Marcher = {
            id: 0,
            id_for_html: '',
            name: newMarcher.name,
            instrument: newMarcher.instrument,
            drill_number: newMarcher.drill_prefix + newMarcher.drill_order,
            drill_prefix: newMarcher.drill_prefix,
            drill_order: newMarcher.drill_order
        };
        const created_at = new Date().toISOString();
        const db = connect();
        const stmt = db.prepare(`
            INSERT INTO marchers (
                name,
                instrument,
                drill_prefix,
                drill_order,
                drill_number,
                created_at,
                updated_at,
            ) VALUES (
                @name,
                @instrument,
                @drill_prefix,
                @drill_order,
                @drill_number,
                @created_at,
                @updated_at
            )
        `);
        const result = stmt.run({
            marcherToAdd,
            created_at,
            updated_at: created_at});
        db.close();
        return result;
    });
}


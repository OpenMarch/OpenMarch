import Constants from "../../../src/global/Constants";
import Database from "better-sqlite3";
import { createHistoryTables, createUndoTriggers } from "../database.history";
import v5 from "./v5";
import { FIRST_BEAT_ID } from "../tables/BeatTable";
import { FIRST_PAGE_ID } from "../tables/PageTable";

export default class v6 extends v5 {
    get version() {
        return 6;
    }

    migrateToThisVersion(db?: Database.Database): void {
        const dbToUse = db ? db : this.databaseConnector();
        if (!dbToUse) throw new Error("Failed to connect to database.");

        this.migrationWrapper(() => {
            // dbToUse.exec(`
            //     ALTER TABLE "${Constants.FieldPropertiesTableName}"
            //     ADD COLUMN image BLOB;
            // `);
            // dbToUse.exec(`
            //     ALTER TABLE "${Constants.FieldPropertiesTableName}"
            //     ADD COLUMN field_theme string;
            // `);
        });
    }

    tableAlreadyExists = (tableName: string, db: Database.Database) => {
        const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all();
        const tableExists = tableInfo.length > 0;
        if (tableExists) {
            console.log(`Table ${tableName} already exists`);
        }
        return tableExists;
    };

    createTables() {
        const db = this.databaseConnector();
        if (!db) throw new Error("Failed to connect to database.");

        const currentVersion = db.pragma("user_version", { simple: true });
        if (currentVersion === this.version) {
            console.log(`Database already at version ${this.version}`);
            return;
        }

        console.log(db);
        // Set the pragma version to -1 so we know if it failed in the middle of creation
        db.pragma("user_version = " + -1);
        console.log("Creating database...");
        createHistoryTables(db);
        this.createBeatsTable(db);
        this.createMeasureTable(db);
        this.createPageTable(db);
        this.createMarcherTable(db);
        this.createMarcherPageTable(db);
        this.createFieldPropertiesTable(db);
        this.createAudioFilesTable(db);
        this.createShapeTable(db);
        this.createShapePageTable(db);
        this.createShapePageMarcherTable(db);
        this.createUtilityTable(db);
        db.pragma("user_version = " + this.version);
        console.log("\nDatabase created successfully.");
    }

    createBeatsTable(db: Database.Database) {
        const tableName = Constants.BeatsTableName;
        if (this.tableAlreadyExists(tableName, db))
            return {
                success: true,
                data: tableName,
            };
        try {
            db.exec(`
                CREATE TABLE IF NOT EXISTS "${tableName}" (
                    "id"                    INTEGER PRIMARY KEY,
                    "duration"              FLOAT NOT NULL CHECK (duration >= 0),
                    "position"              INTEGER NOT NULL UNIQUE CHECK (position >= 0),
                    "include_in_measure"    INTEGER NOT NULL DEFAULT 1 CHECK (include_in_measure IN (0, 1)),
                    "notes"                 TEXT,
                    "created_at"	        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updated_at"	        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Create default starting beat
            db.prepare(
                `INSERT INTO ${tableName} ("duration", "position", "id") VALUES (0, 0, ${FIRST_BEAT_ID})`,
            ).run();

            db.prepare(
                `CREATE TRIGGER prevent_beat_modification
                    BEFORE UPDATE ON "${tableName}"
                    FOR EACH ROW
                    WHEN OLD.id = ${FIRST_BEAT_ID}
                    BEGIN
                        SELECT RAISE(FAIL, 'Modification not allowed for the first beat.');
                    END;`,
            ).run();
            db.prepare(
                `
                    CREATE TRIGGER prevent_beat_deletion
                    BEFORE DELETE ON "${tableName}"
                    FOR EACH ROW
                    WHEN OLD.id = ${FIRST_BEAT_ID}
                    BEGIN
                        SELECT RAISE(FAIL, 'Deletion not allowed for the first beat.');
                    END;`,
            ).run();

            // Add 16 default beats
            for (let x = 0; x < 16; x++) {
                db.prepare(
                    `INSERT INTO ${tableName} ("duration", "position") VALUES (0.5, ${x + 1})`,
                ).run();
            }
        } catch (error) {
            throw new Error(`Failed to create ${tableName} table: ${error}`);
        }
        createUndoTriggers(db, tableName);
    }

    createPageTable(db: Database.Database) {
        const tableName = Constants.PageTableName;
        // Check if table exists
        if (this.tableAlreadyExists(tableName, db))
            return {
                success: true,
                data: tableName,
            };
        const tableExists = db
            .prepare(
                `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`,
            )
            .get();
        if (tableExists) {
            console.log(`Table ${tableName} already exists`);
            return { success: true, data: tableName };
        }

        try {
            db.prepare(
                `
                CREATE TABLE IF NOT EXISTS "${tableName}" (
                    "id"	            INTEGER PRIMARY KEY,
                    "is_subset"	        INTEGER NOT NULL DEFAULT 0 CHECK (is_subset IN (0, 1)),
                    "notes"	            TEXT,
                    "created_at"	    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updated_at"	    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "start_beat"	    INTEGER NOT NULL UNIQUE,
                    FOREIGN KEY ("start_beat") REFERENCES "${Constants.BeatsTableName}" ("id")
                    );
                `,
            ).run();

            // Create page 1 with 0 counts. Page 1 should always exist
            // It is safe to assume there are no marchers in the database at this point, so MarcherPages do not need to be created
            db.prepare(
                `INSERT INTO ${tableName} ("start_beat", "id") VALUES (${FIRST_BEAT_ID}, ${FIRST_PAGE_ID})`,
            ).run();

            db.prepare(
                `CREATE TRIGGER prevent_page_modification
                    BEFORE UPDATE ON "${tableName}"
                    FOR EACH ROW
                    WHEN OLD.id = ${FIRST_PAGE_ID}
                    BEGIN
                        SELECT RAISE(FAIL, 'Modification not allowed for the first page.');
                    END;`,
            ).run();
            db.prepare(
                `
                    CREATE TRIGGER prevent_page_deletion
                    BEFORE DELETE ON "${tableName}"
                    FOR EACH ROW
                    WHEN OLD.id = ${FIRST_PAGE_ID}
                    BEGIN
                        SELECT RAISE(FAIL, 'Deletion not allowed for the first page.');
                    END;`,
            ).run();

            // Make the undo triggers after so the creation of the first page cannot be undone
            createUndoTriggers(db, tableName);

            return { success: true, data: tableName };
        } catch (error: any) {
            throw new Error(`Failed to create  table: ${error}`);
        }
    }

    /**
     * Measures in OpenMarch use a simplified version of ABC notation.
     * There is only ever one entry in this table, and it is the ABC notation string.
     * When updating measures, this string will be modified.
     *
     * @param db Database object to use
     */
    createMeasureTable(db: Database.Database) {
        const tableName = Constants.MeasureTableName;
        if (this.tableAlreadyExists(tableName, db))
            return {
                success: true,
                data: tableName,
            };
        try {
            db.exec(`
                    CREATE TABLE IF NOT EXISTS "${tableName}" (
                        id              INTEGER PRIMARY KEY,
                        start_beat      INTEGER NOT NULL UNIQUE,
                        rehearsal_mark  TEXT,
                        notes           TEXT,
                        "created_at"	TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        "updated_at"	TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (start_beat) REFERENCES "${Constants.BeatsTableName}" ("id")
                    );
                `);
        } catch (error) {
            throw new Error(`Failed to create ${tableName} table: ${error}`);
        }
        createUndoTriggers(db, tableName);
    }

    /**
     * A table with various utility and metadata about the piece.
     * @param db Database object to use
     */
    createUtilityTable(db: Database.Database) {
        const tableName = Constants.UtilityTableName;
        if (this.tableAlreadyExists(tableName, db))
            return {
                success: true,
                data: tableName,
            };
        try {
            db.exec(`
                    CREATE TABLE IF NOT EXISTS "${tableName}" (
                        id                      INTEGER PRIMARY KEY CHECK (id = 0),
                        last_page_counts        INTEGER CHECK (last_page_counts >= 1),
                        FOREIGN KEY (last_page_counts) REFERENCES "${Constants.BeatsTableName}" ("id")
                    );
                `);
            db.prepare(
                `INSERT INTO "${tableName}" (id, last_page_counts) VALUES (0, 8);`,
            ).run();
            db.prepare(
                `CREATE TRIGGER prevent_utility_deletion
                    BEFORE DELETE ON "${tableName}"
                    FOR EACH ROW
                    WHEN OLD.id = 0
                    BEGIN
                        SELECT RAISE(FAIL, 'Deletion not allowed for the utility record.');
                    END;`,
            ).run();
        } catch (error) {
            throw new Error(`Failed to create ${tableName} table: ${error}`);
        }
        createUndoTriggers(db, tableName);
    }
}

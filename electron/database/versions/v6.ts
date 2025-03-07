import Constants from "../../../src/global/Constants";
import Database from "better-sqlite3";
import { createHistoryTables, createUndoTriggers } from "../database.history";
import v5 from "./v5";

export default class v6 extends v5 {
    get version() {
        return 5;
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

    createTables() {
        const db = this.databaseConnector();
        if (!db) throw new Error("Failed to connect to database.");
        console.log(db);
        db.pragma("user_version = " + this.version);
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
        console.log("\nDatabase created successfully.");
    }

    createBeatsTable(db: Database.Database) {
        try {
            db.exec(`
                CREATE TABLE IF NOT EXISTS "${Constants.BeatsTableName}" (
                    "id"                    INTEGER PRIMARY KEY,
                    "duration"              FLOAT NOT NULL,
                    "position"              INTEGER NOT NULL UNIQUE,
                    "include_in_measure"    INTEGER NOT NULL DEFAULT 1 CHECK (include_in_measure IN (0, 1)),
                    "notes"                 TEXT,
                    "created_at"	        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updated_at"	        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Add 16 default beats
            for (let x = 0; x < 16; x++) {
                db.prepare(
                    `INSERT INTO ${Constants.BeatsTableName} ("duration", "position") VALUES (0.5, ${x})`,
                ).run();
            }
        } catch (error) {
            throw new Error(
                `Failed to create field properties table: ${error}`,
            );
        }
        createUndoTriggers(db, Constants.BeatsTableName);
    }

    createPageTable(db: Database.Database) {
        try {
            db.prepare(
                `
                CREATE TABLE IF NOT EXISTS "${Constants.PageTableName}" (
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
                `INSERT INTO ${Constants.PageTableName} ("start_beat", "id") VALUES (1, 0)`,
            ).run();

            // Make the undo triggers after so the creation of the first page cannot be undone
            createUndoTriggers(db, Constants.PageTableName);

            return { success: true, data: Constants.PageTableName };
        } catch (error: any) {
            throw new Error(`Failed to create page table: ${error}`);
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
        try {
            db.exec(`
                    CREATE TABLE IF NOT EXISTS "${Constants.MeasureTableName}" (
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
            throw new Error(`Failed to create Measures table: ${error}`);
        }
        createUndoTriggers(db, Constants.MeasureTableName);
    }
}

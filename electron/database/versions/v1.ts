import { createHistoryTables, createUndoTriggers } from "../database.history";
import DatabaseVersion from "./DatabaseVersion";
import Constants from "../../../src/global/Constants";
import Database from "better-sqlite3";
import Measure from "../../../src/global/classes/Measure";
import type FieldProperties from "../../../src/global/classes/FieldProperties";
import FieldPropertiesTemplates from "../../../src/global/classes/FieldProperties.templates";
import { FIRST_PAGE_ID } from "../tables/PageTable";

export default class v1 extends DatabaseVersion {
    readonly VERSION: number = 1;

    createTables() {
        const db = this.databaseConnector();
        if (!db) throw new Error("Failed to connect to database.");
        console.log(db);
        console.log("Creating database...");
        createHistoryTables(db);
        this.createMarcherTable(db);
        this.createPageTable(db);
        this.createMarcherPageTable(db);
        this.createFieldPropertiesTable(db);
        this.createMeasureTable(db);
        this.createAudioFilesTable(db);
        this.createShapeTable(db);
        this.createShapePageTable(db);
        this.createShapePageMarcherTable(db);
        console.log("\nDatabase created successfully.");
        db.close();
    }

    protected createMarcherTable(db: Database.Database) {
        this.createTable({
            schema: `
            CREATE TABLE IF NOT EXISTS "${Constants.MarcherTableName}" (
                "id"	        INTEGER PRIMARY KEY,
                "name"	        TEXT,
                "section"	    TEXT NOT NULL,
                "year"	        TEXT,
                "notes"	        TEXT,
                "drill_prefix"	TEXT NOT NULL,
                "drill_order"	INTEGER NOT NULL,
                "created_at"	TEXT NOT NULL,
                "updated_at"	TEXT NOT NULL,
                UNIQUE ("drill_prefix", "drill_order")
            );
            `,
            tableName: Constants.MarcherTableName,
            db,
        });
    }

    protected createPageTable(db: Database.Database) {
        try {
            db.prepare(
                `
                CREATE TABLE IF NOT EXISTS "${Constants.PageTableName}" (
                "id"	            INTEGER PRIMARY KEY,
                "is_subset"	        INTEGER NOT NULL DEFAULT 0 CHECK (is_subset IN (0, 1)),
                "notes"	            TEXT,
                "counts"	        INTEGER NOT NULL CHECK (counts >= 0),
                "created_at"	    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updated_at"	    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "next_page_id"	    INTEGER,
                FOREIGN KEY ("next_page_id") REFERENCES "${Constants.PageTableName}" ("id")
                );
            `,
            ).run();

            // Create page 1 with 0 counts. Page 1 should always exist
            // It is safe to assume there are no marchers in the database at this point, so MarcherPages do not need to be created
            db.prepare(
                `INSERT INTO ${Constants.PageTableName} ("counts", "id") VALUES (0, ${FIRST_PAGE_ID})`,
            ).run();

            // Make the undo triggers after so the creation of the first page cannot be undone
            createUndoTriggers(db, Constants.PageTableName);

            return { success: true, data: Constants.PageTableName };
        } catch (error: any) {
            throw new Error(`Failed to create page table: ${error}`);
        }
    }

    protected createMarcherPageTable(db: Database.Database) {
        this.createTable({
            schema: `
            CREATE TABLE IF NOT EXISTS "${Constants.MarcherPageTableName}" (
                "id"            INTEGER PRIMARY KEY,
                "id_for_html"   TEXT UNIQUE,
                "marcher_id"    INTEGER NOT NULL,
                "page_id"       INTEGER NOT NULL,
                "x"             REAL,
                "y"             REAL,
                "created_at"    TEXT NOT NULL,
                "updated_at"    TEXT NOT NULL,
                "notes"         TEXT,
                FOREIGN KEY ("marcher_id") REFERENCES "${Constants.MarcherTableName}" ("id") ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
                FOREIGN KEY ("page_id") REFERENCES "${Constants.PageTableName}" ("id") ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
                UNIQUE ("marcher_id", "page_id")
            );
            CREATE INDEX IF NOT EXISTS "index_marcher_pages_on_marcher_id" ON "marcher_pages" ("marcher_id");
            CREATE INDEX IF NOT EXISTS "index_marcher_pages_on_page_id" ON "marcher_pages" ("page_id");
            `,
            tableName: Constants.MarcherPageTableName,
            db,
        });
    }

    protected createFieldPropertiesTable(
        db: Database.Database,
        fieldProperties: FieldProperties = FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES,
    ) {
        try {
            db.exec(`
                CREATE TABLE IF NOT EXISTS "${Constants.FieldPropertiesTableName}" (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    json_data TEXT
                );
            `);
        } catch (error) {
            throw new Error(
                `Failed to create field properties table: ${error}`,
            );
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
        createUndoTriggers(db, Constants.FieldPropertiesTableName);
    }

    /**
     * Measures in OpenMarch use a simplified version of ABC notation.
     * There is only ever one entry in this table, and it is the ABC notation string.
     * When updating measures, this string will be modified.
     *
     * @param db Database object to use
     */
    protected createMeasureTable(db: Database.Database) {
        try {
            db.exec(`
                CREATE TABLE IF NOT EXISTS "${Constants.MeasureTableName}" (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
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
                abc_data: Measure.defaultMeasures,
                created_at,
                updated_at: created_at,
            });
            createUndoTriggers(db, Constants.MeasureTableName);
            console.log("Measures table created.");
        } catch (error) {
            throw new Error(`Failed to create Measures table: ${error}`);
        }
    }

    protected createAudioFilesTable(db: Database.Database) {
        this.createTable({
            schema: `
            CREATE TABLE IF NOT EXISTS "${Constants.AudioFilesTableName}" (
                id INTEGER PRIMARY KEY,
                path TEXT NOT NULL,
                nickname TEXT,
                data BLOB,
                selected INTEGER NOT NULL DEFAULT 0,
                "created_at"	TEXT NOT NULL,
                "updated_at"	TEXT NOT NULL
            );
            `,
            tableName: Constants.AudioFilesTableName,
            db,
        });
    }
    protected createShapeTable(db: Database.Database) {
        this.createTable({
            schema: `
            CREATE TABLE IF NOT EXISTS "${Constants.ShapeTableName}" (
                "id"            INTEGER PRIMARY KEY,
                "name"          TEXT,
                "created_at"    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updated_at"    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "notes"         TEXT
            );
            `,
            tableName: Constants.ShapeTableName,
            db,
        });
    }
    protected createShapePageTable(db: Database.Database) {
        this.createTable({
            schema: `
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
            `,
            tableName: Constants.ShapePageTableName,
            db,
        });
    }
    protected createShapePageMarcherTable(db: Database.Database) {
        this.createTable({
            schema: `
            CREATE TABLE IF NOT EXISTS "${Constants.ShapePageMarcherTableName}" (
                "id"                INTEGER PRIMARY KEY,
                "shape_page_id"     INTEGER NOT NULL REFERENCES "${Constants.ShapePageTableName}" ("id"),
                "marcher_id"        INTEGER NOT NULL REFERENCES "${Constants.MarcherTableName}" ("id"),
                "position_order"    INTEGER,
                "created_at"        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updated_at"        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "notes"             TEXT,
                FOREIGN KEY (shape_page_id) REFERENCES "${Constants.ShapePageTableName}" ("id") ON DELETE CASCADE,
                FOREIGN KEY (marcher_id) REFERENCES "${Constants.MarcherTableName}" ("id") ON DELETE CASCADE,
                UNIQUE (shape_page_id, position_order),
                UNIQUE (shape_page_id, marcher_id)
            );
            CREATE INDEX "idx-spm-shape_page_id" ON "${Constants.ShapePageMarcherTableName}" (shape_page_id);
            CREATE INDEX "idx-spm-marcher_id" ON "${Constants.ShapePageMarcherTableName}" (marcher_id);
            `,
            tableName: Constants.ShapePageMarcherTableName,
            db,
        });
    }
}

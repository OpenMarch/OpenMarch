import { createHistoryTables } from "../database.history";
import Constants from "../../../src/global/Constants";
import Database from "better-sqlite3";
import v1 from "./v1";

export default class v2 extends v1 {
    get version() {
        return 2;
    }

    migrateToThisVersion(db?: Database.Database): void {
        const dbToUse = db ? db : this.databaseConnector();
        if (!dbToUse) throw new Error("Failed to connect to database.");

        if (!this.isThisVersion(dbToUse)) {
            // Check if the shape table exists, since we weren't keeping track of versions
            const shapeTableExists = dbToUse
                .prepare(
                    `SELECT name FROM sqlite_master WHERE type='table' AND name='${Constants.ShapeTableName}'`,
                )
                .get();

            if (shapeTableExists) {
                console.log(
                    "Shape table exists, meaning this is really version 2. Skipping migration and setting version",
                );
                dbToUse.pragma("user_version = " + this.version);
                return;
            }
            this.migrationWrapper(() => {
                this.createShapeTable(dbToUse);
                this.createShapePageTable(dbToUse);
                this.createShapePageMarcherTable(dbToUse);
            });
        } else {
            console.log("Database version is up-to-date. Not migrating");
        }
    }

    createTables() {
        const db = this.databaseConnector();
        if (!db) throw new Error("Failed to connect to database.");
        console.log(db);
        db.pragma("user_version = " + this.version);
        console.log("Creating database...");
        createHistoryTables(db);
        super.createMarcherTable(db);
        super.createPageTable(db);
        super.createMarcherPageTable(db);
        super.createFieldPropertiesTable(db);
        super.createMeasureTable(db);
        super.createAudioFilesTable(db);
        this.createShapeTable(db);
        this.createShapePageTable(db);
        this.createShapePageMarcherTable(db);
        console.log("\nDatabase created successfully.");
    }

    createShapeTable(db: Database.Database) {
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
    createShapePageTable(db: Database.Database) {
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
    createShapePageMarcherTable(db: Database.Database) {
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

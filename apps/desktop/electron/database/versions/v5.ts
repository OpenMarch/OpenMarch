import Constants from "../../../src/global/Constants";
import Database from "better-sqlite3";
import FieldProperties from "../../../src/global/classes/FieldProperties";
import v4 from "./v4";
import { createHistoryTables, createUndoTriggers } from "../database.history";
import FieldPropertiesTemplates from "../../../src/global/classes/FieldProperties.templates";

export default class v5 extends v4 {
    get version() {
        return 5;
    }

    migrateToThisVersion(db?: Database.Database): void {
        const dbToUse = db ? db : this.databaseConnector();
        if (!dbToUse) throw new Error("Failed to connect to database.");

        this.migrationWrapper(() => {
            dbToUse.exec(`
                ALTER TABLE "${Constants.FieldPropertiesTableName}"
                ADD COLUMN image BLOB;
            `);
            dbToUse.exec(`
                ALTER TABLE "${Constants.FieldPropertiesTableName}"
                ADD COLUMN field_theme string;
            `);
        });
    }

    createTables() {
        const db = this.databaseConnector();
        if (!db) throw new Error("Failed to connect to database.");
        console.log(db);
        db.pragma("user_version = " + this.version);
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
    }

    createFieldPropertiesTable(
        db: Database.Database,
        fieldProperties: FieldProperties = FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES,
    ) {
        try {
            db.exec(`
                CREATE TABLE IF NOT EXISTS "${Constants.FieldPropertiesTableName}" (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    json_data TEXT NOT NULL,
                    image BLOB
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
}

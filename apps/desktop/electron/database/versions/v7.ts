import Database from "better-sqlite3";
import { createUndoTriggers } from "../database.history";
import v6 from "./v6";
import { DrizzleMigrationService } from "../services/DrizzleMigrationService";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../migrations/schema";
import { Constants, TablesWithHistory } from "../../../src/global/Constants";
import FieldPropertiesTemplates from "../../../src/global/classes/fieldTemplates/Football";

export const DrizzleMigration0Hash =
    "62261a3070d5aa48d8ac995b86a64d8aefa2d48d37fb3924fe85a2a08a7fd67c";
export default class v7 extends v6 {
    get version() {
        return 7;
    }

    migrateToThisVersion(db?: Database.Database): void {
        const dbToUse = db ? db : this.databaseConnector();
        if (!dbToUse) throw new Error("Failed to connect to database.");

        this.migrationWrapper(() => {
            this.transitionToDrizzle(dbToUse);
        });
    }

    private transitionToDrizzle(db: Database.Database): void {
        this.createDrizzleMigrationsTable(db);
        this.markInitialMigrationAsApplied(db);
    }

    /**
     * Creates the __drizzle_migrations table that Drizzle uses to track migrations
     */
    private createDrizzleMigrationsTable(db: Database.Database): void {
        db.exec(`
            CREATE TABLE "__drizzle_migrations" (
                "id" SERIAL PRIMARY KEY,
                "hash" TEXT NOT NULL,
                "created_at" NUMERIC
            );
        `);
    }

    /**
     * Marks the initial migration (representing v6 schema) as applied in Drizzle
     */
    private markInitialMigrationAsApplied(db: Database.Database): void {
        const initialMigrationHash = DrizzleMigration0Hash;
        const timestamp = Date.now();

        db.prepare(
            `
            INSERT INTO __drizzle_migrations (hash, created_at)
            VALUES (?, ?)
        `,
        ).run(initialMigrationHash, timestamp);
    }

    /**
     * Creates tables for a fresh v7 database (includes Drizzle setup)
     */
    async createTables(): Promise<void> {
        const db = this.databaseConnector();
        if (!db) throw new Error("Failed to connect to database.");

        const currentVersion = db.pragma("user_version", { simple: true });
        if (currentVersion === this.version) {
            console.log(`Database already at version ${this.version}`);
            return;
        }

        // Set the pragma version to -1 so we know if it failed in the middle of creation
        db.pragma("user_version = -1");

        await new DrizzleMigrationService(
            drizzle(db, { schema }),
            db,
        ).applyPendingMigrations();

        // Easier to do this here than in the migration
        const stmt = db.prepare(`
            INSERT INTO ${Constants.FieldPropertiesTableName} (
                id,
                json_data
            ) VALUES (
                1,
                @json_data
            );
        `);
        stmt.run({
            json_data: JSON.stringify(
                FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES,
            ),
        });

        for (const table of TablesWithHistory) {
            createUndoTriggers(db, table);
        }

        // Set final version
        db.pragma(`user_version = ${this.version}`);
    }
}

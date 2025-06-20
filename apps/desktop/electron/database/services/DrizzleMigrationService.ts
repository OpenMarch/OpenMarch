import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "../migrations/schema";
import path from "path";
import fs from "fs";
import Constants, { TablesWithHistory } from "@/global/Constants";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { createUndoTriggers } from "../database.history";

export type DB = BetterSQLite3Database<typeof schema>;

/**
 * Service for handling Drizzle migrations at runtime
 * This is used after the database has been transitioned to v7+ and uses Drizzle migration system
 */
export class DrizzleMigrationService {
    private db: DB;
    private rawDb: Database.Database;

    constructor(drizzleDb: DB, rawDb: Database.Database) {
        this.db = drizzleDb;
        this.rawDb = rawDb;
    }

    // User version 7 is an artifact of the previous migration system
    // but we will keep it at 7 to indicate we are on drizzle
    private async canApplyMigrations(): Promise<boolean> {
        const userVersion = this.rawDb.pragma("user_version", { simple: true });
        return userVersion === 7;
    }

    /**
     * Applies pending migrations from the migrations folder
     * This uses Drizzle's built-in migration functionality
     */
    async applyPendingMigrations(migrationsFolder?: string): Promise<void> {
        if (!(await this.canApplyMigrations())) {
            throw new Error(
                "Cannot apply migrations, user version is not 7. If you have a file from 0.0.9 or earlier, please open your file in 0.0.10, then open it again in the current version",
            );
        }
        const folder =
            migrationsFolder || path.join(__dirname, "../migrations");
        console.log("migrationsFolder", folder);

        try {
            console.log("Applying pending Drizzle migrations...");

            await migrate(this.db, {
                migrationsFolder: folder,
                migrationsTable: "__drizzle_migrations",
            });

            console.log("Drizzle migrations applied successfully.");
        } catch (error) {
            console.error("Error applying Drizzle migrations:", error);
            throw error;
        }
    }

    /**
     * Gets all applied migrations from the Drizzle migrations table
     */
    getAppliedMigrations(): Array<{
        id: number;
        hash: string;
        created_at: number;
    }> {
        return this.rawDb
            .prepare(`SELECT * FROM __drizzle_migrations ORDER BY created_at`)
            .all() as Array<{ id: number; hash: string; created_at: number }>;
    }

    /**
     * Checks if there are pending migrations to apply
     * Compares the number of applied migrations with the number of migration files
     *
     * @param migrationsFolder Optional path to migrations folder, defaults to "./electron/database/migrations"
     * @returns true if there are pending migrations, false otherwise
     */
    hasPendingMigrations(migrationsFolder?: string): boolean {
        const folder = migrationsFolder || "./electron/database/migrations";

        try {
            // Get applied migrations from the database
            const appliedMigrations = this.getAppliedMigrations();
            const appliedCount = appliedMigrations.length;

            // Count migration files in the folder
            const migrationFiles = fs
                .readdirSync(folder)
                .filter((file) => file.endsWith(".sql"))
                .sort();

            const fileCount = migrationFiles.length;

            console.log(
                `Applied migrations: ${appliedCount}, Migration files: ${fileCount}`,
            );

            // If there are more files than applied migrations, we have pending migrations
            return fileCount > appliedCount;
        } catch (error) {
            console.error("Error checking for pending migrations:", error);
            // If we can't read the folder or there's an error, assume no pending migrations
            return false;
        }
    }

    /** Run any ts migrations that are not in drizzle */
    async initializeDatabase(db: Database.Database) {
        db.pragma("user_version = 7");

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
    }
}

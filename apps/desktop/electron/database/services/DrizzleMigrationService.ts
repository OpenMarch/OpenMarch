/* eslint-disable no-console */
import { migrate } from "drizzle-orm/sqlite-proxy/migrator";
import Database from "libsql";
import * as schema from "../migrations/schema";
import path from "path";
import fs from "fs";
import FieldPropertiesTemplates from "../../../src/global/classes/FieldProperties.templates";
import { dropAllTriggers } from "../migrations/triggers";
import { createAllTriggers } from "../migrations/triggers";
import { sql } from "drizzle-orm";
import { DB } from "../db";

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
        const userVersion = (
            this.rawDb.prepare("PRAGMA user_version").get() as {
                user_version: number;
            }
        ).user_version;
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

        let folder = migrationsFolder || path.join(__dirname, "../migrations");
        if (
            process.env.PLAYWRIGHT_CODEGEN ||
            process.env.PLAYWRIGHT_SESSION ||
            (/dist-electron[/\\]main/.test(folder) && !fs.existsSync(folder))
        ) {
            folder = folder.replace(/dist-electron[/\\]main/, "");
        }

        console.debug("migrationsFolder:", folder);

        try {
            // console.log("Dropping history triggers...");
            // await dropAllUndoTriggers(this.db);

            console.log("Applying pending Drizzle migrations...");

            await migrate(
                this.db,
                async (queries) => {
                    console.log("Disabling foreign key checks...");
                    dropAllTriggers(this.rawDb);
                    for (const query of queries) {
                        this.rawDb.exec("PRAGMA foreign_keys = OFF");
                        this.rawDb.exec(query);
                    }
                    createAllTriggers(this.rawDb);

                    console.log("Recreating triggers...");
                    console.log("Enabling foreign key checks...");
                    this.rawDb.prepare("PRAGMA foreign_keys = ON").run();
                },
                {
                    migrationsFolder: folder,
                    migrationsTable: "__drizzle_migrations",
                },
            );

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
     * @param migrationsFolder Optional path to migrations folder. Defaults to same as applyPendingMigrations (__dirname-based).
     * @returns true if there are pending migrations, false otherwise
     */
    hasPendingMigrations(migrationsFolder?: string): boolean {
        let folder = migrationsFolder || path.join(__dirname, "../migrations");
        if (
            process.env.PLAYWRIGHT_CODEGEN ||
            process.env.PLAYWRIGHT_SESSION ||
            (/dist-electron[/\\]main/.test(folder) && !fs.existsSync(folder))
        ) {
            folder = folder.replace(/dist-electron[/\\]main/, "");
        }

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
    static async initializeDatabase(db: DB, rawDb: Database.Database) {
        await db.run(sql`PRAGMA user_version = 7`);

        // Easier to do this here than in the migration
        await db.insert(schema.field_properties).values({
            id: 1,
            json_data: JSON.stringify(
                FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES,
            ),
        });

        // Initialize workspace settings with default values
        await db.insert(schema.workspace_settings).values({
            id: 1,
            json_data: JSON.stringify({
                defaultBeatsPerMeasure: 4,
                defaultTempo: 120,
                defaultNewPageCounts: 16,
            }),
        });

        // await createAllUndoTriggers(db);
        await createAllTriggers(rawDb);
    }
}

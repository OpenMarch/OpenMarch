import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "../migrations/schema";

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

    /**
     * Applies pending migrations from the migrations folder
     * This uses Drizzle's built-in migration functionality
     */
    async applyPendingMigrations(migrationsFolder?: string): Promise<void> {
        const folder = migrationsFolder || "./electron/database/migrations";

        try {
            console.log("Applying pending Drizzle migrations...");

            await migrate(this.db, { migrationsFolder: folder });

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
}

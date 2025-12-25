/**
 * Database abstraction layer for the editor package
 *
 * This module provides a database instance that is initialized with
 * a platform-specific database adapter. The adapter is provided via
 * the PlatformProvider.
 */

import { drizzle } from "drizzle-orm/sqlite-proxy";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { SQLiteTransaction } from "drizzle-orm/sqlite-core";
import type { ExtractTablesWithRelations } from "drizzle-orm/relations";
import type { SqliteRemoteResult } from "drizzle-orm/sqlite-proxy";
import type { DatabaseAdapter } from "../platform/types";
import * as schema from "./schema";

// Re-export schema for convenience
export { schema };

/**
 * The Drizzle database type for this schema
 */
export type DB = ReturnType<typeof createDatabase>;

/**
 * Database connection type (can be used for queries)
 */
export type DbConnection = BaseSQLiteDatabase<
    "async",
    void | SqliteRemoteResult<unknown>,
    typeof schema
>;

/**
 * Database transaction type (used inside transaction callbacks)
 */
export type DbTransaction = SQLiteTransaction<
    "async",
    void | SqliteRemoteResult<unknown>,
    typeof schema,
    ExtractTablesWithRelations<typeof schema>
>;

// Singleton database instance
let dbInstance: DB | null = null;

/**
 * Create a new Drizzle database instance using the provided adapter
 */
function createDatabase(adapter: DatabaseAdapter) {
    return drizzle(
        async (sql, params, method) => {
            try {
                const result = await adapter.sqlProxy(sql, params, method);
                return result;
            } catch (error) {
                console.error("Error from SQLite proxy:", error);
                throw error;
            }
        },
        { schema, casing: "snake_case" },
    );
}

/**
 * Initialize the database with a platform adapter
 *
 * This must be called before using getDb(). Typically called by
 * the PlatformProvider when the adapter is initialized.
 *
 * @param adapter - The database adapter from the platform
 * @returns The database instance
 */
export function initializeDatabase(adapter: DatabaseAdapter): DB {
    if (dbInstance) {
        console.warn("Database already initialized, reinitializing...");
    }
    dbInstance = createDatabase(adapter);
    return dbInstance;
}

/**
 * Get the current database instance
 *
 * @throws Error if database is not initialized
 * @returns The database instance
 */
export function getDb(): DB {
    if (!dbInstance) {
        throw new Error(
            "Database not initialized. Ensure PlatformProvider is mounted and the adapter is initialized.",
        );
    }
    return dbInstance;
}

/**
 * Check if the database is initialized
 */
export function isDatabaseInitialized(): boolean {
    return dbInstance !== null;
}

/**
 * Reset the database instance (for testing or cleanup)
 */
export function resetDatabase(): void {
    dbInstance = null;
}

import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { getOrm } from "./db";
import { DrizzleMigrationService } from "./services/DrizzleMigrationService";

export const repairDatabase = async (originalDbPath: string) => {
    // 1. Create a new sqlite db called "{originalDbPathStem} - FIXED.dots"
    const originalPathObj = path.parse(originalDbPath);
    const newDbPath = path.join(
        originalPathObj.dir,
        `${originalPathObj.name} - FIXED${originalPathObj.ext}`,
    );

    // Delete the new database if it already exists
    if (fs.existsSync(newDbPath)) {
        fs.unlinkSync(newDbPath);
    }

    // Open the original database
    const originalDb = new Database(originalDbPath, { readonly: true });

    // Create the new database
    const newDb = new Database(newDbPath);

    try {
        // 2. Run the drizzle migration on this new Db
        // Set user version to 7 (indicates Drizzle migration system)
        newDb.pragma("user_version = 7");

        const drizzleDb = getOrm(newDb);
        const migrator = new DrizzleMigrationService(drizzleDb, newDb);

        // Use the same path resolution as setActiveDb
        const migrationsFolder = path.join(
            app.getAppPath(),
            "electron",
            "database",
            "migrations",
        );
        await migrator.applyPendingMigrations(migrationsFolder);
        await migrator.initializeDatabase(drizzleDb);

        // 3. Turn off foreign keys on the new db
        newDb.pragma("foreign_keys = OFF");

        // 4. Copy the data from all tables of the old db into the new one,
        //    except for drizzle migrations and history_undo/redo
        const excludedTables = new Set([
            "__drizzle_migrations",
            "history_undo",
            "history_redo",
            "history_stats",
        ]);

        // Get all table names from the original database
        const tables = originalDb
            .prepare(
                `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
            )
            .all() as Array<{ name: string }>;

        // Attach the original database to the new database connection
        const attachName = "original_db";
        newDb.prepare(`ATTACH DATABASE ? AS ${attachName}`).run(originalDbPath);

        // Copy data from each table
        for (const { name: tableName } of tables) {
            if (excludedTables.has(tableName)) {
                continue;
            }

            // Get column names from the original table
            const originalColumns = originalDb
                .prepare(`PRAGMA table_info(${tableName})`)
                .all() as Array<{ name: string; type: string }>;

            // Get column names from the new table
            const newColumns = newDb
                .prepare(`PRAGMA table_info(${tableName})`)
                .all() as Array<{ name: string; type: string }>;

            // Find common columns between old and new tables
            const newColumnNames = new Set(newColumns.map((col) => col.name));
            const commonColumns = originalColumns
                .filter((col) => newColumnNames.has(col.name))
                .map((col) => col.name);

            if (commonColumns.length === 0) {
                console.log(`Skipping table ${tableName} - no common columns`);
                continue;
            }

            // Build INSERT INTO ... SELECT statement
            const columnsStr = commonColumns.map((c) => `"${c}"`).join(", ");
            const insertSql = `INSERT INTO "${tableName}" (${columnsStr}) SELECT ${columnsStr} FROM ${attachName}."${tableName}"`;

            newDb.prepare(insertSql).run();
            console.log(`Copied data from table: ${tableName}`);
        }

        // Detach the original database
        newDb.prepare(`DETACH DATABASE ${attachName}`).run();

        // 5. Turn foreign keys back on
        newDb.pragma("foreign_keys = ON");
    } finally {
        // Close both databases
        // Errors will propagate naturally, and finally ensures cleanup
        originalDb.close();
        newDb.close();
    }

    return newDbPath;
};

/* eslint-disable no-console */
import Database from "libsql";
import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { getOrm } from "./db";
import { DrizzleMigrationService } from "./services/DrizzleMigrationService";

export const initializeAndMigrateDatabase = async (
    newDb: Database.Database,
): Promise<void> => {
    // Set user version to 7 (indicates Drizzle migration system)
    newDb.prepare("PRAGMA user_version = 7").run();

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
    await DrizzleMigrationService.initializeDatabase(drizzleDb, newDb);
};

export const copyDataFromOriginalDatabase = (
    originalDb: Database.Database,
    newDb: Database.Database,
    originalDbPath: string,
): void => {
    const excludedTables = new Set([
        "__drizzle_migrations",
        "history_undo",
        "history_redo",
        "history_stats",
    ]);

    const singleRowTables = new Set([
        "field_properties",
        "utility",
        "workspace_settings",
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

    try {
        for (const tableName of singleRowTables) {
            copyFieldPropertiesFromOriginalDatabase(
                originalDb,
                newDb,
                tableName,
            );
        }
        // Copy data from each table
        for (const { name: tableName } of tables) {
            if (
                excludedTables.has(tableName) ||
                singleRowTables.has(tableName)
            ) {
                continue;
            }

            // Get column names from the original table
            const originalColumns = originalDb
                .prepare(`PRAGMA table_info("${tableName}")`)
                .all() as Array<{ name: string; type: string }>;

            // Get column names from the new table
            const newColumns = newDb
                .prepare(`PRAGMA table_info("${tableName}")`)
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

            // Skip rows with id 0 for beats and pages tables
            const whereClause =
                tableName === "beats" || tableName === "pages"
                    ? " WHERE id != 0"
                    : "";
            const insertSql = `INSERT INTO "${tableName}" (${columnsStr}) SELECT ${columnsStr} FROM ${attachName}."${tableName}"${whereClause}`;

            newDb.prepare(insertSql).run();
            console.log(`Copied data from table: ${tableName}`);
        }
    } finally {
        // Detach the original database
        newDb.prepare(`DETACH DATABASE ${attachName}`).run();
    }
};

export const copyFieldPropertiesFromOriginalDatabase = (
    originalDb: Database.Database,
    newDb: Database.Database,
    tableName: string,
): void => {
    // Assert that the original database table has exactly one row
    const rowCount = originalDb
        .prepare(`SELECT COUNT(*) as count FROM "${tableName}"`)
        .get() as { count: number };
    if (rowCount.count !== 1) {
        throw new Error(
            `Table ${tableName} in original database must have exactly one row, but has ${rowCount.count} rows`,
        );
    }

    // Get column information from both databases
    const originalColumns = originalDb
        .prepare(`PRAGMA table_info("${tableName}")`)
        .all() as Array<{ name: string; type: string }>;
    const newColumns = newDb
        .prepare(`PRAGMA table_info("${tableName}")`)
        .all() as Array<{ name: string; type: string }>;

    // Find common columns between old and new tables
    const newColumnNames = new Set(newColumns.map((col) => col.name));
    const commonColumns = originalColumns.filter((col) =>
        newColumnNames.has(col.name),
    );

    if (commonColumns.length === 0) {
        console.log(`Skipping table ${tableName} - no common columns to copy`);
        return;
    }

    // Get the single row from the original database
    const columnNames = commonColumns.map((col) => `"${col.name}"`).join(", ");
    const row = originalDb
        .prepare(`SELECT ${columnNames} FROM "${tableName}"`)
        .get() as Record<string, unknown>;

    // Build UPDATE statement to update the first row (by ROWID) in the new database
    const setClauses = commonColumns
        .map((col) => `"${col.name}" = ?`)
        .join(", ");
    const updateStmt = newDb.prepare(
        `UPDATE "${tableName}" SET ${setClauses} WHERE ROWID = (SELECT ROWID FROM "${tableName}" LIMIT 1)`,
    );

    // Execute update with values from the original row
    const values = commonColumns.map((col) => row[col.name]);
    updateStmt.run(...values);
};

export const removeOrphanMarcherPages = (db: Database.Database): void => {
    db.prepare(
        `DELETE FROM marcher_pages WHERE marcher_id NOT IN (SELECT id FROM marchers)`,
    ).run();
    db.prepare(
        `DELETE FROM marcher_pages WHERE page_id NOT IN (SELECT id FROM pages)`,
    ).run();
};

export const repairDatabase = async (originalDbPath: string) => {
    // 1. Create paths for temp and final database files
    const originalPathObj = path.parse(originalDbPath);
    const tempDbPath = path.join(
        originalPathObj.dir,
        `${originalPathObj.name}${originalPathObj.ext}.temp`,
    );
    const finalDbPath = path.join(
        originalPathObj.dir,
        `${originalPathObj.name} - FIXED${originalPathObj.ext}`,
    );

    // Delete the temp database if it already exists
    if (fs.existsSync(tempDbPath)) {
        fs.unlinkSync(tempDbPath);
    }

    // Open the original database
    const originalDb = new Database(originalDbPath, { readonly: true });

    // Create the new database at the temp path
    const newDb = new Database(tempDbPath);

    try {
        // Initialize and run migrations on the new database
        await initializeAndMigrateDatabase(newDb);

        // Turn off foreign keys for data copying
        newDb.prepare("PRAGMA foreign_keys = OFF").run();

        // Copy data from original database
        copyDataFromOriginalDatabase(originalDb, newDb, originalDbPath);

        // Turn foreign keys back on
        newDb.prepare("PRAGMA foreign_keys = ON").run();

        // Remove orphaned marcher_pages entries
        removeOrphanMarcherPages(newDb);
    } catch (error) {
        // If anything fails, delete the temp file
        if (fs.existsSync(tempDbPath)) {
            fs.unlinkSync(tempDbPath);
        }
        throw error;
    } finally {
        // Close both databases
        // Errors will propagate naturally, and finally ensures cleanup
        originalDb.close();
        newDb.close();
    }

    // If we got here, the repair was successful
    // Delete the existing FIXED file if it exists
    if (fs.existsSync(finalDbPath)) {
        fs.unlinkSync(finalDbPath);
    }

    // Rename the temp file to the final name
    fs.renameSync(tempDbPath, finalDbPath);

    return finalDbPath;
};

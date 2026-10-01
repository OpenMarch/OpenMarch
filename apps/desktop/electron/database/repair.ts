/* eslint-disable no-console */
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { getOrm } from "./db";
import { DrizzleMigrationService } from "./services/DrizzleMigrationService";
import {
    applyFileVersionDecision,
    fileTooNewMessage,
    isSupportedUserVersion,
    MAX_SUPPORTED_USER_VERSION,
    readUserVersion,
} from "./fileVersion";

export const initializeAndMigrateDatabase = async (
    newDb: DatabaseSync,
): Promise<void> => {
    // A new, empty file: set its version (7, the Drizzle-era page model).
    applyFileVersionDecision(newDb, true);

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

/**
 * Tables that must be copied in this order, after every other table. Foreign keys are off during
 * the copy, but the timeline invariant triggers still run on each insert and read the parent rows:
 * a transition must lie inside its timeline and use an existing shape, and destinations and
 * assignments must fit their transition. Marchers come before the assignments that name them.
 */
const DEPENDENT_TABLE_COPY_ORDER = [
    "marchers",
    "timelines",
    "timeline_shapes",
    "timeline_transitions",
    "timeline_slot_destinations",
    "timeline_assignments",
];

/**
 * Orders tables for copying: tables without a place in `DEPENDENT_TABLE_COPY_ORDER` keep their
 * original order and come first, then the listed tables in their listed order.
 */
export const orderTablesForCopy = <T extends { name: string }>(
    tables: readonly T[],
): T[] => {
    const rank = (name: string) => DEPENDENT_TABLE_COPY_ORDER.indexOf(name);
    return tables
        .map((table, index) => ({ table, index }))
        .sort((a, b) => {
            const byRank = rank(a.table.name) - rank(b.table.name);
            return byRank !== 0 ? byRank : a.index - b.index;
        })
        .map(({ table }) => table);
};

export const copyDataFromOriginalDatabase = (
    originalDb: DatabaseSync,
    newDb: DatabaseSync,
    originalDbPath: string,
): void => {
    const excludedTables = new Set([
        "__drizzle_migrations",
        "history_undo",
        "history_redo",
        "history_stats",
        // Bookkeeping: the copy logs its own rows, which repairDatabase then clears
        "timeline_change_log",
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
        for (const { name: tableName } of orderTablesForCopy(tables)) {
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
    originalDb: DatabaseSync,
    newDb: DatabaseSync,
    tableName: string,
): void => {
    const toSqlInputValue = (value: unknown): SQLInputValue => {
        if (value === undefined || value === null) return null;
        if (
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "bigint"
        ) {
            return value;
        }
        if (value instanceof Uint8Array) return value;
        if (value instanceof ArrayBuffer) return new Uint8Array(value);
        if (ArrayBuffer.isView(value)) {
            return new Uint8Array(
                value.buffer,
                value.byteOffset,
                value.byteLength,
            );
        }
        throw new TypeError(
            `Unsupported SQLite parameter value type: ${typeof value}`,
        );
    };

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
    const values: SQLInputValue[] = commonColumns.map((col) =>
        toSqlInputValue(row[col.name]),
    );
    updateStmt.run(...values);
};

export const removeOrphanMarcherPages = (db: DatabaseSync): void => {
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
    const repairTempDir = path.join(
        app.getPath("userData"),
        "repair-temp",
        randomUUID(),
    );
    fs.mkdirSync(repairTempDir, { recursive: true });

    const sourceDbPath = path.join(
        repairTempDir,
        path.basename(originalDbPath),
    );
    const tempDbPath = path.join(repairTempDir, "repaired.dots.temp");
    const finalDbPath = path.join(
        originalPathObj.dir,
        `${originalPathObj.name} - FIXED${originalPathObj.ext}`,
    );

    let originalDb: DatabaseSync | undefined;
    let newDb: DatabaseSync | undefined;

    try {
        fs.copyFileSync(originalDbPath, sourceDbPath);

        // Open the copied source database so repair does not hold the active file.
        originalDb = new DatabaseSync(sourceDbPath, { readOnly: true });

        // Refuse a file from a newer release: its tables may not match this
        // build's schema, and the repaired copy would otherwise be written at
        // an older version (ADR 0001 §6). The original is never written to.
        const sourceVersion = readUserVersion(originalDb);
        if (sourceVersion > MAX_SUPPORTED_USER_VERSION) {
            originalDb.close();
            throw new Error(fileTooNewMessage(sourceVersion));
        }

        // Create the new database at the temp path in the app data directory.
        newDb = new DatabaseSync(tempDbPath);

        try {
            // Initialize and run migrations on the new database
            await initializeAndMigrateDatabase(newDb);

            // Turn off foreign keys for data copying
            newDb.prepare("PRAGMA foreign_keys = OFF").run();

            // Copy data from original database
            copyDataFromOriginalDatabase(originalDb, newDb, sourceDbPath);

            // The copy went around the write wrapper, so drop what its triggers logged
            // (ADR 0001 §5). The app also clears the log whenever it opens a file.
            newDb.prepare("DELETE FROM timeline_change_log").run();

            // Turn foreign keys back on
            newDb.prepare("PRAGMA foreign_keys = ON").run();

            // Remove orphaned marcher_pages entries
            removeOrphanMarcherPages(newDb);

            // Keep a supported version higher than a new file's (8, the
            // timeline model), so repair never lowers a file's version.
            if (
                isSupportedUserVersion(sourceVersion) &&
                sourceVersion > readUserVersion(newDb)
            ) {
                newDb.prepare(`PRAGMA user_version = ${sourceVersion}`).run();
            }
        } finally {
            // Close both databases before moving or deleting temp files.
            originalDb?.close();
            newDb?.close();
        }

        // If we got here, the repair was successful
        // Delete the existing FIXED file if it exists
        if (fs.existsSync(finalDbPath)) {
            fs.unlinkSync(finalDbPath);
        }

        // Rename the temp file to the final name
        fs.renameSync(tempDbPath, finalDbPath);

        return finalDbPath;
    } finally {
        fs.rmSync(repairTempDir, { recursive: true, force: true });
    }
};

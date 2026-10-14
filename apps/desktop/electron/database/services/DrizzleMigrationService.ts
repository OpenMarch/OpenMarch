/* eslint-disable no-console */
// cspell:ignore Millis (drizzle's `folderMillis`)
import { readMigrationFiles, type MigrationMeta } from "drizzle-orm/migrator";
import * as schema from "../migrations/schema";
import path from "path";
import fs from "fs";
import FieldPropertiesTemplates from "../../../src/global/classes/FieldProperties.templates";
import { dropAllTriggers } from "../migrations/triggers";
import {
    createAllTriggers,
    recreateChangeLogTriggers,
} from "../migrations/triggers";
import { sql } from "drizzle-orm";
import { DB } from "../db";
import { DatabaseSync } from "node:sqlite";
import {
    fileTooNewMessage,
    isSupportedUserVersion,
    MAX_SUPPORTED_USER_VERSION,
    PAGE_MODEL_USER_VERSION,
    readUserVersion,
} from "../fileVersion";

/**
 * The first migration that only runs on a timeline file (ADR 0001 §6): it drops the page-era
 * tables, which the converter reads. A page-model file (version 7) gets the migrations before it
 * when it opens; it and every later one run inside the conversion transaction
 * (`applyTimelineMigrationsInTransaction`), after the converter has read the page-era tables.
 * New files are timeline files from the start and get all of them.
 */
export const FIRST_TIMELINE_MIGRATION_TAG = "0020_drop_page_era";

/** The migrations folder, also found from a built `dist-electron/main`. */
export function resolveMigrationsFolder(migrationsFolder?: string): string {
    const requestedFolder =
        migrationsFolder || path.join(__dirname, "../migrations");
    const candidates = [requestedFolder];

    const distMainSegment = `${path.sep}dist-electron${path.sep}main`;
    if (requestedFolder.includes(distMainSegment)) {
        candidates.push(requestedFolder.replace(distMainSegment, ""));
    }
    // Keep string replacements for mixed path formats in CI logs.
    if (requestedFolder.includes("/dist-electron/main")) {
        candidates.push(requestedFolder.replace("/dist-electron/main", ""));
    }
    if (requestedFolder.includes("\\dist-electron\\main")) {
        candidates.push(requestedFolder.replace("\\dist-electron\\main", ""));
    }

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return requestedFolder;
}

const MIGRATIONS_TABLE = "__drizzle_migrations";

type TaggedMigration = MigrationMeta & { tag: string };

/** The migrations in `folder`, oldest first, with their journal tags. */
function readTaggedMigrations(folder: string): TaggedMigration[] {
    const journal = JSON.parse(
        fs.readFileSync(path.join(folder, "meta", "_journal.json"), "utf8"),
    ) as { entries: { tag: string; when: number }[] };
    const tags = new Map(journal.entries.map((e) => [e.when, e.tag]));
    return readMigrationFiles({ migrationsFolder: folder }).map((m) => ({
        ...m,
        tag: tags.get(m.folderMillis) ?? "",
    }));
}

/**
 * `created_at` of the first timeline-only migration in `migrations`, or Infinity for a folder
 * from before there were any (every migration in it is a page-era one).
 */
function timelineMigrationsFrom(migrations: TaggedMigration[]): number {
    const first = migrations.find(
        (m) => m.tag === FIRST_TIMELINE_MIGRATION_TAG,
    );
    return first?.folderMillis ?? Infinity;
}

/**
 * The SQL of the migrations in `folder` dated after `lastApplied` (the newest `created_at` in
 * the file's `__drizzle_migrations`, or undefined when it has none), as drizzle's migrator builds
 * it: each migration's statements, then the row that records it. With `stage`, only the
 * migrations before (`page`) or from (`timeline`) the first timeline-only one.
 */
export function migrationQueriesAfter(
    folder: string,
    lastApplied: number | undefined,
    stage: "all" | "page" | "timeline",
): string[] {
    const migrations = readTaggedMigrations(folder);
    const boundary = timelineMigrationsFrom(migrations);
    const queries: string[] = [];
    for (const m of migrations) {
        if (lastApplied !== undefined && lastApplied >= m.folderMillis)
            continue;
        if (stage === "page" && m.folderMillis >= boundary) continue;
        if (stage === "timeline" && m.folderMillis < boundary) continue;
        queries.push(
            ...m.sql,
            `INSERT INTO \`${MIGRATIONS_TABLE}\` ("hash", "created_at") VALUES('${m.hash}', '${m.folderMillis}')`,
        );
    }
    return queries;
}

/** `migrationQueriesAfter` for the file open on `rawDb`, creating its migrations table if needed. */
function pendingMigrationQueries(
    rawDb: DatabaseSync,
    folder: string,
    stage: "all" | "page" | "timeline",
): string[] {
    rawDb.exec(
        `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`,
    );
    const last = rawDb
        .prepare(
            `SELECT created_at FROM ${MIGRATIONS_TABLE} ORDER BY created_at DESC LIMIT 1`,
        )
        .get() as { created_at: number | string } | undefined;
    return migrationQueriesAfter(
        folder,
        last ? Number(last.created_at) : undefined,
        stage,
    );
}

/**
 * Applies the timeline-only migrations (see `FIRST_TIMELINE_MIGRATION_TAG`) on `rawDb`, which
 * must be inside the conversion's transaction: if anything later fails, the rollback undoes
 * them too. Foreign keys can't be turned off inside a transaction, so they are deferred to the
 * commit instead.
 */
export function applyTimelineMigrationsInTransaction(
    rawDb: DatabaseSync,
    migrationsFolder: string,
): void {
    const queries = pendingMigrationQueries(
        rawDb,
        resolveMigrationsFolder(migrationsFolder),
        "timeline",
    );
    if (queries.length === 0) return;
    rawDb.exec("PRAGMA defer_foreign_keys = ON");
    dropAllTriggers(rawDb);
    for (const query of queries) rawDb.exec(query);
    createAllTriggers(rawDb);
}

/**
 * Applies a page-model file's pending page-era migrations (the ones before
 * `FIRST_TIMELINE_MIGRATION_TAG`) on `rawDb`, which must be inside the conversion's transaction,
 * so a failed conversion rolls them back too and leaves the file as an older release wrote it.
 * Does what `applyPendingMigrations` does for a version-7 file, triggers included.
 *
 * The caller turns foreign keys off before the transaction begins (the pragma is a no-op inside
 * one): a migration that rebuilds a parent table drops it, and with foreign keys on that drop
 * would delete the rows of every `ON DELETE CASCADE` child.
 */
export function applyPageMigrationsInTransaction(
    rawDb: DatabaseSync,
    migrationsFolder: string,
): void {
    const foreignKeys = rawDb.prepare("PRAGMA foreign_keys").get() as {
        foreign_keys: number;
    };
    if (foreignKeys.foreign_keys !== 0)
        throw new Error(
            "applyPageMigrationsInTransaction needs foreign keys off: a table rebuild would cascade",
        );
    forgetFork3dVenueMigration(rawDb);
    const queries = pendingMigrationQueries(
        rawDb,
        resolveMigrationsFolder(migrationsFolder),
        "page",
    );
    dropAllTriggers(rawDb);
    for (const query of queries) rawDb.exec(query);
    createAllTriggers(rawDb);
    recreateChangeLogTriggers(rawDb);
}

/**
 * `created_at` of `0017_melted_sage`, the 3D View venue migration of the fork's `3d-async`
 * branch before it merged into the timeline line, where the same table is `0019_gray_brood`.
 * Drizzle only runs migrations dated after a file's newest recorded one, and this one is dated
 * after `0017_powerful_edwin_jarvis`, so a file opened by a `3d-async` build would skip the
 * timeline tables. Fork development files only; no released build ever wrote it.
 */
export const FORK_3D_VENUE_MIGRATION_MS = 1791099628919;

/**
 * Forgets the fork's old venue migration (see {@link FORK_3D_VENUE_MIGRATION_MS}), so every
 * later migration runs. Its table stays; `0019` creates it only if it is missing.
 */
export function forgetFork3dVenueMigration(rawDb: DatabaseSync): void {
    const hasMigrationsTable = rawDb
        .prepare(
            "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = '__drizzle_migrations'",
        )
        .get();
    if (!hasMigrationsTable) return;
    rawDb
        .prepare("DELETE FROM __drizzle_migrations WHERE created_at = ?")
        .run(FORK_3D_VENUE_MIGRATION_MS);
}

/**
 * Service for handling Drizzle migrations at runtime
 * This is used after the database has been transitioned to v7+ and uses Drizzle migration system
 */
export class DrizzleMigrationService {
    private db: DB;
    private rawDb: DatabaseSync;

    constructor(drizzleDb: DB, rawDb: DatabaseSync) {
        this.db = drizzleDb;
        this.rawDb = rawDb;
    }

    private resolveMigrationsFolder(migrationsFolder?: string): string {
        return resolveMigrationsFolder(migrationsFolder);
    }

    /**
     * Applies pending migrations from the migrations folder
     * This uses Drizzle's built-in migration functionality
     *
     * Runs only on files whose `user_version` this build supports (7, the page
     * model, which is an artifact of the previous migration system, and 8, the
     * timeline model). It never changes the version. See `../fileVersion.ts`.
     */
    async applyPendingMigrations(migrationsFolder?: string): Promise<void> {
        const userVersion = readUserVersion(this.rawDb);
        if (userVersion > MAX_SUPPORTED_USER_VERSION) {
            throw new Error(fileTooNewMessage(userVersion));
        }
        if (!isSupportedUserVersion(userVersion)) {
            throw new Error(
                "Cannot apply migrations, user version is not 7. If you have a file from 0.0.9 or earlier, please open your file in 0.0.10, then open it again in the current version",
            );
        }

        const folder = this.resolveMigrationsFolder(migrationsFolder);
        if (!fs.existsSync(folder)) {
            throw new Error(`Migrations folder not found: ${folder}`);
        }

        console.debug("migrationsFolder:", folder);

        try {
            // console.log("Dropping history triggers...");
            // await dropAllUndoTriggers(this.db);

            forgetFork3dVenueMigration(this.rawDb);

            console.log("Applying pending Drizzle migrations...");

            // A page-model file stops before the timeline-only migrations: they drop the tables
            // its conversion reads, and run in the conversion's transaction instead.
            const queries = pendingMigrationQueries(
                this.rawDb,
                folder,
                userVersion === PAGE_MODEL_USER_VERSION ? "page" : "all",
            );
            // Like drizzle's own migrator, rebuild the triggers on every open, even with nothing
            // pending, so they always match this build.
            dropAllTriggers(this.rawDb);
            for (const query of queries) {
                this.rawDb.exec("PRAGMA foreign_keys = OFF");
                this.rawDb.exec(query);
            }
            createAllTriggers(this.rawDb);
            this.rawDb.prepare("PRAGMA foreign_keys = ON").run();

            // The rebuild above already covers every trigger in the `triggers` map; this check
            // makes sure the change-log bodies are current without relying on that. It runs after
            // the file-version guard above, so it never writes to a file this build refuses.
            recreateChangeLogTriggers(this.rawDb);

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
        const folder = this.resolveMigrationsFolder(migrationsFolder);
        if (!fs.existsSync(folder)) {
            console.warn(
                `Migrations folder not found while checking pending migrations: ${folder}`,
            );
            return false;
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

    /**
     * Fills a file the app just created (already migrated) with the rows a new show starts with.
     * The caller set its version before migrating it.
     */
    static async initializeDatabase(db: DB, rawDb: DatabaseSync) {
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

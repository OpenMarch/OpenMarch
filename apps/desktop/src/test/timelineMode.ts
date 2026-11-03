import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import os from "os";
import path from "path";
import type { Table } from "drizzle-orm";
import { inject } from "vitest";
import { schema, getOrm } from "@/../electron/database/db";
import { DrizzleMigrationService } from "@/../electron/database/services/DrizzleMigrationService";
import { PAGE_MODEL_USER_VERSION } from "@/../electron/database/fileVersion";
import { convertFileOnOpen } from "@/../electron/database/convertOnOpen";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { migrationsFolder } from "./convertPages";

/**
 * Test databases are timeline files, like every file the app opens (ADR 0001 §6).
 *
 * A data fixture in `base.tsx` (`marchersAndPages`, `pages`, `marchers`, `beats`) loads a page
 * show into a page-era file (`pageEraBlankPath`), then converts it with the app's own convert on
 * open (`convertFileOnOpen`): timeline rows, the timeline-only migrations that drop the page-era
 * tables, and `user_version = 8`. A test file that builds its own timeline state from the page
 * show calls `keepFixturesInPageMode` to get the page-era file as it is, then converts it itself
 * with `convertPagesToTimeline` (`./convertPages.ts`).
 */

/**
 * Set by `keepFixturesInPageMode`. This is module state, so it relies on vitest's per-file
 * isolation (the default `isolate: true`, which gives each test file fresh modules); under
 * `--no-isolate` one file's opt-out would leak into later files, so it refuses to run there.
 */
let pageModeFixtures = false;

/**
 * Keeps this test file's data fixtures as unconverted page-era files: the test converts the page
 * show itself (`convertPagesToTimeline` from `@/test/convertPages`). `reason` documents why; it
 * isn't read.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function keepFixturesInPageMode(reason: string): void {
    // vitest's worker state (internal); without it the guard does nothing
    const worker = (
        globalThis as {
            __vitest_worker__?: { config?: { isolate?: boolean } };
        }
    ).__vitest_worker__;
    if (worker?.config?.isolate === false)
        throw new Error(
            "keepFixturesInPageMode needs vitest's per-file isolation; run without --no-isolate",
        );
    pageModeFixtures = true;
}

/** Whether the data fixtures convert their page show (true unless the file opted out). */
export const timelineFixtureMode = (): boolean => !pageModeFixtures;

/** The timeline data tables (ADR 0001 §3), for a history test's `tablesToCheck`. */
export const timelineHistoryTables = (): Table[] => [
    schema.timelines,
    schema.timeline_shapes,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
];

let pageEraBlank: string | undefined;

/**
 * A blank page-era file (version 7, the migrations before the timeline-only ones, and the rows
 * a new file got), built once per process. Data fixtures copy it to load a page show. It goes in
 * the run's fixture cache folder (./globalSetup.ts), which is deleted afterwards.
 */
export async function pageEraBlankPath(): Promise<string> {
    if (pageEraBlank && fs.existsSync(pageEraBlank)) return pageEraBlank;
    const dir =
        inject("fixtureCacheDir") ?? path.join(os.tmpdir(), "openmarch-test");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${process.pid}-page-era-blank.dots`);
    fs.rmSync(file, { force: true });
    const db = new DatabaseSync(file);
    try {
        db.exec(`PRAGMA user_version = ${PAGE_MODEL_USER_VERSION}`);
        const orm = getOrm(db);
        await new DrizzleMigrationService(orm, db).applyPendingMigrations(
            migrationsFolder,
        );
        await orm.insert(schema.field_properties).values({
            id: 1,
            json_data: JSON.stringify(
                FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES,
            ),
        });
        await orm.insert(schema.workspace_settings).values({
            id: 1,
            json_data: JSON.stringify({
                defaultBeatsPerMeasure: 4,
                defaultTempo: 120,
                defaultNewPageCounts: 16,
            }),
        });
    } finally {
        db.close();
    }
    pageEraBlank = file;
    return file;
}

/**
 * `marchers` columns the timeline-only migrations add (0024's `type`). App code reads every
 * column of `marchers`, so a page-mode fixture, which tests write timeline rows into and call
 * app functions on, gets them too; `finishTestConversion` then skips adding them again.
 */
export const LATER_MARCHER_COLUMNS = [
    {
        name: "type",
        sql: `ALTER TABLE \`marchers\` ADD COLUMN \`type\` text DEFAULT 'marcher' NOT NULL CONSTRAINT "marchers_type_check" CHECK(type IN ('marcher', 'item'))`,
    },
] as const;

/**
 * Tables the timeline-only migrations add that timeline edits read: the shape recipes (0027),
 * which the holds commands check, and the Held marks (0030). A page-mode fixture, which tests write timeline rows into
 * and call app functions on, gets them before its undo triggers are made. Their migrations create
 * them `IF NOT EXISTS`, so `finishTestConversion` runs them again harmlessly.
 */
export const LATER_TABLES = [
    "timeline_shape_recipes",
    "timeline_shape_recipe_marchers",
    "timeline_held_marks",
] as const;

/** The statements of the migrations that create {@link LATER_TABLES}, as the service splits them. */
export function laterTableStatements(): string[] {
    const files = fs
        .readdirSync(migrationsFolder)
        .filter((name) => name.endsWith(".sql"))
        .sort()
        .map((name) =>
            fs.readFileSync(path.join(migrationsFolder, name), "utf-8"),
        )
        .filter((sql) =>
            LATER_TABLES.some((table) =>
                sql.includes(`CREATE TABLE IF NOT EXISTS \`${table}\``),
            ),
        );
    return files.flatMap((sql) =>
        sql
            .split("--> statement-breakpoint")
            .map((s) => s.trim())
            .filter((s) => s.length > 0),
    );
}

/** Adds {@link LATER_MARCHER_COLUMNS} to the page-era file at `dbPath`. */
export function addLaterMarcherColumns(dbPath: string): void {
    const db = new DatabaseSync(dbPath);
    try {
        for (const column of LATER_MARCHER_COLUMNS) db.exec(column.sql);
    } finally {
        db.close();
    }
}

/**
 * Converts the page-era file at `dbPath` the way the app does when someone opens it and
 * confirms: timeline rows, the marker, the timeline-only migrations and version 8. No backup.
 */
export async function convertFixtureFile(dbPath: string): Promise<void> {
    const db = new DatabaseSync(dbPath);
    try {
        const result = await convertFileOnOpen(
            dbPath,
            db,
            migrationsFolder,
            { backupPath: "" },
            { backup: () => ({ ok: true, backupPath: "", userVersion: 7 }) },
        );
        if (result.status === "conversion-failed") throw result.error;
        if (result.status !== "converted")
            throw new Error(`Fixture conversion: ${result.status}`);
    } finally {
        db.close();
    }
}

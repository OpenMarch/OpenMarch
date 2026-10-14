import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import os from "os";
import path from "path";
import type { Table } from "drizzle-orm";
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
 * a new file got), built once per process. Data fixtures copy it to load a page show.
 */
export async function pageEraBlankPath(): Promise<string> {
    if (pageEraBlank && fs.existsSync(pageEraBlank)) return pageEraBlank;
    const dir = path.join(os.tmpdir(), "openmarch-test");
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

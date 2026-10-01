import { DatabaseSync } from "node:sqlite";
import { count, type Table } from "drizzle-orm";
import { drizzle as sqliteProxyDrizzle } from "drizzle-orm/sqlite-proxy";
import { schema } from "@/../electron/database/db";
import { createAllUndoTriggers, dropAllUndoTriggers } from "@/db-functions";
import type { DbConnection, DbTransaction } from "@/db-functions/types";
import { convertPagesToTimelineInTransaction } from "@/timeline/convert/writePageConversion";
import { handleSqlProxyWithDbBetterSqlite } from "./sqlProxyTestUtil";

/**
 * Timeline test mode (docs/timeline/phases/07-page-parity.md P7.17).
 *
 * With `VITEST_TIMELINE_MODE=true` (the desktop `test:timeline` script), every test database the
 * fixtures in `base.tsx` build is put into timeline mode: the workspace `timelineMode` flag is
 * turned on, and the page show a data fixture (`marchersAndPages`, `pages`, `marchers`, `beats`)
 * loads is converted into timeline rows. The blank database only gets the flag, as a new file in
 * timeline mode has no timeline rows. Without the variable nothing changes.
 *
 * The conversion runs with the undo triggers dropped and clears `timeline_change_log` afterwards,
 * as the app does after a write outside the history wrapper, so the tests start with empty undo,
 * redo and change log tables, as they do in page mode.
 */
export const TIMELINE_TEST_MODE = process.env.VITEST_TIMELINE_MODE === "true";

/**
 * Set by `keepFixturesInPageMode`. This is module state, so it relies on vitest's per-file
 * isolation (the default `isolate: true`, which gives each test file fresh modules). Under
 * `--no-isolate` (or `isolate: false`) the module is shared, and one file's opt-out would leak into
 * the files that run after it in the same worker; `keepFixturesInPageMode` refuses to run there.
 */
let pageModeFixtures = false;

/**
 * Keeps this test file's fixtures in page mode under `VITEST_TIMELINE_MODE`. Call it at the top
 * level of a file whose tests already build their own timeline state (they convert the show or
 * write timeline rows, and set the flag themselves), so they test timeline mode either way.
 * `reason` documents why; it isn't read.
 *
 * Throws when vitest runs without per-file isolation, where the opt-out would leak (see above).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function keepFixturesInPageMode(reason: string): void {
    // vitest's worker state (internal); without it the guard does nothing
    const worker = (
        globalThis as {
            __vitest_worker__?: { config?: { isolate?: boolean } };
        }
    ).__vitest_worker__;
    if (TIMELINE_TEST_MODE && worker?.config?.isolate === false)
        throw new Error(
            "keepFixturesInPageMode needs vitest's per-file isolation; run test:timeline without --no-isolate",
        );
    pageModeFixtures = true;
}

/** Whether the fixtures should put the test database into timeline mode. */
export const timelineFixtureMode = (): boolean =>
    TIMELINE_TEST_MODE && !pageModeFixtures;

/**
 * The five timeline data tables (ADR 0001 §3), for a history test's `tablesToCheck` in timeline
 * test mode, so undo and redo are checked on the timeline rows a ripple procedure rewrites. Empty
 * otherwise, so the default run checks the same tables as before.
 */
export const timelineHistoryTables = (): Table[] =>
    timelineFixtureMode()
        ? [
              schema.timelines,
              schema.timeline_shapes,
              schema.timeline_transitions,
              schema.timeline_assignments,
              schema.timeline_slot_destinations,
          ]
        : [];

/**
 * Whether to skip a test (or a `describe`) in timeline test mode. Use it only for a test that
 * asserts page-mode behavior timeline mode deliberately drops, such as page shape writes or
 * per-page appearance overrides, and say why in `reason` (it isn't read).
 *
 * @example it.skipIf(skipInTimelineMode("page shapes are refused in timeline mode (P7.11)"))(...)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const skipInTimelineMode = (reason: string): boolean =>
    timelineFixtureMode();

/**
 * Turns the file's `timelineMode` flag on or off in `workspace_settings`, keeping the other
 * settings. Writes outside the history wrapper, as a settings change does in the app. For tests
 * that set up timeline mode themselves: the write paths read the flag from the file
 * (`timelineModeInTransaction`), so this is how a test picks the mode.
 */
export async function setTimelineModeFlag(
    db: DbConnection,
    on: boolean,
): Promise<void> {
    await db.transaction((tx) => setTimelineFlag(tx, on));
}

/**
 * Runs `write` with the page-era freeze (P9.5) lifted: the file's timeline flag is turned off for
 * it, then set back as it was. In timeline mode the freeze triggers refuse every write to
 * `marcher_pages`, `pathways`, `midsets` and the page shape tables. This is for tests that make
 * those rows stale, or remove them, to show that timeline mode never reads them; the app itself
 * can't write them in timeline mode.
 */
export async function withPageEraFreezeLifted<T>(
    db: DbConnection,
    write: () => Promise<T>,
): Promise<T> {
    const row = await db
        .select({ json: schema.workspace_settings.json_data })
        .from(schema.workspace_settings)
        .get();
    let wasOn = false;
    try {
        wasOn =
            row != null &&
            (JSON.parse(row.json) as { timelineMode?: unknown })
                .timelineMode === true;
    } catch {
        wasOn = false;
    }
    if (!wasOn) return await write();
    await setTimelineModeFlag(db, false);
    try {
        return await write();
    } finally {
        await setTimelineModeFlag(db, true);
    }
}

/** Sets the `timelineMode` flag in `workspace_settings`, keeping the other settings. */
async function setTimelineFlag(tx: DbTransaction, on = true): Promise<void> {
    const row = await tx
        .select({
            id: schema.workspace_settings.id,
            json: schema.workspace_settings.json_data,
        })
        .from(schema.workspace_settings)
        .get();
    let settings: Record<string, unknown> = {};
    try {
        if (row) settings = JSON.parse(row.json) as Record<string, unknown>;
    } catch {
        settings = {};
    }
    const json_data = JSON.stringify({ ...settings, timelineMode: on });
    if (row)
        await tx.update(schema.workspace_settings).set({ json_data }).run();
    else
        await tx
            .insert(schema.workspace_settings)
            .values({ id: 1, json_data })
            .run();
}

/**
 * Converts the page show in the database file at `dbPath` into timeline rows (replacing any it
 * has) and turns the timeline flag on. With `convert: false`, or a file with no pages, it only
 * turns the flag on.
 */
export async function applyTimelineModeToFile(
    dbPath: string,
    { convert = true }: { convert?: boolean } = {},
): Promise<void> {
    const sqlite = new DatabaseSync(dbPath);
    try {
        const orm = sqliteProxyDrizzle(
            async (sql, params, method) =>
                handleSqlProxyWithDbBetterSqlite(sqlite, sql, params, method),
            { schema, casing: "snake_case" },
        ) as unknown as DbConnection;
        await dropAllUndoTriggers(orm);
        await orm.transaction(async (tx) => {
            const [pages] = await tx
                .select({ n: count() })
                .from(schema.pages)
                .all();
            if (convert && (pages?.n ?? 0) > 0)
                await convertPagesToTimelineInTransaction(tx, {
                    replace: true,
                });
            await setTimelineFlag(tx);
        });
        await orm.delete(schema.timeline_change_log).run();
        await createAllUndoTriggers(orm);
    } finally {
        sqlite.close();
    }
}

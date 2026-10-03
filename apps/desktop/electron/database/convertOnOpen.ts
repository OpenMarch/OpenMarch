/**
 * Converts a page-era show to timelines the first time it is opened (Phase 9,
 * P9.3; ADR 0001 §6). The app runs the backup and the conversion in a worker
 * thread (`convertOnOpenWorker.ts`, P9.8), so the main process stays
 * responsive; the check runs in the main process, which loads this module
 * only once the gate in `convertOnOpenGate.ts` is on.
 * `electron/main/convertOnOpenFlow.ts` adds the dialogs around it.
 *
 * Runs after migrations, on a file whose `user_version` the guard in
 * `fileVersion.ts` already accepted:
 *
 * - Version 8: a timeline file. Nothing to do.
 * - Version 7 with the conversion marker (`timelineConvertedAt` in the
 *   workspace settings), or with timeline rows and a conversion backup next to
 *   it: converted, then reopened by a release without the version guard (it
 *   resets the version to 7). Converting again would drop the timeline edits,
 *   so the caller warns, and offers the backup when there is one.
 * - Version 7 with timeline rows, no marker and no backup: made with the
 *   timeline dev flag. It opens as it is, without a warning.
 * - Version 7 otherwise: a page-era file. Back it up with
 *   `backupBeforeConversion`; only when that succeeds, convert it in ONE
 *   `BEGIN IMMEDIATE` transaction that rechecks the file, turns the workspace
 *   `timelineMode` flag on, writes the marker and sets `user_version = 8`. Any
 *   error rolls all of it back; the backup stays.
 */
import * as fs from "fs";
import * as path from "path";
import type { DatabaseSync } from "node:sqlite";
import { sql } from "drizzle-orm";
import type { PageConversionReport } from "@/timeline/convert/planPageConversion";
import { convertPagesToTimelineInTransaction } from "@/timeline/convert/convertPagesInTransaction";
import {
    assertNoTimelineCommitViolationsInTransaction,
    drainTimelineChangeLogInTransaction,
} from "@/db-functions/timelineChanges";
import {
    createAllUndoTriggers,
    dropAllUndoTriggers,
} from "@/db-functions/historyTriggers";
import type { DbConnection, DbTransaction } from "@/db-functions/types";
import { getOrm, schema } from "./db";
import {
    BACKUP_NAME_SUFFIX,
    backupBeforeConversion,
    nextBackupPath,
    type BackupResult,
} from "./backup";
import {
    PAGE_MODEL_USER_VERSION,
    readUserVersion,
    TIMELINE_MODEL_USER_VERSION,
} from "./fileVersion";
import {
    CONVERSION_STEPS,
    type ConversionStep,
    type ConvertProgress,
} from "./convertOnOpenProtocol";
import {
    hasConversionMarker,
    isConvertOnOpenEnabled,
    readWorkspaceSettingsJson,
    withTimelineModeOn,
} from "./convertOnOpenGate";

export type ConvertOnOpenCheck =
    /**
     * Nothing to do: a timeline file (version 8), or a version-7 file with
     * timeline rows and neither the marker nor a backup (made with the dev flag).
     */
    | { action: "none"; reason: "timeline-file" | "dev-timeline-file" }
    /** A page-era file: back it up and convert it. */
    | { action: "convert" }
    /**
     * Converted, then reopened by an older release: warn, and offer the
     * newest backup when there is one.
     */
    | { action: "warn-older-release"; backupPath: string | undefined };

/** Number of timelines plus timeline shapes (transitions live under timelines). */
export function countTimelineRows(db: DatabaseSync): number {
    const row = db
        .prepare(
            "SELECT (SELECT count(*) FROM timelines) + (SELECT count(*) FROM timeline_shapes) AS n",
        )
        .get() as { n: number };
    return Number(row.n);
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The newest `<name> (before timeline conversion[ n]).dots` next to
 * `filePath` (the highest number), or undefined when there is none. Scans the
 * folder, so a deleted backup in the middle of the numbers doesn't hide later
 * ones.
 */
export function findLatestBackup(filePath: string): string | undefined {
    const dir = path.dirname(path.resolve(filePath));
    const ext = path.extname(filePath);
    const numbered = new RegExp(
        ` \\(${escapeRegExp(BACKUP_NAME_SUFFIX)}(?: (\\d+))?\\)${escapeRegExp(ext)}$`,
    );
    let entries: string[];
    try {
        entries = fs.readdirSync(dir);
    } catch {
        return undefined;
    }
    let latest: { n: number; file: string } | undefined;
    for (const entry of entries) {
        const match = numbered.exec(entry);
        if (!match) continue;
        const n = match[1] ? Number(match[1]) : 1;
        // Must be exactly the name the backup of this file gets for `n` (names are cut to fit).
        const expected = nextBackupPath(
            path.join(dir, path.basename(filePath)),
            () => false,
            n,
        );
        if (path.basename(expected) !== entry) continue;
        if (!latest || n > latest.n) latest = { n, file: expected };
    }
    return latest?.file;
}

/** True when the file open on `db` carries the conversion marker. */
export function hasConversionMarkerIn(db: DatabaseSync): boolean {
    return hasConversionMarker(readWorkspaceSettingsJson(db));
}

/** Decides what convert on open does with the (migrated) file open on `db`. Reads only. */
export function checkConvertOnOpen(
    db: DatabaseSync,
    filePath: string,
): ConvertOnOpenCheck {
    if (readUserVersion(db) !== PAGE_MODEL_USER_VERSION)
        return { action: "none", reason: "timeline-file" };
    const marked = hasConversionMarkerIn(db);
    const rows = countTimelineRows(db) > 0;
    if (!marked && !rows) return { action: "convert" };
    const backupPath = findLatestBackup(filePath);
    if (marked || backupPath)
        return { action: "warn-older-release", backupPath };
    return { action: "none", reason: "dev-timeline-file" };
}

/**
 * Sets `timelineMode: true` and the conversion marker in `workspace_settings`,
 * keeping the other settings.
 */
export async function turnTimelineModeOnInTransaction(
    tx: DbTransaction,
    convertedAt: string,
): Promise<void> {
    const row = await tx
        .select({
            id: schema.workspace_settings.id,
            json: schema.workspace_settings.json_data,
        })
        .from(schema.workspace_settings)
        .get();
    const json_data = withTimelineModeOn(row?.json, convertedAt);
    if (row)
        await tx.update(schema.workspace_settings).set({ json_data }).run();
    else
        await tx
            .insert(schema.workspace_settings)
            .values({ id: 1, json_data })
            .run();
}

/**
 * Empties the undo and redo stacks. Their entries edit the page-era tables,
 * which no longer drive motion after the conversion, so undoing one would
 * change the file behind the timeline's back.
 */
async function clearHistoryInTransaction(tx: DbTransaction): Promise<void> {
    await tx.delete(schema.history_undo).run();
    await tx.delete(schema.history_redo).run();
    await tx
        .update(schema.history_stats)
        .set({ cur_undo_group: 1, cur_redo_group: 1 })
        .run();
}

export type ConvertOnOpenResult =
    | {
          status: "converted";
          backupPath: string;
          /** Undefined when the show had no pages, so only the flag and version changed. */
          report: PageConversionReport | undefined;
      }
    /**
     * Inside the transaction the file was already converted (another app
     * instance got there first). Nothing was written, and the backup this open
     * made was deleted, since it may hold converted content under a "before
     * conversion" name. The file opens as it is.
     */
    | { status: "already-converted" }
    /** The backup failed, so nothing was converted and the file is unchanged. */
    | {
          status: "backup-failed";
          backup: Extract<BackupResult, { ok: false }>;
      }
    /** The conversion failed and was rolled back. The backup is kept. */
    | { status: "conversion-failed"; backupPath: string; error: Error };

export { CONVERSION_STEPS, type ConversionStep, type ConvertProgress };

/** Hooks: `onProgress` for the preparing window; the others are for tests. */
export interface ConvertOnOpenHooks {
    /** Called before the backup, and after each converted page. */
    onProgress?: (progress: ConvertProgress) => void;
    /** Replaces `backupBeforeConversion`. */
    backup?: (filePath: string) => BackupResult;
    /** Runs inside the transaction after each step. Throw to test the rollback. */
    afterStep?: (step: ConversionStep) => void | Promise<void>;
    /** The time written into the conversion marker. */
    now?: () => Date;
}

class AlreadyConverted extends Error {}

/**
 * Backs up the file at `filePath`, then converts it in one transaction on
 * `db` (which must be open on that file, with migrations applied and no
 * transaction open). Never throws for a failed backup or conversion; it
 * returns them.
 *
 * The transaction is `BEGIN IMMEDIATE` and rechecks the version, the marker
 * and the timeline rows first, so a file another instance converted since the
 * check is never converted twice. A show whose only page is page 0 ends with
 * no timeline rows, like a new file made with the gate on.
 */
export async function convertFileOnOpen(
    filePath: string,
    db: DatabaseSync,
    hooks: ConvertOnOpenHooks = {},
): Promise<ConvertOnOpenResult> {
    hooks.onProgress?.({ phase: "backup" });
    const backup = (hooks.backup ?? backupBeforeConversion)(filePath);
    if (!backup.ok) return { status: "backup-failed", backup };

    const orm = getOrm(db) as unknown as DbConnection;
    const step = async (name: ConversionStep) => hooks.afterStep?.(name);
    const convertedAt = (hooks.now ?? (() => new Date()))().toISOString();
    try {
        const report = await orm.transaction(
            async (tx) => {
                // `db` is the transaction's connection, so these see the locked file.
                if (
                    readUserVersion(db) !== PAGE_MODEL_USER_VERSION ||
                    hasConversionMarkerIn(db) ||
                    countTimelineRows(db) > 0
                )
                    throw new AlreadyConverted();
                // The conversion is not an undoable edit (see clearHistoryInTransaction).
                await dropAllUndoTriggers(tx as never);
                await step("drop-undo-triggers");
                const pages = await tx
                    .select({ n: sql<number>`count(*)` })
                    .from(schema.pages)
                    .get();
                const converted =
                    (pages?.n ?? 0) > 0
                        ? await convertPagesToTimelineInTransaction(tx, {
                              onProgress: (pagesDone, pagesTotal) =>
                                  hooks.onProgress?.({
                                      phase: "convert",
                                      pagesDone,
                                      pagesTotal,
                                  }),
                          })
                        : undefined;
                await step("convert");
                await turnTimelineModeOnInTransaction(tx, convertedAt);
                await step("flag");
                // The spec §6 commit check, as the write wrapper runs it; then drop the change-log
                // rows the conversion wrote, since the renderer cold-builds its store on open.
                await assertNoTimelineCommitViolationsInTransaction(tx);
                await step("commit-check");
                await drainTimelineChangeLogInTransaction(tx);
                await step("drain-change-log");
                await clearHistoryInTransaction(tx);
                await step("clear-history");
                await createAllUndoTriggers(tx as never);
                await step("create-undo-triggers");
                // Part of the same transaction: a rollback leaves the file at 7.
                await tx.run(
                    sql.raw(
                        `PRAGMA user_version = ${TIMELINE_MODEL_USER_VERSION}`,
                    ),
                );
                await step("user-version");
                return converted?.report;
            },
            { behavior: "immediate" },
        );
        return { status: "converted", backupPath: backup.backupPath, report };
    } catch (error) {
        if (error instanceof AlreadyConverted) {
            fs.rmSync(backup.backupPath, { force: true });
            return { status: "already-converted" };
        }
        return {
            status: "conversion-failed",
            backupPath: backup.backupPath,
            error: error instanceof Error ? error : new Error(String(error)),
        };
    }
}

/** What the open flow asks the person, or shows them, during convert on open. */
export interface ConvertOnOpenUi {
    /**
     * The file was converted, then saved by an older release. Resolve `open` to
     * open it as it is (no conversion, nothing written), or `stop` to open nothing.
     */
    warnOlderRelease: (
        backupPath: string | undefined,
    ) => Promise<"open" | "stop">;
    /**
     * Runs the backup and conversion while a "preparing your file" state
     * shows. `work` reports its progress through the function it is given.
     */
    whilePreparing: <T>(
        work: (onProgress?: (progress: ConvertProgress) => void) => Promise<T>,
    ) => Promise<T>;
}

export type ConvertOnOpenOutcome =
    /** The gate is off. Nothing was read or written. */
    | { kind: "disabled" }
    /** Nothing to convert. */
    | { kind: "none"; reason: "timeline-file" | "dev-timeline-file" }
    | {
          kind: "older-release";
          backupPath: string | undefined;
          choice: "open" | "stop";
      }
    | ({ kind: "conversion" } & ConvertOnOpenResult);

/**
 * The convert-on-open step of opening a file: checks the gate and the file,
 * asks or converts, and reports what happened.
 */
export async function runConvertOnOpen(
    filePath: string,
    db: DatabaseSync,
    ui: ConvertOnOpenUi,
    {
        env = process.env,
        hooks,
        convert,
    }: {
        env?: Record<string, string | undefined>;
        hooks?: ConvertOnOpenHooks;
        /**
         * Backs up and converts the file instead of `convertFileOnOpen` on
         * `db`: the app runs them in a worker (P9.8). It must not use `db`.
         */
        convert?: (
            onProgress: (progress: ConvertProgress) => void,
        ) => Promise<ConvertOnOpenResult>;
    } = {},
): Promise<ConvertOnOpenOutcome> {
    if (!isConvertOnOpenEnabled(env)) return { kind: "disabled" };
    const check = checkConvertOnOpen(db, filePath);
    switch (check.action) {
        case "none":
            return { kind: "none", reason: check.reason };
        case "warn-older-release":
            return {
                kind: "older-release",
                backupPath: check.backupPath,
                choice: await ui.warnOlderRelease(check.backupPath),
            };
        case "convert": {
            const result = await ui.whilePreparing((onProgress) => {
                const report = (progress: ConvertProgress) => {
                    hooks?.onProgress?.(progress);
                    onProgress?.(progress);
                };
                return convert
                    ? convert(report)
                    : convertFileOnOpen(filePath, db, {
                          ...hooks,
                          onProgress: report,
                      });
            });
            return { kind: "conversion", ...result };
        }
    }
}

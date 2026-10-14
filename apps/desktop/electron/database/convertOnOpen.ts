/**
 * Converts a page-era show to timelines when it is opened (ADR 0001 §6), once
 * the person has agreed to it. The app runs the backup and the conversion in a
 * worker thread (`convertOnOpenWorker.ts`), so the main process stays
 * responsive; the check runs in the main process.
 * `electron/main/convertOnOpenFlow.ts` adds the dialogs around it.
 *
 * The check runs before migrations, on a file whose `user_version` the guard
 * in `fileVersion.ts` already accepted, and writes nothing:
 *
 * - Version 8: a timeline file. Nothing to do.
 * - Version 7: a page-era file. The renderer asks the person first. Every
 *   version-7 file is treated alike, including one made with the retired
 *   timeline dev flag (which also has timeline rows) and one converted before
 *   and then reset to 7 by an older release without the version guard.
 *
 * Only once the person agreed is anything written. For a version-7 file the
 * page-era tables are the latest data an older release could have written, so
 * converting always reads them and replaces any timeline rows already there.
 * A version-7 file without them (converted, then reset by an older release)
 * has nothing to convert from: its conversion fails and rolls back like any
 * other. The file is first backed up with `backupBeforeConversion` (the
 * untouched original, so older releases can open it) under the name the
 * person was shown (or the next free one, if it was taken since), and then
 * changed in ONE `BEGIN IMMEDIATE` transaction that rechecks the version,
 * applies the pending page-era migrations, converts, writes the marker,
 * applies the timeline-only migrations (which drop the page-era tables) and
 * sets `user_version = 8`. Any error rolls all of it back, so the file is
 * exactly what it was; the backup stays.
 */
import * as fs from "fs";
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
    applyPageMigrationsInTransaction,
    applyTimelineMigrationsInTransaction,
} from "./services/DrizzleMigrationService";
import {
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
    type ConvertRequest,
} from "./convertOnOpenProtocol";
import {
    countTimelineRows,
    hasPageEraTables,
    NO_PAGES_TO_CONVERT_MESSAGE,
    withConversionMarker,
} from "./convertOnOpenGate";

export { countTimelineRows };

export type ConvertOnOpenCheck =
    /** Nothing to do: a timeline file (version 8). */
    | { action: "none" }
    /**
     * A page-era file (version 7): ask the person, then back it up to
     * `backupPath` (the name it would get now) and convert it.
     */
    | { action: "convert"; backupPath: string };

/**
 * Decides what convert on open does with the file open on `db`, before any
 * migration runs. Reads only.
 */
export function checkConvertOnOpen(
    db: DatabaseSync,
    filePath: string,
): ConvertOnOpenCheck {
    if (readUserVersion(db) !== PAGE_MODEL_USER_VERSION)
        return { action: "none" };
    return { action: "convert", backupPath: nextBackupPath(filePath) };
}

/** Sets the conversion marker in `workspace_settings`, keeping the other settings. */
export async function writeConversionMarkerInTransaction(
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
    const json_data = withConversionMarker(row?.json, convertedAt);
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
 * which the conversion drops.
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
          /** Undefined when the show had no pages to convert (only page 0). */
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
    /**
     * The conversion failed and was rolled back, page-era migrations included:
     * the file is what it was, and is offered for conversion on its next open.
     * The backup is kept.
     */
    | { status: "conversion-failed"; backupPath: string; error: Error };

export {
    CONVERSION_STEPS,
    type ConversionStep,
    type ConvertProgress,
    type ConvertRequest,
};

/** Hooks: `onProgress` for the renderer's progress; the others are for tests. */
export interface ConvertOnOpenHooks {
    /** Called before the backup, and after each converted page. */
    onProgress?: (progress: ConvertProgress) => void;
    /** Replaces `backupBeforeConversion`; `target` is the backup's agreed path. */
    backup?: (filePath: string, target: string) => BackupResult;
    /** Runs inside the transaction after each step. Throw to test the rollback. */
    afterStep?: (step: ConversionStep) => void | Promise<void>;
    /** The time written into the conversion marker. */
    now?: () => Date;
}

class AlreadyConverted extends Error {}

/** Foreign-key violations in the file, counted by child and parent table. */
function foreignKeyViolations(db: DatabaseSync): Map<string, number> {
    const rows = db.prepare("PRAGMA foreign_key_check").all() as {
        table: string;
        parent: string;
    }[];
    const counts = new Map<string, number>();
    for (const { table, parent } of rows) {
        const key = `${table} -> ${parent}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
}

/**
 * Throws when the file has a foreign-key violation that `before` didn't. The
 * transaction runs with foreign keys off (see `convertFileOnOpen`), so this
 * stands in for the check SQLite would make; violations an older file already
 * had are not the conversion's to fix.
 */
function assertNoNewForeignKeyViolations(
    db: DatabaseSync,
    before: Map<string, number>,
): void {
    for (const [key, n] of foreignKeyViolations(db))
        if (n > (before.get(key) ?? 0))
            throw new Error(
                `The conversion left rows without their parent (${key}).`,
            );
}

/**
 * Converts the page-era tables inside `tx`, replacing any timeline rows. A
 * show with no pages gets nothing (and undefined).
 */
async function convertPageEraTablesInTransaction(
    tx: DbTransaction,
    db: DatabaseSync,
    onProgress: ConvertOnOpenHooks["onProgress"],
): Promise<PageConversionReport | undefined> {
    const pages = await tx
        .select({ n: sql<number>`count(*)` })
        .from(schema.pages)
        .get();
    if ((pages?.n ?? 0) === 0) return undefined;
    // Kept spots go with their assignments; with foreign keys off nothing cascades, so they are
    // deleted first.
    if (countTimelineRows(db) > 0)
        await tx.delete(schema.timeline_kept_assignments).run();
    const converted = await convertPagesToTimelineInTransaction(tx, {
        replace: true,
        onProgress: (pagesDone, pagesTotal) =>
            onProgress?.({ phase: "convert", pagesDone, pagesTotal }),
    });
    return converted.report;
}

/**
 * Backs up the file at `filePath` to `request.backupPath`, then converts it in
 * one transaction on `db` (which must be open on that file, with no
 * transaction open). Never throws for a failed backup or conversion; it
 * returns them.
 *
 * The transaction is `BEGIN IMMEDIATE` and rechecks the version first, so a
 * file another instance converted since the check is never converted twice. It
 * applies the pending page-era migrations, so a failure leaves the file
 * exactly as it was. It converts the page-era tables, replacing any timeline
 * rows (a show whose only page is page 0 gets no timeline rows), writes the
 * marker, applies the timeline-only migrations and sets the version. A file
 * without the page-era tables fails with `NO_PAGES_TO_CONVERT_MESSAGE`.
 *
 * Foreign keys are off for the transaction, as they are for every migration
 * (a table rebuild would otherwise cascade); a check before the commit refuses
 * any violation the conversion added.
 */
export async function convertFileOnOpen(
    filePath: string,
    db: DatabaseSync,
    migrationsFolder: string,
    request: ConvertRequest,
    hooks: ConvertOnOpenHooks = {},
): Promise<ConvertOnOpenResult> {
    hooks.onProgress?.({ phase: "backup" });
    const backup = (hooks.backup ?? defaultBackup)(
        filePath,
        request.backupPath,
    );
    if (!backup.ok) return { status: "backup-failed", backup };

    const orm = getOrm(db) as unknown as DbConnection;
    const step = async (name: ConversionStep) => hooks.afterStep?.(name);
    const convertedAt = (hooks.now ?? (() => new Date()))().toISOString();
    const foreignKeysWereOn =
        (db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number })
            .foreign_keys !== 0;
    // Must be set outside the transaction: inside one, SQLite ignores it.
    db.exec("PRAGMA foreign_keys = OFF");
    try {
        const report = await orm.transaction(
            async (tx) => {
                // `db` is the transaction's connection, so these see the locked file.
                if (readUserVersion(db) !== PAGE_MODEL_USER_VERSION)
                    throw new AlreadyConverted();
                // Converted, then reset to 7 by an older release: nothing to convert from.
                if (!hasPageEraTables(db))
                    throw new Error(NO_PAGES_TO_CONVERT_MESSAGE);
                const violationsBefore = foreignKeyViolations(db);
                // The file's own migrations, up to the ones that drop the page-era tables.
                applyPageMigrationsInTransaction(db, migrationsFolder);
                await step("migrate");
                // The conversion is not an undoable edit (see clearHistoryInTransaction).
                await dropAllUndoTriggers(tx as never);
                await step("drop-undo-triggers");
                const converted = await convertPageEraTablesInTransaction(
                    tx,
                    db,
                    hooks.onProgress,
                );
                await step("convert");
                await writeConversionMarkerInTransaction(tx, convertedAt);
                await step("marker");
                // The spec §6 commit check, as the write wrapper runs it; then drop the change-log
                // rows the conversion wrote, since the renderer cold-builds its store on open.
                await assertNoTimelineCommitViolationsInTransaction(tx);
                await step("commit-check");
                await drainTimelineChangeLogInTransaction(tx);
                await step("drain-change-log");
                await clearHistoryInTransaction(tx);
                await step("clear-history");
                // Drops the page-era tables the converter just read.
                applyTimelineMigrationsInTransaction(db, migrationsFolder);
                await step("timeline-migrations");
                await createAllUndoTriggers(tx as never);
                await step("create-undo-triggers");
                assertNoNewForeignKeyViolations(db, violationsBefore);
                // Part of the same transaction: a rollback leaves the file at 7.
                await tx.run(
                    sql.raw(
                        `PRAGMA user_version = ${TIMELINE_MODEL_USER_VERSION}`,
                    ),
                );
                await step("user-version");
                return converted;
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
    } finally {
        if (foreignKeysWereOn) db.exec("PRAGMA foreign_keys = ON");
    }
}

const defaultBackup = (filePath: string, target: string) =>
    backupBeforeConversion(filePath, { target });

/** What the open flow asks the person, or shows them, during convert on open. */
export interface ConvertOnOpenUi {
    /**
     * Runs the backup and conversion while the renderer shows its progress.
     * `work` reports its progress through the function it is given.
     */
    whilePreparing: <T>(
        work: (onProgress?: (progress: ConvertProgress) => void) => Promise<T>,
    ) => Promise<T>;
}

export type ConvertOnOpenOutcome =
    /** Nothing to convert: a timeline file. Nothing was written. */
    | { kind: "none" }
    /**
     * A page-era file the person hasn't agreed to convert yet. Nothing was
     * written; `backupPath` is where the backup would go.
     */
    | { kind: "needs-confirmation"; backupPath: string }
    | ({ kind: "conversion" } & ConvertOnOpenResult);

/**
 * The convert-on-open step of opening a file, before its migrations: checks
 * the file, then converts it (only when `confirmed`), or reports that the
 * person must be asked first.
 */
export async function runConvertOnOpen(
    filePath: string,
    db: DatabaseSync,
    ui: ConvertOnOpenUi,
    {
        confirmed,
        backupPath: confirmedBackupPath,
        migrationsFolder,
        hooks,
        convert,
    }: {
        /** The person agreed to convert this file. */
        confirmed: boolean;
        /**
         * The backup path the person was shown when they agreed. The backup
         * gets this name, or the next free one if it was taken since. Defaults
         * to the name the check picks now.
         */
        backupPath?: string;
        migrationsFolder: string;
        hooks?: ConvertOnOpenHooks;
        /**
         * Backs up and converts the file instead of `convertFileOnOpen` on
         * `db`: the app runs them in a worker. It must not use `db`.
         */
        convert?: (
            onProgress: (progress: ConvertProgress) => void,
            request: ConvertRequest,
        ) => Promise<ConvertOnOpenResult>;
    },
): Promise<ConvertOnOpenOutcome> {
    const run = async (
        request: ConvertRequest,
    ): Promise<ConvertOnOpenOutcome> => {
        const result = await ui.whilePreparing((onProgress) => {
            const report = (progress: ConvertProgress) => {
                hooks?.onProgress?.(progress);
                onProgress?.(progress);
            };
            return convert
                ? convert(report, request)
                : convertFileOnOpen(filePath, db, migrationsFolder, request, {
                      ...hooks,
                      onProgress: report,
                  });
        });
        return { kind: "conversion", ...result };
    };

    const check = checkConvertOnOpen(db, filePath);
    if (check.action === "none") return { kind: "none" };
    if (!confirmed)
        return { kind: "needs-confirmation", backupPath: check.backupPath };
    return run({ backupPath: confirmedBackupPath ?? check.backupPath });
}

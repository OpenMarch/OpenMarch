/**
 * The database part of opening a show file, shared by `setActiveDb` and the
 * new-show draft (`electron/main/index.ts`): set the path, check the version,
 * migrate, then either initialize a new file or run convert on open (P9.3).
 * It has no Electron dependency, so tests drive it directly.
 *
 * With the convert-on-open gate off (the default), this does what
 * `setActiveDb` always did: the converter and its dialogs flow are loaded
 * with a dynamic `import()` only once the gate is on. The worker host is light
 * (`node:worker_threads`), and the worker loads the converter itself.
 *
 * The backup and the conversion run in a worker thread (P9.8) when
 * `deps.convertWorker` names the built worker, as the app does. The open's own
 * connection is closed while the worker has the file, and reopened after.
 */
import * as path from "path";
import type { DatabaseSync } from "node:sqlite";
import * as DatabaseServices from "../database/database.services";
import { getOrm } from "../database/db";
import { DrizzleMigrationService } from "../database/services/DrizzleMigrationService";
import { applyFileVersionDecision } from "../database/fileVersion";
import {
    initializeNewFileAsTimeline,
    isConvertOnOpenEnabled,
    OPEN_STOPPED_STATUS,
} from "../database/convertOnOpenGate";
import type { ConvertOnOpenHooks } from "../database/convertOnOpen";
import type { ConvertOnOpenDialogs } from "./convertOnOpenFlow";
import { convertInWorker } from "./convertWorkerHost";
import type { ConvertWorkerTestHooks } from "../database/convertOnOpenProtocol";

/** How long the conversion's connection waits for another connection's lock. */
const CONVERSION_BUSY_TIMEOUT_MS = 5000;

let openTail: Promise<unknown> = Promise.resolve();

/**
 * Runs `open` after every open queued before it has finished, so two opens
 * (for example a second file while the first converts) never interleave.
 * Never call it from inside another queued open.
 */
export function withOpenLock<T>(open: () => Promise<T>): Promise<T> {
    const run = openTail.then(open, open);
    openTail = run.catch(() => undefined);
    return run;
}

const pendingOpens = new Map<string, Promise<unknown>>();

/**
 * Runs `open` for `filePath`, unless an open of the same file is already
 * queued or running (for example waiting on a dialog): then it returns that
 * open's result instead of queueing another, so a double click opens once.
 */
export function openOnce<T>(
    filePath: string,
    open: () => Promise<T>,
): Promise<T> {
    if (!filePath) return open();
    const key = path.resolve(filePath);
    const pending = pendingOpens.get(key);
    if (pending) return pending as Promise<T>;
    const run = open().finally(() => pendingOpens.delete(key));
    pendingOpens.set(key, run);
    return run;
}

/** Number of opens queued or running; for tests. */
export const pendingOpenCount = () => pendingOpens.size;

export interface OpenShowDeps {
    migrationsFolder: string;
    env?: Record<string, string | undefined>;
    /** Runs before pending migrations are applied to an existing file (the app backs it up). */
    beforeMigrations?: (filePath: string) => void;
    /** The convert-on-open dialogs. Only called when the gate is on and an existing file opens. */
    dialogs: () => ConvertOnOpenDialogs;
    /**
     * Runs the backup and conversion in a worker thread (P9.8). Without it they run on this
     * thread, on the open's connection (tests of the open flow).
     */
    convertWorker?: {
        /** The built worker (`defaultConvertWorkerPath`). */
        workerPath: string;
        /** Test hooks for the worker. */
        test?: ConvertWorkerTestHooks;
    };
    /** Test hooks for the in-thread conversion. */
    hooks?: ConvertOnOpenHooks;
    /** Called with the open's connection as soon as it exists. For tests. */
    onConnect?: (db: DatabaseSync) => void;
}

export interface OpenShowResult {
    /** 200, an HTTP-style refusal from `setDbPath`, 500, or `OPEN_STOPPED_STATUS`. */
    status: number;
    /** The open connection, on success. The caller owns it. */
    db?: DatabaseSync;
    /**
     * The token of the renderer-SQL suspension this open started (existing
     * files with the gate on), or undefined. The caller resumes it with
     * `resumeSqlProxyAfterReload` once the window has reloaded, or right away
     * when nothing opens.
     */
    sqlSuspension?: number;
}

/**
 * Opens `filePath` as the active database. Not serialized; use `openShowFile`
 * or `withOpenLock`. Closes its connection if it throws.
 */
export async function openShowDatabase(
    filePath: string,
    isNewFile: boolean,
    deps: OpenShowDeps,
): Promise<OpenShowResult> {
    const gateOn = isConvertOnOpenEnabled(deps.env);
    // With the gate on, an existing file may be converted: from here until the window has
    // reloaded, the page showing the previous file must not reach this one.
    const sqlSuspension =
        gateOn && !isNewFile
            ? DatabaseServices.suspendSqlProxy("a file is being opened")
            : undefined;
    try {
        return await openWithSuspension(
            filePath,
            isNewFile,
            deps,
            gateOn,
            sqlSuspension,
        );
    } catch (error) {
        // The caller never sees a token from a failed open, so lift it here.
        if (sqlSuspension !== undefined)
            DatabaseServices.resumeSqlProxy(sqlSuspension);
        throw error;
    }
}

async function openWithSuspension(
    filePath: string,
    isNewFile: boolean,
    deps: OpenShowDeps,
    gateOn: boolean,
    sqlSuspension: number | undefined,
): Promise<OpenShowResult> {
    const stopped = (status: number): OpenShowResult => ({
        status,
        sqlSuspension,
    });

    const resCode = DatabaseServices.setDbPath(filePath, isNewFile);
    if (resCode !== 200) return stopped(resCode);

    let db = DatabaseServices.connect();
    if (!db) return stopped(500);
    deps.onConnect?.(db);
    let isOpen = true;
    let keepOpen = false;
    try {
        const orm = getOrm(db);
        const migrator = new DrizzleMigrationService(orm, db);
        if (!isNewFile && migrator.hasPendingMigrations(deps.migrationsFolder))
            deps.beforeMigrations?.(filePath);
        // Sets the version only on a new, empty file; an existing file keeps its
        // version (ADR 0001 §6). setDbPath already refused newer files.
        applyFileVersionDecision(db, isNewFile);
        await migrator.applyPendingMigrations(deps.migrationsFolder);

        if (isNewFile) {
            await DrizzleMigrationService.initializeDatabase(orm, db);
            // With the gate on, a new file starts as a timeline file (no backup, no conversion).
            if (gateOn) initializeNewFileAsTimeline(db);
        } else if (gateOn) {
            db.exec(`PRAGMA busy_timeout = ${CONVERSION_BUSY_TIMEOUT_MS}`);
            const { convertOnOpenInMain } = await import("./convertOnOpenFlow");
            const worker = deps.convertWorker;
            const checkDb = db;
            const next = await convertOnOpenInMain(
                filePath,
                checkDb,
                deps.dialogs(),
                {
                    env: deps.env,
                    hooks: deps.hooks,
                    convert: worker
                        ? async (onProgress) => {
                              // The worker needs the file to itself: this connection holds no
                              // transaction, but close it anyway so nothing of ours can lock it.
                              checkDb.close();
                              isOpen = false;
                              return convertInWorker(filePath, {
                                  workerPath: worker.workerPath,
                                  busyTimeoutMs: CONVERSION_BUSY_TIMEOUT_MS,
                                  onProgress,
                                  test: worker.test,
                              });
                          }
                        : undefined,
                },
            );
            if (!isOpen) {
                // The worker has exited, so its connection is closed. Reopen ours, on this open's
                // own file: the active path is global.
                db = DatabaseServices.connectToPath(filePath);
                isOpen = true;
                deps.onConnect?.(db);
                db.exec(`PRAGMA busy_timeout = ${CONVERSION_BUSY_TIMEOUT_MS}`);
            }
            if (next === "stop") {
                DatabaseServices.setDbPath("", false);
                return stopped(OPEN_STOPPED_STATUS);
            }
        }
        keepOpen = true;
        return { status: 200, db, sqlSuspension };
    } finally {
        if (!keepOpen && isOpen) db.close();
    }
}

/** `openShowDatabase`, serialized with every other open. */
export function openShowFile(
    filePath: string,
    isNewFile: boolean,
    deps: OpenShowDeps,
): Promise<OpenShowResult> {
    return withOpenLock(() => openShowDatabase(filePath, isNewFile, deps));
}

/** The part of `webContents` that tells when the reload has navigated. */
export interface NavigationEvents {
    once(event: "did-navigate", listener: () => void): unknown;
}

/**
 * Lifts the renderer-SQL suspension `token` once the window has reloaded
 * (`did-navigate`), or after `fallbackMs` if it never does, or at once when
 * there is no window. Resolves when it is lifted. Only lifts its own
 * suspension: if a later open suspended SQL meanwhile, that one stays.
 */
export function resumeSqlProxyAfterReload(
    token: number,
    webContents: NavigationEvents | null,
    fallbackMs = 15_000,
): Promise<void> {
    if (!webContents) {
        DatabaseServices.resumeSqlProxy(token);
        return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
        let done = false;
        const resume = () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            DatabaseServices.resumeSqlProxy(token);
            resolve();
        };
        const timer = setTimeout(resume, fallbackMs);
        webContents.once("did-navigate", resume);
    });
}

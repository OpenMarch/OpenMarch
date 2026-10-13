/* eslint-disable no-console */
/**
 * The web build's main process: a worker that runs the part of
 * `electron/main` a show needs.
 *
 * The database handlers (`sql:proxy`, `unsafeSql:proxy`, `audio:*`) are the
 * app's own, registered by `DatabaseServices.initHandlers()` against the
 * `ipcMain` stand-in. The few handlers that live in `electron/main/index.ts`
 * (which can't be imported, since it starts the app) are restated here.
 * Anything that needs the page (file pickers, downloads, settings) is handled
 * by the page in `../renderer/handlers.ts`.
 *
 * There is one open show at a time, in memory. A copy goes to browser
 * storage shortly after each change (see `./storage.ts`), so reloading the
 * page reopens it.
 */
import "./process";
import * as DatabaseServices from "@om-electron/database/database.services";
import { getOrm } from "@om-electron/database/db";
import { DrizzleMigrationService } from "@om-electron/database/services/DrizzleMigrationService";
import { readPreviousDotsFile } from "@om-electron/main/services/previous-dots-import-service";
import { ipcHandlers, ipcListeners, ipcMain } from "./electron";
import { MIGRATIONS_FOLDER } from "./fs";
import {
    changeState,
    closeAll,
    deleteDatabase,
    exportDatabase,
    listDatabases,
    loadSqlite,
    renameDatabase,
    writeDatabase,
} from "./sqlite";
import { claimStorage, clearShow, readShow, writeShow } from "./storage";
import {
    WEB_CHANNELS,
    WEB_EVENTS,
    type FromWorker,
    type ToWorker,
} from "../protocol";

/** The parts of a dedicated worker's global scope used here (the app's types are the DOM's). */
const scope = globalThis as unknown as {
    postMessage(message: FromWorker): void;
    addEventListener(
        type: "message",
        listener: (event: MessageEvent<ToWorker>) => void,
    ): void;
    addEventListener(type: "unload", listener: () => void): void;
};
const post = (message: FromWorker) => scope.postMessage(message);

/** New-show drafts live here until the wizard finishes. */
const DRAFTS = "/drafts/";
/** An opened file waits here until it has been checked and migrated. */
const INCOMING = "/incoming/";

let draftPath: string | null = null;

/** The file name a show is kept under, from the name the person gave it. */
function showPath(name: string): string {
    const clean =
        name
            .replace(/\.dots$/i, "")
            .replace(/[<>:"/\\|?*]/g, "_")
            .trim() || "Untitled";
    return `/${clean}.dots`;
}

/**
 * Opens the show at `path` the way `setActiveDb` in `electron/main/index.ts`
 * does: check the file, set up a new one, apply pending migrations. There is
 * no backup before migrating: the person's own copy is the file they opened.
 */
async function openShowAt(path: string, isNewFile: boolean): Promise<number> {
    const status = DatabaseServices.setDbPath(path, isNewFile);
    if (status !== 200) return status;

    const db = DatabaseServices.connect();
    try {
        const orm = getOrm(db);
        const migrator = new DrizzleMigrationService(orm, db);
        if (isNewFile)
            db.prepare(
                `PRAGMA user_version = ${DatabaseServices.DB_USER_VERSION}`,
            ).run();
        await migrator.applyPendingMigrations(MIGRATIONS_FOLDER);
        if (isNewFile)
            await DrizzleMigrationService.initializeDatabase(orm, db);
        return 200;
    } catch (error) {
        console.error("Error opening show:", error);
        DatabaseServices.setDbPath("", false);
        throw error;
    } finally {
        db.close();
    }
}

/** Removes every show except `keep`: the web build has one show at a time. */
function removeOtherShows(keep?: string) {
    for (const path of listDatabases()) if (path !== keep) deleteDatabase(path);
}

/** Reopens the show that was open before the page reloaded, if there is one. */
async function restoreShow() {
    const saved = await readShow();
    if (!saved) return;
    const path = showPath(saved.name);
    try {
        writeDatabase(path, saved.bytes);
        await openShowAt(path, false);
        savedCopy = { path, changes: changeState(path)?.changes ?? 0 };
        markDownloaded();
    } catch (error) {
        // Keep the stored copy for a later build to try.
        console.error("Couldn't reopen the last show:", error);
        deleteDatabase(path);
        DatabaseServices.setDbPath("", false);
    }
}

/* ================== Changes since the last download ================== */

/** The show's change count when it was opened or last downloaded. */
let downloadedChanges: number | null = null;
let reportedChanged = false;

/** Counts from now: the show was just opened or downloaded. */
function markDownloaded() {
    const state = changeState(DatabaseServices.getDbPath());
    downloadedChanges = state?.changes ?? null;
    reportedChanged = false;
}

/** Tells the page once when the show first differs from its last download. */
function reportChanges() {
    if (reportedChanged || downloadedChanges === null) return;
    const state = changeState(DatabaseServices.getDbPath());
    if (!state || state.changes === downloadedChanges) return;
    reportedChanged = true;
    post({ type: "emit", channel: WEB_EVENTS.changed, args: [] });
}

/* ======================= Keeping a copy ======================= */

/**
 * At most one copy per this many milliseconds. The first change after a quiet
 * spell is copied at once, so a lone edit is in storage before the person
 * can reload; a drag's stream of writes is copied a few times a second.
 */
const SAVE_INTERVAL_MS = 500;
/**
 * How long to wait before trying again when a save finds a transaction open.
 * Must be a real timer: the transaction's next statement is a later message,
 * and the worker only reads it once this save stops retrying.
 */
const TRANSACTION_RETRY_MS = 50;
/** The show and change count the stored copy has. */
let savedCopy: { path: string; changes: number } | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastSaveAt = 0;
let storageEnabled = false;

/** Copies the open show to storage if it changed and is between transactions. */
async function saveCopy(): Promise<void> {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    const path = DatabaseServices.getDbPath();
    if (
        !storageEnabled ||
        !path ||
        path.startsWith(DRAFTS) ||
        path.startsWith(INCOMING)
    )
        return;
    const state = changeState(path);
    if (!state) return;
    if (savedCopy?.path === path && savedCopy.changes === state.changes) return;
    if (!state.idle) {
        // Mid-transaction: the copy would hold half a change. Try again soon.
        scheduleSave(TRANSACTION_RETRY_MS);
        return;
    }
    lastSaveAt = Date.now();
    const bytes = exportDatabase(path);
    const copy = { path, changes: state.changes };
    savedCopy = copy;
    try {
        await writeShow(path.slice(1).replace(/\.dots$/, ""), bytes);
    } catch (error) {
        // Not stored, so the next save tries again.
        if (savedCopy === copy) savedCopy = null;
        throw error;
    }
}

function scheduleSave(minimumWait = 0) {
    if (!storageEnabled || saveTimer) return;
    const wait = Math.max(
        minimumWait,
        lastSaveAt + SAVE_INTERVAL_MS - Date.now(),
    );
    const save = () =>
        serially(saveCopy).catch((error) =>
            console.error("Couldn't keep a copy of the show:", error),
        );
    if (wait === 0) void save();
    else saveTimer = setTimeout(save, wait);
}

/** Messages and timed saves run one at a time, in order. */
let operations: Promise<unknown> = Promise.resolve();

/**
 * Runs `operation` after the ones before it, so a close or a save can't run
 * while an open is still migrating the show.
 */
function serially<T>(operation: () => Promise<T>): Promise<T> {
    const result = operations.then(operation, operation);
    operations = result.catch(() => {});
    return result;
}

/** The few handlers in electron/main/index.ts a show needs, restated. */
function registerMainHandlers() {
    ipcMain.handle("database:isReady", () =>
        DatabaseServices.databaseIsReady(),
    );
    ipcMain.handle("database:getPath", () => DatabaseServices.getDbPath());
    ipcMain.handle("get-current-filename", () =>
        DatabaseServices.getDbPath()
            .split("/")
            .pop()
            ?.replace(/\.dots$/, ""),
    );
    ipcMain.handle("file:exists", () => false);
}

/** The new-show wizard writes into a draft, then names it. */
function registerNewShowHandlers() {
    ipcMain.handle("newShow:createDraft", async () => {
        if (draftPath) deleteDatabase(draftPath);
        draftPath = `${DRAFTS}${crypto.randomUUID()}.dots`;
        const status = await openShowAt(draftPath, true);
        if (status !== 200) {
            draftPath = null;
            return -1;
        }
        return { path: draftPath };
    });
    ipcMain.handle(
        "newShow:finalizeDraft",
        async (_, _targetPath: string, projectName: string) => {
            if (!draftPath) return -1;
            const path = showPath(projectName);
            DatabaseServices.closePersistentConnection();
            renameDatabase(draftPath, path);
            draftPath = null;
            removeOtherShows(path);
            const status = DatabaseServices.setDbPath(path);
            if (status === 200) {
                await saveCopy();
                // Never downloaded: the page marks a new show as changed.
                markDownloaded();
            }
            return status;
        },
    );
    ipcMain.handle("newShow:discardDraft", () => {
        if (draftPath) {
            DatabaseServices.closePersistentConnection();
            deleteDatabase(draftPath);
            draftPath = null;
            DatabaseServices.setDbPath("", false);
        }
        return 200;
    });
    ipcMain.handle("newShow:getDraftPath", () => draftPath);
}

/** The web build's own channels: one show, in from and out to the page. */
// eslint-disable-next-line max-lines-per-function
function registerWebHandlers() {
    ipcMain.handle(
        WEB_CHANNELS.openShow,
        async (_, bytes: Uint8Array, name: string) => {
            // Check and migrate the file apart from the open show, which
            // stays open (and stored) if the file can't be opened.
            const previous = DatabaseServices.getDbPath();
            const incoming = `${INCOMING}${crypto.randomUUID()}.dots`;
            const restore = (status: number) => {
                deleteDatabase(incoming);
                if (previous) DatabaseServices.setDbPath(previous);
                else DatabaseServices.setDbPath("", false);
                return status;
            };
            DatabaseServices.closePersistentConnection();
            try {
                writeDatabase(incoming, bytes);
            } catch (error) {
                console.error("Not a SQLite file:", error);
                return restore(415);
            }
            let status: number;
            try {
                status = await openShowAt(incoming, false);
            } catch {
                return restore(500);
            }
            if (status !== 200) return restore(status);

            const path = showPath(name);
            DatabaseServices.closePersistentConnection();
            renameDatabase(incoming, path);
            removeOtherShows(path);
            draftPath = null;
            status = DatabaseServices.setDbPath(path);
            if (status === 200) {
                await saveCopy();
                markDownloaded();
            }
            return status;
        },
    );
    ipcMain.handle(WEB_CHANNELS.closeShow, async () => {
        DatabaseServices.closePersistentConnection();
        DatabaseServices.setDbPath("", false);
        removeOtherShows();
        draftPath = null;
        savedCopy = null;
        downloadedChanges = null;
        await clearShow();
    });
    ipcMain.handle(WEB_CHANNELS.flush, () => saveCopy());
    ipcMain.handle(WEB_CHANNELS.exportShow, () => {
        const path = DatabaseServices.getDbPath();
        if (!path) return null;
        const bytes = exportDatabase(path);
        markDownloaded();
        return { name: path.split("/").pop()!, bytes };
    });
    ipcMain.handle(
        WEB_CHANNELS.readPreviousDots,
        async (_, bytes: Uint8Array) => {
            const path = `/import/${crypto.randomUUID()}.dots`;
            try {
                writeDatabase(path, bytes);
                return await readPreviousDotsFile(path);
            } finally {
                deleteDatabase(path);
            }
        },
    );
    ipcMain.handle(
        WEB_CHANNELS.insertAudio,
        async (_, data: ArrayBuffer, name: string) => {
            if (!DatabaseServices.databaseIsReady())
                return new DatabaseServices.LegacyDatabaseResponse(
                    false,
                    undefined,
                    new Error("No file is open. Create or open a show first."),
                );
            return DatabaseServices.insertAudioFile({
                data,
                path: name,
                nickname: name,
                selected: true,
            });
        },
    );
}

function registerHandlers() {
    DatabaseServices.initHandlers();
    registerMainHandlers();
    registerNewShowHandlers();
    registerWebHandlers();
}

async function handle(message: ToWorker) {
    if (message.type === "send") {
        const listener = ipcListeners.get(message.channel);
        // Electron drops a message no one listens for; so does this.
        if (typeof listener === "function") listener({}, ...message.args);
        scheduleSave();
        reportChanges();
        return;
    }
    const handler = ipcHandlers.get(message.channel);
    try {
        if (!handler)
            throw new Error(`No handler registered for '${message.channel}'`);
        const value = await handler({}, ...message.args);
        post({ type: "result", id: message.id, ok: true, value });
        scheduleSave();
        reportChanges();
    } catch (error) {
        post({
            type: "result",
            id: message.id,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

async function start() {
    await loadSqlite();
    const storage = await claimStorage(
        import.meta.env.VITE_PUBLIC_WEB_CHANNEL || "dev",
    );
    storageEnabled = storage.storage === "opfs";
    registerHandlers();
    if (storageEnabled) await restoreShow();
    scope.addEventListener("message", (event: MessageEvent<ToWorker>) => {
        void serially(() => handle(event.data));
    });
    scope.addEventListener("unload", closeAll);
    post({
        type: "ready",
        status:
            storage.storage === "opfs"
                ? { storage: "opfs" }
                : { storage: "memory", storageProblem: storage.problem },
    });
}

start().catch((error) => {
    console.error(error);
    post({
        type: "fatal",
        message: error instanceof Error ? error.message : String(error),
    });
});

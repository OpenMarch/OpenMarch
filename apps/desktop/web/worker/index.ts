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
 * There is one open show at a time, in memory. Browser storage keeps a
 * library of shows (see `./library.ts`): the open one is copied there
 * shortly after each change, so reloading the page reopens it, and opening
 * or creating a show adds it without replacing the others.
 */
import "./process";
import * as DatabaseServices from "@om-electron/database/database.services";
import { getOrm } from "@om-electron/database/db";
import { DrizzleMigrationService } from "@om-electron/database/services/DrizzleMigrationService";
import * as schema from "@om-electron/database/migrations/schema";
import { workspaceSettingsSchema } from "@/settings/workspaceSettings";
import { readPreviousDotsFile } from "@om-electron/main/services/previous-dots-import-service";
import { ipcHandlers, ipcListeners, ipcMain } from "./electron";
import { MIGRATIONS_FOLDER } from "./fs";
import {
    changeState,
    deleteDatabase,
    exportDatabase,
    listDatabases,
    loadSqlite,
    renameDatabase,
    writeDatabase,
} from "./sqlite";
import { claimStorage } from "./storage";
import { hasUnsavedChanges } from "./saveState";
import { isFullError, Library } from "./library";
import { cleanName } from "@/utilities/webLibrary";
import {
    WEB_CHANNELS,
    WEB_EVENTS,
    type FromWorker,
    type LibraryState,
    type SaveStatus,
    type ToWorker,
} from "../protocol";

/** The parts of a dedicated worker's global scope used here (the app's types are the DOM's). */
const scope = globalThis as unknown as {
    postMessage(message: FromWorker): void;
    addEventListener(
        type: "message",
        listener: (event: MessageEvent<ToWorker>) => void,
    ): void;
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
        // Shows from before workspace settings have no row, and the app adds
        // one as it loads (initializeWorkspaceSettings), which would count as
        // a change the person must download. Adding it while opening, as a
        // migration would, keeps an untouched show unchanged.
        else
            await orm
                .insert(schema.workspace_settings)
                .values({
                    id: 1,
                    json_data: JSON.stringify(
                        workspaceSettingsSchema.parse({}),
                    ),
                })
                .onConflictDoNothing();
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

/* ========================= The library ========================= */

/** The shows kept in browser storage; null in a memory-only tab. */
let library: Library | null = null;
/** The library id of the open show, if it's stored there. */
let openId: string | null = null;
/** A stored show that couldn't be opened when the page loaded. */
let openFailed: string | null = null;

function libraryState(): LibraryState {
    return {
        shows: library?.list() ?? [],
        openId,
        openFailed,
    };
}

/** Tells the page the library changed. */
function reportLibrary() {
    post({ type: "emit", channel: WEB_EVENTS.library, args: [libraryState()] });
}

let lastStatus: SaveStatus["state"] | null = null;
function reportStatus(status: SaveStatus) {
    if (status.state === "saving" && lastStatus === "saving") return;
    lastStatus = status.state;
    post({ type: "emit", channel: WEB_EVENTS.saveStatus, args: [status] });
}

function describeSaveError(error: unknown): SaveStatus {
    const message = error instanceof Error ? error.message : String(error);
    return {
        state: "error",
        reason: isFullError(error) ? "full" : "other",
        message,
    };
}

/** Reopens the show that was open before the page reloaded, if there is one. */
async function restoreShow() {
    const id = library?.current.openId;
    if (!library || !id) return;
    const entry = library.current.shows.find((show) => show.id === id);
    const path = showPath(entry?.name ?? "Untitled");
    try {
        // A restore point from before this session's edits
        await library
            .keepVersion(id, "opened")
            .catch((error) =>
                console.warn("Couldn't keep a version on opening:", error),
            );
        writeDatabase(path, await library.readShow(id));
        const status = await openShowAt(path, false);
        if (status !== 200) throw new Error(`Status ${status}`);
        openId = id;
        savedCopy = { path, changes: changeState(path)?.changes ?? 0 };
        markDownloaded();
    } catch (error) {
        // It stays in the library, for a later build to try.
        console.error("Couldn't reopen the last show:", error);
        openFailed = entry?.name ?? id;
        openId = null;
        deleteDatabase(path);
        DatabaseServices.setDbPath("", false);
        await library.setOpen(null).catch(() => {});
    }
}

/* ================== Changes since the last download ================== */

/** The show's change count when it was opened or last downloaded. */
let downloadedChanges: number | null = null;
let reportedChanged = false;

/**
 * Counts from now: the show was just opened or downloaded. The worker resets
 * this when it opens or exports a show; the page resets its own flag in
 * `markDownloaded` (renderer/handlers.ts) at the same moments.
 */
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
        // This can't wait here: the transaction's next statement is a later
        // message, which is only read once this save returns. So a flush in
        // this state defers to the retry timer rather than saving now.
        scheduleSave(TRANSACTION_RETRY_MS);
        return;
    }
    if (!library || !openId) return;
    lastSaveAt = Date.now();
    const bytes = exportDatabase(path);
    const copy = { path, changes: state.changes };
    savedCopy = copy;
    reportStatus({ state: "saving" });
    try {
        await library.saveShow(openId, bytes);
    } catch (error) {
        // Not stored, so the next save tries again.
        if (savedCopy === copy) savedCopy = null;
        reportStatus(describeSaveError(error));
        throw error;
    }
    reportStatus({ state: "saved", at: Date.now() });
    reportLibrary();
}

/**
 * Adds the show that was just opened or created to the library, as the one
 * to reopen. If storage fails, storage is no longer used in this tab and the
 * page hands the show across the reload as a memory-only tab does; the
 * library keeps its other shows.
 */
async function storeNewShow(name: string, backedUp: boolean) {
    // A different show, even under the same name and change count.
    savedCopy = null;
    openId = null;
    openFailed = null;
    const path = DatabaseServices.getDbPath();
    if (!storageEnabled || !library || !path) return;
    try {
        const id = await library.addShow(name, exportDatabase(path), {
            backedUp,
        });
        await library.setOpen(id);
        openId = id;
        savedCopy = { path, changes: changeState(path)?.changes ?? 0 };
        reportStatus({ state: "saved", at: Date.now() });
        reportLibrary();
    } catch (error) {
        console.error("Couldn't store the show; keeping it in memory:", error);
        storageEnabled = false;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = null;
        // So the reload doesn't reopen the previous show instead
        await library.setOpen(null).catch(() => {});
        // The title bar says "Not saved" from now on, not the last "Saved"
        reportStatus(describeSaveError(error));
        post({ type: "emit", channel: WEB_EVENTS.storageLost, args: [] });
    }
}

function scheduleSave(minimumWait = 0) {
    if (!storageEnabled || saveTimer || !openId) return;
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

/**
 * Makes sure the open show's latest changes are in the library before it is
 * closed or replaced: saves now (cancelling a pending timed save), or throws
 * if that isn't possible, so the caller can refuse rather than lose them.
 */
async function ensureSaved(): Promise<void> {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    const path = DatabaseServices.getDbPath();
    if (!storageEnabled || !library || !openId || !path) return;
    const state = changeState(path);
    if (!state) return;
    const isSaved = () =>
        savedCopy?.path === path && savedCopy.changes === state.changes;
    if (isSaved()) return;
    if (!state.idle)
        throw new Error(
            "The show is in the middle of a change. Try again in a moment.",
        );
    await saveCopy();
    if (!isSaved()) throw new Error("The latest changes couldn't be saved.");
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
        // The draft takes the open show's place: store its changes first.
        await ensureSaved();
        if (openId) {
            openId = null;
            savedCopy = null;
        }
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
                await storeNewShow(projectName, false);
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

/** Closes the show in memory; nothing is removed from the library. */
function closeOpenShow() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    DatabaseServices.closePersistentConnection();
    DatabaseServices.setDbPath("", false);
    removeOtherShows();
    draftPath = null;
    savedCopy = null;
    downloadedChanges = null;
    openId = null;
    lastStatus = null;
}

function requireLibrary(): Library {
    if (!library) throw new Error("This tab doesn't keep shows in the browser");
    return library;
}

/** The library's channels: list, open, rename, copy, delete, back up, restore. */
// eslint-disable-next-line max-lines-per-function
function registerLibraryHandlers() {
    ipcMain.handle(WEB_CHANNELS.library, () => libraryState());
    ipcMain.handle(WEB_CHANNELS.openStored, async (_, id: string) => {
        const lib = requireLibrary();
        if (!lib.current.shows.some((show) => show.id === id)) return 404;
        // Store the open show's changes and switch the library over before
        // closing it: if either fails, it stays open and the error shows.
        const switching = !!openId && openId !== id;
        if (switching) await ensureSaved();
        await lib.setOpen(id);
        if (switching) closeOpenShow();
        return 200;
    });
    ipcMain.handle(
        WEB_CHANNELS.renameShow,
        async (_, id: string, name: string) => {
            await requireLibrary().rename(id, name);
            reportLibrary();
        },
    );
    ipcMain.handle(
        WEB_CHANNELS.duplicateShow,
        async (_, id: string, copyName: string) => {
            // Copy the latest changes, not what was stored before them
            if (id === openId) await ensureSaved();
            const newId = await requireLibrary().duplicate(id, () => copyName);
            reportLibrary();
            return newId;
        },
    );
    ipcMain.handle(WEB_CHANNELS.deleteShow, async (_, id: string) => {
        if (id === openId) closeOpenShow();
        await requireLibrary().remove(id);
        reportLibrary();
    });
    ipcMain.handle(WEB_CHANNELS.exportStored, async (_, id: string) => {
        const lib = requireLibrary();
        const entry = lib.current.shows.find((show) => show.id === id);
        if (!entry) throw new Error(`No show ${id}`);
        const path = DatabaseServices.getDbPath();
        const bytes =
            id === openId && path
                ? exportDatabase(path)
                : await lib.readShow(id);
        return { name: `${cleanName(entry.name)}.dots`, bytes };
    });
    ipcMain.handle(WEB_CHANNELS.recordBackup, async (_, id: string) => {
        await requireLibrary().recordBackup(id);
        if (id === openId) markDownloaded();
        reportLibrary();
    });
    ipcMain.handle(
        WEB_CHANNELS.restoreVersion,
        async (_, id: string, versionId: string) => {
            const lib = requireLibrary();
            const wasOpen = id === openId;
            // Store the latest edits first (they become a version too), and
            // close the show only once the restore is written: if anything
            // fails, it stays open as it was and the error shows.
            if (wasOpen) await ensureSaved();
            await lib.restoreVersion(id, versionId);
            if (wasOpen) closeOpenShow();
            reportLibrary();
            return wasOpen;
        },
    );
}

/** The web build's own channels: one show, in from and out to the page. */
// eslint-disable-next-line max-lines-per-function
function registerWebHandlers() {
    ipcMain.handle(
        WEB_CHANNELS.openShow,
        async (
            _,
            bytes: Uint8Array,
            name: string,
            force = false,
            backedUp = false,
        ) => {
            // The file takes the open show's place: store its changes first,
            // or refuse (unless the person chose to go on without them).
            try {
                await ensureSaved();
            } catch (error) {
                if (!force) throw error;
                console.warn("Replacing the show without its changes:", error);
            }
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
                // Backed up only if it came from a file the person picked
                // (that file is their copy); a show handed across a reload
                // says whether it was.
                await storeNewShow(name, backedUp);
                markDownloaded();
            }
            return status;
        },
    );
    ipcMain.handle(WEB_CHANNELS.closeShow, async (_, force = false) => {
        // The show stays in the library, with its latest changes. Without
        // them (or if the library can't be told), it stays open, unless the
        // person chose to close anyway.
        try {
            await ensureSaved();
            if (library && !library.readOnly) await library.setOpen(null);
        } catch (error) {
            if (!force) throw error;
            console.warn("Closing the show without its changes:", error);
        }
        closeOpenShow();
        reportLibrary();
    });
    ipcMain.handle(WEB_CHANNELS.flush, async () => {
        if (!storageEnabled) return { safe: false, memoryOnly: true };
        try {
            await ensureSaved();
            return { safe: true };
        } catch (error) {
            return {
                safe: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    });
    registerLibraryHandlers();
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

/**
 * Tells the page as soon as the open show has changes that aren't stored
 * yet, before the save's short delay runs out, so leaving the page warns.
 */
function reportPending() {
    const path = DatabaseServices.getDbPath();
    if (!storageEnabled || !openId || !path) return;
    const state = changeState(path);
    if (state && hasUnsavedChanges(savedCopy, path, state.changes))
        reportStatus({ state: "saving" });
}

async function handle(message: ToWorker) {
    if (message.type === "send") {
        const listener = ipcListeners.get(message.channel);
        // Electron drops a message no one listens for; so does this.
        if (typeof listener === "function") listener({}, ...message.args);
        reportPending();
        scheduleSave();
        reportChanges();
        return;
    }
    const handler = ipcHandlers.get(message.channel);
    try {
        if (!handler)
            throw new Error(`No handler registered for '${message.channel}'`);
        const value = await handler({}, ...message.args);
        // Before the answer, so the page knows before it moves on
        reportPending();
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
    if (storage.storage === "opfs") {
        try {
            library = await Library.open(storage.dir);
            // A newer build's library: kept as it is, and this tab works in
            // memory only.
            storageEnabled = !library.readOnly;
        } catch (error) {
            console.error("Couldn't open the show library:", error);
        }
    }
    registerHandlers();
    if (storageEnabled) await restoreShow();
    scope.addEventListener("message", (event: MessageEvent<ToWorker>) => {
        serially(() => handle(event.data)).catch((error) =>
            console.error("Couldn't handle a message from the page:", error),
        );
    });
    post({
        type: "ready",
        status: storageEnabled
            ? { storage: "opfs" }
            : {
                  storage: "memory",
                  storageProblem:
                      storage.storage === "memory"
                          ? storage.problem
                          : library?.readOnly
                            ? "newer-format"
                            : "unsupported",
              },
    });
}

start().catch((error) => {
    console.error(error);
    post({
        type: "fatal",
        message: error instanceof Error ? error.message : String(error),
    });
});

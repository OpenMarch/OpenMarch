/* eslint-disable no-console */
/**
 * TEMPORARY (see README.md). The web build's main process: the part of
 * `electron/main` a show needs, running in the page.
 *
 * The database handlers (`sql:proxy`, `unsafeSql:proxy`, `audio:*`) are the
 * app's own, registered by `DatabaseServices.initHandlers()` against the
 * `ipcMain` stand-in in `shims/electron.ts`. Like the browser e2e harness
 * (`e2e/browser/host`), the few handlers that live in `electron/main/index.ts`
 * are restated here, and anything else rejects the way Electron does for an
 * unregistered channel.
 */
import * as DatabaseServices from "@om-electron/database/database.services";
import { getOrm } from "@om-electron/database/db";
import { DrizzleMigrationService } from "@om-electron/database/services/DrizzleMigrationService";
import { applyFileVersionDecision } from "@om-electron/database/fileVersion";
import { initializeNewFileAsTimeline } from "@om-electron/database/convertOnOpenGate";
import {
    checkConvertOnOpen,
    convertFileOnOpen,
} from "@om-electron/database/convertOnOpen";
import { ipcMain } from "./shims/electron";
import { MIGRATIONS_FOLDER } from "./shims/fs";
import { deleteDatabase, exportDatabase, writeDatabase } from "./shims/sqlite";

/**
 * Where the open show lives in the in-memory file system. The app shows the
 * file name in its title bar, so the path carries the show's name.
 */
let SHOW_PATH = "/show.dots";

const SETTINGS_KEY = "om-web:settings";

export interface WebHostCallbacks {
    /** The app asked to open, create or close a file: go back to the start screen. */
    onLeaveShow: () => void;
}

function loadSettings(): Map<string, unknown> {
    try {
        const saved = localStorage.getItem(SETTINGS_KEY);
        if (saved) return new Map(Object.entries(JSON.parse(saved)));
    } catch {
        // Private windows and blocked storage: settings last for the page only.
    }
    return new Map();
}

const settings = loadSettings();
// Test builds send no analytics, so don't ask.
settings.set("optOutAnalytics", true);

function saveSettings() {
    try {
        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(Object.fromEntries(settings)),
        );
    } catch {
        // See loadSettings.
    }
}

/** Asks the person for one file, like the app's native open dialog. */
function pickFile(accept: string): Promise<File | null> {
    return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.addEventListener("change", () =>
            resolve(input.files?.[0] ?? null),
        );
        input.addEventListener("cancel", () => resolve(null));
        input.click();
    });
}

let registered = false;

export function registerHandlers({ onLeaveShow }: WebHostCallbacks) {
    if (registered) return;
    registered = true;

    DatabaseServices.initHandlers();

    // Restated from electron/main/index.ts.
    ipcMain.handle("database:isReady", () =>
        DatabaseServices.databaseIsReady(),
    );
    ipcMain.handle("database:getPath", () => DatabaseServices.getDbPath());
    ipcMain.handle("get-current-filename", () => DatabaseServices.getDbPath());
    ipcMain.handle(
        "file:exists",
        (_, filePath: string) => filePath === SHOW_PATH,
    );
    ipcMain.handle("settings:get", (_, key: string) => settings.get(key));
    ipcMain.on("settings:set", (_, values: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(values))
            settings.set(key, value);
        saveSettings();
    });
    ipcMain.handle("get-theme", () => settings.get("theme") ?? "dark");
    ipcMain.handle("set-theme", (_, theme) => {
        settings.set("theme", theme);
        saveSettings();
    });
    ipcMain.handle("get-language", () => settings.get("language") ?? "en");
    ipcMain.handle("set-language", (_, language) => {
        settings.set("language", language);
        saveSettings();
    });
    ipcMain.handle("env:get", () => ({
        isCodegen: false,
        isCI: false,
        isPlaywrightSession: false,
    }));
    ipcMain.handle("log:print", (_, level: string, ...rest: unknown[]) => {
        if (level === "error" || level === "warn")
            console[level]("[Renderer]", ...rest);
    });
    ipcMain.handle("recent-files:get", () => []);
    ipcMain.handle("newShow:getPending", () => false);
    ipcMain.handle("newShow:getDraftPath", () => null);
    ipcMain.handle("plugins:list", () => []);
    ipcMain.handle("auth:get-state", () => ({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        error: null,
    }));
    ipcMain.handle("auth:get-access-token", () => ({ token: null }));
    ipcMain.handle("shell:openExternal", (_, url: string) => {
        window.open(url, "_blank", "noopener");
    });

    registerFileHandlers(onLeaveShow);
}

/** Opening, saving and closing files, and adding music, without native dialogs. */
function registerFileHandlers(onLeaveShow: () => void) {
    // Opening, creating and closing files go through the start screen.
    for (const channel of [
        "database:load",
        "database:create",
        "closeCurrentFile",
    ])
        ipcMain.handle(channel, () => {
            onLeaveShow();
            return 200;
        });
    ipcMain.handle("database:save", () => {
        downloadShow();
        return 200;
    });

    // Restated from insertAudioFile in electron/main/index.ts, with a file
    // input in place of the native dialog.
    ipcMain.handle("audio:insert", async () => {
        const file = await pickFile("audio/*,.mp3,.wav,.ogg,.m4a,.flac");
        if (!file)
            return new DatabaseServices.LegacyDatabaseResponse(
                false,
                undefined,
                new Error(
                    "insertAudioFile: Operation was cancelled or no audio file was provided",
                ),
            );
        return DatabaseServices.insertAudioFile({
            data: await file.arrayBuffer(),
            path: file.name,
            nickname: file.name,
            selected: true,
        });
    });
}

/**
 * Runs `run` with a stand-in `window.electron` that sends raw SQL to `db`.
 * Code shared with the renderer (`createUndoTriggers`) decides it is in the
 * main process when there is no `window`; here there always is, so while
 * the open converts, its raw SQL goes to the open's connection, as it would
 * in the main process.
 */
async function withMainProcessBridge<T>(
    db: ReturnType<typeof DatabaseServices.connect>,
    run: () => Promise<T>,
): Promise<T> {
    const target = window as unknown as { electron?: unknown };
    const previous = target.electron;
    target.electron = {
        unsafeSqlProxy: async (sql: string) => db.exec(sql),
    };
    try {
        return await run();
    } finally {
        target.electron = previous;
    }
}

export type OpenResult =
    | { ok: true; converted: boolean }
    | { ok: false; message: string };

/**
 * Opens `bytes` as the show, or a new show when `bytes` is null, the way
 * `openShowDatabase` in `electron/main/openShow.ts` does with convert on open
 * turned on: check the version, migrate, then either set up the new file as a
 * timeline file or convert a page-era file to timelines. There is no backup
 * step, since the show only lives in this page.
 */
export async function openShow(bytes: Uint8Array | null): Promise<OpenResult> {
    const isNewFile = bytes === null;
    DatabaseServices.closePersistentConnection();
    // A new show starts as an empty file, which the open fills in.
    if (bytes) writeDatabase(SHOW_PATH, bytes);
    else deleteDatabase(SHOW_PATH);

    const status = DatabaseServices.setDbPath(SHOW_PATH, isNewFile);
    if (status === 426)
        return {
            ok: false,
            message:
                "This show was saved by a newer version of OpenMarch than this test build.",
        };
    if (status !== 200)
        return {
            ok: false,
            message: `This file couldn't be opened (code ${status}).`,
        };

    const db = DatabaseServices.connect();
    try {
        const orm = getOrm(db);
        const migrator = new DrizzleMigrationService(orm, db);
        applyFileVersionDecision(db, isNewFile);
        await migrator.applyPendingMigrations(MIGRATIONS_FOLDER);

        if (isNewFile) {
            await DrizzleMigrationService.initializeDatabase(orm, db);
            initializeNewFileAsTimeline(db);
            return { ok: true, converted: false };
        }

        if (checkConvertOnOpen(db, SHOW_PATH).action !== "convert")
            return { ok: true, converted: false };
        const result = await withMainProcessBridge(db, () =>
            convertFileOnOpen(SHOW_PATH, db, {
                backup: () => ({ ok: true, backupPath: "" }) as never,
            }),
        );
        if (result.status === "conversion-failed") {
            console.error(result.error);
            return {
                ok: false,
                message: `This show couldn't be converted to timelines: ${result.error.message}`,
            };
        }
        return { ok: true, converted: result.status === "converted" };
    } catch (error) {
        console.error(error);
        DatabaseServices.setDbPath("", false);
        return {
            ok: false,
            message: error instanceof Error ? error.message : String(error),
        };
    } finally {
        db.close();
    }
}

let showName = "show";

/** Names the show about to open; call before `openShow`. */
export function setShowName(name: string) {
    showName = name.replace(/\.dots$/i, "").replace(/[/\\]/g, "-") || "show";
    SHOW_PATH = `/${showName}.dots`;
}

/** Saves the open show to the person's computer as a `.dots` file. */
export function downloadShow() {
    const bytes = exportDatabase(SHOW_PATH);
    const url = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: "application/octet-stream" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${showName}.dots`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

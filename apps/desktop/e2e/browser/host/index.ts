/* eslint-disable no-console */
/**
 * The Node side of the browser end-to-end harness: the part of the Electron
 * main process a show needs, without Electron.
 *
 * The database handlers (`sql:proxy`, `unsafeSql:proxy`, `audio:*`) are the
 * app's own, registered by `DatabaseServices.initHandlers()` against the
 * `ipcMain` stand-in. The handlers that live in `electron/main/index.ts`
 * can't be imported (that module starts the app), so the few the renderer
 * calls with a show open are restated here over an in-memory settings store.
 * Anything else rejects the way Electron does for an unregistered channel, so
 * a test that needs real Electron fails loudly instead of passing on a fake.
 */
import fs from "node:fs";
import path from "node:path";
import * as DatabaseServices from "@om-electron/database/database.services";
import { getOrm } from "@om-electron/database/db";
import { DrizzleMigrationService } from "@om-electron/database/services/DrizzleMigrationService";
import { GPU_CRASHED_CHANNEL } from "@om-electron/main/gpu";
import { ipcHandlers, ipcListeners, ipcMain } from "./electron";

export type ShowHost = {
    /** Runs the handler for an `ipcRenderer.invoke` channel. */
    invoke: (channel: string, args: unknown[]) => Promise<unknown>;
    /** Delivers an `ipcRenderer.send` message. Unknown channels are dropped, as in Electron. */
    send: (channel: string, args: unknown[]) => void;
    /** Releases the database file. */
    close: () => void;
};

let handlersRegistered = false;
const settings = new Map<string, unknown>();
/** Where the open show's video export is written: the save dialog's answer. */
let videoExportPath: string | null = null;
let videoSessionCount = 0;
const videoSessions = new Map<
    string,
    { file: fs.promises.FileHandle; path: string }
>();

/** Chunk bytes as they arrive over the exposed function: a typed array, or its plain-object form. */
const chunkBytes = (data: unknown): Uint8Array =>
    data instanceof Uint8Array
        ? data
        : Uint8Array.from(Object.values(data as Record<string, number>));

function registerHandlers() {
    if (handlersRegistered) return;
    handlersRegistered = true;

    DatabaseServices.initHandlers();

    // Restated from electron/main/index.ts.
    ipcMain.handle("database:isReady", () =>
        DatabaseServices.databaseIsReady(),
    );
    ipcMain.handle("database:getPath", () => DatabaseServices.getDbPath());
    ipcMain.handle("get-current-filename", () => DatabaseServices.getDbPath());
    ipcMain.handle("file:exists", (_, filePath: string) => {
        if (!filePath) return false;
        return fs.existsSync(
            filePath.endsWith(".dots") ? filePath : `${filePath}.dots`,
        );
    });
    ipcMain.handle("settings:get", (_, key: string) => settings.get(key));
    ipcMain.on("settings:set", (_, values: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(values))
            settings.set(key, value);
    });
    ipcMain.handle("get-theme", () => settings.get("theme") ?? "light");
    ipcMain.handle(
        "set-theme",
        (_, theme) => void settings.set("theme", theme),
    );
    ipcMain.handle("get-language", () => settings.get("language") ?? "en");
    ipcMain.handle(
        "set-language",
        (_, language) => void settings.set("language", language),
    );
    ipcMain.handle("env:get", () => ({
        isCodegen: false,
        isCI: !!process.env.CI,
        isPlaywrightSession: true,
    }));
    ipcMain.handle("log:print", (_, level: string, ...rest: unknown[]) => {
        if (level === "error" || level === "warn")
            console[level]("[Renderer]", ...rest);
    });
    ipcMain.handle("recent-files:get", () => []);
    ipcMain.handle("newShow:getPending", () => false);
    ipcMain.handle("newShow:getDraftPath", () => null);
    ipcMain.handle("conversion:getPending", () => null);
    ipcMain.handle("load-file:takeRefusal", () => null);
    ipcMain.handle("plugins:list", () => []);
    // A headless browser has no GPU process of the app's to crash
    ipcMain.handle(GPU_CRASHED_CHANNEL, () => false);
    ipcMain.handle("auth:get-state", () => ({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        error: null,
    }));
    ipcMain.handle("auth:get-access-token", () => ({ token: null }));
    registerVideoExportHandlers();
    registerDrillChartExportHandlers();
}

/**
 * The drill chart export's two calls, writing each chart's SVG pages (the
 * PDF's input) beside the video export's file, in `exported-drill-charts/`:
 * `<drill number or MAIN>-<page index>.svg`. No PDF is made.
 */
function registerDrillChartExportHandlers() {
    ipcMain.handle("export:createExportDirectory", async () => {
        if (!videoExportPath) throw new Error("No test output folder");
        const exportDir = path.join(
            path.dirname(videoExportPath),
            "exported-drill-charts",
        );
        await fs.promises.mkdir(exportDir, { recursive: true });
        return { exportName: "show", exportDir };
    });
    ipcMain.handle(
        "export:generateDocForMarcher",
        async (
            _,
            args: {
                svgPages: string[];
                drillNumber: string;
                exportDir: string;
            },
        ) => {
            for (const [i, svg] of args.svgPages.entries())
                await fs.promises.writeFile(
                    path.join(
                        args.exportDir,
                        `${args.drillNumber}-${String(i).padStart(2, "0")}.svg`,
                    ),
                    svg,
                );
            return { success: true };
        },
    );
}

/** Restated from `VideoExportService`, with the test's file for the save dialog's answer. */
function registerVideoExportHandlers() {
    ipcMain.handle("export:videoStart", async () => {
        if (!videoExportPath) return null;
        const sessionId = String(++videoSessionCount);
        const file = await fs.promises.open(videoExportPath, "w");
        videoSessions.set(sessionId, { file, path: videoExportPath });
        return { sessionId, filePath: videoExportPath };
    });
    ipcMain.handle(
        "export:videoChunk",
        async (_, sessionId: string, data: unknown, position: number) => {
            const session = videoSessions.get(sessionId);
            if (!session)
                throw new Error("Invalid or expired video export session");
            const bytes = chunkBytes(data);
            await session.file.write(bytes, 0, bytes.byteLength, position);
        },
    );
    ipcMain.handle(
        "export:videoEnd",
        async (_, sessionId: string, success: boolean) => {
            const session = videoSessions.get(sessionId);
            if (!session)
                throw new Error("Invalid or expired video export session");
            videoSessions.delete(sessionId);
            await session.file.close();
            if (!success) await fs.promises.rm(session.path, { force: true });
            return success ? session.path : null;
        },
    );
}

/**
 * Opens a show the way `setActiveDb` in `electron/main/index.ts` does: check
 * the file, apply pending migrations, then serve it.
 *
 * One show at a time per process, like the app. Playwright gives each worker
 * its own process, so tests still run in parallel.
 */
export async function openShow(args: {
    databasePath: string;
    migrationsFolder: string;
    /** Settings the app would read from its store, e.g. `{ optOutAnalytics: true }`. */
    settings?: Record<string, unknown>;
    /** Where a video export is saved, as if picked in the save dialog. */
    videoExportPath?: string;
}): Promise<ShowHost> {
    registerHandlers();
    videoExportPath = args.videoExportPath ?? null;
    settings.clear();
    for (const [key, value] of Object.entries(args.settings ?? {}))
        settings.set(key, value);

    const resCode = DatabaseServices.setDbPath(args.databasePath);
    if (resCode !== 200)
        throw new Error(
            `Could not open ${args.databasePath} [code=${resCode}]`,
        );

    const db = DatabaseServices.connect();
    try {
        const migrator = new DrizzleMigrationService(getOrm(db), db);
        await migrator.applyPendingMigrations(args.migrationsFolder);
    } finally {
        db.close();
    }

    return {
        async invoke(channel, callArgs) {
            const handler = ipcHandlers.get(channel);
            if (!handler)
                throw new Error(`No handler registered for '${channel}'`);
            return await handler({}, ...callArgs);
        },
        send(channel, callArgs) {
            ipcListeners.get(channel)?.({}, ...callArgs);
        },
        close() {
            DatabaseServices.closePersistentConnection();
        },
    };
}

export { fieldGrid, savedPositions } from "./positions";

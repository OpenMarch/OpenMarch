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
import * as DatabaseServices from "@om-electron/database/database.services";
import { getOrm } from "@om-electron/database/db";
import { DrizzleMigrationService } from "@om-electron/database/services/DrizzleMigrationService";
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
    ipcMain.handle("plugins:list", () => []);
    ipcMain.handle("auth:get-state", () => ({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        error: null,
    }));
    ipcMain.handle("auth:get-access-token", () => ({ token: null }));
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
}): Promise<ShowHost> {
    registerHandlers();
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

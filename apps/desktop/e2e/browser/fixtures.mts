import {
    test as base,
    expect,
    _electron as electron,
    type Browser,
    type Page,
} from "@playwright/test";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { waitForField, waitForSettledField } from "./app.mjs";

const desktopDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
);
const rendererDir = path.join(desktopDir, "dist-browser");
const hostBundle = path.join(desktopDir, "dist-browser-host/index.mjs");
const electronMain = path.join(desktopDir, "dist-electron/main/index.js");
const migrationsFolder = path.join(desktopDir, "electron/database/migrations");
const blankShow = path.join(migrationsFolder, "_blank.dots");

/** The renderer is served from disk under this origin; nothing listens on it. */
const APP_ORIGIN = "https://app.openmarch.test";
const VIEWPORT = { width: 1600, height: 1000 };

const requireBuilt = (file: string, script: string) => {
    if (!fs.existsSync(file))
        throw new Error(
            `${file} does not exist. Run 'pnpm run ${script}' first.`,
        );
};

/** Where the scenarios run. Set per Playwright project. */
export type Target = "browser" | "electron";

/** `UI_SETTINGS_STORAGE_KEY` in `src/stores/UiSettingsStore.ts`. */
const UI_SETTINGS_STORAGE_KEY = "openmarch:uiSettings";
/** `QUALITY_NOTICE_STORAGE_KEY`: the field's low-quality explanations already shown. */
const QUALITY_NOTICE_KEY = "openmarch:field:qualityNoticeSeen";

/** What the app finds in `localStorage` when it starts. */
const startupStorage = (qualityNotice: boolean): Record<string, string> =>
    // Machines here draw WebGL in software: the field would explain its
    // low-quality mode once, in a toast over the app, in every test
    qualityNotice ? {} : { [QUALITY_NOTICE_KEY]: '["software"]' };

type Query = <T = Record<string, unknown>>(
    sql: string,
    ...params: SQLInputValue[]
) => Promise<T[]>;

type App = {
    page: Page;
    query: Query;
    /** Writes one committed state of the show file to `file`, in one step. */
    copyTo: (file: string) => Promise<void>;
    close: () => Promise<void>;
    /** Main-process output, for diagnosing a failure. Electron only. */
    log?: () => string;
    /** Kills the app's GPU process, as a driver crash would. Electron only. */
    killGpuProcess?: () => Promise<void>;
};

/**
 * The renderer in headless Chromium, with IPC carried to the app's database
 * handlers in this process (`host/index.ts`).
 */
async function openInBrowser(
    browser: Browser,
    databasePath: string,
    appSettings: Record<string, unknown>,
    storage: Record<string, string>,
    initScript: string | null,
    videoExportPath: string,
): Promise<App> {
    const { openShow } = (await import(pathToFileURL(hostBundle).href)) as {
        openShow: typeof import("./host/index").openShow;
    };
    const host = await openShow({
        databasePath,
        migrationsFolder,
        settings: appSettings,
        videoExportPath,
    });
    const context = await browser.newContext({ viewport: VIEWPORT });
    await context.addInitScript((storage) => {
        for (const [key, value] of Object.entries(storage))
            localStorage.setItem(key, value);
    }, storage);
    if (initScript) await context.addInitScript(initScript);
    const page = await context.newPage();

    await page.exposeFunction(
        "__omIpcInvoke",
        async (channel: string, args: unknown[]) => {
            try {
                return { ok: true, value: await host.invoke(channel, args) };
            } catch (error) {
                return { ok: false, error: String(error) };
            }
        },
    );
    await page.exposeFunction(
        "__omIpcSend",
        (channel: string, args: unknown[]) => host.send(channel, args),
    );

    // Serve the built renderer from disk and block everything else, so a
    // test never depends on the network or on a free port.
    await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.protocol === "data:" || url.protocol === "blob:")
            return route.fallback();
        if (url.origin !== APP_ORIGIN) return route.abort();
        const file = path.join(
            rendererDir,
            url.pathname === "/" ? "index.html" : url.pathname,
        );
        if (!file.startsWith(rendererDir) || !fs.existsSync(file))
            return route.fulfill({ status: 404, body: "Not found" });
        return route.fulfill({ path: file });
    });

    await page.goto(APP_ORIGIN);
    const reader = new DatabaseSync(databasePath, { readOnly: true });
    return {
        page,
        query: async <T,>(sql: string, ...params: SQLInputValue[]) =>
            reader.prepare(sql).all(...params) as T[],
        // VACUUM INTO reads one snapshot, so it copies only committed data.
        copyTo: async (file: string) => {
            reader.prepare("VACUUM INTO ?").run(file);
        },
        close: async () => {
            reader.close();
            await context.close();
            host.close();
        },
    };
}

/**
 * The built Electron app. Each launch gets its own user-data folder, so its
 * settings and single-instance lock are private and tests can run in parallel.
 */
async function openInElectron(
    databasePath: string,
    appSettings: Record<string, unknown>,
    userDataDir: string,
    storage: Record<string, string>,
    videoExportPath: string,
): Promise<App> {
    // The app's settings store (electron-store) reads this file at startup.
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(
        path.join(userDataDir, "config.json"),
        JSON.stringify(appSettings),
    );

    const requireFromDesktop = createRequire(
        path.join(desktopDir, "package.json"),
    );
    const app = await electron.launch({
        executablePath: requireFromDesktop("electron") as string,
        args: [
            electronMain,
            databasePath,
            `--user-data-dir=${userDataDir}`,
            "--no-audio",
            "--disable-audio-output",
            "--disable-audio-input",
            // The field needs WebGL. A machine with no GPU (Xvfb in a
            // container) only has it through Chromium's software GL
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
        ],
        env: {
            ...process.env,
            NODE_ENV: "development",
            PLAYWRIGHT_SESSION: "true",
            // The video export's save dialog answers this file
            PLAYWRIGHT_VIDEO_EXPORT_PATH: videoExportPath,
        },
    });
    // Every load starts with the storage asked for. The window is already
    // loading by now, so the fixture reloads it once; the app saves its
    // settings while it starts, which would overwrite storage set later.
    // This runs on every load, so a scenario that changes a setting and then
    // reloads gets the fixture's storage back, not its own.
    await app.context().addInitScript((entries) => {
        for (const [key, value] of entries) localStorage.setItem(key, value);
    }, Object.entries(storage));
    const log: string[] = [];
    app.process().stdout?.on("data", (data) => log.push(String(data)));
    app.process().stderr?.on("data", (data) => log.push(String(data)));
    // No network, as in the browser target: the app's update check and
    // analytics would otherwise make results depend on outside services.
    await app.context().route(/^https?:/, (route) => route.abort());
    const page = await app.firstWindow();
    // Same size as the browser target, so both lay the app out alike.
    await app.evaluate(({ BrowserWindow }, size) => {
        BrowserWindow.getAllWindows()[0]?.setBounds({ x: 0, y: 0, ...size });
    }, VIEWPORT);
    return {
        page,
        // Read inside the main process: a second process reading the file
        // would hold locks the app's own writes don't wait for.
        query: <T,>(sql: string, ...params: SQLInputValue[]) =>
            app.evaluate(
                (_electron, [path, sql, params]) => {
                    const { DatabaseSync } = process.getBuiltinModule(
                        "node:sqlite",
                    ) as typeof import("node:sqlite");
                    const reader = new DatabaseSync(path, { readOnly: true });
                    try {
                        return reader.prepare(sql).all(...params);
                    } finally {
                        reader.close();
                    }
                },
                [databasePath, sql, params] as const,
            ) as Promise<T[]>,
        // VACUUM INTO reads one snapshot, so it copies only committed data.
        // The app's COMMIT runs synchronously in this process, so the copy
        // can't land partway through one.
        copyTo: async (file: string) => {
            await app.evaluate(
                (_electron, [path, file]) => {
                    const { DatabaseSync } = process.getBuiltinModule(
                        "node:sqlite",
                    ) as typeof import("node:sqlite");
                    const reader = new DatabaseSync(path, { readOnly: true });
                    try {
                        reader.prepare("VACUUM INTO ?").run(file);
                    } finally {
                        reader.close();
                    }
                },
                [databasePath, file] as const,
            );
        },
        close: () => app.close(),
        log: () => log.join(""),
        killGpuProcess: async () => {
            const pid = await app.evaluate(
                ({ app }) =>
                    app.getAppMetrics().find((p) => p.type === "GPU")?.pid,
            );
            if (!pid) throw new Error("The app has no GPU process");
            process.kill(pid, "SIGKILL");
        },
    };
}

export type Show = {
    /** The app, loaded with the show open and the canvas ready. */
    page: Page;
    /** The test's own copy of the show file. */
    databasePath: string;
    /**
     * Reads the show file, for asserting on what was saved. Each call is its
     * own read: an edit the app commits between two calls shows in the second.
     */
    query: Query;
    /**
     * Runs `read` against one committed state of the show file, for reads of
     * several statements that must agree with each other (#212).
     */
    readSnapshot: <T>(read: (query: Query) => Promise<T>) => Promise<T>;
    /** Errors the page has logged or thrown so far. */
    pageErrors: string[];
    /** Kills the app's GPU process, as a driver crash would. Electron only. */
    killGpuProcess?: () => Promise<void>;
    /** Where a video export is saved: the save dialog picks this file. */
    videoExportPath: string;
};

type Fixtures = {
    /**
     * Settings the app reads from its store at startup. The default answers
     * the analytics prompt so it doesn't cover the app.
     */
    appSettings: Record<string, unknown>;
    /**
     * SQL run on the show file before the app loads it, for tests that start
     * from an existing show instead of building one through the UI.
     */
    seedSql: string[];
    /** A show file to start from instead of the blank show; it's copied first. */
    showFile: string | undefined;
    /** Messages matching any of these don't fail the test. */
    allowedPageErrors: RegExp[];
    /**
     * The renderer's UI settings (`openmarch:uiSettings` in its local
     * storage), merged over the defaults when the app starts. Unset keeps the
     * defaults.
     */
    uiSettings: Record<string, unknown> | undefined;
    /**
     * Whether the field may explain its low-quality mode (#205). Off by
     * default, as if already explained, so the toast covers nothing.
     */
    fieldQualityNotice: boolean;
    /**
     * A script run in the page before the app, on every load. Browser target
     * only, e.g. to take WebGL away.
     */
    initScript: string | null;
    show: Show;
};

/** `Show.readSnapshot`: each read copies the file to `outputPath` and reads the copy. */
function snapshotReader(
    app: App,
    outputPath: (name: string) => string,
): Show["readSnapshot"] {
    let snapshots = 0;
    return async (read) => {
        const file = outputPath(`snapshot-${++snapshots}.db`);
        let reader: DatabaseSync | undefined;
        try {
            await app.copyTo(file);
            reader = new DatabaseSync(file, { readOnly: true });
            const opened = reader;
            return await read(
                async <R,>(sql: string, ...params: SQLInputValue[]) =>
                    opened.prepare(sql).all(...params) as R[],
            );
        } finally {
            reader?.close();
            fs.rmSync(file, { force: true });
        }
    };
}

type WorkerFixtures = {
    target: Target;
    /** One Chromium per worker for the browser target; unused for Electron. */
    chromium: Browser | undefined;
};

export const test = base.extend<Fixtures, WorkerFixtures>({
    target: ["browser", { option: true, scope: "worker" }],
    chromium: [
        async ({ target, playwright }, use) => {
            if (target !== "browser") return use(undefined);
            requireBuilt(path.join(rendererDir, "index.html"), "build:browser");
            requireBuilt(hostBundle, "build:browser");
            const browser = await playwright.chromium.launch();
            await use(browser);
            await browser.close();
        },
        { scope: "worker" },
    ],
    appSettings: [{ optOutAnalytics: true }, { option: true }],
    seedSql: [[], { option: true }],
    showFile: [undefined, { option: true }],
    allowedPageErrors: [[], { option: true }],
    uiSettings: [undefined, { option: true }],
    fieldQualityNotice: [false, { option: true }],
    initScript: [null, { option: true }],

    show: async (
        {
            target,
            chromium,
            appSettings,
            seedSql,
            showFile,
            allowedPageErrors,
            uiSettings,
            fieldQualityNotice,
            initScript,
        },
        use,
        testInfo,
    ) => {
        const databasePath = testInfo.outputPath("show.dots");
        // No extension: the app picks MP4 or WebM by what this machine can encode
        const videoExportPath = testInfo.outputPath("exported-video");
        fs.copyFileSync(showFile ?? blankShow, databasePath);
        if (seedSql.length > 0) {
            const writer = new DatabaseSync(databasePath);
            try {
                writer.exec("PRAGMA foreign_keys = ON");
                for (const statement of seedSql) writer.exec(statement);
            } finally {
                writer.close();
            }
        }

        // The renderer's local storage when the app starts
        const storage = startupStorage(fieldQualityNotice);
        if (uiSettings)
            storage[UI_SETTINGS_STORAGE_KEY] = JSON.stringify(uiSettings);
        let app: App;
        if (target === "electron") {
            if (initScript)
                throw new Error("initScript only runs in the browser target");
            requireBuilt(electronMain, "build");
            app = await openInElectron(
                databasePath,
                appSettings,
                testInfo.outputPath("user-data"),
                storage,
                videoExportPath,
            );
        } else {
            app = await openInBrowser(
                chromium!,
                databasePath,
                appSettings,
                storage,
                initScript,
                videoExportPath,
            );
        }
        const { page } = app;
        if (target === "electron") {
            // The window was already loading when the storage was set up
            // (`openInElectron`): load it again with it. Settings always
            // reload: the app saves its own while it starts.
            await page.waitForLoadState("domcontentloaded");
            const changed = await page.evaluate((storage) => {
                let changed = false;
                for (const [key, value] of Object.entries(storage)) {
                    if (localStorage.getItem(key) === value) continue;
                    localStorage.setItem(key, value);
                    changed = true;
                }
                return changed;
            }, storage);
            if (changed || uiSettings) await page.reload();
        }

        const pageErrors: string[] = [];
        // Closing the app is not part of a scenario; Electron's close flow
        // logs errors of its own for some shows.
        let closing = false;
        page.on("pageerror", (error) => pageErrors.push(String(error)));
        page.on("console", (message) => {
            if (message.type() !== "error" || closing) return;
            // Chromium's own report of a request the browser target blocked.
            if (message.text() === "Failed to load resource: net::ERR_FAILED")
                return;
            pageErrors.push(message.text());
        });

        let failed = false;
        try {
            // Allow for several apps starting at once on a busy machine.
            // The field's canvas, or its explanation of why it has none
            await expect(
                page
                    .locator("canvas")
                    .or(page.getByTestId("fieldUnavailable"))
                    .first(),
            ).toBeVisible({ timeout: 20_000 });
            await waitForField(page);
            await expect(page.getByTestId("threeField")).toHaveCount(1);
            // Every scenario starts from the view the show settles at
            await waitForSettledField(page);
            await use({
                page,
                databasePath,
                pageErrors,
                query: app.query,
                readSnapshot: snapshotReader(app, (name) =>
                    testInfo.outputPath(name),
                ),
                killGpuProcess: app.killGpuProcess,
                videoExportPath,
            });
        } catch (error) {
            failed = true;
            throw error;
        } finally {
            failed ||= testInfo.status !== testInfo.expectedStatus;
            if (failed) {
                if (app.log)
                    await testInfo.attach("main-process.log", {
                        body: app.log(),
                        contentType: "text/plain",
                    });
                await page
                    .screenshot({ path: testInfo.outputPath("failure.png") })
                    .catch(() => {});
            }
            closing = true;
            await app.close();
        }

        const unexpected = pageErrors.filter(
            (message) =>
                !allowedPageErrors.some((allowed) => allowed.test(message)),
        );
        expect(unexpected, "The page logged or threw errors").toEqual([]);
    },
});

export { expect };

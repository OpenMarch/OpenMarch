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

type Query = <T = Record<string, unknown>>(
    sql: string,
    ...params: SQLInputValue[]
) => Promise<T[]>;

type App = { page: Page; query: Query; close: () => Promise<void> };

/**
 * The renderer in headless Chromium, with IPC carried to the app's database
 * handlers in this process (`host/index.ts`).
 */
async function openInBrowser(
    browser: Browser,
    databasePath: string,
    appSettings: Record<string, unknown>,
): Promise<App> {
    const { openShow } = (await import(pathToFileURL(hostBundle).href)) as {
        openShow: typeof import("./host/index").openShow;
    };
    const host = await openShow({
        databasePath,
        migrationsFolder,
        settings: appSettings,
    });
    const context = await browser.newContext({ viewport: VIEWPORT });
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
        ],
        env: {
            ...process.env,
            NODE_ENV: "development",
            PLAYWRIGHT_SESSION: "true",
        },
    });
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
        close: () => app.close(),
    };
}

export type Show = {
    /** The app, loaded with the show open and the canvas ready. */
    page: Page;
    /** The test's own copy of the show file. */
    databasePath: string;
    /** Reads the show file, for asserting on what was saved. */
    query: Query;
    /** Errors the page has logged or thrown so far. */
    pageErrors: string[];
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
    /** Messages matching any of these don't fail the test. */
    allowedPageErrors: RegExp[];
    show: Show;
};

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
    allowedPageErrors: [[], { option: true }],

    show: async (
        { target, chromium, appSettings, seedSql, allowedPageErrors },
        use,
        testInfo,
    ) => {
        const databasePath = testInfo.outputPath("show.dots");
        fs.copyFileSync(blankShow, databasePath);
        if (seedSql.length > 0) {
            const writer = new DatabaseSync(databasePath);
            try {
                writer.exec("PRAGMA foreign_keys = ON");
                for (const statement of seedSql) writer.exec(statement);
            } finally {
                writer.close();
            }
        }

        let app: App;
        if (target === "electron") {
            requireBuilt(electronMain, "build");
            app = await openInElectron(
                databasePath,
                appSettings,
                testInfo.outputPath("user-data"),
            );
        } else {
            app = await openInBrowser(chromium!, databasePath, appSettings);
        }
        const { page } = app;

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

        try {
            await expect(page.locator("canvas").first()).toBeVisible();
            await page.waitForFunction(() => !!window.canvas);
            await use({ page, databasePath, pageErrors, query: app.query });
        } finally {
            if (testInfo.status !== testInfo.expectedStatus)
                await page
                    .screenshot({ path: testInfo.outputPath("failure.png") })
                    .catch(() => {});
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

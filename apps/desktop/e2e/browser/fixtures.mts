import { test as base, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { ShowHost } from "./host/index";

const desktopDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
);
const rendererDir = path.join(desktopDir, "dist-browser");
const hostBundle = path.join(desktopDir, "dist-browser-host/index.mjs");
const migrationsFolder = path.join(desktopDir, "electron/database/migrations");
const blankShow = path.join(migrationsFolder, "_blank.dots");

/** The renderer is served from disk under this origin; nothing listens on it. */
const APP_ORIGIN = "https://app.openmarch.test";

for (const required of [path.join(rendererDir, "index.html"), hostBundle]) {
    if (!fs.existsSync(required))
        throw new Error(
            `${required} does not exist. Run 'pnpm run build:browser' first.`,
        );
}

const { openShow } = (await import(pathToFileURL(hostBundle).href)) as {
    openShow: typeof import("./host/index").openShow;
};

export type Show = {
    /** The app, loaded with the show open and the canvas ready. */
    page: Page;
    /** The test's own copy of the show file. */
    databasePath: string;
    /** Reads the show file directly, for asserting on what was saved. */
    query: <T = Record<string, unknown>>(
        sql: string,
        ...params: SQLInputValue[]
    ) => T[];
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

export const test = base.extend<Fixtures>({
    appSettings: [{ optOutAnalytics: true }, { option: true }],
    seedSql: [[], { option: true }],
    allowedPageErrors: [[], { option: true }],

    show: async (
        { page, appSettings, seedSql, allowedPageErrors },
        use,
        testInfo,
    ) => {
        const databasePath = testInfo.outputPath("show.dots");
        fs.copyFileSync(blankShow, databasePath);

        const host: ShowHost = await openShow({
            databasePath,
            migrationsFolder,
            settings: appSettings,
        });

        if (seedSql.length > 0) {
            const writer = new DatabaseSync(databasePath);
            try {
                writer.exec("PRAGMA foreign_keys = ON");
                for (const statement of seedSql) writer.exec(statement);
            } finally {
                writer.close();
            }
        }

        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(String(error)));
        page.on("console", (message) => {
            if (message.type() !== "error") return;
            // Chromium's own report of a request this fixture blocked (below).
            if (message.text() === "Failed to load resource: net::ERR_FAILED")
                return;
            pageErrors.push(message.text());
        });

        await page.exposeFunction(
            "__omIpcInvoke",
            async (channel: string, args: unknown[]) => {
                try {
                    return {
                        ok: true,
                        value: await host.invoke(channel, args),
                    };
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
        await expect(page.locator("canvas").first()).toBeVisible();
        await page.waitForFunction(() => !!window.canvas);

        const reader = new DatabaseSync(databasePath, { readOnly: true });
        try {
            await use({
                page,
                databasePath,
                pageErrors,
                query: <T,>(sql: string, ...params: SQLInputValue[]) =>
                    reader.prepare(sql).all(...params) as T[],
            });
        } finally {
            reader.close();
            await page.close();
            host.close();
        }

        const unexpected = pageErrors.filter(
            (message) =>
                !allowedPageErrors.some((allowed) => allowed.test(message)),
        );
        expect(unexpected, "The page logged or threw errors").toEqual([]);
    },
});

export { expect };

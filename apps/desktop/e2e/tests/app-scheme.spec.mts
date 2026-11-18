// cspell:words Fpackage
/**
 * The built renderer on `app://openmarch` (fork #1011): each URL worker gets its own CSP from
 * the response headers, which `file://` never had, and settings kept under `file://` by an
 * older build carry over once.
 */
import { _electron as electron, type Page } from "@playwright/test";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "playwright/test";
import { test } from "../fixtures.mjs";

const desktopDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
);
const assets = fs.readdirSync(path.join(desktopDir, "dist/assets"));
const asset = (pattern: RegExp) => {
    const name = assets.find((file) => pattern.test(file));
    if (!name) throw new Error(`no built asset matches ${pattern}`);
    return `/assets/${name}`;
};

/** A response's status and headers, fetched from the page */
const head = (page: Page, url: string, range?: string) =>
    page.evaluate(
        async ([url, range]) => {
            const response = await fetch(url, {
                headers: range ? { Range: range } : {},
            });
            return {
                status: response.status,
                csp: response.headers.get("content-security-policy"),
                contentRange: response.headers.get("content-range"),
                bytes: (await response.arrayBuffer()).byteLength,
            };
        },
        [url, range] as const,
    );

test("serves the app from app://openmarch, each worker under its own CSP", async ({
    electronApp,
}) => {
    test.setTimeout(120_000);
    const { page } = electronApp;
    expect(page.url()).toBe("app://openmarch/index.html");

    // The model import worker: WebAssembly only, no network, no eval
    await page.waitForFunction(() => !!window.modelImportTest);
    const probe = await page.evaluate(() => window.modelImportTest!.probe());
    expect(probe.wasm).toBe("allowed");
    expect(probe.fetch).toMatch(/^refused/);
    expect(probe.evalFunction).toMatch(/^refused: EvalError/);

    expect((await head(page, asset(/^audioOffset\.worker-.*\.js$/))).csp).toBe(
        "default-src 'none'; script-src 'self'",
    );
    const index = await head(page, "/index.html");
    expect(index.csp).toContain("script-src 'self'");

    // Media seeks with byte ranges
    const video = await head(page, asset(/\.mp4$/), "bytes=0-99");
    expect(video).toMatchObject({ status: 206, bytes: 100 });
    expect(video.contentRange).toMatch(/^bytes 0-99\/\d+$/);

    // Nothing outside the app's files
    expect((await head(page, "/..%2F..%2Fpackage.json")).status).toBe(404);
});

// eslint-disable-next-line no-empty-pattern
test("carries settings kept under file:// over to app://openmarch once", async ({}, testInfo) => {
    test.setTimeout(120_000);
    const userData = path.join(testInfo.outputDir, "user-data");
    const launch = async () => {
        const app = await electron.launch({
            executablePath: createRequire(
                path.join(desktopDir, "package.json"),
            )("electron") as unknown as string,
            args: [
                path.join(desktopDir, "dist-electron/main/index.js"),
                ".",
                "--no-audio",
                `--user-data-dir=${userData}`,
            ],
            env: {
                ...process.env,
                NODE_ENV: "development",
                PLAYWRIGHT_SESSION: "true",
            },
        });
        // The move's hidden windows may open first
        await expect
            .poll(() => app.windows().map((w) => w.url()), {
                timeout: 30_000,
            })
            .toContain("app://openmarch/index.html");
        const editor = app
            .windows()
            .find((w) => w.url() === "app://openmarch/index.html")!;
        await editor.waitForLoadState("domcontentloaded");
        return { app, editor };
    };

    // An older build's storage, under file://; one key the new origin also has
    const first = await launch();
    await first.editor.evaluate(() => localStorage.setItem("e2e:both", "app"));
    await first.app.evaluate(async ({ app, BrowserWindow }) => {
        const fs = process.getBuiltinModule("node:fs");
        const page = process
            .getBuiltinModule("node:path")
            .join(app.getPath("temp"), `e2e-storage-${process.pid}.html`);
        fs.writeFileSync(page, "<!doctype html><title>e2e</title>");
        const window = new BrowserWindow({ show: false });
        await window.loadFile(page);
        await window.webContents.executeJavaScript(
            `localStorage.setItem("e2e:old", "file"); localStorage.setItem("e2e:both", "file")`,
        );
        window.destroy();
        fs.rmSync(page);
    });
    await first.app.close();

    // As if the profile came from a file:// build: the move hasn't run
    const config = path.join(userData, "config.json");
    const settings = JSON.parse(fs.readFileSync(config, "utf8"));
    expect(settings.rendererStorageMovedTo).toBe("app://openmarch");
    delete settings.rendererStorageMovedTo;
    fs.writeFileSync(config, JSON.stringify(settings));

    const second = await launch();
    expect(
        await second.editor.evaluate(() => ({
            old: localStorage.getItem("e2e:old"),
            both: localStorage.getItem("e2e:both"),
        })),
    ).toEqual({ old: "file", both: "app" });
    await second.app.close();
    expect(JSON.parse(fs.readFileSync(config, "utf8"))).toMatchObject({
        rendererStorageMovedTo: "app://openmarch",
    });
});

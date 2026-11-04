/* eslint-disable no-console */
/* eslint-disable no-empty-pattern */
import { test, expect, _electron as electron } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs-extra";

/**
 * Opening a page-era (version 7) show: the app asks before converting it
 * (`ConvertShowDialog`). Confirm writes a backup, `<name>.pre-conversion.dots`,
 * next to the show, converts the show to timelines and opens it. Cancel
 * leaves the file as it was and writes nothing. Asking about a file while a
 * show is open leaves that show open; opening another file forgets the question.
 *
 * `e2e/mock-databases/blank.dots` is a version-7 file from before the
 * timeline model, kept as that old file.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mainFile = path.resolve(__dirname, "../../dist-electron/main/index.js");
const pageEraShow = path.resolve(__dirname, "../mock-databases/blank.dots");
const electronExecutable = createRequire(
    path.join(__dirname, "../../package.json"),
)("electron") as string;

async function openOldShow(
    outputDir: string,
): Promise<{ app: ElectronApplication; page: Page; showPath: string }> {
    await fs.ensureDir(outputDir);
    const showPath = path.join(outputDir, "old-show.dots");
    await fs.copyFile(pageEraShow, showPath);
    const app = await electron.launch({
        executablePath: electronExecutable,
        args: [
            mainFile,
            showPath,
            "--no-audio",
            "--disable-audio-output",
            "--disable-audio-input",
            `--user-data-dir=${path.join(outputDir, "user-data")}`,
        ],
        env: {
            ...process.env,
            NODE_ENV: "development",
            PLAYWRIGHT_SESSION: "true",
        },
    });
    app.process().stdout?.on("data", (data) =>
        console.log("[MAIN STDOUT]", String(data).trim()),
    );
    app.process().stderr?.on("data", (data) =>
        console.log("[MAIN STDERR]", String(data).trim()),
    );
    return { app, page: await app.firstWindow(), showPath };
}

/** Reads a closed show file. */
function readShow(file: string) {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
        const tables = (
            db
                .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
                .all() as { name: string }[]
        )
            .map((row) => row.name)
            .sort();
        const { user_version } = db.prepare("PRAGMA user_version").get() as {
            user_version: number;
        };
        return { tables, version: user_version };
    } finally {
        db.close();
    }
}

test.beforeAll(() => {
    if (!fs.existsSync(mainFile))
        throw new Error(
            `${mainFile} does not exist. Run 'pnpm run build:electron' first.`,
        );
    expect(readShow(pageEraShow)).toEqual(
        expect.objectContaining({ version: 7 }),
    );
});

test("Confirm backs up an old show, converts it and opens it", async ({}, testInfo) => {
    const { app, page, showPath } = await openOldShow(testInfo.outputDir);
    const backupPath = path.join(
        path.dirname(showPath),
        "old-show.pre-conversion.dots",
    );
    try {
        const dialog = page.getByTestId("convert-show-dialog");
        await expect(dialog).toBeVisible({ timeout: 20_000 });
        await expect(page.getByTestId("convert-show-backup-name")).toHaveText(
            "old-show.pre-conversion.dots",
        );
        // Nothing is written before the person confirms.
        expect(fs.existsSync(backupPath)).toBe(false);

        await page.getByTestId("convert-show-confirm").click();

        // The window reloads into the editor with the converted show.
        await expect(page.locator("canvas").first()).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.getByRole("heading", { name: "Page 0" }),
        ).toBeVisible();
        await expect(dialog).toBeHidden();
    } finally {
        await app.close();
    }

    // The backup is the file as it was; the show itself is a timeline show.
    expect(fs.existsSync(backupPath)).toBe(true);
    // (a consistent copy made with `VACUUM INTO`, so not byte for byte)
    expect(readShow(backupPath)).toEqual(readShow(pageEraShow));
    const converted = readShow(showPath);
    expect(converted.version).toBe(8);
    expect(converted.tables).toContain("timelines");
    expect(converted.tables).not.toContain("marcher_pages");
});

test("Cancel leaves an old show as it was", async ({}, testInfo) => {
    const { app, page, showPath } = await openOldShow(testInfo.outputDir);
    const original = await fs.readFile(showPath);
    try {
        const dialog = page.getByTestId("convert-show-dialog");
        await expect(dialog).toBeVisible({ timeout: 20_000 });

        await page.getByTestId("convert-show-cancel").click();

        await expect(dialog).toBeHidden();
    } finally {
        await app.close();
    }

    // No backup, and the file is byte for byte what it was.
    const written = (await fs.readdir(path.dirname(showPath))).filter((name) =>
        name.startsWith("old-show"),
    );
    expect(written).toEqual(["old-show.dots"]);
    expect((await fs.readFile(showPath)).equals(original)).toBe(true);
});

test("Asking about another old show leaves the open show as it was; opening another file forgets the question", async ({}, testInfo) => {
    const { app, page, showPath } = await openOldShow(testInfo.outputDir);
    const otherPath = path.join(path.dirname(showPath), "other-old-show.dots");
    await fs.copyFile(pageEraShow, otherPath);
    const otherBefore = await fs.readFile(otherPath);
    const dialog = page.getByTestId("convert-show-dialog");
    const title = () =>
        app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0].getTitle(),
        );
    try {
        // Open (and so convert) the first show.
        await expect(dialog).toBeVisible({ timeout: 20_000 });
        await page.getByTestId("convert-show-confirm").click();
        await expect(page.locator("canvas").first()).toBeVisible({
            timeout: 30_000,
        });
        await expect(dialog).toBeHidden();
        expect(await title()).toContain(showPath);

        // Another old show: asked over the open one, which stays open.
        void page.evaluate(
            (file) => window.electron.openRecentFile(file),
            otherPath,
        );
        await expect(dialog).toBeVisible({ timeout: 20_000 });
        await expect(page.locator("canvas").first()).toBeVisible();
        expect(await title()).toContain(showPath);

        // Cancel: back to exactly that show.
        await page.getByTestId("convert-show-cancel").click();
        await expect(dialog).toBeHidden();
        await expect(page.locator("canvas").first()).toBeVisible();
        expect(await title()).toContain(showPath);

        // Asked again, then the person opens the first show instead: the question is gone,
        // also after the window reloads.
        void page.evaluate(
            (file) => window.electron.openRecentFile(file),
            otherPath,
        );
        await expect(dialog).toBeVisible({ timeout: 20_000 });
        await page.evaluate(
            (file) => window.electron.openRecentFile(file),
            showPath,
        );
        await expect(page.locator("canvas").first()).toBeVisible({
            timeout: 30_000,
        });
        await expect(dialog).toBeHidden();
        expect(await title()).toContain(showPath);
    } finally {
        await app.close();
    }

    // The other show was never written to, and has no backup.
    expect((await fs.readFile(otherPath)).equals(otherBefore)).toBe(true);
    expect(
        fs.existsSync(
            path.join(
                path.dirname(showPath),
                "other-old-show.pre-conversion.dots",
            ),
        ),
    ).toBe(false);
});

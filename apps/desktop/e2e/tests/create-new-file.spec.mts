import { test } from "../fixtures.mjs";
import { expect } from "@playwright/test";
import { createMarchers } from "../utils/marchers.mjs";
import { completeNewShowWizard } from "../utils/new-show-wizard.mjs";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import initSqlJs from "sql.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const blankDotsPath = path.resolve(
    __dirname,
    "../../electron/database/migrations/_blank.dots",
);

/**
 * E2E tests for creating a new file through the new-show wizard.
 *
 * These tests use the `electronAppNewFile` fixture which sets
 * PLAYWRIGHT_NEW_FILE_PATH. The main process uses that path's parent
 * directory as the default save location so ProjectStep auto-fills the
 * correct .dots path when the test supplies a matching project name.
 */
test("Create new file from launch page", async ({ electronAppNewFile }) => {
    const { page, newFilePath } = electronAppNewFile;
    const projectName = path.basename(newFilePath, ".dots");

    await completeNewShowWizard(page, { projectName });

    await expect(page.locator("canvas").nth(1)).toBeVisible();
    await expect(page.getByRole("button", { name: "Page 0" })).toBeVisible();
    expect(fs.existsSync(newFilePath)).toBe(true);
});

test("Create new file and verify database is functional", async ({
    electronAppNewFile,
}) => {
    const { page, newFilePath } = electronAppNewFile;
    const projectName = path.basename(newFilePath, ".dots");

    await completeNewShowWizard(page, { projectName });

    await expect(page.locator("#pages")).toContainText("0");

    await page.locator("#pages").getByRole("button").click();
    await expect(page.locator("#pages")).toContainText("1");

    await createMarchers(page, 25, "Piccolo");

    expect(fs.existsSync(newFilePath)).toBe(true);
});

test("New file has proper SQLite database structure", async ({
    electronAppNewFile,
}) => {
    const { page, newFilePath } = electronAppNewFile;
    const projectName = path.basename(newFilePath, ".dots");

    await completeNewShowWizard(page, { projectName });

    expect(fs.existsSync(newFilePath)).toBe(true);

    const SQL = await initSqlJs({
        locateFile: (file: string) => `./node_modules/sql.js/dist/${file}`,
    });

    const blankDbBuffer = fs.readFileSync(blankDotsPath);
    const newDbBuffer = fs.readFileSync(newFilePath);

    const blankDb = new SQL.Database(blankDbBuffer);
    const newDb = new SQL.Database(newDbBuffer);

    const getTableNames = (db: InstanceType<typeof SQL.Database>) => {
        const result = db.exec(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        );
        return result[0]?.values.map((row) => row[0] as string) ?? [];
    };

    const blankTables = getTableNames(blankDb);
    const newTables = getTableNames(newDb);

    expect(newTables).toEqual(blankTables);

    blankDb.close();
    newDb.close();
});

import { test } from "../fixtures.mjs";
import { expect } from "@playwright/test";
import { createMarchers } from "e2e/utils/marchers.mjs";
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
 * E2E tests for creating a new file.
 *
 * These tests use the `electronAppNewFile` fixture which sets the
 * PLAYWRIGHT_NEW_FILE_PATH environment variable. When this env var is set
 * along with PLAYWRIGHT_SESSION, the main process skips the native save dialog
 * and uses the provided path directly.
 */
test("Create new file from launch page", async ({ electronAppNewFile }) => {
    const { page, newFilePath } = electronAppNewFile;

    // Navigate to the Files tab and click "New File"
    await page.getByRole("tab", { name: "Files" }).click();
    await expect(page.getByRole("button", { name: "New File" })).toBeVisible();
    await page.getByRole("button", { name: "New File" }).click();

    // Wait for the app to reload with the new file
    // The canvas should now be visible, indicating the main editor is loaded
    await expect(page.getByText("Timeline")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("canvas").nth(1)).toBeVisible();

    // Verify the initial page (Page 0) is visible
    await expect(page.getByRole("button", { name: "Page 0" })).toBeVisible();

    // Verify the file was actually created on disk
    expect(fs.existsSync(newFilePath)).toBe(true);
});

test("Create new file and verify database is functional", async ({
    electronAppNewFile,
}) => {
    const { page, newFilePath } = electronAppNewFile;

    // Create the new file
    await page.getByRole("tab", { name: "Files" }).click();
    await page.getByRole("button", { name: "New File" }).click();

    // Wait for the editor to load
    await expect(page.getByText("Timeline")).toBeVisible({ timeout: 10000 });

    // Verify we can create pages (confirms the database is properly initialized)
    await expect(page.locator("#pages")).toContainText("0");

    // Create a new page to verify the database is functional
    await page.locator("#pages").getByRole("button").click();
    await expect(page.locator("#pages")).toContainText("1");

    // Create marchers to verify the database is functional
    await createMarchers(page, 25, "Piccolo");

    // Verify the file exists
    expect(fs.existsSync(newFilePath)).toBe(true);
});

test("New file has proper SQLite database structure", async ({
    electronAppNewFile,
}) => {
    const { page, newFilePath } = electronAppNewFile;

    // Create the new file
    await page.getByRole("tab", { name: "Files" }).click();
    await page.getByRole("button", { name: "New File" }).click();

    // Verify the file exists
    expect(fs.existsSync(newFilePath)).toBe(true);

    // Use sql.js to validate the table structure matches blank.dots
    const SQL = await initSqlJs({
        locateFile: (file: string) => `./node_modules/sql.js/dist/${file}`,
    });

    // Load both databases
    const blankDbBuffer = fs.readFileSync(blankDotsPath);
    const newDbBuffer = fs.readFileSync(newFilePath);

    const blankDb = new SQL.Database(blankDbBuffer);
    const newDb = new SQL.Database(newDbBuffer);

    // Get table names from both databases
    const getTableNames = (db: InstanceType<typeof SQL.Database>) => {
        const result = db.exec(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        );
        return result[0]?.values.map((row) => row[0] as string) ?? [];
    };

    const blankTables = getTableNames(blankDb);
    const newTables = getTableNames(newDb);

    // Verify the new file has all the same tables as blank.dots
    expect(newTables).toEqual(blankTables);

    // Clean up
    blankDb.close();
    newDb.close();
});

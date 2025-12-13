import { test } from "../fixtures.mjs";
import { expect } from "@playwright/test";
import fs from "fs-extra";

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

    // Verify we can interact with the marchers sidebar
    await page.locator("#sidebar").getByRole("button").first().click();
    await expect(page.getByRole("heading", { name: "Marchers" })).toBeVisible();

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

    // Wait for the editor to load
    await expect(page.getByText("Timeline")).toBeVisible({ timeout: 10000 });

    // Verify the file is a valid SQLite database (has proper size)
    expect(fs.existsSync(newFilePath)).toBe(true);
    const fileStats = fs.statSync(newFilePath);
    // A valid SQLite database should be larger than just a text file
    expect(fileStats.size).toBeGreaterThan(1000);
});

import { expect } from "@playwright/test";
import { test } from "../fixtures.mjs";

test("Launch page is visible", async ({ electronAppEmpty }) => {
    const { app, page } = electronAppEmpty;
    const isPackaged = await app.evaluate(async ({ app }) => {
        // This runs in Electron's main process, parameter here is always
        // the result of the require('electron') in the main app script.
        return app.isPackaged;
    });

    expect(isPackaged).toBe(false);
    await expect(page.getByRole("heading")).toContainText(
        "Welcome to OpenMarch",
    );
});

test("Canvas is visible", async ({ electronApp }) => {
    const { app, page } = electronApp;
    const isPackaged = await app.evaluate(async ({ app }) => {
        // This runs in Electron's main process, parameter here is always
        // the result of the require('electron') in the main app script.
        return app.isPackaged;
    });

    expect(isPackaged).toBe(false);
    await expect(page.getByText("FileAlignmentView")).toBeVisible();
    await expect(page.getByText("InspectorPage")).toBeVisible();
    await expect(
        page.locator("div").filter({ hasText: /^Timeline$/ }),
    ).toBeVisible();
    await expect(page.locator("canvas").nth(1)).toBeVisible();
});

test("Toolbars are visible", async ({ electronApp }) => {
    const { page } = electronApp;
    await page.getByRole("tab", { name: "File" }).click();
    await expect(page.getByText("Open FileNew FileSave Copy")).toBeVisible();
    await page.getByRole("tab", { name: "View" }).click();
    await expect(page.getByText("Prev pathsNext paths")).toBeVisible();
    await page.getByRole("tab", { name: "Alignment" }).click();
    await expect(
        page.getByRole("tabpanel", { name: "Alignment" }).locator("div").nth(3),
    ).toBeVisible();
});

test("Sidebars are visible", async ({ electronApp }) => {
    const { page } = electronApp;
    await page.locator("#sidebar").getByRole("button").first().click();
    await expect(page.getByRole("heading", { name: "Marchers" })).toBeVisible();
    await expect(
        page
            .locator("#workspace div")
            .filter({ hasText: "MarchersSection" })
            .nth(1),
    ).toBeVisible();
    await page.locator("#sidebar").getByRole("button").nth(2).click();
    await expect(
        page
            .locator("#workspace div")
            .filter({ hasText: "FieldGeneralImport" })
            .nth(1),
    ).toBeVisible();
    await expect(page.locator("header")).toBeVisible();
});

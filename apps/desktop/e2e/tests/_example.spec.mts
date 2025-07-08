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

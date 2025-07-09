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
    expect(true).toBe(false);
});

test("Launch page sub-menus", async ({ electronAppEmpty }) => {
    const { page } = electronAppEmpty;
    await page.getByRole("tab", { name: "Learn" }).click();
    await expect(page.getByRole("heading", { name: "Learn" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Guides" })).toBeVisible();

    await page.getByRole("tab", { name: "Files" }).click();
    await expect(
        page.getByRole("heading", { name: "Welcome to OpenMarch" }),
    ).toBeVisible();

    await expect(page.getByRole("button", { name: "New File" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open File" })).toBeVisible();

    await page.getByRole("tab", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Plugins" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
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
    await expect(page.getByText("FileAlignmentView")).toBeVisible();
    await expect(page.locator("canvas").nth(1)).toBeVisible();
    await expect(page.getByText("InspectorPage")).toBeVisible();
    await page.screenshot({
        path: "e2e/tests/file-tab-debug.png",
    });

    console.log("clicking file tab");
    await page.getByRole("tab", { name: "File" }).click();
    await expect(page.getByText("Open FileNew FileSave Copy")).toBeVisible();
    console.log("clicking view tab");
    await page.getByRole("tab", { name: "View" }).click();
    console.log("clicking prev paths");
    await expect(page.getByText("Prev pathsNext paths")).toBeVisible();
    console.log("clicking alignment tab");
    await page.getByRole("tab", { name: "Alignment" }).click();
    await expect(
        page.getByRole("tabpanel", { name: "Alignment" }).locator("div").nth(3),
    ).toBeVisible();
});
test("Add music shows music tab", async ({ electronApp }) => {
    const { page } = electronApp;
    await page.getByRole("button", { name: "Add Music" }).click();
    await expect(page.locator("header")).toContainText("Music");
    await page.locator("header").getByRole("button").click();
});

test("Export modal is visible", async ({ electronApp }) => {
    const { page } = electronApp;
    await page.getByRole("tab", { name: "File" }).click();
    await page.getByRole("button", { name: "Export" }).click();
    await expect(page.getByRole("dialog", { name: "Export" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Export" })).toBeVisible();
    await expect(page.getByText("PreviewB1Example")).toBeVisible();
    await page.getByRole("tab", { name: "Drill Charts" }).click();
    await expect(
        page.getByRole("heading", { name: "Export Not Available" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
        page.getByRole("dialog", { name: "Export" }),
    ).not.toBeVisible();
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
    await page.locator("#sidebar").getByRole("button").nth(1).click();
    await expect(page.locator("header")).toContainText("Music");
    await expect(
        page.getByRole("heading", { name: "Tempo Groups" }),
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
test("Field properties customizer tabs are visible", async ({
    electronApp,
}) => {
    const { page } = electronApp;
    await page.locator("#sidebar").getByRole("button").nth(2).click();
    await expect(page.getByText("Field Template")).toBeVisible();
    await page
        .getByRole("combobox", { name: "High school football field (" })
        .click();
    await expect(page.getByRole("listbox")).toMatchAriaSnapshot(`
     - group:
       - option "High school football field (no end zones)"
       - option "College football field (no end zones)"
       - option "Pro football field (no end zones)"
       - option "High school football field (with end zones)"
       - option "College football field (with end zones)"
       - option "Pro football field (with end zones)"
       - option /Indoor 40x60 - \\d+-inch steps/
       - option /Indoor 50x70 - \\d+-inch steps/
       - option /Indoor 50x80 - \\d+-inch steps/
       - option /Indoor 50x90 - \\d+-inch steps/
       - option "Indoor 40x60 - 6 to 5 Steps"
       - option "Indoor 50x70 - 6 to 5 Steps"
       - option "Indoor 50x80 - 6 to 5 Steps"
       - option "Indoor 50x90 - 6 to 5 Steps"
     `);
    await page.locator("html").click();
    await page.getByRole("button", { name: "Customize" }).click();
    await expect(
        page.getByRole("heading", { name: "Custom Field" }),
    ).toBeVisible();
    await expect(
        page.getByLabel("General").getByRole("heading", { name: "General" }),
    ).toBeVisible();
    await expect(
        page.getByRole("heading", { name: "Side Descriptions" }),
    ).toBeVisible();
    await expect(
        page.getByRole("heading", { name: "Field Labels" }),
    ).toBeVisible();
    await expect(page.getByText("Measurement System")).toBeVisible();
    await page.getByRole("tab", { name: "Checkpoints" }).click();
    await expect(
        page.getByRole("heading", { name: "X-Checkpoints" }),
    ).toBeVisible();
    await expect(page.getByLabel("Checkpoints")).toMatchAriaSnapshot(`
     - heading "X-Checkpoints" [level=4]
     - button /0 yard line -\\d+ steps/:
       - paragraph: 0 yard line
       - paragraph: /-\\d+ steps/
       - img
     - button /5 yard line -\\d+ steps/:
       - paragraph: 5 yard line
       - paragraph: /-\\d+ steps/
       - img
     - button /\\d+ yard line -\\d+ steps/:
       - paragraph: /\\d+ yard line/
       - paragraph: /-\\d+ steps/
       - img
     - button /\\d+ yard line -\\d+ steps/:
       - paragraph: /\\d+ yard line/
       - paragraph: /-\\d+ steps/
       - img
     - button /\\d+ yard line -\\d+ steps/:
       - paragraph: /\\d+ yard line/
       - paragraph: /-\\d+ steps/
       - img
     - button /\\d+ yard line -\\d+ steps/:
       - paragraph: /\\d+ yard line/
       - paragraph: /-\\d+ steps/
       - img
     - button /\\d+ yard line -\\d+ steps/:
       - paragraph: /\\d+ yard line/
       - paragraph: /-\\d+ steps/
       - img
     - button /\\d+ yard line -\\d+ steps/:
       - paragraph: /\\d+ yard line/
       - paragraph: /-\\d+ steps/
       - img
     - button /\\d+ yard line -\\d+ steps/:
       - paragraph: /\\d+ yard line/
       - paragraph: /-\\d+ steps/
       - img
     - button /\\d+ yard line -8 steps/:
       - paragraph: /\\d+ yard line/
       - paragraph: "-8 steps"
       - img
     - button /\\d+ yard line 0 steps/:
       - paragraph: /\\d+ yard line/
       - paragraph: 0 steps
       - img
     - button /\\d+ yard line 8 steps/:
       - paragraph: /\\d+ yard line/
       - paragraph: 8 steps
       - img
     - button /\\d+ yard line \\d+ steps/:
       - paragraph: /\\d+ yard line/
       - paragraph: /\\d+ steps/
       - img
     - button /\\d+ yard line \\d+ steps/:
       - paragraph: /\\d+ yard line/
       - paragraph: /\\d+ steps/
       - img
     - button /\\d+ yard line \\d+ steps/:
       - paragraph: /\\d+ yard line/
       - paragraph: /\\d+ steps/
       - img
     - button /\\d+ yard line \\d+ steps/:
       - paragraph: /\\d+ yard line/
       - paragraph: /\\d+ steps/
       - img
     - button /\\d+ yard line \\d+ steps/:
       - paragraph: /\\d+ yard line/
       - paragraph: /\\d+ steps/
       - img
     - button /\\d+ yard line \\d+ steps/:
       - paragraph: /\\d+ yard line/
       - paragraph: /\\d+ steps/
       - img
     - button /\\d+ yard line \\d+ steps/:
       - paragraph: /\\d+ yard line/
       - paragraph: /\\d+ steps/
       - img
     - button /5 yard line \\d+ steps/:
       - paragraph: 5 yard line
       - paragraph: /\\d+ steps/
       - img
     - button /0 yard line \\d+ steps/:
       - paragraph: 0 yard line
       - paragraph: /\\d+ steps/
       - img
     - button "New X-Checkpoint"
     `);
    await expect(
        page.getByRole("heading", { name: "Y-Checkpoints" }),
    ).toBeVisible();
    await expect(page.getByLabel("Checkpoints")).toMatchAriaSnapshot(`
     - text: Use Hashes
     - button:
       - img
     - switch "Use Hashes" [checked]
     - button /real back sideline -\\d+\\.\\d+ steps/:
       - paragraph: real back sideline
       - paragraph: /-\\d+\\.\\d+ steps/
       - img
     - button /grid back sideline -\\d+ steps/:
       - paragraph: grid back sideline
       - paragraph: /-\\d+ steps/
       - img
     - button /HS back hash -\\d+ steps/:
       - paragraph: HS back hash
       - paragraph: /-\\d+ steps/
       - img
     - button /HS front hash -\\d+ steps/:
       - paragraph: HS front hash
       - paragraph: /-\\d+ steps/
       - img
     - button "front sideline 0 steps":
       - paragraph: front sideline
       - paragraph: 0 steps
       - img
     `);
    await expect(page.getByText("Use Hashes")).toBeVisible();
    await page.getByRole("tab", { name: "Image" }).click();
    await expect(
        page.getByRole("heading", { name: "Image Rendering" }),
    ).toBeVisible();
    await expect(
        page.getByRole("button", { name: "Import Image" }),
    ).toBeVisible();
    await expect(
        page.getByRole("heading", { name: "Measurements" }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Theme" }).click();
    await expect(page.getByRole("heading", { name: "Theme" })).toBeVisible();
    await expect(page.getByText("Background")).toBeVisible();
});

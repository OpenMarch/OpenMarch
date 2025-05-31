import { expect } from "@playwright/test";
import { test } from "../fixtures.mjs";

test("example test", async ({ electronApp }) => {
    const { app, page } = electronApp;
    const isPackaged = await app.evaluate(async ({ app }) => {
        // This runs in Electron's main process, parameter here is always
        // the result of the require('electron') in the main app script.
        return app.isPackaged;
    });

    expect(isPackaged).toBe(false);

    await page.screenshot({ path: "intro.png" });
});

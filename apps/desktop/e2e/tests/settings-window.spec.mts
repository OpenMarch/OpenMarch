import { test } from "../fixtures.mjs";
import { expect } from "playwright/test";

test("settings opens one window and changes apply to the main window", async ({
    electronApp,
}) => {
    const { app, page } = electronApp;
    const mod = process.platform === "darwin" ? "Meta" : "Control";

    // Wait for the app UI (and its shortcut listener) to be up.
    await expect(page.getByRole("tab", { name: "File" })).toBeVisible();

    // Focus the main window, and make sure no text input holds focus (shortcuts
    // are ignored while typing), so the keydown reaches the shortcut listener.
    await page.bringToFront();
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        win?.focus();
        win?.webContents.focus();
    });

    // Two requests back to back must still produce a single window.
    const [settings] = await Promise.all([
        app.waitForEvent("window"),
        (async () => {
            await page.keyboard.press(`${mod}+Comma`);
            await page.keyboard.press(`${mod}+Comma`);
        })(),
    ]);
    await settings.waitForLoadState("domcontentloaded");
    expect(settings.url()).toContain("#settings");

    await expect.poll(() => app.windows().length).toBe(2);
    // And it stays at two once everything has settled.
    await expect
        .poll(() => app.windows().length, { timeout: 1500, intervals: [250] })
        .toBe(2);

    const wasDark = await page
        .locator("html")
        .evaluate((el) => el.classList.contains("dark"));
    try {
        await settings
            .getByRole("button", { name: "General", exact: true })
            .click();
        await settings.getByRole("radio", { name: "Light" }).click();
        await expect(page.locator("html")).not.toHaveClass(/dark/);
        await settings.getByRole("radio", { name: "Dark" }).click();
        await expect(page.locator("html")).toHaveClass(/dark/);
    } finally {
        await settings
            .getByRole("radio", { name: wasDark ? "Dark" : "Light" })
            .click();
    }
});

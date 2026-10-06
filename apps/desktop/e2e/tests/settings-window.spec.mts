import { test } from "../fixtures.mjs";
import { expect } from "playwright/test";

test("settings opens one window and changes apply to the main window", async ({
    electronApp,
}) => {
    const { app, page } = electronApp;
    const mod = process.platform === "darwin" ? "Meta" : "Control";
    // Give the document focus so the keydown reaches the shortcut listener.
    await page.locator("body").click({ position: { x: 5, y: 5 } });

    const [settings] = await Promise.all([
        app.waitForEvent("window"),
        page.keyboard.press(`${mod}+Comma`),
    ]);
    await settings.waitForLoadState("domcontentloaded");
    expect(settings.url()).toContain("#settings");

    // A second request focuses the existing window instead of opening another.
    await page.keyboard.press(`${mod}+Comma`);
    await page.waitForTimeout(500);
    expect(app.windows()).toHaveLength(2);

    await settings.getByRole("radio", { name: "Light" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await settings.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
});

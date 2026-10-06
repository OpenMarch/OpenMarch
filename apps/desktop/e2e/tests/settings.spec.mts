import { test } from "../fixtures.mjs";
import { expect, type Page } from "playwright/test";
import type { ElectronApplication } from "playwright";

const openSettingsWindow = async (
    app: ElectronApplication,
    open: () => Promise<void>,
) => {
    const [settings] = await Promise.all([app.waitForEvent("window"), open()]);
    await settings.waitForLoadState("domcontentloaded");
    await expect(settings.getByRole("heading", { level: 1 })).toBeVisible();
    return settings;
};

const goToSection = async (settings: Page, name: string) => {
    await settings.getByRole("button", { name, exact: true }).click();
    await expect(
        settings.getByRole("heading", { name, level: 1, exact: true }),
    ).toBeVisible();
};

const navigateToLaunchPageSettings = async (
    app: ElectronApplication,
    page: Page,
) => {
    await page.getByRole("tab", { name: "File" }).click();
    await page.getByRole("button", { name: "Exit File" }).click();
    await expect(page.getByRole("button", { name: "New File" })).toBeVisible();

    return openSettingsWindow(app, () =>
        page.getByRole("button", { name: "Settings" }).click(),
    );
};

const navigateToInAppSettings = async (
    app: ElectronApplication,
    page: Page,
) => {
    await page.getByRole("tab", { name: "File" }).click();
    return openSettingsWindow(app, () =>
        page.getByRole("button", { name: "App Settings" }).click(),
    );
};

const settingsMenus = [
    { name: "Launch page", navigate: navigateToLaunchPageSettings },
    { name: "In-app", navigate: navigateToInAppSettings },
];

settingsMenus.forEach(({ name, navigate }) => {
    test(`${name} - Light and dark mode`, async ({ electronApp }) => {
        const { app, page: mainPage } = electronApp;
        const page = await navigate(app, mainPage);
        await goToSection(page, "General");
        await page.getByRole("radio", { name: "Dark" }).click();
        await expect(page.getByRole("group")).toMatchAriaSnapshot(`
        - radio "Dark" [checked]:
          - img
        `);
        await page.getByRole("radio", { name: "Light" }).click();
        await expect(page.getByRole("group")).toMatchAriaSnapshot(`
        - radio "Light" [checked]:
          - img
        `);
        await page.getByRole("radio", { name: "Dark" }).click();
        await expect(page.getByRole("group")).toMatchAriaSnapshot(`
        - radio "Dark" [checked]:
          - img
        `);
        await page.getByRole("radio", { name: "Light" }).click();
        await expect(page.getByRole("group")).toMatchAriaSnapshot(`
        - radio "Light" [checked]:
          - img
        `);
        await page.getByRole("radio", { name: "Light" }).click();
        await expect(page.getByRole("group")).toMatchAriaSnapshot(`
        - radio "Light" [checked]:
          - img
        `);
        await page.getByRole("radio", { name: "Dark" }).click();
        await expect(page.getByRole("group")).toMatchAriaSnapshot(`
        - radio "Dark" [checked]:
          - img
        `);
        await page.getByRole("radio", { name: "Dark" }).click();
        await expect(page.getByRole("group")).toMatchAriaSnapshot(`
        - radio "Dark" [checked]:
          - img
        `);
    });
});

settingsMenus.forEach(({ name, navigate }) => {
    test(`${name} - Language`, async ({ electronApp }) => {
        const { app, page: mainPage } = electronApp;
        const page = await navigate(app, mainPage);
        await goToSection(page, "General");
        await page.getByRole("combobox").click();
        await page.getByRole("option", { name: "Español" }).click();
        await expect(page.getByText("Idioma")).toBeVisible();
        await expect(
            page.getByRole("navigation", { name: "Configuración" }),
        ).toBeVisible();

        // await expect(page.getByText("Configuración")).toBeVisible();

        await page.getByRole("combobox").click();
        await page.getByText("Português (Brasil)").click();
        await expect(
            page.getByRole("heading", { name: "Geral" }),
        ).toBeVisible();
        await page.getByRole("combobox").click();
        await page.getByRole("option", { name: "日本語" }).click();
        await expect(page.getByText("言語")).toBeVisible();
        await page.getByRole("combobox").click();
        await page.getByRole("option", { name: "English" }).click();
        await expect(
            page.getByRole("navigation", { name: "Settings" }),
        ).toBeVisible();
        await expect(page.getByRole("combobox")).toContainText("English");
    });
});

settingsMenus.forEach(({ name, navigate }) => {
    test(`${name} - Mouse and trackpad settings don't crash app`, async ({
        electronApp,
    }) => {
        const { app, page: mainPage } = electronApp;
        const page = await navigate(app, mainPage);
        await goToSection(page, "Mouse & Trackpad");

        const trackpadSwitch = page.getByRole("switch", {
            name: "Trackpad mode (recommended",
        });
        const trackpadPanSensitivity = page.getByLabel(
            "Trackpad pan sensitivity",
        );
        const zoomSensitivity = page.getByLabel("Zoom sensitivity");

        if (!(await trackpadSwitch.isChecked())) {
            await trackpadSwitch.click();
        }
        await expect(trackpadPanSensitivity).toBeVisible();

        await zoomSensitivity.click();
        await trackpadPanSensitivity.getByRole("slider");
        await zoomSensitivity.click();
        await trackpadPanSensitivity.click();
        await trackpadPanSensitivity.click();

        await trackpadSwitch.click();
        await trackpadSwitch.click();
        await trackpadSwitch.click();
    });
});

settingsMenus.forEach(({ name, navigate }) => {
    test(`${name} - Plugins and usage`, async ({ electronApp }) => {
        const { app, page: mainPage } = electronApp;
        const page = await navigate(app, mainPage);
        await goToSection(page, "Privacy");
        await page
            .getByRole("button", { name: "Share usage analytics" })
            .click();
        await page.locator("#share-usage-analytics").click();
        await page.locator("#share-usage-analytics").click();
        await page
            .getByRole("button", { name: "Share usage analytics" })
            .click();
        await goToSection(page, "Plugins");
        await page.getByRole("tab", { name: "Official" }).click();
        await page.getByRole("tab", { name: "Community" }).click();
    });
});

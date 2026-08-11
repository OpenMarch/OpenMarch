import { test } from "../fixtures.mjs";
import { expect, type Page } from "playwright/test";

const navigateToLaunchPageSettings = async (page: Page) => {
    await page.getByRole("tab", { name: "File" }).click();
    await page.getByRole("button", { name: "Exit File" }).click();
    await expect(page.getByRole("button", { name: "New File" })).toBeVisible();

    await page.getByRole("tab", { name: "Settings" }).click();
    await expect(
        page.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Plugins" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
};

const navigateToInAppModalSettings = async (page: Page) => {
    await page.getByRole("tab", { name: "File" }).click();
    await page
        .locator("div")
        .filter({ hasText: /^App Settings$/ })
        .click();
};

const settingsMenus = [
    { name: "Launch page", navigate: navigateToLaunchPageSettings },
    { name: "In-app modal", navigate: navigateToInAppModalSettings },
];

settingsMenus.forEach(({ name, navigate }) => {
    test(`${name} - Light and dark mode`, async ({ electronApp }) => {
        const { page } = electronApp;
        await navigate(page);
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
        const { page } = electronApp;
        await navigate(page);
        await page.getByRole("combobox").click();
        await page.getByRole("option", { name: "Español" }).click();
        await expect(page.getByText("Idioma")).toBeVisible();
        await expect(
            page.getByRole("heading", { name: "Configuración", exact: true }),
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
        await expect(page.getByLabel("Settings")).toContainText(
            "LanguageEnglish",
        );
    });
});

settingsMenus.forEach(({ name, navigate }) => {
    test(`${name} - Mouse and trackpad settings don't crash app`, async ({
        electronApp,
    }) => {
        const { page } = electronApp;
        await navigate(page);

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
        const { page } = electronApp;
        await navigate(page);
        await page
            .getByRole("button", { name: "Share usage analytics" })
            .click();
        await page.locator("#share-usage-analytics").click();
        await page.locator("#share-usage-analytics").click();
        await page
            .getByRole("button", { name: "Share usage analytics" })
            .click();
        await page.getByRole("tab", { name: "Official" }).click();
        await page.getByRole("tab", { name: "Community" }).click();
    });
});

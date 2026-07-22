import { expect, type Page } from "@playwright/test";

export interface CompleteNewShowWizardOptions {
    projectName: string;
}

const wizardDialog = (page: Page) =>
    page.getByRole("dialog", { name: "New show" });

export async function openNewShowWizard(page: Page) {
    await page.getByRole("button", { name: "New File" }).click();
    const dialog = wizardDialog(page);
    await expect(dialog).toBeVisible();
    await expect(
        dialog.getByRole("heading", {
            name: "Start setup",
            exact: true,
            level: 2,
        }),
    ).toBeVisible();
}

export async function selectBlankStart(page: Page) {
    const dialog = wizardDialog(page);
    await dialog.getByRole("button", { name: /Start blank show/ }).click();
    await expect(dialog.getByRole("button", { name: "Next" })).toBeEnabled();
}

export async function goToProjectStep(page: Page) {
    await selectBlankStart(page);
    const dialog = wizardDialog(page);
    await dialog.getByRole("button", { name: "Next" }).click();
    await expect(
        dialog.getByRole("heading", {
            name: "Project details",
            exact: true,
            level: 2,
        }),
    ).toBeVisible();
}

export async function fillProjectStep(page: Page, projectName: string) {
    const dialog = wizardDialog(page);
    await dialog.getByRole("textbox", { name: "Show name" }).fill(projectName);
    await expect(dialog.getByRole("button", { name: "Next" })).toBeEnabled({
        timeout: 5000,
    });
}

export async function completeNewShowWizard(
    page: Page,
    { projectName }: CompleteNewShowWizardOptions,
) {
    await openNewShowWizard(page);
    await goToProjectStep(page);
    await fillProjectStep(page, projectName);

    const dialog = wizardDialog(page);

    await dialog.getByRole("button", { name: "Next" }).click();
    await expect(
        dialog.getByRole("heading", {
            name: "Activity",
            exact: true,
            level: 2,
        }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Next" }).click();

    await expect(
        dialog.getByRole("heading", {
            name: "Field setup",
            exact: true,
            level: 2,
        }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Next" }).click();

    await expect(
        dialog.getByRole("heading", {
            name: "Performers",
            exact: true,
            level: 2,
        }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Skip" }).click();

    await expect(
        dialog.getByRole("heading", { name: "Audio", exact: true, level: 2 }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Skip" }).click();

    await expect(
        dialog.getByRole("heading", {
            name: "Tempo data",
            exact: true,
            level: 2,
        }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Create show" }).click();

    await expect(page.getByText("Timeline")).toBeVisible({ timeout: 15000 });
}

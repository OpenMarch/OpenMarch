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
    await expect(
        dialog.getByRole("button", { name: "Next", exact: true }),
    ).toBeEnabled();
}

export async function goToProjectStep(page: Page) {
    await selectBlankStart(page);
    const dialog = wizardDialog(page);
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
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
    await expect(
        dialog.getByRole("button", { name: "Next", exact: true }),
    ).toBeEnabled({
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

    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    await expect(
        dialog.getByRole("heading", {
            name: "Activity",
            exact: true,
            level: 2,
        }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Next", exact: true }).click();

    await expect(
        dialog.getByRole("heading", {
            name: "Field setup",
            exact: true,
            level: 2,
        }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Next", exact: true }).click();

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
    // Saving the show reloads the window (main's setActiveDb). The ruler can
    // already show before that reload on a slow machine, so wait for the
    // reload itself; otherwise it destroys the page under the next step.
    const reloaded = page.waitForEvent("load", { timeout: 15000 });
    await dialog.getByRole("button", { name: "Create show" }).click();
    await reloaded;

    // The editor opens with the timeline's page ruler
    await expect(page.getByTestId("timeline-page-ruler")).toBeVisible({
        timeout: 15000,
    });
}

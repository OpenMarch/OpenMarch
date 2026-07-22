import { test } from "../fixtures.mjs";
import { expect } from "@playwright/test";
import fs from "fs-extra";
import path from "path";
import {
    completeNewShowWizard,
    fillProjectStep,
    goToProjectStep,
    openNewShowWizard,
} from "../utils/new-show-wizard.mjs";

test("Wizard opens from launch page", async ({ electronAppEmpty }) => {
    const { page } = electronAppEmpty;

    await openNewShowWizard(page);
});

test("Project validation requires show name", async ({ electronAppEmpty }) => {
    const { page } = electronAppEmpty;
    const dialog = page.getByRole("dialog", { name: "New show" });

    await openNewShowWizard(page);
    await goToProjectStep(page);
    await expect(dialog.getByRole("button", { name: "Next" })).toBeDisabled();

    await fillProjectStep(page, "Test Show");
});

test("Minimal completion lands in editor", async ({ electronAppNewFile }) => {
    const { page, newFilePath } = electronAppNewFile;
    const projectName = path.basename(newFilePath, ".dots");

    await completeNewShowWizard(page, { projectName });

    await expect(page.locator("canvas").nth(1)).toBeVisible();
});

test("File written to playwright path", async ({ electronAppNewFile }) => {
    const { page, newFilePath } = electronAppNewFile;
    const projectName = path.basename(newFilePath, ".dots");

    await completeNewShowWizard(page, { projectName });

    expect(fs.existsSync(newFilePath)).toBe(true);
});

test("Default pages created", async ({ electronAppNewFile }) => {
    const { page, newFilePath } = electronAppNewFile;
    const projectName = path.basename(newFilePath, ".dots");

    await completeNewShowWizard(page, { projectName });

    await expect(
        page.locator("#pages").getByText("5", { exact: true }),
    ).toBeVisible();
});

test("Back navigation returns to project step", async ({
    electronAppEmpty,
}) => {
    const { page } = electronAppEmpty;
    const dialog = page.getByRole("dialog", { name: "New show" });

    await openNewShowWizard(page);
    await goToProjectStep(page);
    await fillProjectStep(page, "Back Nav Test");
    await dialog.getByRole("button", { name: "Next" }).click();

    await expect(
        dialog.getByRole("heading", {
            name: "Activity",
            exact: true,
            level: 2,
        }),
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Back" }).click();
    await expect(
        dialog.getByRole("heading", {
            name: "Project details",
            exact: true,
            level: 2,
        }),
    ).toBeVisible();
    await expect(
        dialog.getByRole("textbox", { name: "Show name" }),
    ).toHaveValue("Back Nav Test");
});

test("Exit confirm on discard", async ({ electronAppEmpty }) => {
    const { page } = electronAppEmpty;

    await openNewShowWizard(page);
    await goToProjectStep(page);
    await fillProjectStep(page, "Discard Test");
    await page.keyboard.press("Escape");

    await expect(
        page.getByRole("alertdialog", { name: "Discard new show?" }),
    ).toBeVisible();
});

test("Refresh during wizard discards draft and returns to launch page", async ({
    electronAppEmpty,
}) => {
    const { page } = electronAppEmpty;
    const dialog = page.getByRole("dialog", { name: "New show" });

    await openNewShowWizard(page);
    await goToProjectStep(page);
    await fillProjectStep(page, "Refresh Test");
    await dialog.getByRole("button", { name: "Next" }).click();

    await expect(
        dialog.getByRole("heading", {
            name: "Activity",
            exact: true,
            level: 2,
        }),
    ).toBeVisible();

    await page.reload();

    await expect(
        page.getByRole("heading", { name: "Recent Files", level: 2 }),
    ).toBeVisible();
    await expect(page.getByText("Timeline")).not.toBeVisible();
    await expect(dialog).not.toBeVisible();
});

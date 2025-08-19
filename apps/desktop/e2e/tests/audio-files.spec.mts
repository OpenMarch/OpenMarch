import { expect } from "@playwright/test";
import { test } from "../fixtures.mjs";
import { expectedAudioFiles } from "e2e/mock-databases/audio-files.mjs";

const currentlySelectedFile = expectedAudioFiles[1];
const otherFile = expectedAudioFiles[0];
test("Audio files are is visible", async ({ audioFiles, electronApp }) => {
    const { page } = electronApp;

    await page.locator("#sidebar").getByRole("button").nth(1).click();
    await page
        .getByRole("combobox", { name: "/Users/openmarchdev/Documents" })
        .click();
    for (const audioFile of audioFiles.expectedAudioFiles) {
        await expect(page.getByRole("listbox")).toContainText(audioFile);
    }
});

test("Change selected audio file", async ({ audioFiles, electronApp }) => {
    const { page } = electronApp;
    await page.locator("#sidebar").getByRole("button").nth(1).click();
    await page.locator("header").getByRole("button").click();
    await page.locator("#sidebar").getByRole("button").nth(1).click();
    await expect(
        page.getByRole("combobox", { name: currentlySelectedFile }),
    ).toBeVisible();
    await expect(
        page.getByRole("combobox", { name: otherFile }),
    ).not.toBeVisible();
    await page.getByRole("combobox", { name: currentlySelectedFile }).click();

    await page.getByText(otherFile).click();
    await expect(page.getByRole("combobox", { name: otherFile })).toBeVisible();
    await expect(
        page.getByRole("combobox", { name: currentlySelectedFile }),
    ).not.toBeVisible();

    await page.getByRole("combobox", { name: otherFile }).click();
    await page.getByText(currentlySelectedFile).click();

    await expect(
        page.getByRole("combobox", { name: currentlySelectedFile }),
    ).toBeVisible();
    await expect(
        page.getByRole("combobox", { name: otherFile }),
    ).not.toBeVisible();

    // await page
});

test("Delete audio file", async ({ audioFiles, electronApp }) => {
    const { page } = electronApp;

    await page.locator("#sidebar").getByRole("button").nth(1).click();
    await page.getByRole("combobox", { name: currentlySelectedFile }).click();
    await expect(
        page.getByRole("listbox").getByText(currentlySelectedFile),
    ).toBeVisible();
    await expect(page.getByText(otherFile)).toBeVisible();
    await page.getByRole("listbox").getByText(currentlySelectedFile).click();
    await page.getByRole("button", { name: "Delete audio file" }).click();
    await expect(
        page.getByRole("alertdialog", { name: "Delete Audio File" }),
    ).toBeVisible();
    await expect(page.getByRole("paragraph")).toContainText(
        currentlySelectedFile,
    );
    await page.getByLabel("Delete Audio File").getByText("Cancel").click();
    await page.getByRole("button", { name: "Delete audio file" }).click();
    await expect(
        page.getByRole("alertdialog", { name: "Delete Audio File" }),
    ).toBeVisible();
    await expect(page.getByText("Successfully deleted")).not.toBeVisible();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Successfully deleted")).toBeVisible();
    await expect(page.getByRole("combobox", { name: otherFile })).toBeVisible();
    await page.getByRole("combobox", { name: otherFile }).click();
    await expect(
        page.getByRole("listbox").getByText(currentlySelectedFile),
    ).not.toBeVisible();
    await expect(page.getByRole("option").getByText(otherFile)).toBeVisible();
});

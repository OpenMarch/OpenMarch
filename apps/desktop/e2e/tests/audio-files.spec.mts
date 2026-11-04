import { expect, type Page } from "@playwright/test";
import { test } from "../fixtures.mjs";
import { expectedAudioFiles } from "../mock-databases/audio-files.mjs";

const currentlySelectedFile = expectedAudioFiles[1]!;
const otherFile = expectedAudioFiles[0]!;

/** The music file is picked on the Music lane, in Edit music */
async function openMusicMenu(page: Page) {
    if (!(await page.getByTestId("tempo-music-file").isVisible()))
        await page.getByTestId("timeline-tempo-mode").click();
    await page.getByTestId("tempo-music-file").click();
    return page.getByTestId("tempo-music-menu");
}

test("Audio files are is visible", async ({ audioFiles, electronApp }) => {
    const { page } = electronApp;
    const menu = await openMusicMenu(page);
    for (const audioFile of audioFiles.expectedAudioFiles) {
        await expect(menu).toContainText(audioFile);
    }
});

test("Change selected audio file", async ({ audioFiles, electronApp }) => {
    const { page } = electronApp;
    const file = page.getByTestId("tempo-music-file");
    await (await openMusicMenu(page)).getByText(otherFile).click();
    await expect(file).toContainText(otherFile);

    await (await openMusicMenu(page)).getByText(currentlySelectedFile).click();
    await expect(file).toContainText(currentlySelectedFile);
});

test("Delete audio file", async ({ audioFiles, electronApp }) => {
    const { page } = electronApp;
    await (await openMusicMenu(page)).getByTestId("tempo-music-delete").click();
    const deleteDialog = page.getByRole("alertdialog", {
        name: "Delete audio file",
    });
    await expect(deleteDialog).toBeVisible();
    await expect(deleteDialog).toContainText(currentlySelectedFile);
    await deleteDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(deleteDialog).toBeHidden();
    await expect(page.getByText("Successfully deleted")).not.toBeVisible();

    await (await openMusicMenu(page)).getByTestId("tempo-music-delete").click();
    await page.getByTestId("tempo-music-delete-confirm").click();
    await expect(page.getByText("Successfully deleted")).toBeVisible();
    await expect(page.getByTestId("tempo-music-file")).toContainText(otherFile);
    const menu = await openMusicMenu(page);
    await expect(menu).toContainText(otherFile);
    await expect(menu).not.toContainText(currentlySelectedFile);
});

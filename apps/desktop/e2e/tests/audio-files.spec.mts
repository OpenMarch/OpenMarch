import { writeFileSync } from "node:fs";
import { expect, type ElectronApplication, type Page } from "@playwright/test";
import { test } from "../fixtures.mjs";
import { expectedAudioFiles } from "../mock-databases/audio-files.mjs";

const currentlySelectedFile = expectedAudioFiles[1]!;
const otherFile = expectedAudioFiles[0]!;

/** The music file is picked on the Music lane, in Edit music */
async function openMusicMenu(page: Page) {
    if (!(await page.getByTestId("tempo-music-file").isVisible())) {
        // A narrow window folds the transport's view controls into "More controls"
        const button = page.getByTestId("timeline-tempo-mode");
        if (!(await button.isVisible()))
            await page.getByRole("button", { name: "More controls" }).click();
        await button.click();
    }
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

/** Answers the app's native open dialog, which a test can't click. */
async function answerOpenDialog(
    app: ElectronApplication,
    answer: { canceled: boolean; filePaths: string[] },
) {
    await app.evaluate(({ dialog }, answer) => {
        const counted = globalThis as { openDialogs?: number };
        counted.openDialogs = 0;
        dialog.showOpenDialog = (async () => {
            counted.openDialogs!++;
            return answer;
        }) as typeof dialog.showOpenDialog;
    }, answer);
}

/** Counts error toasts as they appear: on this slow path they can expire unseen. */
const countErrorToasts = (page: Page) =>
    page.evaluate(() => {
        const counted = window as { errorToasts?: number };
        counted.errorToasts = 0;
        const selector = '[data-sonner-toast][data-type="error"]';
        new MutationObserver((records) => {
            for (const record of records)
                for (const node of record.addedNodes)
                    if (
                        node instanceof Element &&
                        (node.matches(selector) || node.querySelector(selector))
                    )
                        counted.errorToasts!++;
        }).observe(document.body, { childList: true, subtree: true });
    });

const openDialogs = (app: ElectronApplication) =>
    app.evaluate(() => (globalThis as { openDialogs?: number }).openDialogs);

/** One second of silence, at 8 kHz */
function silentWav(path: string) {
    const samples = 8000;
    const wav = Buffer.alloc(44 + samples * 2);
    wav.write("RIFF", 0);
    wav.writeUInt32LE(36 + samples * 2, 4);
    wav.write("WAVE", 8);
    wav.write("fmt ", 12);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24);
    wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(samples * 2, 40);
    writeFileSync(path, wav);
}

// Regression for #774: tempo mode's buttons didn't reach the file picker
test("Tempo mode's import buttons open the picker, and cancelling says nothing", async ({
    audioFiles,
    electronApp,
}, testInfo) => {
    const { app, page } = electronApp;
    const clickImportAnother = async () =>
        (await openMusicMenu(page))
            .getByText("Import another audio file…")
            .click();
    await answerOpenDialog(app, { canceled: true, filePaths: [] });
    await countErrorToasts(page);

    await clickImportAnother();
    await expect.poll(() => openDialogs(app)).toBe(1);

    await page.getByTestId("tempo-import").click();
    await page.getByTestId("tempo-import-audio").click();
    await expect.poll(() => openDialogs(app)).toBe(2);

    // A finished import comes after both cancels, so anything they raised has shown
    const file = testInfo.outputPath("added.wav");
    silentWav(file);
    await answerOpenDialog(app, { canceled: false, filePaths: [file] });
    await clickImportAnother();
    await expect(page.getByTestId("tempo-music-file")).toContainText(
        "added.wav",
    );
    expect(
        await page.evaluate(
            () => (window as { errorToasts?: number }).errorToasts,
        ),
    ).toBe(0);
});

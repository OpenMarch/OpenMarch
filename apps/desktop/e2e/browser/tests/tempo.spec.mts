import { test, expect } from "../fixtures.mjs";

// The music is edited on the timeline: Edit music holds the music file and its timing
test("Edit music offers the music file and an Import menu", async ({
    show,
}) => {
    const { page } = show;
    await expect(page.locator("#sidebar-launcher-music")).toHaveCount(0);
    await page.getByTestId("timeline-tempo-mode").click();
    await expect(page.getByTestId("tempo-add-music")).toBeVisible();
    await page.getByTestId("tempo-import").click();
    await expect(page.getByTestId("tempo-import-audio")).toBeVisible();
    await expect(page.getByTestId("tempo-import-score")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("tempo-import-audio")).toBeHidden();
    // Escape closed only the menu
    await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
});

test("Import MusicXML says what it replaces, and Cancel changes nothing", async ({
    show,
}) => {
    const { page } = show;
    await page.getByTestId("timeline-tempo-mode").click();
    await page.getByTestId("tempo-import").click();
    await page.getByTestId("tempo-import-score").click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("replace the show's");
    await expect(dialog).toContainText("stay on their counts");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    // Cancel closed only the dialog; Edit music is still on
    await expect(page.getByTestId("tempo-import")).toBeVisible();
});

/** A second of silence as a WAV, so the show has a music file */
function silentWavHex(): string {
    const rate = 8000;
    const data = Buffer.alloc(rate, 128);
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + data.length, 4);
    header.write("WAVEfmt ", 8); // cspell:disable-line
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(rate, 24);
    header.writeUInt32LE(rate, 28);
    header.writeUInt16LE(1, 32);
    header.writeUInt16LE(8, 34);
    header.write("data", 36);
    header.writeUInt32LE(data.length, 40);
    return Buffer.concat([header, data]).toString("hex");
}

test.describe("with a music file", () => {
    test.use({
        seedSql: [
            `INSERT INTO audio_files (path, nickname, data, selected) VALUES ('/music/Opener.wav', 'Opener.wav', X'${silentWavHex()}', 1)`,
        ],
    });

    test("count 1 in the music: the menu sets it, the clock shows music time", async ({
        show,
    }) => {
        const { page } = show;
        const clock = page.getByTestId("audio-clock");
        await expect(clock).toContainText("00:00.000");
        await page.getByTestId("timeline-tempo-mode").click();
        const file = page.getByTestId("tempo-music-file");
        await expect(file).toContainText("Opener.wav");
        await file.click();
        await expect(page.getByTestId("tempo-music-offset")).toContainText(
            "0 s",
        );
        await page.getByTestId("tempo-music-offset").click();
        const input = page.getByTestId("tempo-music-offset-input");
        await expect(input).toHaveValue("0");
        // The way the clock shows a time works too
        await input.fill("00:01.5");
        await page.getByTestId("tempo-music-offset-set").click();
        await expect(page.getByRole("dialog")).toBeHidden();
        // Count 1 (the playhead, at the show's start) is 1.5 s into the music
        await expect(clock).toContainText("00:01.500");
        await file.click();
        await expect(page.getByTestId("tempo-music-offset")).toContainText(
            "1.5 s",
        );
        await page.keyboard.press("Escape");
        // Out of Edit music the clock is the show's time again
        await page.getByTestId("timeline-tempo-mode").click();
        await expect(clock).toContainText("00:00.000");
    });
});

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

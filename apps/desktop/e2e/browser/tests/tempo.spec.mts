import { test, expect } from "../fixtures.mjs";

// Timing is edited in tempo mode; the Music sidebar keeps the music file and points there
test("the Music sidebar opens tempo mode", async ({ show }) => {
    const { page } = show;
    await page.locator("#sidebar-launcher-music").click();
    await page.getByTestId("music-open-tempo-mode").click();
    await expect(page.getByTestId("tempo-import-score")).toBeVisible();
    await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
});

test("Import MusicXML says what it replaces, and Cancel changes nothing", async ({
    show,
}) => {
    const { page } = show;
    await page.locator("#sidebar-launcher-music").click();
    await page.getByTestId("music-open-tempo-mode").click();
    await page.getByTestId("tempo-import-score").click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("replace the show's");
    await expect(dialog).toContainText("stay on their counts");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    // Cancel closed only the dialog; tempo mode is still on
    await expect(page.getByTestId("tempo-import-score")).toBeVisible();
});

import { test, expect } from "../fixtures.mjs";
import {
    createMarchers,
    createTempoGroup,
    drawnMarchers,
    expectCanvasMatchesShow,
} from "../app.mjs";

test("a show built in the app looks the same after a reload", async ({
    show,
}) => {
    const { page } = show;
    await createTempoGroup(page, {
        tempo: 120,
        beatsPerMeasure: 4,
        measures: 8,
    });
    await createMarchers(page, { quantity: 6, section: "Trumpet" });
    await page.locator("#pages").getByRole("button").click();
    await expect(page.getByRole("heading", { name: "Page 1" })).toBeVisible();
    await expectCanvasMatchesShow(show);

    // Move one marcher on page 1 so the pages differ.
    const marcher = (await drawnMarchers(page)).find((m) => m.onScreen)!;
    await page.mouse.move(marcher.screen.x, marcher.screen.y);
    await page.mouse.down();
    await page.mouse.move(marcher.screen.x + 150, marcher.screen.y + 100, {
        steps: 10,
    });
    await page.mouse.up();
    await expect
        .poll(
            async () =>
                (
                    await show.query(
                        "SELECT x FROM marcher_pages WHERE marcher_id = ? AND page_id = 1",
                        marcher.id,
                    )
                )[0],
        )
        .not.toEqual({ x: marcher.x });
    await expectCanvasMatchesShow(show);
    // The page bar marks where the selected marchers move (UI-18); a reload clears the selection
    await page.keyboard.press("Escape");
    await expect(page.locator("#pages")).not.toContainText("Selected marchers");

    const timeline = await page.locator("#pages").textContent();
    await page.reload();
    await page.waitForFunction(() => !!window.canvas);

    await expect(page.locator("#pages")).toHaveText(timeline!);
    await expectCanvasMatchesShow(show);
    await page.keyboard.press("Shift+E");
    await expect(page.getByRole("heading", { name: "Page 1" })).toBeVisible();
    await expectCanvasMatchesShow(show);
});

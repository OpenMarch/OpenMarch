import { test, expect } from "../fixtures.mjs";
import {
    addPageAt,
    createMarchers,
    createTempoGroup,
    drawnMarchers,
    expectCanvasMatchesShow,
    waitForField,
} from "../app.mjs";
import { savedPosition } from "../positions.mjs";

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
    await addPageAt(page, 5);
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
        .poll(async () => (await savedPosition(show, marcher.id, 1)).x)
        .not.toEqual(marcher.x);
    await expectCanvasMatchesShow(show);
    // A reload clears the selection, which the timeline marks
    await page.keyboard.press("Escape");

    // The timeline's pages and their flags, by their labels
    const timeline = () =>
        page
            .getByTestId("timeline-viewport")
            .getByRole("button", { name: /^Page / })
            .evaluateAll((buttons) =>
                buttons.map((button) => button.getAttribute("aria-label")),
            );
    const before = await timeline();
    expect(before).toContain("Page 1");
    await page.reload();
    await waitForField(page);

    await expect.poll(timeline).toEqual(before);
    // A reopened show starts at the show's start (page 0)
    await expectCanvasMatchesShow(show);
    // To page 1's end with End (last page). Not Shift+E: since #178 it steps one beat, which stops
    // partway through page 1's move, where the saved end-of-page spots don't apply (#256)
    await page.keyboard.press("End");
    await expect(page.getByRole("heading", { name: "Page 1" })).toBeVisible();
    await expectCanvasMatchesShow(show);
});

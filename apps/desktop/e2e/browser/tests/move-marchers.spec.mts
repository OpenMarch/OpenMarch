import type { Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    canvasScale,
    createMarchers,
    createTempoGroup,
    drawnMarchers,
    expectCanvasMatchesShow,
} from "../app.mjs";

/** Drags a marcher's dot by a distance in screen pixels. */
async function dragMarcher(
    page: Page,
    drillNumber: string,
    by: { x: number; y: number },
) {
    const marcher = (await drawnMarchers(page)).find(
        (drawn) => drawn.drillNumber === drillNumber,
    );
    if (!marcher?.onScreen)
        throw new Error(`${drillNumber} is not visible on the canvas`);
    const { x, y } = marcher.screen;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + by.x, y + by.y, { steps: 10 });
    await page.mouse.up();
}

const savedPosition = async (show: Show, marcherId: number, pageId = 0) =>
    (
        await show.query<{ x: number; y: number }>(
            "SELECT x, y FROM marcher_pages WHERE marcher_id = ? AND page_id = ?",
            marcherId,
            pageId,
        )
    )[0];

/**
 * New marchers line up from the field's top-left corner, and how many of them
 * the default view shows depends on the window size. Picks one that is in it.
 */
async function visibleMarcher(page: Page) {
    const marcher = (await drawnMarchers(page)).find((drawn) => drawn.onScreen);
    if (!marcher) throw new Error("No marcher is visible on the canvas");
    return marcher;
}

test("dragging a marcher saves its new position", async ({ show }) => {
    const { page } = show;
    await createMarchers(page, { quantity: 8, section: "Baritone" });
    await expectCanvasMatchesShow(show);
    const marcher = await visibleMarcher(page);
    const before = await savedPosition(show, marcher.id);
    const others = () =>
        show.query(
            "SELECT marcher_id, x, y FROM marcher_pages WHERE marcher_id != ? ORDER BY marcher_id",
            marcher.id,
        );
    const othersBefore = await others();

    const drag = { x: 200, y: 150 };
    await dragMarcher(page, marcher.drillNumber, drag);

    // The dot follows the pointer, within a field unit.
    const scale = await canvasScale(page);
    const expected = {
        x: before.x + drag.x / scale,
        y: before.y + drag.y / scale,
    };
    await expect
        .poll(async () =>
            Math.abs((await savedPosition(show, marcher.id)).x - expected.x),
        )
        .toBeLessThan(1);
    expect(
        Math.abs((await savedPosition(show, marcher.id)).y - expected.y),
    ).toBeLessThan(1);
    expect(await others()).toEqual(othersBefore);
    await expectCanvasMatchesShow(show);
    await expect(
        page.getByRole("heading", { name: `Marcher ${marcher.drillNumber}` }),
    ).toBeVisible();
});

test("undo and redo a move", async ({ show }) => {
    const { page } = show;
    await createMarchers(page, { quantity: 8, section: "Baritone" });
    await expectCanvasMatchesShow(show);
    const marcher = await visibleMarcher(page);
    const before = await savedPosition(show, marcher.id);

    await dragMarcher(page, marcher.drillNumber, { x: 300, y: 200 });
    await expect
        .poll(() => savedPosition(show, marcher.id))
        .not.toEqual(before);
    const after = await savedPosition(show, marcher.id);

    await page.keyboard.press("Control+z");
    await expect.poll(() => savedPosition(show, marcher.id)).toEqual(before);
    await expectCanvasMatchesShow(show);

    await page.keyboard.press("Control+Shift+Z");
    await expect.poll(() => savedPosition(show, marcher.id)).toEqual(after);
    await expectCanvasMatchesShow(show);
});

test("a move on one page leaves the other pages alone", async ({ show }) => {
    const { page } = show;
    await createTempoGroup(page, {
        tempo: 120,
        beatsPerMeasure: 4,
        measures: 8,
    });
    await createMarchers(page, { quantity: 8, section: "Baritone" });
    await page.locator("#pages").getByRole("button").click();
    await expect(page.getByRole("heading", { name: "Page 1" })).toBeVisible();
    await expectCanvasMatchesShow(show);
    const marcher = await visibleMarcher(page);
    const onPage0 = await savedPosition(show, marcher.id, 0);

    await dragMarcher(page, marcher.drillNumber, { x: 250, y: 100 });

    await expect
        .poll(() => savedPosition(show, marcher.id, 1))
        .not.toEqual(onPage0);
    expect(await savedPosition(show, marcher.id, 0)).toEqual(onPage0);

    // Going back shows the marcher where page 0 has it.
    await page.keyboard.press("q");
    await expect(page.getByRole("heading", { name: "Page 0" })).toBeVisible();
    await expectCanvasMatchesShow(show);
});

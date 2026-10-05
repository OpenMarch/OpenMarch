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

const savedPosition = (show: Show, marcherId: number, pageId = 0) =>
    show.query<{ x: number; y: number }>(
        "SELECT x, y FROM marcher_pages WHERE marcher_id = ? AND page_id = ?",
        marcherId,
        pageId,
    )[0];

// New marchers line up from the field's top-left corner; B3 is the first one
// inside the default view.
const MARCHER = { id: 3, drillNumber: "B3" };

test("dragging a marcher saves its new position", async ({ show }) => {
    const { page } = show;
    await createMarchers(page, { quantity: 4, section: "Baritone" });
    await expectCanvasMatchesShow(show);
    const before = savedPosition(show, MARCHER.id);
    const others = () =>
        show.query(
            "SELECT marcher_id, x, y FROM marcher_pages WHERE marcher_id != ? ORDER BY marcher_id",
            MARCHER.id,
        );
    const othersBefore = others();

    const drag = { x: 200, y: 150 };
    await dragMarcher(page, MARCHER.drillNumber, drag);

    // The dot follows the pointer, within a field unit.
    const scale = await canvasScale(page);
    const expected = {
        x: before.x + drag.x / scale,
        y: before.y + drag.y / scale,
    };
    await expect
        .poll(() => Math.abs(savedPosition(show, MARCHER.id).x - expected.x))
        .toBeLessThan(1);
    expect(
        Math.abs(savedPosition(show, MARCHER.id).y - expected.y),
    ).toBeLessThan(1);
    expect(others()).toEqual(othersBefore);
    await expectCanvasMatchesShow(show);
    await expect(
        page.getByRole("heading", { name: `Marcher ${MARCHER.drillNumber}` }),
    ).toBeVisible();
});

test("undo and redo a move", async ({ show }) => {
    const { page } = show;
    await createMarchers(page, { quantity: 4, section: "Baritone" });
    await expectCanvasMatchesShow(show);
    const before = savedPosition(show, MARCHER.id);

    await dragMarcher(page, MARCHER.drillNumber, { x: 300, y: 200 });
    await expect
        .poll(() => savedPosition(show, MARCHER.id))
        .not.toEqual(before);
    const after = savedPosition(show, MARCHER.id);

    await page.keyboard.press("Control+z");
    await expect.poll(() => savedPosition(show, MARCHER.id)).toEqual(before);
    await expectCanvasMatchesShow(show);

    await page.keyboard.press("Control+Shift+Z");
    await expect.poll(() => savedPosition(show, MARCHER.id)).toEqual(after);
    await expectCanvasMatchesShow(show);
});

test("a move on one page leaves the other pages alone", async ({ show }) => {
    const { page } = show;
    await createTempoGroup(page, {
        tempo: 120,
        beatsPerMeasure: 4,
        measures: 8,
    });
    await createMarchers(page, { quantity: 4, section: "Baritone" });
    await page.locator("#pages").getByRole("button").click();
    await expect(page.getByRole("heading", { name: "Page 1" })).toBeVisible();
    await expectCanvasMatchesShow(show);
    const onPage0 = savedPosition(show, MARCHER.id, 0);

    await dragMarcher(page, MARCHER.drillNumber, { x: 250, y: 100 });

    await expect
        .poll(() => savedPosition(show, MARCHER.id, 1))
        .not.toEqual(onPage0);
    expect(savedPosition(show, MARCHER.id, 0)).toEqual(onPage0);

    // Going back shows the marcher where page 0 has it.
    await page.keyboard.press("q");
    await expect(page.getByRole("heading", { name: "Page 0" })).toBeVisible();
    await expectCanvasMatchesShow(show);
});

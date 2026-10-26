import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures.mjs";
import {
    createMarchers,
    expectCanvasMatchesShow,
    selectedDrillNumbers,
    waitForIdle,
} from "../app.mjs";

const viewport = (page: Page) =>
    page.evaluate(() => [...(window.canvas as any).viewportTransform]);

test("Alt and a mouse drag pan the field", async ({ show }) => {
    const { page } = show;
    const canvas = page.locator(".upper-canvas");
    await expect(canvas).toBeVisible();
    await waitForIdle(page);
    const box = (await canvas.boundingBox())!;
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const before = await viewport(page);

    await page.keyboard.down("Alt");
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 80, from.y + 60, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up("Alt");

    const after = await viewport(page);
    const moved = Math.hypot(after[4] - before[4], after[5] - before[5]);
    expect(moved).toBeGreaterThan(20);
});

test("with a mouse, a selection's side handle over an outer marcher still scales", async ({
    show,
}) => {
    const { page } = show;
    await createMarchers(page, { quantity: 4, section: "Baritone" });
    await expectCanvasMatchesShow(show);
    await waitForIdle(page);
    await page.keyboard.press("Control+a");
    await expect
        .poll(async () => (await selectedDrillNumbers(page)).length)
        .toBe(4);
    await waitForIdle(page);
    // The four marchers stand in a row: each end marcher sits under a
    // side handle. Its centre, in page pixels:
    const handle = (corner: "ml" | "mr") =>
        page.evaluate((c) => {
            const canvas = window.canvas as any;
            const selection = canvas.getActiveObject();
            selection.setCoords();
            const point = selection.oCoords[c];
            const rect = canvas.upperCanvasEl.getBoundingClientRect();
            const css = rect.width / canvas.width;
            return {
                x: rect.left + point.x * css,
                y: rect.top + point.y * css,
            };
        }, corner);
    const activeScale = () =>
        page.evaluate(() => {
            const selection = (window.canvas as any).getActiveObject();
            return { x: selection.scaleX, y: selection.scaleY };
        });

    const mr = await handle("mr");
    const ml = await handle("ml");
    const horizontal = Math.abs(mr.x - ml.x) > Math.abs(mr.y - ml.y);
    const out = horizontal ? { x: 60, y: 0 } : { x: 0, y: 60 };
    await page.mouse.move(mr.x, mr.y);
    await page.mouse.down();
    await page.mouse.move(mr.x + out.x, mr.y + out.y, { steps: 8 });
    const scaled = await activeScale();
    await page.mouse.up();
    expect(Math.max(scaled.x, scaled.y)).toBeGreaterThan(1.05);
});

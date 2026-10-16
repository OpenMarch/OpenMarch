import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures.mjs";
import { waitForField } from "../app.mjs";

/**
 * Lines of the same width are drawn the same width at every zoom (#249). The
 * field first drew its lines without antialiasing, so at a zoom of 1.6
 * some yard lines were 1 px wide and others 2 px, and zooming changed which.
 *
 * Read on screen pixels: with the grid and half lines off, the middle row of
 * the field crosses only yard lines. Each line's width is its ink, the sum of
 * how dark its pixels are, so an antialiased edge counts for the part of the
 * pixel it covers.
 */

test.use({ uiSettings: { gridLines: false, halfLines: false } });

/**
 * The ink of each yard line across the field's middle row, in device pixels:
 * every dark run, but those cut off by the screen's edge and the border (three
 * yard lines wide).
 */
async function lineInks(page: Page) {
    const png = await page.getByTestId("fieldCanvas").first().screenshot();
    const runs = await page.evaluate(async (base64) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(
            new Blob([bytes], { type: "image/png" }),
        );
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d")!;
        context.drawImage(bitmap, 0, 0);
        const y = Math.floor(bitmap.height / 2);
        const data = context.getImageData(0, y, bitmap.width, 1).data;
        const light: number[] = [];
        for (let x = 0; x < bitmap.width; x++)
            light.push(
                (data[x * 4]! + data[x * 4 + 1]! + data[x * 4 + 2]!) / 3,
            );
        // The field's background is the row's most common shade
        const counts = new Map<number, number>();
        for (const value of light) {
            const shade = Math.round(value);
            counts.set(shade, (counts.get(shade) ?? 0) + 1);
        }
        const background = [...counts].sort((a, b) => b[1] - a[1])[0]![0];
        // Yard lines are the theme's primary stroke, black on the light field
        const found: { start: number; end: number; ink: number }[] = [];
        let start = -1;
        let ink = 0;
        for (let x = 0; x <= light.length; x++) {
            const value = x < light.length ? light[x]! : background;
            const dark = (background - value) / background;
            if (dark > 0.04) {
                if (start < 0) start = x;
                ink += dark;
            } else if (start >= 0) {
                found.push({ start, end: x, ink });
                start = -1;
                ink = 0;
            }
        }
        return { runs: found, width: light.length };
    }, png.toString("base64"));
    const whole = runs.runs.filter((r) => r.start > 0 && r.end < runs.width);
    const inks = whole.map((r) => r.ink).sort((a, b) => a - b);
    const median = inks[Math.floor(inks.length / 2)] ?? 0;
    return whole.map((r) => r.ink).filter((ink) => ink < median * 2);
}

test("yard lines are drawn at one width across a zoom sweep", async ({
    show,
}) => {
    test.setTimeout(90_000);
    const { page } = show;
    await waitForField(page);
    const box = (await page.getByTestId("fieldCanvas").first().boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const dpr = await page.evaluate(() => window.devicePixelRatio);

    const seen: string[] = [];
    let zoom = 0;
    for (let step = 0; zoom < 6 && step < 30; step++) {
        if (step > 0) {
            await page.keyboard.down("Control");
            await page.mouse.wheel(0, -30);
            await page.keyboard.up("Control");
        }
        const before = zoom;
        await expect
            .poll(() => page.evaluate(() => window.fieldTest!.viewport().zoom))
            .not.toBe(before);
        // Read once the field has settled: two reads in a row agree
        let inks: number[] = [];
        await expect
            .poll(async () => {
                const last = inks.join();
                inks = await lineInks(page);
                return inks.join() === last;
            })
            .toBe(true);
        zoom = await page.evaluate(() => window.fieldTest!.viewport().zoom);
        if (inks.length < 2) continue;
        // Every yard line is 1 field unit wide: zoom × DPR device pixels
        // (thinner than a pixel, a line fades by how much of it it covers).
        // Antialiasing leaves each a fraction of a pixel off.
        const width = zoom * dpr;
        seen.push(
            `zoom ${zoom.toFixed(2)}: ${inks.map((ink) => ink.toFixed(2)).join(", ")}`,
        );
        expect(
            Math.max(...inks) - Math.min(...inks),
            `yard line widths at zoom ${zoom.toFixed(2)}: ${inks.join(", ")}`,
        ).toBeLessThanOrEqual(0.5);
        for (const ink of inks)
            expect(
                Math.abs(ink - width),
                `a yard line's width at zoom ${zoom.toFixed(2)}`,
            ).toBeLessThanOrEqual(Math.max(0.5, width * 0.15));
    }
    // The sweep went through the zooms the bug showed at
    expect(seen.length, seen.join("\n")).toBeGreaterThanOrEqual(8);
});

import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures.mjs";
import { drawnMarchers, expectCanvasMatchesShow } from "../app.mjs";
import { seedShowSql } from "../seed.mjs";

/**
 * Every dot is drawn over every drill number, as in the drill chart export
 * (#206, which draws each page's dots in front). Where
 * marchers crowd, a neighbor's dot covers a drill number; the number never
 * covers a dot (#208, owner decision).
 */

// F1 stands where T1's drill number is drawn, just above T1's dot
test.use({
    seedSql: [
        ...seedShowSql({
            beats: 8,
            measureStarts: [1, 5],
            pageStarts: [],
            marchers: [
                { id: 1, section: "Trumpet", prefix: "T", order: 1 },
                { id: 2, section: "Flute", prefix: "F", order: 1 },
            ],
            positions: [
                [
                    [1, 400, 300],
                    [2, 400, 289],
                ],
            ],
        }),
        // Drill numbers in magenta, which nothing else on the field is
        `UPDATE field_properties SET json_data = json_set(json_data, '$.theme.defaultMarcher.label', json('{"r":200,"g":0,"b":200,"a":1}'))`,
        // Both drawn in a solid color, F1 with no label of its own
        `INSERT INTO section_appearances (id, section, fill_color, outline_color, shape_type, visible, label_visible) VALUES
            (1, 'Trumpet', 'rgba(0,0,255,1)', NULL, 'circle', 1, 1),
            (2, 'Flute', 'rgba(0,160,0,1)', NULL, 'circle', 1, 0)`,
    ],
});

/** The colors of the screen pixels in a box, as [r, g, b] by row. */
async function screenPixels(
    page: Page,
    box: { x: number; y: number; width: number; height: number },
) {
    const png = await page.screenshot({ clip: box, animations: "allow" });
    return page.evaluate(
        async ([base64, width, height]) => {
            const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
            const bitmap = await createImageBitmap(
                new Blob([bytes], { type: "image/png" }),
            );
            const canvas = new OffscreenCanvas(width, height);
            const context = canvas.getContext("2d")!;
            context.drawImage(bitmap, 0, 0, width, height);
            const data = context.getImageData(0, 0, width, height).data;
            const rows: number[][][] = [];
            for (let y = 0; y < height; y++) {
                const row: number[][] = [];
                for (let x = 0; x < width; x++) {
                    const i = (y * width + x) * 4;
                    row.push([data[i]!, data[i + 1]!, data[i + 2]!]);
                }
                rows.push(row);
            }
            return rows;
        },
        [png.toString("base64"), box.width, box.height] as const,
    );
}

const near = (a: number[], b: number[]) =>
    a.every((value, i) => Math.abs(value - b[i]!) <= 40);

test("a neighbor's dot covers a drill number, as in the export", async ({
    show,
}) => {
    const { page } = show;
    await expectCanvasMatchesShow(show);
    // In close enough that the drill numbers are drawn and the dots are large
    const f1 = (await drawnMarchers(page)).find((m) => m.drillNumber === "F1")!;
    await page.mouse.move(f1.screen.x, f1.screen.y);
    await page.keyboard.down("Control");
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -100);
    await page.keyboard.up("Control");
    await page.waitForTimeout(500);

    const zoom = await page.evaluate(() => window.fieldTest!.viewport().zoom);
    expect(zoom, "zoomed in").toBeGreaterThan(2);
    const drawn = await drawnMarchers(page);
    const flute = drawn.find((m) => m.drillNumber === "F1")!.screen;
    // A dot is 5 field units across its radius
    const radius = 5 * zoom;
    const half = Math.ceil(radius * 3);
    const box = {
        x: Math.round(flute.x - half),
        y: Math.round(flute.y - radius),
        width: half * 2,
        height: Math.round(radius * 2),
    };
    const green = [0, 160, 0];
    const magenta = [200, 0, 200];
    await expect
        .poll(async () => {
            const pixels = await screenPixels(page, box);
            const cx = flute.x - box.x;
            const cy = flute.y - box.y;
            let insideOff = 0;
            let ink = 0;
            pixels.forEach((row, y) =>
                row.forEach((color, x) => {
                    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
                    if (d < radius * 0.7 && !near(color, green)) insideOff++;
                    // T1's number shows either side of F1's dot
                    if (d > radius + 2 && near(color, magenta)) ink++;
                }),
            );
            return { insideOff, numberShows: ink > 0 };
        })
        .toEqual({ insideOff: 0, numberShows: true });
});

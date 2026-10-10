import { test, expect } from "../fixtures.mjs";
import { drawnMarchers, expectCanvasMatchesShow } from "../app.mjs";

// A show that already has music, two pages and two marchers who trade places.
test.use({
    seedSql: [
        `INSERT INTO beats (id, duration, position)
         VALUES ${Array.from({ length: 16 }, (_, i) => `(${i + 1}, 0.5, ${i + 1})`).join(", ")}`,
        `INSERT INTO measures (id, start_beat) VALUES (1, 1), (2, 5), (3, 9), (4, 13)`,
        `INSERT INTO pages (id, start_beat) VALUES (1, 1)`,
        `INSERT INTO marchers (id, section, drill_prefix, drill_order)
         VALUES (1, 'Trumpet', 'T', 1), (2, 'Trumpet', 'T', 2)`,
        `INSERT INTO marcher_pages (marcher_id, page_id, x, y)
         VALUES (1, 0, 400, 300), (2, 0, 600, 300), (1, 1, 600, 300), (2, 1, 400, 300)`,
    ],
});

test("opens a show and draws each page's positions", async ({ show }) => {
    const { page } = show;

    await expect(page.getByRole("heading", { name: "Page 0" })).toBeVisible();
    await expectCanvasMatchesShow(show);
    expect(
        (await drawnMarchers(page)).map(({ drillNumber, x, y }) => ({
            drillNumber,
            x,
            y,
        })),
    ).toEqual([
        { drillNumber: "T1", x: 400, y: 300 },
        { drillNumber: "T2", x: 600, y: 300 },
    ]);

    await page.keyboard.press("e");
    await expect(page.getByRole("heading", { name: "Page 1" })).toBeVisible();
    await expectCanvasMatchesShow(show);
    expect(
        (await drawnMarchers(page)).find((m) => m.drillNumber === "T1"),
    ).toEqual(expect.objectContaining({ x: 600, y: 300 }));
});

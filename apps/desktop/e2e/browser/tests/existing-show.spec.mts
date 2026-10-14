import { test, expect } from "../fixtures.mjs";
import { drawnMarchers, expectCanvasMatchesShow } from "../app.mjs";
import { seedShowSql } from "../seed.mjs";

// A show that already has music, two pages and two marchers who trade places.
test.use({
    seedSql: seedShowSql({
        beats: 16,
        measureStarts: [1, 5, 9, 13],
        pageStarts: [1],
        marchers: [1, 2].map((id) => ({
            id,
            section: "Trumpet",
            prefix: "T",
            order: id,
        })),
        positions: [
            [
                [1, 400, 300],
                [2, 600, 300],
            ],
            [
                [1, 600, 300],
                [2, 400, 300],
            ],
        ],
    }),
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

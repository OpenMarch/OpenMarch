import { test, expect, type Show } from "../fixtures.mjs";
import {
    clickMarcher,
    expectCanvasMatchesShow,
    selectedDrillNumbers,
} from "../app.mjs";
import { savedPositions, type Position } from "../positions.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";

// Four trumpets on two pages, spread out near the middle of the field so all
// of them are in view.
const PAGE_0: SeedPosition[] = [
    [1, 500, 300],
    [2, 600, 350],
    [3, 700, 280],
    [4, 800, 400],
];
const PAGE_1: SeedPosition[] = [
    [1, 520, 450],
    [2, 640, 470],
    [3, 760, 430],
    [4, 880, 500],
];

test.use({
    seedSql: seedShowSql({
        beats: 32,
        pageStarts: [16],
        marchers: PAGE_0.map(([id]) => ({
            id,
            section: "Trumpet",
            prefix: "T",
            order: id,
        })),
        positions: [PAGE_0, PAGE_1],
    }),
});

// A shortcut pressed before the page's positions load is dropped, so wait for
// the canvas first.
async function goToPage1(show: Show) {
    await expectCanvasMatchesShow(show);
    await show.page.keyboard.press("e");
    await expect(
        show.page.getByRole("heading", { name: "Page 1" }),
    ).toBeVisible();
    await expectCanvasMatchesShow(show);
}

const positions = savedPositions;
const asPositions = (rows: readonly SeedPosition[]): Position[] =>
    rows.map(([id, x, y]) => ({ id, x, y }));

test("select all, then align to one line", async ({ show }) => {
    const { page } = show;
    await expectCanvasMatchesShow(show);
    // Start with one marcher selected: Ctrl+A used to move a selection left
    // a step before selecting everyone.
    await clickMarcher(page, "T1");
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T1"]);

    await page.keyboard.press("Control+a");
    await expect
        .poll(() => selectedDrillNumbers(page))
        .toEqual(["T1", "T2", "T3", "T4"]);

    await page.keyboard.press("Alt+v");

    // Everyone moves to the average y and keeps their x.
    const averageY = PAGE_0.reduce((sum, [, , y]) => sum + y, 0) / 4;
    await expect
        .poll(() => positions(show, 0))
        .toEqual(PAGE_0.map(([id, x]) => ({ id, x, y: averageY })));
    expect(await positions(show, 1)).toEqual(asPositions(PAGE_1));
    await expectCanvasMatchesShow(show);

    await page.keyboard.press("Control+z");
    await expect.poll(() => positions(show, 0)).toEqual(asPositions(PAGE_0));
    await expectCanvasMatchesShow(show);
});

test("swap two marchers", async ({ show }) => {
    const { page } = show;
    await expectCanvasMatchesShow(show);

    await clickMarcher(page, "T1");
    await clickMarcher(page, "T3", { add: true });
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T1", "T3"]);

    // Ctrl+S used to move both a step down before swapping them.
    await page.keyboard.press("Control+s");

    const [t1, t2, t3, t4] = asPositions(PAGE_0);
    await expect
        .poll(() => positions(show, 0))
        .toEqual([
            { ...t1, x: t3.x, y: t3.y },
            t2,
            { ...t3, x: t1.x, y: t1.y },
            t4,
        ]);
    await expectCanvasMatchesShow(show);
});

test("copy every position from the previous page", async ({ show }) => {
    const { page } = show;
    await goToPage1(show);

    await page.keyboard.press("Control+Shift+P");

    await expect.poll(() => positions(show, 1)).toEqual(asPositions(PAGE_0));
    await expectCanvasMatchesShow(show);

    await page.keyboard.press("Control+z");
    await expect.poll(() => positions(show, 1)).toEqual(asPositions(PAGE_1));
});

test("copy only the selected marcher from the previous page", async ({
    show,
}) => {
    const { page } = show;
    await goToPage1(show);

    await clickMarcher(page, "T2");
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T2"]);
    await page.keyboard.press("Shift+P");

    const expected = asPositions(PAGE_1);
    expected[1] = asPositions(PAGE_0)[1];
    await expect.poll(() => positions(show, 1)).toEqual(expected);
    await expectCanvasMatchesShow(show);
});

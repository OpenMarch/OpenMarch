import type { Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    clickMarcher,
    expectCanvasMatchesShow,
    selectedDrillNumbers,
    selectPage,
    waitForIdle,
} from "../app.mjs";
import { savedPosition, savedPositions, type Position } from "../positions.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";

// Nudges and the field's actions (#196; #189
// user stories 44 and 61). They're app actions on the selection, so these
// pin that they still reach the marchers the field selects. Align, swap and
// set to previous page are in edit-positions.spec.mts.

// The blank show's step grid: 11.25 field units a step (22.5 in steps at
// half a unit an inch), counted from the center front point.
const STEP = 11.25;
const ORIGIN = { x: 900, y: 959.9625 };
/** A point `x` steps right of and `y` steps behind the center front point. */
const onGrid = (x: number, y: number) =>
    [ORIGIN.x + x * STEP, ORIGIN.y - y * STEP] as const;

const at = (id: number, [x, y]: readonly [number, number]): SeedPosition => [
    id,
    x,
    y,
];
// Four trumpets on two pages, on whole steps, all in view. On page 2 only T1
// and T2 have moves of their own; T3 and T4 hold.
const PAGE_0: SeedPosition[] = [
    at(1, onGrid(-36, 60)),
    at(2, onGrid(-30, 54)),
    at(3, onGrid(-18, 62)),
    at(4, onGrid(-8, 50)),
];
const PAGE_1: SeedPosition[] = [
    at(1, onGrid(-34, 46)),
    at(2, onGrid(-24, 44)),
    at(3, onGrid(-14, 48)),
    at(4, onGrid(-4, 42)),
];
const PAGE_2: SeedPosition[] = [at(1, onGrid(-32, 52)), at(2, onGrid(-22, 50))];

test.use({
    seedSql: seedShowSql({
        beats: 48,
        pageStarts: [16, 32],
        marchers: PAGE_0.map(([id]) => ({
            id,
            section: "Trumpet",
            prefix: "T",
            order: id,
        })),
        positions: [PAGE_0, PAGE_1, PAGE_2],
    }),
});

const asPositions = (rows: readonly SeedPosition[]): Position[] =>
    rows.map(([id, x, y]) => ({ id, x, y }));

// Saved coordinates are rounded to thousandths
const close = (a: number, b: number) => Math.abs(a - b) < 0.01;

/** Waits until marcher `id` is saved at (x, y) on page `pageId`, to a hundredth. */
async function expectAt(
    show: Show,
    id: number,
    expected: { x: number; y: number },
    pageId = 0,
) {
    await expect
        .poll(async () => {
            const saved = await savedPosition(show, id, pageId);
            return close(saved.x, expected.x) && close(saved.y, expected.y)
                ? "there"
                : { saved, expected };
        })
        .toBe("there");
}

/** Presses a key once the previous step's writes have finished. */
async function press(page: Page, key: string) {
    await waitForIdle(page);
    await page.keyboard.press(key);
}

async function selectAll(page: Page) {
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(() => selectedDrillNumbers(page))
        .toEqual(["T1", "T2", "T3", "T4"]);
}

test.beforeEach(async ({ show }) => {
    await expectCanvasMatchesShow(show);
});

test("arrow and WASD nudges, with their modifiers", async ({ show }) => {
    const { page } = show;
    await clickMarcher(page, "T1");
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T1"]);
    const [, x0, y0] = PAGE_0[0];
    const step = async (key: string, x: number, y: number) => {
        await press(page, key);
        await expectAt(show, 1, { x: x0 + x * STEP, y: y0 + y * STEP });
    };

    // A step, snapped to whole steps; WASD as the arrows
    await step("ArrowRight", 1, 0);
    await step("d", 2, 0);
    await step("ArrowLeft", 1, 0);
    await step("a", 0, 0);
    await step("ArrowUp", 0, -1);
    await step("w", 0, -2);
    await step("s", 0, -1);
    await step("ArrowDown", 0, 0);
    // Four steps, snapped to fours
    await step("ControlOrMeta+ArrowRight", 4, 0);
    // A free step, a quarter, a tenth and four free steps
    await step("Alt+ArrowRight", 5, 0);
    await step("Shift+ArrowRight", 5.25, 0);
    await step("ControlOrMeta+Shift+ArrowRight", 5.35, 0);
    await step("ControlOrMeta+Alt+ArrowLeft", 1.35, 0);
    // A snapped step lands on a whole step again
    await step("ArrowRight", 2, 0);

    expect(
        (await savedPositions(show, 0)).filter(({ id }) => id !== 1),
    ).toEqual(asPositions(PAGE_0).slice(1));
    await expectCanvasMatchesShow(show);
});

test("distribute evenly, across and down", async ({ show }) => {
    const { page } = show;
    await selectAll(page);
    // T1 to T4 left to right: T2 moves to a third of the way across
    await press(page, "Shift+H");
    const [, x1] = PAGE_0[0];
    const [, x4] = PAGE_0[3];
    await expectAt(show, 2, {
        x: x1 + (x4 - x1) / 3,
        y: PAGE_0[1][2],
    });
    await expectAt(show, 3, {
        x: x1 + ((x4 - x1) * 2) / 3,
        y: PAGE_0[2][2],
    });

    // Top to bottom: T3, T1, T2, T4
    await press(page, "Shift+V");
    const top = PAGE_0[2][2];
    const bottom = PAGE_0[3][2];
    await expectAt(show, 1, {
        x: x1,
        y: top + (bottom - top) / 3,
    });
    await expectCanvasMatchesShow(show);
});

test("flip across and down", async ({ show }) => {
    const { page } = show;
    await selectAll(page);
    const xs = PAGE_0.map(([, x]) => x);
    const ys = PAGE_0.map(([, , y]) => y);
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;

    await press(page, "Alt+F");
    for (const [id, x, y] of PAGE_0)
        await expectAt(show, id, { x: 2 * centerX - x, y });

    await press(page, "Alt+Shift+F");
    for (const [id, x, y] of PAGE_0)
        await expectAt(show, id, { x: 2 * centerX - x, y: 2 * centerY - y });
    await expectCanvasMatchesShow(show);
});

test("set the selected marcher to the next page", async ({ show }) => {
    const { page } = show;
    await selectPage(show, "Page 1");
    await clickMarcher(page, "T2");
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T2"]);
    await press(page, "Shift+N");

    const [, x, y] = PAGE_2[1];
    await expectAt(show, 2, { x, y }, 1);
    const others = (await savedPositions(show, 1)).filter((p) => p.id !== 2);
    expect(others).toEqual(asPositions(PAGE_1).filter((p) => p.id !== 2));
    await expectCanvasMatchesShow(show);
});

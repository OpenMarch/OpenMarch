import type { Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    canvasScale,
    drawnMarchers,
    expectCanvasMatchesShow,
} from "../app.mjs";
import { fieldGrid, savedPositions, type FieldGrid } from "../positions.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";

// The touch pill over the field (modifier roles, version A, "Touch and Apple
// Pencil"): in the touch layout, Fine, Equal and From center stand in for the
// keys a tablet doesn't have. Tapping Fine latches it, and the next drag goes
// as one with Shift held: at a quarter of the pointer's speed, off the grid.
// The browser has no Pencil, so the drag is the mouse's; a Pencil press
// reaches the field editor the same way.

// Four trumpets on the home page, all in view, none on the grid.
const PAGE_0: SeedPosition[] = [
    [1, 503, 304],
    [2, 603, 354],
    [3, 703, 284],
    [4, 803, 404],
];

test.use({
    seedSql: seedShowSql({
        beats: 16,
        pageStarts: [],
        measureStarts: [1, 5, 9, 13],
        marchers: PAGE_0.map(([id]) => ({
            id,
            section: "Trumpet",
            prefix: "T",
            order: id,
        })),
        positions: [PAGE_0],
    }),
    // Coordinate rounding to whole steps, so a snapped drop is on the grid
    uiSettings: {
        coordinateRounding: { nearestXSteps: 1, nearestYSteps: 1 },
    },
    // The touch layout, pinned, as Settings › Touch & Input does
    initScript: "localStorage.setItem('openmarch:inputMode', 'touch');",
});

const T2 = { x: 603, y: 354 };

/** `value` on the step grid through `origin`, the way rounding puts it. */
const onGrid = (value: number, origin: number, grid: FieldGrid) =>
    origin +
    Math.round((value - origin) / grid.pixelsPerStep) * grid.pixelsPerStep;

/** Drags marcher T2 by `by` field units with the mouse, and releases. */
async function dragT2(page: Page, by: { x: number; y: number }) {
    const scale = await canvasScale(page);
    const drawn = (await drawnMarchers(page)).find(
        (m) => m.drillNumber === "T2",
    );
    if (!drawn?.onScreen) throw new Error("T2 is not visible on the field");
    const at = drawn.screen;
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + by.x * scale, at.y + by.y * scale, {
        steps: 8,
    });
    await page.mouse.up();
}

/** Within 1.5 field units on both axes: the mouse lands on whole screen pixels. */
const near = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.abs(a.x - b.x) < 1.5 && Math.abs(a.y - b.y) < 1.5;

async function expectT2Saved(show: Show, expected: { x: number; y: number }) {
    await expect
        .poll(async () => {
            const t2 = (await savedPositions(show, 0)).find((p) => p.id === 2);
            return t2 && near(t2, expected)
                ? "saved as expected"
                : { t2, expected };
        })
        .toBe("saved as expected");
}

test.beforeEach(async ({ show }) => {
    await expectCanvasMatchesShow(show);
});

test("the touch layout shows the pill, named by role", async ({ show }) => {
    const pill = show.page.getByTestId("touch-modifier-buttons");
    await expect(pill).toBeVisible();
    for (const name of ["Fine", "Equal", "From center", "Add"])
        await expect(pill).toContainText(name);
    await expect(pill).not.toContainText(/Shift|Alt|Ctrl|Cmd/);
    await pill.screenshot({ path: test.info().outputPath("pill.png") });
});

test("tapping Fine, then dragging a marcher: a quarter of the pointer's speed, off the grid", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    // A quarter of a step past a whole number of steps: off the grid
    const moved = {
        x:
            onGrid(T2.x, grid.centerFront.x, grid) +
            2.25 * grid.pixelsPerStep -
            T2.x,
        y:
            onGrid(T2.y, grid.centerFront.y, grid) +
            1.25 * grid.pixelsPerStep -
            T2.y,
    };

    const fine = page.getByTestId("touch-toggle-fine");
    await fine.click();
    await expect(fine).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({ path: test.info().outputPath("field-fine.png") });

    await dragT2(page, { x: moved.x * 4, y: moved.y * 4 });

    await expectT2Saved(show, { x: T2.x + moved.x, y: T2.y + moved.y });
    await expectCanvasMatchesShow(show);
});

test("with Fine off again, the same drag snaps onto the grid", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    const fine = page.getByTestId("touch-toggle-fine");
    await fine.click();
    await fine.click();
    await expect(fine).toHaveAttribute("aria-pressed", "false");

    const by = { x: 2.25 * grid.pixelsPerStep, y: 1.25 * grid.pixelsPerStep };
    await dragT2(page, by);

    await expectT2Saved(show, {
        x: onGrid(T2.x + by.x, grid.centerFront.x, grid),
        y: onGrid(T2.y + by.y, grid.centerFront.y, grid),
    });
});

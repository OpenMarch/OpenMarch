import type { Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    drawnMarchers,
    expectCanvasMatchesShow,
    readField,
    waitForIdle,
} from "../app.mjs";
import { fieldGrid, savedPositions } from "../positions.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";

// The shape on its own (#558, spec #522): while a Box, Circle or Line is
// edited, holding H hides the marchers the shape moves (its spots, their walks
// and dots), and letting go shows them again; a tap keeps them hidden until the
// next tap. Only that shape's marchers hide (#568): the rest stay as shape
// editing draws them, and the start ghosts still show where the shape's
// marchers were. The editor's eye button shows and turns the same state. Every
// shape starts with them shown, and hiding is no edit, undo step or selection
// change.

// Eight trumpets scattered, all in view.
const HOME: SeedPosition[] = [
    [1, 500, 300],
    [2, 600, 350],
    [3, 700, 280],
    [4, 800, 400],
    [5, 520, 450],
    [6, 640, 470],
    [7, 760, 430],
    [8, 880, 500],
];
const ALL = HOME.map(([id]) => id);
/** The shape's marchers; the rest are left out of it */
const SHAPE = [1, 2, 3, 4];
const REST = [5, 6, 7, 8];

test.use({
    seedSql: seedShowSql({
        beats: 48,
        pageStarts: [16, 32],
        measureStarts: Array.from({ length: 12 }, (_, i) => 1 + i * 4),
        marchers: HOME.map(([id]) => ({
            id,
            section: "Trumpet",
            prefix: "T",
            order: id,
        })),
        positions: [HOME, HOME, HOME],
    }),
    // The time-stretch worklet (#216) can't load in the harness (see props.spec.mts)
    allowedPageErrors: [/Audio worklet error/],
});

test.beforeEach(async ({ show }) => {
    await expectCanvasMatchesShow(show);
});

type Point = { x: number; y: number };

/** Where field point `p` is drawn in the viewport, from where the marchers are drawn. */
async function toScreen(page: Page, p: Point): Promise<Point> {
    const [marcher] = await drawnMarchers(page);
    const { zoom } = (await readField(page)).viewport;
    return {
        x: marcher.screen.x + (p.x - marcher.x) * zoom,
        y: marcher.screen.y + (p.y - marcher.y) * zoom,
    };
}

async function drag(page: Page, from: Point, to: Point) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.up();
}

/** How many undo steps the show has. */
const undoSteps = async (show: Show) => {
    const [row] = await show.query<{ count: number }>(
        "SELECT COUNT(DISTINCT history_group) AS count FROM history_undo",
    );
    return row.count;
};

const marchersShown = (page: Page) =>
    page.evaluate(() => window.fieldTest!.marchersShown!());

/** How opaque each marcher's dot is drawn, by id (0: hidden) */
const opacities = (page: Page): Promise<Record<number, number>> =>
    page.evaluate(() =>
        Object.fromEntries(
            window.fieldTest!.marchers().map((m) => [m.id, m.opacity]),
        ),
    );

const opacitiesOf = async (page: Page, ids: number[]) => {
    const all = await opacities(page);
    return ids.map((id) => all[id]);
};

/** Selects the shape's marchers alone, by a click and Shift-clicks */
async function selectShapeMarchers(page: Page) {
    const drawn = await drawnMarchers(page);
    for (const [i, id] of SHAPE.entries()) {
        const { screen } = drawn.find((m) => m.id === id)!;
        if (i > 0) await page.keyboard.down("Shift");
        await page.mouse.click(screen.x, screen.y);
        if (i > 0) await page.keyboard.up("Shift");
    }
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(SHAPE);
}

/** How many spots the shape draws, and whether its outline is drawn */
const drawnShape = (page: Page) =>
    page.evaluate(() => {
        const overlay = window.fieldTest!.shapeOverlay!();
        return {
            spots: overlay?.spots.length ?? 0,
            rings: overlay?.rings.length ?? 0,
            walks: overlay?.walks.length ?? 0,
            outline: (overlay?.outline?.length ?? 0) > 0,
        };
    });

for (const { name, key } of [
    { name: "Box", key: "b" },
    { name: "Circle", key: "o" },
    { name: "Line", key: "l" },
]) {
    test(`H hides the open ${name}'s marchers alone while it's edited: held peeks, a tap latches, the eye button shows it`, async ({
        show,
    }) => {
        const { page } = show;
        const grid = await fieldGrid(show);
        const S = grid.pixelsPerStep;
        const cf = grid.centerFront;

        await selectShapeMarchers(page);
        const steps = await undoSteps(show);
        const before = await savedPositions(show, 0);

        await page.keyboard.press(key);
        const from = { x: cf.x - 14 * S, y: cf.y - 24 * S };
        const to = { x: cf.x - 2 * S, y: cf.y - 16 * S };
        await drag(page, await toScreen(page, from), await toScreen(page, to));
        const readout = page.getByTestId("shape-tool-readout");
        await expect(readout).toBeVisible();

        // Shown at the start of the shape
        const eye = readout.getByTestId("shape-editor-hide-marchers");
        await expect(eye).toHaveAttribute("aria-pressed", "false");
        expect(await marchersShown(page)).toBe(true);
        await expect
            .poll(async () => (await drawnShape(page)).spots)
            .toBe(SHAPE.length);
        // The rest are drawn faded while the shape is edited, not hidden
        const rest = await opacitiesOf(page, REST);
        expect(rest.every((o) => o > 0)).toBe(true);

        // Held: the shape's marchers hidden, its outline and their start
        // ghosts left; the rest as they were. Let go after a while: shown again
        await page.keyboard.down("h");
        await expect.poll(() => marchersShown(page)).toBe(false);
        await expect(eye).toHaveAttribute("aria-pressed", "true");
        expect(await drawnShape(page)).toEqual({
            spots: 0,
            rings: SHAPE.length,
            walks: 0,
            outline: true,
        });
        expect(await opacitiesOf(page, SHAPE)).toEqual(SHAPE.map(() => 0));
        expect(await opacitiesOf(page, REST)).toEqual(rest);
        await page.waitForTimeout(400);
        await page.keyboard.up("h");
        await expect.poll(() => marchersShown(page)).toBe(true);
        expect((await drawnShape(page)).spots).toBe(SHAPE.length);

        // A tap latches them hidden, the eye button showing it
        await page.keyboard.press("h");
        await expect(eye).toHaveAttribute("aria-pressed", "true");
        expect(await marchersShown(page)).toBe(false);
        // The next tap shows them, and the eye button hides them again
        await page.keyboard.press("h");
        await expect(eye).toHaveAttribute("aria-pressed", "false");
        expect(await marchersShown(page)).toBe(true);
        await eye.click();
        await expect(eye).toHaveAttribute("aria-pressed", "true");
        expect(await marchersShown(page)).toBe(false);

        // Drawing only: the shape still open, nobody moved, no undo step, the
        // same selection
        await expect(readout).toBeVisible();
        expect((await readField(page)).selection).toEqual(SHAPE);
        await waitForIdle(page);
        expect(await undoSteps(show)).toBe(steps);
        expect(await savedPositions(show, 0)).toEqual(before);

        // Escape throws the shape away and shows the marchers; the next shape
        // starts with them shown
        await page.keyboard.press("Escape");
        await expect(readout).toBeHidden();
        expect(await marchersShown(page)).toBe(true);
        await selectShapeMarchers(page);
        await page.keyboard.press(key);
        await drag(page, await toScreen(page, from), await toScreen(page, to));
        await expect(readout).toBeVisible();
        await expect(eye).toHaveAttribute("aria-pressed", "false");
        expect(await marchersShown(page)).toBe(true);
    });
}

test("H hides a selected placed shape's members alone; everyone else stays drawn", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;

    // Place a Box from the shape's marchers, then select it by a member
    await selectShapeMarchers(page);
    await page.keyboard.press("b");
    const from = { x: cf.x - 14 * S, y: cf.y - 24 * S };
    const to = { x: cf.x - 2 * S, y: cf.y - 16 * S };
    await drag(page, await toScreen(page, from), await toScreen(page, to));
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    await waitForIdle(page);
    await page.keyboard.press("Escape");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([]);
    const member = (await drawnMarchers(page)).find((m) => m.id === 1)!;
    await page.mouse.click(member.screen.x, member.screen.y);
    await expect(page.getByTestId("placed-box-readout")).toBeVisible();
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(SHAPE);
    expect(await opacitiesOf(page, ALL)).toEqual(ALL.map(() => 1));

    // Held: its members hide, the rest stay drawn; let go: shown again
    await page.keyboard.down("h");
    await expect
        .poll(() => opacitiesOf(page, SHAPE))
        .toEqual(SHAPE.map(() => 0));
    expect(await opacitiesOf(page, REST)).toEqual(REST.map(() => 1));
    await page.waitForTimeout(400);
    await page.keyboard.up("h");
    await expect.poll(() => opacitiesOf(page, ALL)).toEqual(ALL.map(() => 1));
});

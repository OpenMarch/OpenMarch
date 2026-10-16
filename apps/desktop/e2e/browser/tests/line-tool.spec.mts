import type { Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    clickMarcher,
    expectCanvasMatchesShow,
    readField,
    waitForIdle,
} from "../app.mjs";
import {
    fieldGrid,
    savedPositions,
    type FieldGrid,
    type Position,
} from "../positions.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";
import type { FieldTestLineTool } from "../../../src/field/fieldTestApi";

// The line tool (#203; #189 user stories 56 and 57): L with two or more
// marchers selected outlines them and takes them out of the selection. A
// click starts a line, its end follows the pointer, and a second click
// finishes it; both points round to whole steps unless Shift is held. The
// marchers are ordered along the line (top to bottom for a steep line,
// otherwise left to right, from the line's start) and spaced evenly, shown as
// dashed previews. Shift+Enter applies them in one undo step, Escape cancels
// and gives the selection back, and a right-click clears the line. Escape
// with the line tool on in isolation (story 59) is `timeline-interactions`.
//
// The "change:" scenarios are the rules-table changes decided in #189.

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
});

type Point = { x: number; y: number };

const HOME: Position[] = PAGE_0.map(([id, x, y]) => ({ id, x, y }));

/** The line tool as the field shows it, or null when it's off. */
const lineTool = (page: Page): Promise<FieldTestLineTool | null> =>
    page.evaluate(() => window.fieldTest!.lineTool?.() ?? null);

/** Where field point `point` is in the viewport. */
async function screenAt(page: Page, point: Point): Promise<Point> {
    const box = (await page.getByTestId("fieldCanvas").first().boundingBox())!;
    const { zoom, pan } = (await readField(page)).viewport;
    return {
        x: box.x + pan.x + point.x * zoom,
        y: box.y + pan.y + point.y * zoom,
    };
}

/** `value` on the step grid through `origin`, the way rounding puts it. */
const onGrid = (value: number, origin: number, grid: FieldGrid) =>
    origin +
    Math.round((value - origin) / grid.pixelsPerStep) * grid.pixelsPerStep;

/** `point` rounded to whole steps. */
const snapped = (point: Point, grid: FieldGrid): Point => ({
    x: onGrid(point.x, grid.centerFront.x, grid),
    y: onGrid(point.y, grid.centerFront.y, grid),
});

/** `ids`, in order, spaced evenly from `start` to `end`, by ascending id. */
const spaced = (ids: number[], start: Point, end: Point): Position[] =>
    ids
        .map((id, i) => {
            const t = i / (ids.length - 1);
            return {
                id,
                x: start.x + (end.x - start.x) * t,
                y: start.y + (end.y - start.y) * t,
            };
        })
        .sort((a, b) => a.id - b.id);

/**
 * Within 1.5 field units on both axes: the mouse lands on whole screen
 * pixels.
 */
const near = (a: Point, b: Point, within = 1.5) =>
    Math.abs(a.x - b.x) < within && Math.abs(a.y - b.y) < within;

const allNear = (a: Position[], b: Position[], within?: number) =>
    a.length === b.length &&
    a.every((p, i) => p.id === b[i].id && near(p, b[i], within));

/** Selects all four marchers and turns the line tool on. */
async function startTool(page: Page) {
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([1, 2, 3, 4]);
    await page.keyboard.press("l");
    await expect
        .poll(async () => (await lineTool(page))?.marchers)
        .toEqual([1, 2, 3, 4]);
}

/**
 * Draws a line from field point `from` to `to`: a click, moves to the end,
 * and a second click. `shift` holds Shift through both clicks.
 */
async function drawLine(
    page: Page,
    from: Point,
    to: Point,
    { shift = false }: { shift?: boolean } = {},
) {
    if (shift) await page.keyboard.down("Shift");
    const a = await screenAt(page, from);
    const b = await screenAt(page, to);
    await page.mouse.click(a.x, a.y);
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.click(b.x, b.y);
    if (shift) await page.keyboard.up("Shift");
}

/** Waits until the home page saves positions {@link near} `expected`. */
async function expectSaved(show: Show, expected: Position[], within?: number) {
    await expect
        .poll(async () => {
            const saved = await savedPositions(show, 0);
            return allNear(saved, expected, within)
                ? "saved as expected"
                : { saved, expected };
        })
        .toBe("saved as expected");
}

/** Waits until the previews are {@link near} `expected`. */
async function expectPreviews(page: Page, expected: Position[]) {
    await expect
        .poll(async () => {
            const previews = (await lineTool(page))?.previews ?? [];
            return allNear(previews, expected)
                ? "previews as expected"
                : { previews, expected };
        })
        .toBe("previews as expected");
}

// A shallow line drawn right to left: right to left is its order, so T4,
// rightmost, goes to its start and T1 to its end.
const SHALLOW = { from: { x: 851, y: 517 }, to: { x: 466, y: 455 } };
const SHALLOW_ORDER = [4, 3, 2, 1];

test.beforeEach(async ({ show }) => {
    await expectCanvasMatchesShow(show);
});

test("L with fewer than two marchers selected doesn't start the tool", async ({
    show,
}) => {
    const { page } = show;
    await clickMarcher(page, "T1");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([1]);
    await page.keyboard.press("l");
    await page.waitForTimeout(300);
    expect(await lineTool(page)).toBeNull();
    expect((await readField(page)).selection).toEqual([1]);
});

test("L outlines the selected marchers and empties the selection; Escape gives the selection back and saves nothing", async ({
    show,
}) => {
    const { page } = show;
    await startTool(page);
    const field = await readField(page);
    expect(field.selection).toEqual([]);
    expect(field.activeGesture).toBe("line");
    expect((await lineTool(page))!.line).toBeNull();

    await page.keyboard.press("Escape");
    await expect.poll(() => lineTool(page)).toBeNull();
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([1, 2, 3, 4]);
    expect((await readField(page)).activeGesture).toBeNull();
    await waitForIdle(page);
    expect(await savedPositions(show, 0)).toEqual(HOME);
});

test("a click starts the line, its end follows the pointer, both rounded to whole steps, and a second click finishes it with previews spaced evenly in order", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    await startTool(page);

    const start = await screenAt(page, SHALLOW.from);
    await page.mouse.click(start.x, start.y);
    for (const to of [{ x: 700, y: 600 }, SHALLOW.to]) {
        const at = await screenAt(page, to);
        await page.mouse.move(at.x, at.y, { steps: 5 });
        const line = (await lineTool(page))!.line!;
        expect(line.drawing).toBe(true);
        expect(near(line.start, snapped(SHALLOW.from, grid))).toBe(true);
        expect(
            near(line.end, snapped(to, grid)),
            JSON.stringify({ line, to: snapped(to, grid) }),
        ).toBe(true);
    }
    expect((await lineTool(page))!.previews).toEqual([]);

    const end = await screenAt(page, SHALLOW.to);
    await page.mouse.click(end.x, end.y);
    const line = (await lineTool(page))!.line!;
    expect(line.drawing).toBe(false);
    await expectPreviews(
        page,
        spaced(
            SHALLOW_ORDER,
            snapped(SHALLOW.from, grid),
            snapped(SHALLOW.to, grid),
        ),
    );
    // Nothing is saved until the line is applied
    expect(await savedPositions(show, 0)).toEqual(HOME);
});

test("Shift+Enter applies the previews in one undo step and ends the tool", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    await startTool(page);
    await drawLine(page, SHALLOW.from, SHALLOW.to);
    const expected = spaced(
        SHALLOW_ORDER,
        snapped(SHALLOW.from, grid),
        snapped(SHALLOW.to, grid),
    );
    await expectPreviews(page, expected);

    await page.keyboard.press("Shift+Enter");
    await expectSaved(show, expected);
    await expect.poll(() => lineTool(page)).toBeNull();
    await expectCanvasMatchesShow(show);

    await page.keyboard.press("ControlOrMeta+z");
    await expectSaved(show, HOME, 0.001);
    await expectCanvasMatchesShow(show);
});

test("a steep line orders the marchers top to bottom from its start", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    await startTool(page);
    // Drawn upward, so the bottom marcher (T4) goes to its start
    const from = { x: 655, y: 520 };
    const to = { x: 690, y: 250 };
    await drawLine(page, from, to);
    const expected = spaced(
        [4, 2, 1, 3],
        snapped(from, grid),
        snapped(to, grid),
    );
    await expectPreviews(page, expected);
    await page.keyboard.press("Shift+Enter");
    await expectSaved(show, expected);
});

test("with Shift held, the line's points stay where the pointer is", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    await startTool(page);
    await drawLine(page, SHALLOW.from, SHALLOW.to, { shift: true });
    const line = (await lineTool(page))!.line!;
    expect(near(line.start, SHALLOW.from), JSON.stringify(line)).toBe(true);
    expect(near(line.end, SHALLOW.to), JSON.stringify(line)).toBe(true);
    // The points are off the grid: rounding would have moved them
    expect(near(line.end, snapped(SHALLOW.to, grid), 0.5)).toBe(false);
    await expectPreviews(page, spaced(SHALLOW_ORDER, SHALLOW.from, SHALLOW.to));
    await page.keyboard.press("Shift+Enter");
    await expectSaved(show, spaced(SHALLOW_ORDER, SHALLOW.from, SHALLOW.to));
});

test("a right-click clears the line being drawn, and the next click starts a new one", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    await startTool(page);
    const a = await screenAt(page, { x: 480, y: 600 });
    const b = await screenAt(page, { x: 800, y: 620 });
    await page.mouse.click(a.x, a.y);
    await page.mouse.move(b.x, b.y, { steps: 5 });
    expect((await lineTool(page))!.line).not.toBeNull();
    await page.mouse.click(b.x, b.y, { button: "right" });
    await expect.poll(async () => (await lineTool(page))!.line).toBeNull();
    // Still on, with the same marchers and nothing selected
    expect((await lineTool(page))!.marchers).toEqual([1, 2, 3, 4]);
    expect((await readField(page)).selection).toEqual([]);

    await drawLine(page, SHALLOW.from, SHALLOW.to);
    await expectPreviews(
        page,
        spaced(
            SHALLOW_ORDER,
            snapped(SHALLOW.from, grid),
            snapped(SHALLOW.to, grid),
        ),
    );
});

test("change: after the line is finished, a click on a marcher selects nothing (rules table: Click target)", async ({
    show,
}) => {
    const { page } = show;
    await startTool(page);
    await drawLine(page, SHALLOW.from, SHALLOW.to);
    await expect
        .poll(async () => (await lineTool(page))!.previews.length)
        .toBe(4);
    // T2 hasn't moved yet: the previews aren't applied
    const at = await screenAt(page, { x: 603, y: 354 });
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(300);
    expect((await readField(page)).selection).toEqual([]);
    expect((await lineTool(page))!.previews.length).toBe(4);
});

test("change: Shift+Enter saves the marchers exactly where the previews are drawn (rules table: Dot position)", async ({
    show,
}) => {
    const { page } = show;
    await startTool(page);
    await drawLine(page, SHALLOW.from, SHALLOW.to);
    await expect
        .poll(async () => (await lineTool(page))!.previews.length)
        .toBe(4);
    const previews = (await lineTool(page))!.previews;
    await page.keyboard.press("Shift+Enter");
    await expectSaved(show, previews, 0.01);
});

test("change: a right-drag pans and keeps the line being drawn, so its end can be placed past the edge (user story 5)", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    await startTool(page);
    const a = await screenAt(page, SHALLOW.from);
    await page.mouse.click(a.x, a.y);
    const before = (await readField(page)).viewport.pan;

    // Right-drag 120 screen px left
    const from = await screenAt(page, { x: 700, y: 600 });
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(from.x - 120, from.y, { steps: 8 });
    await page.mouse.up({ button: "right" });
    await expect
        .poll(async () => (await readField(page)).viewport.pan.x)
        .toBeLessThan(before.x - 100);
    const line = (await lineTool(page))!.line;
    expect(line).toMatchObject({ drawing: true });
    expect(near(line!.start, snapped(SHALLOW.from, grid))).toBe(true);

    // The end still follows the pointer, and a click finishes the line
    const b = await screenAt(page, SHALLOW.to);
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.mouse.click(b.x, b.y);
    await expectPreviews(
        page,
        spaced(
            SHALLOW_ORDER,
            snapped(SHALLOW.from, grid),
            snapped(SHALLOW.to, grid),
        ),
    );
});

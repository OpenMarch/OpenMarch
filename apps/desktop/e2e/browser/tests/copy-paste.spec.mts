import type { Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    clickMarcher,
    drawnMarchers,
    expectCanvasMatchesShow,
    readField,
    waitForField,
    waitForIdle,
} from "../app.mjs";
import { fieldGrid, savedPositions, type Position } from "../positions.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";
import type { FieldTestShapeOverlay } from "../../../src/field/fieldTestApi";

// Copy and paste of a formation (#961): Ctrl/Cmd+C keeps where the selected
// marchers stand, one whole placed shape as a shape. Ctrl/Cmd+V shows it on
// the marchers selected then, as an open shape centered on them: nobody moves
// until Enter places it as one undo step, and Escape throws it away.
// Ctrl/Cmd+Shift+V starts it where it was copied. A shape is laid out again
// for the receiving count; loose dots fill spots by least travel, and stay
// plain marchers. The picture is the app's own, kept across a reload.

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

type Point = { x: number; y: number };

const asPositions = (rows: readonly SeedPosition[]): Position[] =>
    rows.map(([id, x, y]) => ({ id, x, y }));

/** Positions are saved to three decimals. */
const CLOSE = 1e-3;
const near = (a: Point, b: Point) =>
    Math.abs(a.x - b.x) < CLOSE && Math.abs(a.y - b.y) < CLOSE;

/** `points` in a fixed order, so two sets compare whatever order they came in */
const sorted = (points: readonly Point[]) =>
    points
        .map((p) => ({
            x: Math.round(p.x * 100) / 100,
            y: Math.round(p.y * 100) / 100,
        }))
        .sort((a, b) => a.x - b.x || a.y - b.y);

/** Where field point `p` is drawn in the viewport, from where the marchers are drawn. */
async function toScreen(page: Page, p: Point): Promise<Point> {
    const [marcher] = await drawnMarchers(page);
    const { zoom } = (await readField(page)).viewport;
    return {
        x: marcher.screen.x + (p.x - marcher.x) * zoom,
        y: marcher.screen.y + (p.y - marcher.y) * zoom,
    };
}

/** What the shape tool draws once its spots have settled (they glide for about 150 ms) */
async function shapeOverlay(page: Page): Promise<FieldTestShapeOverlay | null> {
    await page.waitForFunction(
        () => window.fieldTest!.shapeOverlay!()?.gliding !== true,
    );
    return page.evaluate(() => window.fieldTest!.shapeOverlay!());
}

/** How many shapes the show has saved */
const savedShapes = async (show: Show) => {
    const [row] = await show.query<{ count: number }>(
        "SELECT COUNT(*) AS count FROM timeline_shape_recipes",
    );
    return row.count;
};

const preview = (page: Page) => page.getByTestId("shape-tool-readout");

/** The clipboard chip in the field's bottom-left corner (#961) */
const chip = (page: Page) => page.getByTestId("clipboard-chip");

/**
 * The whole chip: a rested one (only its picture) is woken with a click, which on desktop opens
 * its card, folded again with Escape
 */
async function wakeChip(page: Page) {
    const rested = page.getByTestId("clipboard-chip-rested");
    if (await rested.isVisible()) {
        await rested.click();
        const card = page.getByTestId("clipboard-section");
        if (await card.isVisible()) await page.keyboard.press("Escape");
    }
    await expect(page.getByTestId("clipboard-chip-toggle")).toBeVisible();
}

/** Opens the chip's Clipboard card, unless it's open already, and returns it */
async function openCard(page: Page) {
    const card = page.getByTestId("clipboard-section");
    if (!(await card.isVisible())) {
        const rested = page.getByTestId("clipboard-chip-rested");
        if (await rested.isVisible()) await rested.click();
        if (!(await card.isVisible()))
            await page.getByTestId("clipboard-chip-toggle").click();
    }
    await expect(card).toBeVisible();
    return card;
}

/** Takes the focus off the chip, so the field's own keys (Escape) reach it */
const blur = (page: Page) =>
    page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

const toasts = (page: Page) => page.locator("[data-sonner-toast]");

/** How many undo steps the show has. */
const undoSteps = async (show: Show) => {
    const [row] = await show.query<{ count: number }>(
        "SELECT COUNT(DISTINCT history_group) AS count FROM history_undo",
    );
    return row.count;
};

/** Selects exactly the trumpets `ids`, by clicking the first and Shift+clicking the rest */
async function select(page: Page, ids: readonly number[]) {
    // Never the second click of a double-click, which would go inside a placed shape
    await page.waitForTimeout(550);
    for (const [i, id] of ids.entries())
        await clickMarcher(page, `T${id}`, { add: i > 0 });
    await expect
        .poll(async () =>
            [...(await readField(page)).selection].sort((a, b) => a - b),
        )
        .toEqual([...ids].sort((a, b) => a - b));
}

/** Where the trumpets `ids` are saved at Home */
const savedAt = async (show: Show, ids: readonly number[]) =>
    (await savedPositions(show, 0)).filter((p) => ids.includes(p.id));

/**
 * Draws a 2 × 2 box, 2 steps between neighbors, with T1 to T4 and places it. Returns its spots.
 * Unless `settle` is false, waits until it's saved and selected whole.
 */
async function placeBox(show: Show, { settle = true } = {}): Promise<Point[]> {
    const { page } = show;
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    await select(page, [1, 2, 3, 4]);
    await page.keyboard.press("b");
    await expect(page.getByTestId("shape-tool-hint")).toBeVisible();
    const from = await toScreen(page, { x: cf.x - 16 * S, y: cf.y - 26 * S });
    const to = await toScreen(page, { x: cf.x - 14 * S, y: cf.y - 24 * S });
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.up();
    await expect(preview(page)).toBeVisible();
    const spots = (await shapeOverlay(page))!.spots;
    expect(spots).toHaveLength(4);
    await page.keyboard.press("Enter");
    if (!settle) return spots;
    await expect(preview(page)).toBeHidden();
    await expect.poll(() => savedShapes(show)).toBe(1);
    // Placed, it's selected whole
    await expect(page.getByTestId("placed-box-readout-text")).toBeVisible();
    await waitForIdle(page);
    return spots;
}

test.beforeEach(async ({ show }) => {
    await expectCanvasMatchesShow(show);
});

test("a placed box copied and pasted onto other marchers previews centered on them, moving nobody; Enter places a second live box as one undo step", async ({
    show,
}) => {
    const { page } = show;
    const boxSpots = await placeBox(show);
    // The box just placed is selected whole: its four members
    await expect
        .poll(async () => (await readField(page)).selection.length)
        .toBe(4);
    await page.keyboard.press("ControlOrMeta+c");
    await expect(page.getByTestId("clipboard-chip-kind")).toHaveText("Box");

    await select(page, [5, 6, 7, 8]);
    const steps = await undoSteps(show);
    const before = await savedAt(show, [5, 6, 7, 8]);
    await page.keyboard.press("ControlOrMeta+v");
    await expect(preview(page)).toBeVisible();
    const overlay = (await shapeOverlay(page))!;
    expect(overlay.spots).toHaveLength(4);
    // The same box, moved as a whole by half steps
    const S = (await fieldGrid(show)).pixelsPerStep;
    const a = sorted(boxSpots);
    const b = sorted(overlay.spots);
    const by = { x: b[0].x - a[0].x, y: b[0].y - a[0].y };
    expect(Math.abs(by.x) + Math.abs(by.y)).toBeGreaterThan(S);
    for (const v of [by.x, by.y])
        expect(Math.abs(v / (S / 2) - Math.round(v / (S / 2)))).toBeLessThan(
            CLOSE,
        );
    b.forEach((spot, i) =>
        expect(near(spot, { x: a[i].x + by.x, y: a[i].y + by.y })).toBe(true),
    );
    // Centered on the receiving marchers: within a quarter step of their middle
    const xs = before.map((p) => p.x);
    const ys = before.map((p) => p.y);
    const middle = {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
    const at = {
        x: (b[0].x + b[3].x) / 2,
        y:
            (Math.min(...b.map((s) => s.y)) + Math.max(...b.map((s) => s.y))) /
            2,
    };
    expect(Math.abs(at.x - middle.x)).toBeLessThanOrEqual(S / 4 + CLOSE);
    expect(Math.abs(at.y - middle.y)).toBeLessThanOrEqual(S / 4 + CLOSE);
    // Nobody has moved and nothing is saved yet
    await waitForIdle(page);
    expect(await savedAt(show, [5, 6, 7, 8])).toEqual(before);
    expect(await undoSteps(show)).toBe(steps);

    await page.keyboard.press("Enter");
    await expect(preview(page)).toBeHidden();
    await expect
        .poll(async () => sorted(await savedAt(show, [5, 6, 7, 8])))
        .toEqual(b);
    await expect.poll(() => savedShapes(show)).toBe(2);
    await waitForIdle(page);
    expect(await undoSteps(show)).toBe(steps + 1);
    // The copied marchers stayed where they were
    expect(sorted(await savedAt(show, [1, 2, 3, 4]))).toEqual(a);

    // One undo puts the four back and takes the second box away
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(async () => savedAt(show, [5, 6, 7, 8])).toEqual(before);
    await expect.poll(() => savedShapes(show)).toBe(1);
});

test("Copy right after Place copies the box, and pasting it again onto the same marchers changes nothing and costs no undo step", async ({
    show,
}) => {
    const { page } = show;
    const spots = await placeBox(show, { settle: false });
    // Copied the moment the shape tool closes, before the box is read back
    await expect(preview(page)).toBeHidden();
    await page.keyboard.press("ControlOrMeta+c");
    await expect(page.getByTestId("clipboard-chip-kind")).toHaveText("Box");
    await expect.poll(() => savedShapes(show)).toBe(1);
    await waitForIdle(page);

    const steps = await undoSteps(show);
    await page.keyboard.press("ControlOrMeta+v");
    await expect(preview(page)).toBeVisible();
    expect(sorted((await shapeOverlay(page))!.spots)).toEqual(sorted(spots));
    await page.keyboard.press("Enter");
    await expect(preview(page)).toBeHidden();
    await waitForIdle(page);
    expect(await undoSteps(show)).toBe(steps);
    expect(await savedShapes(show)).toBe(1);
    expect(sorted(await savedAt(show, [1, 2, 3, 4]))).toEqual(sorted(spots));

    // So one undo takes the box itself away
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => savedShapes(show)).toBe(0);
    await expect
        .poll(async () => savedAt(show, [1, 2, 3, 4]))
        .toEqual(asPositions(HOME.slice(0, 4)));
});

test("a box pasted onto fewer marchers is laid out for them with its spacing kept, and Escape discards the preview", async ({
    show,
}) => {
    const { page } = show;
    const boxSpots = sorted(await placeBox(show));
    await page.keyboard.press("ControlOrMeta+c");
    await select(page, [5, 6, 7]);
    const steps = await undoSteps(show);
    await blur(page);
    await page.keyboard.press("ControlOrMeta+Shift+v");
    await expect(preview(page)).toBeVisible();
    const spots = sorted((await shapeOverlay(page))!.spots);
    expect(spots).toHaveLength(3);
    // The same interval between neighbors as the box copied
    const gap = boxSpots[2].x - boxSpots[0].x;
    expect(gap).toBeGreaterThan(0);
    // Two files still, the same distance apart; the short rank's one marcher stands centered
    const xs = spots.map((s) => s.x);
    expect(Math.abs(xs[2] - xs[0] - gap)).toBeLessThan(CLOSE);
    expect(Math.abs(xs[1] - (xs[0] + xs[2]) / 2)).toBeLessThan(CLOSE);
    const ys = [...new Set(spots.map((s) => s.y))];
    expect(ys).toHaveLength(2);
    expect(Math.abs(Math.abs(ys[1] - ys[0]) - gap)).toBeLessThan(CLOSE);

    await page.keyboard.press("Escape");
    await expect(preview(page)).toBeHidden();
    await waitForIdle(page);
    expect(await savedAt(show, [5, 6, 7])).toEqual(
        asPositions(HOME).filter((p) => [5, 6, 7].includes(p.id)),
    );
    expect(await undoSteps(show)).toBe(steps);
    expect(await savedShapes(show)).toBe(1);
});

test("loose dots pasted exactly onto fewer marchers take the nearest dots, draw the rest as empty spots and stay plain marchers", async ({
    show,
}) => {
    const { page } = show;
    await select(page, [1, 2, 3, 4]);
    await page.keyboard.press("ControlOrMeta+c");
    await expect(chip(page)).toContainText("4 marchers");

    await select(page, [5, 6]);
    const steps = await undoSteps(show);
    await page.keyboard.press("ControlOrMeta+Shift+v");
    await expect(preview(page)).toBeVisible();
    const overlay = (await shapeOverlay(page))!;
    const spots = sorted(overlay.spots);
    // T5 and T6 stand nearest T1's and T2's dots
    expect(spots).toEqual(
        sorted([
            { x: 500, y: 300 },
            { x: 600, y: 350 },
        ]),
    );
    // The other two dots are drawn as empty spots while the paste is open
    expect(sorted(overlay.emptySpots)).toEqual(
        sorted([
            { x: 700, y: 280 },
            { x: 800, y: 400 },
        ]),
    );
    await expect(page.getByTestId("fieldShapeEmptySpot")).toHaveCount(2);
    await page.keyboard.press("Enter");
    await expect(preview(page)).toBeHidden();
    await expect(page.getByTestId("fieldShapeEmptySpot")).toHaveCount(0);
    await expect
        .poll(async () => sorted(await savedAt(show, [5, 6])))
        .toEqual(spots);
    await waitForIdle(page);
    expect(await undoSteps(show)).toBe(steps + 1);
    // No shape was saved, and nobody else moved
    expect(await savedShapes(show)).toBe(0);
    expect(await savedAt(show, [1, 2, 3, 4, 7, 8])).toEqual(
        asPositions(HOME).filter((p) => ![5, 6].includes(p.id)),
    );
});

test("loose dots pasted onto more marchers: the nearest take the dots, the rest stay put, and a screen reader hears how many", async ({
    show,
}) => {
    const { page } = show;
    await select(page, [1, 2]);
    await page.keyboard.press("ControlOrMeta+c");
    await select(page, [3, 4, 5, 6, 7, 8]);
    await page.keyboard.press("ControlOrMeta+v");
    await expect(preview(page)).toBeVisible();
    // No toast: the chip warned before the paste, and a screen reader hears it with the preview
    await expect(toasts(page)).toHaveCount(0);
    await expect(page.getByTestId("clipboard-live")).toHaveText(
        "4 marchers have no spot and stay put. Paste preview. Enter places it, Escape discards it.",
    );
    const spots = sorted((await shapeOverlay(page))!.spots);
    expect(spots).toHaveLength(2);
    await page.keyboard.press("Enter");
    await expect(preview(page)).toBeHidden();
    await waitForIdle(page);
    const after = await savedAt(show, [3, 4, 5, 6, 7, 8]);
    const home = asPositions(HOME);
    const moved = after.filter(
        (p) => !near(p, home.find((h) => h.id === p.id)!),
    );
    expect(sorted(moved)).toEqual(spots);
    expect(moved).toHaveLength(2);
});

test("the copied picture is the app's own: still there after a reload", async ({
    show,
}) => {
    const { page } = show;
    await select(page, [1, 2, 3, 4]);
    await page.keyboard.press("ControlOrMeta+c");
    await expect(chip(page)).toContainText("4 marchers");
    await page.reload();
    await waitForField(page);
    await expectCanvasMatchesShow(show);
    await select(page, [5, 6, 7, 8]);
    await page.keyboard.press("ControlOrMeta+v");
    await expect(preview(page)).toBeVisible();
    expect((await shapeOverlay(page))!.spots).toHaveLength(4);
});

test("the field menu offers Copy, Paste and Paste exactly: the pastes only once something is copied, saying why", async ({
    show,
}) => {
    const { page } = show;
    const menu = page.getByTestId("field-menu");
    const item = (id: string) => page.getByTestId(`field-menu-${id}`);
    const openOn = async (drillNumber: string) => {
        const marcher = (await drawnMarchers(page)).find(
            (m) => m.drillNumber === drillNumber,
        )!;
        await page.mouse.click(marcher.screen.x, marcher.screen.y, {
            button: "right",
        });
        await expect(menu).toBeVisible();
    };
    await select(page, [1, 2]);
    await openOn("T1");
    await expect(item("copyFormation")).toBeEnabled();
    await expect(item("pasteFormation")).toBeDisabled();
    await expect(item("pasteFormationInPlace")).toBeDisabled();
    // Greyed out, they say why behind a ?
    for (const id of ["pasteFormation", "pasteFormationInPlace"])
        await expect(page.getByTestId(`field-menu-${id}-reason`)).toHaveText(
            "Copy marchers first",
        );
    await item("copyFormation").click();
    await expect(menu).toBeHidden();
    await expect(chip(page)).toContainText("2 marchers");

    await select(page, [5, 6]);
    await openOn("T5");
    await expect(item("pasteFormation")).toBeEnabled();
    await expect(item("pasteFormationInPlace")).toBeEnabled();
    await item("pasteFormation").click();
    await expect(preview(page)).toBeVisible();
    expect((await shapeOverlay(page))!.spots).toHaveLength(2);
});

test("the Clipboard card shows what is copied and how it fits the selection", async ({
    show,
}) => {
    const { page } = show;
    await expect(chip(page)).toBeHidden();

    // Positions: so many spots, checked against the selection
    await select(page, [1, 2, 3, 4]);
    await page.keyboard.press("ControlOrMeta+c");
    const card = await openCard(page);
    await expect(card.getByTestId("clipboard-kind")).toHaveText("Positions");
    await expect(card.getByTestId("clipboard-count")).toHaveText("4 marchers");
    await expect(card.getByTestId("clipboard-picture")).toHaveAttribute(
        "data-dots",
        "4",
    );
    await expect(card.getByTestId("clipboard-fit")).toHaveText(
        "Fits the 4 marchers selected",
    );
    await select(page, [5, 6]);
    await expect(card.getByTestId("clipboard-fit")).toHaveText(
        "With 2 selected, 2 spots stay empty",
    );
    await select(page, [3, 4, 5, 6, 7, 8]);
    await expect(card.getByTestId("clipboard-fit")).toHaveText(
        "2 selected marchers have no spot and stay put",
    );

    // With nobody selected the line says how many it takes; the buttons stay put
    const pasteAt = await card.getByTestId("clipboard-paste").boundingBox();
    await blur(page);
    await page.keyboard.press("Escape");
    await expect
        .poll(async () => (await readField(page)).selection.length)
        .toBe(0);
    await expect(card.getByTestId("clipboard-fit")).toHaveText(
        "Fills 4 spots: select 4 marchers to fill them all",
    );
    // The card grows up from the corner: the buttons above the line don't move
    expect(await card.getByTestId("clipboard-paste").boundingBox()).toEqual(
        pasteAt,
    );
    await select(page, [3, 4, 5, 6, 7, 8]);

    // Paste exactly's tooltip explains it, under its name
    await card.getByTestId("clipboard-paste-in-place").hover();
    await expect(page.getByRole("tooltip")).toContainText(
        "Puts the copy on the exact spot it was copied from",
    );
    await page.mouse.move(5, 500);
    // Its Paste opens the preview, as Ctrl/Cmd+V does, and folds the card
    await card.getByTestId("clipboard-paste").click();
    await expect(preview(page)).toBeVisible();
    await expect(card).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(preview(page)).toBeHidden();

    // A shape: any number
    await placeBox(show);
    await page.keyboard.press("ControlOrMeta+c");
    await openCard(page);
    await expect(card.getByTestId("clipboard-kind")).toHaveText("Box");
    await blur(page);
    await page.keyboard.press("Escape");
    await expect(card.getByTestId("clipboard-fit")).toHaveText(
        "Pastes onto any number of marchers, keeping its spacing",
    );
    await select(page, [5, 6, 7]);
    await expect(card.getByTestId("clipboard-fit")).toHaveText(
        "Laid out for the 3 marchers selected",
    );
    // Its picture is laid out for them too
    await expect(card.getByTestId("clipboard-picture")).toHaveAttribute(
        "data-dots",
        "3",
    );
});

test("a copied box switched to Positions on the Clipboard card pastes onto its exact spots as plain marchers", async ({
    show,
}) => {
    const { page } = show;
    const boxSpots = sorted(await placeBox(show));
    await page.keyboard.press("ControlOrMeta+c");
    const card = await openCard(page);
    await expect(card.getByTestId("clipboard-kind")).toHaveText("Box");
    await card.getByTestId("clipboard-paste-as-positions").click();
    await expect(card.getByTestId("clipboard-kind")).toHaveText(
        "Box positions",
    );
    await expect(card.getByTestId("clipboard-fit")).toHaveText(
        "Fits the 4 marchers selected",
    );
    await select(page, [5, 6, 7]);
    await expect(card.getByTestId("clipboard-fit")).toHaveText(
        "With 3 selected, 1 spot stays empty",
    );
    await blur(page);
    await page.keyboard.press("ControlOrMeta+Shift+v");
    await expect(preview(page)).toBeVisible();
    const spots = sorted((await shapeOverlay(page))!.spots);
    expect(spots).toHaveLength(3);
    for (const spot of spots)
        expect(boxSpots.some((b) => near(b, spot))).toBe(true);
    await page.keyboard.press("Enter");
    await expect(preview(page)).toBeHidden();
    await expect
        .poll(async () => sorted(await savedAt(show, [5, 6, 7])))
        .toEqual(spots);
    await waitForIdle(page);
    // Plain marchers: still only the first box is saved
    expect(await savedShapes(show)).toBe(1);

    // A click on T1 selects its whole box again
    await page.waitForTimeout(550);
    await clickMarcher(page, "T1");
    await expect
        .poll(async () => (await readField(page)).selection.length)
        .toBe(4);
    await page.keyboard.press("ControlOrMeta+c");
    await openCard(page);
    await expect(card.getByTestId("clipboard-paste-as-shape")).toHaveAttribute(
        "data-state",
        "on",
    );
});

test("pasted exactly again as the shape onto marchers already on its spots, each keeps their own spot", async ({
    show,
}) => {
    const { page } = show;
    const boxSpots = sorted(await placeBox(show));
    await page.keyboard.press("ControlOrMeta+c");
    const card = await openCard(page);
    await card.getByTestId("clipboard-paste-as-positions").click();
    await select(page, [5, 6, 7, 8]);
    await blur(page);
    await page.keyboard.press("ControlOrMeta+Shift+v");
    await expect(preview(page)).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(preview(page)).toBeHidden();
    await expect
        .poll(async () => sorted(await savedAt(show, [5, 6, 7, 8])))
        .toEqual(boxSpots);
    await waitForIdle(page);
    const standing = await savedAt(show, [5, 6, 7, 8]);

    await openCard(page);
    await card.getByTestId("clipboard-paste-as-shape").click();
    await blur(page);
    await page.keyboard.press("ControlOrMeta+Shift+v");
    await expect(preview(page)).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(preview(page)).toBeHidden();
    await expect.poll(() => savedShapes(show)).toBe(2);
    await waitForIdle(page);
    expect(await savedAt(show, [5, 6, 7, 8])).toEqual(standing);
});

test("the Clipboard chip sits in the field's bottom-left corner, says Copied, opens its card folded after a reload, and Clear empties it", async ({
    show,
}) => {
    const { page } = show;
    await select(page, [1, 2, 3, 4]);
    await page.keyboard.press("ControlOrMeta+c");
    await expect(chip(page)).toBeVisible();
    // No toast: the chip says it for a moment, and a screen reader hears it
    await expect(page.getByTestId("clipboard-chip-status")).toHaveText(
        "Copied",
    );
    await expect(page.getByTestId("clipboard-live")).toHaveText(
        "Copied Positions, 4 marchers",
    );
    await expect(toasts(page)).toHaveCount(0);
    await expect(page.getByTestId("clipboard-chip-status")).toHaveText(
        "Fits the 4 selected",
    );
    // In the field's bottom-left corner
    const field = (await page.getByTestId("threeField").boundingBox())!;
    const at = (await chip(page).boundingBox())!;
    expect(at.x - field.x).toBeLessThan(20);
    expect(field.y + field.height - (at.y + at.height)).toBeLessThan(20);
    // Not in the inspector any more
    await expect(page.getByTestId("clipboard-section")).toBeHidden();

    // Opened, then a reload: it starts folded again
    await openCard(page);
    await page.reload();
    await waitForField(page);
    await expect(chip(page)).toBeVisible();
    await expect(page.getByTestId("clipboard-section")).toBeHidden();
    // A copy kept from before starts rested: only its picture, which still says what it is
    await expect(chip(page)).toHaveAttribute("data-rested", "true");
    await expect(page.getByTestId("clipboard-chip-rested")).toHaveAttribute(
        "aria-label",
        /^Clipboard: Positions, 4 marchers\./,
    );

    // Escape inside the card folds it, and leaves the selection alone
    await select(page, [5, 6]);
    await openCard(page);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("clipboard-section")).toBeHidden();
    expect((await readField(page)).selection.length).toBe(2);
    // ... and gives the focus back to the chip's button, so the keyboard keeps its place
    await expect(page.getByTestId("clipboard-chip-toggle")).toBeFocused();

    // Clear (the chip's X): nothing to paste, and the chip goes
    if (test.info().project.name !== "browser-touch")
        await page.getByTestId("clipboard-chip-toggle").hover();
    await page.getByTestId("clipboard-chip-clear").click();
    await expect(chip(page)).toBeHidden();
    await expect(page.getByTestId("clipboard-live")).toHaveText(
        "Clipboard cleared",
    );
    await expectCanvasMatchesShow(show);
    await select(page, [5, 6]);
    await page.keyboard.press("ControlOrMeta+v");
    await expect(preview(page)).toBeHidden();
    await page.reload();
    await waitForField(page);
    await expect(chip(page)).toBeHidden();
});

test("the chip's line says how the copy fits or why Paste can't run, its Paste is touch only, and a Paste leaves Enter to place", async ({
    show,
}) => {
    const { page } = show;
    await select(page, [1, 2, 3, 4]);
    await page.keyboard.press("ControlOrMeta+c");
    const status = page.getByTestId("clipboard-chip-status");
    // Nobody selected: why Paste can't run, without hovering
    await blur(page);
    await page.keyboard.press("Escape");
    await wakeChip(page);
    await expect(status).toHaveText("Select the marchers to paste onto");
    // Two selected: a warning that two spots stay empty
    await select(page, [5, 6]);
    await wakeChip(page);
    await expect(status).toHaveText("2 spots stay empty");
    await expect(status).toHaveAttribute("data-status", "emptySpots");
    // The chip's picture still shows all four copied dots
    await expect(page.getByTestId("clipboard-chip-picture")).toHaveAttribute(
        "data-dots",
        "4",
    );

    // The chip's own Paste is a tablet's one-tap paste; desktop has Ctrl/Cmd+V and the menu
    const touch = test.info().project.name === "browser-touch";
    await expect(page.getByTestId("clipboard-chip-paste")).toHaveCount(
        touch ? 1 : 0,
    );
    if (touch) {
        // The pill keeps clear of the chip (#927)
        const pill = (await page
            .getByTestId("touch-modifier-buttons")
            .boundingBox())!;
        const at = (await chip(page).boundingBox())!;
        const apart =
            pill.x >= at.x + at.width ||
            at.x >= pill.x + pill.width ||
            pill.y >= at.y + at.height ||
            at.y >= pill.y + pill.height;
        expect(apart).toBe(true);
    }
    // A paste opened with the focus inside the chip (its button on a tablet; Ctrl/Cmd+V with
    // the card's switch focused on desktop) leaves the focus off the chip: Enter places it
    if (touch) {
        await wakeChip(page);
        await page.getByTestId("clipboard-chip-paste").click();
    } else {
        const card = await openCard(page);
        await card.getByTestId("clipboard-fold").focus();
        await page.keyboard.press("ControlOrMeta+v");
    }
    await expect(preview(page)).toBeVisible();
    // Mid-paste, the chip says what to do, not why Paste can't run
    await expect(status).toHaveText("Place or discard the open shape");
    await expect(status).toHaveAttribute("data-status", "shapeOpen");
    await expect(page.getByTestId("clipboard-live")).toHaveText(
        "2 spots stay empty. Paste preview. Enter places it, Escape discards it.",
    );
    const focusedInChip = await page.evaluate(
        () =>
            !!document
                .querySelector('[data-testid="clipboard-chip"]')
                ?.contains(document.activeElement),
    );
    expect(focusedInChip).toBe(false);
    await page.keyboard.press("Enter");
    await expect(preview(page)).toBeHidden();
    // Placed, it says how the copy fits again
    await expect(status).toHaveText("2 spots stay empty");
});

test("a drag on the field near the chip fades it out of the way", async ({
    show,
}) => {
    const { page } = show;
    await select(page, [1, 2, 3, 4]);
    await page.keyboard.press("ControlOrMeta+c");
    await expect(chip(page)).toBeVisible();
    const at = (await chip(page).boundingBox())!;
    // A marquee from the empty field above the chip, down beside it
    const from = { x: at.x + at.width + 120, y: at.y - 160 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    // To just above its left end: near it whether it's whole or has rested to its picture
    await page.mouse.move(at.x + 10, at.y - 20, { steps: 12 });
    await expect(chip(page)).toHaveAttribute("data-faded", "true");
    await page.mouse.up();
    await expect(chip(page)).not.toHaveAttribute("data-faded", "true");
});

test("the chip rests to its picture after a while, wakes when the selection changes, and its picture opens the card", async ({
    show,
}) => {
    const { page } = show;
    const touch = test.info().project.name === "browser-touch";
    await select(page, [1, 2, 3, 4]);
    await page.keyboard.press("ControlOrMeta+c");
    await expect(page.getByTestId("clipboard-chip-toggle")).toBeVisible();
    await page.mouse.move(5, 500);
    // Five seconds with nothing done with it: only the picture
    await expect(chip(page)).toHaveAttribute("data-rested", "true", {
        timeout: 8000,
    });
    await expect(page.getByTestId("clipboard-chip-status")).toBeHidden();
    // Choosing who to paste onto shows it whole, with how the copy fits them
    await select(page, [5, 6]);
    await expect(page.getByTestId("clipboard-chip-status")).toHaveText(
        "2 spots stay empty",
    );
    await page.mouse.move(5, 500);
    await expect(chip(page)).toHaveAttribute("data-rested", "true", {
        timeout: 8000,
    });
    if (!touch) {
        // Its tooltip says what's copied and what a click does
        await page.getByTestId("clipboard-chip-rested").hover();
        await expect(page.getByRole("tooltip")).toContainText(
            "Clipboard: Positions, 4 marchers · Show details",
        );
    }
    // A click on the picture: the card at once on desktop; the whole chip on a tablet
    await page.getByTestId("clipboard-chip-rested").click();
    if (touch)
        await expect(page.getByTestId("clipboard-chip-toggle")).toBeVisible();
    else {
        const card = page.getByTestId("clipboard-section");
        await expect(card).toBeVisible();
        // The card has no Clear of its own: the chip's X clears
        await expect(card.getByTestId("clipboard-clear")).toHaveCount(0);
        await page.keyboard.press("Escape");
        // Folded with the keyboard, the focus is back on the chip, which holds it whole
        await blur(page);
    }
    // Rested again, a new copy shows the whole chip
    await page.mouse.move(5, 500);
    await expect(chip(page)).toHaveAttribute("data-rested", "true", {
        timeout: 8000,
    });
    await page.keyboard.press("ControlOrMeta+c");
    await expect(page.getByTestId("clipboard-chip-status")).toHaveText(
        "Copied",
    );
});

test("the chip's X clears the clipboard: on hover on desktop, on the whole chip on a tablet", async ({
    show,
}) => {
    const { page } = show;
    const touch = test.info().project.name === "browser-touch";
    await select(page, [1, 2, 3, 4]);
    await page.keyboard.press("ControlOrMeta+c");
    const clear = page.getByTestId("clipboard-chip-clear");
    if (touch) {
        await expect(clear).toBeVisible();
    } else {
        // Hidden until the chip is pointed at
        await page.mouse.move(5, 500);
        await expect(clear).toBeHidden();
        await page.getByTestId("clipboard-chip-toggle").hover();
        await expect(clear).toBeVisible();
    }
    await clear.click();
    await expect(chip(page)).toBeHidden();
    await expect(page.getByTestId("clipboard-live")).toHaveText(
        "Clipboard cleared",
    );
});

test("an open paste that doesn't fit says so under its editor, and one that fits says nothing", async ({
    show,
}) => {
    const { page } = show;
    const notice = page.getByTestId("paste-fit-notice");
    await select(page, [1, 2, 3, 4]);
    await page.keyboard.press("ControlOrMeta+c");
    // Onto two: two spots stay empty
    await select(page, [5, 6]);
    await blur(page);
    await page.keyboard.press("ControlOrMeta+v");
    await expect(preview(page)).toBeVisible();
    await expect(notice).toHaveText("2 spots stay empty");
    await expect(notice).toHaveAttribute("data-fit", "emptySpots");
    // A screen reader hears it with the preview
    await expect(page.getByTestId("clipboard-live")).toHaveText(
        "2 spots stay empty. Paste preview. Enter places it, Escape discards it.",
    );
    await page.keyboard.press("Escape");
    await expect(preview(page)).toBeHidden();
    await expect(notice).toBeHidden();
    // Onto four: it fits, nothing to say
    await select(page, [5, 6, 7, 8]);
    await blur(page);
    await page.keyboard.press("ControlOrMeta+v");
    await expect(preview(page)).toBeVisible();
    await expect(notice).toBeHidden();
    await page.keyboard.press("Escape");
    // Onto six: two marchers have no spot
    await select(page, [3, 4, 5, 6, 7, 8]);
    await blur(page);
    await page.keyboard.press("ControlOrMeta+v");
    await expect(notice).toHaveText("2 marchers have no spot");
    await expect(notice).toHaveAttribute("data-fit", "leftOut");
});

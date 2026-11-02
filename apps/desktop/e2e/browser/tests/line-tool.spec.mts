import type { Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    drawnMarchers,
    expectCanvasMatchesShow,
    readField,
    waitForIdle,
} from "../app.mjs";
import { fieldGrid, savedPositions, type Position } from "../positions.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";
import type { FieldTestShapeOverlay } from "../../../src/field/fieldTestApi";

// The Line (#523, spec #522): L opens it on the selected marchers, a drag draws
// a straight line in Fit (its interval worked out), typing an interval sizes it
// (the line grows from its pivot) and the lock beside it keeps it, the spacing
// menu offers Interval on the path, Enter places it as one undo step, and a
// click on a member reopens it, where a dragged end saves on release with the
// interval kept. A typed list (#526) spaces it in groups of marchers, each a
// chip in the editor. Unlocked, a dragged end snaps the interval to whole
// steps; Offset sets both ways at once.

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

/** Positions are saved to three decimals. */
const CLOSE = 1e-3;

const asPositions = (rows: readonly SeedPosition[]): Position[] =>
    rows.map(([id, x, y]) => ({ id, x, y }));

/** Where field point `p` is drawn in the viewport, from where the marchers are drawn. */
async function toScreen(page: Page, p: Point): Promise<Point> {
    const [marcher] = await drawnMarchers(page);
    const { zoom } = (await readField(page)).viewport;
    return {
        x: marcher.screen.x + (p.x - marcher.x) * zoom,
        y: marcher.screen.y + (p.y - marcher.y) * zoom,
    };
}

/** What the shape tool draws once its spots have glided to where they're going */
async function shapeOverlay(page: Page): Promise<FieldTestShapeOverlay | null> {
    await page.waitForFunction(
        () => window.fieldTest!.shapeOverlay!()?.gliding !== true,
    );
    return page.evaluate(() => window.fieldTest!.shapeOverlay!());
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

const recipes = (show: Show) =>
    show.query<{ kind: string; kind_version: number; params: string }>(
        "SELECT kind, kind_version, params FROM timeline_shape_recipes ORDER BY id",
    );

const onSpots = async (show: Show, spots: readonly Point[]) =>
    (await savedPositions(show, 0)).every((p) =>
        spots.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < CLOSE),
    );

/** The spots in order along x, and the distance between each and the next */
function gaps(spots: readonly Point[]): number[] {
    const sorted = [...spots].sort((a, b) => a.x - b.x);
    return sorted
        .slice(1)
        .map((p, i) => Math.hypot(p.x - sorted[i]!.x, p.y - sorted[i]!.y));
}

const interval = (page: Page, readout: string) =>
    page.getByTestId(readout).getByTestId("shape-editor-interval").innerText();

test("change: L draws a Fit line, a typed interval sizes it and the lock keeps it, Enter places it as one undo step, and a member reopens it", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;

    // In the Shapes tab after Box and Circle, greyed out with nobody selected
    await page.getByRole("tab", { name: "Shapes" }).click();
    const line = page.getByTestId("shapes-tab-line");
    await expect(line).toHaveAccessibleName("Line");
    await expect(line).toBeDisabled();
    await expect(page.getByTestId("shapes-tab-reason")).toHaveText(
        "Select marchers first",
    );
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
    await expect(line).toBeEnabled();

    const steps = await undoSteps(show);
    await page.keyboard.press("l");
    await expect(page.getByTestId("shape-tool-hint")).toContainText(
        "draw a line",
    );

    // A drag 10½ steps long: 8 marchers, Fit, 1½ steps apart
    const y = cf.y - 20 * S;
    const from = { x: cf.x - 14 * S, y };
    const to = { x: cf.x - 3.5 * S, y };
    await drag(page, await toScreen(page, from), await toScreen(page, to));
    await expect.poll(() => interval(page, "shape-tool-readout")).toBe("1½");
    const spacing = page.getByTestId("shape-choice-spacing");
    await expect(spacing).toHaveAttribute("data-value", "fit");
    const drawn = (await shapeOverlay(page))!;
    expect(drawn.spots).toHaveLength(ALL.length);
    for (const gap of gaps(drawn.spots))
        expect(Math.abs(gap - 1.5 * S)).toBeLessThan(CLOSE);
    expect(drawn.handles).toHaveLength(2);

    // Typing 2 sizes the line to 14 steps from its pivot, its left end (ADR 0006,
    // decision 9), still unlocked; the lock beside the interval keeps it
    await page
        .getByTestId("shape-tool-readout")
        .getByTestId("shape-editor-interval")
        .click();
    await page.getByTestId("shape-editor-interval-input").fill("2");
    await page.keyboard.press("Enter");
    await expect.poll(() => interval(page, "shape-tool-readout")).toBe("2");
    await expect(spacing).toHaveAttribute("data-value", "fit");
    const lock = page
        .getByTestId("shape-tool-readout")
        .getByTestId("shape-editor-interval-lock");
    await expect(lock).toHaveAttribute("aria-pressed", "false");
    await lock.click();
    await expect(lock).toHaveAttribute("aria-pressed", "true");
    await expect(spacing).toHaveAttribute("data-value", "keep");
    const kept = (await shapeOverlay(page))!;
    for (const gap of gaps(kept.spots))
        expect(Math.abs(gap - 2 * S)).toBeLessThan(CLOSE);
    const xs = kept.spots.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(cf.x - 14 * S, 3);
    expect(Math.max(...xs)).toBeCloseTo(cf.x, 3);

    // The spacing menu offers Interval on the path, anchored three ways
    await spacing.click();
    const rows = page
        .getByTestId("shape-choice-spacing-content")
        .getByRole("menuitemradio");
    await expect(rows).toHaveText([
        "Fit",
        "Keep interval",
        "Interval on the path, from the start",
        "Interval on the path, centered",
        "Interval on the path, from the end",
    ]);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("shape-choice-spacing-content")).toBeHidden();
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();

    // Enter places everyone on the spots, positions and recipe as one undo step
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    await expect.poll(() => onSpots(show, kept.spots)).toBe(true);
    await waitForIdle(page);
    expect(await undoSteps(show)).toBe(steps + 1);
    const [recipe] = await recipes(show);
    expect([recipe.kind, recipe.kind_version]).toEqual(["line", 2]);
    // Locked, the line stores Keep interval
    const stored = JSON.parse(recipe.params);
    expect(stored.spacing.mode).toBe("keep");
    expect(stored.spacing.groups[0].interval).toBeCloseTo(2 * S);
    expect(stored.points).toHaveLength(2);

    // Undo takes back both; redo brings both back
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => savedPositions(show, 0)).toEqual(asPositions(HOME));
    await expect.poll(async () => (await recipes(show)).length).toBe(0);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect.poll(() => onSpots(show, kept.spots)).toBe(true);
    await expect.poll(async () => (await recipes(show)).length).toBe(1);
    await waitForIdle(page);

    // A click on a member reopens the line with the same points and interval
    await page.keyboard.press("Escape");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([]);
    const t3 = (await drawnMarchers(page)).find((m) => m.id === 3)!.screen;
    await page.mouse.click(t3.x, t3.y);
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
    await expect(page.getByTestId("placed-box-readout")).toBeVisible();
    await expect.poll(() => interval(page, "placed-box-readout")).toBe("2");
    await expect(page.getByTestId("shape-choice-spacing")).toHaveAttribute(
        "data-value",
        "keep",
    );
    // Its two handles are on the same ends
    const reopened = (await shapeOverlay(page))!;
    const ends = [
        await toScreen(page, { x: cf.x - 14 * S, y }),
        await toScreen(page, { x: cf.x, y }),
    ];
    const handles = [...reopened.handles].sort((a, b) => a.x - b.x);
    expect(handles).toHaveLength(2);
    handles.forEach((h, i) => {
        expect(Math.abs(h.x - ends[i]!.x)).toBeLessThan(1);
        expect(Math.abs(h.y - ends[i]!.y)).toBeLessThan(1);
    });

    // Its right end, dragged down, turns the line about its left end and saves
    // on release, everyone still 2 steps apart
    const right = [...reopened.handles].sort((a, b) => b.x - a.x)[0]!;
    const left = { x: cf.x - 14 * S, y };
    await drag(
        page,
        right,
        await toScreen(page, { x: left.x, y: left.y + 10 * S }),
    );
    await expect
        .poll(async () => {
            const rows = await recipes(show);
            const p = JSON.parse(rows.at(-1)!.params).points[1];
            return [Math.round((p.x - left.x) / S), Math.round((p.y - y) / S)];
        })
        .toEqual([0, 14]);
    await waitForIdle(page);
    const saved = await savedPositions(show, 0);
    const down = [...saved].sort((a, b) => a.y - b.y);
    for (let i = 1; i < down.length; i++) {
        expect(Math.abs(down[i]!.x - left.x)).toBeLessThan(CLOSE);
        expect(Math.abs(down[i]!.y - down[i - 1]!.y - 2 * S)).toBeLessThan(
            CLOSE,
        );
    }
});

test("change: Escape discards an open line and the show is untouched", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    const steps = await undoSteps(show);
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
    await page.keyboard.press("l");
    const y = cf.y - 20 * S;
    await drag(
        page,
        await toScreen(page, { x: cf.x - 14 * S, y }),
        await toScreen(page, { x: cf.x - 3.5 * S, y }),
    );
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    expect(await savedPositions(show, 0)).toEqual(asPositions(HOME));
    expect(await recipes(show)).toEqual([]);
    expect(await undoSteps(show)).toBe(steps);
});

// Turning a Line follows the box's rules (ADR 0006, decision 10): drawn either
// way it reads 0°, ↻ adds exactly a quarter to that, and the recipe stores the
// turn since it was drawn.
test("change: a line drawn right to left reads 0°, ↻ turns it to 90° square on the grid, and the recipe keeps the turn", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
    await page.keyboard.press("l");
    const y = cf.y - 20 * S;
    const from = { x: cf.x - 3.5 * S, y };
    const to = { x: cf.x - 14 * S, y };
    await drag(page, await toScreen(page, from), await toScreen(page, to));
    const rotation = page.getByTestId("shape-editor-rotation");
    await expect(rotation).toHaveText("0°");

    // ↻ turns it a quarter about its pivot, its left end, onto the grid
    await page.getByTestId("shape-editor-quarter-turn").click();
    await expect(rotation).toHaveText("90°");
    const turned = (await shapeOverlay(page))!;
    for (const h of turned.handles)
        expect(Math.abs(h.x - turned.handles[0]!.x)).toBeLessThan(1);

    await page.keyboard.press("Enter");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    await expect.poll(async () => (await recipes(show)).length).toBe(1);
    const [recipe] = await recipes(show);
    expect(JSON.parse(recipe.params).turn).toBe(90);
    // Every marcher stands on the step grid side to side, on the left end's x
    const saved = await savedPositions(show, 0);
    for (const p of saved) expect(Math.abs(p.x - to.x)).toBeLessThan(CLOSE);
});

// Measured (#527): a diagonal drawn from yard line to yard line starts in ↔,
// where a typed interval is how far apart neighbors are side to side, every
// saved x exactly that far from the last and on the step grid.
test("change: a diagonal from yard line to yard line is measured ↔, placing marchers an interval apart in x on the grid", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
    await page.keyboard.press("l");

    // From the 40 yard line to the 45, 6 steps deeper
    const from = { x: cf.x - 16 * S, y: cf.y - 24 * S };
    const to = { x: cf.x - 8 * S, y: cf.y - 18 * S };
    await drag(page, await toScreen(page, from), await toScreen(page, to));
    const measured = page.getByTestId("shape-choice-measured");
    await expect(measured).toHaveAttribute("data-value", "x");

    // The menu offers along the path and straight across too; ↕ is there,
    // this line going one way front to back as well
    await measured.click();
    const rows = page
        .getByTestId("shape-choice-measured-content")
        .getByRole("menuitemradio");
    await expect(rows).toHaveText([
        "Along the path",
        "Straight across",
        "Side to side",
        "Front to back",
        "Offset",
    ]);
    await expect(rows.nth(3)).not.toHaveAttribute("aria-disabled", "true");
    await expect(rows.nth(4)).not.toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");

    // 1½ steps side to side, grown from the left end, where a new Line's pivot is
    await page
        .getByTestId("shape-tool-readout")
        .getByTestId("shape-editor-interval")
        .click();
    await page.getByTestId("shape-editor-interval-input").fill("1.5");
    await page.keyboard.press("Enter");
    await expect.poll(() => interval(page, "shape-tool-readout")).toBe("1½");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    await waitForIdle(page);

    const [recipe] = await recipes(show);
    const stored = JSON.parse(recipe.params);
    expect(stored.measured).toBe("x");
    // Typed, the interval stays unlocked, kept as where the line started from
    expect(stored.spacing.mode).toBe("fit");
    expect(stored.spacing.groups[0].interval).toBeCloseTo(1.5 * S);
    const saved = [...(await savedPositions(show, 0))].sort(
        (a, b) => a.x - b.x,
    );
    expect(saved).toHaveLength(ALL.length);
    for (let i = 1; i < saved.length; i++)
        expect(Math.abs(saved[i]!.x - saved[i - 1]!.x - 1.5 * S)).toBeLessThan(
            CLOSE,
        );
    for (const p of saved) {
        const halves = ((p.x - cf.x) / S) * 2;
        expect(Math.abs(halves - Math.round(halves))).toBeLessThan(CLOSE);
    }
    // Still on the line as drawn
    const slope = (to.y - from.y) / (to.x - from.x);
    for (const p of saved)
        expect(Math.abs(p.y - (from.y + (p.x - from.x) * slope))).toBeLessThan(
            CLOSE * 2,
        );

    // Reopened, it's still ↔
    await page.keyboard.press("Escape");
    const t3 = (await drawnMarchers(page)).find((m) => m.id === 3)!.screen;
    await page.mouse.click(t3.x, t3.y);
    await expect(page.getByTestId("placed-box-readout")).toBeVisible();
    await expect(page.getByTestId("shape-choice-measured")).toHaveAttribute(
        "data-value",
        "x",
    );
});

// Splitting a segment (owner feedback on #596): the new corner holds a marcher,
// so it lands on the marcher spot nearest the segment's middle and the typed ↔
// interval stays as it was, though 7 gaps put the middle between two spots.
test("change: a click on a ↔ line's middle splits it on a marcher's spot, every marcher and the interval kept", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
    await page.keyboard.press("l");
    const from = { x: cf.x - 16 * S, y: cf.y - 24 * S };
    const to = { x: cf.x - 8 * S, y: cf.y - 18 * S };
    await drag(page, await toScreen(page, from), await toScreen(page, to));
    await expect(page.getByTestId("shape-choice-measured")).toHaveAttribute(
        "data-value",
        "x",
    );
    await page
        .getByTestId("shape-tool-readout")
        .getByTestId("shape-editor-interval")
        .click();
    await page.getByTestId("shape-editor-interval-input").fill("2");
    await page.keyboard.press("Enter");
    await expect.poll(() => interval(page, "shape-tool-readout")).toBe("2");

    const before = (await shapeOverlay(page))!;
    const [middle] = before.addHandles;
    await page.mouse.move(middle!.x, middle!.y, { steps: 4 });
    await page.mouse.click(middle!.x, middle!.y);
    await expect
        .poll(async () => (await shapeOverlay(page))!.handles.length)
        .toBe(3);
    const after = (await shapeOverlay(page))!;
    expect(after.spots).toHaveLength(before.spots.length);
    for (const s of before.spots)
        expect(
            after.spots.some((t) => Math.hypot(s.x - t.x, s.y - t.y) < CLOSE),
        ).toBe(true);
    const xs = after.spots.map((s) => s.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++)
        expect(Math.abs(xs[i]! - xs[i - 1]! - 2 * S)).toBeLessThan(CLOSE);
    expect(await interval(page, "shape-tool-readout")).toBe("2");
});

// The interval lock and Offset (owner decisions on #522, #527): unlocked, a
// dragged end changes the interval live in whole steps; Offset shows two
// numbers, typed or dragged, ↕ positive up the screen and dragged up and down
// through 0 (#596), the step drawn on the field while they're engaged; locked,
// an Offset line's ends don't move.
test("change: an unlocked end drag snaps the interval to whole steps live, Offset shows two numbers, and locked its ends stay", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
    await page.keyboard.press("l");

    // 8 marchers on a line 7 steps long: 1 step apart
    const y = cf.y - 20 * S;
    const from = { x: cf.x - 14 * S, y };
    await drag(
        page,
        await toScreen(page, from),
        await toScreen(page, { x: cf.x - 7 * S, y }),
    );
    const readout = page.getByTestId("shape-tool-readout");
    await expect.poll(() => interval(page, "shape-tool-readout")).toBe("1");
    const lock = readout.getByTestId("shape-editor-interval-lock");
    await expect(lock).toHaveAttribute("aria-pressed", "false");

    // Its right end dragged out: the readout changes while the drag goes on,
    // in whole steps (7 gaps, so 14 steps long is 2 apart)
    const right = [...(await shapeOverlay(page))!.handles].sort(
        (a, b) => b.x - a.x,
    )[0]!;
    await page.mouse.move(right.x, right.y);
    await page.mouse.down();
    const out = await toScreen(page, { x: from.x + 14.3 * S, y: y + 0.2 * S });
    await page.mouse.move(out.x, out.y, { steps: 12 });
    await expect.poll(() => interval(page, "shape-tool-readout")).toBe("2");
    await page.mouse.up();
    const after = (await shapeOverlay(page))!;
    for (const gap of gaps(after.spots))
        expect(Math.abs(gap - 2 * S)).toBeLessThan(CLOSE);

    // Measured as an offset: two numbers, each with its way after it
    const measured = page.getByTestId("shape-choice-measured");
    await measured.click();
    await page
        .getByTestId("shape-choice-measured-content")
        .getByRole("menuitemradio", { name: "Offset" })
        .click();
    await expect(measured).toHaveAttribute("data-value", "offset");
    await expect(readout.getByTestId("shape-editor-interval")).toBeHidden();
    await expect(readout.getByTestId("shape-editor-offsetX")).toHaveText("2");
    await expect(readout.getByTestId("shape-editor-offsetY")).toHaveText("0");
    await readout.getByTestId("shape-editor-offsetY").click();
    await page.getByTestId("shape-editor-offsetY-input").fill("1");
    await page.keyboard.press("Enter");
    await expect(readout.getByTestId("shape-editor-offsetY")).toHaveText("1");
    // Up the screen is more (#596): each next marcher to the right a step
    // toward the back, field y going down, from the left end where it started
    const rising = (await shapeOverlay(page))!;
    const left = [...rising.spots].sort((a, b) => a.x - b.x);
    expect(Math.abs(left[0]!.x - from.x)).toBeLessThan(CLOSE);
    expect(Math.abs(left[0]!.y - from.y)).toBeLessThan(CLOSE);
    for (let i = 1; i < left.length; i++) {
        expect(Math.abs(left[i]!.x - left[i - 1]!.x - 2 * S)).toBeLessThan(
            CLOSE,
        );
        expect(Math.abs(left[i - 1]!.y - left[i]!.y - S)).toBeLessThan(CLOSE);
    }

    // Pointed at, the numbers draw the step from the first marcher on the
    // field and light the pivot it grows from (#596)
    const offsetY = readout.getByTestId("shape-editor-offsetY");
    await offsetY.hover();
    await expect
        .poll(async () => (await shapeOverlay(page))!.offsetStep)
        .toMatchObject({ across: "↔ 2", deep: "↕ 1" });
    const step = (await shapeOverlay(page))!;
    expect(Math.abs(step.offsetStep!.from.x - from.x)).toBeLessThan(CLOSE);
    expect(Math.abs(step.offsetStep!.from.y - from.y)).toBeLessThan(CLOSE);
    expect(Math.abs(step.offsetStep!.to.y - (from.y - S))).toBeLessThan(CLOSE);
    expect(Math.abs(step.pivotPreview!.x - from.x)).toBeLessThan(CLOSE);

    // ↕ dragged down: through 0 to below it, toward the front, the step
    // following
    const box = (await offsetY.boundingBox())!;
    const grip = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(grip.x, grip.y);
    await page.mouse.down();
    await page.mouse.move(grip.x, grip.y + 36, { steps: 12 });
    await expect(offsetY).toHaveText("−1");
    await expect
        .poll(async () => (await shapeOverlay(page))!.offsetStep?.deep)
        .toBe("↕ −1");
    await page.mouse.up();
    await page.mouse.move(grip.x, grip.y - 200);
    await expect
        .poll(async () => (await shapeOverlay(page))!.offsetStep)
        .toBeNull();
    const diagonal = (await shapeOverlay(page))!;
    const sorted = [...diagonal.spots].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
        expect(Math.abs(sorted[i]!.x - sorted[i - 1]!.x - 2 * S)).toBeLessThan(
            CLOSE,
        );
        expect(Math.abs(sorted[i]!.y - sorted[i - 1]!.y - S)).toBeLessThan(
            CLOSE,
        );
    }

    // Locked, dragging an end changes nothing
    await lock.click();
    await expect(lock).toHaveAttribute("aria-pressed", "true");
    const end = [...diagonal.handles].sort((a, b) => b.x - a.x)[0]!;
    await drag(page, end, { x: end.x + 60, y: end.y + 60 });
    const still = (await shapeOverlay(page))!;
    expect(still.spots).toEqual(diagonal.spots);

    // Placed, it stores the offset
    await page.keyboard.press("Enter");
    await expect(readout).toBeHidden();
    await waitForIdle(page);
    const [recipe] = await recipes(show);
    const stored = JSON.parse(recipe.params);
    expect(stored.measured).toBe("offset");
    expect(stored.offset.x).toBeCloseTo(2 * S);
    expect(stored.offset.y).toBeCloseTo(S);
    // A new line's pivot is its left end (#596)
    expect(stored.pivot).toBe("w");
    expect(stored.spacing.mode).toBe("keep");
});

test("change: typing 2*3+4*2 spaces the line in groups, shown in the group menu, placed and reopened as typed", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
    await page.keyboard.press("l");
    const y = cf.y - 20 * S;
    await drag(
        page,
        await toScreen(page, { x: cf.x - 14 * S, y }),
        await toScreen(page, { x: cf.x - 3.5 * S, y }),
    );
    const readout = page.getByTestId("shape-tool-readout");
    await readout.getByTestId("shape-editor-interval").click();
    await page.getByTestId("shape-editor-interval-input").fill("2*3+4*2");
    await page.keyboard.press("Enter");

    // Two groups: one quiet button in place of the interval, which keeps the focus
    const menuButton = readout.getByTestId("shape-groups-menu");
    await expect(menuButton).toHaveText("Multiple intervals");
    await expect(menuButton).toBeFocused();
    await expect(readout.getByTestId("shape-editor-interval")).toBeHidden();
    await expect(readout.getByTestId("shape-groups")).toHaveCount(0);

    // 2 marchers at 3 steps, then the other 6 at 2: the last group grew by 2
    await menuButton.click();
    const menu = page.getByTestId("shape-groups-content");
    await expect(menu).toBeVisible();
    await expect(menu.getByTestId("shape-groups-list")).toHaveValue("2*3+4*2");
    await expect(menu.getByTestId("shape-group-0-marchers")).toHaveText(
        "First 2",
    );
    await expect(menu.getByTestId("shape-group-0-count")).toHaveText("2");
    await expect(menu.getByTestId("shape-group-0-interval")).toHaveText("3");
    await expect(menu.getByTestId("shape-group-1-marchers")).toHaveText(
        "Last 6",
    );
    await expect(menu.getByTestId("shape-group-1-count")).toHaveText("6");
    await expect(menu.getByTestId("shape-group-1-grown")).toHaveText("+2");
    await expect(menu.getByTestId("shape-group-1-interval")).toHaveText("2");
    const spaced = (await shapeOverlay(page))!;
    const expected = [3, 3, 2, 2, 2, 2, 2];
    const drawnGaps = gaps(spaced.spots);
    expect(drawnGaps).toHaveLength(expected.length);
    drawnGaps.forEach((gap, i) =>
        expect(Math.abs(gap - expected[i]! * S)).toBeLessThan(CLOSE),
    );

    // Open, the field rings every spot faintly in its group's color
    await expect
        .poll(async () =>
            (await shapeOverlay(page))!.groupMarks.map(
                (m) => `${m.group}${m.shade}`,
            ),
        )
        .toEqual([...Array(2).fill("0faint"), ...Array(6).fill("1faint")]);
    // A row pointed at lights its group, dims the other and labels its gap, and the seam with the
    // other group with the larger interval there
    await menu.getByTestId("shape-group-0-marchers").hover();
    await expect
        .poll(async () =>
            (await shapeOverlay(page))!.groupMarks.map(
                (m) => `${m.group}${m.shade}`,
            ),
        )
        .toEqual([...Array(2).fill("0lit"), ...Array(6).fill("1dim")]);
    const lit = (await shapeOverlay(page))!;
    expect(lit.groupLabels.map((l) => [l.text, l.seam])).toEqual([
        ["3", false],
        ["3", true],
    ]);
    const [a, b] = lit.groupMarks;
    expect(lit.groupLabels[0]!.x).toBeCloseTo((a!.x + b!.x) / 2);
    expect(lit.groupLabels[0]!.y).toBeCloseTo((a!.y + b!.y) / 2);

    // Closed, the field's colors go
    await menuButton.click();
    await expect(menu).toBeHidden();
    await expect
        .poll(async () => (await shapeOverlay(page))!.groupMarks)
        .toEqual([]);

    // Placed, the recipe stores the groups as typed, still unlocked (Fit's groups, ADR 0006,
    // decision 9: typing no longer locks the interval)
    await page.keyboard.press("Enter");
    await expect(readout).toBeHidden();
    await expect.poll(() => onSpots(show, spaced.spots)).toBe(true);
    await waitForIdle(page);
    const [recipe] = await recipes(show);
    const stored = JSON.parse(recipe.params).spacing;
    expect(stored.mode).toBe("fit");
    expect(stored.groups.map((g: { count?: number }) => g.count)).toEqual([
        2, 4,
    ]);
    expect(stored.groups[0].interval).toBeCloseTo(3 * S);
    expect(stored.groups[1].interval).toBeCloseTo(2 * S);

    // Reopened from a member, the same groups
    await page.keyboard.press("Escape");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([]);
    const t3 = (await drawnMarchers(page)).find((m) => m.id === 3)!.screen;
    await page.mouse.click(t3.x, t3.y);
    const placed = page.getByTestId("placed-box-readout");
    await expect(placed).toBeVisible();
    await placed.getByTestId("shape-groups-menu").click();
    await expect(menu.getByTestId("shape-group-0-count")).toHaveText("2");
    await expect(menu.getByTestId("shape-group-1-count")).toHaveText("6");
    await expect(menu.getByTestId("shape-group-1-grown")).toHaveText("+2");
    // The placed shape's members are ringed too
    await expect
        .poll(async () => (await shapeOverlay(page))!.groupMarks.length)
        .toBe(8);
});

test("change: the group menu takes a whole list, edits a row in place, and removing down to one group brings the interval back", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
    await page.keyboard.press("l");
    const y = cf.y - 20 * S;
    await drag(
        page,
        await toScreen(page, { x: cf.x - 14 * S, y }),
        await toScreen(page, { x: cf.x - 3.5 * S, y }),
    );
    const readout = page.getByTestId("shape-tool-readout");
    await readout.getByTestId("shape-editor-interval").click();
    await page.getByTestId("shape-editor-interval-input").fill("2*3+4*2");
    await page.keyboard.press("Enter");
    const before = await undoSteps(show);

    // A list typed at the top replaces the groups: three, the last the rest
    await readout.getByTestId("shape-groups-menu").click();
    const menu = page.getByTestId("shape-groups-content");
    const list = menu.getByTestId("shape-groups-list");
    await list.fill("2*3+3*2+4");
    await list.press("Enter");
    await expect(menu.getByTestId("shape-group-2")).toHaveAttribute(
        "data-rest",
        "true",
    );
    await expect(menu.getByTestId("shape-group-2-count")).toHaveText("3");
    await expect(menu.getByTestId("shape-group-2-marchers")).toHaveText(
        "Last 3",
    );
    // Nonsense stays to fix, and changes nothing
    await list.fill("2**");
    await list.press("Enter");
    await expect(list).toHaveAttribute("aria-invalid", "true");
    await list.press("Escape");
    await expect(list).toHaveValue("2*3+3*2+4");

    // The second group's interval typed in its row
    await menu.getByTestId("shape-group-1-interval").click();
    await page.getByTestId("shape-group-1-interval-input").fill("2.5");
    await page.keyboard.press("Enter");
    await expect(menu.getByTestId("shape-group-1-interval")).toHaveText("2½");
    const expected = [3, 3, 2.5, 2.5, 4, 4, 4];
    await expect
        .poll(async () => gaps((await shapeOverlay(page))!.spots))
        .toHaveLength(expected.length);
    gaps((await shapeOverlay(page))!.spots).forEach((gap, i) =>
        expect(Math.abs(gap - expected[i]! * S)).toBeLessThan(CLOSE),
    );
    // Its gaps labeled with the axis-free interval while the row has focus, and its seams with
    // the larger interval either side
    await expect
        .poll(async () =>
            (await shapeOverlay(page))!.groupLabels.map(
                (l) => `${l.text}${l.seam ? " seam" : ""}`,
            ),
        )
        .toEqual(["2½", "2½", "3 seam", "4 seam"]);

    // Removing groups down to one: the menu goes and the interval number is back, with focus
    await menu.getByTestId("shape-group-2-remove").click();
    await menu.getByTestId("shape-group-1-remove").click();
    await expect(menu).toBeHidden();
    await expect(readout.getByTestId("shape-groups-menu")).toBeHidden();
    const single = readout.getByTestId("shape-editor-interval");
    await expect(single).toBeVisible();
    await expect(single).toHaveText("3");
    await expect(single).toBeFocused();
    await expect
        .poll(async () => (await shapeOverlay(page))!.groupMarks)
        .toEqual([]);
    // The open shape keeps its edits as one session: nothing written yet
    expect(await undoSteps(show)).toBe(before);
});

test("change: clicks draw an L, its corner holds a marcher until switched off, and it places with every point", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
    await page.keyboard.press("l");
    await expect(page.getByTestId("shape-tool-hint")).toContainText(
        "click point after point",
    );

    // An L of 8 steps then 5: 8 marchers, 4 gaps of 2 on the long leg and 3 of 1⅔ on the short
    // one. Around the corner instead they're 13/7 apart, so none stands on it.
    const y = cf.y - 20 * S;
    const a = { x: cf.x - 14 * S, y };
    const b = { x: cf.x - 6 * S, y };
    const c = { x: cf.x - 6 * S, y: y + 5 * S };
    const click = async (p: Point) => {
        const at = await toScreen(page, p);
        await page.mouse.move(at.x, at.y, { steps: 4 });
        await page.mouse.click(at.x, at.y);
    };
    await click(a);
    await expect(page.getByTestId("shape-tool-hint")).toContainText(
        "removes the last point",
    );
    await click(b);
    // The next segment follows the pointer before it's clicked
    const pointer = await toScreen(page, c);
    await page.mouse.move(pointer.x, pointer.y, { steps: 4 });
    await expect
        .poll(async () => (await shapeOverlay(page))?.outline?.length)
        .toBe(3);
    await click(c);
    // A click on the last point finishes the line
    await click(c);
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();
    // Clicked points land a hair off the grid, so the short leg can read 1.67
    await expect
        .poll(() => interval(page, "shape-tool-readout"))
        .toMatch(/^1(⅔|\.67)–2$/);

    const drawn = (await shapeOverlay(page))!;
    expect(drawn.handles).toHaveLength(3);
    expect(drawn.addHandles).toHaveLength(2);
    expect(drawn.spots).toHaveLength(ALL.length);
    const onCorner = (spots: readonly Point[]) =>
        spots.some((s) => Math.hypot(s.x - b.x, s.y - b.y) < CLOSE);
    expect(onCorner(drawn.spots)).toBe(true);

    // The corners switch turns it off: the intervals run around the corner
    const corners = page.getByTestId("shape-choice-corners");
    await expect(corners).toHaveAttribute("data-value", "on");
    await corners.click();
    await page
        .getByTestId("shape-choice-corners-content")
        .getByRole("menuitemradio", { name: "Intervals run around corners" })
        .click();
    await expect(corners).toHaveAttribute("data-value", "off");
    await expect
        .poll(async () => onCorner((await shapeOverlay(page))!.spots))
        .toBe(false);
    // And back on
    await corners.click();
    await page
        .getByTestId("shape-choice-corners-content")
        .getByRole("menuitemradio", { name: "Marcher on every corner" })
        .click();
    await expect(corners).toHaveAttribute("data-value", "on");
    const shown = (await shapeOverlay(page))!;
    expect(onCorner(shown.spots)).toBe(true);

    // Enter places it with every point
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    await expect.poll(() => onSpots(show, shown.spots)).toBe(true);
    await waitForIdle(page);
    const [recipe] = await recipes(show);
    const stored = JSON.parse(recipe.params);
    expect(stored.points).toHaveLength(3);
    expect(stored.points[1].x).toBeCloseTo(b.x, 3);
    expect(stored.points[1].y).toBeCloseTo(b.y, 3);
    expect(stored.corners).toBeUndefined();

    // Reopened from a member, it has the same three points and both midpoints
    await page.keyboard.press("Escape");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([]);
    const t3 = (await drawnMarchers(page)).find((m) => m.id === 3)!.screen;
    await page.mouse.click(t3.x, t3.y);
    await expect(page.getByTestId("placed-box-readout")).toBeVisible();
    const reopened = (await shapeOverlay(page))!;
    expect(reopened.handles).toHaveLength(3);
    expect(reopened.addHandles).toHaveLength(2);
});

test("change: while clicking points, a right-click, Backspace and undo each take the last point back, down to the first, and the marchers stay", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
    const steps = await undoSteps(show);
    await page.keyboard.press("l");

    const y = cf.y - 20 * S;
    const a = { x: cf.x - 14 * S, y };
    const b = { x: cf.x - 6 * S, y };
    const c = { x: cf.x - 6 * S, y: y + 5 * S };
    // Three points clicked by mistake, past b
    const wrong = [
        { x: cf.x + 2 * S, y: y - 4 * S },
        { x: cf.x + 6 * S, y: y + 2 * S },
        { x: cf.x + 10 * S, y: y - 2 * S },
    ];
    const click = async (p: Point, button: "left" | "right" = "left") => {
        const at = await toScreen(page, p);
        await page.mouse.move(at.x, at.y, { steps: 4 });
        await page.mouse.click(at.x, at.y, { button });
    };
    // With the pointer away from every point, so its segment to the pointer is drawn too
    const away = await toScreen(page, { x: cf.x - 2 * S, y: y + 12 * S });
    const clicked = async () => {
        await page.mouse.move(away.x, away.y, { steps: 2 });
        return page.evaluate(
            () => window.fieldTest!.shapeOverlay!()?.outline?.length,
        );
    };
    await click(a);
    // The hint names the remove key and Escape, each as one keycap
    const hint = page.getByTestId("shape-tool-hint");
    await expect(hint).toContainText(
        "removes the last point · Double-click to finish",
    );
    await expect(hint.locator("kbd.shortcut")).toHaveCount(2);
    await click(b);
    for (const p of wrong) await click(p);
    // a, b, the three wrong points and the pointer's segment
    await expect.poll(clicked).toBe(6);

    // A right-click takes the last one back, and opens no menu
    await click(wrong[2]!, "right");
    await expect.poll(clicked).toBe(5);
    await expect(page.getByTestId("shape-menu")).toHaveCount(0);
    // Backspace too, without deleting a marcher or the selection
    await page.keyboard.press("Backspace");
    await expect.poll(clicked).toBe(4);
    // And undo, before the line is finished
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(clicked).toBe(3);
    await expect(page.getByTestId("shape-tool-hint")).toBeVisible();

    // Clicking goes on from b; a click on the last point finishes
    await click(c);
    await click(c);
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();
    const drawn = (await shapeOverlay(page))!;
    expect(drawn.handles).toHaveLength(3);
    expect(drawn.spots).toHaveLength(ALL.length);
    expect((await readField(page)).selection).toEqual(ALL);
    // Nothing reached the show while drawing
    expect(await undoSteps(show)).toBe(steps);

    // Down to the first point, a removal does nothing more; Escape cancels the drawing
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("l");
    await click(a);
    await click(b);
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await click(a, "right");
    await expect(page.getByTestId("shape-tool-hint")).toContainText(
        "removes the last point",
    );
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("shape-tool-hint")).toContainText(
        "click point after point",
    );
    const [row] = await show.query<{ count: number }>(
        "SELECT COUNT(*) AS count FROM marchers",
    );
    expect(row.count).toBe(ALL.length);
    expect(await undoSteps(show)).toBe(steps);
});

test("change: a right-click on a point opens its menu: switching off following the line keeps the corner's spacing even, or a greyed Marcher holds one with the switch off; a segment's menu adds a point", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
    await page.keyboard.press("l");

    // The L from the corners scenario: 8 marchers, one on the corner until it says otherwise
    const y = cf.y - 20 * S;
    const a = { x: cf.x - 14 * S, y };
    const b = { x: cf.x - 6 * S, y };
    const c = { x: cf.x - 6 * S, y: y + 5 * S };
    const click = async (p: Point) => {
        const at = await toScreen(page, p);
        await page.mouse.move(at.x, at.y, { steps: 4 });
        await page.mouse.click(at.x, at.y);
    };
    await click(a);
    await click(b);
    await click(c);
    await click(c);
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();
    const onCorner = (spots: readonly Point[]) =>
        spots.some((s) => Math.hypot(s.x - b.x, s.y - b.y) < CLOSE);
    expect(onCorner((await shapeOverlay(page))!.spots)).toBe(true);

    const menu = page.getByTestId("shape-menu");
    /** A right-click at field point `p`, or at a viewport point when `screen` */
    const rightClick = async (p: Point, screen = false) => {
        const at = screen ? p : await toScreen(page, p);
        await page.mouse.move(at.x, at.y, { steps: 4 });
        await page.mouse.click(at.x, at.y, { button: "right" });
        await expect(menu).toBeVisible();
    };
    const pick = async (value: string) => {
        await menu.getByTestId(`shape-menu-${value}`).click();
        await expect(menu).toBeHidden();
    };
    const checked = (value: string) =>
        menu.getByTestId(`shape-menu-${value}`).getAttribute("aria-checked");

    const follow = menu.getByTestId("shape-menu-marcher-follow");
    const caption = menu.getByTestId("shape-menu-caption");

    // The corner's menu: Corner | Smooth as one either/or with its double-click hint, and
    // following the line's marchers, with the line's answer marked on the greyed answers
    await rightClick(b);
    await expect(menu).toHaveAttribute("data-handle", "p1");
    const cornerType = menu.getByRole("group", { name: "Corner type" });
    await expect(cornerType).toBeVisible();
    expect(await checked("corner")).toBe("true");
    expect(await checked("smooth")).toBe("false");
    await expect(menu.getByTestId("shape-menu-hint")).toHaveText(
        "Double-click a point to swap",
    );
    await expect(follow).toHaveText("Follow line's marchers");
    expect(await checked("marcher-follow")).toBe("true");
    await expect(caption).toHaveText("Line puts a marcher here");
    expect(await checked("marcher-always")).toBe("true");
    // Greyed while following, but still operable: no aria-disabled
    await expect(
        menu.getByTestId("shape-menu-marcher-always"),
    ).not.toHaveAttribute("aria-disabled", "true");
    await expect(
        menu.getByTestId("shape-menu-delete").locator("svg"),
    ).toHaveCount(1);
    // The field's own menu stays shut while the shape is open
    await expect(page.getByTestId("field-menu")).toHaveCount(0);
    // Smooth swaps in place: the menu stays open with Roundness, and Corner swaps back
    await menu.getByTestId("shape-menu-smooth").click();
    await expect(menu).toBeVisible();
    await expect.poll(() => checked("smooth")).toBe("true");
    await expect(menu.getByTestId("shape-menu-roundness")).toBeVisible();
    await menu.getByTestId("shape-menu-corner").click();
    await expect.poll(() => checked("corner")).toBe("true");
    await expect(menu.getByTestId("shape-menu-roundness")).toHaveCount(0);
    // Escape closes it
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();
    expect(onCorner((await shapeOverlay(page))!.spots)).toBe(true);

    // Following switched off sets the other answer, in place: the intervals run straight
    // through the corner
    await rightClick(b);
    await follow.click();
    await expect(menu).toBeVisible();
    await expect.poll(() => checked("marcher-follow")).toBe("false");
    expect(await checked("marcher-even")).toBe("true");
    await expect(caption).toHaveText("Line would put a marcher here");
    await expect
        .poll(async () => onCorner((await shapeOverlay(page))!.spots))
        .toBe(false);
    // On again hands the point back to the line: a marcher on the corner again
    await follow.click();
    await expect.poll(() => checked("marcher-follow")).toBe("true");
    await expect
        .poll(async () => onCorner((await shapeOverlay(page))!.spots))
        .toBe(true);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    // With the corners switch off, the greyed Marcher puts one back on it
    const corners = page.getByTestId("shape-choice-corners");
    await corners.click();
    await page
        .getByTestId("shape-choice-corners-content")
        .getByRole("menuitemradio", { name: "Intervals run around corners" })
        .click();
    await expect(corners).toHaveAttribute("data-value", "off");
    await rightClick(b);
    expect(await checked("marcher-even")).toBe("true");
    await expect(caption).toHaveText("Line keeps spacing even here");
    await menu.getByTestId("shape-menu-marcher-always").click();
    await expect.poll(() => checked("marcher-follow")).toBe("false");
    expect(await checked("marcher-always")).toBe("true");
    await expect
        .poll(async () => onCorner((await shapeOverlay(page))!.spots))
        .toBe(true);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    // A segment's middle: Add point here, the new point selected
    const [middle] = (await shapeOverlay(page))!.addHandles!;
    await rightClick(middle!, true);
    await expect(menu).toHaveAttribute("data-handle", "m0");
    await pick("add");
    await expect
        .poll(async () => (await shapeOverlay(page))!.handles.length)
        .toBe(4);
    expect((await shapeOverlay(page))!.selectedHandles).toHaveLength(1);
    const shown = (await shapeOverlay(page))!;
    expect(onCorner(shown.spots)).toBe(true);

    // Placed, the corner keeps its answer
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    await expect.poll(() => onSpots(show, shown.spots)).toBe(true);
    await waitForIdle(page);
    const [recipe] = await recipes(show);
    const stored = JSON.parse(recipe.params);
    expect(stored.corners).toBe(false);
    expect(stored.points).toHaveLength(4);
    expect(stored.points[2].marcher).toBe(true);
    expect(
        stored.points.filter((p: { marcher?: boolean }) => "marcher" in p),
    ).toHaveLength(1);
});

test("change: a click on the first point closes a clicked line, Grid fills it, and it places and reopens closed in Grid", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
    await page.keyboard.press("l");

    // A 6 × 4 step rectangle, clicked corner by corner, closed on its first corner (#529)
    const y = cf.y - 20 * S;
    const corners = [
        { x: cf.x - 14 * S, y },
        { x: cf.x - 8 * S, y },
        { x: cf.x - 8 * S, y: y + 4 * S },
        { x: cf.x - 14 * S, y: y + 4 * S },
    ];
    const click = async (p: Point) => {
        const at = await toScreen(page, p);
        await page.mouse.move(at.x, at.y, { steps: 4 });
        await page.mouse.click(at.x, at.y);
    };
    for (const p of corners) await click(p);
    await click(corners[0]!);
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();
    const ends = page.getByTestId("shape-choice-ends");
    await expect(ends).toHaveAttribute("data-value", "closed");
    // A closed outline: a gap for every marcher, the last back to the first
    const outline = (await shapeOverlay(page))!;
    expect(outline.spots).toHaveLength(ALL.length);
    const inRect = (spots: readonly Point[]) =>
        spots.every(
            (s) =>
                s.x >= corners[0]!.x - CLOSE &&
                s.x <= corners[1]!.x + CLOSE &&
                s.y >= y - CLOSE &&
                s.y <= y + 4 * S + CLOSE,
        );
    expect(inRect(outline.spots)).toBe(true);

    // Grid from the host's mode menu fills it
    const mode = page.getByTestId("shape-mode-menu");
    await expect(mode).toHaveAttribute("data-mode", "outline");
    await mode.click();
    await page.getByTestId("shape-mode-files").click();
    await expect(mode).toHaveAttribute("data-mode", "files");
    await expect
        .poll(async () => JSON.stringify((await shapeOverlay(page))!.spots))
        .not.toBe(JSON.stringify(outline.spots));
    const filled = (await shapeOverlay(page))!;
    expect(filled.spots).toHaveLength(ALL.length);
    expect(inRect(filled.spots)).toBe(true);
    // Some stand inside, off the outline
    expect(
        filled.spots.some(
            (s) =>
                s.x > corners[0]!.x + CLOSE &&
                s.x < corners[1]!.x - CLOSE &&
                s.y > y + CLOSE &&
                s.y < y + 4 * S - CLOSE,
        ),
    ).toBe(true);

    // Placed, the recipe keeps it closed and in Grid
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    await expect.poll(() => onSpots(show, filled.spots)).toBe(true);
    await waitForIdle(page);
    const [recipe] = await recipes(show);
    expect(recipe.kind).toBe("line");
    const stored = JSON.parse(recipe.params);
    expect(stored.closed).toBe(true);
    expect(stored.points).toHaveLength(4);
    expect(stored.distribution.mode).toBe("files");

    // Reopened from a member, it's closed and in Grid
    await page.keyboard.press("Escape");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([]);
    const t1 = (await drawnMarchers(page)).find((m) => m.id === 1)!.screen;
    await page.mouse.click(t1.x, t1.y);
    await expect(page.getByTestId("placed-box-readout")).toBeVisible();
    await expect(page.getByTestId("shape-mode-menu")).toHaveAttribute(
        "data-mode",
        "files",
    );
    await expect(page.getByTestId("shape-choice-ends")).toHaveAttribute(
        "data-value",
        "closed",
    );
});

// Who goes where on a Line (#528): a line drawn on marchers who all stand on
// one placed Line keeps their order along it (Keep order, the default), the
// menu offers Least travel and Reverse order too, each pictured as the new
// line read as numbers, and the choice is saved in the
// recipe, where a reopened line can pick again. Page 2 has no positions of
// its own, so the line placed on page 1 is still standing there.
test.describe("who goes where", () => {
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
            positions: [HOME, [], []],
        }),
    });

    const orders = (show: Show) =>
        show.query<{ order_mode: string; reverse: number }>(
            "SELECT order_mode, reverse FROM timeline_shape_recipes ORDER BY id",
        );

    async function goToNextPage(show: Show, heading: string) {
        await show.page.keyboard.press("e");
        await expect(
            show.page.getByRole("heading", { name: heading }),
        ).toBeVisible();
        await expectCanvasMatchesShow(show);
    }

    /** Marcher ids on page `pageId`, from the lowest x to the highest */
    const byX = async (show: Show, pageId: number) =>
        (await savedPositions(show, pageId))
            .sort((a, b) => a.x - b.x)
            .map((p) => p.id);

    test("change: a line drawn from a placed line keeps its order, Reverse flips it, and the choice is saved", async ({
        show,
    }) => {
        const { page } = show;
        const grid = await fieldGrid(show);
        const S = grid.pixelsPerStep;
        const cf = grid.centerFront;
        const selectAll = async () => {
            await page.keyboard.press("ControlOrMeta+a");
            await expect
                .poll(async () => (await readField(page)).selection)
                .toEqual(ALL);
        };

        // Page 1: a line drawn left to right, by least travel from home
        await goToNextPage(show, "Page 1");
        await selectAll();
        await page.keyboard.press("l");
        const yA = cf.y - 20 * S;
        await drag(
            page,
            await toScreen(page, { x: cf.x - 14 * S, y: yA }),
            await toScreen(page, { x: cf.x - 3.5 * S, y: yA }),
        );
        await expect(page.getByTestId("shape-order")).toHaveAttribute(
            "data-value",
            "nearest",
        );
        await page.getByTestId("shape-order").click();
        // Nobody stands on a placed line yet: no Keep order
        await expect(
            page.getByTestId("shape-order-content").getByRole("menuitemradio"),
        ).toHaveText([/Least travel$/, /Reverse order$/]);
        await page.keyboard.press("Escape");
        await page.keyboard.press("Enter");
        await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
        await waitForIdle(page);
        // Its first spot is at the left: the order along it
        const alongA = await byX(show, 1);
        expect(await orders(show)).toEqual([
            { order_mode: "nearest", reverse: 0 },
        ]);

        // Page 2: everyone still on the line; a new line drawn right to left
        // below it keeps their order, so the first along A is first along B,
        // at its right end
        await goToNextPage(show, "Page 2");
        await page.keyboard.press("Escape");
        await selectAll();
        const steps = await undoSteps(show);
        await page.keyboard.press("l");
        const yB = cf.y - 10 * S;
        await drag(
            page,
            await toScreen(page, { x: cf.x - 3.5 * S, y: yB }),
            await toScreen(page, { x: cf.x - 14 * S, y: yB }),
        );
        const order = page.getByTestId("shape-order");
        await expect(order).toHaveAttribute("data-value", "keep");
        await order.click();
        await expect(
            page.getByTestId("shape-order-content").getByRole("menuitemradio"),
        ).toHaveText([/Least travel$/, /Keep order$/, /Reverse order$/]);
        for (const [choice, sequence] of [
            ["nearest", "2143"],
            ["keep", "1234"],
            ["reverse", "4321"],
        ])
            await expect(
                page.getByTestId(`shape-order-${choice}-picture`),
            ).toHaveAttribute("data-sequence", sequence);

        // Reverse order, then back to Keep order
        await page.getByTestId("shape-order-reverse").click();
        await expect(order).toHaveAttribute("data-value", "reverse");
        await expect(page.getByTestId("shape-order-picture")).toHaveAttribute(
            "data-sequence",
            "4321",
        );
        await order.click();
        await page.getByTestId("shape-order-keep").click();
        await expect(order).toHaveAttribute("data-value", "keep");

        await page.keyboard.press("Enter");
        await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
        await expect.poll(() => byX(show, 2)).toEqual([...alongA].reverse());
        await waitForIdle(page);
        expect(await undoSteps(show)).toBe(steps + 1);
        expect((await orders(show)).at(-1)).toEqual({
            order_mode: "keep",
            reverse: 0,
        });

        // Reopened, it shows Keep order; Reverse order saves on pick, flipping them
        await page.keyboard.press("Escape");
        await expect
            .poll(async () => (await readField(page)).selection)
            .toEqual([]);
        const t3 = (await drawnMarchers(page)).find((m) => m.id === 3)!.screen;
        await page.mouse.click(t3.x, t3.y);
        await expect(page.getByTestId("placed-box-readout")).toBeVisible();
        await expect(order).toHaveAttribute("data-value", "keep");
        await order.click();
        await page.getByTestId("shape-order-reverse").click();
        await expect.poll(() => byX(show, 2)).toEqual(alongA);
        await expect
            .poll(async () => (await orders(show)).at(-1))
            .toEqual({ order_mode: "keep", reverse: 1 });
        await expect(order).toHaveAttribute("data-value", "reverse");

        // Undo puts Keep order back
        await waitForIdle(page);
        await page.keyboard.press("ControlOrMeta+z");
        await expect.poll(() => byX(show, 2)).toEqual([...alongA].reverse());
        await expect
            .poll(async () => (await orders(show)).at(-1))
            .toEqual({ order_mode: "keep", reverse: 0 });
    });
});

test("change: Curve in the Shapes tab draws a line bending through smooth points, none holding a marcher, and places it with its tensions", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);

    // In the Shapes tab after the Line
    await page.getByRole("tab", { name: "Shapes" }).click();
    const curve = page.getByTestId("shapes-tab-curve");
    await expect(curve).toHaveAccessibleName("Curve");
    await curve.click();
    await expect(curve).toHaveAttribute("aria-pressed", "true");

    // An arch clicked through three points, finished with a click on the last
    const y = cf.y - 20 * S;
    const a = { x: cf.x - 14 * S, y };
    const top = { x: cf.x - 8 * S, y: y - 4 * S };
    const c = { x: cf.x - 2 * S, y };
    const click = async (p: Point) => {
        const at = await toScreen(page, p);
        await page.mouse.move(at.x, at.y, { steps: 4 });
        await page.mouse.click(at.x, at.y);
    };
    await click(a);
    await click(top);
    await click(c);
    await click(c);
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();

    // Three points, no tension handle until one is selected (#557); the outline follows the curve
    const drawn = (await shapeOverlay(page))!;
    expect(drawn.handles).toHaveLength(3);
    expect(drawn.barHandles).toEqual([]);
    expect(drawn.outline!.length).toBeGreaterThan(3);
    // 8 marchers on a symmetric arch: none on its smooth top, evenly apart along it (straight
    // across, the gaps round the bend come out a hair shorter)
    expect(drawn.spots).toHaveLength(ALL.length);
    expect(
        drawn.spots.every(
            (s) => Math.hypot(s.x - top.x, s.y - top.y) > 0.25 * S,
        ),
    ).toBe(true);
    // Each spot's place along the drawn outline (a polyline through the curve)
    const outline = drawn.outline!;
    const along = (p: Point) => {
        let best = Infinity;
        let at = 0;
        let run = 0;
        for (let i = 1; i < outline.length; i++) {
            const a = outline[i - 1]!;
            const b = outline[i]!;
            const len = Math.hypot(b.x - a.x, b.y - a.y);
            const t =
                len > 0
                    ? Math.max(
                          0,
                          Math.min(
                              1,
                              ((p.x - a.x) * (b.x - a.x) +
                                  (p.y - a.y) * (b.y - a.y)) /
                                  (len * len),
                          ),
                      )
                    : 0;
            const d = Math.hypot(
                a.x + (b.x - a.x) * t - p.x,
                a.y + (b.y - a.y) * t - p.y,
            );
            if (d < best) {
                best = d;
                at = run + len * t;
            }
            run += len;
        }
        return at;
    };
    const places = drawn.spots.map(along).sort((p, q) => p - q);
    const apart = places.slice(1).map((p, i) => p - places[i]!);
    for (const gap of apart)
        expect(Math.abs(gap - apart[0]!)).toBeLessThan(0.01 * apart[0]!);

    // Enter places it, a Line recipe with smooth points
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    await expect.poll(() => onSpots(show, drawn.spots)).toBe(true);
    await waitForIdle(page);
    const [recipe] = await recipes(show);
    expect([recipe.kind, recipe.kind_version]).toEqual(["line", 2]);
    const stored = JSON.parse(recipe.params);
    expect(stored.points.map((p: { tension: number }) => p.tension)).toEqual([
        1, 1, 1,
    ]);

    // Reopened from a member, it is still smooth
    await page.keyboard.press("Escape");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([]);
    const t3 = (await drawnMarchers(page)).find((m) => m.id === 3)!.screen;
    await page.mouse.click(t3.x, t3.y);
    await expect(page.getByTestId("placed-box-readout")).toBeVisible();
    const reopened = (await shapeOverlay(page))!;
    expect(reopened.handles).toHaveLength(3);
    // Still no marcher on its smooth top, and nothing saved changed it
    expect(
        reopened.spots.every(
            (s) => Math.hypot(s.x - top.x, s.y - top.y) > 0.25 * S,
        ),
    ).toBe(true);
    const [again] = await recipes(show);
    expect(
        JSON.parse(again.params).points.map(
            (p: { tension: number }) => p.tension,
        ),
    ).toEqual([1, 1, 1]);
});

test("change: a click on a Curve's point selects it and shows its tangent bar, whose ends set its tension live; a double-click makes it a corner", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
    await page.getByRole("tab", { name: "Shapes" }).click();
    await page.getByTestId("shapes-tab-curve").click();

    const y = cf.y - 20 * S;
    const a = { x: cf.x - 14 * S, y };
    const top = { x: cf.x - 8 * S, y: y - 4 * S };
    const c = { x: cf.x - 2 * S, y };
    const click = async (p: Point) => {
        const at = await toScreen(page, p);
        await page.mouse.move(at.x, at.y, { steps: 4 });
        await page.mouse.click(at.x, at.y);
    };
    await click(a);
    await click(top);
    await click(c);
    await click(c);
    const readout = page.getByTestId("shape-tool-readout");
    await expect(readout).toBeVisible();
    const drawn = (await shapeOverlay(page))!;
    expect(drawn.selectedHandles).toEqual([]);
    expect(drawn.barHandles).toEqual([]);

    // A click on the top point selects it: drawn filled, its bar one end each way
    // (the click lands a moment after the last, so it isn't a double-click)
    await page.waitForTimeout(600);
    await click(top);
    const selected = (await shapeOverlay(page))!;
    expect(selected.selectedHandles).toHaveLength(1);
    expect(selected.barHandles).toHaveLength(2);
    expect(selected.spots).toEqual(drawn.spots);
    const [ahead, back] = selected.barHandles;
    expect(ahead!.from).toEqual(back!.from);
    expect(ahead!.at.x).toBeGreaterThan(ahead!.from.x);
    expect(back!.at.x).toBeLessThan(back!.from.x);

    // An end dragged out: the curve and spots follow while the pointer is still down
    const p = ahead!.from;
    const out = {
        x: p.x + (ahead!.at.x - p.x) * 1.8,
        y: p.y + (ahead!.at.y - p.y) * 1.8,
    };
    await page.mouse.move(ahead!.at.x, ahead!.at.y, { steps: 2 });
    await page.mouse.down();
    await page.mouse.move(out.x, out.y, { steps: 6 });
    const mid = await page.evaluate(() => window.fieldTest!.shapeOverlay!());
    expect(mid!.outline).not.toEqual(drawn.outline);
    expect(mid!.spots).not.toEqual(drawn.spots);
    await page.mouse.up();
    const rounder = (await shapeOverlay(page))!;
    expect(rounder.selectedHandles).toHaveLength(1);
    expect(rounder.outline).not.toEqual(drawn.outline);

    // Escape clears the selection; the tool stays open
    await page.keyboard.press("Escape");
    await expect
        .poll(async () => (await shapeOverlay(page))!.barHandles.length)
        .toBe(0);
    expect((await shapeOverlay(page))!.selectedHandles).toEqual([]);
    await expect(readout).toBeVisible();

    // A double-click on the top point makes it a corner, one undo step
    const topAt = await toScreen(page, top);
    await page.waitForTimeout(600);
    await page.mouse.dblclick(topAt.x, topAt.y);
    // A selected corner has no bar, and the line turns sharply at it
    await expect
        .poll(async () => (await shapeOverlay(page))!.barHandles.length)
        .toBe(0);
    const corner = (await shapeOverlay(page))!;
    expect(corner.selectedHandles).toHaveLength(1);
    expect(corner.outline).not.toEqual(rounder.outline);
    // Undo makes it smooth again, as round as it was
    await page.keyboard.press("ControlOrMeta+z");
    await expect
        .poll(async () => (await shapeOverlay(page))!.outline)
        .toEqual(rounder.outline);

    // A drag on a point moves it, selecting nothing and switching nothing
    await page.waitForTimeout(600);
    await page.mouse.move(topAt.x, topAt.y, { steps: 2 });
    await page.mouse.down();
    const raised = await toScreen(page, { x: top.x, y: top.y - 2 * S });
    await page.mouse.move(raised.x, raised.y, { steps: 6 });
    await page.mouse.up();
    const moved = (await shapeOverlay(page))!;
    expect(moved.selectedHandles).toEqual([]);
    expect(moved.barHandles).toEqual([]);
    expect(moved.outline).not.toEqual(rounder.outline);

    // Placed, the tension dragged is saved
    await page.keyboard.press("Enter");
    await expect(readout).toBeHidden();
    await waitForIdle(page);
    const [recipe] = await recipes(show);
    const stored = JSON.parse(recipe.params);
    const tensions = stored.points.map((q: { tension: number }) => q.tension);
    expect([tensions[0], tensions[2]]).toEqual([1, 1]);
    expect(tensions[1]).toBeGreaterThan(1.6);
    expect(tensions[1]).toBeLessThan(2);
});

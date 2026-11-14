import type { Locator, Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    canvasScale,
    drawnMarchers,
    expectCanvasMatchesShow,
    readField,
    selectedDrillNumbers,
    tap,
    touchDrag,
    waitForIdle,
} from "../app.mjs";
import { fieldGrid, savedPositions } from "../positions.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";
import type { FieldTestShapeOverlay } from "../../../src/field/fieldTestApi";

// Shape and prop tools with a finger (tablet 1.4, docs/tablet-layout.md):
// while a shape tool is armed one finger draws, where it would otherwise move
// the view; the floating editor's Finish, Undo point and Discard stand in for
// Enter, Backspace and Escape; a shape's handles reach as far as a finger
// does; a polygon prop finishes with Finish. On a narrow selection (two
// marchers in a row) a finger on a marcher or inside the box moves it, and the
// selection box's handles win only outside the box or on the handle as drawn.

// Six trumpets; T1 and T2 two steps apart in a row, the narrow selection.
const HOME: SeedPosition[] = [
    [1, 500, 300],
    [2, 524, 300],
    [3, 700, 280],
    [4, 800, 400],
    [5, 520, 450],
    [6, 640, 470],
];

test.use({
    seedSql: seedShowSql({
        beats: 16,
        pageStarts: [],
        measureStarts: [1, 5, 9, 13],
        marchers: HOME.map(([id]) => ({
            id,
            section: "Trumpet",
            prefix: "T",
            order: id,
        })),
        positions: [HOME],
    }),
    // Coordinate rounding to whole steps, so a group's move is in whole steps
    uiSettings: {
        coordinateRounding: { nearestXSteps: 1, nearestYSteps: 1 },
    },
    // A touch screen, in the touch layout
    touchScreen: true,
    initScript: "localStorage.setItem('openmarch:inputMode', 'touch');",
    // The time-stretch worklet (#216) can't load in the harness (see props.spec.mts)
    allowedPageErrors: [/Audio worklet error/],
});

test.beforeEach(async ({ show }) => {
    await expectCanvasMatchesShow(show);
});

type Point = { x: number; y: number };

/** A point on the field at fractions of its width and height, in the viewport. */
async function onField(page: Page, fx: number, fy: number): Promise<Point> {
    const box = (await page.getByTestId("fieldCanvas").first().boundingBox())!;
    return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

/** Where marcher `drillNumber` is drawn, in viewport px. */
async function screenOf(page: Page, drillNumber: string): Promise<Point> {
    const drawn = (await drawnMarchers(page)).find(
        (m) => m.drillNumber === drillNumber,
    );
    if (!drawn?.onScreen)
        throw new Error(`${drillNumber} is not visible on the field`);
    return drawn.screen;
}

/** Taps the middle of `locator` with one finger. */
async function tapOn(page: Page, locator: Locator) {
    const box = await locator.boundingBox();
    if (!box) throw new Error("not on screen");
    await tap(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
}

/** Taps far enough apart in time that no two are a double-tap. */
async function tapPoints(page: Page, points: readonly Point[]) {
    for (const p of points) {
        await tap(page, p);
        await page.waitForTimeout(450);
    }
}

/** What the shape tool draws once its spots have glided to where they're going */
async function shapeOverlay(page: Page): Promise<FieldTestShapeOverlay | null> {
    await page.waitForFunction(
        () => window.fieldTest!.shapeOverlay?.()?.gliding !== true,
    );
    return page.evaluate(() => window.fieldTest!.shapeOverlay?.() ?? null);
}

const saved = (show: Show) => savedPositions(show, 0);
const savedOf = async (show: Show, id: number) =>
    (await saved(show)).find((m) => m.id === id)!;

async function selectAll(page: Page) {
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(HOME.map(([id]) => id));
}

test("a finger draws a box with the tool armed, Discard throws it away, and Place places the next", async ({
    show,
}) => {
    const { page } = show;
    const before = await saved(show);
    await selectAll(page);
    await page.keyboard.press("b");
    const hint = page.getByTestId("shape-tool-hint");
    await expect(hint).toContainText("Drag on the field to draw a box");
    // No keys named on a tablet; its way out is a button
    await expect(hint).not.toContainText("to cancel");
    await expect(page.getByTestId("shape-tool-discard")).toBeVisible();
    await expect(page.getByTestId("shape-tool-finish")).toHaveCount(0);

    // One finger draws, and the view stays put
    const view = (await readField(page)).viewport;
    await touchDrag(
        page,
        await onField(page, 0.3, 0.55),
        await onField(page, 0.55, 0.8),
        { steps: 12 },
    );
    const readout = page.getByTestId("shape-tool-readout");
    await expect(readout).toBeVisible();
    expect((await readField(page)).viewport).toEqual(view);
    expect((await shapeOverlay(page))?.outline).not.toBeNull();

    // Discard, beside Place: nothing moves and the tool closes
    const discard = page.getByTestId("shape-editor-discard");
    await expect(discard).toHaveText("Discard");
    await tapOn(page, discard);
    await expect(readout).toBeHidden();
    await expect(hint).toBeHidden();
    expect(await shapeOverlay(page)).toBeNull();
    await waitForIdle(page);
    expect(await saved(show)).toEqual(before);

    // Drawn again, and placed: everyone on the shape's spots
    await page.keyboard.press("b");
    await expect(hint).toBeVisible();
    await touchDrag(
        page,
        await onField(page, 0.3, 0.55),
        await onField(page, 0.55, 0.8),
        { steps: 12 },
    );
    await expect(readout).toBeVisible();
    const spots = (await shapeOverlay(page))!.spots;
    await tapOn(page, page.getByTestId("shape-editor-place"));
    await expect
        .poll(async () =>
            (await saved(show)).every((p) =>
                spots.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < 1e-3),
            ),
        )
        .toBe(true);
    await expectCanvasMatchesShow(show);
});

test("a finger taps a line's points: Undo point takes one back, Finish ends it, a handle reshapes it, Discard drops it", async ({
    show,
}) => {
    const { page } = show;
    const before = await saved(show);
    await selectAll(page);
    await page.keyboard.press("l");
    const hint = page.getByTestId("shape-tool-hint");
    await expect(hint).toContainText("or tap point after point");

    const a = await onField(page, 0.25, 0.6);
    const b = await onField(page, 0.45, 0.6);
    const c = await onField(page, 0.45, 0.8);
    await tapPoints(page, [a, b, c]);
    await expect(hint).toContainText("Tap to add points");
    const finish = page.getByTestId("shape-tool-finish");
    const undoPoint = page.getByTestId("shape-tool-undo-point");
    await expect(finish).toHaveText("Finish");
    await expect(undoPoint).toHaveText("Undo point");
    await expect(page.getByTestId("shape-tool-discard")).toBeVisible();

    // C taken back: the line Finish ends runs from A to B
    await tapOn(page, undoPoint);
    await tapOn(page, finish);
    const readout = page.getByTestId("shape-tool-readout");
    await expect(readout).toBeVisible();
    const drawn = (await shapeOverlay(page))!;
    expect(drawn.handles).toHaveLength(2);
    const end = drawn.handles.reduce((p, q) => (q.x > p.x ? q : p));
    expect(Math.abs(end.x - b.x)).toBeLessThan(15);
    expect(Math.abs(end.y - b.y)).toBeLessThan(15);

    // A finger 15 px off the right end still takes it (a mouse reaches 10).
    // The point goes to the finger, as it goes to the mouse pointer. In Fit it
    // snaps where the interval comes out to whole steps (`dragPoint`), so the
    // line's length moves in runs of (marchers - 1) steps: the end lands
    // within half a run of where the finger lifts
    const grid = await fieldGrid(show);
    const scale = await canvasScale(page);
    const step = grid.pixelsPerStep * scale;
    const by = 4 * step;
    const halfRun = ((drawn.spots.length - 1) * step) / 2;
    const from = { x: end.x + 15, y: end.y };
    const to = { x: from.x + by, y: from.y };
    await touchDrag(page, from, to, { steps: 12 });
    await expect
        .poll(async () => {
            const now = (await shapeOverlay(page))!.handles.reduce((p, q) =>
                q.x > p.x ? q : p,
            );
            return (
                now.x > end.x + step && Math.abs(now.x - to.x) <= halfRun + 1
            );
        })
        .toBe(true);
    // Moved, not panned: the start point stays where it was
    const start = (await shapeOverlay(page))!.handles.reduce((p, q) =>
        q.x < p.x ? q : p,
    );
    const a0 = drawn.handles.reduce((p, q) => (q.x < p.x ? q : p));
    expect(Math.abs(start.x - a0.x)).toBeLessThan(1);

    // Discard: nothing placed
    await tapOn(page, page.getByTestId("shape-editor-discard"));
    await expect(readout).toBeHidden();
    await waitForIdle(page);
    expect(await saved(show)).toEqual(before);
});

test("a finger on a narrow selection moves it; just outside a side handle, it scales", async ({
    show,
}) => {
    const { page } = show;
    const scale = await canvasScale(page);
    const grid = await fieldGrid(show);
    // T1, then T2 added with the pill's Add: a row two steps long
    await tap(page, await screenOf(page, "T1"));
    await tapOn(page, page.getByTestId("touch-toggle-add"));
    await tap(page, await screenOf(page, "T2"));
    await tapOn(page, page.getByTestId("touch-toggle-add"));
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T1", "T2"]);

    // On T1, though the box's left handles are within a finger's reach
    const t1 = await screenOf(page, "T1");
    const by = 3 * grid.pixelsPerStep;
    await touchDrag(page, t1, { x: t1.x, y: t1.y + by * scale });
    await expect
        .poll(async () => (await savedOf(show, 1)).y)
        .toBeCloseTo(300 + by, 1);
    // A group keeps its offsets (docs/field/implementation-plan.md)
    expect((await savedOf(show, 2)).x - (await savedOf(show, 1)).x).toBeCloseTo(
        24,
        1,
    );
    expect((await savedOf(show, 2)).y).toBeCloseTo(300 + by, 1);

    // Just outside the right middle handle, within a finger's reach: a scale
    // from the left side, T1 stays and T2 goes further out
    const handles = await page.evaluate(() => window.fieldTest!.handles());
    expect(handles).not.toBeNull();
    const out = { x: handles!.e.x + 10, y: handles!.e.y };
    await touchDrag(page, out, { x: out.x + 60, y: out.y }, { steps: 12 });
    await expect
        .poll(async () => (await savedOf(show, 2)).x)
        .toBeGreaterThan(524 + 5);
    expect((await savedOf(show, 1)).x).toBeCloseTo(500, 1);
    await expectCanvasMatchesShow(show);
});

test("a finger draws a polygon prop corner by corner, with Undo point and Finish", async ({
    show,
}) => {
    const { page } = show;
    await page.locator("#sidebar-launcher-props").click();
    await page.getByRole("button", { name: "Polygon" }).click();
    await expect
        .poll(() => page.evaluate(() => window.fieldTest!.activeGesture()))
        .toBe("prop");
    await expect(
        page.getByText("Tap each corner, then tap Finish."),
    ).toBeVisible();
    const finish = page.getByTestId("prop-draw-finish");
    const undoPoint = page.getByTestId("prop-draw-undo-point");
    await expect(finish).toBeDisabled();
    await expect(undoPoint).toBeDisabled();

    const view = (await readField(page)).viewport;
    await tapPoints(page, [
        await onField(page, 0.3, 0.3),
        await onField(page, 0.5, 0.3),
    ]);
    await expect(undoPoint).toBeEnabled();
    await expect(finish).toBeDisabled();
    await tapPoints(page, [await onField(page, 0.4, 0.15)]);
    await expect(finish).toBeEnabled();
    // The last corner taken back, and put somewhere else
    await tapOn(page, undoPoint);
    await expect(finish).toBeDisabled();
    await tapPoints(page, [await onField(page, 0.4, 0.45)]);
    await tapOn(page, finish);

    await expect
        .poll(() => page.evaluate(() => window.fieldTest!.activeGesture()))
        .toBeNull();
    await expect
        .poll(() =>
            show.query<{ outline_type: string }>(
                "SELECT outline_type FROM item_geometry",
            ),
        )
        .toEqual([{ outline_type: "polygon" }]);
    // Fingers drew; none moved the view
    expect((await readField(page)).viewport).toEqual(view);
});

import type { Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    FINGERTIP_WIDTH,
    canvasScale,
    drawnMarchers,
    expectCanvasMatchesShow,
    readField,
    selectedDrillNumbers,
    tap,
    touchDrag,
} from "../app.mjs";
import { fieldGrid, savedPositions, type FieldGrid } from "../positions.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";

// One finger on the field (tablet 1.2, docs/tablet-layout.md): a tap on a
// marcher selects only it, within about 22 px of its dot; a tap on empty
// field clears the selection; a finger on a marcher or the selection moves it
// once it has gone 12 px, and a second finger puts it back with nothing
// saved. A finger on empty field still moves the view. The pill's roles apply
// to a finger's drag as they do to the mouse's.

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
    // A touch screen, in the touch layout
    touchScreen: true,
    initScript: "localStorage.setItem('openmarch:inputMode', 'touch');",
});

type Point = { x: number; y: number };

/** Where marcher `drillNumber` is drawn, in viewport px. */
async function screenOf(page: Page, drillNumber: string): Promise<Point> {
    const drawn = (await drawnMarchers(page)).find(
        (m) => m.drillNumber === drillNumber,
    );
    if (!drawn?.onScreen)
        throw new Error(`${drillNumber} is not visible on the field`);
    return drawn.screen;
}

/** A point on empty field: below the trumpets, clear of every dot and panel. */
async function emptyField(page: Page): Promise<Point> {
    const t4 = await screenOf(page, "T4");
    const t1 = await screenOf(page, "T1");
    return { x: (t1.x + t4.x) / 2, y: t4.y + 80 };
}

/** Taps the middle of the element with test id `testId`. */
async function tapButton(page: Page, testId: string) {
    const box = await page.getByTestId(testId).boundingBox();
    if (!box) throw new Error(`${testId} is not on screen`);
    await tap(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
}

const saved = (show: Show) => savedPositions(show, 0);

/** Within 1.5 field units on both axes. */
const near = (a: Point, b: Point) =>
    Math.abs(a.x - b.x) < 1.5 && Math.abs(a.y - b.y) < 1.5;

async function expectSaved(show: Show, id: number, expected: Point) {
    await expect
        .poll(async () => {
            const p = (await saved(show)).find((m) => m.id === id);
            return p && near(p, expected)
                ? "saved as expected"
                : { p, expected };
        })
        .toBe("saved as expected");
}

/** `value` on the step grid through `origin`, the way rounding puts it. */
const onGrid = (value: number, origin: number, grid: FieldGrid) =>
    origin +
    Math.round((value - origin) / grid.pixelsPerStep) * grid.pixelsPerStep;

/**
 * One finger drags from `from` by `by`; then a second finger lands at
 * `second` and both move a little before lifting. Through CDP, as the shared
 * helpers send touches.
 */
async function dragThenSecondFinger(
    page: Page,
    from: Point,
    by: Point,
    second: Point,
) {
    const cdp = await page.context().newCDPSession(page);
    const send = (
        type: "touchStart" | "touchMove" | "touchEnd",
        points: Point[],
    ) =>
        cdp.send("Input.dispatchTouchEvent", {
            type,
            touchPoints: points.map((p, id) => ({
                x: p.x,
                y: p.y,
                radiusX: FINGERTIP_WIDTH / 2,
                radiusY: FINGERTIP_WIDTH / 2,
                force: 1,
                id,
            })),
        });
    try {
        await send("touchStart", [from]);
        const steps = 10;
        let at = from;
        for (let i = 1; i <= steps; i++) {
            at = {
                x: from.x + (by.x * i) / steps,
                y: from.y + (by.y * i) / steps,
            };
            await send("touchMove", [at]);
        }
        await send("touchStart", [at, second]);
        await send("touchMove", [
            { x: at.x, y: at.y + 10 },
            { x: second.x, y: second.y + 10 },
        ]);
        await send("touchEnd", []);
    } finally {
        await cdp.detach();
    }
}

test.beforeEach(async ({ show }) => {
    await expectCanvasMatchesShow(show);
});

test("a tap near a marcher selects only it; a tap on empty field clears", async ({
    show,
}) => {
    const { page } = show;
    const t2 = await screenOf(page, "T2");
    // 15 px off the dot: a finger's tap still lands on it
    await tap(page, { x: t2.x + 15, y: t2.y });
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T2"]);

    const t3 = await screenOf(page, "T3");
    await tap(page, t3);
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T3"]);

    const before = (await readField(page)).viewport;
    await tap(page, await emptyField(page));
    await expect.poll(() => selectedDrillNumbers(page)).toEqual([]);
    // A tap doesn't move the view
    expect((await readField(page)).viewport).toEqual(before);
    await expectCanvasMatchesShow(show);
});

test("one finger on a marcher moves it, and the view stays put", async ({
    show,
}) => {
    const { page } = show;
    const scale = await canvasScale(page);
    const grid = await fieldGrid(show);
    const before = (await readField(page)).viewport;
    const t2 = await screenOf(page, "T2");
    const by = { x: 4 * grid.pixelsPerStep, y: 2 * grid.pixelsPerStep };
    await touchDrag(page, t2, {
        x: t2.x + by.x * scale,
        y: t2.y + by.y * scale,
    });

    await expectSaved(show, 2, {
        x: onGrid(603 + by.x, grid.centerFront.x, grid),
        y: onGrid(354 + by.y, grid.centerFront.y, grid),
    });
    expect(await selectedDrillNumbers(page)).toEqual(["T2"]);
    expect((await readField(page)).viewport).toEqual(before);
    await expectCanvasMatchesShow(show);
});

test("one finger inside a multi-selection's box moves the whole selection", async ({
    show,
}) => {
    const { page } = show;
    const scale = await canvasScale(page);
    const grid = await fieldGrid(show);
    // T1, then T3 added with the pill's Add
    await tap(page, await screenOf(page, "T1"));
    await tapButton(page, "touch-toggle-add");
    await tap(page, await screenOf(page, "T3"));
    await tapButton(page, "touch-toggle-add");
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T1", "T3"]);

    // Between T1 and T2, inside the box around T1 and T3, clear of every dot
    const t1 = await screenOf(page, "T1");
    const t3 = await screenOf(page, "T3");
    const inside = { x: (t1.x + t3.x) / 2 - 30, y: (t1.y + t3.y) / 2 };
    const by = { x: 0, y: -3 * grid.pixelsPerStep };
    await touchDrag(page, inside, {
        x: inside.x + by.x * scale,
        y: inside.y + by.y * scale,
    });

    // A group moves in whole rounding steps and keeps its offsets: marchers
    // off the grid stay off it (docs/field/implementation-plan.md, Snapping)
    await expectSaved(show, 1, { x: 503, y: 304 + by.y });
    await expectSaved(show, 3, { x: 703, y: 284 + by.y });
    await expectSaved(show, 2, { x: 603, y: 354 });
});

test("a finger that wanders under 12 px moves nothing", async ({ show }) => {
    const { page } = show;
    const before = await saved(show);
    const t2 = await screenOf(page, "T2");
    await touchDrag(page, t2, { x: t2.x + 8, y: t2.y + 5 }, { steps: 4 });
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T2"]);
    expect(await saved(show)).toEqual(before);
    await expectCanvasMatchesShow(show);
});

test("one finger on empty field still moves the view, and nothing else", async ({
    show,
}) => {
    const { page } = show;
    const before = await saved(show);
    const view = (await readField(page)).viewport;
    const from = await emptyField(page);
    await touchDrag(page, from, { x: from.x + 60, y: from.y - 40 });
    await expect
        .poll(async () => (await readField(page)).viewport.pan)
        .not.toEqual(view.pan);
    expect(await saved(show)).toEqual(before);
    expect(await selectedDrillNumbers(page)).toEqual([]);
});

test("a second finger cancels a finger's move: put back, nothing saved", async ({
    show,
}) => {
    const { page } = show;
    const before = await saved(show);
    const t2 = await screenOf(page, "T2");
    await dragThenSecondFinger(
        page,
        t2,
        { x: 80, y: 40 },
        { x: t2.x + 250, y: t2.y + 150 },
    );
    await expect
        .poll(async () => (await readField(page)).activeGesture)
        .toBeNull();
    await page.waitForTimeout(300);
    expect(await saved(show)).toEqual(before);
    await expectCanvasMatchesShow(show);
});

test("Fine on the pill slows a finger's drag to a quarter, off the grid", async ({
    show,
}) => {
    const { page } = show;
    const scale = await canvasScale(page);
    const grid = await fieldGrid(show);
    await tapButton(page, "touch-toggle-fine");
    await expect(page.getByTestId("touch-toggle-fine")).toHaveAttribute(
        "aria-pressed",
        "true",
    );

    // A quarter of a step past a whole number of steps: off the grid
    const moved = {
        x:
            onGrid(603, grid.centerFront.x, grid) +
            2.25 * grid.pixelsPerStep -
            603,
        y:
            onGrid(354, grid.centerFront.y, grid) +
            1.25 * grid.pixelsPerStep -
            354,
    };
    const t2 = await screenOf(page, "T2");
    await touchDrag(
        page,
        t2,
        { x: t2.x + moved.x * 4 * scale, y: t2.y + moved.y * 4 * scale },
        { steps: 16 },
    );
    await expectSaved(show, 2, { x: 603 + moved.x, y: 354 + moved.y });
    await expectCanvasMatchesShow(show);
});

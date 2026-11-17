import type { Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    FINGERTIP_WIDTH,
    canvasScale,
    drawnMarchers,
    expectCanvasMatchesShow,
    longPress,
    multiFingerTap,
    readField,
    selectedDrillNumbers,
    tap,
    touchDrag,
    waitForIdle,
} from "../app.mjs";
import { savedPositions } from "../positions.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";

// Fingers on the field, ported from the Fabric-era touch-canvas scenarios
// (upstream c9784b34a, tablet plan 1.8) to the three.js field. The cases the
// tablet 1.2–1.6 specs already cover live there (touch-field-select,
// touch-field-drag-modes, touch-long-press, history-touch, navigation); these
// are the rest: a pinch that starts on a marcher, a finger's group drag
// undone with two fingers and the box after it, a hesitant drag, the
// selection kept by a finger that pans, Pan for a finger, Add taking a
// marcher out, a press just past a marcher's reach, and the tap that closes
// the long press menu.

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

/** Turns the pill's Add on or off. */
async function setAdd(page: Page, on: boolean) {
    const add = page.getByTestId("touch-toggle-add");
    if ((await add.getAttribute("aria-pressed")) !== String(on))
        await tapButton(page, "touch-toggle-add");
    await expect(add).toHaveAttribute("aria-pressed", String(on));
}

/** Picks a drag mode from the pill's menu. */
async function chooseDragMode(page: Page, mode: string) {
    await tapButton(page, "field-drag-mode");
    await expect(page.getByTestId("field-drag-mode-menu")).toBeVisible();
    await tapButton(page, `field-drag-mode-${mode}`);
    await expect(page.getByTestId("field-drag-mode-menu")).toBeHidden();
}

/**
 * Fingers on the screen through CDP, as the shared helpers send them: each
 * call to `send` says where every finger down is, finger `i` the same finger
 * in every call.
 */
async function withFingers(
    page: Page,
    run: (
        send: (
            type: "touchStart" | "touchMove" | "touchEnd",
            points: Point[],
        ) => Promise<unknown>,
    ) => Promise<void>,
) {
    const cdp = await page.context().newCDPSession(page);
    try {
        await run((type, points) =>
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
            }),
        );
    } finally {
        await cdp.detach();
    }
}

const fieldMenu = (page: Page) => page.getByTestId("field-menu");

const pan = async (page: Page) => (await readField(page)).viewport.pan;

const saved = (show: Show) => savedPositions(show, 0);

const home = PAGE_0.map(([id, x, y]) => ({ id, x, y }));

async function expectNothingMoved(show: Show) {
    await waitForIdle(show.page);
    expect(await saved(show)).toEqual(home);
}

/** Within 1.5 field units on both axes. */
async function expectSavedNear(show: Show, id: number, expected: Point) {
    await expect
        .poll(async () => {
            const p = (await saved(show)).find((m) => m.id === id);
            return p &&
                Math.abs(p.x - expected.x) < 1.5 &&
                Math.abs(p.y - expected.y) < 1.5
                ? "saved as expected"
                : { p, expected };
        })
        .toBe("saved as expected");
}

test.beforeEach(async ({ show }) => {
    await expectCanvasMatchesShow(show);
});

test("a pinch whose first finger lands on a marcher zooms the view and moves no marcher", async ({
    show,
}) => {
    const { page } = show;
    const zoomBefore = (await readField(page)).viewport.zoom;
    const t2 = await screenOf(page, "T2");
    // The first finger on T2, then a second one 100 px across; they spread to 220 px
    const gap = (spread: number) => [
        { x: t2.x, y: t2.y },
        { x: t2.x + spread, y: t2.y },
    ];
    await withFingers(page, async (send) => {
        await send("touchStart", [t2]);
        await send("touchStart", gap(100));
        const steps = 12;
        for (let i = 1; i <= steps; i++)
            await send("touchMove", gap(100 + (120 * i) / steps));
        await send("touchEnd", []);
    });

    await expect
        .poll(async () => (await readField(page)).viewport.zoom / zoomBefore)
        .toBeGreaterThan(1.8);
    await expect
        .poll(async () => (await readField(page)).activeGesture)
        .toBeNull();
    await expectNothingMoved(show);
    await expectCanvasMatchesShow(show);
});

test("a finger's drag of a multi-selection is undone by a two-finger tap; the box fits its marchers again, and a tap inside it picks one marcher", async ({
    show,
}) => {
    const { page } = show;
    // T1, then T3 and T4 added with the pill's Add: their box holds T2
    await tap(page, await screenOf(page, "T1"));
    await setAdd(page, true);
    await tap(page, await screenOf(page, "T3"));
    await tap(page, await screenOf(page, "T4"));
    await setAdd(page, false);
    await expect
        .poll(() => selectedDrillNumbers(page))
        .toEqual(["T1", "T3", "T4"]);

    const t1 = await screenOf(page, "T1");
    await touchDrag(page, t1, { x: t1.x + 100, y: t1.y + 80 });
    await expect.poll(() => saved(show)).not.toEqual(home);
    const moved = await saved(show);
    // The whole selection moved together, T2 stayed
    expect(moved.find((m) => m.id === 2)).toEqual(home[1]);
    for (const id of [1, 3, 4])
        expect(moved.find((m) => m.id === id)).not.toEqual(home[id - 1]);

    await waitForIdle(page);
    await multiFingerTap(page, await emptyField(page), 2);
    await expect.poll(() => saved(show)).toEqual(home);
    await expectCanvasMatchesShow(show);
    expect(await selectedDrillNumbers(page)).toEqual(["T1", "T3", "T4"]);

    // The selection box is where its marchers are drawn: its middle handles
    // sit halfway between the outermost ones
    const boxOffset = async () => {
        const { handles } = await readField(page);
        if (!handles) return null;
        const selected = (await drawnMarchers(page)).filter((m) =>
            ["T1", "T3", "T4"].includes(m.drillNumber),
        );
        const xs = selected.map((m) => m.screen.x);
        const ys = selected.map((m) => m.screen.y);
        const mid = {
            x: (Math.min(...xs) + Math.max(...xs)) / 2,
            y: (Math.min(...ys) + Math.max(...ys)) / 2,
        };
        return Math.max(
            Math.abs((handles.w.x + handles.e.x) / 2 - mid.x),
            Math.abs((handles.n.y + handles.s.y) / 2 - mid.y),
        );
    };
    await expect
        .poll(async () => (await boxOffset()) ?? Infinity)
        .toBeLessThan(2);

    // A tap on T2, inside the box but not selected, selects only it
    await tap(page, await screenOf(page, "T2"));
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T2"]);
});

test("a slow, careful drag of a selected marcher moves it the whole way, keeps it selected and opens no menu", async ({
    show,
}) => {
    const { page } = show;
    await tap(page, await screenOf(page, "T2"));
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T2"]);
    await waitForIdle(page);
    const scale = await canvasScale(page);
    const from = await screenOf(page, "T2");
    const by = { x: 0, y: 90 };

    // Creeps 4 px over 800 ms (inside the tap slop, past the long press
    // time), then slides the rest of the way
    await withFingers(page, async (send) => {
        await send("touchStart", [from]);
        const t0 = Date.now();
        let creep = 0;
        while (Date.now() - t0 < 800) {
            creep = Math.min(4, creep + 0.25);
            await send("touchMove", [{ x: from.x, y: from.y + creep }]);
            await page.waitForTimeout(25);
        }
        const steps = 40;
        for (let i = 1; i <= steps; i++) {
            await send("touchMove", [
                {
                    x: from.x + (by.x * i) / steps,
                    y: from.y + creep + ((by.y - creep) * i) / steps,
                },
            ]);
            await page.waitForTimeout(10);
        }
        await send("touchEnd", []);
    });

    await expectSavedNear(show, 2, {
        x: 603 + by.x / scale,
        y: 354 + by.y / scale,
    });
    expect(await selectedDrillNumbers(page)).toEqual(["T2"]);
    await expect(fieldMenu(page)).toBeHidden();
    await expectCanvasMatchesShow(show);
});

test("a finger's drag on empty field moves the view and keeps the selection; a tap there clears it", async ({
    show,
}) => {
    const { page } = show;
    await tap(page, await screenOf(page, "T2"));
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T2"]);
    await waitForIdle(page);
    const before = await pan(page);
    const from = await emptyField(page);
    await touchDrag(page, from, { x: from.x + 100, y: from.y - 20 });
    await expect.poll(() => pan(page)).not.toEqual(before);
    await page.waitForTimeout(300);
    expect(await selectedDrillNumbers(page)).toEqual(["T2"]);
    await expectNothingMoved(show);

    await tap(page, await emptyField(page));
    await expect.poll(() => selectedDrillNumbers(page)).toEqual([]);
});

test("in Pan, one finger on empty field moves the view one to one, keeps the selection and moves nothing", async ({
    show,
}) => {
    const { page } = show;
    await tap(page, await screenOf(page, "T2"));
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T2"]);
    await chooseDragMode(page, "pan");
    await expect(page.getByTestId("field-drag-mode")).toContainText("Pan");
    await waitForIdle(page);

    const before = await pan(page);
    const from = await emptyField(page);
    await touchDrag(page, from, { x: from.x + 120, y: from.y - 60 });
    await expect
        .poll(async () => {
            const now = await pan(page);
            return Math.hypot(
                now.x - (before.x + 120),
                now.y - (before.y - 60),
            );
        })
        .toBeLessThan(0.5);
    expect(await selectedDrillNumbers(page)).toEqual(["T2"]);
    await expectNothingMoved(show);
});

test("with Add on, a tap on a selected marcher, just above its dot, takes it out", async ({
    show,
}) => {
    const { page } = show;
    await tap(page, await screenOf(page, "T1"));
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T1"]);
    await setAdd(page, true);
    await tap(page, await screenOf(page, "T2"));
    await tap(page, await screenOf(page, "T3"));
    await expect
        .poll(() => selectedDrillNumbers(page))
        .toEqual(["T1", "T2", "T3"]);
    // Past a double tap's time
    await page.waitForTimeout(600);

    // 7 px above T2's dot, on its label; T2 is inside the box, clear of its handles
    const t2 = await screenOf(page, "T2");
    await tap(page, { x: t2.x, y: t2.y - 7 });
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T1", "T3"]);
    await expectNothingMoved(show);
    // (The fixture fails the test on any page error)
});

test("a finger just past a marcher's reach moves the view, not the marcher; a tap within reach picks it", async ({
    show,
}) => {
    const { page } = show;
    const before = await pan(page);
    const t3 = await screenOf(page, "T3");
    // 32 px below the dot: past a finger's 22 px reach
    const start = { x: t3.x, y: t3.y + 32 };
    await touchDrag(page, start, { x: start.x + 120, y: start.y + 60 });
    await expect.poll(() => pan(page)).not.toEqual(before);
    await expectNothingMoved(show);
    expect(await selectedDrillNumbers(page)).toEqual([]);

    // 18 px below it, within reach: a tap selects it
    const t3Now = await screenOf(page, "T3");
    await tap(page, { x: t3Now.x, y: t3Now.y + 18 });
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T3"]);
});

test("a long press on the only selected marcher keeps it selected", async ({
    show,
}) => {
    const { page } = show;
    await tap(page, await screenOf(page, "T2"));
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T2"]);
    await longPress(page, await screenOf(page, "T2"));
    await expect(fieldMenu(page)).toBeVisible();
    await page.waitForTimeout(300);
    expect(await selectedDrillNumbers(page)).toEqual(["T2"]);
    await expectNothingMoved(show);
});

test("the tap on empty field that closes the long press menu doesn't touch the field", async ({
    show,
}) => {
    const { page } = show;
    await longPress(page, await screenOf(page, "T2"));
    await expect(fieldMenu(page)).toBeVisible();
    expect(await selectedDrillNumbers(page)).toEqual(["T2"]);
    const before = await pan(page);

    await tap(page, await emptyField(page));
    await expect(fieldMenu(page)).toBeHidden();
    await page.waitForTimeout(300);
    expect(await selectedDrillNumbers(page)).toEqual(["T2"]);
    expect(await pan(page)).toEqual(before);
    await expectNothingMoved(show);
});

test("the tap on another marcher that closes the long press menu doesn't touch the field", async ({
    show,
}) => {
    const { page } = show;
    await longPress(page, await screenOf(page, "T2"));
    await expect(fieldMenu(page)).toBeVisible();
    expect(await selectedDrillNumbers(page)).toEqual(["T2"]);

    await tap(page, await screenOf(page, "T3"));
    await expect(fieldMenu(page)).toBeHidden();
    await page.waitForTimeout(300);
    expect(await selectedDrillNumbers(page)).toEqual(["T2"]);
    await expectNothingMoved(show);
});

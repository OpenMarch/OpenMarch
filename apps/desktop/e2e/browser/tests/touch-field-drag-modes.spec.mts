import type { Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    FINGERTIP_WIDTH,
    canvasScale,
    drawnMarchers,
    expectCanvasMatchesShow,
    longPress,
    penDrag,
    penHold,
    readField,
    selectedDrillNumbers,
    tap,
    touchDrag,
    touchGesture,
    twoFingerPan,
} from "../app.mjs";
import { savedPositions } from "../positions.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";

// The pill's drag modes (tablet 1.3, docs/tablet-layout.md): what one finger
// or the pen does when its drag starts on empty field. Auto, the default: a
// finger moves the view, the pen draws a box, and a finger held still, then
// dragged, draws a box. Box and Lasso ("finger selects", decision 1): one
// finger draws a box or a lasso, two fingers move the view. Pan: finger and
// pen move the view. The pill's Subtract takes what a box covers out of the
// selection, as Alt does with a mouse. In every mode, a finger or pen held
// still on empty field and lifted without moving opens the field's menu
// (tablet 1.5); held, then dragged, it draws (or, in Pan, moves the view).

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

/** Where field point (x, y) is on screen, from where T2 (603, 354) is drawn. */
async function screenAt(page: Page, x: number, y: number): Promise<Point> {
    const t2 = (await drawnMarchers(page)).find((m) => m.drillNumber === "T2");
    if (!t2?.onScreen) throw new Error("T2 is not visible on the field");
    const scale = await canvasScale(page);
    return {
        x: t2.screen.x + (x - 603) * scale,
        y: t2.screen.y + (y - 354) * scale,
    };
}

/**
 * The corners of a box around T2 and T3 on empty field, clear of T1 and T4,
 * in viewport px.
 */
const aroundT2T3 = async (page: Page) => ({
    from: await screenAt(page, 570, 250),
    to: await screenAt(page, 740, 390),
});

/** Taps the middle of the element with test id `testId`. */
async function tapButton(page: Page, testId: string) {
    const box = await page.getByTestId(testId).boundingBox();
    if (!box) throw new Error(`${testId} is not on screen`);
    await tap(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
}

/** Picks a drag mode from the pill's menu. */
async function chooseDragMode(page: Page, mode: string) {
    await tapButton(page, "field-drag-mode");
    await expect(page.getByTestId("field-drag-mode-menu")).toBeVisible();
    await tapButton(page, `field-drag-mode-${mode}`);
    await expect(page.getByTestId("field-drag-mode-menu")).toBeHidden();
    await expect
        .poll(() =>
            page.evaluate(() =>
                localStorage.getItem("openmarch:fieldDragMode"),
            ),
        )
        .toBe(mode);
}

/** One finger pressed at `from` and held still for `ms`, then dragged to `to`. */
async function holdThenDrag(page: Page, from: Point, to: Point, ms = 800) {
    const cdp = await page.context().newCDPSession(page);
    const send = (type: "touchStart" | "touchMove" | "touchEnd", p?: Point) =>
        cdp.send("Input.dispatchTouchEvent", {
            type,
            touchPoints: p
                ? [
                      {
                          x: p.x,
                          y: p.y,
                          radiusX: FINGERTIP_WIDTH / 2,
                          radiusY: FINGERTIP_WIDTH / 2,
                          force: 1,
                          id: 0,
                      },
                  ]
                : [],
        });
    try {
        await send("touchStart", from);
        await page.waitForTimeout(ms);
        const steps = 12;
        for (let i = 1; i <= steps; i++)
            await send("touchMove", {
                x: from.x + ((to.x - from.x) * i) / steps,
                y: from.y + ((to.y - from.y) * i) / steps,
            });
        await send("touchEnd");
    } finally {
        await cdp.detach();
    }
}

const fieldMenu = (page: Page) => page.getByTestId("field-menu");

const pan = async (page: Page) => (await readField(page)).viewport.pan;

const saved = (show: Show) => savedPositions(show, 0);

test.beforeEach(async ({ show }) => {
    await expectCanvasMatchesShow(show);
});

test.describe("Auto, the default", () => {
    test("one finger on empty field moves the view and selects nothing", async ({
        show,
    }) => {
        const { page } = show;
        await expect(page.getByTestId("field-drag-mode")).toContainText("Auto");
        const before = await pan(page);
        const { from, to } = await aroundT2T3(page);
        await touchDrag(page, from, to);
        await expect.poll(() => pan(page)).not.toEqual(before);
        expect(await selectedDrillNumbers(page)).toEqual([]);
    });

    test("a finger held still, then dragged, draws a box", async ({ show }) => {
        const { page } = show;
        const before = await pan(page);
        const { from, to } = await aroundT2T3(page);
        await holdThenDrag(page, from, to);
        await expect
            .poll(() => selectedDrillNumbers(page))
            .toEqual(["T2", "T3"]);
        expect(await pan(page)).toEqual(before);
    });

    test("a finger held still on empty field, then lifted, opens the field's menu and draws nothing", async ({
        show,
    }) => {
        const { page } = show;
        const before = await pan(page);
        const { from } = await aroundT2T3(page);
        await longPress(page, from);
        await expect(fieldMenu(page)).toBeVisible();
        expect(await selectedDrillNumbers(page)).toEqual([]);
        expect(await pan(page)).toEqual(before);
    });

    test("the pen draws a box", async ({ show }) => {
        const { page } = show;
        const before = await pan(page);
        const { from, to } = await aroundT2T3(page);
        await penDrag(page, from, to);
        await expect
            .poll(() => selectedDrillNumbers(page))
            .toEqual(["T2", "T3"]);
        expect(await pan(page)).toEqual(before);
    });
});

test.describe("finger selects (Box and Lasso)", () => {
    test("Box: one finger draws a box, and two fingers still move the view", async ({
        show,
    }) => {
        const { page } = show;
        const positions = await saved(show);
        await chooseDragMode(page, "box");
        await expect(page.getByTestId("field-drag-mode")).toContainText("Box");
        const before = await pan(page);
        const { from, to } = await aroundT2T3(page);
        await touchDrag(page, from, to);
        await expect
            .poll(() => selectedDrillNumbers(page))
            .toEqual(["T2", "T3"]);
        expect(await pan(page)).toEqual(before);

        // Two fingers on empty field pan; the selection stays
        await twoFingerPan(page, await screenAt(page, 650, 470), {
            x: 60,
            y: -40,
        });
        await expect.poll(() => pan(page)).not.toEqual(before);
        expect(await selectedDrillNumbers(page)).toEqual(["T2", "T3"]);
        // Nothing moved
        expect(await saved(show)).toEqual(positions);
    });

    test("Lasso: one finger draws around marchers to select them", async ({
        show,
    }) => {
        const { page } = show;
        await chooseDragMode(page, "lasso");
        // Around T1 and T2, back near the start so it closes
        const loop = [
            await screenAt(page, 470, 270),
            await screenAt(page, 640, 270),
            await screenAt(page, 640, 390),
            await screenAt(page, 470, 390),
            await screenAt(page, 470, 280),
        ];
        const steps: Point[][] = [[loop[0]]];
        for (let i = 1; i < loop.length; i++)
            for (let k = 1; k <= 6; k++)
                steps.push([
                    {
                        x:
                            loop[i - 1].x +
                            ((loop[i].x - loop[i - 1].x) * k) / 6,
                        y:
                            loop[i - 1].y +
                            ((loop[i].y - loop[i - 1].y) * k) / 6,
                    },
                ]);
        const before = await pan(page);
        await touchGesture(page, steps);
        await expect
            .poll(() => selectedDrillNumbers(page))
            .toEqual(["T1", "T2"]);
        expect(await pan(page)).toEqual(before);
    });

    test("a finger on a marcher still moves it, in Box too", async ({
        show,
    }) => {
        const { page } = show;
        await chooseDragMode(page, "box");
        const t2 = await screenAt(page, 603, 354);
        await touchDrag(page, t2, { x: t2.x + 60, y: t2.y });
        await expect
            .poll(async () => (await saved(show)).find((m) => m.id === 2)?.x)
            .toBeGreaterThan(620);
    });
});

test("Box: a finger held still on empty field, then lifted, opens the field's menu; held, then dragged, draws the box", async ({
    show,
}) => {
    const { page } = show;
    await chooseDragMode(page, "box");
    const { from, to } = await aroundT2T3(page);
    await longPress(page, from);
    await expect(fieldMenu(page)).toBeVisible();
    expect(await selectedDrillNumbers(page)).toEqual([]);
    // Escape closes it
    await page.keyboard.press("Escape");
    await expect(fieldMenu(page)).toBeHidden();

    await holdThenDrag(page, from, to);
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T2", "T3"]);
    await expect(fieldMenu(page)).toBeHidden();
});

test("Pan: the pen moves the view instead of drawing a box", async ({
    show,
}) => {
    const { page } = show;
    await chooseDragMode(page, "pan");
    const before = await pan(page);
    const { from, to } = await aroundT2T3(page);
    await penDrag(page, from, to);
    await expect.poll(() => pan(page)).not.toEqual(before);
    expect(await selectedDrillNumbers(page)).toEqual([]);
});

test("Pan: the pen held still on empty field, then lifted, opens the field's menu", async ({
    show,
}) => {
    const { page } = show;
    await chooseDragMode(page, "pan");
    const before = await pan(page);
    const { from } = await aroundT2T3(page);
    await penHold(page, from);
    await expect(fieldMenu(page)).toBeVisible();
    expect(await pan(page)).toEqual(before);
});

test("Subtract on the pill: a box takes what it covers out of the selection", async ({
    show,
}) => {
    const { page } = show;
    await chooseDragMode(page, "box");
    // All four
    await touchDrag(
        page,
        await screenAt(page, 450, 220),
        await screenAt(page, 860, 450),
    );
    await expect
        .poll(() => selectedDrillNumbers(page))
        .toEqual(["T1", "T2", "T3", "T4"]);

    await tapButton(page, "touch-toggle-subtract");
    await expect(page.getByTestId("touch-toggle-subtract")).toHaveAttribute(
        "aria-pressed",
        "true",
    );
    const { from, to } = await aroundT2T3(page);
    await touchDrag(page, from, to);
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T1", "T4"]);
});

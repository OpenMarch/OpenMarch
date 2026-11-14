import type { Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    drawnMarchers,
    expectCanvasMatchesShow,
    longPress,
    penHold,
    FINGERTIP_WIDTH,
    canvasScale,
    readField,
    selectedDrillNumbers,
    tap,
    touchGesture,
    waitForIdle,
} from "../app.mjs";
import { savedPositions } from "../positions.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";

// A long press opens the menus a right-click does (tablet 1.5,
// docs/conventions/tablet-parity.md section 2): a finger or a pen held still
// on a marcher for half a second and lifted without moving selects it, if it
// wasn't, and opens the field's menu there, leaving nothing pressed under it.
// Holding only arms it: a finger that moves on after the hold drags as usual
// (a hesitant finger), and a press that wanders past the long press slop
// first is a drag too, never a menu. Double-click-only actions have menu
// entries: on a placed shape selected whole, "Select only this marcher" goes
// inside it at the marcher pressed, as a double-click on it does.

// Four trumpets on Page 1, all in view, on two pages.
const HOME: SeedPosition[] = [
    [1, 503, 304],
    [2, 603, 354],
    [3, 703, 284],
    [4, 803, 404],
];

test.use({
    seedSql: seedShowSql({
        beats: 32,
        pageStarts: [16],
        measureStarts: Array.from({ length: 8 }, (_, i) => 1 + i * 4),
        marchers: HOME.map(([id]) => ({
            id,
            section: "Trumpet",
            prefix: "T",
            order: id,
        })),
        positions: [HOME, HOME],
    }),
    // A touch screen, in the touch layout
    touchScreen: true,
    initScript: "localStorage.setItem('openmarch:inputMode', 'touch');",
    allowedPageErrors: [/Audio worklet error/],
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

/** Taps the middle of `testId` with a finger. */
async function tapTestId(page: Page, testId: string) {
    const box = await page.getByTestId(testId).boundingBox();
    if (!box) throw new Error(`${testId} is not on screen`);
    await tap(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
}

const menu = (page: Page) => page.getByTestId("field-menu");

/** One finger presses at `from`, holds still for `holdMs`, then drags by `by` and lifts. */
async function holdThenDrag(page: Page, from: Point, by: Point, holdMs = 800) {
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
        await page.waitForTimeout(holdMs);
        const steps = 10;
        for (let i = 1; i <= steps; i++)
            await send("touchMove", {
                x: from.x + (by.x * i) / steps,
                y: from.y + (by.y * i) / steps,
            });
        await send("touchEnd");
    } finally {
        await cdp.detach();
    }
}

async function expectNothingMoved(show: Show) {
    await waitForIdle(show.page);
    expect(await savedPositions(show, 0)).toEqual(
        HOME.map(([id, x, y]) => ({ id, x, y })),
    );
}

test.beforeEach(async ({ show }) => {
    await expectCanvasMatchesShow(show);
});

test("a finger held on a marcher selects it and opens the field's menu, and nothing moves", async ({
    show,
}) => {
    const { page } = show;
    await tap(page, await screenOf(page, "T3"));
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T3"]);

    const before = (await readField(page)).viewport;
    await longPress(page, await screenOf(page, "T2"));
    await expect(menu(page)).toBeVisible();
    expect(await selectedDrillNumbers(page)).toEqual(["T2"]);
    // Still open after the finger lifted, and nothing was dragged or panned
    await expect(menu(page)).toBeVisible();
    expect((await readField(page)).viewport).toEqual(before);
    await expectNothingMoved(show);

    // An entry runs from it: Select all
    await tapTestId(page, "field-menu-selectAllMarchers");
    await expect(menu(page)).toBeHidden();
    await expect
        .poll(() => selectedDrillNumbers(page))
        .toEqual(["T1", "T2", "T3", "T4"]);
});

test("a finger held on a marcher past the long press time, then dragged, moves it and opens no menu", async ({
    show,
}) => {
    const { page } = show;
    const scale = await canvasScale(page);
    await holdThenDrag(page, await screenOf(page, "T2"), {
        x: 60 * scale,
        y: 0,
    });
    await waitForIdle(page);
    await expect(menu(page)).toBeHidden();
    expect(await selectedDrillNumbers(page)).toEqual(["T2"]);
    await expect
        .poll(async () => {
            const t2 = (await savedPositions(show, 0)).find((m) => m.id === 2);
            return t2 && t2.x > 603 + 30;
        })
        .toBe(true);
});

test("a pen held on a marcher selects it and opens the field's menu, and nothing moves", async ({
    show,
}) => {
    const { page } = show;
    await penHold(page, await screenOf(page, "T4"));
    await expect(menu(page)).toBeVisible();
    expect(await selectedDrillNumbers(page)).toEqual(["T4"]);
    await expectNothingMoved(show);
    await page.keyboard.press("Escape");
    await expect(menu(page)).toBeHidden();
});

test("a finger or pen that wanders past the slop before the hold opens no menu", async ({
    show,
}) => {
    const { page } = show;
    const t1 = await screenOf(page, "T1");
    // A finger on empty field below T1 moves 30 px, then holds still
    const empty = { x: t1.x, y: t1.y + 120 };
    await touchGesture(
        page,
        [
            [empty],
            [{ x: empty.x + 15, y: empty.y }],
            [{ x: empty.x + 30, y: empty.y }],
        ],
        { holdMs: 700 },
    );
    await expect(menu(page)).toBeHidden();

    // A pen on T1 moves 30 px (a drag), then holds still
    await penHold(page, t1, {
        wander: [
            { x: t1.x + 15, y: t1.y },
            { x: t1.x + 30, y: t1.y },
        ],
    });
    await expect(menu(page)).toBeHidden();
});

test("on a shape selected whole, Select only this marcher in the long press menu goes inside it there", async ({
    show,
}) => {
    const { page } = show;
    // Group the four into one shape, which then selects whole
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(() => selectedDrillNumbers(page))
        .toEqual(["T1", "T2", "T3", "T4"]);
    await page.keyboard.press("ControlOrMeta+g");
    await expect(page.getByTestId("placed-box-readout")).toBeVisible();

    await longPress(page, await screenOf(page, "T2"));
    await expect(menu(page)).toBeVisible();
    // The whole shape stays selected for the menu
    expect(await selectedDrillNumbers(page)).toEqual(["T1", "T2", "T3", "T4"]);
    await tapTestId(page, "field-menu-shapeEnterBox");
    await expect(menu(page)).toBeHidden();
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T2"]);
});

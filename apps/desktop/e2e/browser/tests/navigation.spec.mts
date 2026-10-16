import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures.mjs";
import { readField, waitForIdle } from "../app.mjs";
import type { Show } from "../fixtures.mjs";

// Navigation on the field (fork #194): wheel, trackpad, pinch, pan drags,
// limits, the zoom controls, fullscreen and touch, with the two decided
// changes in #189's rules table ("Panning" and "Alt"). The view is read only
// through the field test API.

type View = { zoom: number; pan: { x: number; y: number } };

const view = async (page: Page): Promise<View> =>
    (await readField(page)).viewport;

/** The field's size in field units, from the show file. */
async function fieldSize(show: Show) {
    const [row] = await show.query<{ json_data: string }>(
        "SELECT json_data FROM field_properties",
    );
    const { centerFrontPoint } = JSON.parse(row.json_data) as {
        centerFrontPoint: { xPixels: number; yPixels: number };
    };
    // The front center sits mid-way across the front sideline
    return {
        width: centerFrontPoint.xPixels * 2,
        height: centerFrontPoint.yPixels,
    };
}

async function fieldBox(page: Page) {
    const box = await page.getByTestId("fieldCanvas").boundingBox();
    if (!box) throw new Error("The field is not on screen");
    return box;
}

/** A point in the field's element, in viewport pixels. */
const inField = async (page: Page, x: number, y: number) => {
    const box = await fieldBox(page);
    return { x: box.x + x, y: box.y + y };
};

/** Where field point `at` is drawn, relative to the field's element. */
const drawnAt = (v: View, at: { x: number; y: number }) => ({
    x: v.pan.x + at.x * v.zoom,
    y: v.pan.y + at.y * v.zoom,
});
const fieldPointAt = (v: View, x: number, y: number) => ({
    x: (x - v.pan.x) / v.zoom,
    y: (y - v.pan.y) / v.zoom,
});

/**
 * Within a pixel or two: the field's size is rounded to whole pixels.
 */
const expectNear = (actual: number, expected: number, within = 1.5) =>
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(within);

/** Waits for the view to stop changing, then reads it. */
async function settledView(page: Page) {
    let last = "";
    await expect
        .poll(async () => {
            const now = JSON.stringify(await view(page));
            const same = now === last;
            last = now;
            return same;
        })
        .toBe(true);
    return JSON.parse(last) as View;
}

/** Waits until `read` of the view is `expected`. */
const waitForView = (
    page: Page,
    read: (v: View) => number,
    expected: number,
    within = 0.01,
) =>
    expect
        .poll(async () => Math.abs(read(await view(page)) - expected))
        .toBeLessThanOrEqual(within);

/** The view a show opens at: the field centered, its height fitted but never above 100%. */
async function openingView(show: Show): Promise<View> {
    const field = await fieldSize(show);
    const box = await fieldBox(show.page);
    const zoom = Math.min(1, box.height / field.height);
    return {
        zoom,
        pan: {
            x: (box.width - field.width * zoom) / 2,
            y: (box.height - field.height * zoom) / 2,
        },
    };
}

/**
 * Waits for the opening view and returns it. As a show opens, the field
 * centers again once the panels around it settle, so every scenario starts
 * here.
 */
async function openedView(show: Show) {
    const expected = await openingView(show);
    await waitForView(show.page, (v) => v.zoom, expected.zoom, 0.005);
    await waitForView(show.page, (v) => v.pan.x, expected.pan.x, 1.5);
    const opened = await settledView(show.page);
    expectNear(opened.pan.x, expected.pan.x);
    expectNear(opened.pan.y, expected.pan.y);
    return opened;
}

/** Scrolls the wheel at `at` (field element pixels), holding `modifier`. */
async function wheelAt(
    page: Page,
    at: { x: number; y: number },
    delta: { x?: number; y?: number },
    modifier?: "Control",
) {
    const point = await inField(page, at.x, at.y);
    await page.mouse.move(point.x, point.y);
    if (modifier) await page.keyboard.down(modifier);
    await page.mouse.wheel(delta.x ?? 0, delta.y ?? 0);
    if (modifier) await page.keyboard.up(modifier);
}

/** Drags across the field from `from` by `by`, with `button` (and `modifier`) held. */
async function dragField(
    page: Page,
    from: { x: number; y: number },
    by: { x: number; y: number },
    {
        button = "left",
        modifier,
    }: { button?: "left" | "right" | "middle"; modifier?: "Alt" } = {},
) {
    const start = await inField(page, from.x, from.y);
    await page.mouse.move(start.x, start.y);
    if (modifier) await page.keyboard.down(modifier);
    await page.mouse.down({ button });
    await page.mouse.move(start.x + by.x, start.y + by.y, { steps: 10 });
    await page.mouse.up({ button });
    if (modifier) await page.keyboard.up(modifier);
    await waitForIdle(page);
}

/** The field element's center. */
async function center(page: Page) {
    const box = await fieldBox(page);
    return { x: box.width / 2, y: box.height / 2 };
}

const MOUSE_MODE = { mouseSettings: { trackpadMode: false } };

test("opens with the field centered at its base zoom, and Reset returns there", async ({
    show,
}) => {
    const { page } = show;
    await openedView(show);
    await expect(page.getByTitle("Reset Zoom and Center")).toHaveText("100%");

    await wheelAt(page, await center(page), { x: 300, y: 200 });
    await page.getByTitle("Zoom In").click();
    await expect(page.getByTitle("Reset Zoom and Center")).toHaveText("120%");

    await page.getByTitle("Reset Zoom and Center").click();
    await openedView(show);
    await expect(page.getByTitle("Reset Zoom and Center")).toHaveText("100%");
});

test.describe("trackpad mode (the default)", () => {
    test("two-finger scroll pans by half the scroll, at the default sensitivity", async ({
        show,
    }) => {
        const { page } = show;
        const before = await openedView(show);
        await wheelAt(page, await center(page), { x: 40, y: 60 });
        await waitForView(page, (v) => v.pan.y, before.pan.y - 30);
        const after = await view(page);
        expectNear(after.pan.x, before.pan.x - 20, 0.01);
        expect(after.zoom).toBe(before.zoom);
    });

    test("a pinch zooms at the pointer", async ({ show }) => {
        const { page } = show;
        const before = await openedView(show);
        const at = { x: 300, y: 200 };
        const under = fieldPointAt(before, at.x, at.y);
        // A trackpad pinch arrives as Ctrl+wheel
        await wheelAt(page, at, { y: -20 }, "Control");
        await waitForView(page, (v) => v.zoom, before.zoom * 0.99 ** -10, 1e-4);
        const drawn = drawnAt(await view(page), under);
        expectNear(drawn.x, at.x, 0.5);
        expectNear(drawn.y, at.y, 0.5);
    });

    test("the field can't be scrolled more than one screen past its edges", async ({
        show,
    }) => {
        const { page } = show;
        const field = await fieldSize(show);
        const box = await fieldBox(page);
        const { zoom } = await openedView(show);
        for (let i = 0; i < 6; i++)
            await wheelAt(page, await center(page), { x: -4000, y: -4000 });
        // The field is narrower than the screen at the opening zoom: it may
        // sit anywhere across it, and scroll one screen past that
        const spareX = box.width - field.width * zoom;
        await waitForView(
            page,
            (v) => v.pan.x,
            Math.max(spareX, 0) + box.width,
            1.5,
        );
        await waitForView(
            page,
            (v) => v.pan.y,
            Math.max(box.height - field.height * zoom, 0) + box.height,
            1.5,
        );

        for (let i = 0; i < 12; i++)
            await wheelAt(page, await center(page), { x: 4000, y: 4000 });
        await waitForView(
            page,
            (v) => v.pan.x,
            Math.min(spareX, 0) - box.width,
            1.5,
        );
    });
});

test.describe("mouse mode", () => {
    test.use({ uiSettings: MOUSE_MODE });

    test("the wheel zooms at the cursor", async ({ show }) => {
        const { page } = show;
        const before = await openedView(show);
        const at = { x: 250, y: 180 };
        const under = fieldPointAt(before, at.x, at.y);

        await wheelAt(page, at, { y: -100 });
        const zoomedIn = before.zoom * 0.997 ** -50;
        await waitForView(page, (v) => v.zoom, zoomedIn, 1e-4);
        const drawn = drawnAt(await view(page), under);
        expectNear(drawn.x, at.x, 0.5);
        expectNear(drawn.y, at.y, 0.5);

        await wheelAt(page, at, { y: 100 });
        await waitForView(page, (v) => v.zoom, before.zoom, 1e-4);
    });

    test("a pinch zooms at the pointer, faster than the wheel", async ({
        show,
    }) => {
        const { page } = show;
        const before = await openedView(show);
        await wheelAt(page, await center(page), { y: -20 }, "Control");
        await waitForView(page, (v) => v.zoom, before.zoom * 0.99 ** -10, 1e-4);
    });

    test("the zoom stops at 20% and 2500%", async ({ show }) => {
        const { page } = show;
        await openedView(show);
        for (let i = 0; i < 6; i++)
            await wheelAt(page, await center(page), { y: -1000 });
        await waitForView(page, (v) => v.zoom, 25, 1e-6);
        for (let i = 0; i < 6; i++)
            await wheelAt(page, await center(page), { y: 1000 });
        await waitForView(page, (v) => v.zoom, 0.2, 1e-6);
    });
});

test("right-drag pans one to one", async ({ show }) => {
    const { page } = show;
    const before = await openedView(show);
    await dragField(
        page,
        await center(page),
        { x: 120, y: -80 },
        {
            button: "right",
        },
    );
    const after = await settledView(page);
    expectNear(after.pan.x, before.pan.x + 120, 0.01);
    expectNear(after.pan.y, before.pan.y - 80, 0.01);
    expect(after.zoom).toBe(before.zoom);
    expect((await readField(page)).activeGesture).toBeNull();
});

test("middle-drag pans one to one", async ({ show }) => {
    const { page } = show;
    const before = await openedView(show);
    await dragField(
        page,
        await center(page),
        { x: -90, y: 60 },
        {
            button: "middle",
        },
    );
    const after = await settledView(page);
    expectNear(after.pan.x, before.pan.x - 90, 0.01);
    expectNear(after.pan.y, before.pan.y + 60, 0.01);
});

test("Alt+drag doesn't pan", async ({ show }) => {
    const { page } = show;
    const before = await openedView(show);
    await dragField(
        page,
        await center(page),
        { x: 100, y: 70 },
        {
            modifier: "Alt",
        },
    );
    expect(await settledView(page)).toEqual(before);
});

test("the zoom buttons zoom by a fifth at the center", async ({ show }) => {
    const { page } = show;
    const before = await openedView(show);
    const middle = await center(page);
    const under = fieldPointAt(before, middle.x, middle.y);

    await page.getByTitle("Zoom In").click();
    await waitForView(page, (v) => v.zoom, before.zoom * 1.2, 1e-6);
    const drawn = drawnAt(await view(page), under);
    expectNear(drawn.x, middle.x, 0.5);
    expectNear(drawn.y, middle.y, 0.5);

    await page.getByTitle("Zoom Out").click();
    await page.getByTitle("Zoom Out").click();
    await waitForView(page, (v) => v.zoom, before.zoom / 1.2, 1e-6);
    await expect(page.getByTitle("Reset Zoom and Center")).toHaveText("83%");
});

test("fullscreen fits the whole field, and leaving it centers the field again", async ({
    show,
}) => {
    const { page } = show;
    const field = await fieldSize(show);
    const before = await openedView(show);

    await page
        .getByRole("button", { name: "Toggle timeline fullscreen" })
        .click();
    await expect
        .poll(async () => (await view(page)).zoom)
        .not.toBe(before.zoom);
    // Centered across at 87% of the room, a tenth of the spare height down.
    // Today's fit measures the room with the 128 px left above the field, so
    // when the height limits it the field's back edge can run off the bottom.
    // The canvas can take a moment to grow into the room: read both afresh.
    const offCenter = async () => {
        const v = await view(page);
        const { width } = await fieldBox(page);
        return Math.abs(v.pan.x - (width - field.width * v.zoom) / 2);
    };
    await expect.poll(offCenter).toBeLessThanOrEqual(1.5);
    const fit = await settledView(page);
    const box = await fieldBox(page);
    expect(fit.pan.y).toBeGreaterThan(0);
    expect(fit.zoom).toBeLessThanOrEqual(
        (box.width / field.width) * 0.87 + 1e-6,
    );

    await page
        .getByRole("button", { name: "Toggle timeline fullscreen" })
        .click();
    await openedView(show);
});

test.describe("touch", () => {
    /** Touches the field: each step is the fingers down, in field element pixels. */
    async function touchGesture(
        page: Page,
        steps: { x: number; y: number }[][],
    ) {
        const cdp = await page.context().newCDPSession(page);
        const box = await fieldBox(page);
        const send = (
            type: "touchStart" | "touchMove" | "touchEnd",
            points: { x: number; y: number }[],
        ) =>
            cdp.send("Input.dispatchTouchEvent", {
                type,
                touchPoints: points.map((p, id) => ({
                    x: box.x + p.x,
                    y: box.y + p.y,
                    id,
                })),
            });
        await send("touchStart", steps[0]);
        for (const points of steps.slice(1)) await send("touchMove", points);
        await send("touchEnd", []);
        await cdp.detach();
    }

    test("one finger pans, at the pan sensitivity", async ({ show }) => {
        const { page } = show;
        const before = await openedView(show);
        const from = await center(page);
        await touchGesture(
            page,
            Array.from({ length: 11 }, (_, i) => [
                { x: from.x + i * 10, y: from.y + i * 6 },
            ]),
        );
        // 100 × 60 px of finger, at the default sensitivity of 0.5
        await waitForView(page, (v) => v.pan.x, before.pan.x + 50, 0.01);
        await waitForView(page, (v) => v.pan.y, before.pan.y + 30, 0.01);
    });

    test("two fingers pinch at the point between them", async ({ show }) => {
        const { page } = show;
        const before = await openedView(show);
        const mid = await center(page);
        const under = fieldPointAt(before, mid.x, mid.y);
        const fingers = (spread: number) => [
            { x: mid.x - spread, y: mid.y },
            { x: mid.x + spread, y: mid.y },
        ];
        await touchGesture(
            page,
            Array.from({ length: 11 }, (_, i) => fingers(50 + i * 5)),
        );
        // 0.01 zoom per pixel the fingers spread: 100 px
        await waitForView(page, (v) => v.zoom, before.zoom + 1, 1e-6);
        const drawn = drawnAt(await view(page), under);
        expectNear(drawn.x, mid.x, 0.5);
        expectNear(drawn.y, mid.y, 0.5);
    });
});

test("fullscreen's perspective tilts the field, and leaving fullscreen flattens it", async ({
    show,
}) => {
    const { page } = show;
    const perspective = page.getByTestId("field-perspective");
    // Only in fullscreen
    await expect(perspective).toBeDisabled();
    await page
        .getByRole("button", { name: "Toggle timeline fullscreen" })
        .click();
    await expect(perspective).toBeEnabled();
    const tilt = page.getByTestId("fieldTilt");
    const flat = (await tilt.boundingBox())!;

    await perspective.click();
    const slider = page.getByRole("slider", { name: "Perspective" });
    await slider.focus();
    for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowRight");
    await expect(perspective).toHaveAccessibleName("Perspective, 40°");
    // Leaning back, the field looks shorter on screen
    await expect
        .poll(async () => (await tilt.boundingBox())!.height)
        .toBeLessThan(flat.height * 0.9);
    await page.keyboard.press("Escape");

    await page
        .getByRole("button", { name: "Toggle timeline fullscreen" })
        .click();
    await expect(perspective).toHaveAccessibleName("Perspective, 0°");
    await expect
        .poll(async () => {
            const box = (await tilt.boundingBox())!;
            const inner = await tilt.evaluate((el) => el.clientHeight);
            return Math.abs(box.height - inner);
        })
        .toBeLessThanOrEqual(1);
});

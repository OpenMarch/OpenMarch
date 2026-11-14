import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures.mjs";
import {
    pinch,
    readField,
    touchDrag,
    twoFingerPan,
    waitForIdle,
} from "../app.mjs";
import type { Show } from "../fixtures.mjs";

// Navigation on the field (fork #194): wheel, trackpad, pinch, pan drags,
// limits, the zoom controls, Preview and touch, with the two decided
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

/**
 * The view a show opens at, and Reset returns to: the whole field fitted into
 * the field's pane with a 16 px margin (at most 5% of a side), and centered.
 */
async function openingView(show: Show): Promise<View> {
    const field = await fieldSize(show);
    const box = await fieldBox(show.page);
    const room = (size: number) => size - 2 * Math.min(16, size * 0.05);
    const zoom = Math.min(
        room(box.width) / field.width,
        room(box.height) / field.height,
    );
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

test("Reset fits the whole field into the pane the timeline leaves", async ({
    show,
}) => {
    const { page } = show;
    const opened = await openedView(show);
    const before = await fieldBox(page);

    // A taller timeline leaves a shorter pane; the zoom stays until Reset
    const splitter = page.getByTestId("timeline-splitter");
    await splitter.focus();
    for (let i = 0; i < 4; i++) await splitter.press("Shift+ArrowUp");
    await expect
        .poll(async () => (await fieldBox(page)).height)
        .toBeLessThan(before.height - 50);
    expect((await settledView(page)).zoom).toBe(opened.zoom);

    await page.getByTitle("Reset Zoom and Center").click();
    const expected = await openingView(show);
    await waitForView(page, (v) => v.zoom, expected.zoom, 0.005);
    await waitForView(page, (v) => v.pan.x, expected.pan.x, 1.5);
    await waitForView(page, (v) => v.pan.y, expected.pan.y, 1.5);
    await expect(page.getByTitle("Reset Zoom and Center")).toHaveText("100%");

    // The whole field is on screen
    const field = await fieldSize(show);
    const box = await fieldBox(page);
    const fitted = await view(page);
    expect(fitted.pan.x).toBeGreaterThanOrEqual(0);
    expect(fitted.pan.y).toBeGreaterThanOrEqual(0);
    expect(fitted.pan.x + field.width * fitted.zoom).toBeLessThanOrEqual(
        box.width,
    );
    expect(fitted.pan.y + field.height * fitted.zoom).toBeLessThanOrEqual(
        box.height,
    );
});

/**
 * Clicks `selector` (Reset, unless given) in the page and reads the zoom
 * every frame for `ms`. With `interrupt`, scrolls or presses the field that
 * many frames after the click.
 */
const zoomsAfterClick = (
    page: Page,
    ms: number,
    interrupt?: { after: number; by: "wheel" | "press" },
    selector = '[title="Reset Zoom and Center"]',
) =>
    page.evaluate(
        async ({ ms, interrupt, selector }) => {
            const reset = document.querySelector<HTMLElement>(selector)!;
            const surface = document.querySelector<HTMLElement>(
                '[data-testid="threeField"]',
            )!;
            const zooms: number[] = [];
            reset.click();
            const start = performance.now();
            while (performance.now() - start < ms) {
                await new Promise(requestAnimationFrame);
                if (zooms.length === interrupt?.after) {
                    const box = surface.getBoundingClientRect();
                    const at = {
                        clientX: box.left + box.width / 2,
                        clientY: box.top + box.height / 2,
                        bubbles: true,
                        cancelable: true,
                    };
                    if (interrupt.by === "wheel")
                        surface.dispatchEvent(
                            new WheelEvent("wheel", { ...at, deltaX: 40 }),
                        );
                    else {
                        surface.dispatchEvent(
                            new PointerEvent("pointerdown", at),
                        );
                        surface.dispatchEvent(
                            new PointerEvent("pointerup", at),
                        );
                    }
                }
                zooms.push(window.fieldTest!.viewport().zoom);
            }
            return zooms;
        },
        { ms, interrupt, selector },
    );

/** Preview's fit: 87% of the pane, centered across, a tenth of the spare height down. */
async function previewFitView(
    page: Page,
    field: { width: number; height: number },
): Promise<View> {
    const box = await fieldBox(page);
    const zoom =
        Math.min(box.width / field.width, box.height / field.height) * 0.87;
    return {
        zoom,
        pan: {
            x: (box.width - field.width * zoom) / 2,
            y: (box.height - field.height * zoom) / 10,
        },
    };
}

/** Waits for the view to settle, and checks it's `expected`. */
async function landsOnView(page: Page, expected: () => Promise<View>) {
    const fit = await settledView(page);
    const want = await expected();
    expectNear(fit.zoom, want.zoom, 0.005);
    expectNear(fit.pan.x, want.pan.x);
    expectNear(fit.pan.y, want.pan.y);
}

/**
 * Several frames strictly between where the zoom began and where it landed,
 * and every frame on the way there: it never heads off toward another fit
 * first.
 */
function glided(zooms: number[], from: number) {
    const to = zooms.at(-1)!;
    const [low, high] = from < to ? [from, to] : [to, from];
    const between = zooms.filter(
        (zoom) => zoom > low + 0.005 && zoom < high - 0.005,
    );
    expect(between.length).toBeGreaterThanOrEqual(3);
    const direction = Math.sign(to - from);
    zooms.slice(1).forEach((zoom, i) => {
        expect((zoom - zooms[i]) * direction).toBeGreaterThanOrEqual(-1e-9);
    });
}

/** Names a GPU to the field, which otherwise sees the software WebGL here. */
const NAME_A_GPU = `{
    for (const gl of [WebGLRenderingContext, WebGL2RenderingContext]) {
        const getParameter = gl.prototype.getParameter;
        gl.prototype.getParameter = function (name) {
            // UNMASKED_RENDERER_WEBGL and RENDERER
            if (name === 0x9246 || name === 0x1f01) return "Test GPU";
            return getParameter.call(this, name);
        };
    }
}`;

const fieldQualityMode = (page: Page) =>
    page.evaluate(() => window.fieldTest!.quality!().mode);

test.describe("at full quality", () => {
    // The machines here draw WebGL in software, which puts the field in its
    // low-quality mode: name a GPU instead
    test.use({
        initScript: NAME_A_GPU,
    });
    test.skip(
        ({ target }) => target !== "browser",
        "Names a GPU with an init script",
    );

    test("Reset glides to the fit, and a scroll or a press stops the glide", async ({
        show,
    }) => {
        const { page } = show;
        expect(await fieldQualityMode(page)).toBe("full");
        const opened = await openedView(show);
        for (let i = 0; i < 4; i++) await page.getByTitle("Zoom In").click();
        const zoomedIn = (await settledView(page)).zoom;

        // It zooms out over several frames, never past the fit, and lands on it
        const zooms = await zoomsAfterClick(page, 1500);
        const gliding = zooms.filter(
            (zoom) => zoom < zoomedIn - 0.01 && zoom > opened.zoom + 0.01,
        );
        // Slow software frames can leave only a few in between
        expect(gliding.length).toBeGreaterThanOrEqual(3);
        zooms.slice(1).forEach((zoom, i) => {
            expect(zoom).toBeLessThanOrEqual(zooms[i] + 1e-9);
            expect(zoom).toBeGreaterThanOrEqual(opened.zoom - 1e-9);
        });
        expectNear(zooms.at(-1)!, opened.zoom, 0.005);
        await expect(page.getByTitle("Reset Zoom and Center")).toHaveText(
            "100%",
        );

        // A scroll or a press mid-glide stops it where it is
        for (let i = 0; i < 4; i++) await page.getByTitle("Zoom In").click();
        await settledView(page);
        for (const by of ["wheel", "press"] as const) {
            const stopped = await zoomsAfterClick(page, 800, { after: 3, by });
            const after = stopped.slice(4);
            expect(after.every((zoom) => zoom === after[0])).toBe(true);
            expect(after[0]).toBeGreaterThan(opened.zoom + 0.01);
            await page.getByTitle("Zoom In").click();
            await settledView(page);
        }
    });

    test("switching Preview glides to its own fit, which Reset returns to", async ({
        show,
    }) => {
        const { page } = show;
        const field = await fieldSize(show);
        const opened = await openedView(show);
        const reset = page.getByTitle("Reset Zoom and Center");
        const previewView = () => previewFitView(page, field);
        const landsOn = (expected: () => Promise<View>) =>
            landsOnView(page, expected);

        // Entering Preview glides there, and its fit is 100%
        const entering = await zoomsAfterClick(
            page,
            1500,
            undefined,
            '[data-testid="workspace-view-preview"]',
        );
        glided(entering, opened.zoom);
        await landsOn(previewView);
        await expect(reset).toHaveText("100%");

        // Reset in Preview comes back to Preview's fit
        await page.getByTitle("Zoom In").click();
        await expect(reset).toHaveText("120%");
        await reset.click();
        await landsOn(previewView);
        await expect(reset).toHaveText("100%");

        // Leaving Preview glides back to the editor's fit
        const inPreview = (await settledView(page)).zoom;
        const leaving = await zoomsAfterClick(
            page,
            1500,
            undefined,
            '[data-testid="workspace-view-editor"]',
        );
        glided(leaving, inPreview);
        await landsOn(() => openingView(show));
        await expect(reset).toHaveText("100%");
    });
});

test.describe("in Performance mode", () => {
    test.use({ uiSettings: { fieldPerformanceMode: true } });

    test("Reset jumps to the fit", async ({ show }) => {
        const { page } = show;
        expect(await fieldQualityMode(page)).toBe("low");
        const opened = await openedView(show);
        for (let i = 0; i < 4; i++) await page.getByTitle("Zoom In").click();
        await settledView(page);

        const zooms = await zoomsAfterClick(page, 300);
        zooms.forEach((zoom) => expectNear(zoom, opened.zoom, 0.005));
    });
});

test("in a narrow window, Reset fits the field's width", async ({
    show,
    target,
}) => {
    test.skip(target !== "browser", "Resizes the page's viewport");
    const { page } = show;
    await openedView(show);
    // The sidebar and the inspector leave a pane narrower than the field is wide
    await page.setViewportSize({ width: 1100, height: 1000 });
    const field = await fieldSize(show);
    await expect
        .poll(async () => {
            const box = await fieldBox(page);
            return box.width / box.height < field.width / field.height;
        })
        .toBe(true);

    await page.getByTitle("Reset Zoom and Center").click();
    const expected = await openingView(show);
    await waitForView(page, (v) => v.zoom, expected.zoom, 0.005);
    await waitForView(page, (v) => v.pan.x, expected.pan.x, 1.5);
    const box = await fieldBox(page);
    const fitted = await view(page);
    expect(fitted.pan.x).toBeGreaterThan(0);
    expect(fitted.pan.x + field.width * fitted.zoom).toBeLessThan(box.width);
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

test("Preview fits the whole field, and leaving it centers the field again", async ({
    show,
}) => {
    const { page } = show;
    const field = await fieldSize(show);
    const before = await openedView(show);

    await page.getByTestId("workspace-view-preview").click();
    await expect
        .poll(async () => (await view(page)).zoom)
        .not.toBe(before.zoom);
    // Centered across at 87% of the room, a tenth of the spare height down.
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

    await page.getByTestId("workspace-view-editor").click();
    await openedView(show);
});

// Fingers go through the field's gesture adapter (tablet plan 1.1). The
// baseline (#845) panned half as far as the finger, zoomed twice as far as
// the fingers spread, and ignored two fingers panning together.
test.describe("touch", () => {
    test("one finger pans one to one: the field stays under it", async ({
        show,
    }) => {
        const { page } = show;
        const before = await openedView(show);
        const { x, y } = await center(page);
        const from = await inField(page, x, y);
        await touchDrag(page, from, { x: from.x + 100, y: from.y + 60 });
        await waitForView(page, (v) => v.pan.x, before.pan.x + 100, 0.01);
        await waitForView(page, (v) => v.pan.y, before.pan.y + 60, 0.01);
        expect((await view(page)).zoom).toBeCloseTo(before.zoom, 6);
    });

    test("two fingers pinch by as much as they spread, at the point between them", async ({
        show,
    }) => {
        const { page } = show;
        const before = await openedView(show);
        const mid = await center(page);
        const under = fieldPointAt(before, mid.x, mid.y);
        await pinch(page, await inField(page, mid.x, mid.y), {
            from: 50,
            to: 100,
        });
        // Twice as far apart: twice the zoom
        await waitForView(page, (v) => v.zoom, before.zoom * 2, 1e-6);
        const drawn = drawnAt(await view(page), under);
        expectNear(drawn.x, mid.x, 0.5);
        expectNear(drawn.y, mid.y, 0.5);
    });

    test("two fingers moving together pan, without zooming", async ({
        show,
    }) => {
        const { page } = show;
        const before = await openedView(show);
        const mid = await center(page);
        await twoFingerPan(page, await inField(page, mid.x, mid.y), {
            x: 80,
            y: -40,
        });
        await waitForView(page, (v) => v.pan.x, before.pan.x + 80, 0.01);
        await waitForView(page, (v) => v.pan.y, before.pan.y - 40, 0.01);
        expect((await view(page)).zoom).toBeCloseTo(before.zoom, 6);
    });
});

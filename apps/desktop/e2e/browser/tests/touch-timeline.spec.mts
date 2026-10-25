import type { CDPSession, Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import { createTempoGroup } from "../app.mjs";

/**
 * Touch gestures on the timeline, sent as real touch input through the
 * Chrome DevTools Protocol (Chromium only, so browser target only).
 */
test.skip(
    ({ target }) => target !== "browser",
    "Touch input goes through Chromium's DevTools protocol",
);

type Point = { x: number; y: number };

const touch = (cdp: CDPSession) => {
    const send = (
        type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel",
        points: Point[],
    ) =>
        cdp.send("Input.dispatchTouchEvent", {
            type,
            touchPoints: points.map((p, id) => ({
                x: Math.round(p.x),
                y: Math.round(p.y),
                id,
                // A real iPad reports a fingertip about 48 px wide
                radiusX: 24,
                radiusY: 24,
            })),
        });
    return {
        /** Presses and holds; returns the lift (`cancel` lifts without a tap) */
        hold: async (p: Point) => {
            await send("touchStart", [p]);
            return {
                cancel: () => send("touchCancel", []),
                lift: () => send("touchEnd", []),
            };
        },
        /** Two fingers down and up together */
        twoFingerTap: async (a: Point, b: Point) => {
            await send("touchStart", [a]);
            await send("touchStart", [a, b]);
            await send("touchEnd", []);
        },
        tap: async (p: Point) => {
            await send("touchStart", [p]);
            await send("touchEnd", []);
        },
        /** Moves fingers from `from` to `to` in small steps. */
        drag: async (from: Point[], to: Point[], steps = 12) => {
            // Fingers land one after another, as real ones do
            for (let n = 1; n <= from.length; n++)
                await send("touchStart", from.slice(0, n));
            for (let i = 1; i <= steps; i++) {
                await send(
                    "touchMove",
                    from.map((f, n) => ({
                        x: f.x + ((to[n].x - f.x) * i) / steps,
                        y: f.y + ((to[n].y - f.y) * i) / steps,
                    })),
                );
            }
            await send("touchEnd", []);
        },
    };
};

const addPage = (page: Page) =>
    page.locator("#pages").getByRole("button").click();

/** Start beat position of every page, in order. */
const pageStarts = async (show: Show) =>
    (
        await show.query<{ start: number }>(
            `SELECT beats.position AS start
             FROM pages INNER JOIN beats ON beats.id = pages.start_beat
             ORDER BY beats.position`,
        )
    ).map((row) => row.start);

/**
 * New page is the round + right after the last page box, as with a mouse,
 * finger-sized (44 px), and it scrolls with the pages.
 */
async function expectPlusAfterLastPage(page: Page) {
    const add = page.getByRole("button", { name: "New page", exact: true });
    const timeline = page.locator("#timeline");
    await timeline.evaluate((el) => {
        el.style.scrollBehavior = "auto";
        el.scrollLeft = el.scrollWidth;
    });
    const b = (await add.boundingBox())!;
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
    const boxes = await page.locator("[timeline-page-id]").all();
    const last = (await boxes[boxes.length - 1].boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(last.x + last.width - 1);
    expect(b.x).toBeLessThanOrEqual(last.x + last.width + 24);
    // It scrolls with the pages
    const before = b.x;
    await timeline.evaluate((el) => {
        el.scrollLeft = el.scrollLeft - 60;
    });
    const after = (await add.boundingBox())!.x;
    if (after !== before) expect(after).toBeGreaterThan(before);
}

/** Taps the centre of a button found by its accessible name. */
async function tapNamed(
    page: Page,
    fingers: ReturnType<typeof touch>,
    name: string | RegExp,
) {
    const b = (await page
        .getByRole("button", { name, exact: typeof name === "string" })
        .boundingBox())!;
    await fingers.tap({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
}

/**
 * A show with pages 0-2 in the touch layout. The timeline starts compact
 * (one row); `expanded` taps the chevron for the full timeline.
 */
async function setUp(show: Show, { expanded = false } = {}) {
    const { page } = show;
    await createTempoGroup(page, {
        tempo: 120,
        beatsPerMeasure: 4,
        measures: 16,
    });
    await addPage(page);
    await expect(page.getByRole("heading", { name: "Page 1" })).toBeVisible();
    await addPage(page);
    await expect(page.getByRole("heading", { name: "Page 2" })).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", {
        enabled: true,
        maxTouchPoints: 5,
    });
    const fingers = touch(cdp);
    // Pin the touch layout, as Settings > Input does (the app follows a
    // preference written by another window)
    await page.evaluate(() => {
        const key = "openmarch:inputMode";
        localStorage.setItem(key, "touch");
        window.dispatchEvent(
            new StorageEvent("storage", { key, newValue: "touch" }),
        );
    });
    await expect(page.locator("html")).toHaveAttribute("data-input", "touch");
    const layout = page.locator("[data-timeline-layout]");
    await expect(layout).toHaveAttribute("data-timeline-layout", "compact");
    if (expanded) {
        await tapNamed(page, fingers, "Show the full timeline");
        await expect(layout).toHaveAttribute("data-timeline-layout", "full");
    }
    return fingers;
}

test("a finger drags a page edge to change its counts", async ({ show }) => {
    const { page } = show;
    const fingers = await setUp(show);
    const before = await pageStarts(show);
    expect(before).toHaveLength(3);

    const handle = page
        .locator('[timeline-page-id] [data-testid="page-resize-handle"]')
        .first();
    const box = await handle.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    const from = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
    // 120 bpm at the default 40 px/s is 20 px per count: about 3 counts
    await fingers.drag([from], [{ x: from.x + 60, y: from.y }]);

    await expect.poll(() => pageStarts(show)).not.toEqual(before);
    const after = await pageStarts(show);
    // Page 1 got longer, so page 2 starts later
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(after[2]).toBeGreaterThan(before[2]);
});

test("a pinch zooms the timeline in", async ({ show }) => {
    const { page } = show;
    const fingers = await setUp(show, { expanded: true });
    const zoomReset = page.getByTitle("Reset timeline zoom");
    await expect(zoomReset).toHaveText("100%");

    const timeline = await page.locator("#timeline").boundingBox();
    const y = timeline!.y + timeline!.height / 2;
    const cx = timeline!.x + timeline!.width / 2;
    await fingers.drag(
        [
            { x: cx - 40, y },
            { x: cx + 40, y },
        ],
        [
            { x: cx - 80, y },
            { x: cx + 80, y },
        ],
    );

    await expect(zoomReset).not.toHaveText("100%");
    const percent = parseInt((await zoomReset.textContent()) ?? "0");
    expect(percent).toBeGreaterThan(150);
});

/** The x of the boundary between page 1 and page 2, and the row's y. */
async function page1Edge(page: Page) {
    const box = await page.locator('[timeline-page-id="1"]').boundingBox();
    return { x: box!.x + box!.width, y: box!.y + box!.height / 2 };
}

test("a drag that starts just right of a page edge still resizes", async ({
    show,
}) => {
    const fingers = await setUp(show);
    const before = await pageStarts(show);
    const edge = await page1Edge(show.page);
    // 14 px into page 2, where a thumb aimed at the edge often lands
    const from = { x: edge.x + 14, y: edge.y };
    await fingers.drag([from], [{ x: from.x + 60, y: from.y }]);
    await expect.poll(() => pageStarts(show)).not.toEqual(before);
    expect((await pageStarts(show))[2]).toBeGreaterThan(before[2]);
});

test("a second finger cancels an edge drag and the pages stay", async ({
    show,
}) => {
    const { page } = show;
    const fingers = await setUp(show);
    const before = await pageStarts(show);
    const widthBefore = (await page
        .locator('[timeline-page-id="1"]')
        .boundingBox())!.width;
    const edge = await page1Edge(page);
    // One finger on the grip, a second beside it, both sliding left
    await fingers.drag(
        [edge, { x: edge.x + 120, y: edge.y }],
        [
            { x: edge.x - 200, y: edge.y },
            { x: edge.x - 80, y: edge.y },
        ],
    );
    await page.waitForTimeout(500);
    expect(await pageStarts(show)).toEqual(before);
    const widthAfter = (await page
        .locator('[timeline-page-id="1"]')
        .boundingBox())!.width;
    expect(Math.abs(widthAfter - widthBefore)).toBeLessThan(1);
});

test("tapping the body of the selected page doesn't open its menu", async ({
    show,
}) => {
    const { page } = show;
    const fingers = await setUp(show);
    // Page 2 is selected after setUp; tap its left part
    const box = (await page.locator('[timeline-page-id="2"]').boundingBox())!;
    await fingers.tap({ x: box.x + 30, y: box.y + box.height / 2 });
    await page.waitForTimeout(300);
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Page 2" })).toBeVisible();
    // The "…" button sits at the right end and opens the menu
    const menu = (await page
        .getByRole("button", { name: "Page 2 options" })
        .boundingBox())!;
    expect(menu.x).toBeGreaterThan(box.x + box.width / 2);
    await fingers.tap({
        x: menu.x + menu.width / 2,
        y: menu.y + menu.height / 2,
    });
    await expect(page.getByRole("menu")).toBeVisible();
});

test("the page-deleted toast undoes the delete", async ({ show }) => {
    const { page } = show;
    const fingers = await setUp(show);
    const before = await pageStarts(show);
    const center = async (name: string | RegExp) => {
        const b = (await page.getByRole("button", { name }).boundingBox())!;
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    await fingers.tap(await center("Page 2 options"));
    await fingers.tap(await center(/^In Place/));
    await expect.poll(() => pageStarts(show)).toHaveLength(before.length - 1);
    // Let the toast finish sliding in before aiming at it
    await page.waitForTimeout(600);
    const undo = (await page
        .locator("[data-sonner-toast]")
        .getByRole("button", { name: "Undo" })
        .boundingBox())!;
    // A slow tap (held longer than the toast's old dismiss-on-press delay,
    // shorter than a long press) still reaches Undo
    const press = await fingers.hold({
        x: undo.x + undo.width / 2,
        y: undo.y + undo.height / 2,
    });
    await page.waitForTimeout(350);
    await press.lift();
    await expect.poll(() => pageStarts(show)).toEqual(before);
});

test("the delete toast's Undo leaves a later edit alone", async ({ show }) => {
    const { page } = show;
    const fingers = await setUp(show);
    const before = await pageStarts(show);
    await tapNamed(page, fingers, "Page 2 options");
    await tapNamed(page, fingers, /^In Place/);
    await expect.poll(() => pageStarts(show)).toHaveLength(before.length - 1);
    // Another edit after the delete: make page 1 a subset
    const subset = async () =>
        (
            await show.query<{ is_subset: number }>(
                "SELECT is_subset FROM pages WHERE id = 1",
            )
        )[0]?.is_subset;
    await expect(page.getByRole("heading", { name: "Page 1" })).toBeVisible();
    await tapNamed(page, fingers, "Page 1 options");
    const toggle = page.locator('[role="menu"]').getByRole("switch");
    const t = (await toggle.boundingBox())!;
    await fingers.tap({ x: t.x + t.width / 2, y: t.y + t.height / 2 });
    await expect.poll(subset).toBe(1);
    await page.keyboard.press("Escape");
    // Undo on the delete toast must not undo the subset change
    const undo = (await page
        .locator("[data-sonner-toast]")
        .filter({ hasText: "deleted" })
        .getByRole("button", { name: "Undo" })
        .boundingBox())!;
    await fingers.tap({
        x: undo.x + undo.width / 2,
        y: undo.y + undo.height / 2,
    });
    await expect(
        page.locator("[data-sonner-toast]").filter({ hasText: "Can't undo" }),
    ).toBeVisible();
    expect(await subset()).toBe(1);
    expect(await pageStarts(show)).toHaveLength(before.length - 1);
});

test("the timeline + and − buttons zoom with a finger", async ({ show }) => {
    const { page } = show;
    const fingers = await setUp(show, { expanded: true });
    const zoomReset = page.getByTitle("Reset timeline zoom");
    const pageWidth = async () =>
        (await page.locator('[timeline-page-id="1"]').boundingBox())!.width;
    const tapButton = async (name: string) => {
        const b = (await page.getByRole("button", { name }).boundingBox())!;
        await fingers.tap({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
    };
    await expect(zoomReset).toHaveText("100%");
    const before = await pageWidth();
    // Toasts from setting up sit in the bottom-right corner, over the
    // column's lower button, until they time out
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, {
        timeout: 15_000,
    });

    await tapButton("Zoom timeline in");
    await expect(zoomReset).toHaveText("125%");
    await expect.poll(pageWidth).toBeGreaterThan(before * 1.1);

    // In and out are the same step, so one undoes the other
    await tapButton("Zoom timeline out");
    await expect(zoomReset).toHaveText("100%");
    await tapButton("Zoom timeline out");
    await expect(zoomReset).toHaveText("80%");
    await expect.poll(pageWidth).toBeLessThan(before);
});

test("a two-finger pan that lands on the page's … button doesn't open its menu", async ({
    show,
}) => {
    const { page } = show;
    const fingers = await setUp(show);
    const menu = (await page
        .getByRole("button", { name: "Page 2 options" })
        .boundingBox())!;
    const onButton = {
        x: menu.x + menu.width / 2,
        y: menu.y + menu.height / 2,
    };
    await fingers.drag(
        [onButton, { x: onButton.x - 60, y: onButton.y }],
        [
            { x: onButton.x - 160, y: onButton.y },
            { x: onButton.x - 220, y: onButton.y },
        ],
    );
    await page.waitForTimeout(400);
    await expect(page.getByRole("menu")).toHaveCount(0);
});

test("the + after the last page adds a page and says so", async ({ show }) => {
    const { page } = show;
    const fingers = await setUp(show);
    const before = await pageStarts(show);
    const add = page.getByRole("button", { name: "New page", exact: true });
    await expectPlusAfterLastPage(page);
    const box = (await add.boundingBox())!;
    await fingers.tap({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await expect.poll(() => pageStarts(show)).toHaveLength(before.length + 1);
    await expect(
        page.locator("[data-sonner-toast]").filter({ hasText: "Page 3 added" }),
    ).toBeVisible();
});

test("a long press inside the page menu doesn't open a second menu", async ({
    show,
}) => {
    const { page } = show;
    const fingers = await setUp(show);
    const center = async (name: string | RegExp) => {
        const b = (await page.getByRole("button", { name }).boundingBox())!;
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    await fingers.tap(await center("Page 2 options"));
    await expect(page.getByRole("menu")).toHaveCount(1);
    // Hold on "In Place" past the long-press time, then lift without a tap
    const press = await fingers.hold(await center(/^In Place/));
    await page.waitForTimeout(1000);
    // CSS, not getByRole: a second (modal) menu hides the first from the
    // accessibility tree, so a role count would still read 1
    await expect(page.locator('[role="menu"]')).toHaveCount(1);
    await press.cancel();
    expect(await pageStarts(show)).toHaveLength(3);
});

test("the zoom buttons zoom around the middle of the view", async ({
    show,
}) => {
    const { page } = show;
    const fingers = await setUp(show, { expanded: true });
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, {
        timeout: 15_000,
    });
    const tapButton = async (name: string) => {
        const b = (await page.getByRole("button", { name }).boundingBox())!;
        await fingers.tap({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
    };
    const zoomReset = page.getByTitle("Reset timeline zoom");
    for (const label of ["125%", "156%", "195%"]) {
        await tapButton("Zoom timeline in");
        await expect(zoomReset).toHaveText(label);
    }
    // Scroll to the middle, then zoom out: the middle stays the middle
    const timeline = page.locator("#timeline");
    await timeline.evaluate((el) => {
        el.style.scrollBehavior = "auto";
        el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    });
    const view = (await timeline.boundingBox())!;
    const middle = view.x + view.width / 2;
    const page2 = page.locator('[timeline-page-id="2"]');
    const before = (await page2.boundingBox())!.x;
    await tapButton("Zoom timeline out");
    await expect(zoomReset).toHaveText("156%");
    await expect
        .poll(async () => (await page2.boundingBox())!.x)
        .toBeCloseTo(middle + (before - middle) / 1.25, -1);
});

test("the compact timeline is one row with the transport and pages", async ({
    show,
}) => {
    const { page } = show;
    const fingers = await setUp(show);
    const panel = page.locator("[data-timeline-layout]");
    // One slim row: no waveform row and no transport card
    expect((await panel.boundingBox())!.height).toBeLessThanOrEqual(72);
    await expect(page.locator("#waveform")).toHaveCount(0);
    await expect(page.getByLabel("Playback Controls")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /^First page/ })).toHaveCount(
        0,
    );
    // Previous page, play and next page are in the row
    await expect(page.getByRole("heading", { name: "Page 2" })).toBeVisible();
    await tapNamed(page, fingers, /^Previous page/);
    await expect(page.getByRole("heading", { name: "Page 1" })).toBeVisible();
    // The waveform toggle shows the audio row, and hides it again
    await tapNamed(page, fingers, "Show the music waveform");
    await expect(page.locator("#waveform")).toHaveCount(1);
    await tapNamed(page, fingers, "Hide the music waveform");
    await expect(page.locator("#waveform")).toHaveCount(0);
    // The rest of the transport and the zoom are in the "…" menu
    await tapNamed(page, fingers, "More timeline controls");
    const menu = page.locator('[role="menu"]');
    await expect(menu).toContainText("Metronome");
    await expect(menu).toContainText("Fullscreen");
    await expect(menu).toContainText("Edit timeline");
    await expect(menu.getByTitle("Reset timeline zoom")).toHaveText("100%");
    await tapNamed(page, fingers, "Zoom timeline in");
    await expect(menu.getByTitle("Reset timeline zoom")).toHaveText("125%");
});

test("expanding shows the full transport, and collapsing goes back", async ({
    show,
}) => {
    const { page } = show;
    const fingers = await setUp(show, { expanded: true });
    const controls = page.getByLabel("Playback Controls");
    for (const name of [
        /^First page/,
        /^Previous page/,
        /^Play/,
        /^Next page/,
        /^Last page/,
    ])
        await expect(controls.getByRole("button", { name })).toBeVisible();
    await expect(
        page.getByRole("button", { name: "Make the timeline compact" }),
    ).toBeVisible();
    await expect(page.locator("#waveform")).toHaveCount(1);
    await expect(page.getByTitle("Reset timeline zoom")).toBeVisible();
    // New page: the + after the last page in the full timeline too
    await expectPlusAfterLastPage(page);
    // Remembered for next time
    expect(
        await page.evaluate(() =>
            localStorage.getItem("openmarch:timelineExpanded"),
        ),
    ).toBe("true");
    await tapNamed(page, fingers, "Make the timeline compact");
    await expect(page.locator("[data-timeline-layout]")).toHaveAttribute(
        "data-timeline-layout",
        "compact",
    );
});

test("the sticky Pages label is opaque, so pages scroll under it unseen", async ({
    show,
}) => {
    const { page } = show;
    await setUp(show, { expanded: true });
    const label = page.locator("[data-timeline-label]").first();
    const style = await label.evaluate((el) => {
        const s = getComputedStyle(el);
        return { color: s.backgroundColor, image: s.backgroundImage };
    });
    // A solid color under the panel's gradient
    expect(style.color).toMatch(/^rgb\(/);
    expect(style.image).toContain("gradient");
    // Scrolled, the label is what's on top at its spot
    await page.locator("#timeline").evaluate((el) => {
        el.style.scrollBehavior = "auto";
        el.scrollLeft = 200;
    });
    const b = (await label.boundingBox())!;
    const onTop = await page.evaluate(
        ([x, y]) =>
            document
                .elementFromPoint(x, y)
                ?.closest("[data-timeline-label]") !== null,
        [b.x + 4, b.y + b.height / 2],
    );
    expect(onTop).toBe(true);
});

test("fast undo presses are all kept", async ({ show }) => {
    const { page } = show;
    await setUp(show);
    expect(await pageStarts(show)).toHaveLength(3);
    // Two quick presses undo both added pages
    await page.keyboard.press("Control+z");
    await page.keyboard.press("Control+z");
    await expect.poll(() => pageStarts(show)).toHaveLength(1);
});

test("a two-finger tap undoes once and says so", async ({ show }) => {
    const { page } = show;
    const fingers = await setUp(show);
    const field = (await page.locator("canvas").first().boundingBox())!;
    const at = { x: field.x + field.width / 2, y: field.y + field.height / 2 };
    await fingers.twoFingerTap(at, { x: at.x + 60, y: at.y });
    await expect.poll(() => pageStarts(show)).toHaveLength(2);
    await expect(
        page.locator("[data-sonner-toast]").filter({ hasText: "Undone" }),
    ).toBeVisible();
    // Only once
    await page.waitForTimeout(500);
    expect(await pageStarts(show)).toHaveLength(2);
});

test("after undo and redo of the delete, the toast's Undo still undoes it", async ({
    show,
}) => {
    const { page } = show;
    const fingers = await setUp(show);
    const before = await pageStarts(show);
    await tapNamed(page, fingers, "Page 2 options");
    await tapNamed(page, fingers, /^In Place/);
    await expect.poll(() => pageStarts(show)).toHaveLength(before.length - 1);
    await page.keyboard.press("Control+z");
    await expect.poll(() => pageStarts(show)).toEqual(before);
    await page.keyboard.press("Control+Shift+z");
    await expect.poll(() => pageStarts(show)).toHaveLength(before.length - 1);
    const undo = (await page
        .locator("[data-sonner-toast]")
        .filter({ hasText: "deleted" })
        .getByRole("button", { name: "Undo" })
        .boundingBox())!;
    await fingers.tap({
        x: undo.x + undo.width / 2,
        y: undo.y + undo.height / 2,
    });
    await expect.poll(() => pageStarts(show)).toEqual(before);
});

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
        type: "touchStart" | "touchMove" | "touchEnd",
        points: Point[],
    ) =>
        cdp.send("Input.dispatchTouchEvent", {
            type,
            touchPoints: points.map((p, id) => ({
                x: Math.round(p.x),
                y: Math.round(p.y),
                id,
            })),
        });
    return {
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

async function setUp(show: Show) {
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
    const fingers = await setUp(show);
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
    await fingers.tap({
        x: undo.x + undo.width / 2,
        y: undo.y + undo.height / 2,
    });
    await page.waitForTimeout(300);
    await expect.poll(() => pageStarts(show)).toEqual(before);
});

test("the timeline + and − buttons zoom with a finger", async ({ show }) => {
    const { page } = show;
    const fingers = await setUp(show);
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
    await expect(zoomReset).toHaveText("120%");
    await expect.poll(pageWidth).toBeGreaterThan(before * 1.1);

    await tapButton("Zoom timeline out");
    await tapButton("Zoom timeline out");
    await expect(zoomReset).toHaveText("77%");
    await expect.poll(pageWidth).toBeLessThan(before);
});

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
            await send("touchStart", from);
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
    // A first tap switches the app to its touch layout
    const label = await page
        .locator("#timeline")
        .getByText("Pages", { exact: true })
        .boundingBox();
    await fingers.tap({ x: label!.x + 5, y: label!.y + 5 });
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

import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures.mjs";
import { pinch, tap } from "../app.mjs";

// Timeline zoom on a tablet (tablet plan 3.2, fork #885): a pinch follows the
// fingers 1:1 (the zoom scales with their spread, and the beat under their
// midpoint stays under it) and stops at the zoom limits without overshoot;
// the touch layout's ± buttons, in the touch transport's row (3.5), step the
// zoom as the timelineZoomIn and timelineZoomOut actions.

const desktop = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
);

test.use({
    showFile: path.join(desktop, "view3d-web/public/demos/part1-demo.dots"),
    appSettings: { optOutAnalytics: true, editorMode: "expert" },
    // The time-stretch worklet (#216) can't load in the harness (see props.spec.mts)
    allowedPageErrors: [/Audio worklet error/],
    // A touch screen, in the touch layout
    touchScreen: true,
    initScript: "localStorage.setItem('openmarch:inputMode', 'touch');",
});

type Point = { x: number; y: number };

const viewport = (page: Page) => page.getByTestId("timeline-viewport");
const surface = (page: Page) => page.getByTestId("timeline-pointer-surface");

/**
 * The zoom (the surface is the show's beats wide, so its width scales with the
 * pixels per beat) and where beat 0 is on screen.
 */
async function zoomState(page: Page) {
    const box = (await surface(page).boundingBox())!;
    return { width: box.width, beat0: box.x };
}

/** Makes the timeline pane taller with the splitter, so it has a track body */
async function tallerTimeline(page: Page) {
    const splitter = page.getByTestId("timeline-splitter");
    await splitter.focus();
    for (let i = 0; i < 6; i++) await splitter.press("Shift+ArrowUp");
    await splitter.blur();
    await expect
        .poll(async () => {
            const { top, bottom } = await trackBody(page);
            return bottom - top;
        }, "the track body is on screen")
        .toBeGreaterThan(80);
}

/** The space under the pinned ruler and page row, and above the scrollbar */
async function trackBody(page: Page) {
    const view = (await viewport(page).boundingBox())!;
    const header = (await page
        .getByTestId("timeline-pinned-header")
        .boundingBox())!;
    return { top: header.y + header.height, bottom: view.y + view.height - 18 };
}

/** Bare track space a third of the way across, near the body's bottom (clips stack from the top) */
async function bareTrack(page: Page): Promise<Point> {
    const view = (await viewport(page).boundingBox())!;
    const { bottom } = await trackBody(page);
    return { x: view.x + view.width / 3, y: bottom - 12 };
}

/** Fits the show in view, the zoom's lower limit, with the touch transport's Fit in its "…" (3.5) */
async function fit(page: Page) {
    await page.getByTestId("timeline-touch-more").click();
    const button = page.getByTestId("timeline-touch-fit");
    await expect(button).toBeVisible();
    if ((await button.getAttribute("aria-pressed")) !== "true")
        await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(button).toBeHidden();
}

/** Waits for the zoom to stop changing, and returns it */
async function settled(page: Page) {
    let last = await zoomState(page);
    await expect
        .poll(async () => {
            const now = await zoomState(page);
            const same =
                Math.abs(now.width - last.width) < 0.5 &&
                Math.abs(now.beat0 - last.beat0) < 0.5;
            last = now;
            return same;
        })
        .toBe(true);
    return last;
}

for (const spread of [2, 2.6]) {
    test(`a pinch spreading the fingers ×${spread} zooms ×${spread} about their midpoint`, async ({
        show,
    }) => {
        const { page } = show;
        await tallerTimeline(page);
        const before = await settled(page);
        const at = await bareTrack(page);
        await pinch(page, at, { from: 50, to: 50 * spread, steps: 16 });
        const after = await settled(page);
        // The zoom follows the spread, with no overshoot
        expect(after.width / before.width).toBeGreaterThan(spread * 0.97);
        expect(after.width / before.width).toBeLessThan(spread * 1.03);
        // The beat under the midpoint stayed under it: beat 0 moved away from
        // the midpoint by the same factor
        expect(at.x - after.beat0).toBeCloseTo(
            ((at.x - before.beat0) * after.width) / before.width,
            -1,
        );
    });
}

test("a pinch stops at the zoom's limit: the fitted show can't zoom out further", async ({
    show,
}) => {
    const { page } = show;
    await tallerTimeline(page);
    await fit(page);
    const fitted = await settled(page);
    // Fingers closing, ×1/3
    await pinch(page, await bareTrack(page), { from: 150, to: 50 });
    const after = await settled(page);
    expect(after.width).toBeCloseTo(fitted.width, 0);
    expect(after.beat0).toBeCloseTo(fitted.beat0, 0);
});

test("the touch layout's ± buttons step the zoom, and are finger sized", async ({
    show,
}) => {
    const { page } = show;
    await tallerTimeline(page);
    const zoomIn = page.getByTestId("timeline-touch-zoom-in");
    const zoomOut = page.getByTestId("timeline-touch-zoom-out");
    await expect(zoomIn).toBeVisible();
    for (const button of [zoomIn, zoomOut]) {
        const box = (await button.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
    }
    const center = async (button: typeof zoomIn) => {
        const box = (await button.boundingBox())!;
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    // From the opening zoom: + doubles it, and − halves it back
    const start = await settled(page);
    await tap(page, await center(zoomIn));
    await expect
        .poll(async () => (await zoomState(page)).width / start.width)
        .toBeCloseTo(2, 1);
    await tap(page, await center(zoomOut));
    await expect
        .poll(async () => (await zoomState(page)).width)
        .toBeCloseTo(start.width, 0);
    // Fitted, the show can't zoom out further, and + zooms in from there
    await fit(page);
    const fitted = await settled(page);
    await expect(zoomOut).toBeDisabled();
    await tap(page, await center(zoomIn));
    await expect
        .poll(async () => (await zoomState(page)).width)
        .toBeGreaterThan(fitted.width * 1.5);
    await expect(zoomOut).toBeEnabled();
});

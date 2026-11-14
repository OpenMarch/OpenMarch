import type { Locator, Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    expectCanvasMatchesShow,
    readField,
    tap,
    touchDrag,
    waitForIdle,
} from "../app.mjs";
import { savedPositions } from "../positions.mjs";
import { isolate } from "../timeline.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";
import type { FieldTestShapeOverlay } from "../../../src/field/fieldTestApi";

// The field's floating layers on a tablet (#927): the cards and bars that hold the current task's
// buttons stay reachable. The modifier pill and the zoom box keep clear of them; the shape editor
// bar keeps clear of the zoom box and the Inspector's edge tab; and with the toolbar panel open,
// the bars at the field's top sit below it and the pill doesn't show through it. For each layout
// (landscape at 1180 × 820 and 1024 × 768, portrait at 820 × 1180), with the panel open and
// closed, a finger reaches:
// - the line tool's Finish, after tapping point after point,
// - the shape editor's Place, after dragging the line's handle toward the zoom box,
// - the isolation bar's Done.
// Each button's middle must be the topmost element there, and a tap on it must work.

// Trumpets spread over the field, with a row along its bottom, where the pill's bottom spots are:
// in landscape the pill was pushed to the top of the field, over the task's cards (finding B)
const HOME: SeedPosition[] = [
    [1, 500, 300],
    [2, 700, 280],
    [3, 800, 400],
    [4, 520, 450],
    [5, 640, 470],
    ...Array.from(
        { length: 14 },
        (_, i): SeedPosition => [6 + i, 120 + i * 100, 760],
    ),
];
const PAGE_1: SeedPosition[] = HOME.map(([id, x, y]) => [id, x + 24, y]);
const PAGE_2: SeedPosition[] = HOME.map(([id, x, y]) => [id, x + 48, y]);
/** Page 2's move: its box starts at beat index 8 */
const PAGE_2_BOX = 8;

test.use({
    seedSql: seedShowSql({
        beats: 32,
        pageStarts: [1, 9],
        measureStarts: [1, 5, 9, 13, 17, 21, 25, 29],
        marchers: HOME.map(([id]) => ({
            id,
            section: "Trumpet",
            prefix: "T",
            order: id,
        })),
        positions: [HOME, PAGE_1, PAGE_2],
    }),
    appSettings: { optOutAnalytics: true, editorMode: "expert" },
    // A touch screen, in the touch layout
    touchScreen: true,
    initScript: "localStorage.setItem('openmarch:inputMode', 'touch');",
    // The time-stretch worklet (#216) can't load in the harness (see props.spec.mts)
    allowedPageErrors: [/Audio worklet error/],
});

type Point = { x: number; y: number };
type Box = { x: number; y: number; width: number; height: number };

const LAYOUTS = [
    { name: "landscape 1180 × 820", width: 1180, height: 820 },
    { name: "landscape 1024 × 768", width: 1024, height: 768 },
    { name: "portrait 820 × 1180", width: 820, height: 1180 },
] as const;

/** A point on the field at fractions of its width and height, in the viewport. */
async function onField(page: Page, fx: number, fy: number): Promise<Point> {
    const box = (await page.getByTestId("fieldCanvas").first().boundingBox())!;
    return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

const centerOf = async (locator: Locator): Promise<Point> => {
    const box = (await locator.boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** What's topmost at the middle of `locator`: its own test id, or the nearest one around it */
const topmostAt = (locator: Locator) =>
    locator.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(
            box.left + box.width / 2,
            box.top + box.height / 2,
        );
        if (hit && element.contains(hit)) return "itself";
        return (
            hit?.closest("[data-testid]")?.getAttribute("data-testid") ??
            hit?.tagName ??
            "nothing"
        );
    });

/** Checks a finger at `locator`'s middle lands on it, then taps it there */
async function reachAndTap(page: Page, locator: Locator) {
    await expect(locator).toBeVisible();
    // The pill and the zoom box find their spots once the layers settle
    await expect.poll(() => topmostAt(locator)).toBe("itself");
    await tap(page, await centerOf(locator));
}

const intersects = (a: Box, b: Box) =>
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height;

/** The pill keeps off `layer` */
async function pillClearOf(page: Page, layer: Locator) {
    const pill = page.getByTestId("touch-modifier-buttons");
    await expect
        .poll(async () => {
            const a = await pill.boundingBox();
            const b = await layer.boundingBox();
            return !a || !b || !intersects(a, b);
        })
        .toBe(true);
}

/** Taps far enough apart in time that no two are a double-tap. */
async function tapPoints(page: Page, points: readonly Point[]) {
    for (const p of points) {
        await tap(page, p);
        await page.waitForTimeout(450);
    }
}

/** What the shape tool draws once its spots have glided to where they're going */
async function shapeOverlay(page: Page): Promise<FieldTestShapeOverlay | null> {
    await page.waitForFunction(
        () => window.fieldTest!.shapeOverlay?.()?.gliding !== true,
    );
    return page.evaluate(() => window.fieldTest!.shapeOverlay?.() ?? null);
}

async function openPanel(page: Page) {
    const shapes = page
        .getByTestId("titlebar-toolbar-tabs")
        .getByRole("tab", { name: "Shapes" });
    await tap(page, await centerOf(shapes));
    await expect(page.getByTestId("toolbar-panel")).toBeVisible();
}

async function lineToPlace(show: Show) {
    const { page } = show;
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(async () => (await readField(page)).selection.length)
        .toBe(HOME.length);
    await page.keyboard.press("l");
    const hint = page.getByTestId("shape-tool-hint");
    await expect(hint).toBeVisible();
    // Tap point after point across the middle of the field
    await tapPoints(page, [
        await onField(page, 0.4, 0.45),
        await onField(page, 0.6, 0.45),
        await onField(page, 0.8, 0.45),
    ]);
    await expect(hint).toContainText("Tap to add points");
    await pillClearOf(page, hint);

    // Finish: the line is drawn, with the floating editor under it
    await reachAndTap(page, page.getByTestId("shape-tool-finish"));
    const readout = page.getByTestId("shape-tool-readout");
    await expect(readout).toBeVisible();

    // The right end dragged down toward the zoom box: the editor moves under the line, toward
    // the field's bottom right (finding A)
    const drawn = (await shapeOverlay(page))!;
    const end = drawn.handles.reduce((p, q) => (q.x > p.x ? q : p));
    const to = await onField(page, 0.85, 0.62);
    await touchDrag(page, end, to, { steps: 12 });
    await shapeOverlay(page);
    await pillClearOf(page, readout);

    // Place: the selection goes onto the line
    const allPages = async () =>
        Promise.all([0, 1, 2].map((id) => savedPositions(show, id)));
    const before = await allPages();
    await reachAndTap(page, page.getByTestId("shape-editor-place"));
    await expect(readout).toBeHidden();
    await waitForIdle(page);
    await expect.poll(allPages).not.toEqual(before);
}

async function isolationDone(page: Page) {
    await isolate(page, PAGE_2_BOX);
    const bar = page.getByTestId("timeline-isolation-bar");
    await pillClearOf(page, bar);
    await reachAndTap(page, bar.getByRole("button", { name: /Done/ }));
    await expect(bar).toBeHidden();
}

for (const layout of LAYOUTS)
    for (const panelOpen of [false, true])
        test(`${layout.name}, toolbar panel ${panelOpen ? "open" : "closed"}: Finish, Place and Done stay reachable`, async ({
            show,
        }) => {
            const { page } = show;
            await page.setViewportSize({
                width: layout.width,
                height: layout.height,
            });
            await expectCanvasMatchesShow(show);
            if (panelOpen) {
                await openPanel(page);
                // The pill doesn't show through the panel, or peek out under it
                await pillClearOf(page, page.getByTestId("toolbar-panel"));
            }

            await lineToPlace(show);
            await isolationDone(page);

            if (panelOpen)
                await pillClearOf(page, page.getByTestId("toolbar-panel"));
            await page.screenshot({
                path: test.info().outputPath("after.png"),
            });
        });

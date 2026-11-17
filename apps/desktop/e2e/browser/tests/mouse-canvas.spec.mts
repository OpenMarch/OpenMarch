import type { Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    canvasScale,
    clickMarcher,
    drawnMarchers,
    expectCanvasMatchesShow,
    readField,
    selectedDrillNumbers,
    waitForIdle,
} from "../app.mjs";
import { savedPositions } from "../positions.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";

// The mouse on the field, ported from the Fabric-era mouse-canvas scenarios
// and the mouse cases of touch-canvas (upstream c9784b34a, tablet plan 1.8)
// to the three.js field. A row of marchers puts its outer ones next to the
// selection box's side handles: a Shift-click there still takes the marcher
// out, a side handle still scales, and the top handle of a one-row
// selection, which has no height to scale, changes nothing. A click just
// outside a small dot still lands on it (the rules table's 5 px click
// target), and a window resize keeps a zoomed-in view without fitting it again.

// Four baritones in a row on the home page, all in view.
const ROW: SeedPosition[] = [
    [1, 500, 300],
    [2, 560, 300],
    [3, 620, 300],
    [4, 680, 300],
];

test.use({
    seedSql: seedShowSql({
        beats: 16,
        pageStarts: [],
        measureStarts: [1, 5, 9, 13],
        marchers: ROW.map(([id]) => ({
            id,
            section: "Baritone",
            prefix: "B",
            order: id,
        })),
        positions: [ROW],
    }),
});

type Point = { x: number; y: number };

const home = ROW.map(([id, x, y]) => ({ id, x, y }));

const saved = (show: Show) => savedPositions(show, 0);

async function screenOf(page: Page, drillNumber: string): Promise<Point> {
    const drawn = (await drawnMarchers(page)).find(
        (m) => m.drillNumber === drillNumber,
    );
    if (!drawn?.onScreen)
        throw new Error(`${drillNumber} is not visible on the field`);
    return drawn.screen;
}

async function selectAll(page: Page) {
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(() => selectedDrillNumbers(page))
        .toEqual(["B1", "B2", "B3", "B4"]);
    await waitForIdle(page);
}

async function handle(page: Page, which: "n" | "e") {
    const handles = (await readField(page)).handles;
    if (!handles) throw new Error("The selection has no handles");
    return handles[which];
}

test.beforeEach(async ({ show }) => {
    await expectCanvasMatchesShow(show);
});

test("Shift-click on a selected marcher at the selection's side takes it out instead of scaling", async ({
    show,
}) => {
    const { page } = show;
    await clickMarcher(page, "B1");
    await clickMarcher(page, "B2", { add: true });
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["B1", "B2"]);
    const b1 = await screenOf(page, "B1");
    // Hover first, as a real pointer does on its way to the dot
    await page.mouse.move(b1.x, b1.y);
    await page.keyboard.down("Shift");
    await page.mouse.click(b1.x, b1.y);
    await page.keyboard.up("Shift");
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["B2"]);
    await waitForIdle(page);
    expect(await saved(show)).toEqual(home);
});

test("a side handle next to an outer marcher still scales the row", async ({
    show,
}) => {
    const { page } = show;
    await selectAll(page);
    const e = await handle(page, "e");
    await page.mouse.move(e.x, e.y);
    await page.mouse.down();
    await page.mouse.move(e.x + 60, e.y, { steps: 8 });
    await page.mouse.up();

    await expect
        .poll(async () => {
            const xs = (await saved(show)).map((p) => p.x);
            return (Math.max(...xs) - Math.min(...xs)) / (680 - 500);
        })
        .toBeGreaterThan(1.05);
    // Still one row
    expect((await saved(show)).map((p) => p.y)).toEqual([300, 300, 300, 300]);
    await expectCanvasMatchesShow(show);
});

test("the top handle of a one-row selection scales nothing up or down", async ({
    show,
}) => {
    const { page } = show;
    await selectAll(page);
    const n = await handle(page, "n");
    await page.mouse.move(n.x, n.y);
    await page.mouse.down();
    await page.mouse.move(n.x, n.y - 60, { steps: 8 });
    await page.mouse.up();
    await waitForIdle(page);
    expect(await saved(show)).toEqual(home);
    await expectCanvasMatchesShow(show);
});

test("a click just outside a small dot, within 5 px of its center, still selects it", async ({
    show,
}) => {
    const { page } = show;
    // Zoomed out until the dot and its outline (6 field units) draw under 4 px
    for (let i = 0; i < 8 && 6 * (await canvasScale(page)) >= 4; i++) {
        await page.getByTitle("Zoom Out").click();
        await page.waitForTimeout(100);
    }
    expect(6 * (await canvasScale(page))).toBeLessThan(4);

    const b2 = await screenOf(page, "B2");
    await page.mouse.click(b2.x, b2.y + 4.5);
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["B2"]);
});

test("resizing the window keeps a zoomed-in view of empty field, without fitting it again", async ({
    show,
    target,
}) => {
    test.skip(target !== "browser", "Resizes the page's viewport");
    const { page } = show;
    for (let i = 0; i < 5; i++) await page.getByTitle("Zoom In").click();
    const box = await page.getByTestId("fieldCanvas").boundingBox();
    if (!box) throw new Error("The field is not on screen");
    // Right-drag the view so empty field, toward the bottom right, is in the middle
    const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(middle.x, middle.y);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(middle.x - 300, middle.y - 200, { steps: 10 });
    await page.mouse.up({ button: "right" });
    await waitForIdle(page);

    // No re-fit: the zoom and the view's offset stay as they were. (Fabric kept
    // the view's center; the field keeps its top-left corner, an open owner
    // question in tablet plan 1.8's port.)
    const before = (await readField(page)).viewport;
    const size = page.viewportSize()!;
    await page.setViewportSize({
        width: size.width - 200,
        height: size.height - 100,
    });
    await expect
        .poll(
            async () =>
                (await page.getByTestId("fieldCanvas").boundingBox())?.width ??
                Infinity,
        )
        .toBeLessThan(box.width - 100);
    await page.waitForTimeout(800);
    const after = (await readField(page)).viewport;
    expect(after.zoom).toBeCloseTo(before.zoom, 5);
    expect(Math.abs(after.pan.x - before.pan.x)).toBeLessThan(2);
    expect(Math.abs(after.pan.y - before.pan.y)).toBeLessThan(2);
});

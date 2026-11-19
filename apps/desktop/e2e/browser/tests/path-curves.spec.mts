import type { Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    clickMarcher,
    drawnMarchers,
    expectCanvasMatchesShow,
    readField,
    selectPage,
    waitForIdle,
} from "../app.mjs";
import { fieldGrid } from "../positions.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";

// Pathways step 2 (fork #644, spec v0.9 Appendix I.4 and I.5): a path's points are corners or
// smooth, drawn and edited as the shape tool's Line's points are. With T1 selected on Page 2, the
// pen's press-and-drag places a smooth point and a click a corner; Enter saves both as one undo
// step, and undo and redo bring back the same ids and roundness. On the open path a double-click
// on a corner makes it smooth, the point's menu turns it back into a corner (Corner | Smooth), and
// the floating editor's Corner and Smooth buttons do the same, each one undo step.

const HOME: SeedPosition[] = [
    [1, 500, 300],
    [2, 600, 300],
];
const PAGE2: SeedPosition[] = [
    [1, 900, 300],
    [2, 600, 300],
];

test.use({
    seedSql: seedShowSql({
        beats: 48,
        pageStarts: [16, 32],
        measureStarts: Array.from({ length: 12 }, (_, i) => 1 + i * 4),
        marchers: HOME.map(([id]) => ({
            id,
            section: "Trumpet",
            prefix: "T",
            order: id,
        })),
        positions: [HOME, HOME, PAGE2],
    }),
    // The time-stretch worklet (#216) can't load in the harness (see props.spec.mts)
    allowedPageErrors: [/Audio worklet error/],
});

type Point = { x: number; y: number };
type StoredPoint = { id: string; at: [number, number]; tension?: number };

async function toScreen(page: Page, p: Point): Promise<Point> {
    const [marcher] = await drawnMarchers(page);
    const { zoom } = (await readField(page)).viewport;
    return {
        x: marcher.screen.x + (p.x - marcher.x) * zoom,
        y: marcher.screen.y + (p.y - marcher.y) * zoom,
    };
}

const pointsOf = async (show: Show): Promise<StoredPoint[]> => {
    const rows = await show.query<{ geometry: string }>(
        "SELECT geometry FROM timeline_routes ORDER BY id",
    );
    return rows.length === 0
        ? []
        : (JSON.parse(rows[0]!.geometry) as { points: StoredPoint[] }).points;
};

const undoSteps = async (show: Show) => {
    const [row] = await show.query<{ count: number }>(
        "SELECT COUNT(DISTINCT history_group) AS count FROM history_undo",
    );
    return row.count;
};

/** The path's drawn line, field units */
const outline = (page: Page) =>
    page.evaluate(
        () => window.fieldTest!.shapeOverlay?.()?.outline ?? [],
    ) as Promise<Point[]>;

test("change: the pen's press-and-drag places a smooth point; a double-click, the point's menu and the editor's buttons swap corner and smooth, each one undo step", async ({
    show,
}) => {
    const { page } = show;
    await expectCanvasMatchesShow(show);
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    const onGrid = (p: Point): Point => ({
        x: cf.x + Math.round((p.x - cf.x) / (S / 2)) * (S / 2),
        y: cf.y + Math.round((p.y - cf.y) / (S / 2)) * (S / 2),
    });

    await selectPage(show, "Page 2");
    await clickMarcher(page, "T1");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([1]);
    const steps = await undoSteps(show);
    await page.keyboard.press("p");
    await expect(page.getByTestId("path-pen-banner")).toContainText(
        "drag for a smooth point",
    );

    // A press-and-drag places a smooth point where it was pressed
    const c1 = onGrid({ x: 600, y: 300 - 8 * S });
    const from = await toScreen(page, c1);
    const to = await toScreen(page, { x: c1.x + 5 * S, y: c1.y });
    await page.mouse.move(from.x, from.y, { steps: 4 });
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
    // A click places a corner (after the double-click time)
    await page.waitForTimeout(600);
    const c2 = onGrid({ x: 800, y: 300 + 6 * S });
    const at2 = await toScreen(page, c2);
    await page.mouse.move(at2.x, at2.y, { steps: 4 });
    await page.mouse.click(at2.x, at2.y);
    await page.keyboard.press("Enter");
    await waitForIdle(page);

    const saved = await pointsOf(show);
    expect(saved).toHaveLength(2);
    expect(saved[0]!.at[0]).toBeCloseTo(c1.x, 3);
    expect(saved[0]!.at[1]).toBeCloseTo(c1.y, 3);
    expect(saved[0]!.tension).toBeGreaterThan(0);
    expect(saved[1]!.tension).toBeUndefined();
    expect(await undoSteps(show)).toBe(steps + 1);
    // The closed path, shown by a tap of N (the default hides paths), is drawn along its curve
    await page.keyboard.press("n");
    await expect
        .poll(async () => (await outline(page)).length)
        .toBeGreaterThan(20);

    // Undo takes it away; redo brings back the same ids and roundness
    await page.keyboard.press("ControlOrMeta+z");
    await waitForIdle(page);
    expect(await pointsOf(show)).toEqual([]);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await waitForIdle(page);
    expect(await pointsOf(show)).toEqual(saved);

    // A double-click on the curve opens the path
    await expect
        .poll(async () => (await outline(page)).length)
        .toBeGreaterThan(20);
    const line = await outline(page);
    const onLine = await toScreen(page, line[Math.floor(line.length / 3)]!);
    await page.mouse.move(onLine.x, onLine.y, { steps: 4 });
    await page.mouse.dblclick(onLine.x, onLine.y);
    await expect(page.getByTestId("path-editor")).toHaveAttribute(
        "data-phase",
        "open",
    );

    // A double-click on the corner makes it smooth: one undo step, ids kept
    let before = await undoSteps(show);
    const corner = await toScreen(page, {
        x: saved[1]!.at[0],
        y: saved[1]!.at[1],
    });
    await page.mouse.move(corner.x, corner.y, { steps: 4 });
    await page.mouse.dblclick(corner.x, corner.y);
    await waitForIdle(page);
    await expect.poll(async () => (await pointsOf(show))[1]?.tension).toBe(1);
    expect((await pointsOf(show)).map((p) => p.id)).toEqual(
        saved.map((p) => p.id),
    );
    expect(await undoSteps(show)).toBe(before + 1);

    // The first point's menu: Corner | Smooth; Corner makes it a corner, one undo step
    await page.waitForTimeout(600);
    before = await undoSteps(show);
    const first = await toScreen(page, {
        x: saved[0]!.at[0],
        y: saved[0]!.at[1],
    });
    await page.mouse.move(first.x, first.y, { steps: 4 });
    await page.mouse.click(first.x, first.y, { button: "right" });
    const menu = page.getByTestId("shape-menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByTestId("shape-menu-smooth")).toBeVisible();
    await menu.getByTestId("shape-menu-corner").click();
    await waitForIdle(page);
    await expect
        .poll(async () => (await pointsOf(show))[0]?.tension)
        .toBeUndefined();
    expect(await undoSteps(show)).toBe(before + 1);
    // The menu stays open on a Corner | Smooth pick; Escape closes it (and may close the path,
    // which a double-click on its line opens again)
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    if (
        (await page
            .getByTestId("path-editor")
            .getAttribute("data-phase")
            .catch(() => null)) !== "open"
    ) {
        const again = await outline(page);
        const hit = await toScreen(page, again[Math.floor(again.length / 3)]!);
        await page.mouse.dblclick(hit.x, hit.y);
        await expect(page.getByTestId("path-editor")).toHaveAttribute(
            "data-phase",
            "open",
        );
    }

    // With a point selected, the floating editor's Smooth button makes it smooth
    await page.waitForTimeout(600);
    await page.mouse.click(first.x, first.y);
    await expect(page.getByTestId("path-point-corner")).toHaveAttribute(
        "aria-pressed",
        "true",
    );
    before = await undoSteps(show);
    await page.getByTestId("path-point-smooth").click();
    await waitForIdle(page);
    await expect.poll(async () => (await pointsOf(show))[0]?.tension).toBe(1);
    expect(await undoSteps(show)).toBe(before + 1);
    await expect(page.getByTestId("path-point-smooth")).toHaveAttribute(
        "aria-pressed",
        "true",
    );
    await expectCanvasMatchesShow(show);
});

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

// Pathways step 15 (fork #656, spec v0.9 R-14 "Group schedule", Appendix I.8): with a
// 2 × 2 block selected on Page 2, P draws one group path from the middle of their starts;
// Enter saves it as one undo step: one route, each member's transition walking it with
// its own offset, every lane drawn faint and every member ringed ("Follows the group
// path"). Undo takes it away and redo brings back the same route. With one member selected
// the group path shows, and Detach (the palette here; the bar's ··· too) gives that
// member its own copy of the group path, keeping its offset (one undo step), shown open,
// where Rejoin puts it back on the group path. Remove path with one member selected
// removes the whole group's path, and the toast says for how many marchers. Since step 24
// a path is lanes on the members' own slots, so their moves stay `direct`.

const HOME: SeedPosition[] = [
    [1, 500, 300],
    [2, 540, 300],
    [3, 500, 340],
    [4, 540, 340],
];
// Page 2 slides the block 400 field units to the right: its end set is its start moved over
const PAGE2: SeedPosition[] = HOME.map(([id, x, y]) => [id, x + 400, y]);

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

/** Where field point `p` is drawn in the viewport, from where the marchers are drawn. */
async function toScreen(page: Page, p: Point): Promise<Point> {
    const [marcher] = await drawnMarchers(page);
    const { zoom } = (await readField(page)).viewport;
    return {
        x: marcher.screen.x + (p.x - marcher.x) * zoom,
        y: marcher.screen.y + (p.y - marcher.y) * zoom,
    };
}

const routes = (show: Show) =>
    show.query<{ id: number; geometry: string }>(
        "SELECT id, geometry FROM timeline_routes ORDER BY id",
    );

/** Each marcher in move `timelineId`: the lane on its slot (route and offset), and its move's style */
const walkers = (show: Show, timelineId: number) =>
    show.query<{
        marcher: number;
        route: number | null;
        ox: number | null;
        oy: number | null;
        style: string;
    }>(
        `SELECT a.marcher_id AS marcher, l.route_id AS route, l.offset_x AS ox,
                l.offset_y AS oy, t.path_style AS style
           FROM timeline_assignments a JOIN timeline_transitions t ON t.id = a.transition_id
           LEFT JOIN timeline_lanes l
             ON l.transition_id = a.transition_id AND l.slot_index = a.slot_index
          WHERE t.timeline_id = ${timelineId} ORDER BY a.marcher_id`,
    );

const overlay = (page: Page) =>
    page.evaluate(() => {
        const o = window.fieldTest!.shapeOverlay?.() ?? null;
        return o
            ? {
                  lanes: o.lanes,
                  rings: o.memberRings.map((r) => r.kind),
                  labels: o.memberRings.map((r) => r.label),
              }
            : null;
    });

const undoSteps = async (show: Show) => {
    const [row] = await show.query<{ count: number }>(
        "SELECT COUNT(DISTINCT history_group) AS count FROM history_undo",
    );
    return row.count;
};

test("change: P with a block selected draws one group path; Detach and Rejoin; Remove path removes the group's", async ({
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
    for (const t of ["T2", "T3", "T4"])
        await clickMarcher(page, t, { add: true });
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([1, 2, 3, 4]);
    const steps = await undoSteps(show);
    await page.keyboard.press("p");
    await expect(page.getByTestId("path-pen-banner")).toContainText(
        "Group path for 4 marchers",
    );

    // One corner above the block's middle, halfway along; Enter saves the group path
    const corner = onGrid({ x: 720, y: 320 - 8 * S });
    const at = await toScreen(page, corner);
    await page.mouse.move(at.x, at.y, { steps: 4 });
    await page.mouse.click(at.x, at.y);
    await page.keyboard.press("Enter");
    await waitForIdle(page);

    await expect.poll(async () => (await routes(show)).length).toBe(1);
    const [route] = await routes(show);
    const geometry = JSON.parse(route!.geometry) as {
        from: [number, number];
        to: [number, number];
        points: { at: [number, number] }[];
    };
    expect(geometry.from).toEqual([520, 320]);
    expect(geometry.to).toEqual([920, 320]);
    expect(geometry.points.map((p) => p.at)).toEqual([[corner.x, corner.y]]);
    const [{ timeline }] = await show.query<{ timeline: number }>(
        `SELECT t.timeline_id AS timeline FROM timeline_lanes l
           JOIN timeline_transitions t ON t.id = l.transition_id
          WHERE l.route_id = ${route!.id} LIMIT 1`,
    );
    const drawn = await walkers(show, timeline);
    expect(drawn.map((w) => w.route)).toEqual([
        route!.id,
        route!.id,
        route!.id,
        route!.id,
    ]);
    expect(drawn.map((w) => w.style)).toEqual(Array(4).fill("direct"));
    expect(drawn.map((w) => [w.ox, w.oy])).toEqual([
        [-20, -20],
        [20, -20],
        [-20, 20],
        [20, 20],
    ]);
    expect(await undoSteps(show)).toBe(steps + 1);
    // Every lane drawn, every member ringed
    await expect
        .poll(() => overlay(page))
        .toEqual({
            lanes: 4,
            rings: ["group", "group", "group", "group"],
            labels: Array(4).fill("Follows the group path"),
        });

    // Undo takes it away; redo brings back the same route
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(async () => (await routes(show)).length).toBe(0);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect
        .poll(async () => (await routes(show)).map((r) => r.id))
        .toEqual([route!.id]);

    // One member selected: the group path shows. Detach (from the palette) gives T2 a verbatim
    // copy of the group path, keeping its offset, and the copy opens
    await clickMarcher(page, "T2");
    await expect.poll(() => overlay(page)).not.toBeNull();
    const line = await toScreen(page, corner);
    const beforeDetach = await undoSteps(show);
    await page.keyboard.press("ControlOrMeta+k");
    await page.keyboard.type("Detach");
    await page.keyboard.press("Enter");
    await waitForIdle(page);
    await expect.poll(async () => (await routes(show)).length).toBe(2);
    const copy = (await walkers(show, timeline)).find((w) => w.marcher === 2)!;
    expect(copy.route).not.toBe(route!.id);
    expect([copy.ox, copy.oy]).toEqual([20, -20]);
    expect(
        (await routes(show)).find((r) => r.id === copy.route)!.geometry,
    ).toBe(route!.geometry);
    expect(await undoSteps(show)).toBe(beforeDetach + 1);
    await expect(page.getByTestId("path-editor")).toHaveAttribute(
        "data-phase",
        "open",
    );

    // Rejoin, on the open copy's bar, puts it back on the group path; its copy goes
    await page.getByTestId("path-rejoin").click();
    await waitForIdle(page);
    await expect.poll(async () => (await routes(show)).length).toBe(1);
    const back = (await walkers(show, timeline)).find((w) => w.marcher === 2)!;
    expect(back.route).toBe(route!.id);
    expect([back.ox, back.oy]).toEqual([20, -20]);

    // Remove path with one member selected removes the whole group's path
    await clickMarcher(page, "T1");
    await expect.poll(() => overlay(page)).not.toBeNull();
    await page.mouse.click(line.x, line.y, { button: "right" });
    const fieldMenu = page.getByTestId("field-menu");
    await expect(fieldMenu.getByTestId("field-menu-removePath")).toBeVisible();
    await fieldMenu.getByTestId("field-menu-removePath").click();
    await expect(
        page.getByText("Removed the path for 4 marchers"),
    ).toBeVisible();
    await expect.poll(async () => (await routes(show)).length).toBe(0);
    expect((await walkers(show, timeline)).map((w) => w.route)).toEqual(
        Array(4).fill(null),
    );
});

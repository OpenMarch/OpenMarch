import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures.mjs";
import { dragFrom, readField, selectPage, waitForIdle } from "../app.mjs";
import { savedPosition } from "../positions.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";
import type { FieldTestItem } from "../../../src/field/fieldTestApi";

// The front ensemble on the 2D field (instruments.md section 6): equipment
// stands in the pit strip in front of the front sideline, starts locked, so
// no click, drag or area selection takes it until its right-click unlocks it
// (props epic step 2), and a pit instrument has its playing spot on its field
// side.

/** Field units per meter and per foot, as `PIXELS_PER_METER` (`src/items/itemOutlines.ts`) */
const PIXELS_PER_METER = 0.5 / 0.0254;
const FOOT = 6;
/** The blank show's front sideline, y = 0 steps */
const FRONT = 959.9625;

const PAGE_0: SeedPosition[] = [
    [1, 840, 900],
    [2, 960, 900],
];
const PAGE_1: SeedPosition[] = [
    [1, 840, 860],
    [2, 960, 860],
];
const PAGE_2: SeedPosition[] = [
    [1, 800, 860],
    [2, 1000, 860],
];

/** A locked 5.0 marimba (marcher 20) 11.6 ft out, and a speaker (marcher 21) beside it */
const MARIMBA = { x: 900, y: FRONT + 11.6 * FOOT };
const PIT = [
    `INSERT INTO marchers (id, section, drill_prefix, drill_order, home_x, home_y, type) VALUES (20, 'Equipment', 'EQUIP', 1, ${MARIMBA.x}, ${MARIMBA.y}, 'item'), (21, 'Equipment', 'EQUIP', 2, 1040, ${MARIMBA.y}, 'item')`,
    "INSERT INTO items (id, marcher_id, kind, model, locked) VALUES (1, 20, 'equipment', 'pit/marimba-5.0', 1), (2, 21, 'equipment', 'pit/speaker-tall', 1)",
    "INSERT INTO item_geometry (item_id, beat_id, outline_type, width, depth, height) VALUES (1, 0, 'rectangle', 2.54, 1.207, 0.98), (2, 0, 'rectangle', 0.616, 0.636, 1.785)",
];

test.use({
    // The time-stretch worklet (#216) can't load here; nothing here plays
    allowedPageErrors: [/Audio worklet error/],
    seedSql: [
        ...seedShowSql({
            beats: 24,
            pageStarts: [1, 9],
            measureStarts: [1, 5, 9, 13, 17, 21],
            marchers: PAGE_0.map(([id]) => ({
                id,
                section: "Trumpet",
                prefix: "T",
                order: id,
            })),
            positions: [PAGE_0, PAGE_1, PAGE_2],
        }),
        ...PIT,
    ],
});

const drawnItems = (page: Page): Promise<FieldTestItem[]> =>
    page.evaluate(() => window.fieldTest!.items?.() ?? []);

test("draws the pit past the front sideline, locked, with the marimba's playing spot on its field side", async ({
    show,
}) => {
    await expect.poll(() => drawnItems(show.page)).toHaveLength(2);
    const [marimba, speaker] = await drawnItems(show.page);
    expect(marimba).toMatchObject({ id: 20, locked: true, ...MARIMBA });
    expect(marimba.y).toBeGreaterThan(FRONT);
    // Centered, a foot past its field-side edge
    expect(marimba.playingSpot!.x).toBeCloseTo(MARIMBA.x);
    expect(marimba.playingSpot!.y).toBeCloseTo(
        MARIMBA.y - (1.207 / 2) * PIXELS_PER_METER - FOOT,
    );
    expect(speaker).toMatchObject({ id: 21, locked: true, playingSpot: null });
    // The view fits the strip: the marimba is on screen at the opening view
    const canvas = (await show.page
        .getByTestId("fieldCanvas")
        .first()
        .boundingBox())!;
    expect(marimba.screen.y).toBeLessThan(canvas.y + canvas.height);
});

test("a drag from a locked marimba leaves it put; unlocked from its right-click, it moves on that page", async ({
    show,
}) => {
    await expect.poll(() => drawnItems(show.page)).toHaveLength(2);
    await selectPage(show, "Page 2");
    const { zoom } = (await readField(show.page)).viewport;
    const [marimba] = await drawnItems(show.page);
    const grab = { x: marimba.screen.x + 20 * zoom, y: marimba.screen.y };
    await dragFrom(show.page, grab, { x: 30 * zoom, y: 0 });
    await waitForIdle(show.page);
    expect((await savedPosition(show, 20, 2)).x).toBe(MARIMBA.x);

    await show.page.mouse.click(grab.x, grab.y, { button: "right" });
    await show.page.getByTestId("field-menu-unlockSelectedItem").click();
    await expect
        .poll(() => show.query("SELECT locked FROM items WHERE id = 1"))
        .toEqual([{ locked: 0 }]);
    // The field has it unlocked too, so the drag takes it
    await expect
        .poll(() => drawnItems(show.page).then((items) => items[0]?.locked))
        .toBe(false);

    await dragFrom(show.page, grab, { x: 30 * zoom, y: 0 });
    await waitForIdle(show.page);
    // About 30 units right on Page 2, as the drag's snapping rounds it, and where it was before
    await expect
        .poll(() => savedPosition(show, 20, 2).then((p) => p.x))
        .toBeGreaterThan(MARIMBA.x + 15);
    expect((await savedPosition(show, 20, 0)).x).toBe(MARIMBA.x);
});

test("a marquee over the pit takes nothing; a click on a locked item selects nothing and shows a Locked tag that opens its menu", async ({
    show,
}) => {
    await expect.poll(() => drawnItems(show.page)).toHaveLength(2);
    const { zoom } = (await readField(show.page)).viewport;
    const [marimba, speaker] = await drawnItems(show.page);
    // From left of the marimba, over the marimba and the speaker, both wholly inside
    const from = {
        x: marimba.screen.x - 40 * zoom,
        y: marimba.screen.y - 20 * zoom,
    };
    await dragFrom(show.page, from, {
        x: speaker.screen.x - from.x + 20 * zoom,
        y: 40 * zoom,
    });
    await expect
        .poll(() => show.page.evaluate(() => window.fieldTest!.selection()))
        .toEqual([]);

    await show.page.mouse.click(marimba.screen.x + 10 * zoom, marimba.screen.y);
    await waitForIdle(show.page);
    expect(
        await show.page.evaluate(() => window.fieldTest!.selection()),
    ).toEqual([]);

    // The click shows that it's locked, and the tag opens its Unlock menu, as a right-click does
    await show.page.getByTestId("field-locked-tag").click();
    await expect(
        show.page.getByTestId("field-menu-unlockSelectedItem"),
    ).toBeVisible();
    await expect
        .poll(() => show.page.evaluate(() => window.fieldTest!.selection()))
        .toEqual([20]);
    await expect(show.page.getByTestId("field-locked-tag")).toHaveCount(0);
});

import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures.mjs";
import { dragFrom, readField, selectPage, waitForIdle } from "../app.mjs";
import { savedPosition } from "../positions.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";
import type { FieldTestItem } from "../../../src/field/fieldTestApi";

// The front ensemble on the 2D field (instruments.md section 6): equipment
// stands in the pit strip in front of the front sideline, a locked item has
// one position for the whole show, area selections skip it, and a pit
// instrument has its playing spot on its field side.

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

test("a locked marimba dragged on a later page moves on every page, in one undo step", async ({
    show,
}) => {
    await expect.poll(() => drawnItems(show.page)).toHaveLength(2);
    await selectPage(show, "Page 2");
    const { zoom } = (await readField(show.page)).viewport;
    const [marimba] = await drawnItems(show.page);
    await dragFrom(
        show.page,
        { x: marimba.screen.x + 20 * zoom, y: marimba.screen.y },
        { x: 30 * zoom, y: 0 },
    );
    await waitForIdle(show.page);

    // About 30 units right, as the drag's snapping rounds it
    await expect
        .poll(() => savedPosition(show, 20, 2).then((p) => p.x))
        .toBeGreaterThan(MARIMBA.x + 15);
    for (const pageId of [0, 1, 2])
        expect(await savedPosition(show, 20, pageId)).toEqual(
            await savedPosition(show, 20, 2),
        );
    expect(
        await show.query(
            "SELECT id FROM timeline_assignments WHERE marcher_id = 20",
        ),
    ).toEqual([]);

    await show.page.keyboard.press("ControlOrMeta+z");
    await expect
        .poll(() => savedPosition(show, 20, 2).then((p) => p.x))
        .toBe(MARIMBA.x);
    expect((await savedPosition(show, 20, 0)).x).toBe(MARIMBA.x);
});

test("a marquee over the pit takes nothing, and a click still selects a locked item", async ({
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
    await expect
        .poll(() => show.page.evaluate(() => window.fieldTest!.selection()))
        .toEqual([20]);
});

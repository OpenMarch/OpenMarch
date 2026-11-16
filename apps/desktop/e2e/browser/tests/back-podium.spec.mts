import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures.mjs";
import { dragFrom, readField, selectPage, waitForIdle } from "../app.mjs";
import { savedPosition } from "../positions.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";
import type { FieldTestItem } from "../../../src/field/fieldTestApi";

// A drum major's podium behind the back sideline (instruments.md section 6):
// the field draws a back strip there and fits it, and a locked podium can be
// dragged further back, past the field, on any page.

/** A low podium (marcher 20) 5 ft behind the back sideline, y = 0, turned to face the field */
const PODIUM = { x: 900, y: -30 };

/** The drum major (marcher 1) on the podium; a trumpet (marcher 2) on the field */
const PAGE_0: SeedPosition[] = [
    [1, PODIUM.x, PODIUM.y],
    [2, 900, 400],
];
const PAGE_1: SeedPosition[] = [
    [1, PODIUM.x, PODIUM.y],
    [2, 900, 300],
];

test.use({
    // The time-stretch worklet (#216) can't load here; nothing here plays
    allowedPageErrors: [/Audio worklet error/],
    seedSql: [
        ...seedShowSql({
            beats: 16,
            pageStarts: [1],
            measureStarts: [1, 5, 9, 13],
            marchers: [
                { id: 1, section: "Drum Major", prefix: "DM", order: 1 },
                { id: 2, section: "Trumpet", prefix: "T", order: 1 },
            ],
            positions: [PAGE_0, PAGE_1],
        }),
        `INSERT INTO marchers (id, section, drill_prefix, drill_order, home_x, home_y, type) VALUES (20, 'Equipment', 'EQUIP', 1, ${PODIUM.x}, ${PODIUM.y}, 'item')`,
        "INSERT INTO items (id, marcher_id, kind, model, locked) VALUES (1, 20, 'equipment', 'pit/conductor-podium', 1)",
        "INSERT INTO item_geometry (item_id, beat_id, outline_type, width, depth, height, rotation) VALUES (1, 0, 'rectangle', 1.2, 1.5, 1.39, 180)",
    ],
});

const drawnItems = (page: Page): Promise<FieldTestItem[]> =>
    page.evaluate(() => window.fieldTest!.items?.() ?? []);

test("opens fitted to the back strip, with the podium and its drum major in view", async ({
    show,
}) => {
    await expect.poll(() => drawnItems(show.page)).toHaveLength(1);
    const [podium] = await drawnItems(show.page);
    expect(podium).toMatchObject({ id: 20, locked: true, playingSpot: null });
    expect(podium.y).toBeLessThan(0);
    const canvas = (await show.page
        .getByTestId("fieldCanvas")
        .first()
        .boundingBox())!;
    // In view, with room above it: the strip reaches 30 ft (180 units) behind the field
    const { zoom } = (await readField(show.page)).viewport;
    expect(podium.screen.y - (180 + PODIUM.y) * zoom).toBeGreaterThan(
        canvas.y - 1,
    );
});

test("a back podium dragged further back lands there on every page", async ({
    show,
}) => {
    await expect.poll(() => drawnItems(show.page)).toHaveLength(1);
    await selectPage(show, "Page 1");
    const { zoom } = (await readField(show.page)).viewport;
    const [podium] = await drawnItems(show.page);
    // From the podium's edge, clear of the drum major's dot at its center
    await dragFrom(
        show.page,
        { x: podium.screen.x + 10 * zoom, y: podium.screen.y },
        { x: 0, y: -60 * zoom },
    );
    await waitForIdle(show.page);
    await expect
        .poll(() => savedPosition(show, 20, 1).then((p) => p.y))
        .toBeLessThan(PODIUM.y - 40);
    expect(await savedPosition(show, 20, 0)).toEqual(
        await savedPosition(show, 20, 1),
    );
});

import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures.mjs";
import {
    dragFrom,
    expectCanvasMatchesShow,
    readField,
    waitForIdle,
} from "../app.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";
import type { FieldTestItem } from "../../../src/field/fieldTestApi";

// Props on the field (C2.1): a prop is a marchers row the timeline moves like
// any marcher, drawn as its Outline instead of a dot. A click anywhere inside
// the Outline selects it, a performer standing on it is still clicked, and a
// drag moves it through the timeline.

/** Field units per meter, as `PIXELS_PER_METER` (`src/items/itemOutlines.ts`). */
const PIXELS_PER_METER = 0.5 / 0.0254;

const PAGE_0: SeedPosition[] = [
    [1, 503, 304],
    [2, 803, 404],
];

/** A 4 x 2 m riser (marcher 10) centered on (700, 300), on field from beat 0. */
const RISER = [
    "INSERT INTO marchers (id, section, drill_prefix, drill_order, home_x, home_y, type) VALUES (10, 'Prop', 'PROP', 1, 700, 300, 'item')",
    "INSERT INTO items (id, marcher_id, kind, surface_type) VALUES (1, 10, 'prop', 'floor')",
    "INSERT INTO item_geometry (item_id, beat_id, outline_type, width, depth) VALUES (1, 0, 'rectangle', 4, 2)",
];

test.use({
    // The time-stretch worklet (#216) can't load here: Playwright's route,
    // which serves the renderer from disk, doesn't see AudioWorklet module
    // requests. Every browser scenario on main logs this; nothing here plays.
    allowedPageErrors: [/Audio worklet error/],
    seedSql: [
        ...seedShowSql({
            beats: 16,
            pageStarts: [],
            measureStarts: [1, 5, 9, 13],
            marchers: PAGE_0.map(([id]) => ({
                id,
                section: "Trumpet",
                prefix: "T",
                order: id,
            })),
            positions: [PAGE_0],
        }),
        ...RISER,
    ],
});

const drawnItems = (page: Page): Promise<FieldTestItem[]> =>
    page.evaluate(() => window.fieldTest!.items?.() ?? []);

/** A point inside the riser, `meters` right of its center, in the viewport. */
async function insideRiser(page: Page, meters: number) {
    const [riser] = await drawnItems(page);
    const { zoom } = (await readField(page)).viewport;
    return {
        x: riser.screen.x + meters * PIXELS_PER_METER * zoom,
        y: riser.screen.y,
    };
}

test("draws a prop as its Outline, at its size, where the timeline has it", async ({
    show,
}) => {
    await expect
        .poll(() => drawnItems(show.page))
        .toEqual([
            expect.objectContaining({
                id: 10,
                outlineType: "rectangle",
                width: 4,
                depth: 2,
                rotation: 0,
                x: 700,
                y: 300,
            }),
        ]);
    await expectCanvasMatchesShow(show);
});

test("selects a prop clicked inside its Outline, away from its center", async ({
    show,
}) => {
    await expect.poll(() => drawnItems(show.page)).toHaveLength(1);
    const at = await insideRiser(show.page, 1.8);
    await show.page.mouse.click(at.x, at.y);
    await expect
        .poll(() => show.page.evaluate(() => window.fieldTest!.selection()))
        .toEqual([10]);
});

test("moves a prop dragged from inside its Outline, and saves where it lands", async ({
    show,
}) => {
    await expect.poll(() => drawnItems(show.page)).toHaveLength(1);
    const { zoom } = (await readField(show.page)).viewport;
    const from = await insideRiser(show.page, 1.5);
    await dragFrom(show.page, from, { x: 0, y: 40 * zoom });
    await waitForIdle(show.page);
    await expectCanvasMatchesShow(show);
    const [riser] = await drawnItems(show.page);
    expect(riser.y).toBeGreaterThan(300);
    expect(riser.width).toBe(4);
});

/** Selects the riser with a click inside its Outline, and returns its handles. */
async function selectRiser(page: Page) {
    await expect.poll(() => drawnItems(page)).toHaveLength(1);
    const at = await insideRiser(page, 1);
    await page.mouse.click(at.x, at.y);
    await expect
        .poll(() => page.evaluate(() => window.fieldTest!.selection()))
        .toEqual([10]);
    await expect
        .poll(() => page.evaluate(() => window.fieldTest!.handles()))
        .not.toBeNull();
    return (await page.evaluate(() => window.fieldTest!.handles()))!;
}

test("resizes a prop from its side handle at the playhead, without moving it", async ({
    show,
}) => {
    const handles = await selectRiser(show.page);
    const { zoom } = (await readField(show.page)).viewport;
    // A meter further out on the east side: a meter more on each side
    await dragFrom(show.page, handles.e, { x: PIXELS_PER_METER * zoom, y: 0 });
    await waitForIdle(show.page);
    await expect
        .poll(async () => {
            const [riser] = await drawnItems(show.page);
            return Math.round(riser.width * 10) / 10;
        })
        .toBe(6);
    const [riser] = await drawnItems(show.page);
    expect([riser.x, riser.y, riser.depth]).toEqual([700, 300, 2]);
    const saved = await show.query(
        "SELECT beat_id, round(width, 1) AS width, depth FROM item_geometry",
    );
    expect(saved).toEqual([{ beat_id: 0, width: 6, depth: 2 }]);
    await expectCanvasMatchesShow(show);
});

test("turns a prop from its rotate handle, snapped to 15°", async ({
    show,
}) => {
    const handles = await selectRiser(show.page);
    const [riser] = await drawnItems(show.page);
    // From above the center round to its right: a quarter turn clockwise
    const reach = handles.rot.y - riser.screen.y;
    await dragFrom(
        show.page,
        handles.rot,
        { x: -reach, y: -reach + 2 },
        { steps: 20 },
    );
    await waitForIdle(show.page);
    await expect
        .poll(async () => (await drawnItems(show.page))[0].rotation)
        .toBe(90);
    expect(await show.query("SELECT rotation FROM item_geometry")).toEqual([
        { rotation: 90 },
    ]);
});

/** Picks an Outline in the Props panel's Draw, which closes the panel for drawing. */
async function pickOutline(page: Page, outline: string) {
    await page.locator("#sidebar-launcher-props").click();
    await page.getByRole("button", { name: outline }).click();
    await expect
        .poll(() => page.evaluate(() => window.fieldTest!.activeGesture()))
        .toBe("prop");
}

test("draws a new prop with the Props panel's rectangle, on field from the playhead", async ({
    show,
}) => {
    await expect.poll(() => drawnItems(show.page)).toHaveLength(1);
    await pickOutline(show.page, "Rectangle");
    const box = (await show.page
        .getByTestId("fieldCanvas")
        .first()
        .boundingBox())!;
    const from = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.6 };
    await dragFrom(show.page, from, { x: 80, y: 50 });
    await waitForIdle(show.page);
    await expect.poll(() => drawnItems(show.page)).toHaveLength(2);
    expect(
        await show.page.evaluate(() => window.fieldTest!.activeGesture()),
    ).toBeNull();
    expect(
        await show.query(
            "SELECT kind, surface_type, outline_type, beat_id FROM items JOIN item_geometry ON item_geometry.item_id = items.id WHERE items.id != 1",
        ),
    ).toEqual([
        {
            kind: "prop",
            surface_type: "floor",
            outline_type: "rectangle",
            beat_id: 0,
        },
    ]);
    await expectCanvasMatchesShow(show);
});

test("Escape turns the prop tool off, and nothing is drawn", async ({
    show,
}) => {
    // A selected prop's handles do nothing while the tool is on, so they go
    await selectRiser(show.page);
    await pickOutline(show.page, "Polygon");
    expect(
        await show.page.evaluate(() => window.fieldTest!.handles()),
    ).toBeNull();
    const box = (await show.page
        .getByTestId("fieldCanvas")
        .first()
        .boundingBox())!;
    await show.page.mouse.click(
        box.x + box.width * 0.2,
        box.y + box.height * 0.6,
    );
    await show.page.mouse.move(
        box.x + box.width * 0.3,
        box.y + box.height * 0.6,
    );
    await expect
        .poll(() =>
            show.page.evaluate(() => window.fieldTest!.propTool?.()?.preview),
        )
        .not.toBeNull();
    await show.page.keyboard.press("Escape");
    await expect
        .poll(() => show.page.evaluate(() => window.fieldTest!.propTool?.()))
        .toBeNull();
    expect(await show.query("SELECT id FROM items")).toEqual([{ id: 1 }]);
});

/** The front ensemble view, opened from its row at the top of the Marchers panel */
async function openFrontEnsemble(page: Page) {
    await page.locator("#sidebar-launcher-marchers").click();
    await page
        .getByTestId("front-ensemble-summary")
        .getByRole("button")
        .click();
}

test("places a marimba from the Front ensemble panel with one click, locked, at its model's footprint", async ({
    show,
}) => {
    const { page } = show;
    await expect.poll(() => drawnItems(page)).toHaveLength(1);
    await openFrontEnsemble(page);
    // Add is its own view: the pictures of every model
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const ensemble = page.getByRole("region", { name: "Add equipment" });
    // Each model is a picture: pick the 5.0 rosewood marimba from the search
    await ensemble
        .getByRole("searchbox", { name: "Search equipment" })
        .fill("marimba 5.0");
    await ensemble
        .getByRole("button", { name: "Marimba · 5.0 octaves · Rosewood" })
        .click();
    await expect
        .poll(() => page.evaluate(() => window.fieldTest!.activeGesture()))
        .toBe("prop");

    // The footprint follows the pointer before the click
    const box = (await page.getByTestId("fieldCanvas").first().boundingBox())!;
    const at = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.7 };
    await page.mouse.move(at.x, at.y);
    await expect
        .poll(() =>
            page.evaluate(() => window.fieldTest!.propTool?.()?.preview),
        )
        .not.toBeNull();
    await page.mouse.click(at.x, at.y);
    await waitForIdle(page);
    await expect.poll(() => drawnItems(page)).toHaveLength(2);
    expect(
        await page.evaluate(() => window.fieldTest!.activeGesture()),
    ).toBeNull();
    expect(
        await show.query(
            "SELECT kind, model, locked, name, outline_type, width, depth, beat_id FROM items JOIN item_geometry ON item_geometry.item_id = items.id JOIN marchers ON marchers.id = items.marcher_id WHERE items.id != 1",
        ),
    ).toEqual([
        {
            kind: "equipment",
            model: "pit/marimba-5.0",
            locked: 1,
            name: "Marimba 1",
            outline_type: "rectangle",
            width: 2.54,
            depth: 1.207,
            beat_id: 0,
        },
    ]);
    await expectCanvasMatchesShow(show);
});

test("places a podium behind the back sideline, turned to face the field", async ({
    show,
}) => {
    const { page } = show;
    await expect.poll(() => drawnItems(page)).toHaveLength(1);
    await openFrontEnsemble(page);
    // Add is its own view: the pictures of every model
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const ensemble = page.getByRole("region", { name: "Add equipment" });
    await ensemble.getByRole("button", { name: /^Podium · Low/ }).click();
    await expect
        .poll(() => page.evaluate(() => window.fieldTest!.activeGesture()))
        .toBe("prop");

    // Field points in the viewport, from the riser's center (700, 300)
    const [riser] = await drawnItems(page);
    const { zoom } = (await readField(page)).viewport;
    const toScreen = (x: number, y: number) => ({
        x: riser.screen.x + (x - 700) * zoom,
        y: riser.screen.y + (y - 300) * zoom,
    });
    const notchY = () =>
        page.evaluate(
            () => window.fieldTest!.propTool?.()?.preview?.points[4]?.y,
        );

    // On the front half the notch, on the model's audience side as built, is toward the audience
    const front = toScreen(700, 800);
    await page.mouse.move(front.x, front.y);
    await expect.poll(notchY).toBeGreaterThan(800);
    // Behind the back sideline it turns around, so its performer faces the field
    const back = toScreen(500, -15);
    await page.mouse.move(back.x, back.y);
    await expect.poll(notchY).toBeLessThan(-15);
    await page.mouse.click(back.x, back.y);
    await waitForIdle(page);
    await expect.poll(() => drawnItems(page)).toHaveLength(2);
    const [placed] = await show.query(
        "SELECT model, home_y, rotation FROM items JOIN item_geometry ON item_geometry.item_id = items.id JOIN marchers ON marchers.id = items.marcher_id WHERE items.id != 1",
    );
    expect(placed).toMatchObject({
        model: "pit/conductor-podium",
        rotation: 180,
    });
    // Not held to the field
    expect(placed!.home_y as number).toBeLessThan(0);
});

test("applies a front ensemble preset with its performers in one undo step, and replaces it with another", async ({
    show,
}) => {
    const { page } = show;
    await expect.poll(() => drawnItems(page)).toHaveLength(1);
    await openFrontEnsemble(page);
    // The presets sit behind a small button in the header, so adding equipment stays in front
    const presetsButton = page.getByTestId("pit-presets-button");
    await expect(presetsButton).toHaveText("Start from a preset");
    await presetsButton.click();
    const presets = page.getByRole("dialog", { name: "Presets" });
    await presets.getByRole("radio", { name: "Medium" }).click();
    await expect(presets.getByRole("checkbox")).toBeChecked();
    await presets.getByRole("button", { name: "Apply" }).click();
    await waitForIdle(page);

    // 4 marimbas, 3 vibes, xylophone, glockenspiel, rack, drum set, synth, 4 speakers, podium,
    // mixer: 18 pieces of equipment beside the riser, locked
    await expect.poll(() => drawnItems(page)).toHaveLength(19);
    expect(
        await show.query(
            "SELECT count(*) AS n, min(locked) AS locked FROM items WHERE kind = 'equipment'",
        ),
    ).toEqual([{ n: 18, locked: 1 }]);
    // A player per instrument and a drum major, beside the two trumpets
    expect(
        await show.query(
            "SELECT section, count(*) AS n FROM marchers WHERE type = 'marcher' GROUP BY section ORDER BY section",
        ),
    ).toEqual([
        { section: "Drum Major", n: 1 },
        { section: "Drum Set", n: 1 },
        { section: "Glockenspiel", n: 1 },
        { section: "Marimba", n: 4 },
        { section: "Rack", n: 1 },
        { section: "Synthesizer", n: 1 },
        { section: "Trumpet", n: 2 },
        { section: "Vibraphone", n: 3 },
        { section: "Xylophone", n: 1 },
    ]);
    await expectCanvasMatchesShow(show);

    // Applying closes the popover; the button now resets to a preset.
    // Small replaces Medium's equipment, keeps the riser and adds no performers it already has
    await expect(presets).toBeHidden();
    await expect(presetsButton).toHaveText("Reset to preset");
    await presetsButton.click();
    await expect(
        presets.getByText("Replaces the equipment the last preset added", {
            exact: false,
        }),
    ).toBeVisible();
    await presets.getByRole("radio", { name: "Small" }).click();
    await presets.getByRole("button", { name: "Apply" }).click();
    await waitForIdle(page);
    await expect.poll(() => drawnItems(page)).toHaveLength(11);
    expect(
        await show.query(
            "SELECT count(*) AS n FROM marchers WHERE type = 'marcher'",
        ),
    ).toEqual([{ n: 15 }]);

    // One undo brings Medium back
    await page.keyboard.press("ControlOrMeta+z");
    await waitForIdle(page);
    await expect.poll(() => drawnItems(page)).toHaveLength(19);
});

import type { Locator, Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    clickMarcher,
    drawnMarchers,
    openSettings,
    expectCanvasMatchesShow,
    goTo,
    readField,
    selectPage,
    setUiSettings,
    waitForField,
    waitForIdle,
} from "../app.mjs";
import { fieldGrid, savedPositions, type Position } from "../positions.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";
import type {
    FieldTestPlacedBox,
    FieldTestShapeOverlay,
} from "../../../src/field/fieldTestApi";

// The box shape tool on the three.js field (#204, from box v1 #181): B opens
// it on the selected marchers, a drag draws a box edge to edge on the
// half-step grid, its handles stretch it, − and + change the files, a drag
// inside moves it, Enter places it as one undo step and Escape cancels. The
// shape frame (08-shape-system-ux.md): the knob turns it, the floating
// editor's one row flips it, who goes where holds through both until
// Recalculate (#429), and everyone else fades while it's open.
// Placed boxes (07-placed-boxes.md): a click on a member selects the whole
// box, a double click goes inside it, and a selected box's handles stretch it
// and save at once. The View tab's label forms come with it.
// The View tab keeps the toggles flipped while working; set-once looks,
// shape focus among them, live in Settings › Field (#418).
// Specs: docs/timeline/research/shapes/06-box-v1.md, 07-placed-boxes.md and
// 08-shape-system-ux.md.

// Eight trumpets scattered, all in view, on three pages.
const HOME: SeedPosition[] = [
    [1, 500, 300],
    [2, 600, 350],
    [3, 700, 280],
    [4, 800, 400],
    [5, 520, 450],
    [6, 640, 470],
    [7, 760, 430],
    [8, 880, 500],
];
const ALL = HOME.map(([id]) => id);

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
        positions: [HOME, HOME, HOME],
    }),
    // The time-stretch worklet (#216) can't load in the harness (see props.spec.mts)
    allowedPageErrors: [/Audio worklet error/],
});

type Point = { x: number; y: number };

const asPositions = (rows: readonly SeedPosition[]): Position[] =>
    rows.map(([id, x, y]) => ({ id, x, y }));

/** Where field point `p` is drawn in the viewport, from where the marchers are drawn. */
async function toScreen(page: Page, p: Point): Promise<Point> {
    const [marcher] = await drawnMarchers(page);
    const { zoom } = (await readField(page)).viewport;
    return {
        x: marcher.screen.x + (p.x - marcher.x) * zoom,
        y: marcher.screen.y + (p.y - marcher.y) * zoom,
    };
}

/**
 * What the shape tool draws once its spots have settled: after a change the marchers glide to
 * their new spots for about 150 ms (#387), so this waits for the glide to land
 */
async function shapeOverlay(page: Page): Promise<FieldTestShapeOverlay | null> {
    await page.waitForFunction(
        () => window.fieldTest!.shapeOverlay!()?.gliding !== true,
    );
    return page.evaluate(() => window.fieldTest!.shapeOverlay!());
}

const placedBoxes = (page: Page): Promise<FieldTestPlacedBox[]> =>
    page.evaluate(() => window.fieldTest!.placedBoxes!());

/** The floating editor's numbers: "4 × 2 · 2 × 2 steps" */
async function readout(page: Page): Promise<string> {
    const bar = page.getByTestId("shape-tool-readout");
    const size = await bar.getByTestId("shape-editor-size").innerText();
    const across = await bar.getByTestId("shape-editor-across").innerText();
    const deep = await bar.getByTestId("shape-editor-deep").innerText();
    return `${size} · ${across} × ${deep} steps`;
}

/** Presses at `from`, drags to `to` in `steps` moves and releases; `beforeRelease` runs with the button down. */
async function drag(
    page: Page,
    from: Point,
    to: Point,
    {
        steps = 12,
        beforeRelease,
    }: { steps?: number; beforeRelease?: () => Promise<unknown> } = {},
) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps });
    await beforeRelease?.();
    await page.mouse.up();
}

/** How many undo steps the show has. */
const undoSteps = async (show: Show) => {
    const [row] = await show.query<{ count: number }>(
        "SELECT COUNT(DISTINCT history_group) AS count FROM history_undo",
    );
    return row.count;
};

async function selectAll(page: Page) {
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
}

/** Positions are saved to three decimals. */
const CLOSE = 1e-3;

/** Whether `v` is on the half-step grid from `origin`. */
const onHalfSteps = (v: number, origin: number, step: number) =>
    Math.abs(v - origin - Math.round((v - origin) / (step / 2)) * (step / 2)) <
    CLOSE;

/**
 * Fills the open or selected shape in `mode` from the floating editor's mode menu (#435), and
 * waits for the menu to close.
 */
async function pickMode(page: Page, mode: "files" | "outline" | "spread") {
    await page.getByTestId("shape-mode-menu").click();
    await page.getByTestId(`shape-mode-${mode}`).click();
    await expect(page.getByTestId("shape-mode-menu-content")).toBeHidden();
}

/** The mode menu's names, read with the menu opened and closed again */
async function modeNames(page: Page): Promise<string[]> {
    await page.getByTestId("shape-mode-menu").click();
    const rows = page.getByRole("menuitemradio");
    await expect(rows.first()).toBeVisible();
    const names = await rows.allInnerTexts();
    await page.getByTestId("shape-mode-menu").click();
    await expect(page.getByTestId("shape-mode-menu-content")).toBeHidden();
    return names.map((n) => n.trim());
}

/**
 * Opens the box tool on every marcher and draws a box 10 steps wide and 6
 * deep, its back-left corner 15 steps left of center front and 25 back.
 * Returns the corners pressed and released, in field units.
 */
async function drawBox(show: Show) {
    const { page } = show;
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    await selectAll(page);
    await page.keyboard.press("b");
    await expect(page.getByTestId("shape-tool-hint")).toBeVisible();
    const pressed = { x: cf.x - 15 * S, y: cf.y - 25 * S };
    const released = { x: cf.x - 5 * S, y: cf.y - 19 * S };
    await drag(
        page,
        await toScreen(page, pressed),
        await toScreen(page, released),
    );
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();
    await editorSettled(page);
    return { grid, pressed, released };
}

/**
 * Waits for the floating editor to stop springing to its place: just after a draw it passes over
 * the box's bottom handles on the way, and a press there would land on it
 */
async function editorSettled(page: Page) {
    const bar = page.getByTestId("shape-tool-readout-bar");
    let last = "";
    await expect
        .poll(async () => {
            const now = JSON.stringify(await bar.boundingBox());
            const still = now === last;
            last = now;
            return still;
        })
        .toBe(true);
}

/**
 * Turns on the open shape's pathways, off by default (#403), for scenarios that read the walks.
 * The setting reloads the app, and the marchers are drawn a little after the field is back: wait
 * for them, or Ctrl/Cmd+A right after selects nobody
 */
async function showPathways(show: Show) {
    await setUiSettings(show.page, { shapeWalks: true });
    await expectCanvasMatchesShow(show);
}

test.beforeEach(async ({ show }) => {
    await expectCanvasMatchesShow(show);
});

test("B opens the box tool, and a drag draws a box edge to edge on half steps, moving nobody yet", async ({
    show,
}) => {
    const { page } = show;
    await showPathways(show);
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    await selectAll(page);
    await page.keyboard.press("b");
    await expect(page.getByTestId("shape-tool-hint")).toBeVisible();
    expect((await readField(page)).activeGesture).toBe("shape");
    // The tool has its own handles: the selection box has none
    expect((await readField(page)).handles).toBeNull();

    const pressed = { x: cf.x - 15 * S, y: cf.y - 25 * S };
    let midDrag: FieldTestShapeOverlay | null = null;
    await drag(
        page,
        await toScreen(page, pressed),
        await toScreen(page, { x: cf.x - 5 * S, y: cf.y - 19 * S }),
        {
            beforeRelease: async () => {
                midDrag = await shapeOverlay(page);
            },
        },
    );
    // During the drag: ghost spots only, no walks, nobody moved
    expect(midDrag!.spots).toHaveLength(ALL.length);
    expect(midDrag!.walks).toEqual([]);

    const drawn = (await shapeOverlay(page))!;
    expect(drawn.outline).toHaveLength(4);
    expect(drawn.spots).toHaveLength(ALL.length);
    // Walks show once the drag ends: one per marcher
    expect(drawn.walks).toHaveLength(ALL.length);
    for (const spot of drawn.spots) {
        expect(onHalfSteps(spot.x, cf.x, S)).toBe(true);
        expect(onHalfSteps(spot.y, cf.y, S)).toBe(true);
    }
    // Edge to edge: marchers stand on the edges through the corner pressed
    expect(drawn.spots.some((p) => Math.abs(p.x - pressed.x) < CLOSE)).toBe(
        true,
    );
    expect(drawn.spots.some((p) => Math.abs(p.y - pressed.y) < CLOSE)).toBe(
        true,
    );
    // Eight marchers split evenly: 4 × 2
    expect(await readout(page)).toMatch(/^4 × 2 · /);
    // Nobody has moved yet, and the selection is as it was
    expect(await savedPositions(show, 0)).toEqual(asPositions(HOME));
    expect((await readField(page)).selection).toEqual(ALL);
});

test("change: with Alt held, a drag draws the box from its center: the press is its middle, the pointer a corner", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    await selectAll(page);
    await page.keyboard.press("b");
    await expect(page.getByTestId("shape-tool-hint")).toBeVisible();

    const pressed = { x: cf.x - 15 * S, y: cf.y - 25 * S };
    await page.keyboard.down("Alt");
    await drag(
        page,
        await toScreen(page, pressed),
        await toScreen(page, { x: pressed.x + 5 * S, y: pressed.y + 3 * S }),
    );
    await page.keyboard.up("Alt");

    const drawn = (await shapeOverlay(page))!;
    expect(drawn.spots).toHaveLength(ALL.length);
    for (const spot of drawn.spots) {
        expect(onHalfSteps(spot.x, cf.x, S)).toBe(true);
        expect(onHalfSteps(spot.y, cf.y, S)).toBe(true);
    }
    // Grown both ways from the press: 10 steps wide and 6 deep, as the drag corner to corner
    // draws, centered within a quarter step (an even count stays on the half steps)
    const xs = drawn.spots.map((p) => p.x);
    const ys = drawn.spots.map((p) => p.y);
    const middle = {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
    expect(Math.abs(middle.x - pressed.x)).toBeLessThanOrEqual(S / 4 + CLOSE);
    expect(Math.abs(middle.y - pressed.y)).toBeLessThanOrEqual(S / 4 + CLOSE);
    expect(Math.min(...xs)).toBeLessThan(pressed.x - 4 * S);
    expect(Math.min(...ys)).toBeLessThan(pressed.y - 2 * S);
    expect(await readout(page)).toMatch(/^4 × 2 · /);
    expect(await savedPositions(show, 0)).toEqual(asPositions(HOME));
});

test("handles stretch the intervals with files and ranks fixed, + adds a file, and a drag inside moves the box", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    const before = await readout(page);

    // The far corner's handle: the one farthest down and right on screen
    const handles = (await shapeOverlay(page))!.handles;
    const se = handles.reduce((a, b) => (b.x + b.y > a.x + a.y ? b : a));
    await drag(page, se, { x: se.x + 60, y: se.y + 30 });
    const stretched = await readout(page);
    expect(stretched.split(" · ")[0]).toBe(before.split(" · ")[0]);
    expect(stretched).not.toBe(before);

    await page.getByRole("button", { name: "One more across" }).click();
    await expect.poll(() => readout(page)).toMatch(/^5 × 2 · /);
    await page.getByRole("button", { name: "One fewer across" }).click();
    await expect.poll(() => readout(page)).toMatch(/^4 × 2 · /);

    const spotsBefore = (await shapeOverlay(page))!.spots;
    const xs = spotsBefore.map((p) => p.x);
    const ys = spotsBefore.map((p) => p.y);
    const inside = await toScreen(page, {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
    });
    await drag(page, inside, { x: inside.x - 80, y: inside.y + 40 });
    const spotsAfter = (await shapeOverlay(page))!.spots;
    const dx = spotsAfter[0].x - spotsBefore[0].x;
    const dy = spotsAfter[0].y - spotsBefore[0].y;
    expect(dx).toBeLessThan(0);
    expect(dy).toBeGreaterThan(0);
    // The whole box moved together
    spotsAfter.forEach((p, i) => {
        expect(p.x - spotsBefore[i].x).toBeCloseTo(dx, 6);
        expect(p.y - spotsBefore[i].y).toBeCloseTo(dy, 6);
    });
    expect(await savedPositions(show, 0)).toEqual(asPositions(HOME));
});

test("change: the knob turns the box and the editor flips it, each marcher keeping their spot, and the rest fade", async ({
    show,
}) => {
    const { page } = show;
    await showPathways(show);
    const { grid } = await drawBox(show);
    let overlay = (await shapeOverlay(page))!;
    expect(overlay.stage).toBe("open");
    // Eight marchers: each spot says who stands there
    expect([...overlay.labels].sort()).toEqual(
        ALL.map((id) => `T${id}`).sort(),
    );
    const before = overlay.walks;

    // Drag the knob a quarter turn clockwise around the pivot: the box's
    // center by default
    const xs0 = before.map((w) => w.to.x);
    const ys0 = before.map((w) => w.to.y);
    const pivot = {
        x: (Math.min(...xs0) + Math.max(...xs0)) / 2,
        y: (Math.min(...ys0) + Math.max(...ys0)) / 2,
    };
    const pivotScreen = await toScreen(page, pivot);
    const knob = overlay.knob!;
    const v = { x: knob.x - pivotScreen.x, y: knob.y - pivotScreen.y };
    await drag(
        page,
        knob,
        { x: pivotScreen.x - v.y, y: pivotScreen.y + v.x },
        { steps: 20 },
    );
    overlay = (await shapeOverlay(page))!;
    // Everyone keeps their own spot: each walk's end turned 90° around the
    // pivot. A quarter turn lands back on the half-step grid, which can shift
    // the box by up to a quarter step.
    const slack = grid.pixelsPerStep / 4 + 1;
    overlay.walks.forEach((w, i) => {
        const was = before[i].to;
        expect(w.from).toEqual(before[i].from);
        expect(
            Math.abs(w.to.x - (pivot.x - (was.y - pivot.y))),
        ).toBeLessThanOrEqual(slack);
        expect(
            Math.abs(w.to.y - (pivot.y + (was.x - pivot.x))),
        ).toBeLessThanOrEqual(slack);
    });
    // The numbers follow the field: 4 × 2 turned a quarter reads 2 × 4
    expect(await readout(page)).toMatch(/^2 × 4 · /);

    // Flip side to side: mirrored about the center's line, same marchers
    const turned = overlay.walks;
    // The quarter turn may have moved the center a little back onto the grid
    const xs1 = turned.map((w) => w.to.x);
    const turnedMid = (Math.min(...xs1) + Math.max(...xs1)) / 2;
    await page.getByTestId("shape-editor-flip-across").click();
    // Those on the center's line stay; everyone else crosses to the other side
    await expect
        .poll(async () =>
            (await shapeOverlay(page))!.walks.some(
                (w, i) => Math.abs(w.to.x - turned[i].to.x) > 1,
            ),
        )
        .toBe(true);
    const flipped = (await shapeOverlay(page))!.walks;
    flipped.forEach((w, i) => {
        expect(
            Math.abs(w.to.x - (2 * turnedMid - turned[i].to.x)),
        ).toBeLessThanOrEqual(slack);
        expect(w.to.y).toBeCloseTo(turned[i].to.y, 3);
    });
    // Who goes where was kept, so it can be worked out again (#429)
    await expect(page.getByTestId("shape-editor-recalculate")).toBeEnabled();

    // Nobody moves until Place. Enter still places after a click on the
    // editor's buttons: they don't keep the focus
    expect(await savedPositions(show, 0)).toEqual(asPositions(HOME));
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    await expect
        .poll(async () =>
            (await savedPositions(show, 0)).map((p) => {
                const w = flipped[ALL.indexOf(p.id)];
                return Math.hypot(w.to.x - p.x, w.to.y - p.y) < CLOSE;
            }),
        )
        .toEqual(ALL.map(() => true));
});

test("change: one row with no ⋯; after a move and a quarter turn, Recalculate works out who goes where again as one undo step (#429)", async ({
    show,
}) => {
    const { page } = show;
    await showPathways(show);
    await drawBox(show);
    const recalculate = page.getByTestId("shape-editor-recalculate");
    // Everything is on the one row: no ⋯, and the free turn is apart from ↻90
    await expect(page.getByTestId("shape-editor-more")).toHaveCount(0);
    for (const id of [
        "shape-editor-quarter-turn",
        "shape-editor-rotation",
        "shape-editor-flip-across",
        "shape-editor-flip-deep",
        "shape-editor-save",
    ])
        await expect(page.getByTestId(id)).toBeVisible();
    await expect(page.getByTestId("shape-editor-order")).toHaveCount(0);
    // The app's own tooltips, not a browser title
    const quarter = page.getByTestId("shape-editor-quarter-turn");
    await expect(quarter).not.toHaveAttribute("title", /./);
    await quarter.hover();
    await expect(page.getByRole("tooltip")).toContainText("Turn 90° clockwise");
    // Just drawn, it's least travel already, and its tooltip says so
    await expect(recalculate).toBeDisabled();
    await expect(recalculate).toHaveText("");
    await recalculate.hover();
    await expect(page.getByRole("tooltip")).toContainText(
        "already least travel",
    );

    // Move it, then turn it a quarter: everyone keeps their spot
    const spots = (await shapeOverlay(page))!.spots;
    const inside = await toScreen(page, {
        x: spots.reduce((a, p) => a + p.x, 0) / spots.length,
        y: spots.reduce((a, p) => a + p.y, 0) / spots.length,
    });
    await drag(page, inside, { x: inside.x + 120, y: inside.y + 60 });
    await page.getByTestId("shape-editor-quarter-turn").click();
    await expect.poll(() => readout(page)).toMatch(/^2 × 4 · /);
    // ↻ adds a quarter to the degrees beside it
    await expect(page.getByTestId("shape-editor-rotation")).toHaveText("90°");
    const kept = (await shapeOverlay(page))!.walks;
    await expect(recalculate).toBeEnabled();
    // Its word shows only when it would change something, and it flashes the accent as it
    // becomes available, then settles
    await expect(recalculate).toHaveText("Recalculate");
    await expect(recalculate.locator("[data-flashing]")).toHaveCount(1);
    await expect(recalculate.locator("[data-flashing]")).toHaveCount(0, {
        timeout: 3000,
    });

    await recalculate.click();
    // The same spots, shared out again: someone goes somewhere else
    await expect
        .poll(async () =>
            (await shapeOverlay(page))!.walks.some(
                (w, i) =>
                    Math.hypot(w.to.x - kept[i].to.x, w.to.y - kept[i].to.y) >
                    1,
            ),
        )
        .toBe(true);
    const again = (await shapeOverlay(page))!.walks;
    const key = (p: Point) => `${Math.round(p.x)},${Math.round(p.y)}`;
    expect(again.map((w) => key(w.to)).sort()).toEqual(
        kept.map((w) => key(w.to)).sort(),
    );
    // Less travel than before, and nothing more to change
    const travel = (walks: typeof kept) =>
        walks.reduce(
            (a, w) => a + (w.to.x - w.from.x) ** 2 + (w.to.y - w.from.y) ** 2,
            0,
        );
    expect(travel(again)).toBeLessThan(travel(kept));
    await expect(recalculate).toBeDisabled();

    // One undo step: back to who went where after the turn
    await page.keyboard.press("ControlOrMeta+z");
    await expect
        .poll(async () =>
            (await shapeOverlay(page))!.walks.map((w) => key(w.to)),
        )
        .toEqual(kept.map((w) => key(w.to)));
    await expect(recalculate).toBeEnabled();
});

test("change: with less motion asked for, Recalculate's word appears at once, without the spring (#429)", async ({
    show,
}) => {
    const { page } = show;
    await page.emulateMedia({ reducedMotion: "reduce" });
    await drawBox(show);
    await page.getByTestId("shape-editor-quarter-turn").click();
    const word = page
        .getByTestId("shape-editor-recalculate")
        .getByText("Recalculate");
    await expect(word).toBeVisible();
    // Full width and opacity straight away, not part way through a spring
    expect(
        await word.evaluate((el) => ({
            maxWidth: el.style.maxWidth,
            opacity: el.style.opacity,
        })),
    ).toEqual({ maxWidth: "7em", opacity: "1" });
});

test("change: with a shape open, Alt+R turns it 90°, Alt+F and Alt+Shift+F flip it, and Shift+R recalculates who goes where (#429)", async ({
    show,
}) => {
    const { page } = show;
    await showPathways(show);
    await drawBox(show);
    const rotation = page.getByTestId("shape-editor-rotation");
    const recalculate = page.getByTestId("shape-editor-recalculate");
    const walks = async () => (await shapeOverlay(page))!.walks;
    // Nobody is in a text field: the keys go to the shape
    await page.mouse.move(5, 300);

    // Two quick presses add up, each from the shape as it is by then (review)
    await page.keyboard.press("Alt+R");
    await page.keyboard.press("Alt+R");
    await expect(rotation).toHaveText("180°");
    await page.keyboard.press("Alt+R");
    await expect(rotation).toHaveText("270°");
    await expect.poll(() => readout(page)).toMatch(/^2 × 4 · /);

    const turned = await walks();
    await page.keyboard.press("Alt+F");
    // Mirrored side to side: someone's spot moved across, nobody's moved up or down
    await expect
        .poll(async () =>
            (await walks()).some(
                (w, i) => Math.abs(w.to.x - turned[i].to.x) > 1,
            ),
        )
        .toBe(true);
    (await walks()).forEach((w, i) =>
        expect(w.to.y).toBeCloseTo(turned[i].to.y, 3),
    );
    const across = await walks();
    await page.keyboard.press("Alt+Shift+F");
    await expect
        .poll(async () =>
            (await walks()).some(
                (w, i) => Math.abs(w.to.y - across[i].to.y) > 1,
            ),
        )
        .toBe(true);

    // The flips kept who goes where; Shift+R works it out again, as the button does
    await expect(recalculate).toBeEnabled();
    const kept = await walks();
    await page.keyboard.press("Shift+R");
    await expect(recalculate).toBeDisabled();
    expect(
        (await walks()).some(
            (w, i) =>
                Math.hypot(w.to.x - kept[i].to.x, w.to.y - kept[i].to.y) > 1,
        ),
    ).toBe(true);
    // Nobody moved yet: the keys edited the open shape, not the marchers
    expect(await savedPositions(show, 0)).toEqual(asPositions(HOME));

    // Its tooltip shows the keys
    await recalculate.hover();
    await expect(page.getByRole("tooltip")).toContainText("Shift");
});

test("change: on a selected placed shape, Recalculate shares its spots out again by least travel from the start flag, as one undo step (#429)", async ({
    show,
}) => {
    const { page } = show;
    await selectPage(show, "Page 2");
    await placeBox(show, 2);
    const placed = await savedPositions(show, 2);
    const t1 = await marcherScreen(page, 1);
    await page.mouse.click(t1.x, t1.y);
    await expect(page.getByTestId("placed-box-readout")).toBeVisible();
    const recalculate = page.getByTestId("shape-editor-recalculate");
    await expect(recalculate).toBeDisabled();

    // Two quick Alt+R presses on a placed shape add up, the second waiting for the first's save
    // (review): a half turn, as two undo steps
    const before = await undoSteps(show);
    await page.mouse.move(5, 300);
    await page.keyboard.press("Alt+R");
    await page.keyboard.press("Alt+R");
    await expect(page.getByTestId("shape-editor-rotation")).toHaveText("180°");
    await waitForIdle(page);
    expect(await undoSteps(show)).toBe(before + 2);
    await page.keyboard.press("ControlOrMeta+z");
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => savedPositions(show, 2)).toEqual(placed);
    await waitForIdle(page);
    await page.getByTestId("placed-box-readout").waitFor();

    // A quarter turn keeps everyone's spot
    await page.getByTestId("shape-editor-quarter-turn").click();
    await expect
        .poll(async () => (await savedPositions(show, 2)).map((p) => p.x))
        .not.toEqual(placed.map((p) => p.x));
    await waitForIdle(page);
    const turned = await savedPositions(show, 2);
    await expect(recalculate).toBeEnabled();
    const steps = await undoSteps(show);

    await recalculate.click();
    await expect.poll(() => savedPositions(show, 2)).not.toEqual(turned);
    await waitForIdle(page);
    const again = await savedPositions(show, 2);
    const key = (p: Point) => `${Math.round(p.x)},${Math.round(p.y)}`;
    // The same spots, and less travel from where everyone starts the move
    expect(again.map(key).sort()).toEqual(turned.map(key).sort());
    const travel = (ps: Position[]) =>
        ps.reduce((a, p) => {
            const [, x, y] = HOME.find(([id]) => id === p.id)!;
            return a + (p.x - x) ** 2 + (p.y - y) ** 2;
        }, 0);
    expect(travel(again)).toBeLessThan(travel(turned));
    expect(await undoSteps(show)).toBe(steps + 1);
    await expect(recalculate).toBeDisabled();

    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => savedPositions(show, 2)).toEqual(turned);
});

test("change: while a box is open everyone else fades, and nobody once it closes", async ({
    show,
}) => {
    const { page } = show;
    const dimmedIds = async () =>
        (await drawnMarchers(page)).filter((m) => m.dimmed).map((m) => m.id);
    // Box only some of them
    await page.mouse.click(...(await screenOf(page, 1)));
    await page.keyboard.down("Shift");
    await page.mouse.click(...(await screenOf(page, 2)));
    await page.keyboard.up("Shift");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([1, 2]);
    await page.keyboard.press("b");
    await expect.poll(dimmedIds).toEqual([3, 4, 5, 6, 7, 8]);
    await page.keyboard.press("Escape");
    await expect.poll(dimmedIds).toEqual([]);
});

test("change: the View tab keeps only labels, paths, shapes and 3D; the rest moved to Settings › Field", async ({
    show,
}) => {
    const { page } = show;
    await page.getByRole("tab", { name: "View" }).click();
    // Nothing but these: grid lines, half lines, label size and position,
    // step-size warnings and shape focus moved to Settings
    await expect(page.getByRole("tabpanel", { name: "View" }))
        .toMatchAriaSnapshot(`
      - tabpanel "View":
        - /children: equal
        - group:
          - /children: equal
          - text: Labels
          - combobox "Labels"
          - button "Next paths":
            - text: Next paths
            - img
          - text: Shapes
          - combobox "Shapes"
        - group:
          - /children: equal
          - button "Open 3D View":
            - text: Open 3D View
            - img
    `);

    const settings = await openSettings(page, "Field");
    for (const name of ["Grid lines", "Half lines", "Step size warnings"])
        await expect(settings.getByRole("switch", { name })).toBeVisible();
    for (const name of ["Normal", "Above the dot", "Fade the rest"])
        await expect(settings.getByRole("radio", { name })).toBeChecked();
});

test("change: Settings › Field › While shaping changes who fades on the open field at once", async ({
    show,
}) => {
    const { page } = show;
    const settings = await openSettings(page, "Field");
    const dimmedIds = async () =>
        (await drawnMarchers(page)).filter((m) => m.dimmed).map((m) => m.id);
    await page.bringToFront();
    await page.mouse.click(...(await screenOf(page, 1)));
    await page.keyboard.down("Shift");
    await page.mouse.click(...(await screenOf(page, 2)));
    await page.keyboard.up("Shift");
    await page.keyboard.press("b");
    await expect.poll(dimmedIds).toEqual([3, 4, 5, 6, 7, 8]);

    // Only while a drag draws it: an open box at rest fades nobody
    await settings
        .getByRole("radio", { name: "Fade only while drawing" })
        .click();
    await expect.poll(dimmedIds).toEqual([]);
    await settings.getByRole("radio", { name: "Fade the rest" }).click();
    await expect.poll(dimmedIds).toEqual([3, 4, 5, 6, 7, 8]);
});

test("change: Settings › Field › Grid lines redraws the open field at once", async ({
    show,
}) => {
    const { page } = show;
    const field = () => page.getByTestId("fieldCanvas").first().screenshot();
    const settings = await openSettings(page, "Field");
    await waitForIdle(page);
    const withGrid = await field();
    await settings.getByRole("switch", { name: "Grid lines" }).click();
    await expect.poll(async () => (await field()).equals(withGrid)).toBe(false);
});

test("change: an open box fades everyone else, still readable, and once drawn hides its own marchers' dots for its spots and start rings; placing or Escape brings them back", async ({
    show,
}) => {
    const { page } = show;
    const looks = async () =>
        Object.fromEntries(
            (await drawnMarchers(page)).map((m) => [
                m.id,
                `${m.opacity === 1 ? "full" : m.opacity === 0 ? "hidden" : "faint"}${m.labelShown ? "" : " no-label"}`,
            ]),
        );
    const expected = (mine: string, others: string) =>
        Object.fromEntries(ALL.map((id) => [id, id <= 2 ? mine : others]));
    const boxTwo = async () => {
        await page.mouse.click(...(await screenOf(page, 1)));
        await page.keyboard.down("Shift");
        await page.mouse.click(...(await screenOf(page, 2)));
        await page.keyboard.up("Shift");
        await expect
            .poll(async () => (await readField(page)).selection)
            .toEqual([1, 2]);
        await page.keyboard.press("b");
        // Armed, nothing drawn: the two still show where they stand
        await expect.poll(looks).toEqual(expected("full", "faint"));
        const grid = await fieldGrid(show);
        const S = grid.pixelsPerStep;
        const cf = grid.centerFront;
        await drag(
            page,
            await toScreen(page, { x: cf.x - 15 * S, y: cf.y - 25 * S }),
            await toScreen(page, { x: cf.x - 5 * S, y: cf.y - 23 * S }),
        );
        await expect(page.getByTestId("shape-tool-readout")).toBeVisible();
    };

    await boxTwo();
    await expect.poll(looks).toEqual(expected("hidden no-label", "faint"));
    // Where they come from is the start rings, pathways or not; pathways add the walks
    expect((await shapeOverlay(page))!.rings).toHaveLength(2);
    expect((await shapeOverlay(page))!.walks).toHaveLength(0);
    await page.getByTestId("shape-editor-pathways").click();
    await expect
        .poll(async () => (await shapeOverlay(page))!.walks)
        .toHaveLength(2);
    expect((await shapeOverlay(page))!.rings).toHaveLength(2);
    await page.keyboard.press("Escape");
    await expect.poll(looks).toEqual(expected("full", "full"));

    await boxTwo();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    await expect.poll(looks).toEqual(expected("full", "full"));
});

test("change: the chip and the plain selection's Transform section draw their direction marks as icons, never as text a font may make an emoji", async ({
    show,
}) => {
    const { page } = show;
    const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
    await drawBox(show);
    const chip = page.getByTestId("shape-tool-readout");
    await expect(chip.locator('[data-glyph="across"]')).toHaveCount(1);
    await expect(chip.locator('[data-glyph="deep"]')).toHaveCount(1);
    expect(await chip.innerText()).not.toMatch(PICTOGRAPHIC);
    // A plain selection's Transform section
    await page.keyboard.press("Escape");
    await selectAll(page);
    const transform = page.getByTestId("transform-section");
    await expect(transform).toBeVisible();
    expect(await transform.innerText()).not.toMatch(PICTOGRAPHIC);
    await expect(transform.locator("[data-glyph]")).not.toHaveCount(0);
});

test("change: start positions show as faint dots in the marchers' own color", async ({
    show,
}) => {
    const { page } = show;
    await page.mouse.click(...(await screenOf(page, 1)));
    await page.keyboard.down("Shift");
    await page.mouse.click(...(await screenOf(page, 2)));
    await page.keyboard.up("Shift");
    await page.keyboard.press("b");
    const ghosts = page.getByTestId("fieldShapeStartGhost");
    await expect(ghosts).toHaveCount(2);
    const fill = (await drawnMarchers(page)).find((m) => m.id === 1)!.look.fill;
    await expect(ghosts.first()).toHaveAttribute("fill", fill!);
});

test("change: the floating editor is a solid surface, an on toggle is the accent on a light accent tint, and the drag readout is a solid pill", async ({
    show,
}) => {
    const { page } = show;
    /** A computed CSS color's alpha: 1 for a solid color */
    const alpha = (color: string) => {
        const parts = color.match(/[\d.]+/g)!.map(Number);
        return parts.length > 3 ? parts[3] : 1;
    };
    const background = (testId: string) =>
        page
            .getByTestId(testId)
            .evaluate((el) => getComputedStyle(el).backgroundColor);
    await drawBox(show);
    expect(alpha(await background("shape-tool-readout-bar"))).toBe(1);

    const pathways = page.getByTestId("shape-editor-pathways");
    const off = await background("shape-editor-pathways");
    await pathways.click();
    await expect(pathways).toHaveAttribute("aria-pressed", "true");
    // On: the icon in the accent, on a light tint of it rather than a solid fill
    const [tint, accent] = await page.evaluate(() =>
        ["bg-accent/15", "text-accent"].map((className) => {
            const probe = document.createElement("div");
            probe.className = className;
            document.body.append(probe);
            const style = getComputedStyle(probe);
            const color =
                className === "text-accent"
                    ? style.color
                    : style.backgroundColor;
            probe.remove();
            return color;
        }),
    );
    expect(await background("shape-editor-pathways")).toBe(tint);
    expect(alpha(tint)).toBeLessThan(0.3);
    expect(await pathways.evaluate((el) => getComputedStyle(el).color)).toBe(
        accent,
    );
    expect(off).not.toBe(tint);

    // A handle drag shows the spacing readout by the pointer
    const handle = (await shapeOverlay(page))!.handles.at(-1)!;
    await drag(
        page,
        handle,
        { x: handle.x + 45, y: handle.y + 25 },
        {
            beforeRelease: async () => {
                const tip = page.getByTestId("fieldShapeTip");
                await expect(tip).toBeVisible();
                expect(alpha(await background("fieldShapeTip"))).toBe(1);
                await expect(tip.locator("[data-glyph]")).not.toHaveCount(0);
            },
        },
    );
});

/** How opaque the open shape's floating editor is drawn, as a whole */
const editorOpacity = (page: Page) =>
    page
        .getByTestId("shape-tool-readout")
        .evaluate((el) => Number(getComputedStyle(el).opacity));

test("change: the floating editor fades with the pointer away, and is solid over the box, over the editor, with focus inside it and with its menu open", async ({
    show,
}) => {
    const { page } = show;
    const { pressed, released } = await drawBox(show);
    await page.mouse.move(5, 500);
    await expect.poll(() => editorOpacity(page)).toBeLessThan(0.6);

    // Over the box on the field
    const middle = await toScreen(page, {
        x: (pressed.x + released.x) / 2,
        y: (pressed.y + released.y) / 2,
    });
    await page.mouse.move(middle.x, middle.y);
    // Solid with no wait: just its 120 ms fade in
    await expect.poll(() => editorOpacity(page), { timeout: 400 }).toBe(1);
    // It waits half a second before fading (owner): still solid a moment after leaving
    await page.mouse.move(5, 500);
    await page.waitForTimeout(250);
    expect(await editorOpacity(page)).toBe(1);
    await expect.poll(() => editorOpacity(page)).toBeLessThan(0.6);

    // Back within the wait: nothing visible happens
    await page.mouse.move(middle.x, middle.y);
    await expect.poll(() => editorOpacity(page), { timeout: 400 }).toBe(1);
    await page.mouse.move(5, 500);
    await page.waitForTimeout(250);
    await page.mouse.move(middle.x, middle.y);
    await page.waitForTimeout(500);
    expect(await editorOpacity(page)).toBe(1);
    await page.mouse.move(5, 500);
    await expect.poll(() => editorOpacity(page)).toBeLessThan(0.6);

    // Over the editor
    await page.getByTestId("shape-tool-readout-bar").hover();
    await expect.poll(() => editorOpacity(page)).toBe(1);
    await page.mouse.move(5, 500);
    await expect.poll(() => editorOpacity(page)).toBeLessThan(0.6);

    // Typing a number keeps focus inside it
    await page.getByTestId("shape-editor-across").click();
    await expect(page.getByTestId("shape-editor-across-input")).toBeFocused();
    await page.mouse.move(5, 500);
    await expect.poll(() => editorOpacity(page)).toBe(1);
    await page.keyboard.press("Escape");
    await expect.poll(() => editorOpacity(page)).toBeLessThan(0.6);

    // Its layout menu open; once a layout is picked, the editor fades again with the pointer
    // away, though the menu hands focus back to its button
    await page.evaluate(() =>
        localStorage.removeItem("openmarch:shapeLastLayout"),
    );
    await page.getByTestId("shape-layout-menu").click();
    const menu = page.getByTestId("shape-layout-menu-content");
    await expect(menu).toBeVisible();
    await page.mouse.move(5, 500);
    await expect.poll(() => editorOpacity(page)).toBe(1);
    await menu.getByTestId("shape-layout-menu-row-rounded").hover();
    await menu.getByTestId("shape-layout-menu-version-rounded-0").click();
    await expect(menu).toBeHidden();
    await page.mouse.move(5, 500);
    await expect.poll(() => editorOpacity(page)).toBeLessThan(0.6);
});

test("change: turned 90°, 180° or 270°, the knob is never under the floating editor, and a press on it still turns the box (#485)", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    const editor = page.getByTestId("shape-tool-readout");
    for (const degrees of [90, 180, 270]) {
        await editor.getByTestId("shape-editor-rotation").click();
        await page
            .getByTestId("shape-editor-rotation-input")
            .fill(`${degrees}`);
        await page.getByTestId("shape-editor-rotation-input").press("Enter");
        await expect(editor.getByTestId("shape-editor-rotation")).toHaveText(
            `${degrees}°`,
        );
        // The editor springs to its place
        await page.mouse.move(5, 300);
        let knob = (await shapeOverlay(page))!.knob!;
        await expect
            .poll(async () => {
                knob = (await shapeOverlay(page))!.knob!;
                const r = (await editor.boundingBox())!;
                const pad = 6;
                return (
                    knob.x < r.x - pad ||
                    knob.x > r.x + r.width + pad ||
                    knob.y < r.y - pad ||
                    knob.y > r.y + r.height + pad
                );
            }, `the knob is clear of the editor at ${degrees}°`)
            .toBe(true);
        // What's under the knob is the field, not the editor
        const hit = await page.evaluate(
            ({ x, y }) =>
                document.elementFromPoint(x, y)?.closest("[data-shape-editor]")
                    ? "editor"
                    : "field",
            knob,
        );
        expect(hit).toBe("field");
    }
    // At 270° a drag on the knob turns it on round
    const center = (await shapeOverlay(page))!.centerDot!;
    const knob = (await shapeOverlay(page))!.knob!;
    const v = { x: knob.x - center.x, y: knob.y - center.y };
    await drag(page, knob, { x: center.x - v.y, y: center.y + v.x });
    await expect(editor.getByTestId("shape-editor-rotation")).toHaveText("0°");
});

/**
 * Turns the Snap toggle off with the floating editor's Snap button (modifier roles, version A),
 * which then shows pressed. Never saved, so the next test starts with it on.
 */
async function turnSnapOff(page: Page) {
    const snap = page.getByTestId("shape-editor-snap");
    await snap.click();
    await expect(snap).toHaveAttribute("aria-pressed", "true");
}

test("change: the knob turns in 15° steps, as the field's rotate handle does, in whole degrees with Shift (fine), and freely with the Snap toggle off", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    const rotation = page.getByTestId("shape-editor-rotation");
    /** Drags the knob `degrees` clockwise around the box's center dot */
    const turnKnob = async (degrees: number) => {
        const overlay = (await shapeOverlay(page))!;
        const knob = overlay.knob!;
        const c = overlay.centerDot!;
        const a = (degrees * Math.PI) / 180;
        const v = { x: knob.x - c.x, y: knob.y - c.y };
        await drag(
            page,
            knob,
            {
                x: c.x + v.x * Math.cos(a) - v.y * Math.sin(a),
                y: c.y + v.x * Math.sin(a) + v.y * Math.cos(a),
            },
            { steps: 20 },
        );
    };
    const degreesShown = async () =>
        Number((await rotation.innerText()).replace("°", ""));

    await turnKnob(37);
    await expect.poll(degreesShown).toBe(30);

    await page.keyboard.down("Shift");
    await turnKnob(37);
    await page.keyboard.up("Shift");
    const fine = await degreesShown();
    expect(Number.isInteger(fine)).toBe(true);
    expect(fine % 15).not.toBe(0);
    expect(fine).toBeGreaterThan(55);
    expect(fine).toBeLessThan(80);

    // With the Snap toggle off (the editor's Snap button): free of the 15° steps
    await turnSnapOff(page);
    await turnKnob(37);
    const free = await degreesShown();
    expect(free % 15).not.toBe(0);
    expect(free).toBeGreaterThan(fine + 25);
    expect(free).toBeLessThan(fine + 50);

    // Typed, a rotation stays as typed
    await rotation.click();
    await page.keyboard.type("37");
    await page.keyboard.press("Enter");
    await expect(rotation).toHaveText("37°");
});

test("change: the open box's controls fade while the pointer is away from it, and come back over it or a handle", async ({
    show,
}) => {
    const { page } = show;
    const { grid } = await drawBox(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    const calm = async () => (await shapeOverlay(page))!.calm;
    const handleOpacity = () =>
        page
            .getByTestId("fieldShapeHandle")
            .first()
            .evaluate((el) => getComputedStyle(el).opacity);
    const boxFill = () =>
        page
            .getByTestId("fieldShapeMode")
            .locator("polygon")
            .first()
            .getAttribute("fill");

    // Away from the box, on empty field: faint controls and no fill, the spots as they were
    const away = await toScreen(page, { x: cf.x + 20 * S, y: cf.y - 5 * S });
    await page.mouse.move(away.x, away.y);
    await expect.poll(calm).toBe(true);
    await expect.poll(handleOpacity).toBe("0.25");
    await expect.poll(boxFill).toBe("none");
    expect((await shapeOverlay(page))!.spots).toHaveLength(ALL.length);

    // Over the box: full strength
    const spots = (await shapeOverlay(page))!.spots;
    const xs = spots.map((p) => p.x);
    const ys = spots.map((p) => p.y);
    const inside = await toScreen(page, {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
    });
    await page.mouse.move(inside.x, inside.y);
    await expect.poll(calm).toBe(false);
    await expect.poll(handleOpacity).toBe("1");
    await expect.poll(boxFill).not.toBe("none");

    // Away again, then over a handle
    await page.mouse.move(away.x, away.y);
    await expect.poll(calm).toBe(true);
    const [handle] = (await shapeOverlay(page))!.handles;
    await page.mouse.move(handle.x, handle.y);
    await expect.poll(calm).toBe(false);

    // Off the field (down on the timeline): faint again
    const timeline = await page.getByTestId("timeline-loop").boundingBox();
    await page.mouse.move(timeline!.x - 40, timeline!.y + 4);
    await expect.poll(calm).toBe(true);
});

test("change: the open box always shows its start rings, and starts with no walks; the floating editor's Pathways toggle shows and hides the walks", async ({
    show,
}) => {
    const { page } = show;
    const pathways = page.getByTestId("shape-editor-pathways");
    await drawBox(show);
    let overlay = (await shapeOverlay(page))!;
    expect(overlay.walks).toEqual([]);
    expect(overlay.rings).toHaveLength(ALL.length);
    expect(overlay.spots).toHaveLength(ALL.length);
    await expect(pathways).toHaveAttribute("aria-pressed", "false");

    await pathways.click();
    await expect
        .poll(async () => (await shapeOverlay(page))!.walks)
        .toHaveLength(ALL.length);
    expect((await shapeOverlay(page))!.rings).toHaveLength(ALL.length);
    await expect(pathways).toHaveAttribute("aria-pressed", "true");

    await pathways.click();
    await expect
        .poll(async () => (await shapeOverlay(page))!.walks)
        .toEqual([]);
    overlay = (await shapeOverlay(page))!;
    expect(overlay.rings).toHaveLength(ALL.length);
    await expect(pathways).toHaveAttribute("aria-pressed", "false");
});

const screenOf = async (page: Page, id: number): Promise<[number, number]> => {
    const m = (await drawnMarchers(page)).find((d) => d.id === id)!;
    return [m.screen.x, m.screen.y];
};

const toasts = (page: Page) => page.locator("[data-sonner-toast]");

/** Whether every marcher stands on page 0 on one of `spots`. */
const onSpots = async (show: Show, spots: readonly Point[]) =>
    (await savedPositions(show, 0)).every((p) =>
        spots.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < CLOSE),
    );

test("change: Escape discards an open box with no toast, and undo right after brings it back", async ({
    show,
}) => {
    const { page } = show;
    const steps = await undoSteps(show);
    await drawBox(show);
    // A change in the box's own history, which comes back too
    await page.getByRole("button", { name: "One more across" }).click();
    const numbers = await readout(page);
    const spots = (await shapeOverlay(page))!.spots;
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    await expect(toasts(page)).toHaveCount(0);

    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();
    expect(await readout(page)).toBe(numbers);
    expect((await shapeOverlay(page))!.spots).toEqual(spots);
    // The show was never touched
    expect(await savedPositions(show, 0)).toEqual(asPositions(HOME));
    expect(await undoSteps(show)).toBe(steps);
    // Undo goes on through the box's own history
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => readout(page)).not.toBe(numbers);
});

test("change: Escape while typing a number cancels only the number", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    const numbers = await readout(page);
    await page.getByTestId("shape-editor-across").click();
    await page.keyboard.type("7");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("shape-editor-across-input")).toBeHidden();
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();
    expect(await readout(page)).toBe(numbers);
    // The next Escape discards the box
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
});

// Option B (#416): moving around the timeline keeps an open shape open, tied
// to the moment it was drawn at. Away from it the shape and its editor hide
// behind a chip with Go back. Only Enter or Place places it (owner lab
// feedback): Enter and Escape act only on a shape you can see, playback and
// Visuals hide it until they end, and a new selection leaves it open.

const awayChip = (page: Page) => page.getByTestId("shape-away-chip");

/** What the open box looks like: its numbers, spots, who goes where and pivot */
async function openBox(page: Page) {
    const overlay = (await shapeOverlay(page))!;
    return {
        numbers: await readout(page),
        spots: overlay.spots,
        walks: overlay.walks,
        pivot: overlay.pivotMark,
    };
}

test("change: scrubbing, page keys and timeline clicks keep an open box open; away it hides behind a chip, and Go back shows it unchanged", async ({
    show,
}) => {
    const { page } = show;
    const steps = await undoSteps(show);
    await showPathways(show);
    await drawBox(show);
    await page.getByRole("button", { name: "One more across" }).click();
    const before = await openBox(page);

    // One beat on: the box was drawn at home
    await page.keyboard.press("Shift+E");
    await expect(awayChip(page)).toBeVisible();
    await expect(page.getByTestId("shape-away-chip-text")).toHaveText(
        "Shape open at home",
    );
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    await expect
        .poll(() => page.evaluate(() => window.fieldTest!.shapeOverlay!()))
        .toBeNull();
    // Page keys and a click on the timeline don't place it either
    await page.keyboard.press("e");
    await selectPage(show, "Page 2");
    await expect(awayChip(page)).toBeVisible();
    await waitForIdle(page);
    expect(await savedPositions(show, 0)).toEqual(asPositions(HOME));
    expect(await undoSteps(show)).toBe(steps);
    await expect(toasts(page)).toHaveCount(0);

    await awayChip(page).getByRole("button", { name: "Go back" }).click();
    await expect(awayChip(page)).toBeHidden();
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();
    expect(await openBox(page)).toEqual(before);

    // Coming back another way shows it too
    await page.keyboard.press("Shift+E");
    await expect(awayChip(page)).toBeVisible();
    await page.keyboard.press("Shift+Q");
    await expect(awayChip(page)).toBeHidden();
    expect(await openBox(page)).toEqual(before);
    expect(await undoSteps(show)).toBe(steps);
});

test("change: away from an open box, Enter and Escape leave it alone; back at its moment Enter places it as one undo step", async ({
    show,
}) => {
    const { page } = show;
    const steps = await undoSteps(show);
    await drawBox(show);
    const before = await openBox(page);
    await page.keyboard.press("Shift+E");
    await expect(awayChip(page)).toBeVisible();

    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await waitForIdle(page);
    await expect(awayChip(page)).toBeVisible();
    expect(await savedPositions(show, 0)).toEqual(asPositions(HOME));
    expect(await undoSteps(show)).toBe(steps);

    await awayChip(page).getByRole("button", { name: "Go back" }).click();
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();
    expect(await openBox(page)).toEqual(before);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    await expect.poll(() => onSpots(show, before.spots)).toBe(true);
    await waitForIdle(page);
    expect(await undoSteps(show)).toBe(steps + 1);
    await expect(toasts(page)).toHaveCount(0);
});

test("change: the away chip's Dismiss discards the waiting box with no toast, and undo right after brings it back", async ({
    show,
}) => {
    const { page } = show;
    const steps = await undoSteps(show);
    await drawBox(show);
    const before = await openBox(page);
    await page.keyboard.press("Shift+E");
    await awayChip(page).getByRole("button", { name: "Dismiss" }).click();
    await expect(awayChip(page)).toBeHidden();
    await expect(toasts(page)).toHaveCount(0);

    await page.keyboard.press("ControlOrMeta+z");
    await expect(awayChip(page)).toBeVisible();
    await awayChip(page).getByRole("button", { name: "Go back" }).click();
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();
    expect(await openBox(page)).toEqual(before);
    expect(await savedPositions(show, 0)).toEqual(asPositions(HOME));
    expect(await undoSteps(show)).toBe(steps);
});

for (const [how, start] of [
    ["B", (page: Page) => page.keyboard.press("b")],
    [
        "the Shapes tab",
        async (page: Page) => {
            await page.getByRole("tab", { name: "Shapes" }).click();
            await page.getByTestId("shapes-tab-block").click();
        },
    ],
] as const)
    test(`change: ${how} away from a waiting box starts a new one here, dismissing the old one, which undo before drawing brings back`, async ({
        show,
    }) => {
        const { page } = show;
        const steps = await undoSteps(show);
        await drawBox(show);
        const before = await openBox(page);
        await page.keyboard.press("Shift+E");
        await expect(awayChip(page)).toBeVisible();

        await start(page);
        await expect(page.getByTestId("shape-tool-hint")).toBeVisible();
        await expect(awayChip(page)).toBeHidden();
        await expect(toasts(page)).toHaveCount(0);

        // Nothing drawn yet: undo brings the waiting box back, still at home
        await page.keyboard.press("ControlOrMeta+z");
        await expect(page.getByTestId("shape-tool-hint")).toBeHidden();
        await expect(awayChip(page)).toBeVisible();

        // Start over again and draw: Enter places the new box here
        await start(page);
        const grid = await fieldGrid(show);
        const S = grid.pixelsPerStep;
        const cf = grid.centerFront;
        await drag(
            page,
            await toScreen(page, { x: cf.x + 5 * S, y: cf.y - 25 * S }),
            await toScreen(page, { x: cf.x + 15 * S, y: cf.y - 19 * S }),
        );
        await expect(page.getByTestId("shape-tool-readout")).toBeVisible();
        const { spots } = await openBox(page);
        expect(spots).not.toEqual(before.spots);
        await page.keyboard.press("Enter");
        await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
        await waitForIdle(page);
        expect(await undoSteps(show)).toBe(steps + 1);
        // The new box was placed here: the marchers stand on its spots at the playhead
        const onNewSpots = async () =>
            (await drawnMarchers(page)).every((m) =>
                spots.some((p) => Math.hypot(p.x - m.x, p.y - m.y) < 0.01),
            );
        await expect.poll(onNewSpots).toBe(true);
    });

test("change: playing hides an open box until it stops, and Visuals until the Editor is back; neither places it", async ({
    show,
}) => {
    const { page } = show;
    const steps = await undoSteps(show);
    await drawBox(show);
    const before = await openBox(page);

    await page.keyboard.press("Space");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    await expect(awayChip(page)).toBeHidden();
    // Stopping goes back to where Play was pressed: the box's moment
    await page.keyboard.press("Space");
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();
    expect(await openBox(page)).toEqual(before);

    await page.getByTestId("workspace-view-visuals").click();
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    await expect(awayChip(page)).toBeHidden();
    await page.getByTestId("workspace-view-editor").click();
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();
    expect(await openBox(page)).toEqual(before);

    await waitForIdle(page);
    expect(await savedPositions(show, 0)).toEqual(asPositions(HOME));
    expect(await undoSteps(show)).toBe(steps);
});

test("change: changing the selection leaves an open box open for its own marchers, and Enter places only them", async ({
    show,
}) => {
    const { page } = show;
    const steps = await undoSteps(show);
    // Box only the first two
    await page.mouse.click(...(await screenOf(page, 1)));
    await page.keyboard.down("Shift");
    await page.mouse.click(...(await screenOf(page, 2)));
    await page.keyboard.up("Shift");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([1, 2]);
    await page.keyboard.press("b");
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    await drag(
        page,
        await toScreen(page, { x: cf.x - 15 * S, y: cf.y - 25 * S }),
        await toScreen(page, { x: cf.x - 5 * S, y: cf.y - 23 * S }),
    );
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();
    const spots = (await shapeOverlay(page))!.spots;

    await selectAll(page);
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();
    await waitForIdle(page);
    expect(await savedPositions(show, 0)).toEqual(asPositions(HOME));
    expect((await shapeOverlay(page))!.spots).toEqual(spots);

    await page.keyboard.press("Enter");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    const placed = async () =>
        (await savedPositions(show, 0))
            .filter((p) => p.id <= 2)
            .every((p) =>
                spots.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < CLOSE),
            );
    await expect.poll(placed).toBe(true);
    await waitForIdle(page);
    // Nobody else moved
    expect((await savedPositions(show, 0)).filter((p) => p.id > 2)).toEqual(
        asPositions(HOME).filter((p) => p.id > 2),
    );
    expect(await undoSteps(show)).toBe(steps + 1);
});

test("change: the rotation is a number in ⋯ you type, and Tab goes from number to number", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    await page.getByTestId("shape-editor-rotation").click();
    await page.keyboard.type("90");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("shape-editor-rotation")).toHaveText("90°");
    // Turned a quarter, across is still side to side on the field
    await expect.poll(() => readout(page)).toMatch(/^2 × 4 · /);
    // + makes it one wider on the field
    await page.getByRole("button", { name: "One more across" }).click();
    await expect.poll(() => readout(page)).toMatch(/^3 × 3 · /);

    // Tab: from the side-to-side spacing straight into front to back
    await page.getByTestId("shape-editor-across").click();
    await page.keyboard.type("2");
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("shape-editor-deep-input")).toBeFocused();
    await page.keyboard.type("3");
    await page.keyboard.press("Enter");
    await expect.poll(() => readout(page)).toBe("3 × 3 · 2 × 3 steps");
});

test("Enter places the marchers on the spots as one undo step, and Escape cancels", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    expect(await shapeOverlay(page)).toBeNull();
    expect((await readField(page)).activeGesture).toBeNull();
    expect(await savedPositions(show, 0)).toEqual(asPositions(HOME));

    const steps = await undoSteps(show);
    await drawBox(show);
    const spots = (await shapeOverlay(page))!.spots;
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    await expect
        .poll(async () =>
            (await savedPositions(show, 0)).every((p) =>
                spots.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < CLOSE),
            ),
        )
        .toBe(true);
    await waitForIdle(page);
    await expectCanvasMatchesShow(show);
    expect(await undoSteps(show)).toBe(steps + 1);

    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => savedPositions(show, 0)).toEqual(asPositions(HOME));
});

/** Draws and places a box on every marcher, then clears the selection. */
async function placeBox(show: Show, pageId = 0) {
    const { page } = show;
    await drawBox(show);
    const spots = (await shapeOverlay(page))!.spots;
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    await expect
        .poll(async () =>
            (await savedPositions(show, pageId)).every((p) =>
                spots.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < CLOSE),
            ),
        )
        .toBe(true);
    await waitForIdle(page);
    // Escape lets go of the box selected whole
    await page.keyboard.press("Escape");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([]);
}

const marcherScreen = async (page: Page, id: number) =>
    (await drawnMarchers(page)).find((m) => m.id === id)!.screen;

test("change: a click on a placed box's member selects the whole box, and a double click goes inside it", async ({
    show,
}) => {
    const { page } = show;
    await placeBox(show);
    expect(await placedBoxes(page)).toEqual([]);

    const t3 = await marcherScreen(page, 3);
    await page.mouse.click(t3.x, t3.y);
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
    // The box draws its own outline and handles; the selection box has none
    await expect
        .poll(async () => (await shapeOverlay(page))?.handles.length)
        .toBeGreaterThan(0);
    expect((await readField(page)).handles).toBeNull();
    await expect(page.getByTestId("placed-box-readout-text")).toContainText(
        "4 × 2",
    );

    await page.mouse.dblclick(t3.x, t3.y);
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([3]);
    // Inside, the other members' outline shows, and a click picks one marcher
    await expect.poll(async () => (await placedBoxes(page)).length).toBe(1);
    const t5 = await marcherScreen(page, 5);
    await page.mouse.click(t5.x, t5.y);
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([5]);
    // Escape leaves the box, selecting it whole again
    await page.keyboard.press("Escape");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
});

test("change: a Cmd/Ctrl-click on a placed box's member picks just that marcher and goes inside the box, and a Cmd/Ctrl-drag moves only it, on both axes (reach inside)", async ({
    show,
}) => {
    const { page } = show;
    await placeBox(show);

    const t3 = await marcherScreen(page, 3);
    await page.mouse.click(t3.x, t3.y);
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
    // On the box selected whole, the press reaches inside it
    await page.keyboard.down("ControlOrMeta");
    await page.mouse.click(t3.x, t3.y);
    await page.keyboard.up("ControlOrMeta");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([3]);
    // Inside, as a double click leaves it: the other members' outline shows, a click picks one
    await expect.poll(async () => (await placedBoxes(page)).length).toBe(1);
    const t5 = await marcherScreen(page, 5);
    await page.mouse.click(t5.x, t5.y);
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([5]);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([]);

    // From nothing selected, a Cmd/Ctrl-drag takes the one marcher, and the press's key doesn't
    // keep it to one axis
    const before = await drawnMarchers(page);
    await page.keyboard.down("ControlOrMeta");
    await drag(page, t3, { x: t3.x + 60, y: t3.y + 45 });
    await page.keyboard.up("ControlOrMeta");
    await waitForIdle(page);
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([3]);
    const after = await drawnMarchers(page);
    for (const m of after) {
        const was = before.find((b) => b.id === m.id)!.screen;
        if (m.id === 3) {
            expect(Math.abs(m.screen.x - was.x)).toBeGreaterThan(20);
            expect(Math.abs(m.screen.y - was.y)).toBeGreaterThan(20);
        } else expect(m.screen).toEqual(was);
    }
});

test("a selected box's handle stretches it and saves at once, as one undo step", async ({
    show,
}) => {
    const { page } = show;
    await placeBox(show);
    const steps = await undoSteps(show);
    const before = await savedPositions(show, 0);

    const t1 = await marcherScreen(page, 1);
    await page.mouse.click(t1.x, t1.y);
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
    const handles = (await shapeOverlay(page))!.handles;
    const se = handles.reduce((a, b) => (b.x + b.y > a.x + a.y ? b : a));
    await drag(page, se, { x: se.x + 60, y: se.y + 30 });

    let after: Position[] = before;
    await expect
        .poll(async () => {
            after = await savedPositions(show, 0);
            return JSON.stringify(after) !== JSON.stringify(before);
        })
        .toBe(true);
    await waitForIdle(page);
    expect(await undoSteps(show)).toBe(steps + 1);
    // Stretched: wider and deeper, with the same members
    const width = (ps: Position[]) =>
        Math.max(...ps.map((p) => p.x)) - Math.min(...ps.map((p) => p.x));
    expect(width(after)).toBeGreaterThan(width(before));
    // Still selected as a box
    expect((await readField(page)).selection).toEqual(ALL);
    await expectCanvasMatchesShow(show);
});

test("change: a selected placed box is calm with the pointer away, shows its controls over it, during a handle drag and with keyboard focus in its editor, and its editor fades as the open box's does (#430)", async ({
    show,
}) => {
    const { page } = show;
    await placeBox(show);
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    const t1 = await marcherScreen(page, 1);
    await page.mouse.click(t1.x, t1.y);
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
    const bar = page.getByTestId("placed-box-readout");
    await expect(bar).toBeVisible();
    const calm = async () => (await shapeOverlay(page))!.calm;
    const handleOpacity = () =>
        page
            .getByTestId("fieldShapeHandle")
            .first()
            .evaluate((el) => getComputedStyle(el).opacity);
    const boxFill = () =>
        page
            .getByTestId("fieldShapeMode")
            .locator("polygon")
            .first()
            .getAttribute("fill");
    const barOpacity = () =>
        bar.evaluate((el) => Number(getComputedStyle(el).opacity));

    // Away from the box, on empty field: faint controls, no fill, a faded editor
    const away = await toScreen(page, { x: cf.x + 20 * S, y: cf.y - 5 * S });
    await page.mouse.move(away.x, away.y);
    await expect.poll(calm).toBe(true);
    await expect.poll(handleOpacity).toBe("0.25");
    await expect.poll(boxFill).toBe("none");
    await expect.poll(barOpacity).toBeLessThan(0.6);

    // Over a member inside the box: full strength, a solid editor
    await page.mouse.move(t1.x, t1.y);
    await expect.poll(calm).toBe(false);
    await expect.poll(handleOpacity).toBe("1");
    await expect.poll(boxFill).not.toBe("none");
    await expect.poll(barOpacity).toBe(1);

    // Over the editor: the editor is solid, the box stays calm
    await page.mouse.move(away.x, away.y);
    await expect.poll(calm).toBe(true);
    await page.getByTestId("placed-box-readout-bar").hover();
    await expect.poll(barOpacity).toBe(1);

    // A handle drag keeps the controls; the editor stays faded as the open box's does
    await page.mouse.move(away.x, away.y);
    await expect.poll(calm).toBe(true);
    const handles = (await shapeOverlay(page))!.handles;
    const se = handles.reduce((a, b) => (b.x + b.y > a.x + a.y ? b : a));
    await drag(
        page,
        se,
        { x: se.x + 60, y: se.y + 30 },
        {
            beforeRelease: async () => {
                await expect.poll(calm).toBe(false);
                await expect.poll(barOpacity).toBeLessThan(0.6);
            },
        },
    );
    await waitForIdle(page);
    await page.mouse.move(away.x, away.y);
    await expect.poll(calm).toBe(true);

    // Typing a number in its editor shows the controls with the pointer away
    await bar.getByTestId("shape-editor-across").click();
    await expect(bar.getByTestId("shape-editor-across-input")).toBeFocused();
    await page.mouse.move(away.x, away.y);
    await expect.poll(calm).toBe(false);
    await expect.poll(barOpacity).toBe(1);
    await page.keyboard.press("Escape");
    await expect.poll(calm).toBe(true);
    await expect.poll(barOpacity).toBeLessThan(0.6);
});

/** The latest recipe saved: its params and how many members it has */
async function latestRecipe(show: Show) {
    const [row] = await show.query<{ params: string; members: number }>(
        `SELECT r.params AS params,
            (SELECT COUNT(*) FROM timeline_shape_recipe_marchers m WHERE m.recipe_id = r.id) AS members
         FROM timeline_shape_recipes r ORDER BY r.id DESC LIMIT 1`,
    );
    return { params: JSON.parse(row.params), members: row.members };
}

/** Goes inside the placed box at marcher `id` and drags it `by` screen pixels, out of the box */
async function dragOutOfBox(page: Page, id: number, by: Point) {
    const at = await marcherScreen(page, id);
    // A click selects the box whole, then a double click goes inside it
    await page.mouse.click(at.x, at.y);
    await expect
        .poll(async () => (await readField(page)).selection)
        .toContain(id);
    await page.mouse.dblclick(at.x, at.y);
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([id]);
    await drag(page, at, { x: at.x + by.x, y: at.y + by.y });
    await waitForIdle(page);
}

// Close up (#392, spec #385): a placed shape that lost members keeps its holes
// until Close up, in the chip's ⋯ row and the inspector, lays it out again for
// the members left by least travel, as one undo step.
test("change: Close up shows only with holes, lays a box that lost two out for six as one undo step, and undo brings the holes back", async ({
    show,
}) => {
    const { page } = show;
    await placeBox(show);

    // No holes: no Close up
    const t1 = await marcherScreen(page, 1);
    await page.mouse.click(t1.x, t1.y);
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
    await expect(page.getByTestId("placed-box-readout")).toBeVisible();
    await expect(page.getByTestId("shape-editor-close-up")).toHaveCount(0);
    await page.keyboard.press("Escape");

    // Two leave: their spots stay empty, and the toast offers Close up
    await dragOutOfBox(page, 7, { x: 0, y: 160 });
    await expect(
        toasts(page).filter({ hasText: "left the box" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await dragOutOfBox(page, 8, { x: 0, y: 160 });
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await latestRecipe(show)).members).toBe(6);
    expect((await latestRecipe(show)).params.spots).toBe(8);
    const holed = await savedPositions(show, 0);

    const t2 = await marcherScreen(page, 2);
    await page.mouse.click(t2.x, t2.y);
    const members = ALL.filter((id) => id !== 7 && id !== 8);
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(members);
    await expect(page.getByTestId("placed-box-readout")).toContainText(
        "2 empty",
    );
    await expect(page.getByTestId("shape-editor-close-up")).toBeVisible();
    const steps = await undoSteps(show);
    await page.getByTestId("shape-editor-close-up").click();

    // Laid out for six: no holes left, everyone on a spot of the box
    await expect
        .poll(async () => (await latestRecipe(show)).params.spots)
        .toBe(6);
    await waitForIdle(page);
    expect(await undoSteps(show)).toBe(steps + 1);
    expect((await latestRecipe(show)).members).toBe(6);
    await expect(page.getByTestId("placed-box-readout")).not.toContainText(
        "empty",
    );
    await expect(page.getByTestId("shape-editor-close-up")).toHaveCount(0);
    const closed = await savedPositions(show, 0);
    // Each member stands on a spot of its own in the recipe saved
    const placed = await show.query<{
        marcher_id: number;
        slot: number;
        x: number;
        y: number;
    }>(
        `SELECT marcher_id, slot, x, y FROM timeline_shape_recipe_marchers
         WHERE recipe_id = (SELECT MAX(id) FROM timeline_shape_recipes)`,
    );
    expect(placed.map((m) => m.slot).sort()).toEqual([0, 1, 2, 3, 4, 5]);
    for (const m of placed) {
        const p = closed.find((c) => c.id === m.marcher_id)!;
        expect(Math.hypot(p.x - m.x, p.y - m.y)).toBeLessThan(CLOSE);
    }
    // The two who left stay where they went
    for (const id of [7, 8])
        expect(closed.find((p) => p.id === id)).toEqual(
            holed.find((p) => p.id === id),
        );

    // One undo puts the holes back
    await page.keyboard.press("ControlOrMeta+z");
    await expect
        .poll(async () => (await latestRecipe(show)).params.spots)
        .toBe(8);
    await expect.poll(() => savedPositions(show, 0)).toEqual(holed);
    await expectCanvasMatchesShow(show);
});

test("change: Close up after an edit in the editor keeps the edit: the spacing typed stays (#455)", async ({
    show,
}) => {
    const { page } = show;
    await placeBox(show);
    await dragOutOfBox(page, 7, { x: 0, y: 160 });
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await latestRecipe(show)).members).toBe(7);

    const t2 = await marcherScreen(page, 2);
    await page.mouse.click(t2.x, t2.y);
    const editor = page.getByTestId("placed-box-readout");
    await expect(editor).toContainText("1 empty");
    const deep = editor.getByTestId("shape-editor-deep");
    const before = await deep.innerText();
    const typed = before === "3" ? "4" : "3";
    // A new front-to-back spacing, saved on Enter
    await deep.click();
    await page.getByTestId("shape-editor-deep-input").fill(typed);
    await page.getByTestId("shape-editor-deep-input").press("Enter");
    await expect(deep).toHaveText(typed);
    await waitForIdle(page);
    // Past the save's hold, so Close up writes rather than waiting on the spacing's save
    await page.waitForTimeout(1500);

    // Close up lays out the box as it is now, the new spacing included
    await editor.getByTestId("shape-editor-close-up").click();
    await expect
        .poll(async () => (await latestRecipe(show)).params.spots)
        .toBe(7);
    await waitForIdle(page);
    await expect(editor).not.toContainText("empty");
    await expect(deep).toHaveText(typed);
});

test("the View tab's numbers-only labels draw drill order, not drill numbers", async ({
    show,
}) => {
    const { page } = show;
    expect((await drawnMarchers(page)).map((m) => m.drillNumber)).toContain(
        "T1",
    );
    await setUiSettings(page, { marcherLabels: "numbers" });
    await expect
        .poll(async () =>
            (await drawnMarchers(page)).map((m) => m.drillNumber).sort(),
        )
        .toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
});

// The open shape is measured from the start flag (#346, spec #344): its hollow
// rings and walks start where each marcher stands at the start flag, not where
// the page has them at the playhead. On page 2 that's page 1's positions; at
// home it's the home spots.
const shifted = (dy: number): SeedPosition[] =>
    HOME.map(([id, x, y]) => [id, x, y + dy]);
const PAGE_1 = shifted(60);
const PAGE_2 = shifted(120);

/** The rings' points, sorted, to compare with where marchers stand */
const sortedPoints = (points: readonly Point[]) =>
    [...points].sort((a, b) => a.x - b.x || a.y - b.y);

const expectSamePoints = (
    actual: readonly Point[],
    expected: readonly SeedPosition[],
) => {
    const a = sortedPoints(actual);
    const e = sortedPoints(expected.map(([, x, y]) => ({ x, y })));
    expect(a).toHaveLength(e.length);
    a.forEach((p, i) => {
        expect(p.x).toBeCloseTo(e[i]!.x, 3);
        expect(p.y).toBeCloseTo(e[i]!.y, 3);
    });
};

for (const editorMode of ["expert", "basic"] as const) {
    test.describe(`measured from the start flag (${editorMode})`, () => {
        test.use({
            appSettings: { optOutAnalytics: true, editorMode },
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
                positions: [HOME, PAGE_1, PAGE_2],
            }),
        });

        test("on a page, rings and walks start at the start flag, not at the playhead", async ({
            show,
        }) => {
            const { page } = show;
            await showPathways(show);
            await selectPage(show, "Page 2");
            // The field shows the playhead: page 2's positions
            await expect
                .poll(async () =>
                    (await drawnMarchers(page)).map((m) => m.y).sort(),
                )
                .toEqual(PAGE_2.map(([, , y]) => y).sort());
            await drawBox(show);
            const overlay = (await shapeOverlay(page))!;
            expectSamePoints(overlay.rings, PAGE_1);
            expectSamePoints(
                overlay.walks.map((w) => w.from),
                PAGE_1,
            );
        });

        test("at home, rings and walks start at the home spots", async ({
            show,
        }) => {
            const { page } = show;
            await showPathways(show);
            await selectPage(show, "Page 2");
            await page.keyboard.press("Home");
            await expect
                .poll(async () =>
                    (await drawnMarchers(page)).map((m) => m.y).sort(),
                )
                .toEqual(HOME.map(([, , y]) => y).sort());
            await drawBox(show);
            const overlay = (await shapeOverlay(page))!;
            expectSamePoints(overlay.rings, HOME);
            expectSamePoints(
                overlay.walks.map((w) => w.from),
                HOME,
            );
        });
    });
}

// The inspector's Transform section (#349, spec #344): the pivot grid, the
// rotation and the flips for any selection, and for a shape scaling by
// interval in half steps. A plain selection writes positions only, no recipe.

const recipeCount = async (show: Show) => {
    const [row] = await show.query<{ count: number }>(
        "SELECT COUNT(*) AS count FROM timeline_shape_recipes",
    );
    return row.count;
};

/** "3½" as 3.5 */
const halves = (text: string) =>
    Number(text.replace("½", "").trim() || "0") +
    (text.includes("½") ? 0.5 : 0);

/** The open box's spacings in the floating editor, in steps */
async function spacings(page: Page): Promise<[number, number]> {
    const bar = page.getByTestId("shape-tool-readout");
    return [
        halves(await bar.getByTestId("shape-editor-across").innerText()),
        halves(await bar.getByTestId("shape-editor-deep").innerText()),
    ];
}

test("change: the Transform section flips and turns a plain selection around the pivot, writing positions only", async ({
    show,
}) => {
    const { page } = show;
    await selectAll(page);
    const section = page.getByTestId("transform-section");
    await expect(section).toBeVisible();
    // A plain selection has no scale
    await expect(section.getByTestId("transform-scale-more")).toHaveCount(0);
    const steps = await undoSteps(show);

    // Around the left edge: everyone mirrors to the left of the leftmost marcher
    const left = Math.min(...HOME.map(([, x]) => x));
    await section.getByTestId("transform-pivot-w").click();
    await section.getByTestId("transform-flip-across").click();
    await expect
        .poll(() => savedPositions(show, 0))
        .toEqual(asPositions(HOME.map(([id, x, y]) => [id, 2 * left - x, y])));
    expect(await undoSteps(show)).toBe(steps + 1);
    expect(await recipeCount(show)).toBe(0);

    // A quarter turn clockwise around the back-left corner of their box
    const flipped = await savedPositions(show, 0);
    const corner = {
        x: Math.min(...flipped.map((p) => p.x)),
        y: Math.min(...flipped.map((p) => p.y)),
    };
    await section.getByTestId("transform-pivot-nw").click();
    const rotation = section.getByRole("textbox", { name: "Rotation" });
    await rotation.fill("90");
    await rotation.blur();
    await expect
        .poll(async () =>
            (await savedPositions(show, 0)).every((p) => {
                const was = flipped.find((f) => f.id === p.id)!;
                const want = {
                    x: corner.x - (was.y - corner.y),
                    y: corner.y + (was.x - corner.x),
                };
                return Math.hypot(p.x - want.x, p.y - want.y) < 0.01;
            }),
        )
        .toBe(true);
    expect(await undoSteps(show)).toBe(steps + 2);
    expect(await recipeCount(show)).toBe(0);
    await expectCanvasMatchesShow(show);
});

test("change: with a kind armed and nothing drawn yet, the Transform section shows the selection's controls", async ({
    show,
}) => {
    const { page } = show;
    await selectAll(page);
    await page.keyboard.press("b");
    await expect(page.getByTestId("shape-tool-hint")).toBeVisible();
    const section = page.getByTestId("transform-section");
    await expect(section).toBeVisible();
    await expect(
        section.getByRole("textbox", { name: "Rotation" }),
    ).toBeVisible();
    await expect(section.getByTestId("transform-flip-across")).toBeVisible();
    await expect(section.getByTestId("transform-scale-more")).toHaveCount(0);
});

test("change: the inspector shows no shape section while a shape is open or a placed one is selected (#435)", async ({
    show,
}) => {
    const { page } = show;
    const inspectorShape = async () => {
        for (const id of [
            "shape-tool-section",
            "transform-section",
            "placed-box-summary",
            "shape-layout-picker",
        ])
            await expect(page.getByTestId(id)).toHaveCount(0);
    };
    await drawBox(show);
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();
    await inspectorShape();
    await page.keyboard.press("Escape");
    await placeBox(show);
    const t1 = await marcherScreen(page, 1);
    await page.mouse.click(t1.x, t1.y);
    await expect(page.getByTestId("placed-box-readout")).toBeVisible();
    await inspectorShape();
});

test("change: handles snap spacings to half steps, Shift (fine) to hundredths, with a length readout while dragging, and a typed spacing keeps hundredths", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    const se = () =>
        shapeOverlay(page).then((o) =>
            o!.handles.reduce((a, b) => (b.x + b.y > a.x + a.y ? b : a)),
        );

    let tip: string | null = null;
    let from = await se();
    await drag(
        page,
        from,
        { x: from.x + 47, y: from.y + 23 },
        {
            beforeRelease: async () => {
                tip = (await shapeOverlay(page))!.tip;
            },
        },
    );
    expect(tip).toMatch(/^[\d½]+ × [\d½]+ steps · ↔ [\d½]+ ↕ [\d½]+ apart$/);
    expect((await shapeOverlay(page))!.tip).toBeNull();
    for (const s of await spacings(page)) expect((s * 2) % 1).toBe(0);

    // With Shift (fine): hundredths (#411)
    from = await se();
    await page.keyboard.down("Shift");
    await drag(page, from, { x: from.x + 13, y: from.y + 7 });
    await page.keyboard.up("Shift");
    const bar = page.getByTestId("shape-tool-readout");
    for (const id of ["shape-editor-across", "shape-editor-deep"]) {
        const text = await bar.getByTestId(id).innerText();
        expect(text).toMatch(/^\d+(\.\d{1,2})?$|^[\d½]+$/);
    }
    for (const s of await spacings(page))
        expect(Math.abs(s * 100 - Math.round(s * 100))).toBeLessThan(1e-6);

    // Typed, a spacing keeps its hundredths rather than going to half steps
    await page.getByTestId("shape-editor-across").click();
    await page.keyboard.type("2.37");
    await page.keyboard.press("Enter");
    await expect(bar.getByTestId("shape-editor-across")).toHaveText("2.37");
});

test("change: a typed 1 2/3 stays exactly 1⅔ steps and shows as 1⅔, − and + leave the box where it was, and Save keeps 2⅔ exactly (#423)", async ({
    show,
}) => {
    const { page } = show;
    const { grid } = await drawBox(show);
    const S = grid.pixelsPerStep;
    const bar = page.getByTestId("shape-tool-readout");
    /** The distinct gaps between neighbors side to side and front to back, in steps */
    const gaps = async () => {
        const { spots } = (await shapeOverlay(page))!;
        const apart = (vs: number[]) => {
            const sorted = [...new Set(vs.map((v) => v.toFixed(6)))]
                .map(Number)
                .sort((a, b) => a - b);
            return sorted.slice(1).map((v, i) => (v - sorted[i]) / S);
        };
        return {
            across: apart(spots.map((p) => p.x)),
            deep: apart(spots.map((p) => p.y)),
        };
    };
    const allClose = (vs: number[], want: number) => {
        expect(vs.length).toBeGreaterThan(0);
        for (const v of vs) expect(Math.abs(v - want)).toBeLessThan(1e-4);
    };

    await page.getByTestId("shape-editor-across").click();
    await page.keyboard.type("1 2/3");
    await page.keyboard.press("Enter");
    await expect(bar.getByTestId("shape-editor-across")).toHaveText("1⅔");
    allClose((await gaps()).across, 5 / 3);

    // − and + around the center come back to the same spots, not shifted a sixth of a step
    const before = (await shapeOverlay(page))!.spots;
    for (const more of [true, false, true, false, false, true])
        await sizeButton(page, more).click();
    const after = (await shapeOverlay(page))!.spots;
    expect(after).toHaveLength(before.length);
    after.forEach((p, i) => {
        expect(Math.abs(p.x - before[i].x)).toBeLessThan(1e-6);
        expect(Math.abs(p.y - before[i].y)).toBeLessThan(1e-6);
    });

    await page.getByTestId("shape-editor-deep").click();
    await page.keyboard.type("2⅔");
    await page.keyboard.press("Enter");
    await expect(bar.getByTestId("shape-editor-deep")).toHaveText("2⅔");
    allClose((await gaps()).deep, 8 / 3);

    // Saved, the show's copy keeps the intervals exactly, not as shown
    await page.getByTestId("shape-editor-save").click();
    const name = page.getByTestId("shape-editor-save-name");
    await expect(name).toHaveValue("Box 1⅔ × 2⅔ apart");
    await page.keyboard.press("Enter");
    await expect
        .poll(
            async () =>
                (await show.query("SELECT id FROM saved_shapes")).length,
        )
        .toBe(1);
    const [{ intervals }] = await show.query<{ intervals: string }>(
        "SELECT intervals FROM saved_shapes",
    );
    const saved = JSON.parse(intervals) as { across: number; deep: number };
    expect(Math.abs(saved.across - 5 / 3)).toBeLessThan(1e-9);
    expect(Math.abs(saved.deep - 8 / 3)).toBeLessThan(1e-9);
});

test("change: Expand twice and Shrink once keep the across:deep ratio and the pivot, one undo step a click; a hold is one undo step, and Shrink stops at half a step (#489)", async ({
    show,
}) => {
    const { page } = show;
    const { grid } = await drawBox(show);
    const S = grid.pixelsPerStep;
    const bar = page.getByTestId("shape-tool-readout");
    const deepText = bar.getByTestId("shape-editor-deep");
    /** The gaps between neighbors side to side and front to back, in steps, and the center */
    const measure = async () => {
        const { spots } = (await shapeOverlay(page))!;
        const gap = (vs: number[]) => {
            const sorted = [...new Set(vs.map((v) => v.toFixed(6)))]
                .map(Number)
                .sort((a, b) => a - b);
            return (sorted[1] - sorted[0]) / S;
        };
        const xs = spots.map((p) => p.x);
        const ys = spots.map((p) => p.y);
        return {
            across: gap(xs),
            deep: gap(ys),
            center: {
                x: (Math.min(...xs) + Math.max(...xs)) / 2,
                y: (Math.min(...ys) + Math.max(...ys)) / 2,
            },
        };
    };
    const typeSpacing = async (way: "across" | "deep", text: string) => {
        await bar.getByTestId(`shape-editor-${way}`).click();
        await page.keyboard.type(text);
        await page.keyboard.press("Enter");
    };
    await typeSpacing("across", "2");
    await typeSpacing("deep", "3");
    await expect(deepText).toHaveText("3");
    const start = await measure();
    const counts = await bar.getByTestId("shape-editor-size").innerText();

    const expand = page.getByTestId("shape-editor-expand");
    const shrink = page.getByTestId("shape-editor-shrink");
    await expand.hover();
    await expect(page.getByRole("tooltip")).toContainText(
        "Expand, keeping the proportions",
    );
    // Both on the half steps: the larger, deep, drives; across follows
    await expand.click();
    await expect(deepText).toHaveText("3½");
    await expand.click();
    await expect(deepText).toHaveText("4");
    await shrink.click();
    await expect(deepText).toHaveText("3½");
    const after = await measure();
    expect(after.deep).toBeCloseTo(3.5, 3);
    expect(after.across / after.deep).toBeCloseTo(2 / 3, 3);
    // Around the pivot (the center), the counts unchanged
    expect(Math.abs(after.center.x - start.center.x)).toBeLessThan(CLOSE);
    expect(Math.abs(after.center.y - start.center.y)).toBeLessThan(CLOSE);
    await expect(bar.getByTestId("shape-editor-size")).toHaveText(counts);

    // One undo step a click: back to before the Shrink
    await page.keyboard.press("ControlOrMeta+z");
    await expect(deepText).toHaveText("4");

    // Held, it repeats, and the whole hold is one undo step
    const button = (await expand.boundingBox())!;
    await page.mouse.move(
        button.x + button.width / 2,
        button.y + button.height / 2,
    );
    await page.mouse.down();
    await expect
        .poll(async () => (await measure()).deep, { timeout: 5000 })
        .toBeGreaterThan(5);
    await page.mouse.up();
    const held = await measure();
    expect(held.across / held.deep).toBeCloseTo(2 / 3, 3);
    await page.keyboard.press("ControlOrMeta+z");
    await expect(deepText).toHaveText("4");

    // Down to the floor: Shrink disables once the next would take across under half a step
    for (let i = 0; i < 12; i++) {
        if (await shrink.isDisabled()) break;
        const was = await deepText.innerText();
        await shrink.click();
        await expect(deepText).not.toHaveText(was);
    }
    await expect(shrink).toBeDisabled();
    const floor = await measure();
    expect(floor.across).toBeGreaterThanOrEqual(0.5 - CLOSE);
    expect(floor.across / floor.deep).toBeCloseTo(2 / 3, 3);
    // A tooltip closes on a press: point elsewhere, then back
    await expand.hover();
    await shrink.hover();
    await expect(page.getByRole("tooltip")).toContainText(
        "no spacing can go under half a step",
    );
});

test("change: in a narrow window the editor goes onto two rows, inside the field; one row when it fits (owner)", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    const bar = page.getByTestId("shape-tool-readout-bar");
    await expect(bar).toHaveAttribute("data-rows", "1");
    /** The bar and the field it floats over, on screen */
    const boxes = () =>
        bar.evaluate((el) => {
            const field =
                el.parentElement!.offsetParent!.getBoundingClientRect();
            const own = el.getBoundingClientRect();
            return {
                left: own.left - field.left,
                right: field.right - own.right,
                height: own.height,
            };
        });
    const wide = await boxes();

    await page.setViewportSize({ width: 820, height: 800 });
    await expect(bar).toHaveAttribute("data-rows", "2");
    await expect
        .poll(async () => {
            const { left, right } = await boxes();
            return Math.min(left, right);
        })
        .toBeGreaterThanOrEqual(0);
    expect((await boxes()).height).toBeGreaterThan(wide.height * 1.5);
    // Every control is still there to press
    await expect(page.getByTestId("shape-editor-expand")).toBeInViewport({
        ratio: 1,
    });

    await page.setViewportSize({ width: 1400, height: 900 });
    await expect(bar).toHaveAttribute("data-rows", "1");
});

test("change: a press that makes the editor too wide for one row keeps its rows until let go, so the pressed control stays put (review of #493)", async ({
    show,
}) => {
    const { page } = show;
    // One row only just fits here (with the Snap button), and a + that leaves marchers short widens
    // it past the field
    await page.setViewportSize({ width: 1030, height: 1000 });
    await drawBox(show);
    const bar = page.getByTestId("shape-tool-readout-bar");
    await expect(bar).toHaveAttribute("data-rows", "1");
    const more = page.getByRole("button", { name: "One more across" });
    const at = (await more.boundingBox())!;
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.getByTestId("shape-tool-readout")).toHaveAttribute(
        "data-held",
        "true",
    );
    await expect(bar).toHaveAttribute("data-rows", "1");
    expect(Math.abs((await more.boundingBox())!.x - at.x)).toBeLessThan(1);
    // Let go, it goes onto two rows, inside the field
    await expect(bar).toHaveAttribute("data-rows", "2");
    await expect
        .poll(() =>
            bar.evaluate((el) => {
                const field =
                    el.parentElement!.offsetParent!.getBoundingClientRect();
                const own = el.getBoundingClientRect();
                return Math.min(own.left - field.left, field.right - own.right);
            }),
        )
        .toBeGreaterThanOrEqual(0);
});

test("change: quick clicks on Expand all land on it: the editor's numbers keep their width while it's pressed (owner on #490)", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    const bar = page.getByTestId("shape-tool-readout");
    const deepText = bar.getByTestId("shape-editor-deep");
    for (const [way, text] of [
        ["across", "2"],
        ["deep", "3"],
    ] as const) {
        await bar.getByTestId(`shape-editor-${way}`).click();
        await page.keyboard.type(text);
        await page.keyboard.press("Enter");
    }
    await expect(deepText).toHaveText("3");
    await editorSettled(page);

    // 3 → 3½ → 4 → 4½: across follows at 2:3 and shows "≈", a wider number with its snap button
    const expand = page.getByTestId("shape-editor-expand");
    const at = (await expand.boundingBox())!;
    for (const deep of ["3½", "4", "4½"]) {
        await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
        await expect(deepText).toHaveText(deep);
        // Put back before the next frame is drawn; a read can fall just before that
        await expect
            .poll(
                async () => Math.abs((await expand.boundingBox())!.x - at.x),
                {
                    timeout: 300,
                },
            )
            .toBeLessThan(1);
    }
});

/**
 * The snap guides' names on screen, and whether each is on top at its center (#427): the overlay
 * ignores the pointer, so hit-testing is turned on for it while this asks
 */
const guideNamesOnTop = (page: Page) =>
    page.evaluate(() => {
        const style = document.createElement("style");
        style.textContent =
            '[data-testid="fieldOverlay"], [data-testid="fieldOverlay"] * { pointer-events: auto !important; }';
        document.head.append(style);
        const out = [
            ...document.querySelectorAll(
                '[data-testid="fieldShapeGuideLabel"]',
            ),
        ].map((label) => {
            const r = label.getBoundingClientRect();
            const top = document.elementFromPoint(
                r.x + r.width / 2,
                r.y + r.height / 2,
            );
            return {
                text: label.textContent ?? "",
                onTop: top !== null && label.contains(top),
            };
        });
        style.remove();
        return out;
    });

test("change: stretching a box's side near a yard line lands its edge on the line, the spacing exactly what that takes, with a guide while dragging (#425)", async ({
    show,
}) => {
    const { page } = show;
    const { grid, pressed } = await drawBox(show);
    const S = grid.pixelsPerStep;
    const bar = page.getByTestId("shape-tool-readout");
    // 4 files from 15 steps left of the 50: the 45 on side 2 is 23 steps on, 7⅔ apart
    const yardLine = grid.centerFront.x + 8 * S;
    const overlay = (await shapeOverlay(page))!;
    const xs = overlay.spots.map((p) => p.x);
    const left = Math.min(...xs);
    expect(Math.abs(left - pressed.x)).toBeLessThan(CLOSE);
    const maxX = Math.max(...overlay.handles.map((h) => h.x));
    const east = overlay.handles
        .filter((h) => Math.abs(h.x - maxX) < 1)
        .sort((a, b) => a.y - b.y)[1]!;
    const target = await toScreen(page, { x: yardLine, y: grid.centerFront.y });

    let guides: { from: Point; to: Point; label: string | null }[] = [];
    let onGuides: Point[] = [];
    let guideEdges: { from: Point; to: Point }[] = [];
    await drag(
        page,
        east,
        { x: target.x + 1, y: east.y },
        {
            beforeRelease: async () => {
                const during = await page.evaluate(
                    () => window.fieldTest!.shapeOverlay!()!,
                );
                guides = during.guides;
                onGuides = during.onGuides;
                guideEdges = during.guideEdges;
            },
        },
    );
    // While dragging, a guide along the yard line and the marchers on it tinted
    expect(
        guides.some(
            (g) =>
                Math.abs(g.from.x - yardLine) < CLOSE &&
                Math.abs(g.to.x - yardLine) < CLOSE,
        ),
    ).toBe(true);
    expect(onGuides.length).toBeGreaterThan(0);
    // Named as the coordinate sheet writes it (#427)
    expect(guides.map((g) => g.label)).toContain("S2: On 45");
    // The box's own side on the line is drawn thicker (owner on #427)
    expect(
        guideEdges.some(
            (e) =>
                Math.abs(e.from.x - yardLine) < CLOSE &&
                Math.abs(e.to.x - yardLine) < CLOSE,
        ),
    ).toBe(true);
    for (const p of onGuides)
        expect(Math.abs(p.x - yardLine)).toBeLessThan(CLOSE);

    await expect(bar.getByTestId("shape-editor-across")).toHaveText("7⅔");
    const after = (await shapeOverlay(page))!;
    const afterXs = after.spots.map((p) => p.x);
    // The left edge stayed, the right edge is on the line, and the guide cleared on release
    expect(Math.abs(Math.min(...afterXs) - left)).toBeLessThan(CLOSE);
    expect(Math.abs(Math.max(...afterXs) - yardLine)).toBeLessThan(CLOSE);
    expect(after.guides).toEqual([]);

    // Dragging the back edge onto the front hash: both guides are named, and nothing is drawn
    // over either name (owner on #427)
    const frontHash = grid.centerFront.y - 28 * S;
    const minY = Math.min(...after.handles.map((h) => h.y));
    const north = after.handles
        .filter((h) => Math.abs(h.y - minY) < 1)
        .sort((a, b) => a.x - b.x)[1]!;
    const hash = await toScreen(page, { x: yardLine, y: frontHash });
    let names: { text: string; onTop: boolean }[] = [];
    await drag(
        page,
        north,
        { x: north.x, y: hash.y },
        {
            beforeRelease: async () => {
                names = await guideNamesOnTop(page);
            },
        },
    );
    expect(names.map((n) => n.text).sort()).toEqual(["On FH", "S2: On 45"]);
    for (const name of names) expect(name.onTop, name.text).toBe(true);
});

/** Screen pixels per field unit, which the edge pull's radius is measured in (#425) */
async function screenPerUnit(page: Page, at: Point): Promise<number> {
    const a = await toScreen(page, at);
    const b = await toScreen(page, { x: at.x + 100, y: at.y });
    return (b.x - a.x) / 100;
}

/** The guides, thick edges and tinted spots while a drag is held */
type HeldGuides = Pick<
    FieldTestShapeOverlay,
    "guides" | "guideEdges" | "guideMarks" | "onGuides"
>;
const heldGuides = (page: Page): Promise<HeldGuides> =>
    page.evaluate(() => {
        const { guides, guideEdges, guideMarks, onGuides } =
            window.fieldTest!.shapeOverlay!()!;
        return { guides, guideEdges, guideMarks, onGuides };
    });

test("change: moving an open box near the front hash lands its front edge on it, with the guide named as on the coordinate sheet; away from lines no guide; Shift (fine) still lands it, the Snap toggle off doesn't pull (#444, #453)", async ({
    show,
}) => {
    const { page } = show;
    const { grid } = await drawBox(show);
    const S = grid.pixelsPerStep;
    const bar = page.getByTestId("shape-tool-readout");
    // 2⅔ steps deep, so the front edge is off the half steps whenever the back edge is on them
    await bar.getByTestId("shape-editor-deep").click();
    await page.keyboard.type("2 2/3");
    await page.keyboard.press("Enter");
    await expect(bar.getByTestId("shape-editor-deep")).toHaveText("2⅔");
    const frontHash = grid.centerFront.y - 28 * S;
    const edgesOf = async () => {
        const { spots } = (await shapeOverlay(page))!;
        const xs = spots.map((p) => p.x);
        const ys = spots.map((p) => p.y);
        return {
            left: Math.min(...xs),
            back: Math.min(...ys),
            front: Math.max(...ys),
        };
    };
    /** A point inside the box between its marchers, off the center dot */
    const grabOf = async () => {
        const e = await edgesOf();
        return { x: e.left + (5 / 3) * S, y: (e.back + e.front) / 2 };
    };
    // A few screen pixels, within the pull: never more than a quarter step (#444)
    const perUnit = await screenPerUnit(page, grid.centerFront);
    const nearPx = Math.min(3, (S / 4) * perUnit * 0.8);
    expect(nearPx).toBeGreaterThan(1);
    const near = nearPx / perUnit;

    /** Drags the box from inside so its front edge would end `by` field units from where it is */
    /** `key`: held through the drag, Shift (fine control) */
    const moveBy = async (by: Point, key?: "Shift") => {
        const grab = await grabOf();
        const from = await toScreen(page, grab);
        const to = await toScreen(page, { x: grab.x + by.x, y: grab.y + by.y });
        let held: HeldGuides | null = null;
        if (key) await page.keyboard.down(key);
        await drag(page, from, to, {
            beforeRelease: async () => {
                held = await heldGuides(page);
            },
        });
        if (key) await page.keyboard.up(key);
        return held!;
    };

    // Near the front hash: the front edge lands on it, and the guide is named "On FH"
    let e = await edgesOf();
    let held = await moveBy({ x: 0, y: frontHash - e.front + near });
    expect(held.guides.map((g) => g.label)).toEqual(["On FH"]);
    expect(
        held.guideEdges.some(
            (g) =>
                Math.abs(g.from.y - frontHash) < CLOSE &&
                Math.abs(g.to.y - frontHash) < CLOSE,
        ),
    ).toBe(true);
    expect(held.onGuides.length).toBeGreaterThan(0);
    e = await edgesOf();
    expect(Math.abs(e.front - frontHash)).toBeLessThan(CLOSE);
    expect((await shapeOverlay(page))!.guides).toEqual([]);

    // Away from lines: no guide, and the box is back on the half-step grid
    held = await moveBy({ x: 0, y: 2 * S });
    expect(held.guides).toEqual([]);
    e = await edgesOf();
    expect(Math.abs(e.front - frontHash)).toBeGreaterThan(S / 2);
    expect(onHalfSteps(e.back, grid.centerFront.y, S)).toBe(true);
    expect(onHalfSteps(e.left, grid.centerFront.x, S)).toBe(true);

    // With Shift, near the hash again: fine control still lands it there, with the guide
    held = await moveBy({ x: 0, y: frontHash - e.front + near }, "Shift");
    expect(held.guides.map((g) => g.label)).toEqual(["On FH"]);
    e = await edgesOf();
    expect(Math.abs(e.front - frontHash)).toBeLessThan(CLOSE);

    // With the Snap toggle off (the editor's Snap button), near it from the other side: no pull
    // and no guide
    await turnSnapOff(page);
    held = await moveBy({ x: 0, y: -2 * near });
    expect(held.guides).toEqual([]);
    e = await edgesOf();
    expect(Math.abs(e.front - frontHash)).toBeGreaterThan(CLOSE);
});

test("change: moving a box turned 15° lands its front corner on the 40, with the guide named and the corner ringed; the Snap toggle off doesn't pull (#446)", async ({
    show,
}) => {
    const { page } = show;
    const { grid } = await drawBox(show);
    const S = grid.pixelsPerStep;
    const editor = page.getByTestId("shape-tool-readout");
    await editor.getByTestId("shape-editor-rotation").click();
    await page.getByTestId("shape-editor-rotation-input").fill("15");
    await page.getByTestId("shape-editor-rotation-input").press("Enter");
    await expect(editor.getByTestId("shape-editor-rotation")).toHaveText("15°");
    // The 40 on side 1: 16 steps left of the 50
    const forty = grid.centerFront.x - 16 * S;
    /** The box's front corner: the spot farthest to the front */
    const frontCorner = async () =>
        (await shapeOverlay(page))!.spots.reduce((a, b) => (b.y > a.y ? b : a));
    const perUnit = await screenPerUnit(page, grid.centerFront);
    const near = Math.min(3, (S / 4) * perUnit * 0.8) / perUnit;
    /** Drags the box from inside by `by` in field units */
    const moveBy = async (by: Point) => {
        const { spots } = (await shapeOverlay(page))!;
        // 3 steps out along its width, turned with it, well clear of the center dot
        const turn = (15 * Math.PI) / 180;
        const grab = {
            x:
                spots.reduce((t, p) => t + p.x, 0) / spots.length +
                3 * S * Math.cos(turn),
            y:
                spots.reduce((t, p) => t + p.y, 0) / spots.length +
                3 * S * Math.sin(turn),
        };
        let held: HeldGuides | null = null;
        await drag(
            page,
            await toScreen(page, grab),
            await toScreen(page, { x: grab.x + by.x, y: grab.y + by.y }),
            {
                beforeRelease: async () => {
                    held = await heldGuides(page);
                },
            },
        );
        return held!;
    };
    /**
     * Drags the box so its front corner would end `near` past the 40, away from the 50. From
     * this side its center stays out of reach of the half line 4 outside the 40, which would
     * otherwise be nearer and win.
     */
    const moveOnto40 = async () =>
        moveBy({ x: forty - (await frontCorner()).x - near, y: 0 });

    const held = await moveOnto40();
    expect(held.guides.map((g) => g.label)).toContain("S1: On 40");
    // A turned side isn't on the line, so the corner is ringed instead of a thick edge
    expect(held.guideMarks.some((m) => Math.abs(m.x - forty) < CLOSE)).toBe(
        true,
    );
    expect(
        held.guideEdges.some((e) => Math.abs(e.from.x - forty) < CLOSE),
    ).toBe(false);
    expect(Math.abs((await frontCorner()).x - forty)).toBeLessThan(CLOSE);
    await expect(editor.getByTestId("shape-editor-rotation")).toHaveText("15°");
    expect((await shapeOverlay(page))!.guides).toEqual([]);

    // Moved away, then back with the Snap toggle off: no pull and no guide
    await moveBy({ x: 2 * S, y: 0 });
    await turnSnapOff(page);
    const free = await moveOnto40();
    expect(free.guides).toEqual([]);
    expect(Math.abs((await frontCorner()).x - forty)).toBeGreaterThan(CLOSE);
});

test("change: dragging a 45° box's across spacing lands a corner on a line, with the guide named and the corner ringed, and the spacing stays where it landed (#452)", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    const editor = page.getByTestId("shape-tool-readout");
    await editor.getByTestId("shape-editor-rotation").click();
    await page.getByTestId("shape-editor-rotation-input").fill("45");
    await page.getByTestId("shape-editor-rotation-input").press("Enter");
    await expect(editor.getByTestId("shape-editor-rotation")).toHaveText("45°");
    const across = editor.getByTestId("shape-editor-across");
    const box = (await across.boundingBox())!;
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    // Half a pixel at a time until a corner lands on a line: spacings step by half steps every
    // 8 px, so a line comes within reach well before 160 px
    let held: HeldGuides | null = null;
    for (let px = 0.5; px <= 160; px += 0.5) {
        await page.mouse.move(start.x + px, start.y);
        const now = await heldGuides(page);
        if (now.guides.length > 0) {
            held = now;
            break;
        }
    }
    expect(held).not.toBeNull();
    // Named as on the coordinate sheet, the corner ringed: a turned side isn't on the line
    expect(held!.guides.every((g) => (g.label ?? "").length > 0)).toBe(true);
    expect(held!.guideMarks.length).toBeGreaterThan(0);
    const shown = await across.innerText();
    await page.mouse.up();
    // Released where it landed: the guide goes, the spacing stays, and a spot is on the line
    await expect(across).toHaveText(shown);
    const after = (await shapeOverlay(page))!;
    expect(after.guides).toEqual([]);
    const guide = held!.guides[0]!;
    const upright = Math.abs(guide.from.x - guide.to.x) < CLOSE;
    expect(
        after.spots.some((p) =>
            upright
                ? Math.abs(p.x - guide.from.x) < CLOSE
                : Math.abs(p.y - guide.from.y) < CLOSE,
        ),
    ).toBe(true);
});

test("change: Shift-dragging (fine) a 45° box's corner slides it smoothly and lands it exactly on a yard line, with the guide (#453)", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    const editor = page.getByTestId("shape-tool-readout");
    await editor.getByTestId("shape-editor-rotation").click();
    await page.getByTestId("shape-editor-rotation-input").fill("45");
    await page.getByTestId("shape-editor-rotation-input").press("Enter");
    await expect(editor.getByTestId("shape-editor-rotation")).toHaveText("45°");
    // Turned 45°, the handle farthest right is a corner
    const { handles } = (await shapeOverlay(page))!;
    const corner = handles.reduce((a, b) => (b.x > a.x ? b : a));
    await page.keyboard.down("Shift");
    await page.mouse.move(corner.x, corner.y);
    await page.mouse.down();
    // Half a pixel at a time, rightward, until the corner catches a line
    let held: HeldGuides | null = null;
    const xs: number[] = [];
    for (let px = 0.5; px <= 200; px += 0.5) {
        await page.mouse.move(corner.x + px, corner.y);
        const now = await heldGuides(page);
        const { spots } = (await shapeOverlay(page))!;
        xs.push(Math.max(...spots.map((p) => p.x)));
        if (now.guides.length > 0) {
            held = now;
            break;
        }
    }
    await page.mouse.up();
    await page.keyboard.up("Shift");
    expect(held).not.toBeNull();
    expect(held!.guides.every((g) => (g.label ?? "").length > 0)).toBe(true);
    expect(held!.guideMarks.length).toBeGreaterThan(0);
    // Smooth: with no half-step ladder the corner never stepped back on the way
    for (let i = 1; i < xs.length; i++)
        expect(xs[i]!).toBeGreaterThanOrEqual(xs[i - 1]! - CLOSE);
    // Released on the line, exactly
    const guide = held!.guides[0]!;
    const upright = Math.abs(guide.from.x - guide.to.x) < CLOSE;
    const after = (await shapeOverlay(page))!;
    expect(
        after.spots.some((p) =>
            upright
                ? Math.abs(p.x - guide.from.x) < CLOSE
                : Math.abs(p.y - guide.from.y) < CLOSE,
        ),
    ).toBe(true);
    expect(after.guides).toEqual([]);
});

test("change: moving a selected placed box shows the guide where its edge lands on a line, and saves it there (#444)", async ({
    show,
}) => {
    const { page } = show;
    await placeBox(show);
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const frontHash = grid.centerFront.y - 28 * S;
    const t1 = await marcherScreen(page, 1);
    await page.mouse.click(t1.x, t1.y);
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
    const before = await savedPositions(show, 0);
    const front = Math.max(...before.map((p) => p.y));
    const left = Math.min(...before.map((p) => p.x));
    const back = Math.min(...before.map((p) => p.y));
    // Between the marchers, off the center dot
    const grab = { x: left + (5 / 3) * S, y: (back + front) / 2 };
    const perUnit = await screenPerUnit(page, grid.centerFront);
    const near = Math.min(3, (S / 4) * perUnit * 0.8) / perUnit;
    let held: HeldGuides | null = null;
    await drag(
        page,
        await toScreen(page, grab),
        await toScreen(page, {
            x: grab.x,
            y: grab.y + frontHash - front + near,
        }),
        {
            beforeRelease: async () => {
                held = await heldGuides(page);
            },
        },
    );
    expect(held!.guides.map((g) => g.label)).toEqual(["On FH"]);
    await expect
        .poll(async () =>
            Math.max(...(await savedPositions(show, 0)).map((p) => p.y)),
        )
        .toBeCloseTo(frontHash, 3);
    await waitForIdle(page);
    expect((await shapeOverlay(page))!.guides).toEqual([]);
});

test("change: clicking the picked kind in the Shapes tab closes the tool while nothing is drawn, and does nothing once a box is", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    await selectAll(page);
    await page.getByRole("tab", { name: "Shapes" }).click();
    const box = page.getByTestId("shapes-tab-block");
    const hint = page.getByTestId("shape-tool-hint");

    // Armed with nothing drawn: a second click closes the tool
    await box.click();
    await expect(hint).toBeVisible();
    await box.click();
    await expect(hint).toBeHidden();
    await expect(box).toHaveAttribute("aria-pressed", "false");
    expect((await readField(page)).selection).toEqual(ALL);

    // Drawn: the click does nothing, and Escape still discards
    await box.click();
    await drag(
        page,
        await toScreen(page, { x: cf.x - 15 * S, y: cf.y - 25 * S }),
        await toScreen(page, { x: cf.x - 5 * S, y: cf.y - 19 * S }),
    );
    const drawn = (await shapeOverlay(page))!;
    await box.click();
    await expect(box).toHaveAttribute("aria-pressed", "true");
    expect((await shapeOverlay(page))!.spots).toEqual(drawn.spots);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    expect(await savedPositions(show, 0)).toEqual(asPositions(HOME));
});

test("change: a placed box comes back turned and flipped when selected again", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    const editor = page.getByTestId("shape-tool-readout");
    await editor.getByTestId("shape-editor-rotation").click();
    await page.getByTestId("shape-editor-rotation-input").fill("30");
    await page.getByTestId("shape-editor-rotation-input").press("Enter");
    await editor.getByTestId("shape-editor-flip-deep").click();
    const turned = await editor
        .getByTestId("shape-editor-rotation")
        .innerText();
    expect(turned).not.toBe("0°");

    await page.keyboard.press("Enter");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    await waitForIdle(page);
    await page.keyboard.press("Escape");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([]);
    const [recipe] = await show.query<{ params: string }>(
        "SELECT params FROM timeline_shape_recipes",
    );
    const stored = JSON.parse(recipe.params);
    expect(stored.flipY ?? stored.flipX).toBe(true);

    const t1 = await marcherScreen(page, 1);
    await page.mouse.click(t1.x, t1.y);
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
    await expect(
        page
            .getByTestId("placed-box-readout")
            .getByTestId("shape-editor-rotation"),
    ).toHaveText(turned);
});

// How a shape is filled (#386, spec #385): the host's distributor lays the
// box out in Files, Short back, as it always was, and the recipe keeps the
// distribution. The floating editor's mode switch, on its second row (#435),
// offers Grid, Outline and Spread.

test("change: a placed box keeps its distribution, Files with the short rank at the back, and the mode switch shows Grid", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    await expect(
        page.getByTestId("shape-tool-readout").getByTestId("shape-mode-menu"),
    ).toBeVisible();
    await expect(page.getByTestId("shape-mode-menu")).toHaveAttribute(
        "data-mode",
        "files",
    );
    expect(await modeNames(page)).toEqual(["Grid", "Outline", "Spread"]);
    const spots = (await shapeOverlay(page))!.spots;

    await page.keyboard.press("Enter");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    // Everyone stands on a spot the open box showed
    await expect
        .poll(async () =>
            (await savedPositions(show, 0)).every((p) =>
                spots.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < CLOSE),
            ),
        )
        .toBe(true);
    await waitForIdle(page);
    const [recipe] = await show.query<{ params: string }>(
        "SELECT params FROM timeline_shape_recipes",
    );
    const stored = JSON.parse(recipe.params);
    expect(stored.distribution).toEqual({
        mode: "files",
        layout: { family: "shortBack", files: stored.files, byFile: false },
        stagger: [0, 1],
    });
    expect(stored).not.toHaveProperty("pattern");

    // Selected again, the placed box is read back from its recipe, in Files
    await page.keyboard.press("Escape");
    const t1 = await marcherScreen(page, 1);
    await page.mouse.click(t1.x, t1.y);
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
    await expect(page.getByTestId("shape-mode-menu")).toHaveAttribute(
        "data-mode",
        "files",
    );
});

test("change: the editor's second row holds the mode menu, a divider and then the layout menu, the gap menu only in Outline and Reshuffle only in Spread (#435)", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    const editor = page.getByTestId("shape-tool-readout");
    const bar = editor.getByTestId("shape-tool-readout-bar");
    const row = editor.getByTestId("shape-tool-readout-fill");
    const modes = row.getByTestId("shape-mode-menu");
    const layout = row.getByTestId("shape-layout-menu");
    await expect(modes).toBeVisible();
    await expect(layout).toBeVisible();
    await expect(bar.getByTestId("shape-mode-menu")).toHaveCount(0);
    const box = async (l: Locator) => (await l.boundingBox())!;
    // Under the bar, the mode menu first, then a divider before the layout menu
    expect((await box(row)).y).toBeGreaterThan((await box(bar)).y);
    expect((await box(modes)).x).toBeLessThan((await box(layout)).x);
    const extras = row.getByTestId("shape-tool-readout-mode-extras");
    await expect(extras.getByTestId("shape-layout-menu")).toBeVisible();
    expect(
        await extras.evaluate((el) => getComputedStyle(el).borderLeftWidth),
    ).toBe("1px");
    await expect(row.getByTestId("outline-gap-menu")).toHaveCount(0);
    await expect(editor.getByTestId("shape-editor-reshuffle")).toHaveCount(0);

    // Outline on 8 has no gap to place: no gap menu, and no layout
    await pickMode(page, "outline");
    await expect(layout).toHaveCount(0);
    await expect(row.getByTestId("outline-gap-menu")).toHaveCount(0);
    // Nothing after the menu: no divider either
    await expect(extras).toBeHidden();

    // Spread: Reshuffle on the second row, not the bar
    await pickMode(page, "spread");
    await expect(row.getByTestId("shape-editor-reshuffle")).toBeVisible();
    await expect(bar.getByTestId("shape-editor-reshuffle")).toHaveCount(0);
    expect((await box(modes)).x).toBeLessThan(
        (await box(row.getByTestId("shape-editor-reshuffle"))).x,
    );
});

test("change: from the keyboard, Tab reaches the pivot button, Enter opens the grid on the pivot, an arrow and Enter pick another, and the shape stays open (#435)", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    const editor = page.getByTestId("shape-tool-readout");
    const pivotButton = editor.getByTestId("shape-editor-pivot");
    await editor.getByTestId("shape-editor-rotation").focus();
    await page.keyboard.press("Tab");
    await expect(pivotButton).toBeFocused();
    await page.keyboard.press("Enter");
    const grid = page.getByTestId("shape-editor-pivot-grid");
    await expect(grid.getByTestId("shape-editor-pivot-grid-c")).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(grid.getByTestId("shape-editor-pivot-grid-w")).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(grid.getByTestId("shape-editor-pivot-grid-nw")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(grid).toBeHidden();
    await expect(pivotButton).toHaveAttribute("data-pivot", "nw");
    await expect(pivotButton).toBeFocused();
    // Enter picked the pivot: it didn't place the shape
    await expect(editor).toBeVisible();
    expect(await savedPositions(show, 0)).toEqual(asPositions(HOME));
});

test("change: from the keyboard, Tab reaches the mode menu, Enter opens it on Grid, and an arrow and Enter fill the box in Outline (#435)", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    const editor = page.getByTestId("shape-tool-readout");
    const modes = editor.getByTestId("shape-mode-menu");
    await editor.getByTestId("shape-editor-place").focus();
    await page.keyboard.press("Tab");
    await expect(modes).toBeFocused();
    await page.keyboard.press("Enter");
    const menu = page.getByTestId("shape-mode-menu-content");
    await expect(menu.getByTestId("shape-mode-files")).toBeFocused();
    // Each mode pictured by one example shared by every kind, not this box's
    // 8 marchers, which are all on its edge
    await expect(menu.getByTestId("shape-mode-preview-files")).toHaveAttribute(
        "data-spots",
        "12",
    );
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByTestId("shape-mode-outline")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(menu).toBeHidden();
    await expect(modes).toHaveAttribute("data-mode", "outline");
    await expect(modes).toBeFocused();
    await expect(editor).toBeVisible();
    expect(await savedPositions(show, 0)).toEqual(asPositions(HOME));
});

test("change: from the keyboard, Tab reaches the layout menu, Enter opens it on the box's layout, and an arrow and Enter pick another (#435)", async ({
    show,
}) => {
    const { page } = show;
    await page.evaluate(() =>
        localStorage.removeItem("openmarch:shapeLastLayout"),
    );
    await drawBox(show);
    const editor = page.getByTestId("shape-tool-readout");
    const layout = editor.getByTestId("shape-layout-menu");
    // 8 in a 4 × 2 is a whole block: it reads as Full (#437)
    await expect(layout).toHaveText(/Full/);
    await page.getByTestId("shape-mode-menu").focus();
    await page.keyboard.press("Tab");
    await expect(layout).toBeFocused();
    await page.keyboard.press("Enter");
    const menu = page.getByTestId("shape-layout-menu-content");
    await expect(menu.getByTestId("shape-layout-menu-row-full")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(
        menu.getByTestId("shape-layout-menu-row-stagger"),
    ).toBeFocused();
    // The versions follow the keyboard
    await expect(
        menu.getByTestId("shape-layout-menu-version-stagger-0"),
    ).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(menu).toBeHidden();
    await expect(layout).toHaveText(/Stagger/);
    await expect(layout).toBeFocused();
    await expect(editor).toBeVisible();
    expect(await savedPositions(show, 0)).toEqual(asPositions(HOME));
});

// Outline (#390): spots round the edge at the interval with one on every
// corner, in the space the box took up. An odd count takes one spot out of a
// side: by default the back spreads evenly; "Leaves a gap" shows the gap as a
// dashed ring, and a click on another spot between corners moves it there.

/**
 * An option of the outline gap (#390), in the floating editor's gap menu on its second row
 * (#435): opens the menu first when it's closed.
 */
async function gapOption(page: Page, testId: string) {
    if ((await page.getByTestId("outline-gap-side").count()) === 0)
        await page.getByTestId("outline-gap-menu").click();
    return page.getByTestId(testId);
}

/**
 * Opens the box tool on T1–T7 (an odd count), draws a box, switches it to
 * Outline and picks "Leaves a gap". Checks its corners and that the gap starts
 * on the back, near its middle; returns the open outline, its edges and the
 * undo steps before.
 */
async function outlineOnSeven(show: Show) {
    const { page } = show;
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    await selectAll(page);
    await clickMarcher(page, "T8", { add: true });
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL.slice(0, 7));
    await page.keyboard.press("b");
    await drag(
        page,
        await toScreen(page, { x: cf.x - 15 * S, y: cf.y - 25 * S }),
        await toScreen(page, { x: cf.x - 5 * S, y: cf.y - 19 * S }),
    );
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();
    const steps = await undoSteps(show);
    await pickMode(page, "outline");
    // The short side spreads evenly by default, with no gap to show; "Leaves
    // a gap" shows the gap
    await expect(await gapOption(page, "outline-gap-spread")).toHaveAttribute(
        "data-state",
        "on",
    );
    expect((await shapeOverlay(page))!.gaps).toEqual([]);
    // The spread back's own spacing, as a muted note after the pill, and why, in its tooltip
    // and its description (owner on #459, B2). The menu closed first: its trigger again
    if ((await page.getByTestId("outline-gap-side").count()) > 0)
        await page.getByTestId("outline-gap-menu").click();
    await expect(page.getByTestId("outline-gap-side")).toHaveCount(0);
    const note = page.getByTestId("outline-gap-spacing");
    await expect(note).toHaveText(/^· .+ steps?$/);
    await expect(note.locator('[data-glyph="across"]')).toHaveCount(1);
    const pill = page.getByTestId("outline-gap-menu");
    await expect(pill).toHaveAccessibleDescription(
        /^The back has one fewer marcher, so its marchers are .+ apart\.$/,
    );
    // (a tooltip waits for the pointer to leave after the press that closed the menu)
    await page.mouse.move(5, 5);
    await pill.hover();
    await expect(page.getByRole("tooltip")).toContainText("one fewer marcher");
    // The note itself says it too, hovered; it still takes no focus
    await page.mouse.move(5, 5);
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await note.hover();
    await expect(page.getByRole("tooltip")).toContainText(
        /^The back has one fewer marcher, so its marchers are .+ apart\.$/,
    );
    await expect(note).not.toHaveAttribute("tabindex");
    await (await gapOption(page, "outline-gap-gap")).click();
    // Leaving a gap, the back keeps the full spacing: no note
    await expect(note).toHaveCount(0);
    await expect
        .poll(async () => (await shapeOverlay(page))?.gaps.length)
        .toBe(1);

    const open = (await shapeOverlay(page))!;
    expect(open.spots).toHaveLength(7);
    const xs = open.outline!.map((p) => p.x);
    const ys = open.outline!.map((p) => p.y);
    const [left, right] = [Math.min(...xs), Math.max(...xs)];
    const [back, front] = [Math.min(...ys), Math.max(...ys)];
    const isCorner = (p: Point) =>
        (Math.abs(p.x - left) < CLOSE || Math.abs(p.x - right) < CLOSE) &&
        (Math.abs(p.y - back) < CLOSE || Math.abs(p.y - front) < CLOSE);
    // Every corner has a marcher; the gap is on the back, near its middle
    for (const x of [left, right])
        for (const y of [back, front])
            expect(
                open.spots.some((s) => Math.hypot(s.x - x, s.y - y) < CLOSE),
            ).toBe(true);
    const [gap] = open.gaps;
    expect(gap!.y).toBeCloseTo(back, 3);
    const across = Math.min(
        ...open.spots
            .filter((s) => Math.abs(s.y - front) < CLOSE)
            .map((s, _, row) =>
                Math.min(
                    ...row
                        .filter((o) => o !== s)
                        .map((o) => Math.abs(o.x - s.x)),
                ),
            ),
    );
    expect(Math.abs(gap!.x - (left + right) / 2)).toBeLessThanOrEqual(
        across / 2 + CLOSE,
    );
    await expect(await gapOption(page, "outline-gap-back")).toHaveAttribute(
        "data-state",
        "on",
    );
    return { open, gap: gap!, back, isCorner, steps };
}

test("change: from the keyboard, Tab reaches the Leftover menu, Enter opens it on the gap's side, an arrow and Enter pick another, and Escape hands focus back (#435)", async ({
    show,
}) => {
    const { page } = show;
    await outlineOnSeven(show);
    const menuButton = page.getByTestId("outline-gap-menu");
    // outlineOnSeven left the menu open from a click
    await menuButton.click();
    await expect(page.getByTestId("outline-gap-side")).toHaveCount(0);
    await page.getByTestId("shape-mode-menu").focus();
    await page.keyboard.press("Tab");
    await expect(menuButton).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("outline-gap-back")).toBeFocused();
    // An open shape: a tip says a click on the outline moves the gap
    await expect(page.getByTestId("outline-gap-tip")).toHaveText(
        "Click a marcher on the outline (not a corner) to move the gap there.",
    );
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("outline-gap-front")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("outline-gap-front")).toHaveAttribute(
        "data-state",
        "on",
    );
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("outline-gap-side")).toHaveCount(0);
    await expect(menuButton).toBeFocused();
    await expect(menuButton).toHaveText(/Front/);
    // Escape closed the menu, not the shape
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();
});

test("change: Outline spaces the back and front at across and the sides at deep; widening it stretches the across spacing, the counts kept, and Even out moves marchers onto the long sides (#458, owner on #459)", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    await selectAll(page);
    await page.keyboard.press("b");
    await expect(page.getByTestId("shape-tool-hint")).toBeVisible();
    // A square 6 steps a side: 8 go round it 3 a side
    await drag(
        page,
        await toScreen(page, { x: cf.x - 15 * S, y: cf.y - 25 * S }),
        await toScreen(page, { x: cf.x - 9 * S, y: cf.y - 19 * S }),
    );
    await pickMode(page, "outline");
    const bar = page.getByTestId("shape-tool-readout");
    /** Spots on the back and on the left side, corners counted on both */
    const sides = async () => {
        const { spots } = (await shapeOverlay(page))!;
        const top = Math.min(...spots.map((p) => p.y));
        const left = Math.min(...spots.map((p) => p.x));
        return {
            back: spots.filter((p) => Math.abs(p.y - top) < CLOSE).length,
            left: spots.filter((p) => Math.abs(p.x - left) < CLOSE).length,
        };
    };
    expect(await sides()).toEqual({ back: 3, left: 3 });
    const across = bar.getByTestId("shape-editor-across");
    const deep = bar.getByTestId("shape-editor-deep");
    const spacings = async () => [
        await across.innerText(),
        await deep.innerText(),
    ];
    const before = await spacings();

    // Widened to about three times as wide: the across spacing follows the handle, the counts
    // and the deep spacing kept (owner on #459)
    const { handles } = (await shapeOverlay(page))!;
    const maxX = Math.max(...handles.map((h) => h.x));
    const east = handles
        .filter((h) => Math.abs(h.x - maxX) < 1)
        .sort((a, b) => a.y - b.y)[1]!;
    const to = await toScreen(page, { x: cf.x + 3.3 * S, y: 0 });
    await drag(page, east, { x: to.x, y: east.y });
    expect(await sides()).toEqual({ back: 3, left: 3 });
    const stretched = await spacings();
    expect(stretched[0]).not.toEqual(before[0]);
    expect(stretched[1]).toEqual(before[1]);

    // Even out moves marchers onto the long sides
    await page.evaluate(() =>
        (document.activeElement as HTMLElement | null)?.blur(),
    );
    await bar.getByTestId("shape-editor-even-out").click();
    expect(await sides()).toEqual({ back: 4, left: 2 });
});

test("change: 2 steps across then 3 deep stay exactly as typed; dragging the front stretches the deep spacing with the back fixed; Even out spreads them as evenly as the box allows (#458, owner on #459)", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    await pickMode(page, "outline");
    const bar = page.getByTestId("shape-tool-readout");
    const across = bar.getByTestId("shape-editor-across");
    const deep = bar.getByTestId("shape-editor-deep");
    const bounds = async () => {
        const o = (await shapeOverlay(page))!.outline!;
        const xs = o.map((p) => p.x);
        const ys = o.map((p) => p.y);
        return {
            left: Math.min(...xs),
            right: Math.max(...xs),
            top: Math.min(...ys),
            bottom: Math.max(...ys),
        };
    };
    // The owner's case: 2 across, Tab to deep, 3, and both stay exactly as typed
    await across.click();
    await page.getByTestId("shape-editor-across-input").fill("2");
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("shape-editor-deep-input")).toBeFocused();
    await page.getByTestId("shape-editor-deep-input").fill("3");
    await page.keyboard.press("Enter");
    await expect(across).toHaveText("2");
    await expect(deep).toHaveText("3");
    await expect(bar.getByTestId("shape-editor-across-snap")).toHaveCount(0);
    await expect(bar.getByTestId("shape-editor-deep-snap")).toHaveCount(0);

    // The front dragged down: the deep spacing follows on half steps, the back stays, and the
    // across spacing and the counts stay (owner on #459)
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const was = await bounds();
    const frontHandle = async () => {
        const { handles } = (await shapeOverlay(page))!;
        const b = await bounds();
        const want = await toScreen(page, {
            x: (b.left + b.right) / 2,
            y: b.bottom,
        });
        return handles.reduce((h, k) =>
            Math.hypot(k.x - want.x, k.y - want.y) <
            Math.hypot(h.x - want.x, h.y - want.y)
                ? k
                : h,
        );
    };
    const s = await frontHandle();
    await page.evaluate(() =>
        (document.activeElement as HTMLElement | null)?.blur(),
    );
    const ranks = Math.round((was.bottom - was.top) / S / 3);
    await drag(page, s, { x: s.x, y: s.y + 30 });
    const now = await bounds();
    expect(Math.abs(now.top - was.top)).toBeLessThan(1e-6);
    expect(now.bottom).toBeGreaterThan(was.bottom);
    // The same gaps deep, each longer
    expect((now.bottom - now.top) / S / ranks).toBeGreaterThan(3 + 1e-6);
    await expect(across).toHaveText("2");
    await expect(deep).not.toHaveText("3");
    const dragged = await deep.innerText();

    // Across set to ½ step, far from deep's 3: uneven now. Even out: as even as this frame
    // allows, one undo step; then nothing more to do
    await across.click();
    await page.getByTestId("shape-editor-across-input").fill("0.5");
    await page.keyboard.press("Enter");
    await expect(across).toHaveText("½");
    const evenOut = bar.getByTestId("shape-editor-even-out");
    await expect(evenOut).toBeEnabled();
    const evenFrame = await bounds();
    await evenOut.click();
    await expect(evenOut).toBeDisabled();
    const after = await bounds();
    expect(
        Math.abs(after.right - after.left - (evenFrame.right - evenFrame.left)),
    ).toBeLessThan(S / 2);
    await page.keyboard.press("ControlOrMeta+z");
    await expect(across).toHaveText("½");
    await expect(deep).toHaveText(dragged);
});

test("change: Even out has an icon, its word only while it can act; a press glides the marchers to their spots as one undo step, and lands them where reduced motion puts them at once (owner on #459)", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    await pickMode(page, "outline");
    const bar = page.getByTestId("shape-tool-readout");
    const across = bar.getByTestId("shape-editor-across");
    const evenOut = bar.getByTestId("shape-editor-even-out");
    // Across set to ½ step: uneven, so Even out can act, its icon and word showing
    await across.click();
    await page.getByTestId("shape-editor-across-input").fill("0.5");
    await page.keyboard.press("Enter");
    await expect(across).toHaveText("½");
    await expect(evenOut).toBeEnabled();
    await expect(evenOut.locator("svg")).toHaveCount(1);
    await expect(evenOut).toContainText("Even out");
    const before = (await shapeOverlay(page))!.spots;

    // Pressed: the spots glide (seen part way), then settle; nothing more to even, icon only
    const sawGlide = await page.evaluate(async () => {
        (
            document.querySelector(
                '[data-testid="shape-editor-even-out"]',
            ) as HTMLElement
        ).click();
        const end = performance.now() + 600;
        let seen = false;
        while (performance.now() < end) {
            await new Promise(requestAnimationFrame);
            if (window.fieldTest!.shapeOverlay!()?.gliding) seen = true;
        }
        return seen;
    });
    expect(sawGlide).toBe(true);
    const glided = (await shapeOverlay(page))!.spots;
    expect(glided).not.toEqual(before);
    await expect(evenOut).toBeDisabled();
    await expect(evenOut.locator("svg")).toHaveCount(1);
    await expect(evenOut).not.toContainText("Even out");

    // One undo step takes it back exactly
    await page.keyboard.press("ControlOrMeta+z");
    await expect(across).toHaveText("½");
    expect((await shapeOverlay(page))!.spots).toEqual(before);

    // With reduced motion: no glide at all, and the same spots
    await page.emulateMedia({ reducedMotion: "reduce" });
    const glidedReduced = await page.evaluate(async () => {
        (
            document.querySelector(
                '[data-testid="shape-editor-even-out"]',
            ) as HTMLElement
        ).click();
        let seen = false;
        for (let k = 0; k < 20; k++) {
            await new Promise(requestAnimationFrame);
            if (window.fieldTest!.shapeOverlay!()?.gliding) seen = true;
        }
        return seen;
    });
    expect(glidedReduced).toBe(false);
    expect((await shapeOverlay(page))!.spots).toEqual(glided);
});

test("change: Outline on 7 spreads the back by default, leaves its middle out on request, a click on a spot between corners moves the gap, and the placed box keeps it", async ({
    show,
}) => {
    const { page } = show;
    const { open, gap, back, isCorner, steps } = await outlineOnSeven(show);

    // A click on a spot between corners off the back moves the gap there
    const target = open.spots.find(
        (s) => !isCorner(s) && Math.abs(s.y - back) > CLOSE,
    )!;
    const at = await toScreen(page, target);
    await page.mouse.click(at.x, at.y);
    await expect
        .poll(async () => {
            const moved = (await shapeOverlay(page))!.gaps[0];
            return moved && Math.hypot(moved.x - target.x, moved.y - target.y);
        })
        .toBeLessThan(CLOSE);
    const moved = (await shapeOverlay(page))!;
    expect(moved.spots).toHaveLength(7);
    expect(
        moved.spots.some(
            (s) => Math.hypot(s.x - target.x, s.y - target.y) < CLOSE,
        ),
    ).toBe(false);
    // The old gap has a marcher again
    expect(
        moved.spots.some((s) => Math.hypot(s.x - gap!.x, s.y - gap!.y) < CLOSE),
    ).toBe(true);

    // "Spreads evenly" spreads that side and leaves no gap to show
    await (await gapOption(page, "outline-gap-spread")).click();
    await expect
        .poll(async () => (await shapeOverlay(page))!.gaps.length)
        .toBe(0);
    expect((await shapeOverlay(page))!.spots).toHaveLength(7);
    // Undo brings the gap back
    await page.keyboard.press("ControlOrMeta+z");
    await expect
        .poll(async () => (await shapeOverlay(page))!.gaps.length)
        .toBe(1);

    // Placed, the recipe keeps the gap, and everyone stands on a spot
    const spots = (await shapeOverlay(page))!.spots;
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    await expect.poll(() => undoSteps(show)).toBe(steps + 1);
    await waitForIdle(page);
    const [recipe] = await show.query<{ params: string }>(
        "SELECT params FROM timeline_shape_recipes",
    );
    const stored = JSON.parse(recipe.params);
    expect(stored.distribution.mode).toBe("outline");
    expect(stored.distribution.oddGap.style).toBe("gap");
    expect(stored.distribution.oddGap.side).not.toBe("back");
    const placed = (await savedPositions(show, 0)).filter((p) => p.id !== 8);
    expect(
        placed.every((p) =>
            spots.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < CLOSE),
        ),
    ).toBe(true);
});

// Even spread (#391, spec #385): a scatter with no visible files, no pair closer
// than one interval. Reshuffle in the chip and the inspector moves to the next
// seed as one undo step, keeping the shape's frame and outline (#439), and the
// recipe keeps the seed and generator.

/** The closest distance between any two spots */
const closestPair = (spots: readonly Point[]) =>
    Math.min(
        ...spots.flatMap((p, i) =>
            spots.slice(i + 1).map((q) => Math.hypot(q.x - p.x, q.y - p.y)),
        ),
    );

const sameSpots = (a: readonly Point[], b: readonly Point[]) =>
    a.length === b.length &&
    a.every((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y) < CLOSE);

test("change: Spread scatters the box one interval apart, Reshuffle gives a new layout in the same outline as one undo step, and the placed box reshuffles again", async ({
    show,
}) => {
    const { page } = show;
    const { grid } = await drawBox(show);
    const S = grid.pixelsPerStep;
    const steps = await undoSteps(show);
    const bar = page.getByTestId("shape-tool-readout");
    await expect(page.getByTestId("shape-editor-reshuffle")).toHaveCount(0);
    const asGrid = (await shapeOverlay(page))!;

    await pickMode(page, "spread");
    await expect(page.getByTestId("shape-mode-menu")).toHaveAttribute(
        "data-mode",
        "spread",
    );
    // A spread has no files or ranks: the chip shows its one spacing
    await expect(bar.getByTestId("shape-editor-size")).toHaveCount(0);
    await expect(bar.getByTestId("shape-editor-deep")).toHaveCount(0);
    // Steps as the chip writes them: "2", "1½", "½"
    const text = await bar.getByTestId("shape-editor-across").innerText();
    const across =
        Number(text.replace("½", "") || 0) + (text.includes("½") ? 0.5 : 0);
    const opened = (await shapeOverlay(page))!;
    const first = opened.spots;
    expect(first).toHaveLength(ALL.length);
    // Spread fills the box drawn: the outline is the grid's, to the pixel (#439)
    expect(sameSpots(opened.outline!, asGrid.outline!)).toBe(true);
    expect(closestPair(first)).toBeGreaterThan(across * S - CLOSE);
    expect(closestPair(first)).toBeLessThan(across * S * 1.2);

    // Reshuffle in the chip: a new layout in the same outline, no closer
    const reshuffle = bar.getByTestId("shape-editor-reshuffle");
    await expect(reshuffle).toHaveAttribute("data-seed", "1");
    await reshuffle.click();
    await expect(reshuffle).toHaveAttribute("data-seed", "2");
    const reshuffled = (await shapeOverlay(page))!;
    const second = reshuffled.spots;
    expect(sameSpots(first, second)).toBe(false);
    expect(sameSpots(reshuffled.outline!, opened.outline!)).toBe(true);
    expect(closestPair(second)).toBeGreaterThan(across * S - CLOSE);

    // One undo step brings the first layout back, redo the second
    await page.keyboard.press("ControlOrMeta+z");
    await expect(reshuffle).toHaveAttribute("data-seed", "1");
    expect(sameSpots((await shapeOverlay(page))!.spots, first)).toBe(true);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect(reshuffle).toHaveAttribute("data-seed", "2");
    expect(sameSpots((await shapeOverlay(page))!.spots, second)).toBe(true);

    // Enter places everyone on the spread as one undo step, its seed kept
    await page.keyboard.press("Enter");
    await expect(bar).toBeHidden();
    await expect.poll(() => onSpots(show, second)).toBe(true);
    await waitForIdle(page);
    expect(await undoSteps(show)).toBe(steps + 1);
    const recipeParams = async () => {
        const [recipe] = await show.query<{ params: string }>(
            "SELECT params FROM timeline_shape_recipes",
        );
        return JSON.parse(recipe.params);
    };
    expect((await recipeParams()).distribution).toEqual({
        mode: "spread",
        seed: 2,
        generator: 2,
        count: ALL.length,
    });

    // Selected again, it reopens in Spread at its seed; the editor's
    // Reshuffle saves the next layout as one undo step
    await page.keyboard.press("Escape");
    const t1 = await marcherScreen(page, 1);
    await page.mouse.click(t1.x, t1.y);
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
    await expect(page.getByTestId("shape-mode-menu")).toHaveAttribute(
        "data-mode",
        "spread",
    );
    const again = page
        .getByTestId("placed-box-readout")
        .getByTestId("shape-editor-reshuffle");
    await expect(again).toHaveAttribute("data-seed", "2");
    await again.click();
    await expect
        .poll(async () => (await recipeParams()).distribution.seed)
        .toBe(3);
    await waitForIdle(page);
    expect(await undoSteps(show)).toBe(steps + 2);
    // The marchers moved to the new layout
    await expect.poll(() => onSpots(show, second)).toBe(false);
});

test("change: a Spread box's handle drags its side where the pointer goes, the other sides staying put, and back in Grid it keeps the space (#439)", async ({
    show,
}) => {
    const { page } = show;
    const { grid: field } = await drawBox(show);
    const { zoom } = (await readField(page)).viewport;
    // Half a step on the screen: how near the dragged side lands to the pointer
    const halfStep = (field.pixelsPerStep / 2) * zoom;
    await pickMode(page, "spread");
    const before = (await shapeOverlay(page))!;
    const xs = (o: FieldTestShapeOverlay) => o.handles.map((p) => p.x);
    const ys = (o: FieldTestShapeOverlay) => o.handles.map((p) => p.y);
    const east = before.handles.reduce((a, b) => (b.x > a.x ? b : a));
    await drag(page, east, { x: east.x + 60, y: east.y }, { steps: 20 });
    const after = (await shapeOverlay(page))!;
    // The west side and the depth where they were; the east side by the pointer
    expect(
        Math.abs(Math.min(...xs(after)) - Math.min(...xs(before))),
    ).toBeLessThan(1);
    expect(
        Math.abs(Math.min(...ys(after)) - Math.min(...ys(before))),
    ).toBeLessThan(1);
    expect(
        Math.abs(Math.max(...ys(after)) - Math.max(...ys(before))),
    ).toBeLessThan(1);
    expect(
        Math.abs(Math.max(...xs(after)) - (east.x + 60)),
    ).toBeLessThanOrEqual(halfStep / 2 + 1);
    // Released, the marchers stand inside the new outline (field units)
    const ox = after.outline!.map((p) => p.x);
    for (const p of after.spots) {
        expect(p.x).toBeGreaterThanOrEqual(Math.min(...ox) - 1e-6);
        expect(p.x).toBeLessThanOrEqual(Math.max(...ox) + 1e-6);
    }
    // Back in Grid, the box takes up the same space, as near as half steps allow
    await pickMode(page, "files");
    const grid = (await shapeOverlay(page))!;
    const gx = grid.outline!.map((p) => p.x);
    expect(
        Math.abs(
            Math.max(...gx) -
                Math.min(...gx) -
                (Math.max(...ox) - Math.min(...ox)),
        ),
    ).toBeLessThan(2 * field.pixelsPerStep);
});

test("change: Edge on a Spread box stands marchers along its outline, the box staying put, kept by Reshuffle and undone in one step (#450)", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    await pickMode(page, "spread");
    const editor = page.getByTestId("shape-tool-readout");
    const edge = editor.getByTestId("shape-editor-edge");
    await expect(edge).toHaveAttribute("data-state", "off");
    const before = (await shapeOverlay(page))!;
    await edge.click();
    await expect(edge).toHaveAttribute("data-state", "on");
    const on = (await shapeOverlay(page))!;
    // The box stays where it was drawn
    expect(sameSpots(on.outline!, before.outline!)).toBe(true);
    const xs = on.outline!.map((p) => p.x);
    const ys = on.outline!.map((p) => p.y);
    const [left, right, top, bottom] = [
        Math.min(...xs),
        Math.max(...xs),
        Math.min(...ys),
        Math.max(...ys),
    ];
    const onEdge = (p: Point) =>
        Math.min(
            Math.abs(p.x - left),
            Math.abs(p.x - right),
            Math.abs(p.y - top),
            Math.abs(p.y - bottom),
        ) < 0.01;
    // Some stand on the outline, about 1½ intervals apart, everyone on or inside it
    expect(on.spots.filter(onEdge).length).toBeGreaterThan(0);
    for (const p of on.spots) {
        expect(p.x).toBeGreaterThanOrEqual(left - 0.01);
        expect(p.x).toBeLessThanOrEqual(right + 0.01);
        expect(p.y).toBeGreaterThanOrEqual(top - 0.01);
        expect(p.y).toBeLessThanOrEqual(bottom + 0.01);
    }
    // Reshuffle keeps the edge on and the box where it is
    await editor.getByTestId("shape-editor-reshuffle").click();
    await expect(edge).toHaveAttribute("data-state", "on");
    expect(
        sameSpots((await shapeOverlay(page))!.outline!, before.outline!),
    ).toBe(true);
    // Two undo steps: the Reshuffle, then the edge
    await page.keyboard.press("ControlOrMeta+z");
    await page.keyboard.press("ControlOrMeta+z");
    await expect(edge).toHaveAttribute("data-state", "off");
    expect(sameSpots((await shapeOverlay(page))!.spots, before.spots)).toBe(
        true,
    );
});

test("change: every mode switch keeps the box drawn: its center exactly, each side within half a step, and no drift however often it switches (#449)", async ({
    show,
}) => {
    const { page } = show;
    const { grid: field } = await drawBox(show);
    const half = field.pixelsPerStep / 2;
    const bounds = async () => {
        const o = (await shapeOverlay(page))!.outline!;
        const xs = o.map((p) => p.x);
        const ys = o.map((p) => p.y);
        return {
            left: Math.min(...xs),
            right: Math.max(...xs),
            top: Math.min(...ys),
            bottom: Math.max(...ys),
        };
    };
    const drawn = await bounds();
    // Each mode's box on its first visit: every later visit is that box exactly, no drift
    const first = new Map<string, Awaited<ReturnType<typeof bounds>>>([
        ["files", drawn],
    ]);
    const modes = [
        "outline",
        "files",
        "spread",
        "outline",
        "spread",
        "files",
    ] as const;
    for (const mode of [...modes, ...modes]) {
        await pickMode(page, mode);
        const now = await bounds();
        for (const side of ["left", "right", "top", "bottom"] as const)
            expect(
                Math.abs(now[side] - drawn[side]),
                `${mode}: ${side}`,
            ).toBeLessThanOrEqual(half + 0.01);
        expect((now.left + now.right) / 2).toBeCloseTo(
            (drawn.left + drawn.right) / 2,
            6,
        );
        expect((now.top + now.bottom) / 2).toBeCloseTo(
            (drawn.top + drawn.bottom) / 2,
            6,
        );
        const seen = first.get(mode);
        if (!seen) first.set(mode, now);
        else
            for (const side of ["left", "right", "top", "bottom"] as const)
                expect(now[side], `${mode} again: ${side}`).toBeCloseTo(
                    seen[side],
                    6,
                );
    }
});

test("change: Reshuffle's caret opens the spread's seed, and typing an earlier seed brings that spread back as one undo step (#437)", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    await pickMode(page, "spread");
    const editor = page.getByTestId("shape-tool-readout");
    const reshuffle = editor.getByTestId("shape-editor-reshuffle");
    const opened = (await shapeOverlay(page))!;
    const first = opened.spots;
    await reshuffle.click();
    await expect(reshuffle).toHaveAttribute("data-seed", "2");
    const second = (await shapeOverlay(page))!.spots;
    expect(sameSpots(first, second)).toBe(false);

    // From the keyboard: Tab from Reshuffle to its caret, Enter opens the seed
    await reshuffle.focus();
    await page.keyboard.press("Tab");
    const caret = editor.getByTestId("shape-editor-reshuffle-seed");
    await expect(caret).toBeFocused();
    await page.keyboard.press("Enter");
    const input = page.getByTestId("shape-editor-reshuffle-seed-input");
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("2");
    await expect(
        page.getByTestId("shape-editor-reshuffle-seed-menu"),
    ).toContainText("Same seed and count in the same shape: same spread");
    await expect(
        page.getByTestId("shape-editor-reshuffle-seed-count"),
    ).toHaveText("for 8 marchers");

    await input.fill("1");
    await page.keyboard.press("Enter");
    await expect(reshuffle).toHaveAttribute("data-seed", "1");
    // The seed keeps the focus, so a second Enter is the seed's too, not Place
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("1");
    await page.keyboard.press("Enter");
    await expect(input).toBeFocused();
    await expect
        .poll(async () => sameSpots((await shapeOverlay(page))!.spots, first))
        .toBe(true);
    // A typed seed is a layout in the same outline: the box didn't move (#439)
    expect(
        sameSpots((await shapeOverlay(page))!.outline!, opened.outline!),
    ).toBe(true);
    // Enter typed the seed: the shape is still open, nobody moved
    await expect(editor).toBeVisible();
    expect(await savedPositions(show, 0)).toEqual(asPositions(HOME));
    await page.keyboard.press("Escape");
    await expect(
        page.getByTestId("shape-editor-reshuffle-seed-menu"),
    ).toBeHidden();
    await expect(editor).toBeVisible();
    // One undo step of the open shape brings the second spread back
    await page.keyboard.press("ControlOrMeta+z");
    await expect(reshuffle).toHaveAttribute("data-seed", "2");
    expect(sameSpots((await shapeOverlay(page))!.spots, second)).toBe(true);
});

// The box's layouts (#387, spec #385; owner lab feedback 2026-10-23): the
// layout menu on the editor's second row lists Full · Stagger · Rounded ·
// Short back · Notched with live thumbnails, a layout the count can't make
// greyed in its place with what it needs, and ↻ turns the box a quarter. Picking a version lays the box out in it, the recipe keeps it, and
// the next box starts in it.

/** How many spots stand on each line across, back first */
const rankCounts = (spots: readonly Point[]) => {
    const by = new Map<number, number>();
    for (const s of spots) {
        const y = Math.round(s.y * 100) / 100;
        by.set(y, (by.get(y) ?? 0) + 1);
    }
    return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c);
};

test("change: the layout menu lays the box out in the version picked, the recipe keeps it, and the next box starts in it", async ({
    show,
}) => {
    const { page } = show;
    await page.evaluate(() =>
        localStorage.removeItem("openmarch:shapeLastLayout"),
    );
    await drawBox(show);
    const bar = page.getByTestId("shape-tool-readout");
    await bar.getByTestId("shape-layout-menu").click();
    const menu = page.getByTestId("shape-layout-menu-content");
    await menu.getByTestId("shape-layout-menu-row-stagger").hover();
    const stagger = menu.getByTestId("shape-layout-menu-version-stagger-0");
    await expect(stagger).toHaveText("3 × 3");
    await stagger.hover();
    await expect(page.getByRole("tooltip")).toHaveText(
        "Stagger 3 × 3: 3 / 2 / 3, front to back",
    );
    await expect(stagger).toHaveAttribute("aria-pressed", "false");

    await stagger.click();
    await expect(menu).toBeHidden();
    await expect(bar.getByTestId("shape-editor-size")).toHaveText("3 × 3");
    await expect(bar.getByTestId("shape-layout-menu")).toHaveText(/Stagger/);
    const spots = (await shapeOverlay(page))!.spots;
    expect(spots).toHaveLength(8);
    expect(rankCounts(spots)).toEqual([3, 2, 3]);

    await page.keyboard.press("Enter");
    await expect(bar).toBeHidden();
    await waitForIdle(page);
    const [recipe] = await show.query<{ params: string }>(
        "SELECT params FROM timeline_shape_recipes",
    );
    expect(JSON.parse(recipe.params).distribution).toEqual({
        mode: "files",
        layout: { family: "stagger", files: 3, byFile: false },
        stagger: [0, 1],
    });
    // Everyone stands on a spot the open box showed
    await expect
        .poll(async () =>
            (await savedPositions(show, 0)).every((p) =>
                spots.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < CLOSE),
            ),
        )
        .toBe(true);

    // The next box starts in the layout picked last
    await page.keyboard.press("Escape");
    await drawBox(show);
    await expect(
        page.getByTestId("shape-tool-readout").getByTestId("shape-layout-menu"),
    ).toHaveText(/Stagger/);
    expect(rankCounts((await shapeOverlay(page))!.spots)).toEqual([3, 2, 3]);
});

test("change: the layout menu keeps one size as each layout's versions show, every layout and two versions whole (#435)", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    await page.getByTestId("shape-layout-menu").click();
    const menu = page.getByTestId("shape-layout-menu-content");
    await expect(menu).toBeVisible();
    const sizes = new Set<string>();
    for (const family of ["full", "stagger", "rounded", "shortBack"]) {
        await menu.getByTestId(`shape-layout-menu-row-${family}`).hover();
        await expect(
            menu.getByTestId(`shape-layout-menu-version-${family}-0`),
        ).toBeVisible();
        const box = (await menu.boundingBox())!;
        sizes.add(`${box.x},${box.y},${box.width},${box.height}`);
    }
    expect([...sizes]).toHaveLength(1);
    // Tall enough for every layout and at least two whole versions (owner):
    // Short back's are the most
    const inside = async (l: Locator, outer: Locator) => {
        const a = (await l.boundingBox())!;
        const b = (await outer.boundingBox())!;
        return a.y >= b.y - 0.5 && a.y + a.height <= b.y + b.height + 0.5;
    };
    for (const family of ["full", "stagger", "rounded", "shortBack", "notched"])
        expect(
            await inside(
                menu.getByTestId(`shape-layout-menu-row-${family}`),
                menu,
            ),
        ).toBe(true);
    const versions = menu.getByTestId("shape-layout-menu-versions");
    let whole = 0;
    for (const v of await versions.getByRole("button").all())
        if (await inside(v, versions)) whole++;
    expect(whole).toBeGreaterThanOrEqual(2);
});

test("change: the layout menu under the chip switches layout, ↻ turns the box a quarter, and undo puts each back", async ({
    show,
}) => {
    const { page } = show;
    await page.evaluate(() =>
        localStorage.removeItem("openmarch:shapeLastLayout"),
    );
    await drawBox(show);
    const bar = page.getByTestId("shape-tool-readout");
    const before = (await shapeOverlay(page))!.spots;
    await bar.getByTestId("shape-layout-menu").click();
    const menu = page.getByTestId("shape-layout-menu-content");
    await expect(menu).toBeVisible();
    // Every layout in its place; Notched greyed with what it needs for 8
    await expect(
        menu.getByTestId("shape-layout-menu-row-notched"),
    ).toBeDisabled();
    await expect(menu.getByTestId("shape-layout-menu-row-notched")).toHaveText(
        /add 2/,
    );
    // Hovering a layout shows its versions beside the list
    await menu.getByTestId("shape-layout-menu-row-rounded").hover();
    await menu.getByTestId("shape-layout-menu-version-rounded-0").click();
    await expect(menu).toBeHidden();
    await expect(bar.getByTestId("shape-layout-menu")).toHaveText(/Rounded/);
    expect(rankCounts((await shapeOverlay(page))!.spots)).toEqual([2, 4, 2]);
    await expect(bar.getByTestId("shape-editor-size")).toHaveText("4 × 3");

    // ↻ turns it a quarter: the deep version, without the ⋯ row
    await bar.getByTestId("shape-editor-quarter-turn").click();
    await expect(bar.getByTestId("shape-editor-size")).toHaveText("3 × 4");
    expect(rankCounts((await shapeOverlay(page))!.spots)).toEqual([1, 3, 3, 1]);

    await page.keyboard.press("ControlOrMeta+z");
    await expect(bar.getByTestId("shape-editor-size")).toHaveText("4 × 3");
    await page.keyboard.press("ControlOrMeta+z");
    await expect
        .poll(async () => (await shapeOverlay(page))!.spots)
        .toEqual(before);
});

test("change: a right-button press on the floating editor doesn't hold it, so it can't stick when the menu takes the release (#437)", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    const editor = page.getByTestId("shape-tool-readout");
    await expect(editor).toHaveAttribute("data-held", "false");
    // On the bar's edge, clear of its buttons, once it stands still
    await page
        .getByTestId("shape-tool-readout-bar")
        .hover({ position: { x: 2, y: 2 } });
    // A left press holds it, until a moment after the release
    await page.mouse.down();
    await expect(editor).toHaveAttribute("data-held", "true");
    await page.mouse.up();
    await expect(editor).toHaveAttribute("data-held", "false");
    // A right press doesn't
    await page.mouse.down({ button: "right" });
    await expect(editor).toHaveAttribute("data-held", "false");
    await page.mouse.up({ button: "right" });
});

// The size number's − and + (owner lab feedback on #387; the owner picked
// center + glide in the lab): the box grows about its center without creeping,
// and the marchers glide to their new spots rather than jump.

const sizeButton = (page: Page, more: boolean) =>
    page.getByTestId("shape-tool-readout").getByRole("button", {
        name: more ? "One more across" : "One fewer across",
    });

test("change: the floating editor ends up in the same place after a change whether or not the pointer is on it (#437)", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    const editor = page.getByTestId("shape-tool-readout");
    /** Where it settles: the same box two frames apart, any hold after a press over */
    const settled = async () => {
        await expect(editor).toHaveAttribute("data-held", "false");
        let last = "";
        let now = "";
        await expect
            .poll(
                async () => {
                    const b = (await editor.boundingBox())!;
                    [last, now] = [
                        now,
                        `${Math.round(b.x)},${Math.round(b.y)}`,
                    ];
                    return now === last;
                },
                { timeout: 5000, intervals: [150] },
            )
            .toBe(true);
        return now;
    };
    const before = await settled();
    // One more across, pressed with the pointer on the editor, which stays there
    await sizeButton(page, true).click();
    const hovered = await settled();
    expect(hovered).not.toBe(before);
    // Leaving doesn't move it: there's no hold to let go of
    await page.mouse.move(5, 5);
    await page.waitForTimeout(400);
    expect(await settled()).toBe(hovered);

    // The same change with the pointer away lands in the same place
    await page.keyboard.press("ControlOrMeta+z");
    expect(await settled()).toBe(before);
    await page.mouse.move(5, 5);
    await sizeButton(page, true).evaluate((el: HTMLElement) => el.click());
    expect(await settled()).toBe(hovered);
});

test("change: quick clicks on + all land on +: the editor holds still while it's being clicked, then glides (#437)", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    const size = page
        .getByTestId("shape-tool-readout")
        .getByTestId("shape-editor-size");
    const before = await size.innerText();
    const across = Number(before.split("×")[0]!.trim());
    const plus = (await sizeButton(page, true).boundingBox())!;
    const at = { x: plus.x + plus.width / 2, y: plus.y + plus.height / 2 };
    // Three quick clicks at the same spot, without moving the pointer
    for (let i = 0; i < 3; i++) {
        await page.mouse.click(at.x, at.y);
        await page.waitForTimeout(120);
    }
    await expect(size).toHaveText(new RegExp(`^${across + 3} ×`));
});

test("change: − and + come back to the same spots, so the box doesn't creep", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    const before = (await shapeOverlay(page))!.spots;
    for (const more of [true, true, false, false, false, true]) {
        await sizeButton(page, more).click();
    }
    await expect
        .poll(async () => (await shapeOverlay(page))!.spots)
        .toEqual(before);
});

test.describe("the glide", () => {
    /** Presses + and reads the drawing 40 ms later, in one go, while a glide would still run */
    const plusAndPeek = (page: Page) =>
        page.evaluate(async () => {
            const plus = [...document.querySelectorAll("button")].find(
                (b) => b.getAttribute("aria-label") === "One more across",
            )!;
            plus.click();
            await new Promise((r) => setTimeout(r, 40));
            return window.fieldTest!.shapeOverlay!()!;
        });

    test("change: after + the marchers slide to their new spots rather than jump", async ({
        show,
    }) => {
        const { page } = show;
        await drawBox(show);
        const before = (await shapeOverlay(page))!.spots;
        const mid = await plusAndPeek(page);
        expect(mid.gliding).toBe(true);
        const after = (await shapeOverlay(page))!.spots;
        expect(after).not.toEqual(before);
        // Part way: neither where they were nor where they land
        expect(mid.spots).not.toEqual(after);
        expect(mid.spots).not.toEqual(before);
    });

    test("change: with reduced motion asked for, the marchers go straight to their new spots", async ({
        show,
    }) => {
        const { page } = show;
        await page.emulateMedia({ reducedMotion: "reduce" });
        await drawBox(show);
        const mid = await plusAndPeek(page);
        expect(mid.gliding).toBe(false);
        expect(mid.spots).toEqual((await shapeOverlay(page))!.spots);
    });
});

// Keeping the shape and its editor in view (#441, owner: a turned box went
// partly off the canvas unnoticed; "Keep in view" won the lab A/B). After an
// edit or a drag, the view pans just far enough to bring the shape and editor
// back, and zooms out just enough when they no longer fit, never in. Never
// during a drag.

/** The field element's box in the viewport */
const fieldRect = async (page: Page) =>
    (await page.getByTestId("fieldCanvas").boundingBox())!;

/** The view's pan once it has stopped gliding (and zooming) */
async function settledPan(page: Page): Promise<Point> {
    let last = "";
    for (;;) {
        const { pan, zoom } = (await readField(page)).viewport;
        const now = `${pan.x.toFixed(1)},${pan.y.toFixed(1)},${zoom.toFixed(4)}`;
        if (now === last) return pan;
        last = now;
        await page.waitForTimeout(150);
    }
}

/** Right-drags the field by (dx, dy) from near its bottom left, away from the box */
async function panField(page: Page, dx: number, dy: number) {
    const field = await fieldRect(page);
    const from = { x: field.x + 40, y: field.y + field.height - 40 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 });
    await page.mouse.up({ button: "right" });
}

/** The open shape's outline on screen */
async function outlineOnScreen(page: Page) {
    const outline = (await shapeOverlay(page))!.outline!;
    const points: Point[] = [];
    for (const p of outline) points.push(await toScreen(page, p));
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return {
        left: Math.min(...xs),
        right: Math.max(...xs),
        top: Math.min(...ys),
        bottom: Math.max(...ys),
    };
}

/** Pans the field so the open box's top is `px` below the field's top */
async function boxTopAt(page: Page, px: number) {
    const field = await fieldRect(page);
    const { top } = await outlineOnScreen(page);
    await panField(page, 0, field.y + px - top);
    await settledPan(page);
    expect(
        Math.abs((await outlineOnScreen(page)).top - (field.y + px)),
    ).toBeLessThan(1);
}

const near = (a: Point, b: Point, px = 1.5) =>
    Math.hypot(a.x - b.x, a.y - b.y) <= px;

test("change: Keep in view: a turn that would push the box's corner off the field pans just far enough to bring it back (#441)", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    // The 10 × 6 step box just inside the top margin: a quarter turn stands it up past the top
    await boxTopAt(page, 28);
    const before = await settledPan(page);
    const { zoom } = (await readField(page)).viewport;
    await page.getByTestId("shape-editor-quarter-turn").click();
    await expect(page.getByTestId("shape-editor-rotation")).toHaveText("90°");
    const after = await settledPan(page);
    // Only down, and just far enough: the top ends 24 px inside the field
    expect(after.y).toBeGreaterThan(before.y + 5);
    expect(after.x).toBeCloseTo(before.x, 1);
    const field = await fieldRect(page);
    expect(
        Math.abs((await outlineOnScreen(page)).top - (field.y + 24)),
    ).toBeLessThan(1.5);
    expect((await readField(page)).viewport.zoom).toBe(zoom);
});

test("change: Keep in view: an edit that leaves the box and editor in view doesn't pan (#441)", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    const size = page.getByTestId("shape-editor-size");
    const before = await settledPan(page);
    const { zoom } = (await readField(page)).viewport;
    await sizeButton(page, true).click();
    await expect(size).not.toHaveText("4 × 2");
    await page.getByTestId("shape-editor-quarter-turn").click();
    await expect(page.getByTestId("shape-editor-rotation")).toHaveText("90°");
    expect(await settledPan(page)).toEqual(before);
    expect((await readField(page)).viewport.zoom).toBe(zoom);
});

test("change: Keep in view: the view holds still during a drag on the field, and brings the box back once it ends (#441)", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    const field = await fieldRect(page);
    const before = await settledPan(page);
    const { top } = await outlineOnScreen(page);
    const spots = (await shapeOverlay(page))!.spots;
    const inside = await toScreen(page, {
        x: spots.reduce((a, p) => a + p.x, 0) / spots.length,
        y: spots.reduce((a, p) => a + p.y, 0) / spots.length,
    });
    // Moved until its top is 30 px above the field's
    const up = top - field.y + 30;
    await drag(
        page,
        inside,
        { x: inside.x, y: inside.y - up },
        {
            beforeRelease: async () => {
                await page.waitForTimeout(300);
                expect((await readField(page)).viewport.pan).toEqual(before);
            },
        },
    );
    const after = await settledPan(page);
    expect(after.y).toBeGreaterThan(before.y);
    expect(
        Math.abs((await outlineOnScreen(page)).top - (field.y + 24)),
    ).toBeLessThan(1.5);
});

test("change: Keep in view: an edit that changes nothing doesn't make the next undo move the view (#441 review)", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    const deep = page.getByTestId("shape-editor-deep");
    const typeDeep = async (steps: string) => {
        await deep.click();
        const input = page.getByTestId("shape-editor-deep-input");
        await input.fill(steps);
        await input.press("Enter");
        await expect(input).toBeHidden();
    };
    // Deeper, then back: undo makes it deeper again, about its middle
    const was = (await deep.innerText()).replace(/[^0-9.]/g, "");
    const deeper = String(Number(was) + 4);
    await typeDeep(deeper);
    await expect(deep).toContainText(deeper);
    await typeDeep(was);
    await boxTopAt(page, 28);
    const before = await settledPan(page);
    // Typing the spacing it already has, then undo at once: the undone box pokes past the top
    // margin, but the undo isn't an edit made in the editor
    await typeDeep(was);
    await page.keyboard.press("ControlOrMeta+z");
    await expect(deep).toContainText(deeper);
    await page.waitForTimeout(500);
    expect(await settledPan(page)).toEqual(before);
});

/** Zooms in at the open box's middle, with Ctrl + wheel, until the view is `times` closer */
async function zoomInOnBox(page: Page, times: number) {
    const { zoom } = (await readField(page)).viewport;
    const { left, right, top, bottom } = await outlineOnScreen(page);
    await page.mouse.move((left + right) / 2, (top + bottom) / 2);
    await page.keyboard.down("Control");
    while ((await readField(page)).viewport.zoom < zoom * times)
        await page.mouse.wheel(0, -200);
    await page.keyboard.up("Control");
    await settledPan(page);
}

/** Types `steps` into the editor's side-to-side spacing */
async function typeAcross(page: Page, steps: string) {
    await page.getByTestId("shape-editor-across").click();
    const input = page.getByTestId("shape-editor-across-input");
    await input.fill(steps);
    await input.press("Enter");
    await expect(page.getByTestId("shape-editor-across")).toContainText(steps);
}

test("change: Keep in view: a typed spacing that makes the box wider than the view zooms out just enough to show it and its editor whole, and a smaller one never zooms back in (#441)", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    await zoomInOnBox(page, 4);
    const close = (await readField(page)).viewport.zoom;

    await typeAcross(page, "20");
    await settledPan(page);
    const out = (await readField(page)).viewport.zoom;
    expect(out).toBeLessThan(close);
    const field = await fieldRect(page);
    const shape = await outlineOnScreen(page);
    const editor = (await page
        .getByTestId("shape-tool-readout")
        .boundingBox())!;
    // Just enough: the box spans the field less its margins, and the editor is inside too
    expect(Math.abs(shape.left - (field.x + 24))).toBeLessThan(1.5);
    expect(Math.abs(shape.right - (field.x + field.width - 24))).toBeLessThan(
        1.5,
    );
    expect(Math.min(shape.top, editor.y)).toBeGreaterThanOrEqual(field.y + 23);
    expect(
        Math.max(shape.bottom, editor.y + editor.height),
    ).toBeLessThanOrEqual(field.y + field.height - 23);

    // Back to 2 steps: the box is small again, and the view stays out
    await typeAcross(page, "2");
    await settledPan(page);
    expect((await readField(page)).viewport.zoom).toBe(out);
});

// The pivot on the field (#350): Cmd/Ctrl-drag from the center dot (reach inside) pulls it
// out into a yellow crosshair, it snaps to marchers, turns go around it, it is
// saved with the box, and a double click sends it back to the center.

test("change: Cmd/Ctrl-drag from the center dot pulls the pivot out onto a marcher, turns go around it, and the placed box keeps it until a double click", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    const editor = page.getByTestId("shape-tool-readout");
    const pivotButton = editor.getByTestId("shape-editor-pivot");
    await expect(pivotButton).toHaveAttribute("data-pivot", "c");
    let overlay = (await shapeOverlay(page))!;
    expect(overlay.pivotMark).toBeNull();
    const center = overlay.centerDot!;

    // A plain drag on the center dot would move the box; with Ctrl/Cmd it
    // pulls the pivot out, and it snaps onto T1 near where it's let go
    const t1 = await marcherScreen(page, 1);
    await page.keyboard.down("ControlOrMeta");
    await drag(page, center, { x: t1.x + 3, y: t1.y - 2 });
    await page.keyboard.up("ControlOrMeta");
    overlay = (await shapeOverlay(page))!;
    expect(near(overlay.pivotMark!, t1)).toBe(true);
    expect(near(overlay.centerDot!, center)).toBe(true);
    // Off the grid's 9 points, so none of them is lit, in the button's icon
    // or in its menu
    await expect(pivotButton).toHaveAttribute("data-pivot", "custom");
    await pivotButton.click();
    const grid = page.getByTestId("shape-editor-pivot-grid");
    await expect(grid).toBeVisible();
    await expect(grid.locator('[aria-checked="true"]')).toHaveCount(0);
    await pivotButton.click();
    await expect(grid).toBeHidden();

    // A quarter turn swings the box around T1; the crosshair stays put
    await editor.getByTestId("shape-editor-rotation").click();
    await page.getByTestId("shape-editor-rotation-input").fill("90");
    await page.getByTestId("shape-editor-rotation-input").press("Enter");
    overlay = (await shapeOverlay(page))!;
    expect(near(overlay.pivotMark!, t1)).toBe(true);
    const swung = {
        x: t1.x - (center.y - t1.y),
        y: t1.y + (center.x - t1.x),
    };
    expect(near(overlay.centerDot!, swung, 3)).toBe(true);

    // Placed, the recipe keeps the pivot
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    await waitForIdle(page);
    const stored = async () => {
        const [recipe] = await show.query<{ params: string }>(
            "SELECT params FROM timeline_shape_recipes",
        );
        return JSON.parse(recipe.params).pivot;
    };
    expect(typeof (await stored())).toBe("object");
    await page.keyboard.press("Escape");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([]);

    // Selected again, its pivot is where it was left
    const member = await marcherScreen(page, 2);
    await page.mouse.click(member.x, member.y);
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
    await expect
        .poll(async () => {
            const mark = (await shapeOverlay(page))?.pivotMark;
            return mark != null && near(mark, t1);
        })
        .toBe(true);

    // A double click on it sends it back to the center, saved as one step
    const steps = await undoSteps(show);
    await page.mouse.dblclick(t1.x, t1.y);
    await expect
        .poll(async () => (await shapeOverlay(page))?.pivotMark ?? null)
        .toBeNull();
    await expect.poll(stored).toBeUndefined();
    expect(await undoSteps(show)).toBe(steps + 1);
    await expect(
        page
            .getByTestId("placed-box-readout")
            .getByTestId("shape-editor-pivot"),
    ).toHaveAttribute("data-pivot", "c");
});

/** The selected placed shape's pivot, from the editor's pivot menu (#485) */
async function pickPlacedPivot(page: Page, cell: string) {
    const editor = page.getByTestId("placed-box-readout");
    await editor.getByTestId("shape-editor-pivot").click();
    const grid = page.getByTestId("shape-editor-pivot-grid");
    await grid.getByTestId(`shape-editor-pivot-grid-${cell}`).click();
    await expect(grid).toBeHidden();
}

/** The toasts showing now, by their text */
const toastTexts = (page: Page) => toasts(page).allInnerTexts();

/** Each recipe's move and pivot, oldest first */
const storedPivots = async (show: Show) =>
    (
        await show.query<{ timeline_id: number | null; params: string }>(
            "SELECT timeline_id, params FROM timeline_shape_recipes ORDER BY id",
        )
    ).map((r) => ({
        move: r.timeline_id,
        pivot: JSON.parse(r.params).pivot ?? null,
    }));

// The pivot on a later page (#485): a box placed on Page 1 shows on Page 2
// while its members stand still there. Where Page 2 sets their positions, an
// edit there gives the box its own copy on Page 2; where Page 2 only carries
// them over, a pivot change goes to the box shown, Page 1's.

test("change: the pivot of a box placed on a page and again on the next one changes on the next page only (#485)", async ({
    show,
}) => {
    const { page } = show;
    await selectPage(show, "Page 1");
    await placeBox(show, 1);
    const t1 = await marcherScreen(page, 1);
    await page.mouse.click(t1.x, t1.y);
    await expect(page.getByTestId("placed-box-readout")).toBeVisible();
    await pickPlacedPivot(page, "nw");
    await expect
        .poll(async () => (await storedPivots(show)).map((r) => r.pivot))
        .toEqual(["nw"]);
    await waitForIdle(page);
    await page.keyboard.press("Escape");

    // The same box placed on Page 2 too
    await selectPage(show, "Page 2");
    await placeBox(show, 2);
    await expect.poll(async () => (await storedPivots(show)).length).toBe(2);

    const member = await marcherScreen(page, 1);
    await page.mouse.click(member.x, member.y);
    const pivotButton = page
        .getByTestId("placed-box-readout")
        .getByTestId("shape-editor-pivot");
    await expect(pivotButton).toBeVisible();
    await pickPlacedPivot(page, "se");
    await expect
        .poll(async () => (await storedPivots(show)).map((r) => r.pivot))
        .toEqual(["nw", "se"]);
    await waitForIdle(page);
    await expect(pivotButton).toHaveAttribute("data-pivot", "se");
    // Page 1 keeps its own
    await page.keyboard.press("Escape");
    await selectPage(show, "Page 1");
    await page.mouse.click(t1.x, t1.y);
    await expect(pivotButton).toHaveAttribute("data-pivot", "nw");
});

test.describe("a box carried onto a page with no positions of its own (#485)", () => {
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
            // Page 2 sets nobody: everyone stands where Page 1 left them
            positions: [HOME, HOME, []],
        }),
    });

    test("change: a pivot change there, from the menu, dragged or double-clicked, gives the box its own copy on that page and Page 1 keeps its pivot; on Page 1 it sets no one, and undo shares the box again", async ({
        show,
    }) => {
        const { page } = show;
        const assignments = async () =>
            (
                await show.query<{ count: number }>(
                    "SELECT COUNT(*) AS count FROM timeline_assignments",
                )
            )[0]!.count;
        const laterMoves = async () =>
            (
                await show.query<{ count: number }>(
                    "SELECT COUNT(*) AS count FROM timelines WHERE end_beat > 32",
                )
            )[0]!.count;
        await selectPage(show, "Page 1");
        await placeBox(show, 1);
        const placed = await savedPositions(show, 1);
        const t1 = await marcherScreen(page, 1);
        await page.mouse.click(t1.x, t1.y);
        await expect(page.getByTestId("placed-box-readout")).toBeVisible();

        // On its own page, the pivot only changes: no one is set
        const assigned = await assignments();
        await pickPlacedPivot(page, "nw");
        await expect
            .poll(async () => (await storedPivots(show)).map((r) => r.pivot))
            .toEqual(["nw"]);
        await waitForIdle(page);
        expect(await assignments()).toBe(assigned);
        expect(await savedPositions(show, 1)).toEqual(placed);
        await page.keyboard.press("Escape");

        await selectPage(show, "Page 2");
        const member = await marcherScreen(page, 1);
        await page.mouse.click(member.x, member.y);
        const pivotButton = page
            .getByTestId("placed-box-readout")
            .getByTestId("shape-editor-pivot");
        await expect(pivotButton).toHaveAttribute("data-pivot", "nw");
        const [home] = await storedPivots(show);
        let steps = 0;
        let toastsBefore: string[] = [];
        /** Page 2 has its own copy with `pivot`, everyone set where they stood, as one undo step; Page 1's is as it was */
        const ownCopy = async (pivot: (p: unknown) => boolean) => {
            await expect
                .poll(async () => {
                    const r = await storedPivots(show);
                    return r.length === 2 && pivot(r[1]!.pivot);
                })
                .toBe(true);
            await waitForIdle(page);
            const [first, second] = await storedPivots(show);
            expect(first).toEqual(home);
            expect(second!.move).not.toBe(home!.move);
            expect(await laterMoves()).toBe(1);
            expect(await savedPositions(show, 1)).toEqual(placed);
            expect(await savedPositions(show, 2)).toEqual(placed);
            expect(await undoSteps(show)).toBe(steps + 1);
            // Nobody moved: no pass-through, Move them too or Only Page N offer
            const now = await toastTexts(page);
            expect(now.filter((t) => !toastsBefore.includes(t))).toEqual([]);
        };
        /** Undo shares Page 1's box again */
        const undone = async () => {
            await page.keyboard.press("ControlOrMeta+z");
            await expect.poll(() => storedPivots(show)).toEqual([home]);
            await waitForIdle(page);
            expect(await laterMoves()).toBe(0);
            await expect(pivotButton).toHaveAttribute("data-pivot", "nw");
        };

        // From the editor's pivot menu
        steps = await undoSteps(show);
        toastsBefore = await toastTexts(page);
        await pickPlacedPivot(page, "se");
        await ownCopy((p) => p === "se");
        await expect(pivotButton).toHaveAttribute("data-pivot", "se");
        await undone();

        // Dragged on the field with Ctrl/Cmd, onto T3
        steps = await undoSteps(show);
        toastsBefore = await toastTexts(page);
        const mark = (await shapeOverlay(page))!.pivotMark!;
        const t3 = await marcherScreen(page, 3);
        await page.keyboard.down("ControlOrMeta");
        await drag(page, mark, t3);
        await page.keyboard.up("ControlOrMeta");
        await ownCopy((p) => typeof p === "object" && p !== null);
        await expect
            .poll(async () => {
                const m = (await shapeOverlay(page))?.pivotMark;
                return m != null && near(m, t3);
            })
            .toBe(true);
        await undone();

        // Double-clicked back to the center
        steps = await undoSteps(show);
        toastsBefore = await toastTexts(page);
        const nw = (await shapeOverlay(page))!.pivotMark!;
        await page.mouse.dblclick(nw.x, nw.y);
        await ownCopy((p) => p === null);
        await expect(pivotButton).toHaveAttribute("data-pivot", "c");
        await undone();
        await page.keyboard.press("ControlOrMeta+Shift+z");
        await ownCopy((p) => p === null);

        // Page 1 keeps its own
        await page.keyboard.press("Escape");
        await selectPage(show, "Page 1");
        await page.mouse.click(t1.x, t1.y);
        await expect(pivotButton).toHaveAttribute("data-pivot", "nw");
    });

    test.describe("in Expert, with the start flag left on Page 1", () => {
        test.use({
            appSettings: { optOutAnalytics: true, editorMode: "expert" },
        });

        test("change: a pivot change with the window reaching back over Page 1 sets no one, and Page 1's motion and box stay", async ({
            show,
        }) => {
            const { page } = show;
            await selectPage(show, "Page 1");
            await placeBox(show, 1);
            const placed = await savedPositions(show, 1);
            const assigned = (
                await show.query<{ count: number }>(
                    "SELECT COUNT(*) AS count FROM timeline_assignments",
                )
            )[0]!.count;

            // The playhead to Page 2's end; the start flag stays on Page 1's start (UI-26)
            await goTo(page, "m9");
            for (let i = 0; i < 7; i++) await page.keyboard.press("Shift+E");
            await expect(page.getByTestId("timeline-readout")).toContainText(
                "Pg 2 · ct 8/8",
            );
            await expectCanvasMatchesShow(show);
            const member = await marcherScreen(page, 1);
            await page.mouse.click(member.x, member.y);
            await expect(page.getByTestId("placed-box-readout")).toBeVisible();
            const toastsBefore = await toastTexts(page);
            await pickPlacedPivot(page, "se");
            await expect
                .poll(async () =>
                    (await storedPivots(show)).map((r) => r.pivot),
                )
                .toEqual(["se"]);
            await waitForIdle(page);

            // Nobody is set across the window: Page 1's members still stop on its box
            const [{ count }] = await show.query<{ count: number }>(
                "SELECT COUNT(*) AS count FROM timeline_assignments",
            );
            expect(count).toBe(assigned);
            expect(await savedPositions(show, 1)).toEqual(placed);
            const now = await toastTexts(page);
            expect(now.filter((t) => !toastsBefore.includes(t))).toEqual([]);
            await page.keyboard.press("Escape");
            await selectPage(show, "Page 1");
            await page.mouse.click(member.x, member.y);
            await expect(
                page
                    .getByTestId("placed-box-readout")
                    .getByTestId("shape-editor-pivot"),
            ).toHaveAttribute("data-pivot", "se");
        });
    });

    test("change: a spacing change there moves its members, so the box gets its own copy on that page and Page 1 keeps its own", async ({
        show,
    }) => {
        const { page } = show;
        await selectPage(show, "Page 1");
        await placeBox(show, 1);
        const onPage1 = await savedPositions(show, 1);
        const [before] = await show.query<{ params: string }>(
            "SELECT params FROM timeline_shape_recipes",
        );

        await selectPage(show, "Page 2");
        const member = await marcherScreen(page, 1);
        await page.mouse.click(member.x, member.y);
        await expect(page.getByTestId("placed-box-readout")).toBeVisible();
        const across = await page
            .getByTestId("shape-editor-across")
            .innerText();
        const steps = await undoSteps(show);
        await typeAcross(page, "5");
        await expect
            .poll(async () => (await storedPivots(show)).length)
            .toBe(2);
        await waitForIdle(page);
        expect(await undoSteps(show)).toBe(steps + 1);

        // Page 2's own move holds the copy, its members on its wider spots
        const recipes = await show.query<{
            timeline_id: number;
            params: string;
        }>(
            "SELECT timeline_id, params FROM timeline_shape_recipes ORDER BY id",
        );
        expect(recipes[0]!.params).toBe(before!.params);
        const [own] = await show.query<{ start_beat: number }>(
            "SELECT start_beat FROM timelines WHERE id = ?",
            recipes[1]!.timeline_id,
        );
        expect(own!.start_beat).toBeGreaterThanOrEqual(32);
        const onPage2 = await savedPositions(show, 2);
        const width = (ps: Position[]) =>
            Math.max(...ps.map((p) => p.x)) - Math.min(...ps.map((p) => p.x));
        expect(width(onPage2)).toBeGreaterThan(width(onPage1));
        // Page 1 is as it was
        expect(await savedPositions(show, 1)).toEqual(onPage1);
        await page.keyboard.press("Escape");
        await selectPage(show, "Page 1");
        await page.mouse.click(member.x, member.y);
        await expect(page.getByTestId("shape-editor-across")).toHaveText(
            across,
        );
    });

    test("change: turned about a member on the next page, the member at the pivot stays in the box there (owner on #486)", async ({
        show,
    }) => {
        const { page } = show;
        await selectPage(show, "Page 1");
        await placeBox(show, 1);
        /** The member drawn furthest toward `dir` on screen */
        const memberToward = async (dir: Point) =>
            (await drawnMarchers(page)).reduce((a, b) =>
                b.screen.x * dir.x + b.screen.y * dir.y >
                a.screen.x * dir.x + a.screen.y * dir.y
                    ? b
                    : a,
            );
        /** Pulls the selected box's pivot onto marcher `id` and turns it a quarter */
        const turnAbout = async (id: number) => {
            const overlay = (await shapeOverlay(page))!;
            const from = overlay.pivotMark ?? overlay.centerDot!;
            const to = await marcherScreen(page, id);
            await page.keyboard.down("ControlOrMeta");
            await drag(page, from, to);
            await page.keyboard.up("ControlOrMeta");
            await expect
                .poll(async () => {
                    const m = (await shapeOverlay(page))?.pivotMark;
                    return m != null && near(m, to);
                })
                .toBe(true);
            await waitForIdle(page);
            await page.getByTestId("shape-editor-quarter-turn").click();
            await waitForIdle(page);
            // The marcher at the pivot didn't move
            expect(near(await marcherScreen(page, id), to)).toBe(true);
        };

        // Page 1: turned about its bottom-right member
        const corner = await memberToward({ x: 1, y: 1 });
        await page.mouse.click(corner.screen.x, corner.screen.y);
        await expect(page.getByTestId("placed-box-readout")).toBeVisible();
        await turnAbout(corner.id);
        await page.keyboard.press("Escape");

        // Page 2 carries it; turned again about the member furthest right
        await selectPage(show, "Page 2");
        const side = await memberToward({ x: 1, y: 0 });
        await page.mouse.click(side.screen.x, side.screen.y);
        await expect
            .poll(async () => (await readField(page)).selection)
            .toEqual(ALL);
        await turnAbout(side.id);
        await page.keyboard.press("Escape");
        await expect
            .poll(async () => (await readField(page)).selection)
            .toEqual([]);

        // Every member is in Page 2's box, the one at the pivot too
        const members = await show.query<{ marcher_id: number }>(
            `SELECT m.marcher_id FROM timeline_shape_recipe_marchers m
             JOIN timeline_shape_recipes r ON r.id = m.recipe_id
             JOIN timelines t ON t.id = r.timeline_id
             WHERE t.start_beat >= 32 ORDER BY m.marcher_id`,
        );
        expect(members.map((m) => m.marcher_id)).toEqual(ALL);
        const at = await marcherScreen(page, side.id);
        await page.mouse.click(at.x, at.y);
        await expect
            .poll(async () => (await readField(page)).selection)
            .toEqual(ALL);
    });
});

test("change: pointing at a cell of the pivot menu previews that pivot on the shape, and leaving it or closing the menu takes the preview away (#437)", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    const editor = page.getByTestId("shape-tool-readout");
    const pivotButton = editor.getByTestId("shape-editor-pivot");
    const outline = (await shapeOverlay(page))!.outline!;
    const backLeft = {
        x: Math.min(...outline.map((p) => p.x)),
        y: Math.min(...outline.map((p) => p.y)),
    };
    const preview = async () => (await shapeOverlay(page))!.pivotPreview;
    await pivotButton.click();
    const grid = page.getByTestId("shape-editor-pivot-grid");
    await grid.getByTestId("shape-editor-pivot-grid-nw").hover();
    await expect
        .poll(async () => {
            const p = await preview();
            return p && Math.hypot(p.x - backLeft.x, p.y - backLeft.y);
        })
        .toBeLessThan(CLOSE);
    await expect(page.getByTestId("fieldShapePivotPreview")).toBeVisible();
    // A preview only: the shape's pivot is still the center
    await expect(pivotButton).toHaveAttribute("data-pivot", "c");
    expect((await shapeOverlay(page))!.pivotMark).toBeNull();

    // Off the cell, gone; on another, there
    await page.mouse.move(0, 0);
    await expect.poll(preview).toBeNull();
    await grid.getByTestId("shape-editor-pivot-grid-c").hover();
    await expect.poll(preview).not.toBeNull();
    // Closed, gone
    await pivotButton.click();
    await expect(grid).toBeHidden();
    await expect.poll(preview).toBeNull();
    await expect(page.getByTestId("fieldShapePivotPreview")).toHaveCount(0);

    // The grid is in screen terms: after a half turn, its top-left cell still
    // previews the point at the top left on screen, and picking it stores the
    // shape's own front right
    await editor.getByTestId("shape-editor-rotation").click();
    await page.getByTestId("shape-editor-rotation-input").fill("180");
    await page.getByTestId("shape-editor-rotation-input").press("Enter");
    await expect(editor.getByTestId("shape-editor-rotation")).toHaveText(
        "180°",
    );
    const turned = (await shapeOverlay(page))!.outline!;
    const topLeft = {
        x: Math.min(...turned.map((p) => p.x)),
        y: Math.min(...turned.map((p) => p.y)),
    };
    await pivotButton.click();
    await grid.getByTestId("shape-editor-pivot-grid-nw").hover();
    await expect
        .poll(async () => {
            const p = await preview();
            return p && Math.hypot(p.x - topLeft.x, p.y - topLeft.y);
        })
        .toBeLessThan(CLOSE);
    await grid.getByTestId("shape-editor-pivot-grid-nw").click();
    await expect(pivotButton).toHaveAttribute("data-pivot", "se");
    await pivotButton.click();
    await expect(
        grid.getByTestId("shape-editor-pivot-grid-nw"),
    ).toHaveAttribute("aria-checked", "true");
});

test("change: one of the editor's menus open at a time: opening another closes it (#437)", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    const editor = page.getByTestId("shape-tool-readout");
    await editor.getByTestId("shape-mode-menu").click();
    await expect(page.getByTestId("shape-mode-menu-content")).toBeVisible();
    await editor.getByTestId("shape-layout-menu").click();
    await expect(page.getByTestId("shape-layout-menu-content")).toBeVisible();
    await expect(page.getByTestId("shape-mode-menu-content")).toBeHidden();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("shape-layout-menu-content")).toBeHidden();
    await pickMode(page, "spread");
    await editor.getByTestId("shape-editor-pivot").click();
    await expect(page.getByTestId("shape-editor-pivot-grid")).toBeVisible();
    await editor.getByTestId("shape-editor-reshuffle-seed").click();
    await expect(
        page.getByTestId("shape-editor-reshuffle-seed-menu"),
    ).toBeVisible();
    await expect(page.getByTestId("shape-editor-pivot-grid")).toBeHidden();
});

test("change: the editor's pivot menu picks a corner of the 3 × 3 grid, its icon shows it, and turns go around it (#435)", async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    const editor = page.getByTestId("shape-tool-readout");
    const pivotButton = editor.getByTestId("shape-editor-pivot");
    await pivotButton.click();
    const grid = page.getByTestId("shape-editor-pivot-grid");
    await expect(grid.getByRole("radio")).toHaveCount(9);
    await expect(grid.getByTestId("shape-editor-pivot-grid-c")).toHaveAttribute(
        "aria-checked",
        "true",
    );
    // Picking one closes the menu, and the button's icon lights it
    await grid.getByTestId("shape-editor-pivot-grid-nw").click();
    await expect(grid).toBeHidden();
    await expect(pivotButton).toHaveAttribute("data-pivot", "nw");

    // The back-left corner stays where it is through a quarter turn
    const outline = (await shapeOverlay(page))!.outline!;
    const corner = {
        x: Math.min(...outline.map((p) => p.x)),
        y: Math.min(...outline.map((p) => p.y)),
    };
    await editor.getByTestId("shape-editor-rotation").click();
    await page.getByTestId("shape-editor-rotation-input").fill("90");
    await page.getByTestId("shape-editor-rotation-input").press("Enter");
    await expect(editor.getByTestId("shape-editor-rotation")).toHaveText("90°");
    const turned = (await shapeOverlay(page))!.outline!;
    expect(
        turned.some((p) => Math.hypot(p.x - corner.x, p.y - corner.y) < CLOSE),
    ).toBe(true);
    expect(turned).not.toEqual(outline);
});

// The command bar (#354): `/` and ⌘K open one bar; Shape › Box docks it at the
// top of the field and asks the box's numbers one at a time, the box showing
// live on the field.

const bar = (page: Page) => page.getByTestId("docked-command-bar");
const answer = (page: Page) => page.getByTestId("docked-command-input");
const question = (page: Page) => bar(page).locator("label");

test("change: / opens the command bar, and Shape › Box asks each number with a default while the box shows live", async ({
    show,
}) => {
    const { page } = show;
    const steps = await undoSteps(show);
    await selectAll(page);
    await page.keyboard.press("/");
    await page.getByRole("combobox").fill("box");
    await expect(page.getByRole("option").first()).toHaveText(/^Shape › Box/);
    await page.keyboard.press("Enter");

    // Docked, not the centered palette, and the box is already on the field.
    // How it's filled comes first (#390): Enter keeps Grid
    await expect(bar(page)).toBeVisible();
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(question(page)).toHaveText(/^Fill/);
    await expect(answer(page)).toHaveValue("Grid");
    await page.keyboard.press("Enter");
    await expect(question(page)).toHaveText(/^Size/);
    const size = await answer(page).inputValue();
    expect(size).toMatch(/^\d+ × \d+$/);
    expect((await shapeOverlay(page))!.spots).toHaveLength(ALL.length);
    expect(await readout(page)).toBe(`${size} · 2 × 2 steps`);

    // Each keystroke shows on the field
    await answer(page).fill("4x2");
    await expect.poll(() => readout(page)).toBe("4 × 2 · 2 × 2 steps");
    await page.keyboard.press("Enter");
    await expect(question(page)).toHaveText(/^Side-to-side/);
    await expect(answer(page)).toHaveValue("2");
    await answer(page).fill("3");
    await expect.poll(() => readout(page)).toBe("4 × 2 · 3 × 2 steps");

    // Backspace in an empty answer goes back a step, keeping its answer
    await answer(page).fill("");
    await page.keyboard.press("Backspace");
    await expect(question(page)).toHaveText(/^Size/);
    await expect(answer(page)).toHaveValue("4x2");
    await page.keyboard.press("Enter");
    await answer(page).fill("3");
    await page.keyboard.press("Enter");
    await expect(question(page)).toHaveText(/^Front-to-back/);

    // Last, the layout (#387), as the picker labels it
    await page.keyboard.press("Enter");
    await expect(question(page)).toHaveText(/^Layout/);
    await expect(answer(page)).toHaveValue("Full 4 × 2");

    // The show is untouched until the last answer, which places the box as one undo step
    expect(await readout(page)).toBe("4 × 2 · 3 × 2 steps");
    expect(await savedPositions(show, 0)).toEqual(asPositions(HOME));
    const spots = (await shapeOverlay(page))!.spots;
    await page.keyboard.press("Enter");
    await expect(bar(page)).toBeHidden();
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    await expect.poll(() => onSpots(show, spots)).toBe(true);
    await waitForIdle(page);
    expect(await undoSteps(show)).toBe(steps + 1);
});

test('change: a one-liner such as "box 4x2 3" fills the answers ahead and shows them at once, and Escape puts back the box that was open', async ({
    show,
}) => {
    const { page } = show;
    await drawBox(show);
    const numbers = await readout(page);
    const spots = (await shapeOverlay(page))!.spots;

    await page.keyboard.press("ControlOrMeta+k");
    await page.getByRole("combobox").fill("box 4x2 3");
    await expect(page.getByRole("option").first()).toHaveText(
        /^Shape › Box 4x2 · 3/,
    );
    await page.keyboard.press("Enter");
    // Opens at the first step it didn't fill, with everything it did fill on the field. Started
    // from the open box: its depth spacing is its own
    await expect(question(page)).toHaveText(/^Front-to-back/);
    const deep = numbers.split(" × ").at(-1);
    await expect.poll(() => readout(page)).toBe(`4 × 2 · 3 × ${deep}`);

    await page.keyboard.press("Escape");
    await expect(bar(page)).toBeHidden();
    // The box drawn before, as it was, still open
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();
    expect(await readout(page)).toBe(numbers);
    expect((await shapeOverlay(page))!.spots).toEqual(spots);
    expect(await savedPositions(show, 0)).toEqual(asPositions(HOME));
});

test("change: with nobody selected, Shape › Box is greyed out with why", async ({
    show,
}) => {
    const { page } = show;
    await page.keyboard.press("/");
    await page.getByRole("combobox").fill("box");
    const box = page.getByRole("option").filter({ hasText: /^Shape › Box/ });
    await expect(box).toHaveAttribute("aria-disabled", "true");
    await expect(box).toContainText("Select marchers first");
    await page.keyboard.press("Enter");
    await expect(bar(page)).toBeHidden();
});

test("the Shapes tab lists the kinds, greyed out until marchers are selected; picking Box arms it, a drag draws it and Enter places it", async ({
    show,
}) => {
    const { page } = show;
    await showPathways(show);
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    await page.getByRole("tab", { name: "Shapes" }).click();
    const box = page.getByTestId("shapes-tab-block");
    // A picture only, drawn from the box's own spots (#378); the name is its label
    await expect(box).toHaveText("");
    await expect(box).toHaveAccessibleName("Box");
    await expect(box.getByTestId("shape-preview")).toHaveAttribute(
        "data-spots",
        "9",
    );

    // Nobody selected: greyed out, and it says why, naming the shape on hover
    expect((await readField(page)).selection).toEqual([]);
    await expect(box).toBeDisabled();
    await expect(page.getByTestId("shapes-tab-reason")).toHaveText(
        "Select marchers first",
    );
    await box.locator("..").hover();
    await expect(page.getByRole("tooltip")).toHaveText(
        "Box: Select marchers first",
    );
    await page.mouse.move(5, 5);

    await selectAll(page);
    await expect(box).toBeEnabled();
    await expect(page.getByTestId("shapes-tab-reason")).toBeHidden();
    await expect(box).toHaveAttribute("aria-pressed", "false");
    await box.hover();
    await expect(page.getByRole("tooltip")).toContainText("Box");
    await expect(page.getByRole("tooltip").locator("kbd")).toHaveText("B");
    await page.mouse.move(5, 5);

    // Picking it arms the box: the field draws it on the next drag
    await box.click();
    await expect(box).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("shape-tool-hint")).toBeVisible();
    expect((await readField(page)).activeGesture).toBe("shape");
    await drag(
        page,
        await toScreen(page, { x: cf.x - 15 * S, y: cf.y - 25 * S }),
        await toScreen(page, { x: cf.x - 5 * S, y: cf.y - 19 * S }),
    );
    const drawn = (await shapeOverlay(page))!;
    expect(drawn.spots).toHaveLength(ALL.length);
    expect(await readout(page)).toMatch(/^4 × 2 · /);

    // Picking the open kind again keeps the shape
    await box.click();
    expect((await shapeOverlay(page))!.spots).toEqual(drawn.spots);

    // Enter places it, even after the tab's button was clicked
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    await expect(box).toHaveAttribute("aria-pressed", "false");
    await expect
        .poll(async () =>
            (await savedPositions(show, 0)).every((p) =>
                drawn.walks.some(
                    (w) => Math.hypot(w.to.x - p.x, w.to.y - p.y) < CLOSE,
                ),
            ),
        )
        .toBe(true);
});

// The favorites ring (#351): hold R around the cursor and let go over a shape
// to arm it, or tap R to keep it open until a click. It holds the starred
// shapes, then the basic kinds.
const ring = (page: Page) => page.getByTestId("shape-ring");
const ringSlot = (page: Page, id: string) =>
    page.getByTestId(`shape-ring-slot-${id}`);

/** Puts the pointer on the field, where the ring opens around it */
async function pointAtField(show: Show): Promise<Point> {
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const at = await toScreen(show.page, {
        x: grid.centerFront.x,
        y: grid.centerFront.y - 20 * S,
    });
    await show.page.mouse.move(at.x, at.y);
    return at;
}

test("holding R opens the ring around the cursor; sliding to Box and letting go arms it", async ({
    show,
}) => {
    const { page } = show;
    await selectAll(page);
    const at = await pointAtField(show);
    await page.keyboard.down("r");
    await expect(ring(page)).toBeVisible();
    await expect(ring(page)).toHaveAttribute("data-latched", "false");
    // Opened around the cursor
    const center = (await page.getByTestId("shape-ring-center").boundingBox())!;
    expect(
        Math.hypot(
            center.x + center.width / 2 - at.x,
            center.y + center.height / 2 - at.y,
        ),
    ).toBeLessThan(4);
    const box = ringSlot(page, "block");
    await expect(box).toHaveText("Box");
    // The same picture as the Shapes tab (#378)
    await expect(box.getByTestId("shape-preview")).toHaveAttribute(
        "data-spots",
        "9",
    );
    await expect(box).toHaveAttribute("data-hot", "false");

    await page.mouse.move(at.x, at.y - 90, { steps: 4 });
    await expect(box).toHaveAttribute("data-hot", "true");
    await page.keyboard.up("r");
    await expect(ring(page)).toBeHidden();
    await expect(page.getByTestId("shape-tool-hint")).toBeVisible();
    expect((await readField(page)).activeGesture).toBe("shape");
});

/** Where the ring's aim line runs, from and to, in window pixels */
async function aimLine(page: Page) {
    const line = page.getByTestId("shape-ring-aim");
    const read = async (name: string) => Number(await line.getAttribute(name));
    return {
        from: { x: await read("x1"), y: await read("y1") },
        to: { x: await read("x2"), y: await read("y2") },
    };
}

test("a line runs from the ring's center to the pointer and follows it, held or latched (#379)", async ({
    show,
}) => {
    const { page } = show;
    await selectAll(page);
    const at = await pointAtField(show);
    await page.keyboard.down("r");
    await expect(ring(page)).toBeVisible();
    const center = (await page.getByTestId("shape-ring-center").boundingBox())!;
    const middle = {
        x: center.x + center.width / 2,
        y: center.y + center.height / 2,
    };
    const gap = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
    const near = (a: Point, b: Point) => expect(gap(a, b)).toBeLessThan(4);

    const opened = await aimLine(page);
    near(opened.from, middle);
    near(opened.to, at);

    // Off toward a corner, past the slots: it still follows, and Box lights up
    await page.mouse.move(at.x + 40, at.y - 200, { steps: 4 });
    await expect
        .poll(async () =>
            gap((await aimLine(page)).to, { x: at.x + 40, y: at.y - 200 }),
        )
        .toBeLessThan(1);
    near((await aimLine(page)).from, middle);
    await expect(ringSlot(page, "block")).toHaveAttribute("data-hot", "true");
    await page.keyboard.press("Escape");
    await page.keyboard.up("r");
    await expect(ring(page)).toBeHidden();

    // A latched ring has it too
    await page.mouse.move(at.x, at.y);
    await page.keyboard.press("r");
    await expect(ring(page)).toHaveAttribute("data-latched", "true");
    await page.mouse.move(at.x - 70, at.y + 30, { steps: 3 });
    await expect
        .poll(async () =>
            gap((await aimLine(page)).to, { x: at.x - 70, y: at.y + 30 }),
        )
        .toBeLessThan(1);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("shape-ring-aim")).toBeHidden();
});

test("tapping R keeps the ring open: a click away dismisses it, a click on Box arms it, and Escape closes it before the shape", async ({
    show,
}) => {
    const { page } = show;
    await selectAll(page);
    const at = await pointAtField(show);

    // The Shapes tab says how to open the ring
    await page.getByRole("tab", { name: "Shapes" }).click();
    await expect(page.getByTestId("shapes-tab-ring-hint")).toHaveText(
        "Hold R on the field for the shape ring",
    );
    await page.mouse.move(at.x, at.y);
    await page.keyboard.press("r");
    await expect(ring(page)).toHaveAttribute("data-latched", "true");
    await expect(page.getByTestId("shape-ring-hint")).toBeVisible();
    // A click away dismisses it, and doesn't reach the field
    await page.mouse.click(at.x + 300, at.y + 200);
    await expect(ring(page)).toBeHidden();
    expect((await readField(page)).selection).toEqual(ALL);
    await expect(page.getByTestId("shape-tool-hint")).toBeHidden();

    await page.mouse.move(at.x, at.y);
    await page.keyboard.press("r");
    await ringSlot(page, "block").click();
    await expect(ring(page)).toBeHidden();
    await expect(page.getByTestId("shape-tool-hint")).toBeVisible();

    // With the box armed, Escape closes the ring first and keeps the shape
    await page.keyboard.press("r");
    await expect(ring(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(ring(page)).toBeHidden();
    await expect(page.getByTestId("shape-tool-hint")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("shape-tool-hint")).toBeHidden();
});

test("change: every shortcut is in the command palette: the ring opens latched from it, nudges are listed, and Shape › Box shows B", async ({
    show,
}) => {
    const { page } = show;
    await selectAll(page);
    await pointAtField(show);
    const palette = page.getByRole("combobox");

    // The ring, from the palette: latched, as a tap of R leaves it
    await page.keyboard.press("ControlOrMeta+k");
    await palette.fill("favorites ring");
    await expect(page.getByRole("option").first()).toHaveText(
        /^Favorites ring/,
    );
    await page.keyboard.press("Enter");
    await expect(ring(page)).toHaveAttribute("data-latched", "true");
    await ringSlot(page, "block").click();
    await expect(ring(page)).toBeHidden();
    await expect(page.getByTestId("shape-tool-hint")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("shape-tool-hint")).toBeHidden();

    // A nudge, with its key
    await page.keyboard.press("ControlOrMeta+k");
    await palette.fill("nudge up");
    await expect(page.getByRole("option").first()).toHaveText(/^Nudge up.*W$/);

    // Box and Circle are Shape › Box and Shape › Circle, with their keys
    await palette.fill("box");
    const shapeBox = page
        .getByRole("option")
        .filter({ hasText: /^Shape › Box/ })
        .first();
    await expect(shapeBox).toHaveText(/B$/);
    await palette.fill("circle");
    await expect(
        page
            .getByRole("option")
            .filter({ hasText: /^Shape › Circle/ })
            .first(),
    ).toHaveText(/O$/);
    await page.keyboard.press("Escape");
});

test("with nobody selected the ring's shapes are greyed out and say why, and letting go over one picks nothing", async ({
    show,
}) => {
    const { page } = show;
    expect((await readField(page)).selection).toEqual([]);
    const at = await pointAtField(show);
    await page.keyboard.down("r");
    const box = ringSlot(page, "block");
    await expect(box).toBeDisabled();
    await expect(page.getByTestId("shape-ring-reason")).toHaveText(
        "Select marchers first",
    );
    await page.mouse.move(at.x, at.y - 90, { steps: 4 });
    await page.keyboard.up("r");
    await expect(ring(page)).toBeHidden();
    await expect(page.getByTestId("shape-tool-hint")).toBeHidden();
    expect((await readField(page)).activeGesture).not.toBe("shape");
});

test.describe("with the ring rebound to J", () => {
    test.use({
        initScript: `localStorage.setItem("openmarch:shortcutOverrides", ${JSON.stringify(
            JSON.stringify({ openShapeRing: ["J"] }),
        )});`,
    });

    test("J opens the ring and R no longer does", async ({ show }) => {
        const { page } = show;
        await selectAll(page);
        await pointAtField(show);
        await page.keyboard.press("r");
        await expect(ring(page)).toBeHidden();
        await page.keyboard.press("j");
        await expect(ring(page)).toHaveAttribute("data-latched", "true");
        await page.keyboard.press("Escape");
        await page.getByRole("tab", { name: "Shapes" }).click();
        await expect(page.getByTestId("shapes-tab-ring-hint")).toHaveText(
            "Hold J on the field for the shape ring",
        );
    });
});

// The shape library (#352): a Shapes entry in the left sidebar lists the basic
// kinds; a star puts a shape in the Shapes tab and the ring, for this user
// across shows and restarts. The ninth-star question is a component test
// (ShapeLibraryPanel.test.tsx): with one basic kind, nine can't be starred here.
test("the Shapes tab's Library button opens the library; a star puts Box in the tab and the ring, and it's kept after a reload", async ({
    show,
}) => {
    const { page } = show;
    const shapesTab = () => page.getByRole("tab", { name: "Shapes" }).click();
    await shapesTab();
    await expect(page.getByTestId("shapes-tab-starred-block")).toHaveCount(0);

    await page.getByTestId("shapes-tab-library").click();
    const library = page.getByTestId("shape-library");
    await expect(library).toBeVisible();
    const row = page.getByTestId("shape-library-row-block");
    await expect(row).toContainText("Box");
    await expect(row).toContainText("2 apart");
    const star = page.getByTestId("shape-library-star-block");
    await expect(star).toHaveAttribute("aria-pressed", "false");

    // Before any star the ring's Box only fills an empty slot. R again
    // closes the tapped ring (Escape would also close the sidebar)
    await selectAll(page);
    await pointAtField(show);
    await page.keyboard.press("r");
    await expect(ringSlot(page, "block")).toHaveAttribute(
        "data-starred",
        "false",
    );
    await page.keyboard.press("r");
    await expect(ring(page)).toBeHidden();

    await star.click();
    await expect(star).toHaveAttribute("aria-pressed", "true");

    // In the ring, marked as starred
    await pointAtField(show);
    await page.keyboard.press("r");
    await expect(ringSlot(page, "block")).toHaveAttribute(
        "data-starred",
        "true",
    );
    await page.keyboard.press("r");
    await expect(ring(page)).toBeHidden();

    // In the Shapes tab after the divider, and picking it arms the box
    const starred = page.getByTestId("shapes-tab-starred-block");
    await expect(starred).toHaveAccessibleName("Box");
    await starred.click();
    await expect(page.getByTestId("shape-tool-hint")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("shape-tool-hint")).toBeHidden();

    // The star is the user's, so it outlasts a reload
    await page.reload();
    await waitForField(page);
    await shapesTab();
    await expect(page.getByTestId("shapes-tab-starred-block")).toBeVisible();
    await page.getByTestId("shape-library-tab").click();
    await expect(star).toHaveAttribute("aria-pressed", "true");

    // Unstarring takes it out of the tab again
    await star.click();
    await expect(star).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("shapes-tab-starred-block")).toHaveCount(0);
});

// Saved shapes (#353): ☆ Save keeps a shape's kind and spacing, not its size
// or count, starred, in the user's library and in the show; picked for another
// selection it draws at its spacing, and the show keeps its copy for a machine
// whose library doesn't have it.
/**
 * Draws a box on everyone, sets its spacing to 2½ × 1½ and saves it from the
 * ⋯ row as "Wide box", leaving it open. Returns the saved shape's id.
 */
async function saveWideBox(show: Show): Promise<string> {
    const { page } = show;
    await drawBox(show);
    await page.getByTestId("shape-editor-across").click();
    await page.keyboard.type("2.5");
    await page.keyboard.press("Enter");
    await expect.poll(() => readout(page)).toBe("4 × 2 · 2½ × 6 steps");
    await page.getByTestId("shape-editor-deep").click();
    await page.keyboard.type("1.5");
    await page.keyboard.press("Enter");
    await expect.poll(() => readout(page)).toBe("4 × 2 · 2½ × 1½ steps");

    // Save asks for a name, offering the kind and its spacing
    await page.getByTestId("shape-editor-save").click();
    const name = page.getByTestId("shape-editor-save-name");
    await expect(name).toBeFocused();
    await expect(name).toHaveValue("Box 2½ × 1½ apart");
    await name.fill("Wide box");
    await page.keyboard.press("Enter");
    // An icon on the editor's one row (#429): the words are its name and tooltip
    await expect(page.getByTestId("shape-editor-save")).toHaveAttribute(
        "aria-label",
        "Saved as Wide box",
    );
    // Enter named it: the box is still open
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();

    // The show keeps a copy: the kind and its intervals, no size or count
    await expect
        .poll(() =>
            show.query<{ name: string; kind: string; intervals: string }>(
                "SELECT name, kind, intervals FROM saved_shapes",
            ),
        )
        .toEqual([
            {
                name: "Wide box",
                kind: "block",
                intervals: JSON.stringify({ across: 2.5, deep: 1.5 }),
            },
        ]);
    const [{ id }] = await show.query<{ id: string }>(
        "SELECT id FROM saved_shapes",
    );
    return id;
}

test("change: ☆ Save keeps a box's spacing as a starred saved shape that draws at that spacing on another selection, and the show keeps a copy", async ({
    show,
}) => {
    const { page } = show;
    const id = await saveWideBox(show);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();

    // Starred: it's in the Shapes tab. Picked for five marchers, a drag draws
    // a box of five at the saved spacing
    await page.keyboard.press("Escape");
    for (const [i, drill] of ["T1", "T2", "T3", "T4", "T5"].entries())
        await clickMarcher(page, drill, { add: i > 0 });
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([1, 2, 3, 4, 5]);
    await page.getByRole("tab", { name: "Shapes" }).click();
    const starred = page.getByTestId(`shapes-tab-starred-${id}`);
    await expect(starred).toHaveAccessibleName("Wide box");
    // Its picture is drawn at its own spacing, so it isn't the plain box's (#378)
    const picture = (id: string) =>
        page.getByTestId(id).getByTestId("shape-preview").innerHTML();
    expect(await picture(`shapes-tab-starred-${id}`)).not.toBe(
        await picture("shapes-tab-block"),
    );
    await starred.click();
    await expect(page.getByTestId("shape-tool-hint")).toBeVisible();
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    await drag(
        page,
        await toScreen(page, { x: cf.x - 15 * S, y: cf.y - 25 * S }),
        await toScreen(page, { x: cf.x - 5 * S, y: cf.y - 19 * S }),
    );
    expect((await shapeOverlay(page))!.spots).toHaveLength(5);
    await expect.poll(() => readout(page)).toMatch(/ · 2½ × 1½ steps$/);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    // An ordinary box recipe: it reopens without the saved shape
    await expect
        .poll(async () =>
            (
                await show.query<{ kind: string }>(
                    "SELECT kind FROM timeline_shape_recipes",
                )
            ).map((r) => r.kind),
        )
        .toEqual(["block"]);

    // On a machine whose library doesn't have it, the show still lists it,
    // and it can be deleted there
    await page.evaluate(() => localStorage.removeItem("openmarch:savedShapes"));
    await page.reload();
    await waitForField(page);
    await page.getByTestId("shape-library-tab").click();
    const row = page.getByTestId(`shape-library-row-${id}`);
    await expect(row).toContainText("Wide box");
    await expect(row).toContainText("Box · 2½ × 1½ apart · this show only");
    await page.getByTestId(`shape-library-delete-${id}`).click();
    await expect(row).toHaveCount(0);
    await expect
        .poll(() => show.query("SELECT id FROM saved_shapes"))
        .toEqual([]);
    await expect(page.getByTestId("shape-library-saved-empty")).toBeVisible();
});

test("change: ☆ Save in the floating editor saves a selected placed box, starred in the library", async ({
    show,
}) => {
    const { page } = show;
    await placeBox(show);
    const t3 = await marcherScreen(page, 3);
    await page.mouse.click(t3.x, t3.y);
    await expect(page.getByTestId("placed-box-readout")).toBeVisible();

    const editor = page.getByTestId("placed-box-readout");
    await editor.getByTestId("shape-editor-save").click();
    const name = page.getByTestId("shape-editor-save-name");
    await expect(name).toBeFocused();
    await name.fill("Placed box");
    await page.getByTestId("shape-editor-save-confirm").click();
    await expect(editor.getByTestId("shape-editor-save")).toHaveAttribute(
        "aria-label",
        "Saved as Placed box",
    );

    await expect
        .poll(() => show.query("SELECT name FROM saved_shapes"))
        .toEqual([{ name: "Placed box" }]);
    const [{ id }] = await show.query<{ id: string }>(
        "SELECT id FROM saved_shapes",
    );
    await page.getByTestId("shape-library-tab").click();
    await expect(page.getByTestId(`shape-library-row-${id}`)).toContainText(
        "Placed box",
    );
    await expect(page.getByTestId(`shape-library-star-${id}`)).toHaveAttribute(
        "aria-pressed",
        "true",
    );
});

// Saved shapes keep a description, how they're filled and their dates (#393):
// saved with a description, the show's copy has them all, and on a machine
// whose library doesn't have it the library lists it with its description and
// can take it in, dates and all.
test("change: a box saved with a description reopens from the show's copy with its description, distribution and dates", async ({
    show,
}) => {
    const { page } = show;
    await placeBox(show);
    const t3 = await marcherScreen(page, 3);
    await page.mouse.click(t3.x, t3.y);
    await expect(page.getByTestId("placed-box-readout")).toBeVisible();

    const editor = page.getByTestId("placed-box-readout");
    await editor.getByTestId("shape-editor-save").click();
    const name = page.getByTestId("shape-editor-save-name");
    await expect(name).toBeFocused();
    await name.fill("Opener block");
    const description = "Company front for the opener, then into the arc";
    await page.getByTestId("shape-editor-save-description").fill(description);
    await page.keyboard.press("Enter");
    await expect(editor.getByTestId("shape-editor-save")).toHaveAttribute(
        "aria-label",
        "Saved as Opener block",
    );

    type Row = {
        id: string;
        description: string | null;
        distribution: string | null;
        created_at: string;
        updated_at: string;
    };
    await expect
        .poll(
            async () =>
                (await show.query<Row>("SELECT * FROM saved_shapes")).length,
        )
        .toBe(1);
    const [copy] = await show.query<Row>("SELECT * FROM saved_shapes");
    expect(copy.description).toBe(description);
    // Files, Short back: the layout without its size
    expect(JSON.parse(copy.distribution!)).toEqual({
        mode: "files",
        layout: { family: "shortBack", byFile: false },
        stagger: [0, 1],
    });
    expect(copy.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(copy.updated_at).toBe(copy.created_at);

    // Another machine: my library doesn't have it, the show's copy does
    await page.evaluate(() => localStorage.removeItem("openmarch:savedShapes"));
    await page.reload();
    await waitForField(page);
    await page.getByTestId("shape-library-tab").click();
    const row = page.getByTestId(`shape-library-row-${copy.id}`);
    await expect(row).toContainText("Opener block");
    await expect(row).toContainText("this show only");
    const shown = page.getByTestId(`shape-library-description-${copy.id}`);
    await expect(shown).toHaveText(description);
    await shown.hover();
    await expect(page.getByRole("tooltip")).toContainText(description);
    await page.mouse.move(5, 5);

    // Taken into my library, it keeps the description and dates
    await page.getByTestId(`shape-library-add-${copy.id}`).click();
    await expect(row).not.toContainText("this show only");
    const library = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("openmarch:savedShapes") ?? "[]"),
    );
    expect(library).toEqual([
        expect.objectContaining({
            id: copy.id,
            name: "Opener block",
            description,
            distribution: JSON.parse(copy.distribution!),
            createdAt: copy.created_at,
            updatedAt: copy.updated_at,
        }),
    ]);
});

// Another show, with my library from the show a shape was saved in: the
// harness opens one show per test, so this show starts with the user's
// library as the app keeps it (#353 "saved shapes appear in another show").
const SAVED_ELSEWHERE = {
    id: "0b6c1f4e-6f5d-4a0e-9a57-3f1f2f6b9b11",
    name: "Wide box",
    kind: "block",
    kindVersion: 1,
    intervals: { across: 2.5, deep: 1.5 },
};

test.describe("another show, with a shape saved in my library", () => {
    test.use({
        initScript: `localStorage.setItem("openmarch:savedShapes", ${JSON.stringify(
            JSON.stringify([SAVED_ELSEWHERE]),
        )})`,
    });

    test("change: the library lists my saved shape, and placing it from there gives this show its own copy", async ({
        show,
    }) => {
        const { page } = show;
        const { id } = SAVED_ELSEWHERE;
        expect(await show.query("SELECT id FROM saved_shapes")).toEqual([]);

        await page.getByTestId("shape-library-tab").click();
        const row = page.getByTestId(`shape-library-row-${id}`);
        await expect(row).toContainText("Wide box");
        await expect(row).toContainText("Box · 2½ × 1½ apart");
        await expect(row).not.toContainText("this show only");

        await selectAll(page);
        await page.getByTestId(`shape-library-pick-${id}`).click();
        await expect(page.getByTestId("shape-tool-hint")).toBeVisible();
        const grid = await fieldGrid(show);
        const S = grid.pixelsPerStep;
        const cf = grid.centerFront;
        await drag(
            page,
            await toScreen(page, { x: cf.x - 15 * S, y: cf.y - 25 * S }),
            await toScreen(page, { x: cf.x - 5 * S, y: cf.y - 19 * S }),
        );
        await expect.poll(() => readout(page)).toMatch(/ · 2½ × 1½ steps$/);
        await page.keyboard.press("Enter");
        await expect(page.getByTestId("shape-tool-readout")).toBeHidden();

        await expect
            .poll(() =>
                show.query(
                    "SELECT id, name, kind, intervals FROM saved_shapes",
                ),
            )
            .toEqual([
                {
                    id,
                    name: "Wide box",
                    kind: "block",
                    intervals: JSON.stringify(SAVED_ELSEWHERE.intervals),
                },
            ]);
    });
});

// The circle (#389, spec #385): a closed kind with no corners, filled in
// Outline by the host's distributor. It comes after Box in the Shapes tab, the
// ring and the command bar, is drawn from its center out, and its one handle
// sets the interval between neighbors (the chord), which sets its size.

const circleInterval = (page: Page) =>
    page
        .getByTestId("shape-tool-readout")
        .getByTestId("shape-editor-interval")
        .innerText();

/** Each spot's distance to the next one round `center` */
function chords(spots: readonly Point[], center: Point): number[] {
    const round = [...spots].sort(
        (a, b) =>
            Math.atan2(a.y - center.y, a.x - center.x) -
            Math.atan2(b.y - center.y, b.x - center.x),
    );
    return round.map((p, i) => {
        const next = round[(i + 1) % round.length];
        return Math.hypot(next.x - p.x, next.y - p.y);
    });
}

test("change: O opens the circle tool; a drag from the center draws it, its handle sets the interval, and Enter places everyone one interval apart", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    const steps = await undoSteps(show);
    await selectAll(page);
    await page.keyboard.press("o");
    await expect(page.getByTestId("shape-tool-hint")).toContainText(
        "draw a circle",
    );

    // From the center out to a rim 8 steps away: 8 marchers, a chord of 6.1,
    // so 6 steps apart
    const center = { x: cf.x - 10 * S, y: cf.y - 22 * S };
    await drag(
        page,
        await toScreen(page, center),
        await toScreen(page, { x: center.x + 8 * S, y: center.y }),
    );
    await expect.poll(() => circleInterval(page)).toBe("6");
    const drawn = (await shapeOverlay(page))!;
    expect(drawn.spots).toHaveLength(ALL.length);
    for (const chord of chords(drawn.spots, center))
        expect(Math.abs(chord - 6 * S)).toBeLessThan(CLOSE);
    // The first marcher stands front-center
    const r = (6 * S) / (2 * Math.sin(Math.PI / 8));
    expect(
        drawn.spots.some(
            (p) =>
                Math.abs(p.x - center.x) < CLOSE &&
                Math.abs(p.y - (center.y + r)) < CLOSE,
        ),
    ).toBe(true);
    // Outline and Spread on the editor's second row, Outline on (and never Grid)
    await expect(
        page.getByTestId("shape-tool-readout").getByTestId("shape-mode-menu"),
    ).toBeVisible();
    await expect(page.getByTestId("shape-mode-menu")).toHaveAttribute(
        "data-mode",
        "outline",
    );
    expect(await modeNames(page)).toEqual(["Outline", "Spread"]);

    // One handle, on the rim: dragged out to 12 steps it makes the marchers 9
    // steps apart, the center kept
    expect(drawn.handles).toHaveLength(1);
    await drag(
        page,
        drawn.handles[0],
        await toScreen(page, { x: center.x + 12 * S, y: center.y }),
    );
    await expect.poll(() => circleInterval(page)).toBe("9");
    const resized = (await shapeOverlay(page))!;
    for (const chord of chords(resized.spots, center))
        expect(Math.abs(chord - 9 * S)).toBeLessThan(CLOSE);

    // Enter places everyone on the spots as one undo step, and the recipe is
    // the circle's, in Outline
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    await expect.poll(() => onSpots(show, resized.spots)).toBe(true);
    await waitForIdle(page);
    expect(await undoSteps(show)).toBe(steps + 1);
    const [recipe] = await show.query<{
        kind: string;
        kind_version: number;
        params: string;
    }>("SELECT kind, kind_version, params FROM timeline_shape_recipes");
    expect([recipe.kind, recipe.kind_version]).toEqual(["circle", 2]);
    const stored = JSON.parse(recipe.params);
    expect(stored.distribution).toEqual({
        mode: "outline",
        oddGap: { side: "back", at: null, style: "spread" },
    });
    expect(stored.interval).toBeCloseTo(9 * S);
});

test("change: the circle comes after Box in the Shapes tab, the ring and the command bar, which asks its interval", async ({
    show,
}) => {
    const { page } = show;
    await selectAll(page);

    // The Shapes tab: a picture of itself, named on hover, right after Box
    await page.getByRole("tab", { name: "Shapes" }).click();
    const tabKinds = page.locator(
        '[data-testid="shapes-tab-block"], [data-testid="shapes-tab-circle"]',
    );
    await expect(tabKinds).toHaveCount(2);
    expect(
        await tabKinds.evaluateAll((els) =>
            els.map((el) => el.getAttribute("data-testid")),
        ),
    ).toEqual(["shapes-tab-block", "shapes-tab-circle"]);
    const circle = page.getByTestId("shapes-tab-circle");
    await expect(circle).toHaveAccessibleName("Circle");
    await expect(circle.getByTestId("shape-preview")).toHaveAttribute(
        "data-spots",
        "9",
    );

    // The ring: the basic kinds in the same order
    await pointAtField(show);
    await page.keyboard.down("r");
    await expect(ring(page)).toBeVisible();
    const slots = await page
        .locator('[data-testid^="shape-ring-slot-"]')
        .evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
    expect(slots.slice(0, 2)).toEqual([
        "shape-ring-slot-block",
        "shape-ring-slot-circle",
    ]);
    await expect(ringSlot(page, "circle")).toHaveText("Circle");
    await page.keyboard.up("r");
    await page.keyboard.press("Escape");
    await expect(ring(page)).toBeHidden();

    // The command bar: Shape › Circle asks how it's filled (Enter keeps
    // Outline), then its one number, and places it
    await page.keyboard.press("/");
    await page.getByRole("combobox").fill("circle");
    await expect(page.getByRole("option").first()).toHaveText(
        /^Shape › Circle/,
    );
    await page.keyboard.press("Enter");
    await expect(bar(page)).toBeVisible();
    await expect(question(page)).toHaveText(/^Fill/);
    await expect(answer(page)).toHaveValue("Outline");
    await page.keyboard.press("Enter");
    await expect(question(page)).toHaveText(/^Spacing between neighbors/);
    await expect(answer(page)).toHaveValue("2");
    expect((await shapeOverlay(page))!.spots).toHaveLength(ALL.length);
    await answer(page).fill("3");
    await expect.poll(() => circleInterval(page)).toBe("3");
    const spots = (await shapeOverlay(page))!.spots;
    await page.keyboard.press("Enter");
    await expect(bar(page)).toBeHidden();
    await expect.poll(() => onSpots(show, spots)).toBe(true);
});

// Placed shapes of any kind (#397): a placed circle is selected by a click on
// a member and edited in place through its kind, like a placed box.

test("change: a click on a placed circle's member selects it whole, its handle changes the interval and saves at once, and inside it the outline says Circle", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    await selectAll(page);
    await page.keyboard.press("o");
    const center = { x: cf.x - 10 * S, y: cf.y - 22 * S };
    await drag(
        page,
        await toScreen(page, center),
        await toScreen(page, { x: center.x + 8 * S, y: center.y }),
    );
    await expect.poll(() => circleInterval(page)).toBe("6");
    const spots = (await shapeOverlay(page))!.spots;
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("shape-tool-readout")).toBeHidden();
    await expect.poll(() => onSpots(show, spots)).toBe(true);
    await waitForIdle(page);
    await page.keyboard.press("Escape");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([]);

    // A click on a member selects the whole circle, which draws its own
    // outline and one handle, and shows its numbers
    const t3 = await marcherScreen(page, 3);
    await page.mouse.click(t3.x, t3.y);
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
    await expect
        .poll(async () => (await shapeOverlay(page))?.handles.length)
        .toBe(1);
    expect((await readField(page)).handles).toBeNull();
    // A circle has no count across to step
    await expect(
        page
            .getByTestId("placed-box-readout")
            .getByRole("button", { name: /across/ }),
    ).toHaveCount(0);
    await expect(
        page
            .getByTestId("placed-box-readout")
            .getByTestId("shape-editor-interval"),
    ).toHaveText("6");

    // Its handle, dragged out to 12 steps, saves at once as one undo step:
    // everyone 9 steps from the next, round the same center
    const steps = await undoSteps(show);
    const [handle] = (await shapeOverlay(page))!.handles;
    await drag(
        page,
        handle,
        await toScreen(page, { x: center.x + 12 * S, y: center.y }),
    );
    await expect
        .poll(async () => {
            const [row] = await show.query<{ params: string }>(
                "SELECT params FROM timeline_shape_recipes ORDER BY id DESC LIMIT 1",
            );
            return JSON.parse(row.params).interval / S;
        })
        .toBeCloseTo(9);
    await waitForIdle(page);
    expect(await undoSteps(show)).toBe(steps + 1);
    const after = await savedPositions(show, 0);
    for (const chord of chords(after, center))
        expect(Math.abs(chord - 9 * S)).toBeLessThan(CLOSE);
    expect((await readField(page)).selection).toEqual(ALL);
    await expect(
        page
            .getByTestId("placed-box-readout")
            .getByTestId("shape-editor-interval"),
    ).toHaveText("9");
    await expectCanvasMatchesShow(show);

    // Inside it, the outline of the rest is drawn and labelled
    await page.mouse.dblclick(t3.x, t3.y);
    await expect
        .poll(async () => (await readField(page)).selection)
        .toHaveLength(1);
    await expect
        .poll(async () => (await placedBoxes(page)).map((b) => b.label))
        .toEqual(["Circle · 9 steps"]);
});

// Tablets (#1060 tablet layout, merged from main): an Apple Pencil edits the field as a mouse
// does, fingers only navigate it, and on a screen that can't hover the shape never calms down

/** Drags a pen (an Apple Pencil) from `from` to `to`, in viewport pixels, through Chromium's input. */
async function penDrag(page: Page, from: Point, to: Point, steps = 12) {
    const cdp = await page.context().newCDPSession(page);
    const send = (
        type: "mousePressed" | "mouseMoved" | "mouseReleased",
        p: Point,
    ) =>
        cdp.send("Input.dispatchMouseEvent", {
            type,
            x: p.x,
            y: p.y,
            button: "left",
            buttons: type === "mouseReleased" ? 0 : 1,
            clickCount: type === "mouseMoved" ? 0 : 1,
            pointerType: "pen",
        });
    await send("mouseMoved", from);
    await send("mousePressed", from);
    for (let i = 1; i <= steps; i++)
        await send("mouseMoved", {
            x: from.x + ((to.x - from.x) * i) / steps,
            y: from.y + ((to.y - from.y) * i) / steps,
        });
    await send("mouseReleased", to);
    await cdp.detach();
}

/** Drags one finger from `from` to `to`, in viewport pixels. */
async function fingerDrag(page: Page, from: Point, to: Point, steps = 10) {
    const cdp = await page.context().newCDPSession(page);
    const send = (type: "touchStart" | "touchMove" | "touchEnd", p?: Point) =>
        cdp.send("Input.dispatchTouchEvent", {
            type,
            touchPoints: p ? [{ x: p.x, y: p.y, id: 0 }] : [],
        });
    await send("touchStart", from);
    for (let i = 1; i <= steps; i++)
        await send("touchMove", {
            x: from.x + ((to.x - from.x) * i) / steps,
            y: from.y + ((to.y - from.y) * i) / steps,
        });
    await send("touchEnd");
    await cdp.detach();
}

test("change: an Apple Pencil draws the box, stretches it by a handle and moves it, as a mouse does", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    await selectAll(page);
    await page.keyboard.press("b");
    await expect(page.getByTestId("shape-tool-hint")).toBeVisible();

    await penDrag(
        page,
        await toScreen(page, { x: cf.x - 15 * S, y: cf.y - 25 * S }),
        await toScreen(page, { x: cf.x - 5 * S, y: cf.y - 19 * S }),
    );
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();
    expect(await readout(page)).toMatch(/^4 × 2 · /);
    const before = await readout(page);

    const handles = (await shapeOverlay(page))!.handles;
    const se = handles.reduce((a, b) => (b.x + b.y > a.x + a.y ? b : a));
    await penDrag(page, se, { x: se.x + 60, y: se.y + 30 });
    await expect.poll(() => readout(page)).not.toBe(before);

    const spotsBefore = (await shapeOverlay(page))!.spots;
    const xs = spotsBefore.map((p) => p.x);
    const ys = spotsBefore.map((p) => p.y);
    const inside = await toScreen(page, {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
    });
    await penDrag(page, inside, { x: inside.x - 80, y: inside.y + 40 });
    const spotsAfter = (await shapeOverlay(page))!.spots;
    expect(spotsAfter[0].x).toBeLessThan(spotsBefore[0].x);
    expect(spotsAfter[0].y).toBeGreaterThan(spotsBefore[0].y);
    // Nothing is saved until Enter
    expect(await savedPositions(show, 0)).toEqual(asPositions(HOME));
});

test("change: a finger on the field with the box tool armed pans, and draws no box", async ({
    show,
}) => {
    const { page } = show;
    const grid = await fieldGrid(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    await selectAll(page);
    await page.keyboard.press("b");
    await expect(page.getByTestId("shape-tool-hint")).toBeVisible();
    const pan = async () => (await readField(page)).viewport.pan;
    const before = await pan();

    await fingerDrag(
        page,
        await toScreen(page, { x: cf.x - 15 * S, y: cf.y - 25 * S }),
        await toScreen(page, { x: cf.x - 5 * S, y: cf.y - 19 * S }),
    );
    await expect.poll(async () => (await pan()).x).not.toBe(before.x);
    expect((await shapeOverlay(page))!.outline).toBeNull();
    await expect(page.getByTestId("shape-tool-hint")).toBeVisible();
});

test("change: on a screen that can't hover, the open box's controls and its floating editor stay solid with the pointer away", async ({
    show,
}) => {
    const { page } = show;
    const cdp = await page.context().newCDPSession(page);
    // A touch screen: (hover: none)
    await cdp.send("Emulation.setTouchEmulationEnabled", {
        enabled: true,
        maxTouchPoints: 5,
    });
    expect(
        await page.evaluate(() => matchMedia("(hover: hover)").matches),
    ).toBe(false);
    const { grid } = await drawBox(show);
    const S = grid.pixelsPerStep;
    const cf = grid.centerFront;
    const away = await toScreen(page, { x: cf.x + 20 * S, y: cf.y - 5 * S });
    await page.mouse.move(away.x, away.y);
    // Longer than the editor's half-second wait before it fades
    await page.waitForTimeout(800);
    expect((await shapeOverlay(page))!.calm).toBe(false);
    expect(
        await page
            .getByTestId("fieldShapeHandle")
            .first()
            .evaluate((el) => getComputedStyle(el).opacity),
    ).toBe("1");
    expect(await editorOpacity(page)).toBe(1);
    await cdp.detach();
});

// The field's menu (#315, from main) and the shapes: it acts on the selection, so it stays shut
// while an open shape is being edited, and a selected placed box offers it for its marchers
const fieldMenu = (page: Page) => page.getByTestId("field-menu");

test("change: while an open box is being edited, a right-click on the field and the context-menu key open no menu (#315)", async ({
    show,
}) => {
    const { page } = show;
    const { pressed, released } = await drawBox(show);
    const middle = await toScreen(page, {
        x: (pressed.x + released.x) / 2,
        y: (pressed.y + released.y) / 2,
    });
    await page.mouse.click(middle.x, middle.y, { button: "right" });
    const t1 = await marcherScreen(page, 1);
    await page.mouse.click(t1.x, t1.y, { button: "right" });
    await page.keyboard.press("ContextMenu");
    await page.keyboard.press("Shift+F10");
    await page.waitForTimeout(300);
    await expect(fieldMenu(page)).toHaveCount(0);
    // Still open, as it was
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();
    expect((await readField(page)).selection).toEqual(ALL);
});

test("change: a selected placed box's right-click opens the field's menu for its marchers, as the context-menu key does (#315)", async ({
    show,
}) => {
    const { page } = show;
    await placeBox(show);
    const t1 = await marcherScreen(page, 1);
    await page.mouse.click(t1.x, t1.y);
    await expect(page.getByTestId("placed-box-readout")).toBeVisible();
    const members = (await readField(page)).selection;
    expect(members).toEqual(ALL);

    const t2 = await marcherScreen(page, 2);
    await page.mouse.click(t2.x, t2.y, { button: "right" });
    await expect(fieldMenu(page)).toBeVisible();
    // The selection is the box's marchers, kept
    expect((await readField(page)).selection).toEqual(members);
    await page.keyboard.press("Escape");
    await expect(fieldMenu(page)).toBeHidden();

    await page.keyboard.press("ContextMenu");
    await expect(fieldMenu(page)).toBeVisible();
});

/** Selects the placed box by a click on a member, and returns where to grab it to move it (between marchers, off the center dot) and the positions before */
async function selectPlacedBox(show: Show) {
    const { page } = show;
    const t1 = await marcherScreen(page, 1);
    await page.mouse.click(t1.x, t1.y);
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual(ALL);
    const S = (await fieldGrid(show)).pixelsPerStep;
    const before = await savedPositions(show, 0);
    const front = Math.max(...before.map((p) => p.y));
    const left = Math.min(...before.map((p) => p.x));
    const back = Math.min(...before.map((p) => p.y));
    return {
        S,
        before,
        grab: { x: left + (5 / 3) * S, y: (back + front) / 2 },
    };
}

/** How far each marcher moved across from `before`, in steps */
const stepsAcross = (before: Position[], after: Position[], S: number) =>
    after.map(
        (p) =>
            Math.round(
                ((p.x - before.find((q) => q.id === p.id)!.x) / S) * 100,
            ) / 100,
    );

/** Runs the page's CPU `rate` times slower, as on a busy or weak machine */
async function slowDown(page: Page, rate: number) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
}

test("a placed box dragged again before its last drag is saved goes on from where it was left, and every drag lands", async ({
    show,
}) => {
    const { page } = show;
    await placeBox(show);
    const { S, before, grab } = await selectPlacedBox(show);
    // A slow machine: a save takes long enough to press again before it's read back
    await slowDown(page, 4);
    for (let i = 0; i < 3; i++) {
        const from = { x: grab.x + i * 4 * S, y: grab.y };
        await drag(
            page,
            await toScreen(page, from),
            await toScreen(page, { x: from.x + 4 * S, y: from.y }),
        );
    }
    await waitForIdle(page, 1000);
    const after = await savedPositions(show, 0);
    expect(stepsAcross(before, after, S)).toEqual(after.map(() => 12));
    expect((await readField(page)).selection).toEqual(ALL);
});

test("quick arrow presses on a selected placed box all land", async ({
    show,
}) => {
    const { page } = show;
    await placeBox(show);
    const { S, before } = await selectPlacedBox(show);
    await slowDown(page, 4);
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
    await waitForIdle(page, 1000);
    const after = await savedPositions(show, 0);
    const moved = stepsAcross(before, after, S);
    expect(new Set(moved).size).toBe(1);
    const one = moved[0]! / 4;
    expect(one).toBeGreaterThan(0);
    // Four presses, four nudges of the same size
    await page.keyboard.press("ArrowRight");
    await waitForIdle(page, 1000);
    expect(
        stepsAcross(before, await savedPositions(show, 0), S)[0],
    ).toBeCloseTo(5 * one, 2);
});

test("a placed box stays drawn where it was dropped, every frame, while the drag is saved", async ({
    show,
}) => {
    const { page } = show;
    await placeBox(show);
    const { S, grab } = await selectPlacedBox(show);
    await slowDown(page, 4);
    const from = await toScreen(page, grab);
    const to = await toScreen(page, { x: grab.x + 4 * S, y: grab.y });
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    // The outline's left edge, each frame from the release until well after it's read back
    const edges = page.evaluate(
        () =>
            new Promise<(number | null)[]>((resolve) => {
                const out: (number | null)[] = [];
                const t0 = performance.now();
                const tick = () => {
                    const xs =
                        window.fieldTest
                            .shapeOverlay?.()
                            ?.outline?.map((p) => p.x) ?? [];
                    out.push(xs.length ? Math.min(...xs) : null);
                    if (performance.now() - t0 < 1500)
                        requestAnimationFrame(tick);
                    else resolve(out);
                };
                tick();
            }),
    );
    await page.mouse.up();
    const seen = await edges;
    const last = seen.at(-1)!;
    expect(last).not.toBeNull();
    // Never gone, never back where it was
    expect(seen.filter((x) => x === null || Math.abs(x - last) > 1e-6)).toEqual(
        [],
    );
});

test("a drag waiting for the one before it to be saved is saved on its own page, even after the next page is shown (review of #512)", async ({
    show,
}) => {
    const { page } = show;
    await placeBox(show);
    const { S, before, grab } = await selectPlacedBox(show);
    // Slower still: the second save must still be waiting when the next page shows
    await slowDown(page, 8);
    for (let i = 0; i < 2; i++) {
        const from = { x: grab.x + i * 4 * S, y: grab.y };
        await drag(
            page,
            await toScreen(page, from),
            await toScreen(page, { x: from.x + 4 * S, y: from.y }),
        );
    }
    // On to the next page while the second drag still waits for the first
    await page.keyboard.press("e");
    await waitForIdle(page, 1000);
    const after = await savedPositions(show, 0);
    expect(stepsAcross(before, after, S)).toEqual(after.map(() => 8));
});

test("an undo pressed while a drag of a placed box waits to be saved undoes that drag, and the outline goes back with the marchers (#513)", async ({
    show,
}) => {
    const { page } = show;
    await placeBox(show);
    const { S, before, grab } = await selectPlacedBox(show);
    const outlineLeft = async () =>
        Math.min(
            ...((await page.evaluate(() =>
                window.fieldTest.shapeOverlay?.()?.outline?.map((p) => p.x),
            )) ?? []),
        );
    const left = await outlineLeft();
    await slowDown(page, 8);
    for (let i = 0; i < 2; i++) {
        const from = { x: grab.x + i * 4 * S, y: grab.y };
        await drag(
            page,
            await toScreen(page, from),
            await toScreen(page, { x: from.x + 4 * S, y: from.y }),
            { steps: 4 },
        );
    }
    // Straight away, while the second drag still waits for the first to be read back
    await page.keyboard.press("ControlOrMeta+z");
    await waitForIdle(page, 1000);
    const after = await savedPositions(show, 0);
    // One press, one drag undone: the first drag stays
    expect(stepsAcross(before, after, S)).toEqual(after.map(() => 4));
    expect((await readField(page)).selection).toEqual(ALL);
    expect((await outlineLeft()) - left).toBeCloseTo(4 * S, 1);
    // And the next undoes the first
    await page.keyboard.press("ControlOrMeta+z");
    await waitForIdle(page, 1000);
    const back = await savedPositions(show, 0);
    expect(stepsAcross(before, back, S)).toEqual(back.map(() => 0));
});

test("a number drag in a placed box's editor right after another follows the pointer the whole time, while the first is still being saved (#515)", async ({
    show,
}) => {
    const { page } = show;
    await placeBox(show);
    await selectPlacedBox(show);
    const across = page
        .getByTestId("placed-box-readout")
        .getByTestId("shape-editor-across");
    await expect(across).toBeVisible();
    const width = async () => {
        const xs = (await shapeOverlay(page))!.outline!.map((p) => p.x);
        return Math.max(...xs) - Math.min(...xs);
    };
    const start = await width();
    // A slow machine: the first save is still going while the second drag is held
    await slowDown(page, 4);
    const center = async () => {
        const b = (await across.boundingBox())!;
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    // Three half steps wider, released
    const first = await center();
    await drag(page, first, { x: first.x + 24, y: first.y }, { steps: 6 });
    // Straight away, three more, held
    const second = await center();
    await page.mouse.move(second.x, second.y);
    await page.mouse.down();
    await page.mouse.move(second.x + 24, second.y, { steps: 6 });
    // The outline's width each frame while the second drag is held, from the box read back and on
    const seen = await page.evaluate(
        () =>
            new Promise<number[]>((resolve) => {
                const out: number[] = [];
                const t0 = performance.now();
                const tick = () => {
                    const xs =
                        window.fieldTest
                            .shapeOverlay?.()
                            ?.outline?.map((p) => p.x) ?? [];
                    out.push(xs.length ? Math.max(...xs) - Math.min(...xs) : 0);
                    if (performance.now() - t0 < 2500)
                        requestAnimationFrame(tick);
                    else resolve(out);
                };
                tick();
            }),
    );
    await page.mouse.up();
    await waitForIdle(page, 1000);
    const end = await width();
    expect(end).toBeGreaterThan(start);
    // Never back to the first drag's width, or the box's from before
    expect(seen.filter((w) => Math.abs(w - end) > 0.01)).toEqual([]);
});

test.describe("a box carried onto the next page, where nobody has a move yet (#514)", () => {
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
            // Page 2 sets nobody: everyone stands where Page 1 left them
            positions: [HOME, HOME, []],
        }),
    });

    test("dragged twice quickly there, it stays selected every frame, and the second drag moves its copy on that page rather than copying it again", async ({
        show,
    }) => {
        const { page } = show;
        await selectPage(show, "Page 1");
        await placeBox(show, 1);
        const onPage1 = await savedPositions(show, 1);
        await selectPage(show, "Page 2");
        const t1 = await marcherScreen(page, 1);
        await page.mouse.click(t1.x, t1.y);
        await expect(page.getByTestId("placed-box-readout")).toBeVisible();
        const S = (await fieldGrid(show)).pixelsPerStep;
        const front = Math.max(...onPage1.map((p) => p.y));
        const left = Math.min(...onPage1.map((p) => p.x));
        const back = Math.min(...onPage1.map((p) => p.y));
        const grab = { x: left + (5 / 3) * S, y: (back + front) / 2 };

        await slowDown(page, 4);
        // Whether the shape is drawn selected, each frame from the first press until it's saved
        await page.evaluate(() => {
            const w = window as unknown as {
                drawnEachFrame: boolean[];
                stopFrames: boolean;
            };
            w.drawnEachFrame = [];
            w.stopFrames = false;
            const tick = () => {
                const outline = window.fieldTest.shapeOverlay?.()?.outline;
                w.drawnEachFrame.push((outline?.length ?? 0) > 0);
                if (!w.stopFrames) requestAnimationFrame(tick);
            };
            tick();
        });
        for (let i = 0; i < 2; i++) {
            const from = { x: grab.x + i * 4 * S, y: grab.y };
            await drag(
                page,
                await toScreen(page, from),
                await toScreen(page, { x: from.x + 4 * S, y: from.y }),
            );
        }
        await waitForIdle(page, 2000);
        const drawn = await page.evaluate(() => {
            const w = window as unknown as {
                drawnEachFrame: boolean[];
                stopFrames: boolean;
            };
            w.stopFrames = true;
            return w.drawnEachFrame;
        });
        expect(drawn.length).toBeGreaterThan(10);
        expect(drawn.filter((d) => !d)).toEqual([]);
        expect((await readField(page)).selection).toEqual(ALL);

        // Both drags land on Page 2, and Page 1 is as it was
        const after = await savedPositions(show, 2);
        expect(stepsAcross(onPage1, after, S)).toEqual(after.map(() => 8));
        expect(await savedPositions(show, 1)).toEqual(onPage1);
        // Page 1's box and one copy on Page 2: no recipe is left with nobody in it
        const recipes = await show.query<{ members: number }>(
            `SELECT (SELECT COUNT(*) FROM timeline_shape_recipe_marchers m
                WHERE m.recipe_id = r.id) AS members
             FROM timeline_shape_recipes r ORDER BY r.id`,
        );
        expect(recipes.map((r) => r.members)).toEqual([8, 8]);
    });
});

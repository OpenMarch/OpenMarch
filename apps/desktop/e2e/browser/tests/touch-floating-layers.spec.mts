import type { Locator, Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    drawnMarchers,
    expectCanvasMatchesShow,
    pinch,
    readField,
    tap,
    touchDrag,
    waitForIdle,
} from "../app.mjs";
import { savedPositions } from "../positions.mjs";
import { goToPage, isolate, pageBox } from "../timeline.mjs";
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
// And on the field itself (#933): the pill and the shape editor leave the box's handles and the
// selection's rotate knob free, and after a split the isolation bar's Done is free (no toast).
// And (#936): a big shape's editor bar stays inside the field after a pinch, the pill keeps its
// spot after a deselect, and arming the Box tool doesn't put the pill where the first stroke goes.

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

/**
 * Waits until `locator` has stayed in the same place for a few frames: the shape editor springs
 * after an edit and glides with the view after a drag, and a tap on a moving button can miss
 */
async function settledAt(page: Page, locator: Locator): Promise<Point> {
    let last = "";
    let same = 0;
    await expect
        .poll(
            async () => {
                const box = await locator.boundingBox();
                const now = box
                    ? `${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)}`
                    : "";
                same = now !== "" && now === last ? same + 1 : 0;
                last = now;
                return same >= 3;
            },
            { intervals: [100] },
        )
        .toBe(true);
    return centerOf(locator);
}

/**
 * Waits until the pill has no placing waiting on a timer (it marks itself `data-placing` while
 * one is) and has stopped moving (#1023)
 */
async function pillSettled(page: Page) {
    const pill = page.getByTestId("touch-modifier-buttons");
    const placing = () =>
        pill.evaluate((el) => el.hasAttribute("data-placing"));
    await expect.poll(placing).toBe(false);
    await settledAt(page, pill);
    await expect.poll(placing).toBe(false);
}

/** Checks a finger at `locator`'s middle lands on it, then taps it there */
async function reachAndTap(page: Page, locator: Locator) {
    await expect(locator).toBeVisible();
    // The pill and the zoom box find their spots once the layers settle
    await expect.poll(() => topmostAt(locator)).toBe("itself");
    const at = await settledAt(page, locator);
    expect(await topmostAt(locator)).toBe("itself");
    await tap(page, at);
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

const LANDSCAPE = LAYOUTS[0];

test("a pill parked where the line tool's card shows moves aside, then comes back", async ({
    show,
}) => {
    const { page } = show;
    await page.setViewportSize(LANDSCAPE);
    await expectCanvasMatchesShow(show);
    const pill = page.getByTestId("touch-modifier-buttons");
    const grip = pill.getByRole("button", { name: "Move these buttons" });
    // Dragged by its grip to the top of the field, under where the card shows
    const field = (await page
        .getByTestId("fieldCanvas")
        .first()
        .boundingBox())!;
    const from = await centerOf(grip);
    const pillBox = (await pill.boundingBox())!;
    const to = {
        x: from.x + (field.x + 16 - pillBox.x),
        y: from.y + (field.y + 16 - pillBox.y),
    };
    await touchDrag(page, from, to, { steps: 12 });
    await page.waitForTimeout(300);
    const parked = (await pill.boundingBox())!;

    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("l");
    await tapPoints(page, [
        await onField(page, 0.3, 0.7),
        await onField(page, 0.5, 0.7),
    ]);
    const hint = page.getByTestId("shape-tool-hint");
    await expect(hint).toContainText("Tap to add points");
    // Out of the card's way, and Finish under a finger
    await pillClearOf(page, hint);
    expect(await topmostAt(page.getByTestId("shape-tool-finish"))).toBe(
        "itself",
    );

    // Discard drops the points; the tool stays armed with its empty card (#872), also at the
    // field's top, so the pill stays aside. A second Discard closes the tool and the card goes
    const discard = page.getByTestId("shape-tool-discard");
    await reachAndTap(page, discard);
    await expect(hint).toContainText("Drag on the field to draw");
    await expect(page.getByTestId("shape-tool-finish")).toHaveCount(0);
    await pillClearOf(page, hint);
    await reachAndTap(page, discard);
    await expect(hint).toBeHidden();
    // The card gone, the pill is back where it was parked
    await expect
        .poll(async () => {
            const now = (await pill.boundingBox())!;
            return (
                Math.abs(now.x - parked.x) < 2 && Math.abs(now.y - parked.y) < 2
            );
        })
        .toBe(true);
});

test("the zoom box rises above the prop tool's card, and Finish stays reachable", async ({
    show,
}) => {
    const { page } = show;
    await page.setViewportSize(LANDSCAPE);
    await expectCanvasMatchesShow(show);
    await tap(page, await centerOf(page.locator("#sidebar-launcher-props")));
    await tap(
        page,
        await centerOf(page.getByRole("button", { name: "Polygon" })),
    );
    const finish = page.getByTestId("prop-draw-finish");
    const card = page.locator('[data-field-layer="task"]', { has: finish });
    await expect(card).toBeVisible();
    // Clear of the card, or out of the way when there's no room above it
    const zoom = page.locator("[data-zoom-controls]");
    await expect
        .poll(async () => {
            const hidden = await zoom.evaluate(
                (el) => getComputedStyle(el).visibility === "hidden",
            );
            if (hidden) return true;
            return !intersects(
                (await zoom.boundingBox())!,
                (await card.boundingBox())!,
            );
        })
        .toBe(true);
    await pillClearOf(page, card);

    await tapPoints(page, [
        await onField(page, 0.3, 0.3),
        await onField(page, 0.5, 0.3),
        await onField(page, 0.4, 0.15),
    ]);
    await expect(finish).toBeEnabled();
    await reachAndTap(page, finish);
    await expect
        .poll(() => page.evaluate(() => window.fieldTest!.activeGesture()))
        .toBeNull();
});

test("with the toolbar panel open, the open shape's Go back chip sits below it and Go back works", async ({
    show,
}) => {
    const { page } = show;
    await page.setViewportSize(LANDSCAPE);
    await expectCanvasMatchesShow(show);
    await openPanel(page);
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("b");
    await touchDrag(
        page,
        await onField(page, 0.3, 0.5),
        await onField(page, 0.55, 0.75),
        { steps: 12 },
    );
    const readout = page.getByTestId("shape-tool-readout");
    await expect(readout).toBeVisible();

    // A beat on, away from the shape's moment: the chip shows instead of the shape
    await page.keyboard.press("Shift+E");
    const chip = page.getByTestId("shape-away-chip");
    await expect(chip).toBeVisible();
    const panel = (await page.getByTestId("toolbar-panel").boundingBox())!;
    expect((await chip.boundingBox())!.y).toBeGreaterThanOrEqual(
        panel.y + panel.height,
    );
    await pillClearOf(page, chip);
    await reachAndTap(page, chip.getByRole("button", { name: "Go back" }));
    await expect(chip).toBeHidden();
    await expect(readout).toBeVisible();
});

/**
 * What's topmost at each of `points` (viewport px) that's on the field: "canvas" for the field
 * itself, else the test id over it
 */
async function topmostOnField(page: Page, points: readonly Point[]) {
    const field = (await page
        .getByTestId("fieldCanvas")
        .first()
        .boundingBox())!;
    const inside = points.filter(
        (p) =>
            p.x > field.x &&
            p.x < field.x + field.width &&
            p.y > field.y &&
            p.y < field.y + field.height,
    );
    return page.evaluate(
        (inside) =>
            inside.map(({ x, y }) => {
                const hit = document.elementFromPoint(x, y);
                if (!hit) return "nothing";
                if (hit.tagName === "CANVAS") return "canvas";
                return (
                    hit.closest("[data-testid]")?.getAttribute("data-testid") ??
                    hit.tagName
                );
            }),
        inside,
    );
}

test("after a handle drag, the pill and the editor leave every box handle free (#933)", async ({
    show,
}) => {
    const { page } = show;
    await page.setViewportSize(LANDSCAPE);
    await expectCanvasMatchesShow(show);
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("b");
    await touchDrag(
        page,
        await onField(page, 0.3, 0.45),
        await onField(page, 0.55, 0.65),
        { steps: 12 },
    );
    const readout = page.getByTestId("shape-tool-readout");
    await expect(readout).toBeVisible();
    // Its bottom right corner dragged down toward the zoom box: the box grows to the field's
    // bottom and the editor goes above it, toward the field's top (finding A)
    const drawn = (await shapeOverlay(page))!;
    const corner = drawn.handles.reduce((p, q) =>
        q.x + q.y > p.x + p.y ? q : p,
    );
    await touchDrag(page, corner, await onField(page, 0.7, 0.85), {
        steps: 12,
    });
    await settledAt(page, readout);
    // Once the pill has found its spot, a finger reaches every handle
    await expect
        .poll(async () => {
            const { handles } = (await shapeOverlay(page))!;
            return (await topmostOnField(page, handles)).filter(
                (hit) => hit !== "canvas",
            );
        })
        .toEqual([]);
    await expect(page.getByTestId("touch-modifier-buttons")).toBeVisible();
    await reachAndTap(page, page.getByTestId("shape-editor-place"));
    await expect(readout).toBeHidden();
});

test("the pill leaves the selection's rotate knob and handles free (#933)", async ({
    show,
}) => {
    const { page } = show;
    await page.setViewportSize(LANDSCAPE);
    await expectCanvasMatchesShow(show);
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(async () => (await readField(page)).selection.length)
        .toBe(HOME.length);
    const pill = page.getByTestId("touch-modifier-buttons");
    await expect(pill).toBeVisible();
    const handles = async () =>
        page.evaluate(() => window.fieldTest!.handles());
    await expect.poll(async () => (await handles()) !== null).toBe(true);
    // The knob is the field's, and no handle is under the pill
    await expect
        .poll(async () => {
            const { rot } = (await handles())!;
            return topmostOnField(page, [rot]);
        })
        .toEqual(["canvas"]);
    await expect
        .poll(() =>
            page.evaluate(() =>
                Object.entries(window.fieldTest!.handles() ?? {})
                    .filter(([, { x, y }]) =>
                        document
                            .elementFromPoint(x, y)
                            ?.closest('[data-testid="touch-modifier-buttons"]'),
                    )
                    .map(([id]) => id),
            ),
        )
        .toEqual([]);
});

test("after a split, the isolation bar's Done is free and no toast covers the field (#933)", async ({
    show,
}) => {
    const { page } = show;
    await page.setViewportSize(LANDSCAPE);
    await expectCanvasMatchesShow(show);
    await goToPage(page, PAGE_2_BOX);
    // One of page 2's marchers selected by a finger
    const one = (await drawnMarchers(page)).find(
        (m) => m.id === 1 && m.onScreen,
    )!;
    await tap(page, one.screen);
    await expect
        .poll(() => page.evaluate(() => window.fieldTest!.selection()))
        .toEqual([1]);
    // Split from the page box's menu: the new move shows isolated, with no toast
    await expect(async () => {
        await pageBox(page, PAGE_2_BOX).click({ button: "right" });
        await page
            .getByRole("menuitem", { name: "Split 1 selected into new move" })
            .click({ timeout: 1000 });
    }).toPass();
    const bar = page.getByTestId("timeline-isolation-bar");
    const done = bar.getByRole("button", { name: /Done/ });
    await expect(bar).toBeVisible();
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
    // No Esc key cap on a touch screen where no key has been pressed (#936)
    await expect(done.locator("kbd")).toHaveCount(0);
    await expect.poll(() => topmostAt(done)).toBe("itself");
    await reachAndTap(page, done);
    await expect(bar).toBeHidden();
});

/** Whether `inner` lies wholly inside `outer` */
const within = (inner: Box, outer: Box) =>
    inner.x >= outer.x - 0.5 &&
    inner.y >= outer.y - 0.5 &&
    inner.x + inner.width <= outer.x + outer.width + 0.5 &&
    inner.y + inner.height <= outer.y + outer.height + 0.5;

/** What's topmost at a point in the viewport: the nearest test id, or the tag */
const topmostAtPoint = (page: Page, at: Point) =>
    page.evaluate(({ x, y }) => {
        const hit = document.elementFromPoint(x, y);
        if (!hit) return "nothing";
        if (hit.tagName === "CANVAS") return "canvas";
        return (
            hit.closest("[data-testid]")?.getAttribute("data-testid") ??
            hit.tagName
        );
    }, at);

/** The first of `fractions` of the field where a finger lands on the field itself, away from marchers */
async function emptyFieldPoint(
    page: Page,
    fractions: readonly [number, number][],
): Promise<Point> {
    const marchers = (await drawnMarchers(page)).filter((m) => m.onScreen);
    for (const [fx, fy] of fractions) {
        const p = await onField(page, fx, fy);
        const nearMarcher = marchers.some(
            (m) => Math.hypot(m.screen.x - p.x, m.screen.y - p.y) < 40,
        );
        if (!nearMarcher && (await topmostAtPoint(page, p)) === "canvas")
            return p;
    }
    throw new Error("No empty spot on the field");
}

test("a tap on Fine within 300 ms of a deselect hits Fine: the pill keeps its spot (#936)", async ({
    show,
}) => {
    const { page } = show;
    await page.setViewportSize(LANDSCAPE);
    await expectCanvasMatchesShow(show);
    const pill = page.getByTestId("touch-modifier-buttons");
    const fine = page.getByTestId("touch-toggle-fine");
    await expect(pill).toBeVisible();

    // Where the selection's top handle shows
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(async () => (await readField(page)).selection.length)
        .toBe(HOME.length);
    await expect
        .poll(() => page.evaluate(() => window.fieldTest!.handles() !== null))
        .toBe(true);
    const handle = (await page.evaluate(() => window.fieldTest!.handles()))!.n;
    await page.keyboard.press("Escape");
    await expect
        .poll(async () => (await readField(page)).selection.length)
        .toBe(0);

    // The pill dragged by its grip over that spot: the user's spot
    const grip = pill.getByRole("button", { name: "Move these buttons" });
    const from = await centerOf(grip);
    const box = (await pill.boundingBox())!;
    await touchDrag(
        page,
        from,
        {
            x: from.x + (handle.x - 60 - box.x),
            y: from.y + (handle.y - box.height / 2 - box.y),
        },
        { steps: 12 },
    );
    await page.waitForTimeout(300);

    // Selected again: the pill gives way to the handle
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(async () => {
            const now = (await pill.boundingBox())!;
            return intersects(now, {
                x: handle.x - 22,
                y: handle.y - 22,
                width: 44,
                height: 44,
            });
        })
        .toBe(false);
    const fineAt = await settledAt(page, fine);
    const pillBefore = (await pill.boundingBox())!;

    // A finger deselects on empty field, then reaches for Fine 250 ms later
    const empty = await emptyFieldPoint(page, [
        [0.03, 0.06],
        [0.97, 0.06],
        [0.03, 0.5],
        [0.5, 0.06],
        [0.97, 0.5],
    ]);
    await tap(page, empty);
    await page.waitForTimeout(250);
    expect(await topmostAtPoint(page, fineAt)).toBe("touch-toggle-fine");
    await tap(page, fineAt);
    await expect(fine).toHaveAttribute("aria-pressed", "true");
    expect((await readField(page)).selection).toEqual([]);
    // And it stays there afterwards
    await page.waitForTimeout(700);
    const pillAfter = (await pill.boundingBox())!;
    expect(Math.abs(pillAfter.x - pillBefore.x)).toBeLessThan(2);
    expect(Math.abs(pillAfter.y - pillBefore.y)).toBeLessThan(2);
});

test("with the Box tool armed, the first drag on the field draws (#936)", async ({
    show,
}) => {
    const { page } = show;
    await page.setViewportSize(LANDSCAPE);
    await expectCanvasMatchesShow(show);
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(async () => (await readField(page)).selection.length)
        .toBe(HOME.length);
    const pill = page.getByTestId("touch-modifier-buttons");
    await settledAt(page, pill);
    // A spot on the field near its top, where the pill's top spots are
    const start = await emptyFieldPoint(page, [
        [0.25, 0.2],
        [0.5, 0.2],
        [0.75, 0.2],
        [0.25, 0.35],
        [0.5, 0.35],
    ]);

    await page.keyboard.press("b");
    const hint = page.getByTestId("shape-tool-hint");
    await expect(hint).toBeVisible();
    await pillClearOf(page, hint);
    // Once the pill has found its spot
    await pillSettled(page);
    expect(await topmostAtPoint(page, start)).toBe("canvas");

    await touchDrag(
        page,
        start,
        { x: start.x + 160, y: start.y + 110 },
        { steps: 12 },
    );
    await expect(page.getByTestId("shape-tool-readout")).toBeVisible();
    // Nothing on the pill was pressed instead
    await expect(
        pill.locator('[aria-pressed="true"][data-testid^="touch-toggle-"]'),
    ).toHaveCount(0);
});

// 96 trumpets in a 12 × 8 grid across the field, for a big box (#936)
const GRID: SeedPosition[] = Array.from(
    { length: 96 },
    (_, i): SeedPosition => [
        1 + i,
        200 + (i % 12) * 100,
        150 + Math.floor(i / 12) * 80,
    ],
);

test.describe("a big shape (#936)", () => {
    test.use({
        seedSql: seedShowSql({
            beats: 32,
            pageStarts: [1, 9],
            measureStarts: [1, 5, 9, 13, 17, 21, 25, 29],
            marchers: GRID.map(([id]) => ({
                id,
                section: "Trumpet",
                prefix: "T",
                order: id,
            })),
            positions: [GRID, GRID, GRID],
        }),
    });

    test("pinch-zoomed to 200 %, its Place and Discard stay inside the field and on top", async ({
        show,
    }) => {
        const { page } = show;
        await page.setViewportSize(LANDSCAPE);
        await expectCanvasMatchesShow(show);
        await page.keyboard.press("ControlOrMeta+a");
        await expect
            .poll(async () => (await readField(page)).selection.length)
            .toBe(GRID.length);
        await page.keyboard.press("b");
        const hint = page.getByTestId("shape-tool-hint");
        await expect(hint).toBeVisible();
        // The pill moves clear of the hint, which can bring it down over the field's top, and
        // settles: start the drag only once it has, on the field itself, or the finger lands
        // on the pill and no box is drawn
        await pillClearOf(page, hint);
        await pillSettled(page);
        const start = await emptyFieldPoint(page, [
            [0.12, 0.2],
            [0.12, 0.28],
            [0.16, 0.32],
            [0.2, 0.36],
        ]);
        // A box across most of the field
        await touchDrag(page, start, await onField(page, 0.85, 0.85), {
            steps: 16,
        });
        const readout = page.getByTestId("shape-tool-readout");
        await expect(readout).toBeVisible();
        const place = page.getByTestId("shape-editor-place");
        const discard = page.getByTestId("shape-editor-discard");
        await settledAt(page, place);

        // Two fingers spread apart at the box's middle: twice the zoom
        const zoom = () =>
            page.evaluate(() => window.fieldTest!.viewport().zoom);
        const before = await zoom();
        const middle = await onField(page, 0.48, 0.52);
        await pinch(page, middle, { from: 70, to: 140, steps: 20 });
        await expect.poll(zoom).toBeGreaterThan(before * 1.8);

        const field = (await page
            .getByTestId("fieldCanvas")
            .first()
            .boundingBox())!;
        for (const button of [place, discard]) {
            await settledAt(page, button);
            await expect.poll(() => topmostAt(button)).toBe("itself");
            expect(within((await button.boundingBox())!, field)).toBe(true);
        }
        await reachAndTap(page, place);
        await expect(readout).toBeHidden();
    });
});

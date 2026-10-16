import type { Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    canvasScale,
    drawnMarchers,
    expectCanvasMatchesShow,
    readField,
    selectPage,
    setUiSettings,
    waitForIdle,
} from "../app.mjs";
import { savedPositions, type Position } from "../positions.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";
import type { FieldTestHandle } from "../../../src/field/fieldTestApi";

// Scaling and rotating a selection with the selection box's handles (#198;
// #189 user stories 46 to 55, rules table rows Handles, Shift, Alt, Lock X /
// Lock Y, Click vs drag): corners scale uniformly and Shift frees them;
// middle handles scale one axis; rotation snaps to 15° and Shift frees it;
// Alt works at a quarter of the pointer's speed; no flipping; the box fits
// the marchers again after each transform. A transform is dropped through the
// same timeline rules as a move.
//
// The "change:" scenarios are the rules-table changes decided in #189. Lock X
// and Lock Y leave the handles free, and the box fits the marchers again
// after a rotation.

// Four trumpets on three pages, all in view, none in a line.
const PAGE_0: SeedPosition[] = [
    [1, 500, 300],
    [2, 600, 350],
    [3, 700, 280],
    [4, 800, 400],
];
const PAGE_1: SeedPosition[] = [
    [1, 520, 450],
    [2, 640, 470],
    [3, 760, 430],
    [4, 880, 500],
];
// On page 2 only T1 and T2 have moves of their own; T3 and T4 hold.
const PAGE_2: SeedPosition[] = [
    [1, 540, 380],
    [2, 660, 400],
];

test.use({
    seedSql: seedShowSql({
        beats: 48,
        pageStarts: [16, 32],
        measureStarts: Array.from({ length: 12 }, (_, i) => 1 + i * 4),
        marchers: PAGE_0.map(([id]) => ({
            id,
            section: "Trumpet",
            prefix: "T",
            order: id,
        })),
        positions: [PAGE_0, PAGE_1, PAGE_2],
    }),
});

type Point = { x: number; y: number };

const asPositions = (rows: readonly SeedPosition[]): Position[] =>
    rows.map(([id, x, y]) => ({ id, x, y }));

/** Selects every marcher with Ctrl/Cmd+A. */
async function selectAll(page: Page) {
    await page.keyboard.press("ControlOrMeta+a");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([1, 2, 3, 4]);
}

/**
 * Where `handle` is drawn, once it has stopped moving: the view can still
 * settle just after the show opens, and a press read before that misses.
 */
async function handleAt(page: Page, handle: FieldTestHandle) {
    const read = async () => {
        const { handles } = await readField(page);
        if (!handles) throw new Error("The selection has no handles");
        return handles[handle];
    };
    let at = await read();
    await expect
        .poll(async () => {
            await page.waitForTimeout(150);
            const now = await read();
            const still = now.x === at.x && now.y === at.y;
            at = now;
            return still;
        })
        .toBe(true);
    return at;
}

/**
 * Presses on a handle, moves by `by` screen pixels in `steps` moves with the
 * keys in `hold` down from the press, and releases; the keys come up after
 * the release. `beforeRelease` runs with the button still down.
 */
async function dragHandle(
    page: Page,
    handle: FieldTestHandle,
    by: Point,
    {
        hold = [],
        steps = 10,
        beforeRelease,
    }: {
        hold?: string[];
        steps?: number;
        beforeRelease?: () => Promise<unknown>;
    } = {},
) {
    const from = await handleAt(page, handle);
    await page.mouse.move(from.x, from.y);
    for (const key of hold) await page.keyboard.down(key);
    await page.mouse.down();
    await page.mouse.move(from.x + by.x, from.y + by.y, { steps });
    await beforeRelease?.();
    await page.mouse.up();
    for (const key of [...hold].reverse()) await page.keyboard.up(key);
}

/** The selection box's center on screen, between its corner handles. */
async function boxCenter(page: Page): Promise<Point> {
    const nw = await handleAt(page, "nw");
    const se = await handleAt(page, "se");
    return { x: (nw.x + se.x) / 2, y: (nw.y + se.y) / 2 };
}

/**
 * Drags the rotate handle around the box's center by `degrees` (clockwise on
 * screen), along the arc, with the keys in `hold` down from the press.
 */
async function turnRotateHandle(
    page: Page,
    degrees: number,
    { hold = [] }: { hold?: string[] } = {},
) {
    const center = await boxCenter(page);
    const from = await handleAt(page, "rot");
    const radius = Math.hypot(from.x - center.x, from.y - center.y);
    const start = Math.atan2(from.y - center.y, from.x - center.x);
    await page.mouse.move(from.x, from.y);
    for (const key of hold) await page.keyboard.down(key);
    await page.mouse.down();
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
        const angle = start + ((degrees * Math.PI) / 180) * (i / steps);
        await page.mouse.move(
            center.x + radius * Math.cos(angle),
            center.y + radius * Math.sin(angle),
        );
    }
    await page.mouse.up();
    for (const key of [...hold].reverse()) await page.keyboard.up(key);
}

/** How wide and tall the formation is, in field units. */
const spread = (positions: readonly Position[]) => {
    const xs = positions.map((p) => p.x);
    const ys = positions.map((p) => p.y);
    return {
        left: Math.min(...xs),
        top: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
    };
};

/** The direction from T1 to T4, in degrees clockwise on screen. */
const heading = (positions: readonly Position[]) => {
    const t1 = positions.find((p) => p.id === 1)!;
    const t4 = positions.find((p) => p.id === 4)!;
    return (Math.atan2(t4.y - t1.y, t4.x - t1.x) * 180) / Math.PI;
};

/** How far the formation turned from the home positions, in degrees, -180 to 180. */
const turned = (positions: readonly Position[]) => {
    const degrees = heading(positions) - heading(asPositions(PAGE_0));
    return ((((degrees + 180) % 360) + 360) % 360) - 180;
};

/** The center of the formation's bounds. */
const middle = (positions: readonly Position[]) => {
    const { left, top, width, height } = spread(positions);
    return { x: left + width / 2, y: top + height / 2 };
};

/** Waits until the home positions differ from the seed, and returns them. */
async function savedChange(show: Show, pageId = 0): Promise<Position[]> {
    const before = JSON.stringify(asPositions(pageId === 0 ? PAGE_0 : PAGE_1));
    let saved: Position[] = [];
    await expect
        .poll(async () => {
            saved = await savedPositions(show, pageId);
            return JSON.stringify(saved) !== before;
        })
        .toBe(true);
    await waitForIdle(show.page);
    saved = await savedPositions(show, pageId);
    return saved;
}

/** How many undo steps the show has. */
const undoSteps = async (show: Show) => {
    const [row] = await show.query<{ count: number }>(
        "SELECT COUNT(DISTINCT history_group) AS count FROM history_undo",
    );
    return row.count;
};

test.beforeEach(async ({ show }) => {
    await expectCanvasMatchesShow(show);
});

test("a corner handle scales the formation uniformly from the opposite corner, as one undo step", async ({
    show,
}) => {
    const { page } = show;
    await selectAll(page);
    const steps = await undoSteps(show);
    const before = spread(asPositions(PAGE_0));

    // Straight across: a uniform scale still grows both ways
    await dragHandle(page, "se", { x: 120, y: 0 });

    const after = spread(await savedChange(show));
    const scaleX = after.width / before.width;
    const scaleY = after.height / before.height;
    expect(scaleX).toBeGreaterThan(1.2);
    expect(scaleY).toBeCloseTo(scaleX, 1);
    // The opposite corner stays where it was, within a few units
    expect(Math.abs(after.left - before.left)).toBeLessThan(6);
    expect(Math.abs(after.top - before.top)).toBeLessThan(6);
    await expectCanvasMatchesShow(show);
    expect(await undoSteps(show)).toBe(steps + 1);

    await page.keyboard.press("ControlOrMeta+z");
    await expect
        .poll(() => savedPositions(show, 0))
        .toEqual(asPositions(PAGE_0));
    await expectCanvasMatchesShow(show);
});

test("Shift frees a corner handle: dragged across, only the width changes", async ({
    show,
}) => {
    const { page } = show;
    await selectAll(page);
    const before = spread(asPositions(PAGE_0));

    await dragHandle(page, "se", { x: 120, y: 0 }, { hold: ["Shift"] });

    const after = spread(await savedChange(show));
    expect(after.width / before.width).toBeGreaterThan(1.2);
    // Within whole-pixel pointer positions
    expect(Math.abs(after.height - before.height)).toBeLessThan(2);
    await expectCanvasMatchesShow(show);
});

test("a middle handle scales one axis only", async ({ show }) => {
    const { page } = show;
    await selectAll(page);
    const before = spread(asPositions(PAGE_0));

    // Down and across: only the across counts on the right-hand handle
    await dragHandle(page, "e", { x: 100, y: 60 });

    const saved = await savedChange(show);
    const after = spread(saved);
    expect(after.width / before.width).toBeGreaterThan(1.2);
    // Every marcher keeps its Y
    expect(saved.map((p) => p.y)).toEqual(asPositions(PAGE_0).map((p) => p.y));
    expect(Math.abs(after.left - before.left)).toBeLessThan(6);
    await expectCanvasMatchesShow(show);
});

test("change: Shift does nothing on a middle handle: it still scales one axis", async ({
    show,
}) => {
    const { page } = show;
    await selectAll(page);
    const before = spread(asPositions(PAGE_0));

    await dragHandle(page, "s", { x: 60, y: 80 }, { hold: ["Shift"] });

    const saved = await savedChange(show);
    expect(spread(saved).height / before.height).toBeGreaterThan(1.2);
    expect(saved.map((p) => p.x)).toEqual(asPositions(PAGE_0).map((p) => p.x));
    await expectCanvasMatchesShow(show);
});

test("rotation snaps to 15°, about the box's center", async ({ show }) => {
    const { page } = show;
    await selectAll(page);
    const looks = (await drawnMarchers(page)).map((m) => m.look);

    await turnRotateHandle(page, 37);

    const saved = await savedChange(show);
    expect(turned(saved)).toBeCloseTo(30, 0);
    // Rotated about the box's center: each marcher keeps its distance from
    // it, within a few units
    const center = middle(asPositions(PAGE_0));
    for (const [id, x, y] of PAGE_0) {
        const p = saved.find((s) => s.id === id)!;
        const distance = Math.hypot(p.x - center.x, p.y - center.y);
        expect(
            Math.abs(distance - Math.hypot(x - center.x, y - center.y)),
        ).toBeLessThan(8);
    }
    // Dots and labels stay upright and the same: only positions change
    expect((await drawnMarchers(page)).map((m) => m.look)).toEqual(looks);
    await expectCanvasMatchesShow(show);
});

test("Shift rotates freely", async ({ show }) => {
    const { page } = show;
    await selectAll(page);

    await turnRotateHandle(page, 37, { hold: ["Shift"] });

    const degrees = turned(await savedChange(show));
    expect(Math.abs(degrees - 37)).toBeLessThan(1.5);
    await expectCanvasMatchesShow(show);
});

test("the box fits the marchers again after a rotation", async ({ show }) => {
    const { page } = show;
    await selectAll(page);

    await turnRotateHandle(page, 45);
    await savedChange(show);
    await expectCanvasMatchesShow(show);

    // Square to the screen again, just around the dots
    const { handles } = await readField(page);
    const screens = (await drawnMarchers(page)).map((m) => m.screen);
    expect(handles!.nw.y).toBeCloseTo(handles!.ne.y, 0);
    expect(handles!.nw.x).toBeCloseTo(handles!.sw.x, 0);
    const left = Math.min(...screens.map((p) => p.x));
    const top = Math.min(...screens.map((p) => p.y));
    const right = Math.max(...screens.map((p) => p.x));
    expect(left - handles!.nw.x).toBeGreaterThan(0);
    expect(left - handles!.nw.x).toBeLessThan(25);
    expect(top - handles!.nw.y).toBeGreaterThan(0);
    expect(top - handles!.nw.y).toBeLessThan(25);
    expect(handles!.ne.x - right).toBeLessThan(25);
});

test("change: Alt scales at a quarter of the pointer's speed", async ({
    show,
}) => {
    const { page } = show;
    await selectAll(page);
    const scale = await canvasScale(page);
    const before = spread(asPositions(PAGE_0));

    await dragHandle(page, "e", { x: 200, y: 0 }, { hold: ["Alt"] });

    const after = spread(await savedChange(show));
    // A quarter of the pointer's 200 px
    expect(after.width - before.width).toBeCloseTo(50 / scale, -0.3);
    await expectCanvasMatchesShow(show);
});

test("change: Alt rotates at a quarter of the pointer's speed, with no snapping", async ({
    show,
}) => {
    const { page } = show;
    await selectAll(page);

    await turnRotateHandle(page, 74, { hold: ["Alt"] });

    expect(Math.abs(turned(await savedChange(show)) - 18.5)).toBeLessThan(1.5);
    await expectCanvasMatchesShow(show);
});

test("dragging a handle past the opposite side doesn't flip the formation", async ({
    show,
}) => {
    const { page } = show;
    await selectAll(page);
    const width = (await handleAt(page, "e")).x - (await handleAt(page, "w")).x;

    await dragHandle(page, "e", { x: -(width + 150), y: 0 }, { steps: 20 });
    await waitForIdle(page);

    // Still in order from left to right, if moved at all
    const saved = await savedPositions(show, 0);
    const xs = saved.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(saved.map((p) => p.y)).toEqual(asPositions(PAGE_0).map((p) => p.y));
    await expectCanvasMatchesShow(show);
});

test("change: a press on a handle that moves under 4 px changes nothing, however long it's held", async ({
    show,
}) => {
    const { page } = show;
    await selectAll(page);
    const steps = await undoSteps(show);

    const hold = () => page.waitForTimeout(400);
    await dragHandle(page, "se", { x: 2, y: 1 }, { beforeRelease: hold });
    await dragHandle(page, "rot", { x: -2, y: 2 }, { beforeRelease: hold });
    await waitForIdle(page);

    expect(await savedPositions(show, 0)).toEqual(asPositions(PAGE_0));
    expect((await readField(page)).selection).toEqual([1, 2, 3, 4]);
    expect(await undoSteps(show)).toBe(steps);
});

test("Lock X and Lock Y don't hold a handle", async ({ show }) => {
    const { page } = show;
    await setUiSettings(page, { lockX: true, lockY: true });
    await expectCanvasMatchesShow(show);
    await selectAll(page);
    const before = spread(asPositions(PAGE_0));

    await dragHandle(page, "se", { x: 100, y: 100 }, { hold: ["Shift"] });

    const after = spread(await savedChange(show));
    expect(after.width / before.width).toBeGreaterThan(1.2);
    expect(after.height / before.height).toBeGreaterThan(1.2);
    await expectCanvasMatchesShow(show);
});

test("a transform on a later page saves through the drop rules: that page's move, and Move them too", async ({
    show,
}) => {
    const { page } = show;
    await selectPage(show, "Page 1");
    await selectAll(page);

    await dragHandle(page, "e", { x: 100, y: 0 });

    const saved = await savedChange(show, 1);
    expect(spread(saved).width).toBeGreaterThan(
        spread(asPositions(PAGE_1)).width,
    );
    expect(await savedPositions(show, 0)).toEqual(asPositions(PAGE_0));
    // T3 and T4 hold into page 2 and follow; T1 and T2 have their own moves
    await expect(
        page.locator("[data-sonner-toast]", { hasText: "Move them too" }),
    ).toBeVisible();
    await expectCanvasMatchesShow(show);
});

test("the inspector's rotation input rotates the selection, and saves nothing when left unchanged", async ({
    show,
}) => {
    const { page } = show;
    await selectAll(page);
    const rotation = page.getByRole("textbox", { name: "Rotation" });
    await expect(rotation).toBeEnabled();
    const steps = await undoSteps(show);

    // Focused and left with no change: nothing saved
    await rotation.focus();
    await rotation.blur();
    await waitForIdle(page);
    expect(await undoSteps(show)).toBe(steps);
    expect(await savedPositions(show, 0)).toEqual(asPositions(PAGE_0));

    await rotation.fill("90");
    await rotation.blur();
    const saved = await savedChange(show);
    expect(turned(saved)).toBeCloseTo(90, 0);
    expect(await undoSteps(show)).toBe(steps + 1);
    await expectCanvasMatchesShow(show);
});

test("change: after a rotation is saved the inspector's input starts over at 0, also when a press on the field saved it", async ({
    show,
}) => {
    const { page } = show;
    await selectAll(page);
    const rotation = page.getByRole("textbox", { name: "Rotation" });
    await expect(rotation).toBeEnabled();
    const steps = await undoSteps(show);

    await rotation.fill("90");
    await rotation.blur();
    await expect
        .poll(async () => turned(await savedPositions(show, 0)))
        .toBeCloseTo(90, 0);
    await expect(rotation).toHaveValue("0");
    // The save has landed: a rotation can't start from a drop still saving
    await expectCanvasMatchesShow(show);

    // Typed, then a press on the field instead of a blur: saved, and the
    // input starts over at 0, so the next number turns from there
    await rotation.fill("30");
    const corner = await handleAt(page, "se");
    await page.mouse.click(corner.x, corner.y);
    await expect
        .poll(async () => turned(await savedPositions(show, 0)))
        .toBeCloseTo(120, 0);
    await expect(rotation).toHaveValue("0");
    await expectCanvasMatchesShow(show);
    await rotation.fill("15");
    await rotation.blur();
    await expect
        .poll(async () => turned(await savedPositions(show, 0)))
        .toBeCloseTo(135, 0);
    await waitForIdle(page);
    expect(await undoSteps(show)).toBe(steps + 3);
    await expectCanvasMatchesShow(show);
});

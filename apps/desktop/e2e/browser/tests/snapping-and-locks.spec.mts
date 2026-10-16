import type { Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    canvasScale,
    clickMarcher,
    drawnMarchers,
    expectCanvasMatchesShow,
    selectedDrillNumbers,
    setUiSettings,
} from "../app.mjs";
import {
    fieldGrid,
    savedPositions,
    type FieldGrid,
    type Position,
} from "../positions.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";

// The rules that modify a marcher drag (#197; #189 user stories 36 to 40,
// rules table rows Snapping, Alt, Lock X / Lock Y, Shift): with coordinate
// rounding on, one marcher snaps onto the rounding grid and a group moves in
// whole rounding steps; Shift turns snapping off; Alt moves at a quarter of
// the pointer's speed with snapping off; Lock X and Lock Y hold an axis.
//
// The "change:" scenarios are the rules-table changes decided in #189. Lock X
// / Lock Y leaving shape handles free is #198's and #204's to pin: there are no shape handles here.

// Four trumpets on the home page, all in view, none on the grid.
const PAGE_0: SeedPosition[] = [
    [1, 503, 304],
    [2, 603, 354],
    [3, 703, 284],
    [4, 803, 404],
];

test.use({
    seedSql: seedShowSql({
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
});

const asPositions = (rows: readonly SeedPosition[]): Position[] =>
    rows.map(([id, x, y]) => ({ id, x, y }));

const startOf = (id: number) => {
    const [, x, y] = PAGE_0.find(([marcher]) => marcher === id)!;
    return { x, y };
};

/** Coordinate rounding to the nearest step on both axes, from center front. */
const ROUND_TO_STEPS = {
    coordinateRounding: { nearestXSteps: 1, nearestYSteps: 1 },
};

/** Turns coordinate rounding to whole steps on. */
async function roundToSteps(show: Show) {
    await setUiSettings(show.page, ROUND_TO_STEPS);
    await expectCanvasMatchesShow(show);
}

/** `value` on the step grid through `origin`, the way rounding puts it. */
const onGrid = (value: number, origin: number, grid: FieldGrid) =>
    origin +
    Math.round((value - origin) / grid.pixelsPerStep) * grid.pixelsPerStep;

/** `point` rounded onto the step grid. */
const snapped = (point: { x: number; y: number }, grid: FieldGrid) => ({
    x: onGrid(point.x, grid.centerFront.x, grid),
    y: onGrid(point.y, grid.centerFront.y, grid),
});

/**
 * A drag, in field units, that takes `from` to `steps` whole steps away and
 * then a quarter of a step further, so a snapped and a free drop are a
 * quarter of a step (about 3 field units) apart.
 */
const offGridDrag = (
    from: { x: number; y: number },
    steps: { x: number; y: number },
    grid: FieldGrid,
) => {
    const base = snapped(from, grid);
    const step = grid.pixelsPerStep;
    return {
        x: base.x + (steps.x + 0.25) * step - from.x,
        y: base.y + (steps.y + 0.25) * step - from.y,
    };
};

const screenOf = async (page: Page, drillNumber: string) => {
    const drawn = (await drawnMarchers(page)).find(
        (m) => m.drillNumber === drillNumber,
    );
    if (!drawn?.onScreen)
        throw new Error(`${drillNumber} is not visible on the field`);
    return drawn.screen;
};

const drawnPosition = async (page: Page, drillNumber: string) => {
    const drawn = (await drawnMarchers(page)).find(
        (m) => m.drillNumber === drillNumber,
    )!;
    return { x: drawn.x, y: drawn.y };
};

/**
 * Drags marcher `drillNumber` through each leg in turn (field units), with
 * the keys in `hold` held down from that leg's start, and releases; the keys
 * come up after the release. `beforeRelease` runs with the button down.
 */
async function dragLegs(
    page: Page,
    drillNumber: string,
    legs: { by: { x: number; y: number }; hold?: string[] }[],
    beforeRelease?: () => Promise<unknown>,
) {
    const scale = await canvasScale(page);
    let at = await screenOf(page, drillNumber);
    const held: string[] = [];
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    for (const leg of legs) {
        for (const key of leg.hold ?? []) {
            await page.keyboard.down(key);
            held.push(key);
        }
        at = { x: at.x + leg.by.x * scale, y: at.y + leg.by.y * scale };
        await page.mouse.move(at.x, at.y, { steps: 8 });
    }
    await beforeRelease?.();
    await page.mouse.up();
    for (const key of held.reverse()) await page.keyboard.up(key);
}

/**
 * Within 1.5 field units on both axes: the mouse lands on whole screen pixels
 * (over a unit apart when zoomed out).
 */
const near = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.abs(a.x - b.x) < 1.5 && Math.abs(a.y - b.y) < 1.5;

/** Waits until the home page saves `expected`, each {@link near} it. */
async function expectSaved(show: Show, expected: Position[]) {
    await expect
        .poll(async () => {
            const saved = await savedPositions(show, 0);
            const same =
                saved.length === expected.length &&
                saved.every(
                    (p, i) => p.id === expected[i].id && near(p, expected[i]),
                );
            return same ? "saved as expected" : { saved, expected };
        })
        .toBe("saved as expected");
}

/** The home positions with marcher `id` at `to`, and the others unmoved. */
const withMarcherAt = (id: number, to: { x: number; y: number }) =>
    asPositions(PAGE_0).map((p) => (p.id === id ? { id, ...to } : p));

/** The home positions with the marchers in `ids` moved by `by`. */
const movedBy = (ids: number[], by: { x: number; y: number }) =>
    asPositions(PAGE_0).map((p) =>
        ids.includes(p.id) ? { id: p.id, x: p.x + by.x, y: p.y + by.y } : p,
    );

const plus = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    x: a.x + b.x,
    y: a.y + b.y,
});

test.beforeEach(async ({ show }) => {
    await expectCanvasMatchesShow(show);
});

test("rounding on: a dragged marcher snaps onto the rounding grid, and the drop saves where it's drawn", async ({
    show,
}) => {
    const { page } = show;
    await roundToSteps(show);
    const grid = await fieldGrid(show);
    const start = startOf(2);
    const by = offGridDrag(start, { x: 3, y: 2 }, grid);
    const expected = snapped(plus(start, by), grid);

    let drawn: { x: number; y: number } | null = null;
    await dragLegs(page, "T2", [{ by }], async () => {
        drawn = await drawnPosition(page, "T2");
    });

    expect(near(drawn!, expected), JSON.stringify({ drawn, expected })).toBe(
        true,
    );
    await expectSaved(show, withMarcherAt(2, expected));
    await expectCanvasMatchesShow(show);
});

test("change: rounding on: a dragged group moves in whole rounding steps and keeps each marcher's offset from the grid", async ({
    show,
}) => {
    const { page } = show;
    await roundToSteps(show);
    // T3 is on the top edge of the selection's box, clear of its handles
    await clickMarcher(page, "T1");
    await clickMarcher(page, "T3", { add: true });
    await clickMarcher(page, "T4", { add: true });
    await expect
        .poll(() => selectedDrillNumbers(page))
        .toEqual(["T1", "T3", "T4"]);

    const grid = await fieldGrid(show);
    const step = grid.pixelsPerStep;
    // 3¼ steps across and 2¼ down from where T3 started
    const by = { x: 3.25 * step, y: 2.25 * step };
    await dragLegs(page, "T3", [{ by }]);

    await expectSaved(show, movedBy([1, 3, 4], { x: 3 * step, y: 2 * step }));
    await expectCanvasMatchesShow(show);
});

test("rounding on: Shift pressed just before the release still drops where the marcher is drawn (user stories 41, 42)", async ({
    show,
}) => {
    const { page } = show;
    await roundToSteps(show);
    const grid = await fieldGrid(show);
    const start = startOf(2);
    const by = offGridDrag(start, { x: 3, y: 2 }, grid);
    const expected = snapped(plus(start, by), grid);

    // Shift goes down with the pointer still: no pointer event between
    await dragLegs(page, "T2", [{ by }], () => page.keyboard.down("Shift"));
    await page.keyboard.up("Shift");

    await expectSaved(show, withMarcherAt(2, expected));
    await expectCanvasMatchesShow(show);
});

test("rounding on: Shift during a drag turns snapping off", async ({
    show,
}) => {
    const { page } = show;
    await roundToSteps(show);
    const grid = await fieldGrid(show);
    const start = startOf(2);
    const by = offGridDrag(start, { x: 3, y: 2 }, grid);
    const half = { x: by.x / 2, y: by.y / 2 };

    await dragLegs(page, "T2", [{ by: half }, { by: half, hold: ["Shift"] }]);

    await expectSaved(show, withMarcherAt(2, plus(start, by)));
    await expectCanvasMatchesShow(show);
});

test("change: rounding on: Alt during a drag moves the marcher at a quarter of the pointer's speed, with snapping off", async ({
    show,
}) => {
    const { page } = show;
    await roundToSteps(show);
    const grid = await fieldGrid(show);
    const start = startOf(2);
    // The marcher should end a quarter of a step off the grid
    const moved = offGridDrag(start, { x: 1, y: 1 }, grid);
    const pointer = { x: moved.x * 4, y: moved.y * 4 };

    await dragLegs(page, "T2", [{ by: pointer, hold: ["Alt"] }]);

    await expectSaved(show, withMarcherAt(2, plus(start, moved)));
    await expectCanvasMatchesShow(show);
});

test("change: rounding on: pressing Alt mid-drag goes on slowly from where the marcher is drawn, without a jump", async ({
    show,
}) => {
    const { page } = show;
    await roundToSteps(show);
    const grid = await fieldGrid(show);
    const start = startOf(2);
    const first = offGridDrag(start, { x: 2, y: 1 }, grid);
    const onTheGrid = snapped(plus(start, first), grid);
    const slow = { x: 8, y: -6 };

    let drawnAtAlt: { x: number; y: number } | null = null;
    await dragLegs(page, "T2", [{ by: first }], async () => {
        await page.keyboard.down("Alt");
        // A pointer move with Alt down and no distance: no jump
        const at = await screenOf(page, "T2");
        await page.mouse.move(at.x, at.y);
        drawnAtAlt = await drawnPosition(page, "T2");
        const scale = await canvasScale(page);
        await page.mouse.move(
            at.x + slow.x * 4 * scale,
            at.y + slow.y * 4 * scale,
            { steps: 8 },
        );
    });
    await page.keyboard.up("Alt");

    expect(
        near(drawnAtAlt!, onTheGrid),
        JSON.stringify({ drawnAtAlt, onTheGrid }),
    ).toBe(true);
    await expectSaved(show, withMarcherAt(2, plus(onTheGrid, slow)));
    await expectCanvasMatchesShow(show);
});

test("Lock X keeps a dragged marcher's X", async ({ show }) => {
    const { page } = show;
    await setUiSettings(page, { lockX: true, lockY: false });
    await expectCanvasMatchesShow(show);

    const by = { x: 60, y: 45 };
    await dragLegs(page, "T2", [{ by }]);

    await expectSaved(show, movedBy([2], { x: 0, y: by.y }));
    await expectCanvasMatchesShow(show);
});

test("Lock Y keeps a dragged group's Y", async ({ show }) => {
    const { page } = show;
    await setUiSettings(page, { lockX: false, lockY: true });
    await expectCanvasMatchesShow(show);
    await clickMarcher(page, "T1");
    await clickMarcher(page, "T3", { add: true });
    await clickMarcher(page, "T4", { add: true });
    await expect
        .poll(() => selectedDrillNumbers(page))
        .toEqual(["T1", "T3", "T4"]);

    const by = { x: -50, y: 70 };
    await dragLegs(page, "T3", [{ by }]);

    await expectSaved(show, movedBy([1, 3, 4], { x: by.x, y: 0 }));
    await expectCanvasMatchesShow(show);
});

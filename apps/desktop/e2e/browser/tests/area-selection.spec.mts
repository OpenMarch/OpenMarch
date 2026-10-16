import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures.mjs";
import {
    clickMarcher,
    drawnMarchers,
    expectCanvasMatchesShow,
    inspectorMarchers,
    readField,
    selectedDrillNumbers,
    waitForIdle,
} from "../app.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";

// Selecting an area of the field (#195; #189 user stories 25 to 29): the
// marquee and the lasso. The field's selection is the app's: the inspector
// shows what they select.
//
// The "change:" scenarios are the rules-table changes decided in #189. The
// lasso is double-click-and-drag (rules table: Lasso).

// Four trumpets and two baritones near the middle of the field, all in view,
// and a hidden flute (its section's appearance) standing between T2 and T3.
const POSITIONS: SeedPosition[] = [
    [1, 500, 300],
    [2, 600, 350],
    [3, 700, 280],
    [4, 800, 400],
    [5, 550, 450],
    [6, 750, 470],
    [7, 650, 320],
];

test.use({
    seedSql: [
        ...seedShowSql({
            beats: 16,
            pageStarts: [],
            marchers: POSITIONS.map(([id]) =>
                id === 7
                    ? { id, section: "Flute", prefix: "F", order: 1 }
                    : id <= 4
                      ? { id, section: "Trumpet", prefix: "T", order: id }
                      : { id, section: "Baritone", prefix: "B", order: id - 4 },
            ),
            positions: [POSITIONS],
        }),
        `INSERT INTO section_appearances (id, section, fill_color, outline_color, shape_type, visible, label_visible) VALUES
            (1, 'Flute', NULL, NULL, NULL, 0, 0)`,
    ],
});

type Point = { x: number; y: number };

const screenOf = async (page: Page, drillNumber: string) => {
    const drawn = (await drawnMarchers(page)).find(
        (m) => m.drillNumber === drillNumber,
    );
    if (!drawn?.onScreen)
        throw new Error(`${drillNumber} is not visible on the field`);
    return drawn.screen;
};

/** The screen rectangle around some marchers, `pad` screen px clear of their centers. */
const around = async (page: Page, drillNumbers: string[], pad: number) => {
    const points = await Promise.all(
        drillNumbers.map((label) => screenOf(page, label)),
    );
    return {
        left: Math.min(...points.map((p) => p.x)) - pad,
        top: Math.min(...points.map((p) => p.y)) - pad,
        right: Math.max(...points.map((p) => p.x)) + pad,
        bottom: Math.max(...points.map((p) => p.y)) + pad,
    };
};

/**
 * Presses at the first point and drags through the rest, with Shift held when
 * `shift`. Returns the gesture the field reported halfway through.
 */
async function dragThrough(
    page: Page,
    points: Point[],
    { shift = false, double = false } = {},
) {
    const [first, ...rest] = points;
    if (shift) await page.keyboard.down("Shift");
    await page.mouse.move(first.x, first.y);
    // A double-click-and-drag: a click, then a press that drags
    if (double) await page.mouse.click(first.x, first.y);
    await page.mouse.down();
    let gesture: string | null = null;
    for (const [i, point] of rest.entries()) {
        await page.mouse.move(point.x, point.y, { steps: 8 });
        if (i === Math.floor(rest.length / 2))
            gesture = (await readField(page)).activeGesture;
    }
    await page.mouse.up();
    if (shift) await page.keyboard.up("Shift");
    await waitForIdle(page);
    return gesture;
}

type Rect = Awaited<ReturnType<typeof around>>;

/** A marquee from the top-left of `rect` to its bottom-right. */
const marquee = (page: Page, rect: Rect, options?: { shift?: boolean }) =>
    dragThrough(
        page,
        [
            { x: rect.left, y: rect.top },
            {
                x: (rect.left + rect.right) / 2,
                y: (rect.top + rect.bottom) / 2,
            },
            { x: rect.right, y: rect.bottom },
        ],
        options,
    );

/**
 * A lasso around `rect`, clockwise from its top-left corner, released `gap`
 * screen px below where it started.
 */
const lasso = (
    page: Page,
    rect: Rect,
    gap: number,
    options?: { shift?: boolean },
) =>
    dragThrough(
        page,
        [
            { x: rect.left, y: rect.top },
            { x: rect.right, y: rect.top },
            { x: rect.right, y: rect.bottom },
            { x: rect.left, y: rect.bottom },
            { x: rect.left, y: rect.top + gap },
        ],
        { ...options, double: true },
    );

const expectSelected = async (page: Page, drillNumbers: string[]) => {
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(drillNumbers);
    // Inspector and field agree
    await expect.poll(() => inspectorMarchers(page)).toEqual(drillNumbers);
};

test.beforeEach(async ({ show }) => {
    await expectCanvasMatchesShow(show);
    await expect
        .poll(async () =>
            (await drawnMarchers(show.page)).map((m) => [
                m.drillNumber,
                m.look.visible,
            ]),
        )
        .toContainEqual(["F1", false]);
});

test.describe("marquee", () => {
    test("dragging on empty field selects the marchers in the marquee, replacing the selection", async ({
        show,
    }) => {
        const { page } = show;
        await clickMarcher(page, "B1");
        await expectSelected(page, ["B1"]);
        // From well clear of T1 to just past T2: T3 is to the right, B1 below
        const t1 = await screenOf(page, "T1");
        const rect = await around(page, ["T1", "T2"], 12);
        const gesture = await marquee(page, {
            ...rect,
            left: t1.x - 40,
            top: t1.y - 40,
        });
        expect(gesture).toBe("marquee");
        await expectSelected(page, ["T1", "T2"]);
        expect((await readField(page)).activeGesture).toBeNull();
    });

    test("a marquee over empty field clears the selection", async ({
        show,
    }) => {
        const { page } = show;
        await clickMarcher(page, "T1");
        await clickMarcher(page, "T2", { add: true });
        await expectSelected(page, ["T1", "T2"]);
        const t1 = await screenOf(page, "T1");
        await marquee(page, {
            left: t1.x - 100,
            top: t1.y - 140,
            right: t1.x - 20,
            bottom: t1.y - 60,
        });
        await expectSelected(page, []);
    });

    test("a marquee never selects a hidden marcher", async ({ show }) => {
        const { page } = show;
        // F1, hidden, stands between T2 and T3
        const rect = await around(page, ["T2", "T3"], 15);
        await marquee(page, rect);
        await expectSelected(page, ["T2", "T3"]);
    });

    test("dragging from empty field inside a multi-selection's box draws no marquee", async ({
        show,
    }) => {
        // The drag moves the selection instead (owner decision); moving is #196's
        const { page } = show;
        await clickMarcher(page, "T1");
        await clickMarcher(page, "T4", { add: true });
        await expectSelected(page, ["T1", "T4"]);
        // Between B1 and T2, inside the box from T1 to T4
        const t2 = await screenOf(page, "T2");
        const t4 = await screenOf(page, "T4");
        const start = { x: t2.x + 15, y: (t2.y + t4.y) / 2 };
        const gesture = await dragThrough(page, [
            start,
            { x: start.x + 20, y: start.y + 10 },
            { x: start.x + 40, y: start.y + 20 },
        ]);
        expect(gesture).not.toBe("marquee");
        await expectSelected(page, ["T1", "T4"]);
    });

    test("change: Shift+drag on empty field adds a marquee to the selection, and draws no lasso (rules table: Shift)", async ({
        show,
    }) => {
        const { page } = show;
        await clickMarcher(page, "B2");
        await expectSelected(page, ["B2"]);
        const t1 = await screenOf(page, "T1");
        const rect = await around(page, ["T1", "T2"], 12);
        const gesture = await marquee(
            page,
            { ...rect, left: t1.x - 40, top: t1.y - 40 },
            { shift: true },
        );
        expect(gesture).toBe("marquee");
        await expectSelected(page, ["B2", "T1", "T2"]);
    });
});

test.describe("lasso", () => {
    test("double-click-and-drag draws a lasso that selects the marchers inside it, replacing the selection", async ({
        show,
    }) => {
        const { page } = show;
        await clickMarcher(page, "B1");
        await expectSelected(page, ["B1"]);
        const gesture = await lasso(
            page,
            await around(page, ["T2", "T3"], 20),
            10,
        );
        expect(gesture).toBe("lasso");
        // F1, hidden, is inside it too
        await expectSelected(page, ["T2", "T3"]);
        expect((await readField(page)).activeGesture).toBeNull();
    });

    test("Shift+double-click-and-drag adds the lasso to the selection", async ({
        show,
    }) => {
        const { page } = show;
        await clickMarcher(page, "B1");
        await expectSelected(page, ["B1"]);
        await lasso(page, await around(page, ["T2", "T3"], 20), 10, {
            shift: true,
        });
        await expectSelected(page, ["B1", "T2", "T3"]);
    });

    test("a lasso released 50 screen px or more from its start selects nothing", async ({
        show,
    }) => {
        const { page } = show;
        await clickMarcher(page, "B1");
        await expectSelected(page, ["B1"]);
        // With Shift, so the double-click's first click keeps the selection
        await lasso(page, await around(page, ["T2", "T3"], 40), 60, {
            shift: true,
        });
        await expectSelected(page, ["B1"]);
    });

    test("a lasso closes on a release within 50 screen px of its start", async ({
        show,
    }) => {
        const { page } = show;
        await lasso(page, await around(page, ["T2", "T3"], 25), 45);
        await expectSelected(page, ["T2", "T3"]);
    });

    test("a lasso is a gesture of its own: a plain drag is still a marquee", async ({
        show,
    }) => {
        const { page } = show;
        const rect = await around(page, ["T2", "T3"], 20);
        // Too slow for a double-click (`DOUBLE_CLICK_MS`, 500): the second
        // press is a marquee
        await page.mouse.click(rect.left, rect.top);
        await page.waitForTimeout(700);
        const gesture = await marquee(page, rect);
        expect(gesture).toBe("marquee");
        await expectSelected(page, ["T2", "T3"]);
    });
});

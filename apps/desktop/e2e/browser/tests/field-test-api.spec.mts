import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures.mjs";
import {
    clickMarcher,
    drawnMarchers,
    expectCanvasMatchesShow,
    readField,
    waitForIdle,
} from "../app.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";

// Pins what the field test API reads, so the scenarios that read through it
// read what the user sees.

// Four trumpets near the middle of the field, all in view.
const POSITIONS: SeedPosition[] = [
    [1, 500, 300],
    [2, 600, 350],
    [3, 700, 280],
    [4, 800, 400],
];

test.use({
    seedSql: seedShowSql({
        beats: 16,
        pageStarts: [],
        marchers: POSITIONS.map(([id]) => ({
            id,
            section: "Trumpet",
            prefix: "T",
            order: id,
        })),
        positions: [POSITIONS],
    }),
});

const marcher = async (page: Page, drillNumber: string) => {
    const drawn = (await drawnMarchers(page)).find(
        (m) => m.drillNumber === drillNumber,
    );
    if (!drawn?.onScreen)
        throw new Error(`${drillNumber} is not visible on the field`);
    return drawn;
};

/** Presses at `from`, moves 40 px, reads the gesture, then releases. */
async function gestureAt(
    page: Page,
    from: { x: number; y: number },
    { button = "left" }: { button?: "left" | "right" } = {},
) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button });
    await page.mouse.move(from.x + 40, from.y + 30, { steps: 8 });
    const during = (await readField(page)).activeGesture;
    await page.mouse.up({ button });
    const after = (await readField(page)).activeGesture;
    await waitForIdle(page);
    return { during, after };
}

test("reads the selection and its handles", async ({ show }) => {
    const { page } = show;
    await expectCanvasMatchesShow(show);
    expect(await readField(page)).toMatchObject({
        selection: [],
        handles: null,
        activeGesture: null,
    });

    // One marcher has no handles.
    await clickMarcher(page, "T2");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([2]);
    expect((await readField(page)).handles).toBeNull();

    await page.keyboard.press("Control+a");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([1, 2, 3, 4]);
    const { handles } = await readField(page);
    expect(handles).not.toBeNull();
    // The box surrounds the dots, with the rotate handle above it.
    const screens = (await drawnMarchers(page)).map((m) => m.screen);
    expect(handles!.nw.x).toBeLessThan(Math.min(...screens.map((p) => p.x)));
    expect(handles!.nw.y).toBeLessThan(Math.min(...screens.map((p) => p.y)));
    expect(handles!.se.x).toBeGreaterThan(Math.max(...screens.map((p) => p.x)));
    expect(handles!.se.y).toBeGreaterThan(Math.max(...screens.map((p) => p.y)));
    expect(handles!.n.x).toBeCloseTo((handles!.nw.x + handles!.ne.x) / 2, 0);
    expect(handles!.rot.y).toBeLessThan(handles!.n.y);
});

test("reads the view", async ({ show }) => {
    const { page } = show;
    await expectCanvasMatchesShow(show);
    const { zoom, pan } = (await readField(page)).viewport;
    expect(zoom).toBeGreaterThan(0);

    // Screen distances are field distances times the zoom, and pan is where
    // field point (0, 0) sits.
    const t1 = await marcher(page, "T1");
    const t2 = await marcher(page, "T2");
    expect(t2.screen.x - t1.screen.x).toBeCloseTo((t2.x - t1.x) * zoom, 1);
    expect(t2.screen.y - t1.screen.y).toBeCloseTo((t2.y - t1.y) * zoom, 1);
    const field = await page.getByTestId("fieldCanvas").boundingBox();
    const origin = {
        x: t1.screen.x - t1.x * zoom - field!.x,
        y: t1.screen.y - t1.y * zoom - field!.y,
    };
    // Within a twentieth of a pixel: the field's (0, 0), not the renderer's.
    expect(origin.x).toBeCloseTo(pan.x, 1);
    expect(origin.y).toBeCloseTo(pan.y, 1);
});

test("reads the gesture in progress", async ({ show }) => {
    const { page } = show;
    await expectCanvasMatchesShow(show);
    const t1 = await marcher(page, "T1");
    const emptyField = { x: t1.screen.x, y: t1.screen.y + 150 };

    expect(await gestureAt(page, emptyField)).toEqual({
        during: "marquee",
        after: null,
    });
    expect(await gestureAt(page, emptyField, { button: "right" })).toEqual({
        during: "pan",
        after: null,
    });

    const t2 = await marcher(page, "T2");
    expect(await gestureAt(page, t2.screen)).toEqual({
        during: "move",
        after: null,
    });

    await page.keyboard.press("Control+a");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([1, 2, 3, 4]);
    expect(await gestureAt(page, (await readField(page)).handles!.se)).toEqual({
        during: "scale",
        after: null,
    });
    expect(await gestureAt(page, (await readField(page)).handles!.e)).toEqual({
        during: "scale",
        after: null,
    });
    expect(await gestureAt(page, (await readField(page)).handles!.rot)).toEqual(
        { during: "rotate", after: null },
    );
});

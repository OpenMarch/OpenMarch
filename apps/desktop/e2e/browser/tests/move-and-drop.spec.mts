import type { Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    canvasScale,
    clickMarcher,
    dragFrom,
    dragMarcher,
    drawnMarchers,
    expectCanvasMatchesShow,
    goTo,
    selectedDrillNumbers,
    selectPage,
    waitForIdle,
} from "../app.mjs";
import { savedPosition, savedPositions, type Position } from "../positions.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";

// Move and drop on the field (#196; #189 user stories 34, 35, 41 to 45).
// Drags are saved through the timeline's drop rules: at home they edit the
// homes, on a later page that page's move, and in isolation the isolated
// move's end.
//
// The "change:" scenarios are the rules-table changes decided in #189.

// Four trumpets on three pages, all in view, 4 beats a measure.
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

const asPositions = (rows: readonly SeedPosition[]): Position[] =>
    rows.map(([id, x, y]) => ({ id, x, y }));

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

/** Each position in `rows`, moved by `by` field units for the marchers in `ids`. */
const movedBy = (
    rows: readonly SeedPosition[],
    ids: number[],
    by: { x: number; y: number },
): Position[] =>
    asPositions(rows).map((p) =>
        ids.includes(p.id) ? { id: p.id, x: p.x + by.x, y: p.y + by.y } : p,
    );

/**
 * Waits until page `pageId` saves `expected`, each within a field unit: a
 * drop lands where the dot was dragged on screen, to the nearest pixel.
 */
async function expectSaved(show: Show, pageId: number, expected: Position[]) {
    await expect
        .poll(async () => {
            const saved = await savedPositions(show, pageId);
            const near =
                saved.length === expected.length &&
                saved.every(
                    (p, i) =>
                        p.id === expected[i].id &&
                        Math.abs(p.x - expected[i].x) < 1 &&
                        Math.abs(p.y - expected[i].y) < 1,
                );
            return near ? "saved as expected" : { saved, expected };
        })
        .toBe("saved as expected");
}

/** A screen drag in field units at the field's zoom. */
const inField = async (page: Page, by: { x: number; y: number }) => {
    const scale = await canvasScale(page);
    return { x: by.x / scale, y: by.y / scale };
};

/** Within a field unit on both axes. */
const near = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;

/**
 * Records where marcher `id` is drawn on every frame, from `start` (which can
 * run mid-drag) until `stop`, through the field test API.
 */
async function recordDrawn(page: Page, id: number) {
    return {
        start: () =>
            page.evaluate((marcherId) => {
                const frames: { x: number; y: number }[] = [];
                (window as any).__drawnFrames = frames;
                const record = () => {
                    const drawn = window
                        .fieldTest!.marchers()
                        .find((m) => m.id === marcherId);
                    if (drawn) frames.push({ x: drawn.x, y: drawn.y });
                    if ((window as any).__drawnFrames === frames)
                        requestAnimationFrame(record);
                };
                record();
            }, id),
        stop: (): Promise<{ x: number; y: number }[]> =>
            page.evaluate(() => {
                const frames = (window as any).__drawnFrames;
                (window as any).__drawnFrames = null;
                return frames;
            }),
    };
}

test.beforeEach(async ({ show }) => {
    await expectCanvasMatchesShow(show);
});

test("dragging a selected marcher moves the whole selection, as one undo step", async ({
    show,
}) => {
    const { page } = show;
    // T3 is on the top edge of the selection's box, clear of its handles
    await clickMarcher(page, "T1");
    await clickMarcher(page, "T3", { add: true });
    await clickMarcher(page, "T4", { add: true });
    await expect
        .poll(() => selectedDrillNumbers(page))
        .toEqual(["T1", "T3", "T4"]);

    const drag = { x: 120, y: 80 };
    await dragMarcher(page, "T3", drag);
    const by = await inField(page, drag);

    await expectSaved(show, 0, movedBy(PAGE_0, [1, 3, 4], by));
    // The drag keeps the selection: narrowing to T3 happens only on a click
    await expect
        .poll(() => selectedDrillNumbers(page))
        .toEqual(["T1", "T3", "T4"]);
    expect(await savedPositions(show, 1)).toEqual(asPositions(PAGE_1));
    await expectCanvasMatchesShow(show);

    // One undo takes back the whole drag
    await waitForIdle(page);
    await page.keyboard.press("ControlOrMeta+z");
    await expect
        .poll(() => savedPositions(show, 0))
        .toEqual(asPositions(PAGE_0));
    await expectCanvasMatchesShow(show);
});

test("dragging from empty field inside a selection's box moves the selection (owner decision)", async ({
    show,
}) => {
    const { page } = show;
    await clickMarcher(page, "T1");
    await clickMarcher(page, "T4", { add: true });
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T1", "T4"]);

    // Halfway between T2 and T3, inside the box from T1 to T4
    const t2 = await screenOf(page, "T2");
    const t3 = await screenOf(page, "T3");
    const drag = { x: -60, y: 100 };
    await dragFrom(page, { x: (t2.x + t3.x) / 2, y: (t2.y + t3.y) / 2 }, drag);
    const by = await inField(page, drag);

    await expectSaved(show, 0, movedBy(PAGE_0, [1, 4], by));
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T1", "T4"]);
    await expectCanvasMatchesShow(show);
});

test("dragging a marcher that isn't selected selects it and moves only it", async ({
    show,
}) => {
    const { page } = show;
    await clickMarcher(page, "T1");
    await clickMarcher(page, "T2", { add: true });
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T1", "T2"]);

    const drag = { x: 0, y: 120 };
    await dragMarcher(page, "T4", drag);
    const by = await inField(page, drag);

    await expectSaved(show, 0, movedBy(PAGE_0, [4], by));
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T4"]);
    await expectCanvasMatchesShow(show);
});

test("change: a quick 19 px flick moves the marcher (rules table: Click vs drag)", async ({
    show,
    target,
}) => {
    const { page } = show;
    await clickMarcher(page, "T2");
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T2"]);
    const drag = { x: 19, y: 0 };
    await dragMarcher(page, "T2", drag, { steps: 1 });
    const by = await inField(page, drag);
    await expectSaved(show, 0, movedBy(PAGE_0, [2], by));
    await expectCanvasMatchesShow(show);
});

test("a drop on a later page edits that page's move, and leaves the homes alone", async ({
    show,
}) => {
    const { page } = show;
    await selectPage(show, "Page 1");

    const drag = { x: -80, y: -60 };
    await dragMarcher(page, "T2", drag);
    const by = await inField(page, drag);

    await expectSaved(show, 1, movedBy(PAGE_1, [2], by));
    expect(await savedPositions(show, 0)).toEqual(asPositions(PAGE_0));
    await expectCanvasMatchesShow(show);
    // It joined page 1's move: no new move passes through its flag
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
});

test("a drop at home edits the homes, and leaves later pages alone", async ({
    show,
}) => {
    const { page } = show;
    const drag = { x: 90, y: 40 };
    await dragMarcher(page, "T3", drag);
    const by = await inField(page, drag);

    await expectSaved(show, 0, movedBy(PAGE_0, [3], by));
    expect(await savedPositions(show, 1)).toEqual(asPositions(PAGE_1));
    await expectCanvasMatchesShow(show);
});

test("a drop that leaves a later move behind offers to move it too", async ({
    show,
}) => {
    const { page } = show;
    await selectPage(show, "Page 1");
    // T3 is on the top edge of the selection's box, clear of its handles
    await clickMarcher(page, "T1");
    await clickMarcher(page, "T3", { add: true });
    await clickMarcher(page, "T4", { add: true });

    // T3 and T4 hold into page 2 and follow; T1 has its own move there and keeps it
    const drag = { x: 40, y: -60 };
    await dragMarcher(page, "T3", drag);
    const by = await inField(page, drag);
    await expectSaved(show, 1, movedBy(PAGE_1, [1, 3, 4], by));
    const toast = page.locator("[data-sonner-toast]", {
        hasText: "T1 has its own move on Page 2, so it kept its spot",
    });
    await expect(toast).toBeVisible();
    const t1OnPage2 = asPositions(PAGE_2)[0];
    expect(await savedPosition(show, 1, 2)).toEqual({
        x: t1OnPage2.x,
        y: t1OnPage2.y,
    });

    await toast.getByRole("button", { name: "Move them too" }).click();
    await expect
        .poll(async () => {
            const { x, y } = await savedPosition(show, 1, 2);
            return (
                Math.abs(x - (t1OnPage2.x + by.x)) < 1 &&
                Math.abs(y - (t1OnPage2.y + by.y)) < 1
            );
        })
        .toBe(true);
});

test("marchers stay where they were dropped while the save is pending", async ({
    show,
}) => {
    const { page } = show;
    const before = await savedPosition(show, 2);
    const drag = { x: 100, y: 100 };
    const by = await inField(page, drag);

    const recording = await recordDrawn(page, 2);
    await dragMarcher(page, "T2", drag, { beforeRelease: recording.start });
    await expectSaved(show, 0, movedBy(PAGE_0, [2], by));
    const frames = await recording.stop();

    // Never drawn back where it started: it stays where it was dropped
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.filter((f) => near(f, before))).toEqual([]);
    await expectCanvasMatchesShow(show);
});

test("in isolation, a dropped marcher stays where it was dropped until the move is saved", async ({
    show,
}) => {
    const { page } = show;
    await selectPage(show, "Page 1");
    await page.getByTestId("timeline-clip").first().dblclick();
    await expect(page.getByTestId("timeline-isolation-bar")).toBeVisible();
    await waitForIdle(page);
    const [, endX, endY] = PAGE_1[3];

    const drag = { x: 60, y: -60 };
    const by = await inField(page, drag);
    const recording = await recordDrawn(page, 4);
    await dragMarcher(page, "T4", drag, { beforeRelease: recording.start });
    await expectSaved(show, 1, movedBy(PAGE_1, [4], by));
    // The isolated move's plan is rebuilt after the save: keep watching
    await waitForIdle(page);
    await page.waitForTimeout(300);
    const frames = await recording.stop();

    expect(frames.length).toBeGreaterThan(0);
    expect(frames.filter((f) => near(f, { x: endX, y: endY }))).toEqual([]);
});

test("a drop inside an isolated move edits the move's end", async ({
    show,
}) => {
    const { page } = show;
    await selectPage(show, "Page 1");
    // Double-clicking page 1's move isolates it
    await page.getByTestId("timeline-clip").first().dblclick();
    await expect(page.getByTestId("timeline-isolation-bar")).toBeVisible();
    // The isolated move's plan loads before it can be edited
    await waitForIdle(page);
    // The playhead partway through the move: T4 is drawn on its way
    await goTo(page, "m6");
    await expect(page.getByTestId("timeline-readout")).toContainText("ct 5/");
    await expect
        .poll(async () => (await drawnPosition(page, "T4")).y)
        .toBeLessThan(500);

    // The drop moves the move's end by the drag, and the playhead goes there
    const drag = { x: 50, y: -70 };
    await dragMarcher(page, "T4", drag);
    const by = await inField(page, drag);
    await expect(page.getByTestId("timeline-readout")).toContainText(
        "ct 16/16",
    );

    await expectSaved(show, 1, movedBy(PAGE_1, [4], by));
    expect(await savedPositions(show, 0)).toEqual(asPositions(PAGE_0));
});

test.describe("in Basic mode", () => {
    test.use({
        appSettings: { optOutAnalytics: true, editorMode: "basic" },
        // The refusal is logged as well as shown
        allowedPageErrors: [/TimelineEditRefusedError/],
    });

    test("a drop past the last page is refused with a toast, and the marcher snaps back", async ({
        show,
    }) => {
        const { page } = show;
        // Page 2 ends at beat 40: measure 11 is past its flag
        await goTo(page, "m11");
        await expect(page.getByTestId("timeline-readout")).toContainText("m11");
        await waitForIdle(page);
        const before = await savedPositions(show, 2);
        const t1 = await drawnPosition(page, "T1");

        const recording = await recordDrawn(page, 1);
        await dragMarcher(
            page,
            "T1",
            { x: 60, y: 60 },
            {
                beforeRelease: recording.start,
            },
        );
        await expect(
            page.locator("[data-sonner-toast]", {
                hasText: "There's no page here yet",
            }),
        ).toBeVisible();
        await expect.poll(() => drawnPosition(page, "T1")).toEqual(t1);
        // It was drawn where it was dragged before it snapped back
        const frames = await recording.stop();
        expect(frames.some((f) => !near(f, t1))).toBe(true);
        await waitForIdle(page);
        expect(await savedPositions(show, 2)).toEqual(before);
    });
});

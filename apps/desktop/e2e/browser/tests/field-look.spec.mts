import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures.mjs";
import {
    addPageAt,
    clickMarcher,
    dragMarcher,
    drawnMarchers,
    expectCanvasMatchesShow,
    goTo,
    readField,
    waitForField,
} from "../app.mjs";
import { seedShowSql } from "../seed.mjs";
import { isolate } from "../timeline.mjs";

// The field look (#478, holds decisions 8 and 9): a marcher draws solid whenever
// its position is decided (walking in a move, arriving, Held, or in a carried
// shape) and dashed only when Not defined. Its label is bold only on a keyframe,
// the count where a coordinate of its own is set (a move of its own ends there,
// moved or not, #468).
//
// Pages flag at beats 9, 17 and 25, four beats a measure. Over page 1 (1–9)
// everyone moves. Over page 2 (9–17) T1 moves, T2 has a stay move (it ends
// where it began) and T3 has no move: it holds. Over page 3 (17–25) everyone
// moves.
test.use({
    seedSql: [
        ...seedShowSql({
            beats: 32,
            measureStarts: [1, 5, 9, 13, 17, 21, 25, 29],
            pageStarts: [1, 9, 17],
            marchers: [1, 2, 3].map((id) => ({
                id,
                section: "Trumpet",
                prefix: "T",
                order: id,
            })),
            positions: [
                [
                    [1, 400, 300],
                    [2, 500, 300],
                    [3, 600, 300],
                ],
                [
                    [1, 400, 340],
                    [2, 500, 340],
                    [3, 600, 340],
                ],
                [
                    [1, 400, 380],
                    [2, 500, 340],
                    [3, 600, 380],
                ],
                [
                    [1, 400, 420],
                    [2, 500, 420],
                    [3, 600, 420],
                ],
            ],
        }),
        // T3 (slot 2) has no move over page 2: it holds there
        "DELETE FROM timeline_assignments WHERE transition_id = 2 AND marcher_id = 3",
        "DELETE FROM timeline_slot_destinations WHERE transition_id = 2 AND slot_index = 2",
        "UPDATE timeline_transitions SET slot_count = 2 WHERE id = 2",
        "DELETE FROM timeline_change_log",
    ],
});

/** Who's drawn Not defined (dashed), by drill number. */
const notDefined = async (page: Page) =>
    (await drawnMarchers(page))
        .filter((m) => m.notDefined)
        .map((m) => m.drillNumber)
        .sort();

/** Whose label isn't bold (off a keyframe), by drill number. */
const plainLabels = async (page: Page) =>
    (await drawnMarchers(page))
        .filter((m) => !m.labelBold)
        .map((m) => m.drillNumber)
        .sort();

/** Moves the playhead one beat later (Shift+E) or earlier (Shift+Q). */
const step = (page: Page, key: "Shift+E" | "Shift+Q") =>
    page.keyboard.press(key);

async function open(page: Page) {
    await waitForField(page);
    // The resolver is ready once the field draws the show
    await expect.poll(async () => (await drawnMarchers(page)).length).toBe(3);
}

test("only Not defined marchers are dashed, and labels are bold only on a keyframe", async ({
    show,
}) => {
    const { page } = show;
    await open(page);

    // The first page is always decided, and a keyframe
    await expect.poll(() => notDefined(page)).toEqual([]);
    await expect.poll(() => plainLabels(page)).toEqual([]);

    // Page 1's flag: everyone's move ends here
    await goTo(page, "m3");
    await expectCanvasMatchesShow(show);
    await expect.poll(() => notDefined(page)).toEqual([]);
    await expect.poll(() => plainLabels(page)).toEqual([]);

    // One beat before, everyone is partway through their move: solid, plain labels
    await step(page, "Shift+Q");
    await expect.poll(() => notDefined(page)).toEqual([]);
    await expect.poll(() => plainLabels(page)).toEqual(["T1", "T2", "T3"]);
    // One beat after, T1 walks and T2 is on its stay move; T3 has no move there
    await step(page, "Shift+E");
    await step(page, "Shift+E");
    await expect.poll(() => notDefined(page)).toEqual(["T3"]);
    await expect.poll(() => plainLabels(page)).toEqual(["T1", "T2", "T3"]);

    // Page 2's flag: T1 moved here; T2's stay move ends here, so it's a keyframe
    // though it never moved; T3 holds, Not defined
    await goTo(page, "m5");
    await expectCanvasMatchesShow(show);
    await expect.poll(() => notDefined(page)).toEqual(["T3"]);
    await expect.poll(() => plainLabels(page)).toEqual(["T3"]);
});

test("a page added mid-move shows everyone walking: solid, with plain labels", async ({
    show,
}) => {
    const { page } = show;
    await open(page);
    // Halfway through page 3's moves
    await addPageAt(page, 6);
    await expect
        .poll(async () => (await show.query("SELECT id FROM pages")).length)
        .toBe(5);
    await expectCanvasMatchesShow(show);
    await expect.poll(() => notDefined(page)).toEqual([]);
    await expect.poll(() => plainLabels(page)).toEqual(["T1", "T2", "T3"]);
});

test("a Not defined marcher can be dragged, and becomes a keyframe on that count", async ({
    show,
}) => {
    const { page } = show;
    await open(page);
    await goTo(page, "m5");
    await expectCanvasMatchesShow(show);
    await expect.poll(() => notDefined(page)).toEqual(["T3"]);

    await dragMarcher(page, "T3", { x: 0, y: 40 });
    await expectCanvasMatchesShow(show);
    await expect.poll(() => notDefined(page)).toEqual([]);
    await expect.poll(() => plainLabels(page)).toEqual([]);
});

test("selecting a Not defined marcher keeps its look", async ({ show }) => {
    const { page } = show;
    await open(page);
    await goTo(page, "m5");
    await expectCanvasMatchesShow(show);

    await clickMarcher(page, "T3");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([3]);
    await expect.poll(() => notDefined(page)).toEqual(["T3"]);
});

test("isolation's dim takes over from the Not defined look", async ({
    show,
}) => {
    const { page } = show;
    await open(page);
    // Page 2's move (its box starts at beat index 8) has T1 and T2; T3,
    // which holds there, is dimmed
    await isolate(page, 8);
    await expect
        .poll(async () =>
            (await drawnMarchers(page))
                .filter((m) => m.dimmed)
                .map((m) => m.drillNumber),
        )
        .toEqual(["T3"]);
    const t3 = (await drawnMarchers(page)).find((m) => m.drillNumber === "T3")!;
    expect(t3.notDefined).toBe(false);
    expect(t3.labelBold).toBe(true);
});

test("everyone is solid and bold while playing, and Not defined again after Stop", async ({
    show,
}) => {
    const { page } = show;
    await open(page);
    // Partway through page 2: T1 and T2 walk, T3 has no move
    await goTo(page, "m4");
    await expect.poll(() => notDefined(page)).toEqual(["T3"]);
    await expect.poll(() => plainLabels(page)).toEqual(["T1", "T2", "T3"]);
    const paused = (await drawnMarchers(page)).find(
        (m) => m.drillNumber === "T1",
    )!;

    await page.keyboard.press("Space");
    // Read once playback is running: T1 has moved on from where it was paused
    await expect
        .poll(
            async () =>
                (await drawnMarchers(page)).find((m) => m.drillNumber === "T1")!
                    .y,
        )
        .not.toBe(paused.y);
    expect(await notDefined(page)).toEqual([]);
    expect(await plainLabels(page)).toEqual([]);

    // Stop goes back to where Play was pressed
    await page.keyboard.press("Space");
    await expect.poll(() => notDefined(page)).toEqual(["T3"]);
});

test("selecting and dragging right after Stop don't wait for the dashed look", async ({
    show,
}) => {
    const { page } = show;
    await open(page);
    // Page 2's flag: T3 is Not defined
    await goTo(page, "m5");
    await expect.poll(() => notDefined(page)).toEqual(["T3"]);
    const flag = (await drawnMarchers(page)).find(
        (m) => m.drillNumber === "T1",
    )!;

    await page.keyboard.press("Space");
    await expect
        .poll(
            async () =>
                (await drawnMarchers(page)).find((m) => m.drillNumber === "T1")!
                    .y,
        )
        .not.toBe(flag.y);
    // Stop goes back to page 2's flag; the dashes ease in (#302) while the
    // designer is already dragging T3 there
    await page.keyboard.press("Space");
    await dragMarcher(page, "T3", { x: 0, y: 40 });
    await expectCanvasMatchesShow(show);
    await expect.poll(() => notDefined(page)).toEqual([]);
    await clickMarcher(page, "T2");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([2]);
});

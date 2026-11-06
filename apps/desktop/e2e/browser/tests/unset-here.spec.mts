import type { Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    clickMarcher,
    drawnMarchers,
    expectCanvasMatchesShow,
    goTo,
    readField,
    waitForField,
    waitForIdle,
} from "../app.mjs";
import { savedPositions } from "../positions.mjs";
import { seedShowSql } from "../seed.mjs";

// Unset here (Set vs Following, #300 and #304): the selected marchers Set on
// the playhead's count lose that coordinate and follow from earlier; the later
// pages that followed it keep their spots. It's the timelineUnsetHere action,
// run here from the command palette.
//
// Pages flag at beats 9, 17 and 25 (measures 3, 5 and 7), four beats a
// measure. Over page 1 everyone moves. Over page 2 T1 and T2 move and T3
// holds. Over page 3 T1 and T3 move and T2 holds: it follows page 2.
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
                    [2, 500, 380],
                    [3, 600, 340],
                ],
                [
                    [1, 400, 420],
                    [2, 500, 380],
                    [3, 600, 420],
                ],
            ],
        }),
        // T3 (slot 2) has no move over page 2: it holds there
        "DELETE FROM timeline_assignments WHERE transition_id = 2 AND marcher_id = 3",
        "DELETE FROM timeline_slot_destinations WHERE transition_id = 2 AND slot_index = 2",
        "UPDATE timeline_transitions SET slot_count = 2 WHERE id = 2",
        // T2 (slot 1) has no move over page 3: T3 takes its slot
        "DELETE FROM timeline_assignments WHERE transition_id = 3 AND marcher_id = 2",
        "DELETE FROM timeline_slot_destinations WHERE transition_id = 3 AND slot_index = 1",
        "UPDATE timeline_slot_destinations SET slot_index = 1 WHERE transition_id = 3 AND slot_index = 2",
        "UPDATE timeline_assignments SET slot_index = 1 WHERE transition_id = 3 AND marcher_id = 3",
        "UPDATE timeline_transitions SET slot_count = 2 WHERE id = 3",
        "DELETE FROM timeline_change_log",
    ],
});

/** Who's drawn Not defined (dashed), by drill number. */
const notDefined = async (page: Page) =>
    (await drawnMarchers(page))
        .filter((m) => m.notDefined)
        .map((m) => m.drillNumber)
        .sort();

/** Each marcher's saved spot on page `pageId`'s flag, as "x,y" by drill number. */
const spots = async (show: Show, pageId: number) =>
    Object.fromEntries(
        (await savedPositions(show, pageId)).map((p) => [
            `T${p.id}`,
            `${Math.round(p.x)},${Math.round(p.y)}`,
        ]),
    );

const PAGE_2_BEFORE = { T1: "400,380", T2: "500,380", T3: "600,340" };
const PAGE_3 = { T1: "400,420", T2: "500,380", T3: "600,420" };

/** Opens the show at page 2's flag, with `drillNumbers` selected. */
async function atPage2With(show: Show, drillNumbers: string[]) {
    const { page } = show;
    await waitForField(page);
    await expect.poll(async () => (await drawnMarchers(page)).length).toBe(3);
    await goTo(page, "m5");
    await expectCanvasMatchesShow(show);
    await expect.poll(() => notDefined(page)).toEqual(["T3"]);
    for (const [i, drillNumber] of drillNumbers.entries())
        await clickMarcher(page, drillNumber, { add: i > 0 });
    await expect
        .poll(async () => (await readField(page)).selection.length)
        .toBe(drillNumbers.length);
    await waitForIdle(page);
}

/** Runs Unset here from the command palette. */
async function unsetFromPalette(page: Page) {
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByPlaceholder("Search commands…").fill("Remove keyframe");
    await expect(
        page.getByRole("option", {
            name: "Remove keyframe Timeline",
            exact: true,
        }),
    ).not.toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Enter");
}

/** Whether Remove keyframe is offered in the command palette, which it then closes. */
async function expectUnsetDisabled(page: Page) {
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByPlaceholder("Search commands…").fill("Remove keyframe");
    await expect(
        page.getByRole("option", {
            name: "Remove keyframe Timeline",
            exact: true,
        }),
    ).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");
}

async function unsetThenUndo(show: Show) {
    const { page } = show;
    await atPage2With(show, ["T2"]);
    await unsetFromPalette(page);

    // T2 follows page 1 on page 2's flag, faded; page 3 keeps its spot
    await expect
        .poll(() => spots(show, 2))
        .toEqual({ ...PAGE_2_BEFORE, T2: "500,340" });
    expect(await spots(show, 3)).toEqual(PAGE_3);
    await expectCanvasMatchesShow(show);
    await expect.poll(() => notDefined(page)).toEqual(["T2", "T3"]);

    // One Undo puts it all back
    await waitForIdle(page);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => spots(show, 2)).toEqual(PAGE_2_BEFORE);
    expect(await spots(show, 3)).toEqual(PAGE_3);
    await expectCanvasMatchesShow(show);
    await expect.poll(() => notDefined(page)).toEqual(["T3"]);
}

test("Unset here: the marcher follows from earlier, later pages keep their spots, and one Undo restores it", async ({
    show,
}) => {
    await unsetThenUndo(show);
});

test("a mixed selection takes back only the marchers Set on the count", async ({
    show,
}) => {
    const { page } = show;
    await atPage2With(show, ["T2", "T3"]);
    await unsetFromPalette(page);

    await expect
        .poll(() => spots(show, 2))
        .toEqual({ ...PAGE_2_BEFORE, T2: "500,340" });
    expect(await spots(show, 3)).toEqual(PAGE_3);
    await expect.poll(() => notDefined(page)).toEqual(["T2", "T3"]);

    await waitForIdle(page);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => spots(show, 2)).toEqual(PAGE_2_BEFORE);
    await expect.poll(() => notDefined(page)).toEqual(["T3"]);
});

test("Unset here is disabled when no selected marcher is Set on the count", async ({
    show,
}) => {
    const { page } = show;
    await atPage2With(show, ["T3"]);
    await expectUnsetDisabled(page);

    // Partway through page 2, nobody is Set
    await goTo(page, "m4");
    await clickMarcher(page, "T1");
    await expectUnsetDisabled(page);
    expect(await spots(show, 2)).toEqual(PAGE_2_BEFORE);
});

test.describe("in Basic mode", () => {
    test.use({
        appSettings: { optOutAnalytics: true, editorMode: "basic" },
    });

    test("Unset here works the same, and one Undo restores it", async ({
        show,
    }) => {
        await unsetThenUndo(show);
    });
});

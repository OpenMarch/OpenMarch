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

// Unset here and on Pages N–M (Set vs Following, #300 and #305): as Unset
// here, but the later pages that followed the spot follow back to the earlier
// one. It's the timelineUnsetHereAndFollowing action, offered only when some
// pages follow, run here from the command palette.
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
const PAGE_3_BEFORE = { T1: "400,420", T2: "500,380", T3: "600,420" };

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

/** The palette's search for the Unset actions, open. */
async function searchUnset(page: Page) {
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByPlaceholder("Search commands…").fill("Remove keyframe");
}

/** T2 is back on page 1's spot on page 2's flag and on page 3, which followed it. */
async function expectFollowedBack(show: Show) {
    await expect
        .poll(() => spots(show, 2))
        .toEqual({ ...PAGE_2_BEFORE, T2: "500,340" });
    expect(await spots(show, 3)).toEqual({ ...PAGE_3_BEFORE, T2: "500,340" });
    await expectCanvasMatchesShow(show);
    await expect.poll(() => notDefined(show.page)).toEqual(["T2", "T3"]);
}

/** One Undo puts it all back. */
async function undoRestores(show: Show) {
    await waitForIdle(show.page);
    await show.page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => spots(show, 2)).toEqual(PAGE_2_BEFORE);
    expect(await spots(show, 3)).toEqual(PAGE_3_BEFORE);
    await expectCanvasMatchesShow(show);
    await expect.poll(() => notDefined(show.page)).toEqual(["T3"]);
}

async function fromPaletteThenUndo(show: Show) {
    const { page } = show;
    await atPage2With(show, ["T2"]);
    await searchUnset(page);
    const item = page.getByRole("option", {
        name: "Remove keyframe, Page 3 moves back too",
    });
    await expect(item).not.toHaveAttribute("aria-disabled", "true");
    await item.click();
    await expectFollowedBack(show);
    await undoRestores(show);
}

test("Unset here and on Page 3: the page that followed follows back, and one Undo restores it", async ({
    show,
}) => {
    await fromPaletteThenUndo(show);
});

test("the palette names the pages, and a mixed selection takes back only the Set marchers", async ({
    show,
}) => {
    const { page } = show;
    await atPage2With(show, ["T2", "T3"]);
    await searchUnset(page);
    await page
        .getByRole("option", { name: "Remove keyframe, Page 3 moves back too" })
        .click();
    await expectFollowedBack(show);
    await undoRestores(show);
});

test("it isn't offered when no later page follows the spot", async ({
    show,
}) => {
    const { page } = show;
    // T1 moves again over page 3: nothing follows its spot on page 2's flag
    await atPage2With(show, ["T1"]);
    await searchUnset(page);
    await expect(
        page.getByRole("option", {
            name: "Remove keyframe Timeline",
            exact: true,
        }),
    ).not.toHaveAttribute("aria-disabled", "true");
    await expect(
        page.getByRole("option", {
            name: "Remove keyframe, later pages move back too",
        }),
    ).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");
    expect(await spots(show, 2)).toEqual(PAGE_2_BEFORE);
    expect(await spots(show, 3)).toEqual(PAGE_3_BEFORE);
});

test.describe("in Basic mode", () => {
    test.use({
        appSettings: { optOutAnalytics: true, editorMode: "basic" },
    });

    test("Unset here and on Page 3 works the same, and one Undo restores it", async ({
        show,
    }) => {
        await fromPaletteThenUndo(show);
    });
});

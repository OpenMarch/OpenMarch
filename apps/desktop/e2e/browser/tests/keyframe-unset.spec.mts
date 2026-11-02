import type { Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    clickMarcher,
    expectCanvasMatchesShow,
    goTo,
    readField,
    waitForField,
    waitForIdle,
    drawnMarchers,
} from "../app.mjs";
import { savedPositions } from "../positions.mjs";
import { seedShowSql } from "../seed.mjs";

// Unset from a keyframe diamond's right-click (Set vs Following, #300 and
// #306): the diamond's menu offers Unset here and, where pages follow, Unset
// here and on Pages N–M, for the selected marchers Set at that diamond's count.
// The playhead stays where it is.
//
// Pages flag at beats 9, 17 and 25 (measures 3, 5 and 7), four beats a
// measure. Over page 1 everyone moves. Over page 2 T1 and T2 move and T3
// holds. Over page 3 T1 and T3 move and T2 holds: it follows page 2.
//
// The diamonds' test ids carry the timeline's beats, one less than the
// show's, so page 2's flag is 16.
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

/** The diamonds' test ids, which carry their beat and filled or hollow. */
const diamonds = (page: Page) =>
    page
        .locator('[data-testid^="timeline-keyframe-"]')
        .evaluateAll((all) => all.map((d) => d.getAttribute("data-testid")));

const menuItems = (page: Page) =>
    page
        .getByTestId("timeline-keyframe-menu")
        .getByRole("menuitem")
        .allTextContents();

/**
 * Opens the show at page 1's flag (not page 2's, where the diamond is), with
 * `drillNumbers` selected. Returns the readout there, which must not change.
 */
async function atPage1With(show: Show, drillNumbers: string[]) {
    const { page } = show;
    await waitForField(page);
    await expect.poll(async () => (await drawnMarchers(page)).length).toBe(3);
    await goTo(page, "m3");
    await expectCanvasMatchesShow(show);
    for (const [i, drillNumber] of drillNumbers.entries())
        await clickMarcher(page, drillNumber, { add: i > 0 });
    await expect
        .poll(async () => (await readField(page)).selection.length)
        .toBe(drillNumbers.length);
    await waitForIdle(page);
    return page.getByTestId("timeline-readout").textContent();
}

/** One Undo puts the spots and the diamond back. */
async function undoRestores(show: Show, diamond: string) {
    await waitForIdle(show.page);
    await show.page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => spots(show, 2)).toEqual(PAGE_2_BEFORE);
    expect(await spots(show, 3)).toEqual(PAGE_3_BEFORE);
    await expectCanvasMatchesShow(show);
    await expect(show.page.getByTestId(diamond)).toBeVisible();
}

async function unsetHereThenUndo(show: Show) {
    const { page } = show;
    const readout = await atPage1With(show, ["T2"]);
    expect(await diamonds(page)).toContain("timeline-keyframe-16-filled");

    await page
        .getByTestId("timeline-keyframe-16-filled")
        .click({ button: "right" });
    expect(await menuItems(page)).toEqual([
        "Remove keyframe",
        "Remove keyframe, Page 3 moves back too",
    ]);
    await page
        .getByRole("menuitem", { name: "Remove keyframe", exact: true })
        .click();

    // T2 follows page 1's spot on page 2's flag; page 3 keeps its spot
    await expect
        .poll(() => spots(show, 2))
        .toEqual({ ...PAGE_2_BEFORE, T2: "500,340" });
    expect(await spots(show, 3)).toEqual(PAGE_3_BEFORE);
    // The diamond's gone, and the playhead never moved
    await expect
        .poll(() => diamonds(page))
        .not.toContain("timeline-keyframe-16-filled");
    await expect(page.getByTestId("timeline-readout")).toHaveText(readout!);

    await undoRestores(show, "timeline-keyframe-16-filled");
}

test("Unset here from a diamond takes back its count, leaves the playhead, and one Undo restores it", async ({
    show,
}) => {
    await unsetHereThenUndo(show);
});

test("Unset here and on Page 3 from a diamond lets page 3 follow back", async ({
    show,
}) => {
    const { page } = show;
    const readout = await atPage1With(show, ["T2"]);
    await page
        .getByTestId("timeline-keyframe-16-filled")
        .click({ button: "right" });
    await page
        .getByRole("menuitem", {
            name: "Remove keyframe, Page 3 moves back too",
        })
        .click();

    await expect
        .poll(() => spots(show, 2))
        .toEqual({ ...PAGE_2_BEFORE, T2: "500,340" });
    expect(await spots(show, 3)).toEqual({ ...PAGE_3_BEFORE, T2: "500,340" });
    await expect
        .poll(() => diamonds(page))
        .not.toContain("timeline-keyframe-16-filled");
    await expect(page.getByTestId("timeline-readout")).toHaveText(readout!);

    await undoRestores(show, "timeline-keyframe-16-filled");
});

test("a hollow diamond takes back only the selected marchers Set there", async ({
    show,
}) => {
    const { page } = show;
    // T2 is Set on page 2's flag, T3 holds there
    await atPage1With(show, ["T2", "T3"]);
    await page
        .getByTestId("timeline-keyframe-16-hollow")
        .click({ button: "right" });
    await page
        .getByRole("menuitem", { name: "Remove keyframe", exact: true })
        .click();

    await expect
        .poll(() => spots(show, 2))
        .toEqual({ ...PAGE_2_BEFORE, T2: "500,340" });
    expect(await spots(show, 3)).toEqual(PAGE_3_BEFORE);
    // Nobody selected is Set there now. Page 3 kept T2's spot with a move of its
    // own, whose end is a keyframe like T3's, so that diamond is filled
    await expect
        .poll(() => diamonds(page))
        .toEqual(["timeline-keyframe-8-filled", "timeline-keyframe-24-filled"]);

    // Undo selects the marchers it changed (P7.13): T2 alone, Set there again
    await undoRestores(show, "timeline-keyframe-16-filled");
});

test("only Unset here where no page follows, and the keyboard opens the menu", async ({
    show,
}) => {
    const { page } = show;
    // T1 moves again over page 3: nothing follows its spot on page 2's flag
    await atPage1With(show, ["T1"]);
    const diamond = page.getByTestId("timeline-keyframe-16-filled");
    await diamond.focus();
    await page.keyboard.press("Shift+F10");
    await expect(page.getByTestId("timeline-keyframe-menu")).toBeVisible();
    expect(await menuItems(page)).toEqual(["Remove keyframe"]);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("timeline-keyframe-menu")).toHaveCount(0);
    expect(await spots(show, 2)).toEqual(PAGE_2_BEFORE);
});

test.describe("in Basic mode", () => {
    test.use({
        appSettings: { optOutAnalytics: true, editorMode: "basic" },
    });

    test("Unset here from a diamond works the same, and one Undo restores it", async ({
        show,
    }) => {
        await unsetHereThenUndo(show);
    });
});

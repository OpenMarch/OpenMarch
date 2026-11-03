import type { Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    clickMarcher,
    dragMarcher,
    drawnMarchers,
    expectCanvasMatchesShow,
    goTo,
    readField,
    waitForField,
    waitForIdle,
} from "../app.mjs";
import { savedPositions } from "../positions.mjs";
import { seedShowSql } from "../seed.mjs";
import { pageBox } from "../timeline.mjs";

// Hold from previous page and a drag inside the hold (holds, fork #472): the
// page box menu makes a Held hold over that page for the selected marchers,
// growing out of the move that arrives at the previous page's flag, drawn as a
// solid bar from that arrival's diamond. A drag on a count inside the hold
// edits that arrival, so the whole hold moves with it.
//
// Pages flag at beats 9, 17, 25 and 33 (measures 3, 5, 7 and 9), four beats a
// measure. T1 moves on every page. T2 moves on pages 1 and 2 and has no move
// on pages 3 and 4: it is Not set there and shows page 2's spot.
//
// Page boxes and the Held bar carry the timeline's beats, one less than the
// show's, so page 3's box starts at 16.
test.use({
    seedSql: [
        ...seedShowSql({
            beats: 40,
            measureStarts: [1, 5, 9, 13, 17, 21, 25, 29, 33, 37],
            pageStarts: [1, 9, 17, 25],
            marchers: [1, 2].map((id) => ({
                id,
                section: "Trumpet",
                prefix: "T",
                order: id,
            })),
            positions: [
                [
                    [1, 400, 300],
                    [2, 500, 300],
                ],
                [
                    [1, 400, 340],
                    [2, 500, 340],
                ],
                [
                    [1, 400, 380],
                    [2, 500, 380],
                ],
                [
                    [1, 400, 420],
                    [2, 500, 380],
                ],
                [
                    [1, 400, 460],
                    [2, 500, 380],
                ],
            ],
        }),
        // T2 (slot 1) has no move over pages 3 and 4
        "DELETE FROM timeline_assignments WHERE transition_id IN (3, 4) AND marcher_id = 2",
        "DELETE FROM timeline_slot_destinations WHERE transition_id IN (3, 4) AND slot_index = 1",
        "UPDATE timeline_transitions SET slot_count = 1 WHERE id IN (3, 4)",
        "DELETE FROM timeline_change_log",
    ],
});

const PAGE_3_BOX = 16;

/** One marcher's saved spot on page `pageId`'s flag, as "x,y". */
const spot = async (show: Show, pageId: number, marcherId: number) => {
    const p = (await savedPositions(show, pageId)).find(
        (m) => m.id === marcherId,
    )!;
    return `${Math.round(p.x)},${Math.round(p.y)}`;
};

/** Each marcher's stored rows, as "start-end", by marcher id. */
const rows = async (show: Show) => {
    const all = await show.query<{
        marcher_id: number;
        start_beat: number;
        end_beat: number;
    }>(
        "SELECT marcher_id, start_beat, end_beat FROM timeline_assignments ORDER BY marcher_id, start_beat",
    );
    const out: Record<number, string[]> = {};
    for (const r of all)
        (out[r.marcher_id] ??= []).push(`${r.start_beat}-${r.end_beat}`);
    return out;
};

async function openWith(show: Show, drillNumbers: string[]) {
    const { page } = show;
    await waitForField(page);
    await expect.poll(async () => (await drawnMarchers(page)).length).toBe(2);
    await goTo(page, "m5");
    await expectCanvasMatchesShow(show);
    for (const [i, drillNumber] of drillNumbers.entries())
        await clickMarcher(page, drillNumber, { add: i > 0 });
    await expect
        .poll(async () => (await readField(page)).selection.length)
        .toBe(drillNumbers.length);
    await waitForIdle(page);
}

/** Each marcher's Held marks, as "start-end", by marcher id. */
const marks = async (show: Show) => {
    const all = await show.query<{
        marcher_id: number;
        start_beat: number;
        end_beat: number;
    }>(
        "SELECT marcher_id, start_beat, end_beat FROM timeline_held_marks ORDER BY marcher_id, start_beat",
    );
    const out: Record<number, string[]> = {};
    for (const r of all)
        (out[r.marcher_id] ??= []).push(`${r.start_beat}-${r.end_beat}`);
    return out;
};

/** Right-clicks the page box at `startBeat` and picks Hold from previous page. */
async function holdFromPrevious(page: Page, startBeat: number) {
    // The selection's page states settle after the field shows the selection
    await expect(async () => {
        await pageBox(page, startBeat).click({ button: "right" });
        await page
            .getByTestId("timeline-range-menu-hold-from-previous")
            .click({ timeout: 1000 });
    }).toPass();
}

test("Hold from previous page on page 3 draws a solid bar from page 2's diamond; a drag inside it moves page 2's spot and the hold, and Undo takes each back", async ({
    show,
}) => {
    const { page } = show;
    await openWith(show, ["T2"]);
    const before = await rows(show);

    await holdFromPrevious(page, PAGE_3_BOX);
    await expect.poll(async () => (await marks(show))[2]).toEqual(["17-25"]);
    // No move written: T2 still stands at page 2's spot through pages 3 and 4
    expect(await rows(show)).toEqual(before);
    expect(await spot(show, 3, 2)).toBe("500,380");
    // The bar runs over page 3's counts, from the diamond on page 2's flag
    await expect(page.getByTestId("timeline-held-bar-16-24")).toBeVisible();
    await expect(page.getByTestId("timeline-keyframe-16-filled")).toBeVisible();

    // Drag T2 with the playhead on page 3's flag, inside the hold
    await goTo(page, "m7");
    await clickMarcher(page, "T2");
    await waitForIdle(page);
    await dragMarcher(page, "T2", { x: 0, y: 40 });
    await expect.poll(() => spot(show, 2, 2)).not.toBe("500,380");
    const moved = await spot(show, 2, 2);
    // Page 2's arrival moved, and the hold with it: no move of T2 on page 3
    expect(await spot(show, 3, 2)).toBe(moved);
    expect(await spot(show, 4, 2)).toBe(moved);
    expect((await rows(show))[2]).toEqual(before[2]);
    expect((await marks(show))[2]).toEqual(["17-25"]);
    // Earlier pages and other marchers as before
    expect(await spot(show, 1, 2)).toBe("500,340");
    expect((await rows(show))[1]).toEqual(before[1]);
    await expectCanvasMatchesShow(show);

    // One Undo takes back the drag, the next one the hold
    await waitForIdle(page);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => spot(show, 2, 2)).toBe("500,380");
    expect((await marks(show))[2]).toEqual(["17-25"]);
    await waitForIdle(page);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(async () => (await marks(show))[2]).toBeUndefined();
    await expect(page.getByTestId("timeline-held-bar-16-24")).toHaveCount(0);
    expect(await rows(show)).toEqual(before);
});

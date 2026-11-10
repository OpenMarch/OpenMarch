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

// Set as shown (holds, fork #466): the page box menu gives the selected
// marchers that are Not set on a page a move of their own there, ending where
// they show, so an edit of an earlier page stops carrying into it. It is an
// ordinary move: stored kept spots are gone (#467).
//
// Pages flag at beats 9, 17, 25 and 33 (measures 3, 5, 7 and 9), four beats a
// measure. T1 moves on every page. T2 moves on pages 1 and 2 and has no move
// on pages 3 and 4: it is Not set there and shows page 2's spot.
//
// Page boxes carry the timeline's beats, one less than the show's, so page
// 4's box starts at 24.
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

const PAGE_4_BOX = 24;

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

/** Right-clicks the page box at `startBeat` and picks Define as shown. */
async function setAsShown(page: Page, startBeat: number) {
    // The selection's page states settle after the field shows the selection
    await expect(async () => {
        await pageBox(page, startBeat).click({ button: "right" });
        await page
            .getByTestId("timeline-range-menu-set-as-shown")
            .click({ timeout: 1000 });
    }).toPass();
}

test("Set as shown on page 4, then an edit of page 2: page 3 follows, page 4 keeps its spot, and Undo takes each back", async ({
    show,
}) => {
    const { page } = show;
    await openWith(show, ["T1", "T2"]);
    const before = await rows(show);
    expect(before[2]).toEqual(["1-9", "9-17"]);

    await setAsShown(page, PAGE_4_BOX);
    // T2 gets its own move over page 4; T1, already set there, is untouched
    await expect.poll(async () => (await rows(show))[2]).toContain("25-33");
    expect((await rows(show))[1]).toEqual(before[1]);
    expect(await spot(show, 4, 2)).toBe("500,380");
    // No kept table, no kept dot (#467)
    expect(
        await show.query(
            "SELECT name FROM sqlite_schema WHERE name = 'timeline_kept_assignments'",
        ),
    ).toEqual([]);
    await expect(page.getByTestId("page-keep-dot")).toHaveCount(0);

    // Edit page 2 (the playhead is on its flag): page 3 follows, page 4 doesn't
    await clickMarcher(page, "T2");
    await waitForIdle(page);
    await dragMarcher(page, "T2", { x: 0, y: 40 });
    await expect.poll(() => spot(show, 2, 2)).not.toBe("500,380");
    const moved = await spot(show, 2, 2);
    expect(await spot(show, 3, 2)).toBe(moved);
    expect(await spot(show, 4, 2)).toBe("500,380");

    // One Undo takes back the drag, the next one Set as shown
    await waitForIdle(page);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => spot(show, 2, 2)).toBe("500,380");
    expect((await rows(show))[2]).toContain("25-33");
    await waitForIdle(page);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(async () => (await rows(show))[2]).toEqual(before[2]);
    await expectCanvasMatchesShow(show);
});

test("Set as shown is checked and does nothing when every selected marcher is already Defined on the page", async ({
    show,
}) => {
    const { page } = show;
    await openWith(show, ["T1"]);
    const before = await rows(show);
    const entry = page.getByTestId("timeline-range-menu-set-as-shown");
    await expect(async () => {
        await pageBox(page, PAGE_4_BOX).click({ button: "right" });
        await expect(entry).toHaveAttribute("aria-checked", "true", {
            timeout: 1000,
        });
    }).toPass();
    await expect(entry).toHaveAttribute("data-disabled", "");
    await entry.click({ force: true });
    expect(await rows(show)).toEqual(before);
});

import type { Locator, Page } from "@playwright/test";
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
import { seedShowSql } from "../seed.mjs";
import { pageBox } from "../timeline.mjs";

// Borrowed holds (fork #474; holds 04-anchors, demo "Anchors · Borrowed
// hold"): Hold from previous page where nothing arrives at the previous flag
// holds the spot the last move left, drawn as a lighter, hatched Held bar with
// a chip naming that spot. A drag inside it adds a move ending at the hold's
// start, and the hold then grows out of that diamond (a plain Held bar).
//
// Pages flag at beats 9, 17, 25 and 33 (measures 3, 5, 7 and 9), four beats a
// measure. T1 moves on every page. T2 moves on page 1 only: pages 2–4 are Not
// defined and show page 1's spot.
//
// Page boxes and bars carry the timeline's beats, one less than the show's:
// page 4's box is [24, 32).
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
                    [2, 500, 340],
                ],
                [
                    [1, 400, 420],
                    [2, 500, 340],
                ],
                [
                    [1, 400, 460],
                    [2, 500, 340],
                ],
            ],
        }),
        // T2 (slot 1) has no move over pages 2, 3 and 4
        "DELETE FROM timeline_assignments WHERE transition_id IN (2, 3, 4) AND marcher_id = 2",
        "DELETE FROM timeline_slot_destinations WHERE transition_id IN (2, 3, 4) AND slot_index = 1",
        "UPDATE timeline_transitions SET slot_count = 1 WHERE id IN (2, 3, 4)",
        "DELETE FROM timeline_change_log",
    ],
});

const PAGE_4_BOX = 24;

/** Where screenshots for review go, when set (`BORROWED_SHOTS=/mnt/data/...`) */
const SHOTS = process.env.BORROWED_SHOTS;

/** T2's rows, as "start-end". */
const t2Rows = async (show: Show) =>
    (
        await show.query<{ start_beat: number; end_beat: number }>(
            "SELECT start_beat, end_beat FROM timeline_assignments WHERE marcher_id = 2 ORDER BY start_beat",
        )
    ).map((r) => `${r.start_beat}-${r.end_beat}`);

/** T2's Held marks, as "start-end". */
const t2Marks = async (show: Show) =>
    (
        await show.query<{ start_beat: number; end_beat: number }>(
            "SELECT start_beat, end_beat FROM timeline_held_marks WHERE marcher_id = 2 ORDER BY start_beat",
        )
    ).map((r) => `${r.start_beat}-${r.end_beat}`);

/** Opens the show at page 4's flag with T2 selected, and holds page 4 from page 3. */
async function borrowedHold(show: Show) {
    const { page } = show;
    await waitForField(page);
    await expect.poll(async () => (await drawnMarchers(page)).length).toBe(2);
    await goTo(page, "m9");
    await expectCanvasMatchesShow(show);
    await clickMarcher(page, "T2");
    await expect
        .poll(async () => (await readField(page)).selection.length)
        .toBe(1);
    await waitForIdle(page);
    await expect(async () => {
        await pageBox(page, PAGE_4_BOX).click({ button: "right" });
        await page
            .getByTestId("timeline-range-menu-hold-from-previous")
            .click({ timeout: 1000 });
    }).toPass();
    await expect.poll(() => t2Marks(show)).toEqual(["25-33"]);
}

const heldBar = (page: Page) => page.getByTestId("timeline-held-bar-24-32");

/** The drawn thickness (px) of a bar's line, inside its taller hit strip */
const lineHeight = (bar: Locator) =>
    bar.evaluate(
        (el) =>
            el.querySelector("[data-hold-line]")!.getBoundingClientRect()
                .height,
    );

/** A clip of the timeline around the bars, attached to the report, and saved under `SHOTS`. */
async function shoot(page: Page, name: string) {
    const bar = (await heldBar(page).boundingBox())!;
    // From the start of the timeline (page 1's flag) to past the hold
    const left = Math.max(0, bar.x - bar.width * 3 - 40);
    const clip = {
        x: left,
        y: Math.max(0, bar.y - 50),
        width: bar.x + bar.width + 60 - left,
        height: 90,
    };
    const body = await page.screenshot({ clip });
    await test.info().attach(name, { body, contentType: "image/png" });
    if (SHOTS)
        await page.screenshot({
            clip,
            path: `${SHOTS}/${name}.png`,
            scale: "device",
        });
}

const setTheme = (page: Page, dark: boolean) =>
    page.evaluate(
        (on) => document.documentElement.classList.toggle("dark", on),
        dark,
    );

test("Hold from previous page where nothing arrives draws a borrowed hold: hatched, with a chip naming page 1's spot", async ({
    show,
}) => {
    const { page } = show;
    await borrowedHold(show);
    // Nothing written but the mark: pages 2 and 3 stay Not defined
    expect(await t2Rows(show)).toEqual(["1-9"]);
    const bar = heldBar(page);
    await expect(bar).toHaveAttribute("data-borrowed", "true");
    await expect(bar).toHaveAccessibleName(
        "Held · Page 4. Standing at Page 1's spot",
    );
    await expect(page.getByTestId("timeline-borrowed-chip-24-32")).toHaveText(
        "Held · Page 1's spot",
    );
    await expect.poll(() => lineHeight(bar)).toBe(2);
    // The selected page ends inside the hold: the line back to page 1's spot shows
    await expect(
        page.getByTestId("timeline-borrowed-line-24-32"),
    ).toBeVisible();
    await expect(page.getByTestId("timeline-hold-line")).toHaveText(
        "Held · Page 1's spot",
    );
    for (const dark of [false, true]) {
        await setTheme(page, dark);
        await shoot(page, `borrowed-rest-${dark ? "dark" : "light"}`);
    }
    await setTheme(page, false);

    // Away from the hold, the line back shows only while the pointer is over the bar
    await goTo(page, "m5");
    const lineBack = page.getByTestId("timeline-borrowed-line-24-32");
    await expect(lineBack).toHaveCount(0);
    const box = (await bar.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(lineBack).toBeVisible();
    await page.mouse.move(box.x + box.width / 2, box.y - 60);
    await expect(lineBack).toHaveCount(0);
});

test("a drag inside the borrowed hold lights it, then adds a move on page 3 and the hold grows out of its diamond", async ({
    show,
}) => {
    const { page } = show;
    await borrowedHold(show);
    const t2 = (await drawnMarchers(page)).find((m) => m.drillNumber === "T2")!;
    await page.mouse.move(t2.screen.x, t2.screen.y);
    await page.mouse.down();
    await page.mouse.move(t2.screen.x + 40, t2.screen.y + 30, { steps: 8 });
    await expect(heldBar(page)).toHaveAttribute("data-lit", "true");
    await expect.poll(() => lineHeight(heldBar(page))).toBe(6);
    // Both themes while the drag runs
    for (const dark of [false, true]) {
        await setTheme(page, dark);
        await shoot(page, `borrowed-lit-${dark ? "dark" : "light"}`);
    }
    await page.mouse.up();
    await setTheme(page, false);
    // A move on page 3 now ends at the hold's start; the hold grows out of it
    await expect.poll(() => t2Rows(show)).toEqual(["1-9", "17-25"]);
    expect(await t2Marks(show)).toEqual(["25-33"]);
    await expect(heldBar(page)).not.toHaveAttribute("data-borrowed", "true");
    await expect(page.getByTestId("timeline-borrowed-chip-24-32")).toHaveCount(
        0,
    );
});

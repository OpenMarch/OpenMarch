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

// Every hold grows out of what last put the marcher there (owner, 2026-11-09;
// ADR 0012). Hold from last keyframe on a page after Not defined pages reaches
// back over them to the marcher's last arrival: one plain Held bar. A drag
// inside it moves the whole hold, including where it arrives.
//
// Pages flag at beats 9, 17, 25 and 33 (measures 3, 5, 7 and 9), four beats a
// measure. T1 moves on every page. T2 moves on page 1 only: pages 2–4 are Not
// defined and show page 1's spot.
//
// Page boxes and bars carry the timeline's beats, one less than the show's:
// page 4's box is [24, 32), and T2's hold, spec [9, 33), is view [8, 32).
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

const PAGE_2_BOX = 8;
const PAGE_4_BOX = 24;

/** Where screenshots for review go, when set (`HOLD_REACH_SHOTS=/mnt/data/...`) */
const SHOTS = process.env.HOLD_REACH_SHOTS;

const asRanges = (rows: { start_beat: number; end_beat: number }[]) =>
    rows.map((r) => `${r.start_beat}-${r.end_beat}`);

/** T2's rows, as "start-end". */
const t2Rows = async (show: Show) =>
    asRanges(
        await show.query(
            "SELECT start_beat, end_beat FROM timeline_assignments WHERE marcher_id = 2 ORDER BY start_beat",
        ),
    );

/** T2's Held marks, as "start-end". */
const t2Marks = async (show: Show) =>
    asRanges(
        await show.query(
            "SELECT start_beat, end_beat FROM timeline_held_marks WHERE marcher_id = 2 ORDER BY start_beat",
        ),
    );

/** Where T2's page 1 move ends. */
const t2Arrival = async (show: Show) =>
    (
        await show.query<{ x: number; y: number }>(
            `SELECT d.x, d.y FROM timeline_slot_destinations d
               JOIN timeline_assignments a
                 ON a.transition_id = d.transition_id AND a.slot_index = d.slot_index
              WHERE a.marcher_id = 2`,
        )
    )[0]!;

/** Opens the show at page 4's flag with T2 selected, and holds page 4. */
async function reachedBackHold(show: Show) {
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
    await expect.poll(() => t2Marks(show)).toEqual(["9-33"]);
}

const heldBar = (page: Page) => page.getByTestId("timeline-held-bar-8-32");

/** The drawn thickness (px) of a bar's line, inside its taller hit strip */
const lineHeight = (bar: Locator) =>
    bar.evaluate(
        (el) =>
            el.querySelector("[data-hold-line]")!.getBoundingClientRect()
                .height,
    );

/** A clip of the timeline around the bar, attached to the report, and saved under `SHOTS`. */
async function shoot(page: Page, name: string) {
    const bar = (await heldBar(page).boundingBox())!;
    const clip = {
        x: Math.max(0, bar.x - 80),
        y: Math.max(0, bar.y - 50),
        width: bar.width + 140,
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

test("Hold from last keyframe after Not defined pages reaches back: one plain Held bar from the last arrival", async ({
    show,
}) => {
    const { page } = show;
    await reachedBackHold(show);
    // Nothing written but the mark, and it starts at page 1's flag
    expect(await t2Rows(show)).toEqual(["1-9"]);
    await expect(heldBar(page)).toHaveCount(1);
    await expect(page.getByText("T2 Held on Pages 2–4")).toBeVisible();
    // No start handle: the start is fixed by the rule. The end still drags
    await expect(page.getByTestId("timeline-hold-start-8")).toHaveCount(0);
    await expect(page.getByTestId("timeline-hold-end-32")).toBeAttached();
    for (const dark of [false, true]) {
        await setTheme(page, dark);
        await shoot(page, `reach-back-rest-${dark ? "dark" : "light"}`);
    }
    await setTheme(page, false);
});

test("hovering Hold from last keyframe pulses the whole hold it would make, and leaving stops it", async ({
    show,
}) => {
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
    await pageBox(page, PAGE_4_BOX).click({ button: "right" });
    const entry = page.getByTestId("timeline-range-menu-hold-from-previous");
    await entry.hover();
    const pulsing = page.locator("[data-preview]");
    await expect(pulsing).toHaveCount(1);
    await expect(heldBar(page).and(pulsing)).toHaveCount(1);
    // It fills the page row above the bar, sweeping out and then pulsing
    const fill = pulsing.locator("[data-preview-fill]");
    await expect(fill).toHaveCount(1);
    await expect
        .poll(() => fill.evaluate((el) => el.getBoundingClientRect().height))
        .toBeCloseTo(28, 0);
    expect(
        await fill.evaluate((el) =>
            el
                .getAnimations()
                .some((a) => a.effect?.getTiming().iterations === Infinity),
        ),
    ).toBe(true);
    await shoot(page, "reach-back-preview-light");
    await page.keyboard.press("Escape");
    await expect(pulsing).toHaveCount(0);
    // Only a preview: nothing written
    expect(await t2Marks(show)).toEqual([]);
});

test("a drag on the hold's first page lights the whole bar and moves the arrival, not a page of its own", async ({
    show,
}) => {
    const { page } = show;
    await reachedBackHold(show);
    // Page 2's window starts where the hold does, so the drag moves the whole hold
    await pageBox(page, PAGE_2_BOX).click();
    await waitForIdle(page);
    const before = await t2Arrival(show);
    const t2 = (await drawnMarchers(page)).find((m) => m.drillNumber === "T2")!;
    await page.mouse.move(t2.screen.x, t2.screen.y);
    await page.mouse.down();
    await page.mouse.move(t2.screen.x + 40, t2.screen.y + 30, { steps: 8 });
    await expect(heldBar(page)).toHaveAttribute("data-lit", "true");
    await expect.poll(() => lineHeight(heldBar(page))).toBe(6);
    for (const dark of [false, true]) {
        await setTheme(page, dark);
        await shoot(page, `reach-back-lit-${dark ? "dark" : "light"}`);
    }
    await page.mouse.up();
    await setTheme(page, false);
    await expect.poll(() => t2Arrival(show)).not.toEqual(before);
    // No move added: the same row, and the same hold
    expect(await t2Rows(show)).toEqual(["1-9"]);
    expect(await t2Marks(show)).toEqual(["9-33"]);
    await expect(heldBar(page)).toHaveCount(1);
});

// In Expert, a page's window on a later page of a hold starts inside it, so it wins (owner,
// 2026-11-09): the hold ends at the page's start and the drag adds a move. The bars show that
// during the drag.
test("an Expert drag on a later page ends the hold there, lighting only what changes", async ({
    show,
}) => {
    const { page } = show;
    await reachedBackHold(show);
    // Go-to moves only the playhead; a click on the page's box sets its window
    await pageBox(page, PAGE_4_BOX).click();
    await waitForIdle(page);
    const before = await t2Arrival(show);
    const t2 = (await drawnMarchers(page)).find((m) => m.drillNumber === "T2")!;
    await page.mouse.move(t2.screen.x, t2.screen.y);
    await page.mouse.down();
    await page.mouse.move(t2.screen.x + 40, t2.screen.y + 30, { steps: 8 });
    // Page 4's window is [25, 33): view [24, 32) lights, the part before it stays
    const stays = page.getByTestId("timeline-held-bar-8-24");
    const goes = page.getByTestId("timeline-held-bar-24-32");
    await expect(goes).toHaveAttribute("data-lit", "true");
    await expect(stays).not.toHaveAttribute("data-lit", "true");
    await page.mouse.up();
    await expect.poll(() => t2Marks(show)).toEqual(["9-25"]);
    expect(await t2Rows(show)).toEqual(["1-9", "25-33"]);
    // The hold's arrival wasn't edited
    expect(await t2Arrival(show)).toEqual(before);
});

// Hold from start flag to playhead with Not defined pages before the flag: the hold reaches back
// to what last put T2 there, the same as the highlighted preview says.
test("Hold from start flag to playhead reaches back over Not defined pages, and highlighting it previews that hold", async ({
    show,
}) => {
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
    // The window is page 4; T2 last arrived at page 1's flag, so the hold reaches back there
    await pageBox(page, PAGE_4_BOX).click();
    await waitForIdle(page);
    const t2 = (await drawnMarchers(page)).find((m) => m.drillNumber === "T2")!;
    await page.mouse.click(t2.screen.x, t2.screen.y, { button: "right" });
    const entry = page.getByTestId("field-menu-timelineHoldOverWindow");
    await entry.hover();
    const pulsing = page.locator("[data-preview]");
    await expect(heldBar(page).and(pulsing)).toHaveCount(1);
    // Only a preview: nothing written
    expect(await t2Marks(show)).toEqual([]);
    await entry.click();
    await expect.poll(() => t2Marks(show)).toEqual(["9-33"]);
    await expect(pulsing).toHaveCount(0);
    await expect(heldBar(page)).toHaveCount(1);
});

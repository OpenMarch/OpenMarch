import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures.mjs";
import { clickMarcher, drawnMarchers, goTo, waitForField } from "../app.mjs";
import { seedShowSql } from "../seed.mjs";
import { emptyField } from "../timeline.mjs";

// The selection's keyframes (#300, #303): with marchers selected, the timeline
// shows a diamond at every count where a selected marcher is Set, filled where
// all of them are, hollow where some are. A click moves the playhead there.
// They replace the page boxes' hold marks, in Basic and Expert.
//
// Pages flag at beats 9, 17 and 25. Everyone moves over pages 1 and 3. Over
// page 2 (9–17) T1 moves, T2 has a stay move (it ends where it began, but a
// stored move end is a keyframe, so it's Set there, #468) and T3 has no move:
// it holds.
//
// The diamonds' test ids carry the timeline's beats, as its page boxes'
// `data-timeline-range-start` do: one less than the show's (the timeline
// leaves out the show's zero-length beat 0), so page 2's flag is 16.
const SEED = [
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
];

/** The diamonds' test ids, which carry their beat and filled or hollow. */
const diamonds = (page: Page) =>
    page
        .locator('[data-testid^="timeline-keyframe-"]')
        .evaluateAll((all) => all.map((d) => d.getAttribute("data-testid")));

async function open(page: Page) {
    await waitForField(page);
    // The resolver is ready once the field draws the show
    await expect.poll(async () => (await drawnMarchers(page)).length).toBe(3);
}

/** Who's drawn Not defined (dashed), by drill number. */
const notDefined = async (page: Page) =>
    (await drawnMarchers(page))
        .filter((m) => m.notDefined)
        .map((m) => m.drillNumber)
        .sort();

for (const mode of ["expert", "basic"] as const)
    test.describe(`in ${mode === "basic" ? "Basic" : "Expert"} mode`, () => {
        test.use({
            seedSql: SEED,
            appSettings: { optOutAnalytics: true, editorMode: mode },
        });

        test("the selection's keyframes mark where it's Set, filled where all of it is", async ({
            show,
        }) => {
            const { page } = show;
            await open(page);

            // Nothing selected: no diamonds
            await expect.poll(() => diamonds(page)).toEqual([]);

            // One marcher: every count it's Set on, filled
            await clickMarcher(page, "T1");
            await expect
                .poll(() => diamonds(page))
                .toEqual([
                    "timeline-keyframe-8-filled",
                    "timeline-keyframe-16-filled",
                    "timeline-keyframe-24-filled",
                ]);
            await expect(
                page.getByTestId("timeline-keyframe-16-filled"),
            ).toHaveAccessibleName("Keyframe · Page 2, count 8");

            // T2 alone: its stay move on page 2 goes nowhere, and still has one
            await clickMarcher(page, "T2");
            await expect
                .poll(() => diamonds(page))
                .toEqual([
                    "timeline-keyframe-8-filled",
                    "timeline-keyframe-16-filled",
                    "timeline-keyframe-24-filled",
                ]);

            // T1 and T3: T3 is only Following on page 2, so that one's hollow
            await clickMarcher(page, "T1");
            await clickMarcher(page, "T3", { add: true });
            await expect
                .poll(() => diamonds(page))
                .toEqual([
                    "timeline-keyframe-8-filled",
                    "timeline-keyframe-16-hollow",
                    "timeline-keyframe-24-filled",
                ]);
            await expect(
                page.getByTestId("timeline-keyframe-16-hollow"),
            ).toHaveAccessibleName(
                "Keyframe · Page 2, count 8. 1 of 2 selected: T1",
            );

            // The page boxes' old hold marks are gone
            await expect(page.getByTestId("page-hold-mark")).toHaveCount(0);

            // Nothing selected again: none
            await page.keyboard.press("Escape");
            const empty = await emptyField(page);
            await page.mouse.click(empty.x, empty.y);
            await expect.poll(() => diamonds(page)).toEqual([]);
        });

        test("clicking a keyframe moves the playhead to its count", async ({
            show,
        }) => {
            const { page } = show;
            await open(page);
            const readout = page.getByTestId("timeline-readout");
            // What the readout says on page 2's flag (beat 17)
            await goTo(page, "m5");
            await expect(readout).toContainText("m5");
            const atPage2Flag = await readout.textContent();
            await goTo(page, "m1");
            await expect(readout).not.toHaveText(atPage2Flag!);

            await clickMarcher(page, "T1");
            await page.getByTestId("timeline-keyframe-16-filled").click();
            await expect(readout).toHaveText(atPage2Flag!);
            // The field shows that count: T1 and T2 (its stay) are Set there, T3 follows
            await expect.poll(() => notDefined(page)).toEqual(["T3"]);
            // The selection stays
            await expect
                .poll(() => diamonds(page))
                .toEqual([
                    "timeline-keyframe-8-filled",
                    "timeline-keyframe-16-filled",
                    "timeline-keyframe-24-filled",
                ]);
        });
    });

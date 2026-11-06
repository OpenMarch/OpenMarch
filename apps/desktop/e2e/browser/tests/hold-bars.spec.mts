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

// The selection's hold bars (holds, fork #477): Not defined stretches dashed,
// Held solid, a tick where the next move takes over, the keyframe diamonds
// kept. They light up where an edit would carry: while a field drag runs, and
// while "Remove keyframe, Pages N–M move back too" is hovered or focused, in
// the diamond's menu and the command palette.
//
// Pages flag at beats 9, 17 and 25 (measures 3, 5 and 7), four beats a
// measure. Over page 1 everyone moves. Over page 2 T1 and T2 move and T3
// holds. Over page 3 T1 and T3 move and T2 holds: it is Not defined there and
// follows page 2. The same show as unset-here-and-following.spec.mts.
//
// Bars, ticks and diamonds carry the timeline's beats, one less than the
// show's: page 2's flag is 16 and page 3's 24.
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

/** T2's Not defined bar over page 3, from its diamond on page 2's flag */
const page3Bar = (page: Page) =>
    page.getByTestId("timeline-not-defined-bar-16-24");

/** Opens the show at page 2's flag, with `drillNumbers` selected. */
async function atPage2With(show: Show, drillNumbers: string[]) {
    const { page } = show;
    await waitForField(page);
    await expect.poll(async () => (await drawnMarchers(page)).length).toBe(3);
    await goTo(page, "m5");
    await expectCanvasMatchesShow(show);
    for (const [i, drillNumber] of drillNumbers.entries())
        await clickMarcher(page, drillNumber, { add: i > 0 });
    await expect
        .poll(async () => (await readField(page)).selection.length)
        .toBe(drillNumbers.length);
    await waitForIdle(page);
}

test("Not defined is dashed from its diamond, a departure has a tick, and nothing shows without a selection", async ({
    show,
}) => {
    const { page } = show;
    await atPage2With(show, ["T3"]);
    // T3 holds over page 2 from page 1's diamond, and moves again on page 3
    const bar = page.getByTestId("timeline-not-defined-bar-8-16");
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute("data-lit", "false");
    await expect(bar).toHaveAccessibleName("Not defined · Page 2");
    await attachAround(page, bar, "not-defined-alone");
    await expect(page.getByTestId("timeline-keyframe-8-filled")).toBeVisible();
    const tick = page.getByTestId("timeline-departure-16");
    await expect(tick).toBeVisible();
    await expect(tick).toHaveAccessibleName("Moves again · Page 3, count 1");

    await page.keyboard.press("Escape");
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([]);
    await expect(bar).toHaveCount(0);
    await expect(tick).toHaveCount(0);
});

test("hovering the diamond menu's follow-back entry lights the page that would follow back, and leaving turns it off", async ({
    show,
}) => {
    const { page } = show;
    await atPage2With(show, ["T2"]);
    await expect(page3Bar(page)).toHaveAttribute("data-lit", "false");
    // The playhead on page 2's flag sits over the diamond and would take a
    // right-click: open its menu from the keyboard instead
    await expect(async () => {
        await page.getByTestId("timeline-keyframe-16-filled").focus();
        await page.keyboard.press("Shift+F10");
        await expect(
            page.getByTestId("timeline-keyframe-menu-follow-back"),
        ).toBeVisible({ timeout: 1000 });
    }).toPass();
    const followBack = page.getByTestId("timeline-keyframe-menu-follow-back");
    await expect(followBack).toHaveText(
        "Remove keyframe, Page 3 moves back too",
    );
    await expect.poll(() => lineHeight(page3Bar(page))).toBe(2);
    await followBack.hover();
    await expect(page3Bar(page)).toHaveAttribute("data-lit", "true");
    // Lit, the thin line grows
    await expect.poll(() => lineHeight(page3Bar(page))).toBe(6);

    // Onto the plain entry: only the follow-back entry lights anything
    await page
        .getByRole("menuitem", { name: "Remove keyframe", exact: true })
        .hover();
    await expect(page3Bar(page)).toHaveAttribute("data-lit", "false");

    // Back by the keyboard, then closed
    await page.keyboard.press("ArrowDown");
    await expect(page3Bar(page)).toHaveAttribute("data-lit", "true");
    await page.keyboard.press("Escape");
    await expect(followBack).toHaveCount(0);
    await expect(page3Bar(page)).toHaveAttribute("data-lit", "false");
});

test("the palette's follow-back entry lights the same page while highlighted", async ({
    show,
}) => {
    const { page } = show;
    await atPage2With(show, ["T2"]);
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByPlaceholder("Search commands…").fill("Remove keyframe");
    await page
        .getByRole("option", {
            name: "Remove keyframe, Page 3 moves back too",
        })
        .hover();
    await expect(page3Bar(page)).toHaveAttribute("data-lit", "true");
    await page.keyboard.press("Escape");
    await expect(page3Bar(page)).toHaveAttribute("data-lit", "false");
});

test("during a drag on page 2, the Not defined page the edit carries into lights up", async ({
    show,
}) => {
    const { page } = show;
    await atPage2With(show, ["T2"]);
    const t2 = (await drawnMarchers(page)).find((m) => m.drillNumber === "T2")!;
    await page.mouse.move(t2.screen.x, t2.screen.y);
    await page.mouse.down();
    await page.mouse.move(t2.screen.x, t2.screen.y + 30, { steps: 8 });
    await expect(page3Bar(page)).toHaveAttribute("data-lit", "true");
    await page.mouse.up();
    // The drop carried into page 3, which still follows page 2: unlit again
    await expect(page3Bar(page)).toHaveAttribute("data-lit", "false");
});

test("a right-click on a Not defined bar offers Define as shown for its page", async ({
    show,
}) => {
    const { page } = show;
    await atPage2With(show, ["T2"]);
    const box = (await page3Bar(page).boundingBox())!;
    // The bar's lower half, over the measure row: it still opens page 3's menu
    await expect(async () => {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height - 1, {
            button: "right",
        });
        await expect(
            page.getByTestId("timeline-range-menu-set-as-shown"),
        ).toBeVisible({ timeout: 1000 });
    }).toPass();
    await page.getByTestId("timeline-range-menu-set-as-shown").click();
    // T2 now has a move of its own over page 3: no Not defined bar there
    await expect(page3Bar(page)).toHaveCount(0);
});

/** The drawn thickness (px) of a bar's line, inside its taller hit strip */
const lineHeight = (bar: Locator) =>
    bar.evaluate(
        (el) =>
            el.querySelector("[data-hold-line]")!.getBoundingClientRect()
                .height,
    );

/** A clip of the timeline around `bar`, attached to the test's report for review */
async function attachAround(page: Page, bar: Locator, name: string) {
    const box = (await bar.boundingBox())!;
    await test.info().attach(name, {
        body: await page.screenshot({
            clip: {
                x: Math.max(0, box.x - 120),
                y: Math.max(0, box.y - 60),
                width: box.width + 240,
                height: 110,
            },
        }),
        contentType: "image/png",
    });
}

test.describe("a mixed selection over the same counts", () => {
    // Over page 3 only T1 moves: T2 and T3 both hold there, T2 Held (a
    // stored mark) and T3 Not defined
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
                        [3, 600, 380],
                    ],
                    [
                        [1, 400, 420],
                        [2, 500, 380],
                        [3, 600, 380],
                    ],
                ],
            }),
            "DELETE FROM timeline_assignments WHERE transition_id = 3 AND marcher_id IN (2, 3)",
            "DELETE FROM timeline_slot_destinations WHERE transition_id = 3 AND slot_index IN (1, 2)",
            "UPDATE timeline_transitions SET slot_count = 1 WHERE id = 3",
            // Stored in the show's beats, one more than the timeline's
            "INSERT INTO timeline_held_marks (marcher_id, start_beat, end_beat) VALUES (2, 17, 25)",
            "DELETE FROM timeline_change_log",
        ],
    });

    test("the Held bar draws dashed where the rest are Not defined, the dashes in step", async ({
        show,
    }) => {
        const { page } = show;
        await atPage2With(show, ["T2", "T3"]);
        const held = page.getByTestId("timeline-held-bar-16-24");
        const notDefined = page.getByTestId("timeline-not-defined-bar-16-24");
        await expect(held).toBeVisible();
        await expect(notDefined).toBeVisible();
        await expect(held).toHaveAttribute("data-mixed", "true");
        // Both dash in step with the timeline's start, not their own left edge
        // (the bar's box is a hit strip; its line is drawn inside it, as wide)
        const dashStart = (bar: Locator) =>
            bar.evaluate((el) => {
                const line = el.querySelector("[data-hold-line]")!;
                const style = getComputedStyle(line);
                const layers = (
                    (el as HTMLElement).dataset.held
                        ? style.maskPosition
                        : style.backgroundPosition
                ).split(",");
                const x = parseFloat(layers[layers.length - 1]!.trim());
                return x + parseFloat((el as HTMLElement).style.left);
            });
        expect(await dashStart(held)).toBe(0);
        expect(await dashStart(notDefined)).toBe(0);
        await attachAround(page, held, "mixed-held-and-not-defined");

        // T2 alone: solid again
        await clickMarcher(page, "T2");
        await expect
            .poll(async () => (await readField(page)).selection.length)
            .toBe(1);
        await expect(held).not.toHaveAttribute("data-mixed", "true");
        await expect(notDefined).toHaveCount(0);
        await attachAround(page, held, "held-alone");
    });
});

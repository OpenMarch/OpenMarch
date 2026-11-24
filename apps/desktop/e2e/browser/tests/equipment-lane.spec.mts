import { test, expect, type Show } from "../fixtures.mjs";
import type { Locator, Page } from "@playwright/test";
import { emulateTouchScreen, tap, waitForField, waitForIdle } from "../app.mjs";
import { seedShowSql } from "../seed.mjs";

// The Equipment lane (fork #992): a cue's bar has edges like a move's clip. Dragging the end edge
// sets where the cue ends, and one undo puts it back.
//
// Pages flag at beats 9, 17 and 25, four beats a measure. T1 and T2 take rifles on beat 3 for two
// counts, an even way from any page flag or measure line, so the drag isn't pulled onto one.
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
                    [2, 500, 420],
                    [3, 600, 420],
                ],
            ],
        }),
        `INSERT INTO cues (id, type, beat_id, value, length, label)
         VALUES (1, 'equipment', 3, 'builtin:equipment.rifle', 2, 'T1, T2')`,
        "INSERT INTO cue_marchers (cue_id, marcher_id) VALUES (1, 1), (1, 2)",
    ],
});

/** The cue's length in counts (null: lasting), as saved. */
const savedLength = async (show: Show) => {
    const [row] = await show.query<{ length: number | null }>(
        "SELECT length FROM cues WHERE id = 1",
    );
    return row?.length;
};

test("dragging a cue's end edge sets where it ends, and one undo puts it back", async ({
    show,
}) => {
    const { page } = show;
    await waitForField(page);
    const bar = page.getByTestId("equipment-lane-cue").first();
    await expect(bar).toBeVisible();
    await waitForIdle(page);
    expect(await savedLength(show)).toBe(2);

    // Two counts wide: one count is half the bar
    const box = (await bar.boundingBox())!;
    const perCount = box.width / 2;
    await bar.hover();
    const end = bar.getByTestId("equipment-lane-cue-end");
    await expect(end).toBeAttached();
    const grip = (await end.boundingBox())!;
    const from = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + perCount * 3, from.y, { steps: 12 });
    await page.mouse.up();

    // Three counts later: five counts long, one undo step
    await expect.poll(() => savedLength(show)).toBe(5);
    await waitForIdle(page);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => savedLength(show)).toBe(2);
});

/** Where the playhead's line is drawn, in viewport pixels */
const playheadX = async (page: Page) => {
    const box = (await page.getByTestId("timeline-playhead").boundingBox())!;
    return box.x + box.width / 2;
};

/** The cue's bar, one count's width, and a spot in its row on empty lane space */
async function laneSpots(page: Page) {
    await waitForField(page);
    const bar = page.getByTestId("equipment-lane-cue").first();
    await expect(bar).toBeVisible();
    await waitForIdle(page);
    const box = (await bar.boundingBox())!;
    const perCount = box.width / 2;
    // Halfway through a count, 5 counts past the bar's end: clear of every page flag and measure
    const empty = {
        x: box.x + box.width + perCount * 5.5,
        y: box.y + box.height / 2,
    };
    return { bar, box, perCount, empty };
}

const expectPlayheadNear = async (page: Page, x: number, within: number) =>
    expect
        .poll(async () => Math.abs((await playheadX(page)) - x))
        .toBeLessThanOrEqual(within);

const tapOn = async (page: Page, locator: Locator) => {
    const box = (await locator.boundingBox())!;
    await tap(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
};

// #1288 follow-up: a click on empty lane space moves the playhead, as on the audio lane; a click
// on a bar picks the cue and selects its counts, as a click on a move's clip does
test("a click on empty lane space moves the playhead there; a click on the bar selects its counts", async ({
    show,
}) => {
    const { page } = show;
    const { bar, box, perCount, empty } = await laneSpots(page);
    await page.mouse.click(empty.x, empty.y);
    await expectPlayheadNear(page, empty.x, perCount / 2 + 1);

    await bar.click();
    await expect(bar).toHaveClass(/ring-accent/);
    // The window is the cue's counts: the playhead at its end
    await expectPlayheadNear(page, box.x + box.width, 3);
    expect(await savedLength(show)).toBe(2);
});

test("a finger's tap on empty lane space moves the playhead there; a tap on the bar selects its counts", async ({
    show,
}) => {
    const { page } = show;
    const { bar, box, perCount, empty } = await laneSpots(page);
    const stop = await emulateTouchScreen(page);
    try {
        await tap(page, empty);
        await expectPlayheadNear(page, empty.x, perCount / 2 + 1);

        await tapOn(page, bar);
        await expect(bar).toHaveClass(/ring-accent/);
        await expectPlayheadNear(page, box.x + box.width, 3);
        expect(await savedLength(show)).toBe(2);
    } finally {
        await stop();
    }
});

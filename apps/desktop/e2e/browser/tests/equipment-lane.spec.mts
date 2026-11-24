import { test, expect, type Show } from "../fixtures.mjs";
import { waitForField, waitForIdle } from "../app.mjs";
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

import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures.mjs";
import {
    drawnMarchers,
    readField,
    waitForField,
    waitForIdle,
} from "../app.mjs";
import { savedPositions } from "../positions.mjs";
import { seedShowSql } from "../seed.mjs";

// The first press on the field after a paused preview only clears the
// preview (#202; #189 user story 60): nothing is selected or dragged from
// the frame it held. A user holds one only mid-scrub over playback, so the
// scenarios hold it through `window.openmarchPreview` (Playwright only).

// Two marchers trade places over page 1, a straight move from beat 1 to beat 9.
test.use({
    seedSql: seedShowSql({
        beats: 16,
        measureStarts: [1, 5, 9, 13],
        pageStarts: [1],
        marchers: [1, 2].map((id) => ({
            id,
            section: "Trumpet",
            prefix: "T",
            order: id,
        })),
        positions: [
            [
                [1, 400, 300],
                [2, 600, 300],
            ],
            [
                [1, 600, 300],
                [2, 400, 300],
            ],
        ],
    }),
});

/** Where the field draws each marcher now, by drill number. */
const shown = async (page: Page) =>
    Object.fromEntries(
        (await drawnMarchers(page)).map((m) => [
            m.drillNumber,
            { x: Math.round(m.x), y: Math.round(m.y) },
        ]),
    );

/** Holds a preview frame mid-move, and returns T1 as it's drawn there. */
async function holdPreview(page: Page) {
    await waitForField(page);
    await waitForIdle(page);
    const atPlayhead = await shown(page);
    // Halfway through the move: nobody is where they are at the playhead. The
    // stored moves load after the field, and loading them drops a held frame
    // (as any timeline edit does), so hold until it stays
    await expect(async () => {
        await page.evaluate(() => window.openmarchPreview!.hold(5));
        await expect
            .poll(async () => (await shown(page)).T1, { timeout: 1000 })
            .toEqual({ x: 500, y: 300 });
        await page.waitForTimeout(300);
        expect((await shown(page)).T1).toEqual({ x: 500, y: 300 });
    }).toPass();
    const t1 = (await drawnMarchers(page)).find((m) => m.drillNumber === "T1")!;
    return { atPlayhead, t1 };
}

test("the first press after a paused preview only clears it: it selects nothing", async ({
    show,
}) => {
    const { page } = show;
    const { atPlayhead, t1 } = await holdPreview(page);

    await page.mouse.click(t1.screen.x, t1.screen.y);
    await expect.poll(() => shown(page)).toEqual(atPlayhead);
    await page.waitForTimeout(300);
    expect((await readField(page)).selection).toEqual([]);

    // The next press is an ordinary click
    const back = (await drawnMarchers(page)).find(
        (m) => m.drillNumber === "T1",
    )!;
    await page.mouse.click(back.screen.x, back.screen.y);
    await expect
        .poll(async () => (await readField(page)).selection)
        .toEqual([back.id]);
});

test("a drag from a paused preview's frame moves no one", async ({ show }) => {
    const { page } = show;
    const pages = await show.query<{ id: number }>("SELECT id FROM pages");
    const saved = () =>
        Promise.all(pages.map(({ id }) => savedPositions(show, id)));
    const { atPlayhead, t1 } = await holdPreview(page);
    const before = await saved();

    await page.mouse.move(t1.screen.x, t1.screen.y);
    await page.mouse.down();
    await page.mouse.move(t1.screen.x + 80, t1.screen.y + 40, {
        steps: 10,
    });
    await page.mouse.up();
    await waitForIdle(page);

    await expect.poll(() => shown(page)).toEqual(atPlayhead);
    expect((await readField(page)).selection).toEqual([]);
    expect(await saved()).toEqual(before);
});

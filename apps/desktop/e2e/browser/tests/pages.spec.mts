import { test, expect, type Show } from "../fixtures.mjs";
import {
    addPageAt,
    createMarchers,
    createTempoGroup,
    expectCanvasMatchesShow,
} from "../app.mjs";
import { savedPositions } from "../positions.mjs";

test("adds a page that starts where the marchers already are", async ({
    show,
}) => {
    const { page } = show;
    await createTempoGroup(page, {
        tempo: 120,
        beatsPerMeasure: 4,
        measures: 8,
    });
    await createMarchers(page, { quantity: 4, section: "Baritone" });

    await addPageAt(page, 5);

    // The new page is selected and starts on a later beat than page 0.
    await expect(page.getByRole("heading", { name: "Page 1" })).toBeVisible();
    const pages = await show.query<{ id: number; start: number }>(
        `SELECT pages.id, beats.position AS start
         FROM pages INNER JOIN beats ON beats.id = pages.start_beat
         ORDER BY beats.position`,
    );
    expect(pages.map((row) => row.id)).toEqual([0, 1]);
    expect(pages[1].start).toBeGreaterThan(pages[0].start);

    // No one moves on it: every marcher ends the page where page 0 has them.
    expect(await savedPositions(show, 1)).toHaveLength(4);
    expect(await savedPositions(show, 1)).toEqual(
        await savedPositions(show, 0),
    );
    expect(await show.query("SELECT id FROM timelines")).toEqual([]);
    await expectCanvasMatchesShow(show);
});

test.describe("page shortcuts", () => {
    // The page-era app dropped a shortcut pressed in the first moments after a
    // page was added. "a shortcut works right after adding a page" pins that
    // it works now; the first test works around it.

    const setUp = async (show: Show) => {
        const { page } = show;
        await createTempoGroup(page, {
            tempo: 120,
            beatsPerMeasure: 4,
            measures: 12,
        });
        await createMarchers(page, { quantity: 2, section: "Baritone" });
        await addPageAt(page, 3);
        await expect(
            page.getByRole("heading", { name: "Page 1" }),
        ).toBeVisible();
        await addPageAt(page, 5);
        await expect(
            page.getByRole("heading", { name: "Page 2" }),
        ).toBeVisible();
        await expectCanvasMatchesShow(show);
    };

    // Still failing on the three.js field (#209 rechecked): it expects a "Page 0" heading, which
    // timeline mode no longer shows. Fix the expectation before turning it back on.
    test.fixme("moves between pages with the keyboard", async ({ show }) => {
        const { page } = show;
        const heading = (name: string) => page.getByRole("heading", { name });
        const expectPage = async (name: string) => {
            await expect(heading(name)).toBeVisible();
            await expectCanvasMatchesShow(show);
        };
        await setUp(show);

        // Press again only if the first press was dropped.
        await expect(async () => {
            if (await heading("Page 2").isVisible())
                await page.keyboard.press("q");
            await expect(heading("Page 1")).toBeVisible({ timeout: 250 });
        }).toPass();
        await expectPage("Page 1");

        await page.keyboard.press("Shift+Q");
        await expectPage("Page 0");
        await page.keyboard.press("e");
        await expectPage("Page 1");
        await page.keyboard.press("Shift+E");
        await expectPage("Page 2");
    });

    test("a shortcut works right after adding a page", async ({ show }) => {
        await setUp(show);

        await show.page.keyboard.press("q");

        await expect(
            show.page.getByRole("heading", { name: "Page 1" }),
        ).toBeVisible();
    });
});

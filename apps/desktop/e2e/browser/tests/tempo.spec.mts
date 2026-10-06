import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures.mjs";
import { createTempoGroup } from "../app.mjs";

type Beat = { position: number; duration: number };
const beats = "SELECT position, duration FROM beats ORDER BY position";

test("adds a tempo group", async ({ show }) => {
    await createTempoGroup(show.page, {
        name: "A",
        tempo: 120,
        beatsPerMeasure: 4,
        measures: 4,
    });

    // The new group is listed in the Music sidebar.
    await show.page.locator("#sidebar-launcher-music").click();
    await expect(show.page.getByText("m 1-4 (4x)")).toBeVisible();

    // A blank show has one zero-length beat for the first page to start on.
    await expect.poll(() => show.query(beats)).toHaveLength(17);
    const [start, ...added] = await show.query<Beat>(beats);
    expect(start).toEqual({ position: 0, duration: 0 });
    // 120 bpm is half a second per beat.
    expect(added.map((beat) => beat.duration)).toEqual(Array(16).fill(0.5));

    const measures = await show.query(
        `SELECT beats.position AS start, measures.rehearsal_mark
         FROM measures INNER JOIN beats ON beats.id = measures.start_beat
         ORDER BY beats.position`,
    );
    expect(measures).toEqual([
        { start: 1, rehearsal_mark: "A" },
        { start: 5, rehearsal_mark: null },
        { start: 9, rehearsal_mark: null },
        { start: 13, rehearsal_mark: null },
    ]);
});

test("adds a second tempo group after the first", async ({ show }) => {
    const { page } = show;
    await createTempoGroup(page, {
        tempo: 120,
        beatsPerMeasure: 4,
        measures: 2,
    });
    await expect.poll(() => show.query(beats)).toHaveLength(9);
    await createTempoGroup(page, {
        tempo: 180,
        beatsPerMeasure: 3,
        measures: 2,
    });
    await expect.poll(() => show.query(beats)).toHaveLength(15);

    const durations = (await show.query<Beat>(beats))
        .slice(1)
        .map((beat) => Math.round(beat.duration * 1000) / 1000);
    expect(durations).toEqual([
        ...Array(8).fill(0.5),
        // 180 bpm is a third of a second per beat.
        ...Array(6).fill(0.333),
    ]);
    expect(await show.query("SELECT id FROM measures")).toHaveLength(4);
});

/**
 * The card for a tempo group in the Music sidebar, found by its measure range
 * (e.g. "m 1-4 (4x)"). Its icon buttons have no accessible names; in order
 * they are delete, add after, and edit.
 */
async function tempoGroupCard(page: Page, measures: string) {
    const music = page.locator("#sidebar-launcher-music");
    const range = page.getByText(measures, { exact: true });
    if (!(await range.isVisible())) await music.click();
    return page
        .locator("div")
        .filter({ has: range })
        .filter({ has: page.getByRole("button") })
        .last();
}

test("changes a tempo group's tempo, then undoes it", async ({ show }) => {
    const { page } = show;
    await createTempoGroup(page, {
        tempo: 120,
        beatsPerMeasure: 4,
        measures: 4,
    });
    await expect.poll(() => show.query(beats)).toHaveLength(17);

    const card = await tempoGroupCard(page, "m 1-4 (4x)");
    await card.getByRole("button").last().click();
    const form = page
        .locator("form")
        .filter({ has: page.locator("#start-tempo-input") });
    await form.locator("#start-tempo-input").fill("90");
    await form.getByRole("button", { name: "Save Changes" }).click();

    // 90 bpm is two thirds of a second per beat.
    const durations = async () =>
        (await show.query<Beat>(beats))
            .slice(1)
            .map((beat) => Math.round(beat.duration * 1000) / 1000);
    await expect.poll(durations).toEqual(Array(16).fill(0.667));

    await page.locator("#sidebar-launcher-music").click();
    await page.keyboard.press("Control+z");
    await expect.poll(durations).toEqual(Array(16).fill(0.5));
});

test("deletes a tempo group, then undoes it", async ({ show }) => {
    const { page } = show;
    await createTempoGroup(page, {
        tempo: 120,
        beatsPerMeasure: 4,
        measures: 4,
    });
    await expect.poll(() => show.query(beats)).toHaveLength(17);

    const card = await tempoGroupCard(page, "m 1-4 (4x)");
    await card.getByRole("button").first().click();
    await page
        .getByRole("button", {
            name: "Delete all measures and their associated pages",
        })
        .click();

    await expect.poll(() => show.query("SELECT id FROM measures")).toEqual([]);

    await page.locator("#sidebar-launcher-music").click();
    await page.keyboard.press("Control+z");
    await expect
        .poll(async () => (await show.query("SELECT id FROM measures")).length)
        .toBe(4);
    expect(await show.query(beats)).toHaveLength(17);
});

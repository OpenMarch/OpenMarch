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

import { test, expect } from "../fixtures.mjs";
import { createMarchers, waitForIdle } from "../app.mjs";

// #212: `savedPositions` reads the timeline tables in several statements. Read
// one by one, an edit the app committed between two of them mixed two states
// of the file, and the resolver threw "transition N not found". A snapshot
// read must see one state, whatever the app commits meanwhile.
test("a snapshot read doesn't see edits committed during it", async ({
    show,
}) => {
    const marcherCount = async (query: typeof show.query) =>
        (
            await query<{ count: number }>(
                "SELECT COUNT(*) AS count FROM marchers",
            )
        )[0].count;
    const before = await marcherCount(show.query);

    const [first, second] = await show.readSnapshot(async (query) => {
        const first = await marcherCount(query);
        await createMarchers(show.page, { quantity: 2, section: "Trumpet" });
        await waitForIdle(show.page);
        return [first, await marcherCount(query)];
    });

    expect(first).toBe(before);
    expect(second).toBe(before);
    // The edit itself was saved: a read after it sees it.
    expect(await marcherCount(show.query)).toBe(before + 2);
});

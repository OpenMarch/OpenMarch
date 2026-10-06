import { test, expect, type Show } from "../fixtures.mjs";
import {
    drawnMarchers,
    expectCanvasMatchesShow,
    marcherRowAction,
} from "../app.mjs";

// Three trumpets on two pages.
test.use({
    seedSql: [
        `INSERT INTO beats (id, duration, position)
         VALUES ${Array.from({ length: 16 }, (_, i) => `(${i + 1}, 0.5, ${i + 1})`).join(", ")}`,
        `INSERT INTO pages (id, start_beat) VALUES (1, 8)`,
        `INSERT INTO marchers (id, section, drill_prefix, drill_order)
         VALUES (1, 'Trumpet', 'T', 1), (2, 'Trumpet', 'T', 2), (3, 'Trumpet', 'T', 3)`,
        `INSERT INTO marcher_pages (marcher_id, page_id, x, y)
         VALUES (1, 0, 500, 300), (2, 0, 600, 300), (3, 0, 700, 300),
                (1, 1, 500, 400), (2, 1, 600, 400), (3, 1, 700, 400)`,
    ],
});

const marchers = (show: Show) =>
    show.query(
        "SELECT id, drill_prefix || drill_order AS drill FROM marchers ORDER BY id",
    );
const allPositions = (show: Show) =>
    show.query(
        "SELECT marcher_id, page_id, x, y FROM marcher_pages ORDER BY page_id, marcher_id",
    );

test("deleting a marcher removes it from every page, and undo brings it back", async ({
    show,
}) => {
    const { page } = show;
    await expectCanvasMatchesShow(show);
    const marchersBefore = await marchers(show);
    const positionsBefore = await allPositions(show);

    await marcherRowAction(page, "T2", "Delete");
    // The list stages the deletion until it's saved.
    await expect(
        page.locator("#marcherListForm").getByText("T2", { exact: true }),
    ).toBeHidden();
    expect(await marchers(show)).toEqual(marchersBefore);
    await page.getByRole("button", { name: "Save Changes" }).click();
    const warning = page.getByRole("alertdialog", { name: "Warning" });
    await expect(warning).toContainText(
        "You are about to delete these marchers: T2.",
    );
    await warning.getByRole("button", { name: "Delete" }).click();

    await expect
        .poll(() => marchers(show))
        .toEqual(marchersBefore.filter((row) => row.drill !== "T2"));
    expect(
        await show.query("SELECT id FROM marcher_pages WHERE marcher_id = 2"),
    ).toEqual([]);
    await expect
        .poll(async () => (await drawnMarchers(page)).map((m) => m.drillNumber))
        .toEqual(["T1", "T3"]);
    await expectCanvasMatchesShow(show);

    await page.locator("#sidebar-launcher-marchers").click();
    await page.keyboard.press("Control+z");

    await expect.poll(() => marchers(show)).toEqual(marchersBefore);
    expect(await allPositions(show)).toEqual(positionsBefore);
    await expectCanvasMatchesShow(show);
});

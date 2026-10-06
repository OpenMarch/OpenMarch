import { test, expect } from "../fixtures.mjs";
import { createMarchers, expectCanvasMatchesShow } from "../app.mjs";

test("creates marchers in a section", async ({ show }) => {
    await createMarchers(show.page, { quantity: 8, section: "Baritone" });

    const marchers = await show.query(
        "SELECT section, drill_prefix, drill_order FROM marchers ORDER BY drill_order",
    );
    expect(marchers).toEqual(
        Array.from({ length: 8 }, (_, i) => ({
            section: "Baritone",
            drill_prefix: "B",
            drill_order: i + 1,
        })),
    );
    // Each marcher gets a position on the only page.
    expect(
        await show.query(
            "SELECT marcher_id FROM marcher_pages WHERE page_id = 0",
        ),
    ).toHaveLength(8);
    await expectCanvasMatchesShow(show);
});

test("continues drill numbers when adding to a section", async ({ show }) => {
    await createMarchers(show.page, { quantity: 2, section: "Baritone" });
    await createMarchers(show.page, { quantity: 3, section: "Baritone" });
    await createMarchers(show.page, { quantity: 2, section: "Trumpet" });

    const drillNumbers = (
        await show.query<{ drill_number: string }>(
            "SELECT drill_prefix || drill_order AS drill_number FROM marchers ORDER BY id",
        )
    ).map((row) => row.drill_number);
    expect(drillNumbers).toEqual(["B1", "B2", "B3", "B4", "B5", "T1", "T2"]);
    await expectCanvasMatchesShow(show);
});

test("lists created marchers in the sidebar", async ({ show }) => {
    const { page } = show;
    await createMarchers(page, { quantity: 3, section: "Baritone" });

    await page.locator("#sidebar-launcher-marchers").click();
    const list = page.locator("#marcherListForm");
    for (const drillNumber of ["B1", "B2", "B3"])
        await expect(
            list.getByText(drillNumber, { exact: true }),
        ).toBeVisible();
});

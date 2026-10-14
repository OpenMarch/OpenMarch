import { test, expect } from "../fixtures.mjs";

test("opens a blank show", async ({ show }) => {
    const { page } = show;

    await expect(page.getByRole("heading", { name: "Page 0" })).toBeVisible();
    await expect(page.getByTestId("timeline-initial-page")).toHaveAttribute(
        "aria-pressed",
        "true",
    );
    expect(await show.query("SELECT id FROM timelines")).toEqual([]);
});

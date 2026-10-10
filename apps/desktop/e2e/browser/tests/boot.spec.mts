import { test, expect } from "../fixtures.mjs";

test("opens a blank show", async ({ show }) => {
    const { page } = show;

    await expect(page.getByRole("button", { name: "Page 0" })).toBeVisible();
    await expect(page.locator("#pages")).toContainText("0");
});

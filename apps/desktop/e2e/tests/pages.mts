import { test } from "e2e/fixtures.mjs";
import { expect } from "playwright/test";

test("First page is visible", async ({ electronApp }) => {
    const { page } = electronApp;

    await expect(page.getByRole("button", { name: "Page 0" })).toBeVisible();
    await expect(page.getByLabel("First page")).toContainText("0");
});

test("Create new page with no new beats", async ({ electronApp }) => {
    const { page } = electronApp;

    await expect(page.locator("#pages")).not.toContainText("1");
    await page.locator("#pages").getByRole("button").click();
    await expect(page.locator("#pages")).toContainText("1");

    await expect(
        page.locator("#app"),
        "New page should be selected immediately",
    ).toContainText("Page 1");

    // Switch back and forth between pages
    await page.getByLabel("First page").click();
    await expect(page.locator("#app")).toContainText("Page 0");
    await expect(page.getByRole("heading")).not.toContainText("Page 1");
    await page.locator("div").filter({ hasText: /^1$/ }).first().click();
    await expect(page.getByRole("heading")).toContainText("Page 1");
    await expect(page.locator("#app")).not.toContainText("Page 0");
});

// TODO - deleting pages, last page, and subsets

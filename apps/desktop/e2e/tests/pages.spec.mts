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
    await page.waitForTimeout(1000);
    await expect(page.locator("#pages")).toContainText("0");
    for (const pageName of ["1", "2"])
        await expect(page.locator("#pages")).not.toContainText(pageName);

    await page.locator("#pages").getByRole("button").click();
    await expect(page.locator("#pages")).toContainText("1");
    await expect(
        page.locator("#app"),
        "New page 1 should be selected immediately",
    ).toContainText("Page 1");
    for (const pageName of ["0", "1"])
        await expect(page.locator("#pages")).toContainText(pageName);

    await page.locator("#pages").getByRole("button").click();
    await expect(page.locator("#pages")).toContainText("2");
    await expect(
        page.locator("#app"),
        "New page 2 should be selected immediately",
    ).toContainText("Page 2");
    for (const pageName of ["0", "1", "2"])
        await expect(page.locator("#pages")).toContainText(pageName);

    // Switch back and forth between pages
    await page.getByLabel("First page").click();
    await expect(page.locator("#app")).toContainText("Page 0");
    await expect(page.getByRole("heading")).not.toContainText("Page 1");
    await page.locator("div").filter({ hasText: /^1$/ }).first().click();
    await expect(page.getByRole("heading")).toContainText("Page 1");
    await expect(page.locator("#app")).not.toContainText("Page 0");
});

test("Create page and turn into a subset", async ({ electronApp }) => {
    const { page } = electronApp;

    // create 2 pages

    await page.locator("#pages").getByRole("button").click();
    await page.locator("#pages").getByRole("button").click();
    for (const pageName of ["0", "1", "2"])
        await expect(page.locator("#pages")).toContainText(pageName);

    // select page 1
    await page.locator("div").filter({ hasText: /^1$/ }).first().click();

    await expect(page.getByRole("heading")).toContainText("Page 1");
    await page.getByRole("switch", { name: "Subset" }).click();
    await expect(page.getByRole("heading")).toContainText("Page 0A");
    await expect(page.getByRole("heading")).not.toContainText("Page 1");
    for (const pageName of ["0", "0A", "1"])
        await expect(page.locator("#pages")).toContainText(pageName);

    // turn back into a page
    await page.getByRole("switch", { name: "Subset" }).click();
    await expect(page.getByRole("heading")).toContainText("Page 1");
    await expect(page.getByRole("heading")).not.toContainText("Page 0A");
    for (const pageName of ["0", "1", "2"])
        await expect(page.locator("#pages")).toContainText(pageName);

    // select page 2
    await page.locator("div").filter({ hasText: /^2$/ }).first().click();
    await expect(page.getByRole("heading")).toContainText("Page 2");
    await page.getByRole("switch", { name: "Subset" }).click();
    await expect(page.getByRole("heading")).toContainText("Page 1A");
    await expect(page.getByRole("heading")).not.toContainText("Page 2");

    for (const pageName of ["0", "1", "1A"])
        await expect(page.locator("#pages")).toContainText(pageName);

    // Turn page 1 into a subset
    await page.locator("div").filter({ hasText: /^1$/ }).first().click({
        button: "right",
    });
    await page.getByRole("switch").click();
    await page.locator("html").click();
    for (const pageName of ["0", "0A", "0B"])
        await expect(page.locator("#pages")).toContainText(pageName);

    // create 2 more pages
    await page.locator("#pages").getByRole("button").click();
    await page.locator("#pages").getByRole("button").click();

    // Turn them both into subsets
    await page.getByRole("switch").click();
    await page.locator("html").click();
    await page.locator("div").filter({ hasText: /^1$/ }).first().click({
        button: "right",
    });
    await page.getByRole("switch").click();
    for (const pageName of ["0", "0A", "0B", "0C", "0D"])
        await expect(page.locator("#pages")).toContainText(pageName);
    await page.locator("html").click();

    // Turn page 0A back into a page
    await page.locator("div").filter({ hasText: /^0A$/ }).first().click();
    await page.getByRole("switch").click();
    for (const pageName of ["0", "1", "1A", "1B", "1C"])
        await expect(page.locator("#pages")).toContainText(pageName);
    await page.locator("html").click();
});

test("Delete page", async ({ electronApp }) => {
    const { page } = electronApp;

    await page.locator("#pages").getByRole("button").click();
    await page.locator("#pages").getByRole("button").click();
    await page.locator("#pages").getByRole("button").click();

    for (const pageName of ["0", "1", "2", "3"])
        await expect(page.locator("#pages")).toContainText(pageName);

    // Delete page 3
    await page.locator("div").filter({ hasText: /^3$/ }).first().click();
    await page.locator("div").filter({ hasText: /^3$/ }).first().click({
        button: "right",
    });
    await page.getByRole("button").click();
    for (const pageName of ["0", "1", "2"])
        await expect(page.locator("#pages")).toContainText(pageName);
    await expect(page.locator("#pages")).not.toContainText("3");

    // Delete page 1
    await page.locator("div").filter({ hasText: /^1$/ }).first().click();
    await page.locator("div").filter({ hasText: /^1$/ }).first().click({
        button: "right",
    });
    await page.getByRole("button").click();
    for (const pageName of ["0", "1"]) // page is renamed to 1
        await expect(page.locator("#pages")).toContainText(pageName);
    await expect(page.locator("#pages")).not.toContainText("2");
});

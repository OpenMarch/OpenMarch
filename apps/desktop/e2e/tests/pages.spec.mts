import { test } from "e2e/fixtures.mjs";
import { expect, Page } from "playwright/test";

export const createNewPage = async (page: Page) => {
    // Extract only the Pages section from the snapshot
    const snapshotBefore = await page.locator("#timeline").ariaSnapshot();

    // Find the Pages section (from "paragraph: Pages" to next "paragraph:" or end)
    const pagesMatch = snapshotBefore.match(
        /- paragraph: Pages(.*?)(?=- paragraph:|$)/s,
    );
    if (!pagesMatch) throw new Error("Pages section not found");

    const pagesSection = pagesMatch[1];

    const firstPageNamePattern = /"First page": "(\w*)"/;
    const firstPageNameMatch = pagesSection.match(firstPageNamePattern);
    const firstPageName = firstPageNameMatch ? firstPageNameMatch[1] : null;
    if (!firstPageName) throw new Error("First page name not found");

    const pageNamesBefore: string[] = [firstPageName];

    // Pattern handles various formats:
    // - text: "0 1 2" or - text: 0 1 2 (with newlines)
    // Pages- text: 0 1- button (without newlines)
    const allPageNamesPattern = /- text: "?([^"\n]+?)"?(?=\n|- |$)/g;
    const textMatches = pagesSection.matchAll(allPageNamesPattern);

    for (const match of textMatches) {
        const text = match[1].trim();
        // If the text contains spaces, it's multiple pages in one string
        if (text.includes(" ")) {
            pageNamesBefore.push(...text.split(/\s+/));
        } else {
            // Single page name
            pageNamesBefore.push(text);
        }
    }

    const lastPageNameBefore = pageNamesBefore[pageNamesBefore.length - 1];
    const lastPageNumber = parseInt(
        lastPageNameBefore.match(/^\d+/)?.[0] ?? "",
    );

    // create new page
    await page.locator("#pages").getByRole("button").click();

    const expectedNewPageName = lastPageNumber + 1;
    await expect(page.locator("#pages")).toContainText(
        expectedNewPageName.toString(),
    );
};

test("First page is visible", async ({ electronApp }) => {
    const { page } = electronApp;

    await expect(page.getByRole("button", { name: "Page 0" })).toBeVisible();
    await expect(page.getByLabel("First page")).toContainText("0");
});

test("Create new page with no new beats", async ({ electronApp }) => {
    const { page } = electronApp;

    await expect(page.locator("#pages")).not.toContainText("1");
    await expect(page.locator("#pages")).toContainText("0");
    for (const pageName of ["1", "2"])
        await expect(page.locator("#pages")).not.toContainText(pageName);

    await createNewPage(page);
    await expect(page.locator("#pages")).toContainText("1");
    await expect(
        page.locator("#app"),
        "New page 1 should be selected immediately",
    ).toContainText("Page 1");
    for (const pageName of ["0", "1"])
        await expect(page.locator("#pages")).toContainText(pageName);

    await createNewPage(page);
    await expect(page.locator("#pages")).toContainText("2");
    await expect(
        page.locator("#app"),
        "New page 2 should be selected immediately",
    ).toContainText("Page 2");
    for (const pageName of ["0", "1", "2"])
        await expect(page.locator("#pages")).toContainText(pageName);

    // Switch back and forth between pages
    await page.getByLabel("First page").click();
    await expect(page.getByRole("button", { name: "Page 0" })).toBeVisible();
    await expect(
        page.getByRole("button", { name: "Page 1" }),
    ).not.toBeVisible();
    await page.locator("div").filter({ hasText: /^1$/ }).first().click();
    await expect(page.getByRole("button", { name: "Page 1" })).toBeVisible();
    await expect(page.locator("#app")).not.toContainText("Page 0");
});

test("Create page and turn into a subset", async ({ electronApp }) => {
    const { page } = electronApp;

    // create 2 pages
    await createNewPage(page);
    await createNewPage(page);
    for (const pageName of ["0", "1", "2"])
        await expect(page.locator("#pages")).toContainText(pageName);

    // select page 1
    await page.locator("div").filter({ hasText: /^1$/ }).first().click();

    await expect(page.getByRole("button", { name: "Page 1" })).toBeVisible();
    await page.getByRole("switch", { name: "Subset" }).click();
    await expect(page.getByRole("button", { name: "Page 0A" })).toBeVisible();
    await expect(
        page.getByRole("button", { name: "Page 1" }),
    ).not.toBeVisible();
    for (const pageName of ["0", "0A", "1"])
        await expect(page.locator("#pages")).toContainText(pageName);

    // turn back into a page
    await page.getByRole("switch", { name: "Subset" }).click();
    await expect(page.getByRole("button", { name: "Page 1" })).toBeVisible();
    await expect(
        page.getByRole("button", { name: "Page 0A" }),
    ).not.toBeVisible();
    for (const pageName of ["0", "1", "2"])
        await expect(page.locator("#pages")).toContainText(pageName);

    // select page 2
    await page.locator("div").filter({ hasText: /^2$/ }).first().click();
    await expect(page.getByRole("button", { name: "Page 2" })).toBeVisible();
    await page.getByRole("switch", { name: "Subset" }).click();
    await expect(page.getByRole("button", { name: "Page 1A" })).toBeVisible();
    await expect(
        page.getByRole("button", { name: "Page 2" }),
    ).not.toBeVisible();

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
    await createNewPage(page);
    await createNewPage(page);

    // Turn them both into subsets
    await page.getByRole("switch").click();
    await page.locator("html").click();
    await page.locator("div").filter({ hasText: /^1$/ }).first().click({
        button: "right",
    });
    // await expect(page.getByText("Page 1ASubsetDelete")).toBeVisible();
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

    await createNewPage(page);
    await createNewPage(page);
    await createNewPage(page);

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

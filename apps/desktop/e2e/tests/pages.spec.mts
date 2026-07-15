import { test } from "../fixtures.mjs";
import { expect, type Page } from "playwright/test";
import fs from "fs-extra";
import initSqlJs from "sql.js";

const getPageStartPositions = async (databasePath: string) => {
    const SQL = await initSqlJs({
        locateFile: (file: string) => `./node_modules/sql.js/dist/${file}`,
    });
    const db = new SQL.Database(fs.readFileSync(databasePath));
    const result = db.exec(`
        SELECT pages.id, beats.position
        FROM pages
        INNER JOIN beats ON pages.start_beat = beats.id
        ORDER BY beats.position ASC
    `);
    db.close();

    return (result[0]?.values ?? []).map(([id, position]) => ({
        id: Number(id),
        position: Number(position),
    }));
};

export const createNewPage = async (page: Page) => {
    const pagesTextBefore = (await page.locator("#pages").textContent()) ?? "";
    let pageNamesBefore: string[] = pagesTextBefore.match(/\d+[A-Z]?/g) ?? [];

    // Fallback for cases where text content is not exposed on #pages.
    if (pageNamesBefore.length === 0) {
        const snapshotBefore = await page.locator("#timeline").ariaSnapshot();
        pageNamesBefore = Array.from(
            snapshotBefore.matchAll(
                /listitem(?:\s+"[^"]*")?[^\n]*\n\s*-\s*(?:generic|text)[^\n]*:\s*"?(\d+[A-Z]?)"?/g,
            ),
            (match) => match[1] ?? "",
        ).filter(Boolean);

        if (pageNamesBefore.length === 0) {
            const pagesBlock = snapshotBefore.match(/Pages([\s\S]*?)(Audio|$)/);
            pageNamesBefore = Array.from(
                (pagesBlock?.[1] ?? "").matchAll(
                    /(?:^|[^A-Za-z0-9])(\d+[A-Z]?)(?=[^A-Za-z0-9]|$)/g,
                ),
                (match) => match[1] ?? "",
            ).filter(Boolean);
        }
    }

    if (pageNamesBefore.length === 0) pageNamesBefore = ["0"];

    const lastPageNameBefore = pageNamesBefore[pageNamesBefore.length - 1];
    if (!lastPageNameBefore) throw new Error("Unable to determine last page");
    const lastPageNumber = parseInt(
        lastPageNameBefore.match(/^\d+/)?.[0] ?? "",
    );

    const expectedNewPageName = lastPageNumber + 1;
    const pagesLocator = page.locator("#pages");
    const addPageButton = pagesLocator.getByRole("button");

    await expect(addPageButton).toBeVisible();
    await addPageButton.click();

    await expect(pagesLocator).toContainText(expectedNewPageName.toString(), {
        timeout: 15_000,
    });
    await expect(page.locator("#app")).toContainText(
        `Page ${expectedNewPageName}`,
        { timeout: 10_000 },
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
    await page.getByRole("button", { name: "In Place" }).click();
    for (const pageName of ["0", "1", "2"])
        await expect(page.locator("#pages")).toContainText(pageName);
    await expect(page.locator("#pages")).not.toContainText("3");

    // Delete page 1
    await page.locator("div").filter({ hasText: /^1$/ }).first().click();
    await page.locator("div").filter({ hasText: /^1$/ }).first().click({
        button: "right",
    });
    await page.getByRole("button", { name: "In Place" }).click();
    for (const pageName of ["0", "1"]) // page is renamed to 1
        await expect(page.locator("#pages")).toContainText(pageName);
    await expect(page.locator("#pages")).not.toContainText("2");
});

test("Delete page with yank", async ({ electronApp }) => {
    const { databasePath, page } = electronApp;

    await createNewPage(page);
    await createNewPage(page);
    await createNewPage(page);
    await createNewPage(page);

    for (const pageName of ["0", "1", "2", "3", "4"])
        await expect(page.locator("#pages")).toContainText(pageName);

    const positionsBeforeDelete = await getPageStartPositions(databasePath);
    expect(positionsBeforeDelete.length).toBe(5);

    const pageToDelete = positionsBeforeDelete[2];
    const nextPage = positionsBeforeDelete[3];
    const yankLength = nextPage.position - pageToDelete.position;

    await page.locator("div").filter({ hasText: /^2$/ }).first().click();
    await page.locator("div").filter({ hasText: /^2$/ }).first().click({
        button: "right",
    });
    await page.getByRole("button", { name: "Yank" }).click();

    await expect(page.locator("#pages")).not.toContainText("4");
    for (const pageName of ["0", "1", "2", "3"])
        await expect(page.locator("#pages")).toContainText(pageName);

    await expect
        .poll(() => getPageStartPositions(databasePath))
        .toEqual([
            ...positionsBeforeDelete.slice(0, 2),
            ...positionsBeforeDelete.slice(3).map((pagePosition) => ({
                ...pagePosition,
                position: pagePosition.position - yankLength,
            })),
        ]);
});

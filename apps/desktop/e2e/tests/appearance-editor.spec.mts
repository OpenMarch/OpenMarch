import { expect } from "@playwright/test";
import { test } from "../fixtures.mjs";
import { createMarchers } from "../utils/marchers.mjs";

test("Navigate through appearance menu", async ({ electronApp }) => {
    const { page } = electronApp;

    await page.locator("#sidebar-launcher-marcher-appearance").click();
    await expect(
        page.getByRole("heading", { name: "Marcher Appearance" }),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Section" }).click();
    await page.getByText("Add Section Style").click();
    await expect(page.getByRole("menuitem", { name: "Piccolo" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "All" })).toBeVisible();

    await page.locator("html").click();
    await page.getByRole("tab", { name: "Tag" }).click();
    await expect(
        page.getByLabel("Tag").getByRole("heading", { name: "Page" }),
    ).toBeVisible();
    await expect(page.getByText("None", { exact: true })).toBeVisible();

    // close the appearance modal
    await page.locator("body").press("Escape");
    await expect(
        page.getByRole("heading", { name: "Marcher Appearance" }),
    ).not.toBeVisible();
});

test("Create tags on marchers", async ({ electronApp }) => {
    const { page } = electronApp;

    await createMarchers(page, 25, "Piccolo");

    await page.locator("body").press("ControlOrMeta+a");

    // Create a new tag with a name
    await page
        .getByRole("button", { name: "Create new tag with selected" })
        .click();
    await page
        .getByRole("textbox", { name: "Define a name for the new tag" })
        .fill("cool tag");
    await page.getByRole("button", { name: "Create Tag" }).click();

    // Create a new tag without a name
    await page
        .getByRole("button", { name: "Create new tag with selected" })
        .click();
    await page
        .getByRole("textbox", { name: "Define a name for the new tag" })
        .fill("");
    await page.getByRole("button", { name: "Create Tag" }).click();

    // Verify the tags were created
    await expect(page.getByText("cool tag")).toBeVisible();
    await expect(page.getByText("tag-")).toBeVisible();

    // Remove the tags from the marchers
    await page
        .getByRole("button", { name: "Remove selected marchers from" })
        .click();
    await page.getByRole("dialog").getByText("tag-").click();
    await expect(page.getByText("tag-")).not.toBeVisible();

    // add the tags back to the marchers
    await page
        .getByRole("button", { name: "Add selected marchers to" })
        .click();
    await page.getByText("tag-").click();
    await expect(page.getByText("tag-")).toBeVisible();

    // The context menus should work
    for (const tag of ["tag-", "cool tag"]) {
        await page.getByText(tag).click();
        await expect(
            page.locator("div").filter({ hasText: /^Rename tag$/ }),
        ).toBeVisible();
        await expect(page.getByText("Edit appearance")).toBeVisible();
        await expect(page.getByText("Delete tag")).toBeVisible();
    }

    // Rename the tags
    await page.getByText("Rename tag").click();
    await page
        .getByRole("textbox", { name: "Rename tag" })
        .fill("even cooler tag");
    await page.getByRole("textbox", { name: "Rename tag" }).press("Enter");
    await expect(page.getByText("even cooler tag")).toBeVisible();
    await expect(page.getByText("cool tag")).not.toBeVisible();
    await page
        .locator("canvas")
        .nth(1)
        .click({
            position: {
                x: 0,
                y: 0,
            },
        });
    await page.locator("body").press("ControlOrMeta+a");
    await expect(page.getByText("even cooler tag")).toBeVisible();
    await expect(page.getByText("cool tag")).not.toBeVisible();

    // Delete the tags
    await expect(page.getByText("tag-")).toBeVisible();
    await page.getByText("tag-").click();
    await page.getByText("Delete tag").click();
    await expect(page.getByText("tag-")).not.toBeVisible();
    await expect(page.getByText("even cooler tag")).toBeVisible();
    await page.getByText("even cooler tag").click();
    await page.getByText("Delete tag").click();
    await expect(page.getByText("even cooler tag")).not.toBeVisible();
});

import { expect, Page } from "@playwright/test";

export const createMarchers = async (
    page: Page,
    numberOfMarchers: number,
    section: string = "Piccolo",
) => {
    await page.locator("#sidebar-launcher-marchers").click();
    await page.getByRole("button", { name: "Add" }).click();
    await page.getByRole("combobox", { name: "Other" }).click();
    await page.getByLabel(section).getByText(section).click();
    await page.getByRole("spinbutton", { name: "Quantity" }).click();
    await page
        .getByRole("spinbutton", { name: "Quantity" })
        .fill(numberOfMarchers.toString());
    await page.getByRole("button", { name: "Create Marcher Button" }).click();
    await expect(page.getByText("ListEdit Marchers")).toBeVisible();

    await page
        .locator("div")
        .filter({ hasText: "MarchersMarcher" })
        .nth(4)
        .press("Escape");
};

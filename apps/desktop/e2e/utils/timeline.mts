import { expect, type Page } from "@playwright/test";

/** Steps in the editor's timeline (TimelineModePanel), shared by the Electron specs. */

/** The page boxes on the timeline's ruler, by name ("0", "1", "1A", ...), in order. */
export const timelinePageNames = (page: Page): Promise<string[]> =>
    page
        .getByTestId("timeline-page-ruler")
        .getByRole("button", { name: /^Page / })
        .evaluateAll((buttons) =>
            buttons.map((button) =>
                (button.getAttribute("aria-label") ?? "").replace(/^Page /, ""),
            ),
        );

/** A page's box on the ruler. */
export const timelinePageBox = (page: Page, name: string) =>
    page
        .getByTestId("timeline-page-ruler")
        .getByRole("button", { name: `Page ${name}`, exact: true });

/** Selects a page by clicking its box on the ruler, and waits for the Inspector to show it. */
export async function selectTimelinePage(page: Page, name: string) {
    await timelinePageBox(page, name).click();
    await expect(
        page.getByRole("heading", { name: `Page ${name}`, exact: true }),
    ).toBeVisible();
}

/**
 * Adds a page flag at the start of a measure: moves the playhead there with
 * the timeline's Go to field, then presses the timeline's **+**. The new page
 * ends at that measure.
 */
export async function addPageFlagAt(page: Page, measure: number) {
    await page.getByTestId("timeline-readout").click();
    const goTo = page.getByRole("textbox", {
        name: "Go to a page, measure or rehearsal mark",
    });
    await goTo.fill(`m${measure}`);
    await goTo.press("Enter");
    await page.getByTestId("timeline-add-page-flag").click();
}

/** Opens a page box's menu (right-click) and picks an entry by its test id suffix. */
export async function timelinePageMenu(
    page: Page,
    name: string,
    entry: "delete-flag" | "delete-with-moves",
) {
    await timelinePageBox(page, name).click({ button: "right" });
    await page.getByTestId(`timeline-range-menu-${entry}`).click();
}

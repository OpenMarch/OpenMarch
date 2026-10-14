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

/**
 * Where to click a page box so the click lands on the box itself: the
 * timeline's **+** sits just right of the playhead and covers the box's
 * middle whenever the playhead stopped there (after playback, say).
 */
async function clearPointInPageBox(page: Page, name: string) {
    const box = await timelinePageBox(page, name).boundingBox();
    if (!box) return undefined;
    const plus = page.getByTestId("timeline-add-page-flag");
    const plusBox = (await plus.isVisible()) ? await plus.boundingBox() : null;
    const y = box.height / 2;
    if (!plusBox) return { x: box.width / 2, y };
    // The playhead line is 8px left of the +; keep clear of both.
    const blockedFrom = plusBox.x - 16 - box.x;
    const blockedTo = plusBox.x + plusBox.width + 4 - box.x;
    const x = [0.5, 0.25, 0.75, 0.15, 0.85]
        .map((fraction) => box.width * fraction)
        .find((candidate) => candidate < blockedFrom || candidate > blockedTo);
    return { x: x ?? box.width / 2, y };
}

/** Selects a page by clicking its box on the ruler, and waits for the Inspector to show it. */
export async function selectTimelinePage(page: Page, name: string) {
    await timelinePageBox(page, name).click({
        position: await clearPointInPageBox(page, name),
    });
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

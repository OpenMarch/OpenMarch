// cspell:ignore keyshortcuts
import { expect, type Page } from "@playwright/test";

/** Timeline steps on a show whose pages are moves, shared between specs. */

/** The timeline's page box that starts at `startBeat`. */
export const pageBox = (page: Page, startBeat: number) =>
    page
        .locator(
            `[data-timeline-range-page][data-timeline-range-start="${startBeat}"]`,
        )
        .first();

/** Selects the page whose box starts at `startBeat`, and waits for the field to show it. */
export async function goToPage(page: Page, startBeat: number) {
    const box = pageBox(page, startBeat);
    await box.scrollIntoViewIfNeeded();
    await box.click();
    await settled(page);
}

/** Waits until the field shows the same page and positions twice in a row. */
export async function settled(page: Page) {
    let last = "";
    await expect
        .poll(async () => {
            const now = await page.evaluate(() =>
                JSON.stringify([
                    window.fieldTest!.pageId(),
                    window.fieldTest!.marchers().map((m) => [m.x, m.y]),
                ]),
            );
            const same = now === last && now.length > 20;
            last = now;
            return same;
        })
        .toBe(true);
}

/** Isolates the move over the page box at `startBeat`, as double-clicking it does. */
export async function isolate(page: Page, startBeat: number) {
    const box = pageBox(page, startBeat);
    // The stored moves load after the field: until then a double-click finds none
    await expect(async () => {
        await box.scrollIntoViewIfNeeded();
        await box.dblclick();
        await expect(page.getByTestId("timeline-isolation-bar")).toBeVisible({
            timeout: 1000,
        });
    }).toPass();
}

/** The field's top-left corner area, where no marcher stands in the converted demo shows. */
export async function emptyField(page: Page) {
    const box = (await page.getByTestId("fieldCanvas").first().boundingBox())!;
    return { x: box.x + 12, y: box.y + 12 };
}

import { expect, type Page } from "@playwright/test";
import type { Show } from "./fixtures.mjs";

/** Steps a user takes in the app, shared between specs. */

export type DrawnMarcher = {
    id: number;
    drillNumber: string;
    /** Where the dot is drawn, in the units `marcher_pages` stores. */
    x: number;
    y: number;
    /** The dot's position in the viewport, for mouse actions. */
    screen: { x: number; y: number };
    /** False when the dot is scrolled out of the visible canvas. */
    onScreen: boolean;
};

/** Reads the marchers off the field canvas (`window.canvas`). */
export const drawnMarchers = (page: Page): Promise<DrawnMarcher[]> =>
    page.evaluate(() => {
        const canvas = window.canvas as any;
        const rect = canvas.upperCanvasEl.getBoundingClientRect();
        const [scaleX, , , scaleY, panX, panY] = canvas.viewportTransform;
        const cssScale = rect.width / canvas.width;
        return canvas.getCanvasMarchers().map((marcher: any) => {
            const center = marcher.getCenterPoint();
            const screen = {
                x: rect.x + (center.x * scaleX + panX) * cssScale,
                y: rect.y + (center.y * scaleY + panY) * cssScale,
            };
            return {
                id: marcher.marcherObj.id,
                drillNumber: marcher.marcherObj.drill_number,
                ...marcher.getDatabaseCoords(),
                screen,
                onScreen:
                    screen.x > rect.left &&
                    screen.x < rect.right &&
                    screen.y > rect.top &&
                    screen.y < rect.bottom,
            };
        });
    });

/** Screen pixels per field unit at the canvas's current zoom. */
export const canvasScale = (page: Page): Promise<number> =>
    page.evaluate(() => {
        const canvas = window.canvas as any;
        const rect = canvas.upperCanvasEl.getBoundingClientRect();
        return canvas.viewportTransform[0] * (rect.width / canvas.width);
    });

/** Adds marchers through the sidebar form, then closes the sidebar. */
export async function createMarchers(
    page: Page,
    { quantity, section }: { quantity: number; section: string },
) {
    const before = (await drawnMarchers(page)).length;

    await page.locator("#sidebar-launcher-marchers").click();
    await page.getByRole("button", { name: "Add" }).click();
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: section, exact: true }).click();
    await page
        .getByRole("spinbutton", { name: "Quantity" })
        .fill(`${quantity}`);
    await page.getByRole("button", { name: "Create Marcher Button" }).click();
    await page.locator("#sidebar-launcher-marchers").click();

    await expect
        .poll(async () => (await drawnMarchers(page)).length)
        .toBe(before + quantity);
}

/** Adds a tempo group through the Music sidebar, then closes the sidebar. */
export async function createTempoGroup(
    page: Page,
    {
        name,
        tempo,
        beatsPerMeasure,
        measures,
    }: {
        name?: string;
        tempo: number;
        beatsPerMeasure: number;
        measures: number;
    },
) {
    await page.locator("#sidebar-launcher-music").click();
    const form = page.locator("form").filter({ hasText: "Start Tempo" });
    // The form is already open in a show with no music; otherwise it's behind a button.
    const addGroup = page.getByRole("button", { name: "Add New Group" });
    await expect(form.or(addGroup)).toBeVisible();
    if (await addGroup.isVisible()) await addGroup.click();
    if (name) await form.locator("#name-input").fill(name);
    await form.locator("#start-tempo-input").fill(`${tempo}`);
    await form.locator("#bpm-input").fill(`${beatsPerMeasure}`);
    await form.locator("#repeats-input").fill(`${measures}`);
    await form.getByRole("button", { name: "Create" }).click();
    await page.locator("#sidebar-launcher-music").click();
}

/**
 * Waits until every marcher is drawn where the show file says it is on the
 * selected page. Call it after any step that changes positions or the page.
 */
export async function expectCanvasMatchesShow(show: Show) {
    const round = (value: number) => Math.round(value * 100) / 100;
    await expect
        .poll(async () => {
            const pageId = await show.page.evaluate(
                () => (window.canvas as any).currentPage.id as number,
            );
            const saved = (
                await show.query<{
                    id: number;
                    x: number;
                    y: number;
                }>(
                    "SELECT marcher_id AS id, x, y FROM marcher_pages WHERE page_id = ? ORDER BY marcher_id",
                    pageId,
                )
            ).map(({ id, x, y }) => ({ id, x: round(x), y: round(y) }));
            const drawn = (await drawnMarchers(show.page))
                .map(({ id, x, y }) => ({ id, x: round(x), y: round(y) }))
                .sort((a, b) => a.id - b.id);
            // On a mismatch the failure shows both sides.
            return JSON.stringify(drawn) === JSON.stringify(saved)
                ? "canvas matches the show file"
                : { pageId, drawn, saved };
        })
        .toBe("canvas matches the show file");
}

/** Clicks a marcher's dot; with `add`, adds it to the selection (Shift+click). */
export async function clickMarcher(
    page: Page,
    drillNumber: string,
    { add = false }: { add?: boolean } = {},
) {
    const marcher = (await drawnMarchers(page)).find(
        (drawn) => drawn.drillNumber === drillNumber,
    );
    if (!marcher?.onScreen)
        throw new Error(`${drillNumber} is not visible on the canvas`);
    if (add) await page.keyboard.down("Shift");
    await page.mouse.click(marcher.screen.x, marcher.screen.y);
    if (add) await page.keyboard.up("Shift");
}

/** The drill numbers of the marchers selected on the canvas. */
export const selectedDrillNumbers = (page: Page): Promise<string[]> =>
    page.evaluate(() =>
        (window.canvas as any)
            .getActiveObjects()
            .filter((object: any) => object.marcherObj)
            .map((object: any) => object.marcherObj.drill_number as string)
            .sort(),
    );

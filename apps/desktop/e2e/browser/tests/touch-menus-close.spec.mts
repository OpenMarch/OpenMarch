import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Locator, Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import { drawnMarchers, longPress, tap, waitForField } from "../app.mjs";
import { goToPage, pageBox } from "../timeline.mjs";

// Menus by touch (fork #928):
// - the field's long-press menu stays on screen even where it fits neither
//   below nor above the finger (it opens beside the finger and slides);
// - a finger's tap outside the timeline's page menu only closes it, as a
//   mouse click outside does: nothing under the tap hears it, and the next tap
//   can't land on an entry of a menu that should have gone;
// - a greyed entry's reason shows to a finger, from a tap or a long press.

const desktop = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
);

// A converted demo show: every page is a move
const SHOW = path.join(desktop, "view3d-web/public/demos/part1-demo.dots");
const PAGE_START = 53;

type Point = { x: number; y: number };

const chip = (page: Page) => page.getByTestId("timeline-page-menu-button");
const rangeMenu = (page: Page) => page.getByTestId("timeline-range-menu");
const fieldMenu = (page: Page) => page.getByTestId("field-menu");
const bubble = (page: Page) => page.getByTestId("long-press-bubble");
const centerOf = async (locator: Locator): Promise<Point> => {
    const box = (await locator.boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
const selection = (page: Page) =>
    page.evaluate(() => window.fieldTest!.selection());
const pageCount = async (query: Show["query"]) =>
    (await query<{ n: number }>("SELECT COUNT(*) AS n FROM pages"))[0]!.n;

/** Expects `locator` to lie wholly inside the window */
async function expectOnScreen(page: Page, locator: Locator) {
    const box = (await locator.boundingBox())!;
    const { width, height } = page.viewportSize()!;
    expect(box.y, "its top is on screen").toBeGreaterThanOrEqual(0);
    expect(box.x, "its left is on screen").toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, "its bottom is on screen").toBeLessThanOrEqual(
        height,
    );
    expect(box.x + box.width, "its right is on screen").toBeLessThanOrEqual(
        width,
    );
}

/**
 * The on-screen marchers a finger can press: where the field itself is under their middle, not a
 * floating control over it (the zoom box, the pill, the toolbar panel)
 */
async function pressableMarchers(page: Page) {
    const marchers = (await drawnMarchers(page)).filter((m) => m.onScreen);
    const open = await page.evaluate(
        (points) =>
            points.map(({ x, y }) => {
                const field = document.querySelector(
                    '[data-testid="fieldCanvas"]',
                );
                const hit = document.elementFromPoint(x, y);
                return !!field && !!hit && field.contains(hit);
            }),
        marchers.map((m) => m.screen),
    );
    return marchers.filter((_, i) => open[i]);
}

/** Zooms the timeline in on the beat-53 page, wide enough for its … chip, and opens its menu */
async function openPageMenu(page: Page) {
    const viewport = page.getByTestId("timeline-viewport");
    const at = await centerOf(viewport);
    await page.mouse.move(at.x, at.y);
    await page.keyboard.down("Control");
    for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -100);
    await page.keyboard.up("Control");
    await expect
        .poll(
            async () => (await pageBox(page, PAGE_START).boundingBox())!.width,
        )
        .toBeGreaterThan(160);
    await pageBox(page, PAGE_START).evaluate((el) =>
        el.scrollIntoView({ block: "nearest", inline: "center" }),
    );
    await page.waitForTimeout(200);
    await expect(chip(page)).toBeVisible();
    await tap(page, await centerOf(chip(page)));
    await expect(rangeMenu(page)).toBeVisible();
}

/** An on-screen marcher drawn clear of `avoid` (an open menu), with room around it */
async function marcherClearOf(page: Page, avoid: Locator) {
    const menu = (await avoid.boundingBox())!;
    const field = (await page
        .getByTestId("fieldCanvas")
        .first()
        .boundingBox())!;
    const margin = 40;
    const marcher = (await pressableMarchers(page)).find(
        (m) =>
            m.screen.y > field.y + margin &&
            m.screen.y < field.y + field.height - margin &&
            m.screen.x > field.x + margin &&
            m.screen.x < field.x + field.width - margin &&
            (m.screen.x < menu.x - margin ||
                m.screen.x > menu.x + menu.width + margin ||
                m.screen.y < menu.y - margin ||
                m.screen.y > menu.y + menu.height + margin),
    );
    expect(marcher, "a marcher clear of the menu is on screen").toBeTruthy();
    return marcher!;
}

test.describe("touch layout", () => {
    test.use({
        showFile: SHOW,
        appSettings: { optOutAnalytics: true, editorMode: "expert" },
        allowedPageErrors: [/Audio worklet error/],
        touchScreen: true,
        initScript: "localStorage.setItem('openmarch:inputMode', 'touch');",
    });

    test.beforeEach(async ({ show }) => {
        await waitForField(show.page);
        await goToPage(show.page, PAGE_START);
    });

    test("a long press on a marcher near the top of the field keeps the field menu wholly on screen", async ({
        show,
    }) => {
        const { page } = show;
        // A short window, as on a tablet in landscape: the touch menu fits neither below nor
        // above a marcher near the field's top
        await page.setViewportSize({ width: 1180, height: 600 });
        // Two key steps off the timeline: the field gets back the height of the timeline's Lanes
        // row (fork #992), so two marchers sit clear of the shape bar and the zoom box
        const splitter = page.getByTestId("timeline-splitter");
        await splitter.focus();
        for (let i = 0; i < 2; i++) await splitter.press("ArrowDown");
        await splitter.blur();
        // Two marchers the field takes a press on, once the layout has settled
        await expect
            .poll(async () => (await pressableMarchers(page)).length)
            .toBeGreaterThan(1);
        const marchers = (await pressableMarchers(page)).sort(
            (a, b) => a.screen.y - b.screen.y,
        );
        const top = marchers[0]!;
        await longPress(page, top.screen, { ms: 900 });
        await expect(fieldMenu(page)).toBeVisible();
        // Settled where Radix puts it
        await page.waitForTimeout(200);
        await expectOnScreen(page, fieldMenu(page));
        // Its first entry too, not scrolled or cut off
        await expectOnScreen(
            page,
            fieldMenu(page).getByRole("menuitem").first(),
        );
        await page.keyboard.press("Escape");
        await expect(fieldMenu(page)).toBeHidden();

        // And from a marcher low on the field
        const low = marchers[marchers.length - 1]!;
        await longPress(page, low.screen, { ms: 900 });
        await expect(fieldMenu(page)).toBeVisible();
        await page.waitForTimeout(200);
        await expectOnScreen(page, fieldMenu(page));
    });

    test("a tap on the field closes the page menu and changes nothing, and the next tap deletes no page", async ({
        show,
    }) => {
        const { page, query } = show;
        const pages = await pageCount(query);
        const selected = await selection(page);
        await openPageMenu(page);
        const deleteEntry = rangeMenu(page).getByRole("menuitem", {
            name: "Delete page",
            exact: true,
        });
        await expect(deleteEntry).toBeVisible();
        const deleteAt = await centerOf(deleteEntry);
        // A tap that would select this marcher, if it reached the field
        const marcher = await marcherClearOf(page, rangeMenu(page));
        await tap(page, marcher.screen);
        await expect(rangeMenu(page)).toBeHidden();
        await page.waitForTimeout(300);
        expect(await selection(page)).toEqual(selected);
        await expect(pageBox(page, PAGE_START)).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        // The next tap, where Delete page was, finds no menu there
        await tap(page, deleteAt);
        await page.waitForTimeout(300);
        await expect(rangeMenu(page)).toBeHidden();
        expect(await pageCount(query)).toBe(pages);
    });

    test("a greyed page menu entry shows its reason to a finger: by a long press, and by a tap", async ({
        show,
    }) => {
        const { page } = show;
        await openPageMenu(page);
        const greyed = rangeMenu(page)
            .locator('[role^="menuitem"][aria-disabled="true"][data-tip-label]')
            .first();
        await expect(greyed, "the menu has a greyed entry").toBeVisible();
        const testId = (await greyed.getAttribute("data-testid"))!;
        const reason = (
            await page.getByTestId(`${testId}-reason`).textContent()
        )?.trim();
        expect(reason, "the greyed entry has a reason").toBeTruthy();

        await longPress(page, await centerOf(greyed));
        await expect(bubble(page)).toBeVisible();
        await expect(bubble(page)).toContainText(reason!);
        // It picked nothing: the menu is still open
        await page.waitForTimeout(300);
        await expect(rangeMenu(page)).toBeVisible();

        // A tap on the entry's ? shows it beside the entry
        await tap(
            page,
            await centerOf(page.getByTestId(`${testId}-reason-icon`)),
        );
        await expect(page.getByTestId(`${testId}-reason-tip`)).toBeVisible();
        await expect(page.getByTestId(`${testId}-reason-tip`)).toContainText(
            reason!,
        );
        await expect(rangeMenu(page)).toBeVisible();
    });
});

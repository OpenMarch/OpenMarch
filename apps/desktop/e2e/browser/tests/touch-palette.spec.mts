import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures.mjs";
import { expectCanvasMatchesShow, tap } from "../app.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";

// The command palette on a tablet (tablet plan 4.3): opened with a finger, it
// doesn't focus its search field, so no on-screen keyboard covers the list
// until the field is tapped. Once a hardware keyboard has been used, it opens
// ready to type, as it does with a mouse.

const PAGE_0: SeedPosition[] = [
    [1, 503, 304],
    [2, 603, 354],
];

test.use({
    seedSql: seedShowSql({
        beats: 16,
        pageStarts: [],
        measureStarts: [1, 5, 9, 13],
        marchers: PAGE_0.map(([id]) => ({
            id,
            section: "Trumpet",
            prefix: "T",
            order: id,
        })),
        positions: [PAGE_0],
    }),
    // A touch screen, in the touch layout
    touchScreen: true,
    initScript: "localStorage.setItem('openmarch:inputMode', 'touch');",
});

const tapOn = async (page: Page, locator: Locator) => {
    const box = await locator.boundingBox();
    if (!box) throw new Error("It isn't on screen");
    await tap(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
};

test.beforeEach(async ({ show }) => {
    await expectCanvasMatchesShow(show);
});

test("opened with a finger, the palette's search waits for a tap", async ({
    show,
}) => {
    const { page } = show;
    await tapOn(page, page.getByRole("button", { name: "Command palette" }));
    const search = page.getByRole("combobox");
    await expect(search).toBeVisible();
    await expect(page.getByRole("option").first()).toBeVisible();
    // The dialog has the focus, not the search: no keyboard pops up
    await expect(page.getByRole("dialog")).toBeFocused();
    await expect(search).not.toBeFocused();
    await page.screenshot({ path: test.info().outputPath("palette.png") });

    // A tap on the search focuses it
    await tapOn(page, search);
    await expect(search).toBeFocused();
});

test("once a keyboard has been used, the palette opens ready to type", async ({
    show,
}) => {
    const { page } = show;
    await page.keyboard.press("ControlOrMeta+k");
    const search = page.getByRole("combobox");
    await expect(search).toBeVisible();
    await expect(search).toBeFocused();
});

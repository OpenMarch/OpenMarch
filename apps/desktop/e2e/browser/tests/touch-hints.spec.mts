import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures.mjs";
import { expectCanvasMatchesShow, longPress, tap } from "../app.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";

// Hints on a tablet (tablet plan 4.2): a finger can't hover, so a long press on
// a control shows what its tooltip would. A greyed-out control says why it's
// off, from the tooltip on its wrapper, and the rounding chips explain
// themselves in an info tip in touch words instead of a hover title.

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

const middle = async (locator: Locator) => {
    const box = await locator.boundingBox();
    if (!box) throw new Error("It isn't on screen");
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
const tapOn = async (page: Page, locator: Locator) =>
    tap(page, await middle(locator));
const tab = (page: Page, name: string) =>
    page.getByTestId("titlebar-toolbar-tabs").getByRole("tab", { name });
const bubble = (page: Page) => page.getByTestId("long-press-bubble");

test.beforeEach(async ({ show }) => {
    await expectCanvasMatchesShow(show);
});

test("a long press on a greyed-out shape kind says why it's off", async ({
    show,
}) => {
    const { page } = show;
    await tapOn(page, tab(page, "Shapes"));
    const box = page
        .getByTestId("toolbar-panel")
        .getByRole("button", { name: "Box" });
    await expect(box).toBeDisabled();

    await longPress(page, await middle(box));
    await expect(bubble(page)).toHaveText("Box: Select marchers first");
    // Nothing opened: the shape tool is still closed
    await expect(page.getByTestId("shape-ring")).toHaveCount(0);
    await page.screenshot({
        path: test.info().outputPath("greyed-reason.png"),
    });
});

test("the rounding chips explain themselves in an info tip, not a hover title", async ({
    show,
}) => {
    const { page } = show;
    await tapOn(page, tab(page, "Alignment"));
    const panel = page.getByTestId("toolbar-panel");
    const x = panel.getByRole("button", { name: /^X: / });
    await expect(x).toBeVisible();
    await expect(x).not.toHaveAttribute("title");

    await tapOn(
        page,
        panel.getByRole("button", { name: "About the rounding steps" }),
    );
    await expect(page.getByTestId("info-tip-content")).toContainText(
        "Tap X or Y to step through the rounding options.",
    );
    await page.screenshot({
        path: test.info().outputPath("rounding-tip.png"),
    });
});

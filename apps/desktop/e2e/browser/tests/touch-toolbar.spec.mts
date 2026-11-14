import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures.mjs";
import {
    expectCanvasMatchesShow,
    selectedDrillNumbers,
    tap,
    waitForField,
    waitForSettledField,
} from "../app.mjs";
import { seedShowSql, type SeedPosition } from "../seed.mjs";

// The touch toolbar (tablet 2.1, ported from upstream #1060): on a touch
// screen the toolbar's tabs sit in the title bar, and the selected tab's
// controls are a panel over the top of the field. The panel starts closed;
// tapping a tab opens it on that tab, tapping the open tab or the chevron
// closes it, and the tab and whether it's open are remembered on reload. The
// controls in it are the toolbar's own and run the same actions.

// Four trumpets on the home page, all in view.
const PAGE_0: SeedPosition[] = [
    [1, 503, 304],
    [2, 603, 354],
    [3, 703, 284],
    [4, 803, 404],
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
    // A touch screen, with the interface on Automatic: it lays out for touch
    touchScreen: true,
});

/** Taps the middle of `locator` with one finger. */
async function tapOn(page: Page, locator: Locator) {
    const box = await locator.boundingBox();
    if (!box) throw new Error("Nothing to tap: it isn't on screen");
    await tap(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
}

const titleBarTabs = (page: Page) => page.getByTestId("titlebar-toolbar-tabs");
const tab = (page: Page, name: string) =>
    titleBarTabs(page).getByRole("tab", { name });
const panel = (page: Page) => page.getByTestId("toolbar-panel");

const fieldBox = (page: Page) => page.getByTestId("fieldCanvas").boundingBox();

/** Whether the title bar's tab row is narrower than its tabs */
const tabRowOverflows = (page: Page) =>
    titleBarTabs(page)
        .locator(".overflow-x-auto")
        .evaluate((row) => row.scrollWidth > row.clientWidth);

/** Whether every control in the open panel's tab lies inside the panel, none cut off at its edge */
const panelRowsFit = (page: Page) =>
    panel(page).evaluate((element) => {
        const box = element.getBoundingClientRect();
        const row = element.querySelector(
            '[role="tabpanel"][data-state="active"] > div',
        )!;
        return [...row.children].every((child) => {
            const r = child.getBoundingClientRect();
            return r.left >= box.left - 1 && r.right <= box.right + 1;
        });
    });

/** Whether a finger at the middle of `locator` lands on it, not on something over it */
const tappable = (locator: Locator) =>
    locator.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(
            box.left + box.width / 2,
            box.top + box.height / 2,
        );
        return hit !== null && element.contains(hit);
    });

test.beforeEach(async ({ show }) => {
    await expectCanvasMatchesShow(show);
});

test("the tabs sit in the title bar, and the panel starts closed", async ({
    show,
}) => {
    const { page } = show;
    for (const name of ["File", "Alignment", "Shapes", "Select"])
        await expect(tab(page, name)).toBeVisible();
    // The tabs take the middle of the bar, where the show's name was
    await expect(page.locator(".main-app-titlebar")).not.toContainText(
        "show.dots",
    );
    await expect(panel(page)).toBeHidden();
    // The 3D View button and the workspace switch stay on screen, in the same row
    await expect(titleBarTabs(page).getByTestId("open-view3d")).toBeVisible();
    await expect(
        titleBarTabs(page).getByTestId("workspace-view-switch"),
    ).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("closed.png") });
});

test("tapping a tab opens its controls over the field without moving the field", async ({
    show,
}) => {
    const { page } = show;
    await waitForSettledField(page);
    const before = await fieldBox(page);

    await tapOn(page, tab(page, "Select"));
    await expect(panel(page)).toBeVisible();
    await expect(tab(page, "Select")).toHaveAttribute("aria-selected", "true");
    await expect(tab(page, "Select")).toHaveAttribute("aria-expanded", "true");
    const selectAll = panel(page).getByRole("button", { name: "Select all" });
    await expect(selectAll).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("select-open.png") });

    // Over the field, not above it: the field keeps its place and size
    expect(await fieldBox(page)).toEqual(before);
    const panelBox = await panel(page).boundingBox();
    expect(panelBox!.y).toBeGreaterThanOrEqual(before!.y - 16);

    // It leaves the sidebar and the field display bar uncovered: both stay tappable
    const displayBar = page.getByTestId("field-display-bar");
    const firstDisplayButton = displayBar.getByRole("button").first();
    await expect(firstDisplayButton).toBeVisible();
    expect(await tappable(firstDisplayButton)).toBe(true);
    const barBox = await displayBar.boundingBox();
    expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(barBox!.x);
    const sidebarFirst = page.locator("#sidebar").getByRole("button").first();
    expect(await tappable(sidebarFirst)).toBe(true);

    // The control runs the toolbar's own action
    await tapOn(page, selectAll);
    await expect
        .poll(() => selectedDrillNumbers(page))
        .toEqual(["T1", "T2", "T3", "T4"]);

    // Another tab switches the panel to it, still open
    await tapOn(page, tab(page, "Alignment"));
    await expect(panel(page)).toBeVisible();
    await expect(tab(page, "Alignment")).toHaveAttribute(
        "aria-selected",
        "true",
    );
    await expect(selectAll).toBeHidden();

    // The open tab again closes it
    await tapOn(page, tab(page, "Alignment"));
    await expect(panel(page)).toBeHidden();
    await expect(tab(page, "Alignment")).toHaveAttribute(
        "aria-expanded",
        "false",
    );
});

test("the chevron opens and closes the panel, and a reload remembers it", async ({
    show,
}) => {
    const { page } = show;
    const toggle = page.getByTestId("toolbar-panel-toggle");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await tapOn(page, toggle);
    await expect(panel(page)).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await tapOn(page, toggle);
    await expect(panel(page)).toBeHidden();

    // Open on Shapes, then reload
    await tapOn(page, tab(page, "Shapes"));
    await expect(panel(page)).toBeVisible();
    await page.reload();
    await waitForField(page);
    await expectCanvasMatchesShow(show);
    await expect(panel(page)).toBeVisible();
    await expect(tab(page, "Shapes")).toHaveAttribute("aria-selected", "true");

    // Closed is remembered too
    await tapOn(page, tab(page, "Shapes"));
    await expect(panel(page)).toBeHidden();
    await page.reload();
    await waitForField(page);
    await expectCanvasMatchesShow(show);
    await expect(tab(page, "Shapes")).toHaveAttribute("aria-selected", "true");
    await expect(panel(page)).toBeHidden();
});

test("with the interface set to Mouse, the toolbar is the desktop one", async ({
    show,
}) => {
    const { page } = show;
    await page.evaluate(() =>
        localStorage.setItem("openmarch:inputMode", "mouse"),
    );
    await page.reload();
    await waitForField(page);
    await expectCanvasMatchesShow(show);
    await expect(page.getByTestId("touch-toolbar")).toHaveCount(0);
    await expect(titleBarTabs(page)).toHaveCount(0);
    // The tabs and their controls are back above the field, Alignment first
    await expect(page.getByRole("tab", { name: "Alignment" })).toHaveAttribute(
        "aria-selected",
        "true",
    );
    await expect(page.getByTestId("toolbar-panel")).toHaveCount(0);
});

test("on a narrow screen the tabs get shorter, and all four fit beside the 3D View and the switch", async ({
    show,
}) => {
    const { page } = show;
    // An iPad mini held upright (tablet plan 2.2). This target draws the desktop title bar
    // (menu, reload, window buttons), which a tablet's browser doesn't have, so its row at
    // 900 px is about as wide as the iPad web build's at 744 px (about 400 px)
    await page.setViewportSize({ width: 900, height: 1100 });
    await expect(titleBarTabs(page).getByTestId("open-view3d")).toBeVisible();
    await expect(
        titleBarTabs(page).getByTestId("workspace-view-switch"),
    ).toBeVisible();
    // Alignment shows as "Align", and keeps its name; the chevron gives its room to the tabs
    const alignmentLabel = (text: string) =>
        tab(page, "Alignment").getByText(text, { exact: true });
    await expect(alignmentLabel("Align")).toBeVisible();
    await expect(alignmentLabel("Alignment")).toBeHidden();
    await expect(page.getByTestId("toolbar-panel-toggle")).toBeHidden();
    // Every tab is on screen whole: nothing to scroll
    expect(await tabRowOverflows(page)).toBe(false);
    for (const name of ["File", "Alignment", "Shapes", "Select"]) {
        await tapOn(page, tab(page, name));
        await expect(tab(page, name)).toHaveAttribute("aria-selected", "true");
        await expect(panel(page)).toBeVisible();
    }
    // The open tab again closes the panel, with no chevron
    await tapOn(page, tab(page, "Select"));
    await expect(panel(page)).toBeHidden();
    await tapOn(page, tab(page, "Select"));
    await expect(
        panel(page).getByRole("button", { name: "Select all" }),
    ).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("narrow-open.png") });

    // The panel's controls wrap rather than run off its edge
    await tapOn(page, tab(page, "Alignment"));
    expect(await panelRowsFit(page)).toBe(true);
    await page.screenshot({
        path: test.info().outputPath("narrow-alignment.png"),
    });

    // Wide again, the full tabs and the chevron are back
    await page.setViewportSize({ width: 1600, height: 1000 });
    await expect(alignmentLabel("Alignment")).toBeVisible();
    await expect(alignmentLabel("Align")).toBeHidden();
    await expect(page.getByTestId("toolbar-panel-toggle")).toBeVisible();
});

test("the Shapes tab has a Ring button, and no Hold R hint until a key is pressed", async ({
    show,
}) => {
    const { page } = show;
    await tapOn(page, tab(page, "Shapes"));
    await expect(panel(page)).toBeVisible();
    // Each kind is captioned, as its tooltip can't be seen
    await expect(
        panel(page).getByRole("button", { name: "Box" }),
    ).toContainText("Box");
    await expect(page.getByTestId("shapes-tab-ring-hint")).toHaveCount(0);

    // The Ring button opens the ring the R key does, over the field, kept open for a tap
    await tapOn(page, page.getByTestId("shapes-tab-ring"));
    const ring = page.getByTestId("shape-ring");
    await expect(ring).toBeVisible();
    await expect(ring).toHaveAttribute("data-latched", "true");
    const field = (await fieldBox(page))!;
    const ringBox = (await page
        .getByTestId("shape-ring-center")
        .boundingBox())!;
    const middle = (box: {
        x: number;
        y: number;
        width: number;
        height: number;
    }) => ({
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
    });
    expect(Math.abs(middle(ringBox).x - middle(field).x)).toBeLessThanOrEqual(
        2,
    );
    // Nobody is selected: it says so, and a tap anywhere closes it
    await expect(page.getByTestId("shape-ring-reason")).toBeVisible();
    await tap(page, { x: field.x + 20, y: field.y + field.height - 20 });
    await expect(ring).toHaveCount(0);

    // Once a keyboard is used, the hint is back
    await page.keyboard.press("Shift");
    await expect(page.getByTestId("shapes-tab-ring-hint")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("shapes-open.png") });
});

test("Editor to Preview and back keeps the field where it is", async ({
    show,
}) => {
    const { page } = show;
    await waitForSettledField(page);
    // Where the field starts. Preview's timeline is its own height, and Preview has no sidebar
    // or inspector, so only the top edge is the toolbar's to keep
    const top = async () => (await fieldBox(page))!.y;
    const before = await top();

    await tapOn(page, page.getByTestId("workspace-view-preview"));
    // Preview's switch takes the same title bar row; nothing is added above the field
    await expect(page.getByTestId("touch-preview-toolbar")).toBeVisible();
    await expect(titleBarTabs(page)).toContainText("Preview");
    await expect(titleBarTabs(page).getByRole("tab")).toHaveCount(0);
    await waitForSettledField(page);
    expect(await top()).toBe(before);
    await page.screenshot({ path: test.info().outputPath("preview.png") });

    await tapOn(page, page.getByTestId("workspace-view-editor"));
    await expect(tab(page, "Alignment")).toBeVisible();
    await waitForSettledField(page);
    expect(await top()).toBe(before);
});

test("in tempo mode the title bar row steps back with the rest", async ({
    show,
}) => {
    const { page } = show;
    // Edit music is in the touch transport's "…" (tablet 3.5)
    await tapOn(page, page.getByTestId("timeline-touch-more"));
    await tapOn(page, page.getByTestId("timeline-touch-tempo-mode"));
    await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
    const row = page.getByTestId("touch-toolbar-row");
    await expect(row).toHaveAttribute("inert", "");
    await expect(row).toHaveClass(/opacity-30/);
    // A tap on a tab does nothing, and Preview can't be turned on
    await tapOn(page, tab(page, "Select"));
    await expect(panel(page)).toBeHidden();
    await tapOn(page, page.getByTestId("workspace-view-preview"));
    await expect(page.getByTestId("touch-preview-toolbar")).toHaveCount(0);
});

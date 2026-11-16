import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures.mjs";
import { longPress, tap } from "../app.mjs";
import { seedShowSql } from "../seed.mjs";

// The compact touch transport (tablet plan 3.5, fork #888): in the touch
// layout the timeline's header row is Previous, Play, Next, the readout, the
// zoom's ± and a "…" holding the rest. A long press on Play opens Play's
// variants (decision 6): Play on, Play from here, and Pause while playing, so a
// tablet reaches what desktop gets from Alt and Shift. Speed opens its popover
// on a tap. Every control runs an existing action; the mouse row's scenarios
// don't change.

test.use({
    // Four pages of 8 counts, a quarter second a count, so playback moves the
    // playhead well within a second
    seedSql: seedShowSql({
        beats: 40,
        beatSeconds: 0.25,
        measureStarts: [1, 9, 17, 25, 33],
        pageStarts: [1, 9, 17, 25],
        lastPageCounts: 8,
    }),
    appSettings: { optOutAnalytics: true, editorMode: "expert" },
    allowedPageErrors: [/Audio worklet error/],
    // A touch screen, in the touch layout
    touchScreen: true,
    initScript: "localStorage.setItem('openmarch:inputMode', 'touch');",
});

const transport = (page: Page) => page.getByTestId("timeline-transport");
const playButton = (page: Page) => page.getByTestId("timeline-play");
const playhead = (page: Page) =>
    page.getByTestId("timeline-playhead").getAttribute("aria-label");

async function centerOf(locator: Locator) {
    const box = (await locator.boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const tapOn = async (page: Page, locator: Locator) =>
    tap(page, await centerOf(locator));

/** Opens the "…" panel */
async function openMore(page: Page) {
    await tapOn(page, page.getByTestId("timeline-touch-more"));
    const panel = page.getByTestId("timeline-touch-more-panel");
    await expect(panel).toBeVisible();
    return panel;
}

/** Selects page 1 with Next, as a user picks a page before playing it */
async function toPage1(page: Page) {
    const home = await playhead(page);
    await tapOn(page, page.getByTestId("timeline-next"));
    await expect.poll(() => playhead(page)).not.toBe(home);
}

/** Long presses Play and returns its menu */
async function playMenu(page: Page) {
    await longPress(page, await centerOf(playButton(page)));
    const menu = page.getByTestId("timeline-play-menu");
    await expect(menu).toBeVisible();
    return menu;
}

// The first touch after the page loads can take most of a second to arrive,
// which would read as a long press; touch an empty part of the row first
test.beforeEach(async ({ show }) => {
    const { page } = show;
    const readout = (await page.getByTestId("timeline-readout").boundingBox())!;
    await tap(page, {
        x: readout.x + readout.width + 24,
        y: readout.y + readout.height / 2,
    });
});

for (const width of [1024, 834]) {
    test(`at ${width} px the row shows Previous, Play, Next, the readout, ± and "…", finger sized`, async ({
        show,
    }) => {
        const { page } = show;
        await page.setViewportSize({ width, height: 768 });
        const row = transport(page);
        await expect(row).toHaveAttribute("data-touch-transport", "");
        for (const id of [
            "timeline-previous",
            "timeline-play",
            "timeline-next",
            "timeline-touch-zoom-out",
            "timeline-touch-zoom-in",
            "timeline-touch-more",
        ]) {
            const button = row.getByTestId(id);
            await expect(button).toBeVisible();
            const box = (await button.boundingBox())!;
            expect(box.width, id).toBeGreaterThanOrEqual(44);
            expect(box.height, id).toBeGreaterThanOrEqual(44);
            expect(box.x + box.width, `${id} on screen`).toBeLessThanOrEqual(
                width,
            );
        }
        await expect(row.getByTestId("timeline-readout")).toBeVisible();
        // The desktop row's other controls aren't in it
        await expect(row.getByTestId("timeline-loop")).toHaveCount(0);
        await expect(
            row.getByRole("button", { name: "Fit the show" }),
        ).toHaveCount(0);
    });
}

test("Previous and Next step a page by tap", async ({ show }) => {
    const { page } = show;
    const start = await playhead(page);
    await tapOn(page, page.getByTestId("timeline-next"));
    await expect.poll(() => playhead(page)).not.toBe(start);
    const next = await playhead(page);
    await tapOn(page, page.getByTestId("timeline-next"));
    await expect.poll(() => playhead(page)).not.toBe(next);
    await tapOn(page, page.getByTestId("timeline-previous"));
    await expect.poll(() => playhead(page)).toBe(next);
});

test("a long press on Play offers Play on and Play from here, and Pause while playing", async ({
    show,
}) => {
    const { page } = show;
    await toPage1(page);
    const menu = await playMenu(page);
    await expect(menu.getByRole("menuitem")).toHaveText([
        /Play from start flag.*stop at playhead/,
        /Play from start flag.*continue/,
        /Play from playhead.*continue/,
    ]);
    // The long press itself didn't play
    await expect(playButton(page)).toHaveAttribute("aria-pressed", "false");
    await tapOn(page, page.getByTestId("timeline-play-menu-playPage"));
    await expect(menu).toBeHidden();
    await expect(playButton(page)).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(1200);

    // Playing: Stop and go back, or Pause here
    const playing = await playMenu(page);
    await expect(playing.getByRole("menuitem")).toHaveText([
        "Stop and go back",
        "Pause here",
    ]);
    await tapOn(page, page.getByTestId("timeline-play-menu-playPage"));
    await expect(playButton(page)).toHaveAttribute("aria-pressed", "false");
    // (The harness has no audio, so its clock doesn't run and Pause rests where
    // playback began; which action each row runs is the unit tests' to check.)
});

test("a tap on Play while playing stops and goes back, as Space does", async ({
    show,
}) => {
    const { page } = show;
    await toPage1(page);
    const before = await playhead(page);
    const menu = await playMenu(page);
    await tapOn(page, menu.getByTestId("timeline-play-menu-playOn"));
    await expect(playButton(page)).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(800);
    await tapOn(page, playButton(page));
    await expect(playButton(page)).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => playhead(page)).toBe(before);
});

test('the "…" steps a count and to the ends, and Fit toggles', async ({
    show,
}) => {
    const { page } = show;
    const start = await playhead(page);
    const panel = await openMore(page);
    await tapOn(page, panel.getByTestId("timeline-touch-next-beat"));
    await expect.poll(() => playhead(page)).not.toBe(start);
    const counted = await playhead(page);
    await tapOn(page, panel.getByTestId("timeline-touch-previous-beat"));
    await expect.poll(() => playhead(page)).toBe(start);
    await tapOn(page, panel.getByTestId("timeline-touch-last"));
    await expect.poll(() => playhead(page)).not.toBe(counted);
    await tapOn(page, panel.getByTestId("timeline-touch-first"));
    await expect.poll(() => playhead(page)).not.toBe(counted);
    // The panel stays open for more steps
    await expect(panel).toBeVisible();

    const fit = panel.getByTestId("timeline-touch-fit");
    const fitted = await fit.getAttribute("aria-pressed");
    await tapOn(page, fit);
    await expect(fit).not.toHaveAttribute("aria-pressed", fitted ?? "");
});

test("a tap on Speed opens its popover, and a chip sets the speed", async ({
    show,
}) => {
    const { page } = show;
    const panel = await openMore(page);
    const speed = panel.getByTestId("timeline-speed");
    await expect(speed).toHaveText("1×");
    await tapOn(page, speed);
    // A tap opens the popover rather than stepping to the next speed
    await expect(page.getByTestId("timeline-speed-value")).toBeVisible();
    await expect(speed).toHaveText("1×");
    await tapOn(page, page.getByRole("button", { name: "2×", exact: true }));
    await expect(speed).toHaveText("2×");
});

test('Loop and "New page" in the "…" run their actions', async ({ show }) => {
    const { page } = show;
    // Loop loops the page being edited
    await toPage1(page);
    let panel = await openMore(page);
    const loop = panel.getByTestId("timeline-touch-loop");
    await expect(loop).toHaveAttribute("aria-pressed", "false");
    await tapOn(page, loop);
    await expect(loop).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("timeline-loop-bar")).toHaveCount(1);
    await tapOn(page, loop);
    await expect(loop).toHaveAttribute("aria-pressed", "false");

    // A page at the playhead, a few counts into page 1
    const pages = async () =>
        (await show.query<{ n: number }>("SELECT COUNT(*) AS n FROM pages"))[0]
            .n;
    const before = await pages();
    for (let i = 0; i < 3; i++)
        await tapOn(page, panel.getByTestId("timeline-touch-next-beat"));
    await tapOn(page, panel.getByTestId("timeline-touch-add-page"));
    await expect(panel).toBeHidden();
    await expect.poll(pages).toBe(before + 1);

    // Edit music turns tempo mode on, and off again from the same place
    panel = await openMore(page);
    await tapOn(page, panel.getByTestId("timeline-touch-tempo-mode"));
    await expect(panel).toBeHidden();
    panel = await openMore(page);
    const tempo = panel.getByTestId("timeline-touch-tempo-mode");
    await expect(tempo).toHaveAttribute("aria-pressed", "true");
    // Tempo mode has no Loop and nothing to add
    await expect(panel.getByTestId("timeline-touch-loop")).toHaveCount(0);
    await expect(panel.getByTestId("timeline-touch-add-page")).toHaveCount(0);
    await tapOn(page, tempo);
    panel = await openMore(page);
    await expect(
        panel.getByTestId("timeline-touch-tempo-mode"),
    ).toHaveAttribute("aria-pressed", "false");
});

test("Shift+T and tempo mode's key guard work in the touch layout", async ({
    show,
}) => {
    const { page } = show;
    // Shift+T turns Edit music on, with no Edit music button in the row
    await page.keyboard.press("Shift+T");
    let panel = await openMore(page);
    await expect(
        panel.getByTestId("timeline-touch-tempo-mode"),
    ).toHaveAttribute("aria-pressed", "true");
    const fit = panel.getByTestId("timeline-touch-fit");
    const fitted = await fit.getAttribute("aria-pressed");
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    // The guard keeps Shift+Z (the timeline's own Fit key) from the timeline in tempo mode
    await page.keyboard.press("Shift+Z");
    panel = await openMore(page);
    await expect(panel.getByTestId("timeline-touch-fit")).toHaveAttribute(
        "aria-pressed",
        fitted ?? "",
    );
    await page.keyboard.press("Escape");
    // Shift+T leaves, and Shift+Z fits again
    await page.keyboard.press("Shift+T");
    await page.keyboard.press("Shift+Z");
    panel = await openMore(page);
    await expect(
        panel.getByTestId("timeline-touch-tempo-mode"),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(panel.getByTestId("timeline-touch-fit")).not.toHaveAttribute(
        "aria-pressed",
        fitted ?? "",
    );
});

test('on a short screen (744 × 500) the "…" panel fits on screen and scrolls', async ({
    show,
}) => {
    const { page } = show;
    await page.setViewportSize({ width: 744, height: 500 });
    const panel = await openMore(page);
    const box = (await panel.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(500);
    // Its last button can be scrolled to and pressed
    const last = panel.getByTestId("timeline-touch-add-subset");
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
});

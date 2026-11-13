// The Timeline chapter (guides/timeline/*).
//
// The demo show's page boxes, by page id (data-timeline-range-page) and beats:
// 9 = Page 1 (11–19), 10 = Page 2 (19–27), 11 = Page 3 (27–37), 12 = Page 4 (37–41),
// 13 = Page 5 (41–53), 14 = Page 5A (53–61). The window opens on the first page.

/** Waits for the field, closes the low-quality notice and hides toasts. */
async function ready(page, wait) {
    await page.waitForFunction(
        () => (window.fieldTest?.marchers().length ?? 0) > 0,
        null,
        { timeout: 60000 },
    );
    await wait(2500);
    await tidy(page);
}

/** Hides toasts and closes the low-quality field notice, so nothing sits over the picture. */
async function tidy(page) {
    await page
        .getByRole("button", { name: "Got it" })
        .click({ timeout: 1500 })
        .catch(() => {});
    await page
        .locator("[data-sonner-toast]")
        .evaluateAll((els) =>
            els.forEach((e) => (e.style.visibility = "hidden")),
        )
        .catch(() => {});
}

/** A page box on the timeline, by page id. */
const pageBox = (page, id) =>
    page.locator(`[data-timeline-range-page="${id}"]`).first();

/** Selects a page by clicking near the start of its box (the playhead sits on its end). */
async function selectPage(page, id, wait) {
    await pageBox(page, id).click({ position: { x: 8, y: 13 } });
    await wait(1200);
}

/** Each drawn marcher's screen point, by drill number. */
async function marchers(page) {
    const list = await page.evaluate(() =>
        window.fieldTest
            .marchers()
            .map((m) => ({ label: m.label, x: m.screen.x, y: m.screen.y })),
    );
    return new Map(list.map((m) => [m.label, m]));
}

/** Selects the named marchers: a click on the first, Shift-clicks on the rest (not filmed). */
async function select(page, labels, wait) {
    const all = await marchers(page);
    const points = labels.map((l) => all.get(l)).filter(Boolean);
    await page.mouse.click(points[0].x, points[0].y);
    await page.keyboard.down("Shift");
    for (const p of points.slice(1)) await page.mouse.click(p.x, p.y);
    await page.keyboard.up("Shift");
    await page.mouse.move(800, 990);
    await wait(600);
    return points;
}

const range = (prefix, from, to) =>
    Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);

/** The timeline pane, whole. */
const pane = (around, page) => around(page.getByTestId("timeline-pane"), 0);

/** Pixels per count, from a page box's width and its beats. */
async function countWidth(page, id) {
    const box = pageBox(page, id);
    const b = await box.boundingBox();
    const s = Number(await box.getAttribute("data-timeline-range-start"));
    const e = Number(await box.getAttribute("data-timeline-range-end"));
    return { box: b, perCount: b.width / (e - s) };
}

/** Drags the start flag's pennant `counts` counts later (not filmed). */
async function dragStartFlag(page, perCount, counts, wait) {
    const sp = await page.getByTestId("timeline-start-pennant").boundingBox();
    const a = { x: sp.x + sp.width / 2, y: sp.y + sp.height / 2 };
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
        await page.mouse.move(a.x + (perCount * counts * i) / 12, a.y);
        await wait(25);
    }
    await page.mouse.up();
    await wait(1000);
}

/** Drags the selected marchers by dragging `from` by (dx, dy) (not filmed). */
async function dragMarchers(page, from, dx, dy, wait) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
        await page.mouse.move(from.x + (dx * i) / 12, from.y + (dy * i) / 12);
        await wait(25);
    }
    await page.mouse.up();
    await wait(1500);
}

/**
 * Page 3 with B1–B4 moving from count 5 to the page's end in a move of their own ("Move 1"), the
 * move's clip selected.
 */
async function withMove(page, wait) {
    await selectPage(page, 11, wait);
    const { perCount } = await countWidth(page, 11);
    await dragStartFlag(page, perCount, 4, wait);
    const [b1] = await select(page, range("B", 1, 4), wait);
    await dragMarchers(page, b1, 0, 40, wait);
    await tidy(page);
    return { perCount };
}

/** The field and the timeline, without the inspector (for clips where both matter). */
async function fieldAndTimeline(page) {
    const p = await page.getByTestId("timeline-pane").boundingBox();
    return { x: 0, y: 120, width: Math.round(p.x + p.width + 8), height: 880 };
}

/** The front half of the field (where the brass and percussion stand) and the timeline. */
async function frontAndTimeline(page, { inspector = false } = {}) {
    const p = await page.getByTestId("timeline-pane").boundingBox();
    const width = inspector ? 1600 : Math.round(p.x + p.width + 8);
    return { x: 0, y: 440, width, height: 560 };
}

const shots = [
    // How the timeline works
    {
        id: "timeline-parts",
        kind: "still",
        // Page 3 with a move that starts mid-page: the page boxes, the start flag and the
        // playhead around the edit window, the move's bar, the counts and the waveform
        async setup({ page, around, wait }) {
            await ready(page, wait);
            await withMove(page, wait);
            await page.keyboard.press("Escape");
            await wait(800);
            await page.mouse.move(5, 500);
            await tidy(page);
            return { box: await pane(around, page) };
        },
    },
    {
        id: "timeline-scrub",
        kind: "clip",
        // Dragging the playhead across Page 3: the marchers walk from Page 2's set to Page 3's
        async setup({ page, wait }) {
            await ready(page, wait);
            await selectPage(page, 10, wait);
            await page.keyboard.press("Escape");
            await page.mouse.move(800, 990);
            await wait(800);
            await tidy(page);
            return { box: await fieldAndTimeline(page) };
        },
        async perform({ page, film, overlay }) {
            await overlay.enable();
            const ph = await page
                .getByTestId("timeline-playhead")
                .boundingBox();
            const { box: p3 } = await countWidth(page, 11);
            const grab = { x: ph.x + ph.width / 2, y: ph.y + 8 };
            await page.mouse.move(grab.x, grab.y + 80);
            await film.moveTo(page, { x: grab.x, y: grab.y + 80 }, grab, 0.6);
            await film.hold(0.3);
            await film.drag(page, grab, { x: p3.x + p3.width, y: grab.y }, 2.4);
            await film.hold(1);
        },
    },

    // Play the show
    {
        id: "timeline-play-guide",
        kind: "still",
        // Play's tooltip, which lists what Space, Alt+Space and Shift+Space do
        async setup({ page, wait, union, around }) {
            await ready(page, wait);
            await selectPage(page, 11, wait);
            await page.getByTestId("timeline-play").hover();
            await wait(1500);
            const tip = page.getByTestId("timeline-play-guide").first();
            const play = page.getByTestId("timeline-play");
            return {
                box: union(await around(tip, 12), await around(play, 12)),
            };
        },
    },
    {
        id: "timeline-loop",
        kind: "clip",
        // Loop on (C) over Page 3, then the loop bar's end dragged to the end of Page 4
        async setup({ page, around, wait }) {
            await ready(page, wait);
            await selectPage(page, 11, wait);
            await page.mouse.move(800, 990);
            await tidy(page);
            return { box: await pane(around, page) };
        },
        async perform({ page, film, overlay, box }) {
            await overlay.enable();
            await page.mouse.move(
                box.x + box.width / 2,
                box.y + box.height - 10,
            );
            await film.hold(0.5);
            await page.keyboard.press("KeyC");
            await film.hold(1);
            const end = page.getByTestId("timeline-loop-end");
            const b = await end.boundingBox().catch(() => null);
            const { box: p4 } = await countWidth(page, 12);
            if (b) {
                const grab = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
                await film.moveTo(
                    page,
                    { x: box.x + box.width / 2, y: box.y + box.height - 10 },
                    grab,
                    0.6,
                );
                await film.drag(
                    page,
                    grab,
                    { x: p4.x + p4.width, y: grab.y },
                    1,
                );
            }
            await film.hold(1.2);
        },
    },

    // Pages
    {
        id: "timeline-add-page",
        kind: "still",
        // Past the last page: the add-page pill, and the playhead's menu
        async setup({ page, wait, around, union }) {
            await ready(page, wait);
            await page.keyboard.press("End");
            await wait(1500);
            const ph0 = await page
                .getByTestId("timeline-playhead")
                .boundingBox();
            const { perCount } = await countWidth(page, 13);
            await page.mouse.click(ph0.x + ph0.width / 2 + perCount * 5, 950);
            await wait(1200);
            const ph = await page
                .getByTestId("timeline-playhead")
                .boundingBox();
            await page.mouse.click(ph.x + ph.width / 2, ph.y + 30, {
                button: "right",
            });
            await wait(800);
            await tidy(page);
            const menu = page.getByRole("menu").first();
            return {
                box: union(await pane(around, page), await around(menu, 8)),
            };
        },
    },
    {
        id: "timeline-page-flag",
        kind: "clip",
        // Page 3's flag dragged two counts later: Page 3 grows, Page 4 shrinks
        async setup({ page, around, wait }) {
            await ready(page, wait);
            await selectPage(page, 10, wait);
            await page.keyboard.press("Escape");
            await page.mouse.move(800, 990);
            await tidy(page);
            return { box: await pane(around, page) };
        },
        async perform({ page, film, overlay, box }) {
            await overlay.enable();
            const { box: p3, perCount } = await countWidth(page, 11);
            const grip = { x: p3.x + p3.width, y: p3.y + 4 };
            const start = { x: grip.x - 120, y: box.y + box.height - 20 };
            await page.mouse.move(start.x, start.y);
            await film.moveTo(page, start, grip, 0.7);
            await film.hold(0.4);
            const dropped = { x: grip.x + perCount * 2, y: grip.y };
            await film.drag(page, grip, dropped, 1.2);
            await film.hold(0.4);
            await film.moveTo(
                page,
                dropped,
                { x: dropped.x + 40, y: box.y + box.height - 20 },
                0.5,
            );
            await film.hold(1.2);
        },
    },

    // Moves
    {
        id: "timeline-make-move",
        kind: "clip",
        // Page 3 selected; the start flag dragged to count 5; four marchers dragged: a move of
        // their own appears from count 5 to the end of the page
        async setup({ page, wait }) {
            await ready(page, wait);
            await selectPage(page, 11, wait);
            await select(page, range("B", 1, 4), wait);
            await tidy(page);
            return { box: await frontAndTimeline(page) };
        },
        async perform({ page, film, overlay }) {
            await overlay.enable();
            const { perCount } = await countWidth(page, 11);
            const sp = await page
                .getByTestId("timeline-start-pennant")
                .boundingBox();
            const flag = { x: sp.x + sp.width / 2, y: sp.y + sp.height / 2 };
            await page.mouse.move(flag.x + 200, flag.y - 200);
            await film.moveTo(
                page,
                { x: flag.x + 200, y: flag.y - 200 },
                flag,
                0.7,
            );
            await film.drag(
                page,
                flag,
                { x: flag.x + perCount * 4, y: flag.y },
                1,
            );
            await film.hold(0.6);
            const b1 = (await marchers(page)).get("B1");
            await film.moveTo(
                page,
                { x: flag.x + perCount * 4, y: flag.y },
                b1,
                0.8,
            );
            await film.drag(page, b1, { x: b1.x, y: b1.y + 40 }, 1);
            await page.mouse.move(800, 990);
            await film.hold(1.5);
        },
    },
    {
        id: "timeline-cross-pages",
        kind: "clip",
        // Pages 5 and 5A selected together (Shift-click), three marchers dragged: one move across
        // both pages, and the message that they now walk straight through the end of Page 5
        async setup({ page, wait }) {
            await ready(page, wait);
            await selectPage(page, 13, wait);
            await select(page, range("S", 1, 3), wait);
            await tidy(page);
            return { box: await frontAndTimeline(page, { inspector: true }) };
        },
        async perform({ page, film, overlay }) {
            await overlay.enable();
            const b = await pageBox(page, 14).boundingBox();
            const target = { x: b.x + 10, y: b.y + 13 };
            const rest = { x: target.x - 150, y: target.y + 70 };
            await page.mouse.move(rest.x, rest.y);
            await film.moveTo(page, rest, target, 0.7);
            await page.keyboard.down("Shift");
            await film.hold(0.3);
            await page.mouse.click(target.x, target.y);
            await film.hold(0.3);
            await page.keyboard.up("Shift");
            await film.hold(0.6);
            const s1 = (await marchers(page)).get("S1");
            await film.moveTo(page, target, s1, 0.8);
            await film.drag(page, s1, { x: s1.x + 60, y: s1.y - 50 }, 1);
            await page.mouse.move(800, 990);
            // Short enough that the message is still up on the last frame
            await film.hold(1);
        },
    },
    {
        id: "timeline-move-menu",
        kind: "still",
        // The menu on a move's bar
        async setup({ page, wait, around, union }) {
            await ready(page, wait);
            await withMove(page, wait);
            const clip = page.locator("[data-timeline-range-track]").first();
            await clip.click({ button: "right" });
            await wait(800);
            const menu = page.getByRole("menu").first();
            return {
                box: union(await around(clip, 40), await around(menu, 8)),
            };
        },
    },
    {
        id: "timeline-resize-move",
        kind: "clip",
        // The move's end dragged into Page 4, then its start dragged back to Page 3's start
        async setup({ page, around, wait }) {
            await ready(page, wait);
            await withMove(page, wait);
            // The start flag and the playhead off the move's ends: a line on an end takes the drag
            await selectPage(page, 9, wait);
            await page.mouse.move(800, 990);
            await wait(500);
            return { box: await pane(around, page) };
        },
        async perform({ page, film, overlay, box }) {
            await overlay.enable();
            const { perCount } = await countWidth(page, 11);
            const clip = await page
                .locator("[data-timeline-range-track]")
                .first()
                .boundingBox();
            const right = {
                x: clip.x + clip.width - 2,
                y: clip.y + clip.height / 2,
            };
            const rest = { x: right.x + 60, y: box.y + 20 };
            await page.mouse.move(rest.x, rest.y);
            await film.moveTo(page, rest, right, 0.6);
            await film.hold(0.3);
            await film.drag(
                page,
                right,
                { x: right.x + perCount * 2, y: right.y },
                1,
            );
            await film.hold(0.8);
            const left = { x: clip.x + 2, y: right.y };
            await film.moveTo(
                page,
                { x: right.x + perCount * 2, y: right.y },
                left,
                0.7,
            );
            await film.hold(0.3);
            await film.drag(
                page,
                left,
                { x: left.x - perCount * 4, y: left.y },
                1,
            );
            await film.hold(1.3);
        },
    },
    {
        id: "timeline-isolate",
        kind: "still",
        // The move isolated (double-click): everyone else dimmed, its paths drawn
        async setup({ page, wait }) {
            await ready(page, wait);
            await withMove(page, wait);
            await page
                .locator("[data-timeline-range-track]")
                .first()
                .dblclick();
            await wait(1500);
            await page.mouse.move(800, 990);
            await tidy(page);
            return { box: await fieldAndTimeline(page) };
        },
    },

    // Defined, Held, Not defined
    {
        id: "timeline-page-menu",
        kind: "still",
        // A page box's menu with marchers selected: Define as shown, Hold from last keyframe,
        // Clear Page N
        async setup({ page, wait, around, union }) {
            await ready(page, wait);
            await selectPage(page, 12, wait);
            await select(page, range("T", 1, 4), wait);
            await pageBox(page, 12).click({
                button: "right",
                position: { x: 8, y: 13 },
            });
            await wait(800);
            await tidy(page);
            const menu = page.getByRole("menu").first();
            return {
                box: union(
                    await around(pageBox(page, 12), 40),
                    await around(menu, 8),
                ),
            };
        },
    },
    {
        id: "timeline-held",
        kind: "still",
        // T1–T4 held on Page 4 (Hold from last keyframe): the solid Held line under Page 4 from
        // Page 3's diamond, the keyframe diamonds at the flags where they're defined, and the
        // departure ticks where they move again. Page 2 is selected afterwards, so Page 4's box
        // isn't outlined over the line
        async setup({ page, wait, around }) {
            await ready(page, wait);
            await selectPage(page, 12, wait);
            await select(page, range("T", 1, 4), wait);
            await page.keyboard.press("Control+KeyH");
            await wait(1500);
            await selectPage(page, 10, wait);
            await tidy(page);
            await page.mouse.move(800, 990);
            return { box: await pane(around, page) };
        },
    },
    {
        id: "timeline-hold-end",
        kind: "clip",
        // T1–T4 held over Pages 4 and 5 (Hold from last keyframe on each), then the end of the
        // solid line dragged back to the middle of Page 5: the rest turns dashed (Not defined)
        // and the readout says where the hold ends
        async setup({ page, wait, around }) {
            await ready(page, wait);
            await selectPage(page, 12, wait);
            await select(page, range("T", 1, 4), wait);
            await page.keyboard.press("Control+KeyH");
            await wait(1500);
            await selectPage(page, 13, wait);
            await page.keyboard.press("Control+KeyH");
            await wait(1500);
            // The start flag and the playhead away from the hold's end, so the handle takes the
            // drag
            await selectPage(page, 10, wait);
            await tidy(page);
            await page.mouse.move(800, 990);
            await wait(500);
            return { box: await pane(around, page) };
        },
        async perform({ page, film, overlay, box }) {
            await overlay.enable();
            const { perCount, box: page5 } = await countWidth(page, 13);
            const handle = await page
                .locator('[data-testid^="timeline-hold-end-"]')
                .first()
                .boundingBox();
            const end = {
                x: handle.x + handle.width / 2,
                y: handle.y + handle.height / 2,
            };
            const counts = Math.max(1, Math.round(page5.width / perCount / 2));
            const rest = { x: end.x + 80, y: box.y + 30 };
            await page.mouse.move(rest.x, rest.y);
            await film.moveTo(page, rest, end, 0.7);
            await film.hold(0.5);
            // Pressed through the drag and a moment after it, so the readout shows
            const to = { x: end.x - perCount * counts, y: end.y };
            await page.mouse.move(end.x, end.y);
            await page.mouse.down();
            await film.moveTo(page, end, to, 1.4);
            await film.hold(0.8);
            await page.mouse.up();
            await film.hold(1.5);
        },
    },
    {
        id: "timeline-not-defined",
        kind: "still",
        // A new page past the end: everyone is Not defined there (dashed outlines on the field,
        // zoomed in on the trumpets), two of them selected (the dashed Not defined line on the
        // page box, and the inspector's "Not defined · showing Page 9")
        async setup({ page, wait }) {
            await ready(page, wait);
            await page.keyboard.press("End");
            await wait(1500);
            const ph0 = await page
                .getByTestId("timeline-playhead")
                .boundingBox();
            await page.mouse.click(ph0.x + ph0.width / 2 + 16 * 5, 950);
            await wait(1000);
            await page.keyboard.press("KeyF");
            await wait(1500);
            const t = (await marchers(page)).get("T5");
            await page.mouse.move(t.x, t.y);
            await page.keyboard.down("Control");
            await page.mouse.wheel(0, -180);
            await page.keyboard.up("Control");
            await wait(1200);
            await select(page, ["T1", "T2"], wait);
            await tidy(page);
            return { box: { x: 560, y: 120, width: 1040, height: 880 } };
        },
    },

    // See where marchers go
    {
        id: "timeline-start-flag-positions",
        kind: "still",
        // Start flag positions' menu, from the button at the field's top corner
        async setup({ page, wait, around, union }) {
            await ready(page, wait);
            const button = page.getByTestId("start-flag-positions");
            await button.click();
            await wait(800);
            const menu = page
                .locator("[data-radix-popper-content-wrapper]")
                .last();
            return {
                box: union(await around(button, 8), await around(menu, 8)),
            };
        },
    },
    {
        id: "timeline-paths",
        kind: "still",
        // Page 5 for everyone: dots where they were at the start flag, and the paths
        // they walk to the playhead
        uiSettings: {
            startFlagPositions: {
                always: { dots: "all", paths: "all" },
                hold: { dots: "all", paths: "all" },
            },
        },
        async setup({ page, wait }) {
            await ready(page, wait);
            await selectPage(page, 13, wait);
            await page.mouse.move(800, 990);
            await tidy(page);
            const c = await page
                .getByTestId("fieldCanvas")
                .first()
                .boundingBox();
            return {
                box: {
                    x: Math.round(c.x),
                    y: Math.round(c.y),
                    width: Math.round(c.width),
                    height: Math.round(c.height),
                },
            };
        },
    },
];

export default shots;

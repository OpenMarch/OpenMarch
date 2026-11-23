// The Timeline chapter (guides/timeline/*).
//
// The demo show's page boxes, by page id (data-timeline-range-page) and beats:
// 9 = Page 1 (11–19), 10 = Page 2 (19–27), 11 = Page 3 (27–37), 12 = Page 4 (37–41),
// 13 = Page 5 (41–53), 14 = Page 5A (53–61). The window opens on the first page.
import { ensureSelected } from "../select.mjs";

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
    await ensureSelected(page, labels, wait);
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
async function withMove(page, wait, dy = 40) {
    await selectPage(page, 11, wait);
    const { perCount } = await countWidth(page, 11);
    await dragStartFlag(page, perCount, 4, wait);
    const [b1] = await select(page, range("B", 1, 4), wait);
    await dragMarchers(page, b1, 0, dy, wait);
    await tidy(page);
    return { perCount };
}

/**
 * The timeline pane's full height, from `left` to `right` (window x), so a picture shows two or
 * three pages at a size that can be read instead of the whole show.
 */
async function paneSpan(page, left, right) {
    const p = await page.getByTestId("timeline-pane").boundingBox();
    const x = Math.max(0, Math.floor(left));
    return {
        x,
        y: Math.floor(p.y),
        width: Math.min(1600, Math.ceil(right)) - x,
        height: Math.ceil(p.height),
    };
}

/** The timeline from page `fromId`'s box to page `toId`'s, with `pad` points each side. */
async function pagesSpan(page, fromId, toId, pad = 24) {
    const a = await pageBox(page, fromId).boundingBox();
    const b = await pageBox(page, toId).boundingBox();
    return paneSpan(page, a.x - pad, b.x + b.width + pad);
}

/**
 * Like `pagesSpan`, but from just under the playback controls down: the page row with the flags
 * and pennants over it, without the readout's row (a crop through it leaves a fragment of text).
 */
async function rowsSpan(page, fromId, toId, pad = 24) {
    const span = await pagesSpan(page, fromId, toId, pad);
    return belowControls(page, span);
}

/** A crop moved down to start just under the playback controls' row. */
async function belowControls(page, box) {
    const r = await page.getByTestId("timeline-readout").boundingBox();
    const top = Math.ceil(r.y + r.height + 7);
    if (box.y >= top) return box;
    return { ...box, y: top, height: box.y + box.height - top };
}

/** Every page box on the timeline, left to right: its id and window rectangle. */
async function pageBoxes(page) {
    const list = await page
        .locator("[data-timeline-range-page]")
        .evaluateAll((els) =>
            els.map((e) => {
                const r = e.getBoundingClientRect();
                return {
                    id: e.getAttribute("data-timeline-range-page"),
                    x: r.x,
                    y: r.y,
                    width: r.width,
                    height: r.height,
                };
            }),
        );
    const seen = new Map();
    for (const b of list) if (!seen.has(b.id)) seen.set(b.id, b);
    return [...seen.values()].sort((a, b) => a.x - b.x);
}

/** A point on the field at least `clear` points from every marcher, near `near` (for a deselect). */
async function emptyFieldPoint(page, near, clear = 40) {
    const all = [...(await marchers(page)).values()];
    const c = await page.getByTestId("fieldCanvas").first().boundingBox();
    for (let r = 0; r < 600; r += 20)
        for (let a = 0; a < 360; a += 30) {
            const x = near.x + r * Math.cos((a * Math.PI) / 180);
            const y = near.y + r * Math.sin((a * Math.PI) / 180);
            if (x < c.x + 20 || x > c.x + c.width - 20) continue;
            if (y < c.y + 60 || y > c.y + c.height - 20) continue;
            if (all.every((m) => Math.hypot(m.x - x, m.y - y) > clear))
                return { x, y };
        }
    return { x: c.x + 30, y: c.y + c.height - 30 };
}

/**
 * Adds a page past the end of the show (End, a click `counts` counts past the last flag, F): every
 * marcher is Not defined there. The new page is selected.
 */
async function addPageAtEnd(page, wait, counts = 5) {
    await page.keyboard.press("End");
    await wait(1500);
    const ph0 = await page.getByTestId("timeline-playhead").boundingBox();
    const boxes = await pageBoxes(page);
    const last = boxes[boxes.length - 1];
    const b = await pageBox(page, last.id);
    const s = Number(await b.getAttribute("data-timeline-range-start"));
    const e = Number(await b.getAttribute("data-timeline-range-end"));
    const perCount = last.width / (e - s);
    await page.mouse.click(ph0.x + ph0.width / 2 + perCount * counts, 950);
    await wait(1000);
    await page.keyboard.press("KeyF");
    await wait(1500);
}

/** The box around the named marchers on the field, grown by `pad` (window points). */
async function marchersBox(page, labels, pad = 60) {
    const all = await marchers(page);
    const pts = labels.map((l) => all.get(l)).filter(Boolean);
    const x0 = Math.min(...pts.map((p) => p.x)) - pad;
    const y0 = Math.min(...pts.map((p) => p.y)) - pad;
    const x1 = Math.max(...pts.map((p) => p.x)) + pad;
    const y1 = Math.max(...pts.map((p) => p.y)) + pad;
    const x = Math.max(0, Math.floor(x0));
    const y = Math.max(0, Math.floor(y0));
    return {
        x,
        y,
        width: Math.min(1600, Math.ceil(x1)) - x,
        height: Math.min(1000, Math.ceil(y1)) - y,
    };
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

/** Zooms the field by `factor` about `at` (Ctrl + wheel), off camera. */
async function zoomAt(page, at, factor) {
    await page.mouse.move(at.x, at.y);
    await page.keyboard.down("Control");
    const total = (2 * Math.log(factor)) / Math.log(0.99);
    for (let i = 0; i < 10; i++) {
        await page.mouse.wheel(0, total / 10);
        await page.waitForTimeout(30);
    }
    await page.keyboard.up("Control");
    await page.waitForTimeout(600);
}

/** Where timeline-basic-point right-clicked the tick, for its pointer (a still's perform). */
let basicTickPoint = { x: 0, y: 0 };

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
            // From the controls and the readout to past the end of Page 4, so each part can be read
            // and the playhead's "counts 5–10" label isn't cut
            const p4 = await pageBox(page, 12).boundingBox();
            return { box: await paneSpan(page, 0, p4.x + p4.width + 110) };
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
            // The middle of the field over the timeline's Pages 2 and 3, not the whole window, so
            // the marchers are big enough to see walking
            const c = await page
                .getByTestId("fieldCanvas")
                .first()
                .boundingBox();
            const p3 = await pageBox(page, 11).boundingBox();
            const width = 900;
            const x = Math.max(
                0,
                Math.round(Math.min(c.x + c.width / 2 - width / 2, p3.x - 200)),
            );
            return { box: { x, y: 120, width, height: 880 } };
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

    {
        id: "timeline-swap",
        kind: "clip",
        // Expert, Page 3 selected: the playhead dragged back past the start flag into Page 2. The
        // two lines trade places, so the stretch between them is still the one being edited
        async setup({ page, wait }) {
            await ready(page, wait);
            await selectPage(page, 11, wait);
            await page.mouse.move(800, 990);
            await tidy(page);
            const p4 = await pageBox(page, 12).boundingBox();
            return { box: await paneSpan(page, 0, p4.x + p4.width + 24) };
        },
        async perform({ page, film, overlay }) {
            await overlay.enable();
            const ph = await page
                .getByTestId("timeline-playhead")
                .boundingBox();
            const { box: p2, perCount } = await countWidth(page, 10);
            const grab = { x: ph.x + ph.width / 2, y: ph.y + 8 };
            const rest = { x: grab.x + 60, y: grab.y + 70 };
            // The start flag is on Page 2's flag: slow down and pause on each side of it, so the
            // trade can be seen
            const flagX = p2.x + p2.width;
            const before = { x: flagX + perCount * 1.5, y: grab.y };
            const after = { x: flagX - perCount * 1.5, y: grab.y };
            const end = { x: p2.x + p2.width / 2, y: grab.y };
            await page.mouse.move(rest.x, rest.y);
            await film.moveTo(page, rest, grab, 0.6);
            await film.hold(0.3);
            await page.mouse.move(grab.x, grab.y);
            await page.mouse.down();
            await film.moveTo(page, grab, before, 0.9);
            await film.hold(0.5);
            await film.moveTo(page, before, after, 0.6);
            await film.hold(0.6);
            await film.moveTo(page, after, end, 0.7);
            await page.mouse.up();
            await page.mouse.move(rest.x, rest.y);
            await film.hold(1.5);
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
        async setup({ page, wait }) {
            await ready(page, wait);
            await selectPage(page, 11, wait);
            await page.mouse.move(800, 990);
            await tidy(page);
            // From the Loop button to past the end of Page 4
            const p4 = await pageBox(page, 12).boundingBox();
            return { box: await paneSpan(page, 0, p4.x + p4.width + 60) };
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
            // Zoomed in about the end, so the add-page button sits on the shaded counts and the
            // last page's number shows beside it
            const ph0 = await page
                .getByTestId("timeline-playhead")
                .boundingBox();
            await page.mouse.move(ph0.x, 950);
            await page.keyboard.down("Control");
            await page.mouse.wheel(0, -120);
            await wait(200);
            await page.keyboard.up("Control");
            await wait(1000);
            // Scrolled so the show's end sits about the middle of the timeline, with room after it
            const pane = await page.getByTestId("timeline-pane").boundingBox();
            for (let i = 0; i < 20; i++) {
                const bs = await pageBoxes(page);
                const end = bs[bs.length - 1];
                if (end.x + end.width < pane.x + pane.width * 0.55) break;
                await page.mouse.move(pane.x + pane.width / 2, 950);
                await page.mouse.wheel(0, 120);
                await wait(250);
            }
            await wait(600);
            const boxes = await pageBoxes(page);
            const last = boxes[boxes.length - 1];
            const lastBox = pageBox(page, last.id);
            const s = Number(
                await lastBox.getAttribute("data-timeline-range-start"),
            );
            const e = Number(
                await lastBox.getAttribute("data-timeline-range-end"),
            );
            const perCount = last.width / (e - s);
            // About 8 counts past the end, never more than 240 points
            const past = Math.min(perCount * 8, 240);
            await page.mouse.click(last.x + last.width + past, 950);
            await wait(1200);
            const ph = await page
                .getByTestId("timeline-playhead")
                .boundingBox();
            // Low on the playhead, so the menu opens below the add-page button, not over it
            await page.mouse.click(ph.x + ph.width / 2, ph.y + ph.height - 12, {
                button: "right",
            });
            await wait(800);
            await tidy(page);
            const menu = page.getByRole("menu").first();
            const before = boxes[boxes.length - 2];
            // The last two pages, the shaded counts after them and the menu, not the whole show
            return {
                box: union(
                    await rowsSpan(page, before.id, last.id, 16),
                    await belowControls(
                        page,
                        await paneSpan(page, before.x - 16, ph.x + 40),
                    ),
                    await around(menu, 8),
                ),
            };
        },
    },
    {
        id: "timeline-page-flag",
        kind: "clip",
        // Page 3's flag dragged two counts later: Page 3 grows, Page 4 shrinks
        async setup({ page, wait }) {
            await ready(page, wait);
            await selectPage(page, 10, wait);
            await page.keyboard.press("Escape");
            await page.mouse.move(800, 990);
            await tidy(page);
            return { box: await rowsSpan(page, 10, 13, 24) };
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
        async setup({ page, wait, union }) {
            await ready(page, wait);
            await selectPage(page, 11, wait);
            await select(page, range("B", 1, 4), wait);
            await tidy(page);
            // The four marchers (and where they're dragged) over Pages 2 to 4 of the timeline, so
            // the new bar and its name can be read
            const near = await marchersBox(page, range("B", 1, 4), 110);
            near.height += 40;
            return { box: union(near, await rowsSpan(page, 10, 12, 40)) };
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
        async setup({ page, wait, union }) {
            await ready(page, wait);
            await selectPage(page, 13, wait);
            // Zoomed in on the three marchers, so they read as marchers, not specks
            await zoomAt(page, (await marchers(page)).get("S2"), 2);
            await select(page, range("S", 1, 3), wait);
            await tidy(page);
            // The three marchers and Pages 4 to 5A under them: not the inspector, the message
            // (timeline-cross-pages-message) or the editing line at the field's far corner
            const near = await marchersBox(page, range("S", 1, 3), 90);
            return { box: union(near, await rowsSpan(page, 12, 14, 24)) };
        },
        async perform({ page, film, overlay, box }) {
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
            // Off the marchers, on the field inside the crop, so the pointer isn't cut off
            await page.mouse.move(box.x + box.width - 60, s1.y + 110);
            // Long enough to read the message, short enough that it's still up on the last frame
            await film.hold(2);
        },
    },
    {
        id: "timeline-cross-pages-message",
        kind: "still",
        // After Pages 5 and 5A are selected together and three marchers dragged: the message that
        // they now walk straight through the end of Page 5, with its button to stop there
        async setup({ page, wait, around }) {
            await ready(page, wait);
            await selectPage(page, 13, wait);
            await select(page, range("S", 1, 3), wait);
            await page.keyboard.down("Shift");
            await pageBox(page, 14).click({ position: { x: 10, y: 13 } });
            await page.keyboard.up("Shift");
            await wait(800);
            const s1 = (await marchers(page)).get("S1");
            await dragMarchers(page, s1, 60, -50, wait);
            await page.mouse.move(800, 990);
            const toast = page
                .locator("[data-sonner-toast]")
                .filter({ hasText: "walks straight through" })
                .first();
            await toast.waitFor({ timeout: 5000 });
            await wait(400);
            return { box: await around(toast, 2) };
        },
    },
    {
        id: "timeline-lanes-menu",
        kind: "still",
        // Page 3 with a move mid-page, the list open from the Lanes row under the lane names:
        // the search box, Moves ticked under In this show, and Equipment to add; the Moves heading
        // with its eye button over the move's row
        async setup({ page, around, union, wait }) {
            await ready(page, wait);
            await withMove(page, wait);
            await page.keyboard.press("Escape");
            await wait(600);
            await page.getByTestId("timeline-lanes-row").click();
            await page.getByTestId("timeline-lanes-menu").waitFor();
            await wait(500);
            await tidy(page);
            return {
                box: union(
                    await pane(around, page),
                    await around(page.getByTestId("timeline-lanes-menu"), 8),
                ),
            };
        },
    },
    {
        id: "timeline-moves-hidden",
        kind: "still",
        // Page 3 with a move mid-page and the Moves lane hidden from its eye button: the
        // "Moves hidden" strip where the move's bar was
        async setup({ page, around, wait }) {
            await ready(page, wait);
            await withMove(page, wait);
            await page.keyboard.press("Escape");
            await wait(600);
            await page.getByTestId("moves-lane-hide").click();
            await page.getByTestId("moves-hidden-strip").waitFor();
            await page.mouse.move(5, 500);
            await wait(600);
            await tidy(page);
            return { box: await pane(around, page) };
        },
    },
    {
        id: "timeline-move-menu",
        kind: "still",
        // The menu on a move's bar, with the playhead inside the move and two of its four marchers
        // selected, so the split items can be used and only the merge item is greyed
        async setup({ page, wait, around, union }) {
            await ready(page, wait);
            const { perCount } = await withMove(page, wait);
            const p3 = await pageBox(page, 11).boundingBox();
            // On the measure row: the playhead to count 7, inside the move (counts 5 to 10)
            await page.mouse.click(p3.x + perCount * 7, p3.y + p3.height + 14);
            await wait(1000);
            await select(page, ["B1", "B2"], wait);
            await tidy(page);
            const clip = page.locator("[data-timeline-range-track]").first();
            const cb = await clip.boundingBox();
            await page.mouse.click(
                cb.x + cb.width * 0.3,
                cb.y + cb.height / 2,
                {
                    button: "right",
                },
            );
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
            return { box: await rowsSpan(page, 10, 12, 80) };
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
        // The move isolated (double-click): everyone else dimmed, its paths drawn. A short drag,
        // so the paths are within the step size limit (not red)
        async setup({ page, wait, around, union }) {
            await ready(page, wait);
            await withMove(page, wait, 16);
            await page
                .locator("[data-timeline-range-track]")
                .first()
                .dblclick();
            await wait(1500);
            // Nobody selected, so the frame doesn't hide the four marchers' numbers
            const b1 = (await marchers(page)).get("B1");
            const empty = await emptyFieldPoint(page, b1);
            await page.mouse.click(empty.x, empty.y);
            await wait(800);
            await page.mouse.move(800, 990);
            await tidy(page);
            // The isolation bar at the top of the field and the move's marchers below it
            const bar = await around(
                page.getByTestId("timeline-isolation-bar"),
                12,
            );
            const near = await marchersBox(page, range("B", 1, 4), 160);
            const box = union(bar, near);
            // No wider than the field
            const c = await page
                .getByTestId("fieldCanvas")
                .first()
                .boundingBox();
            const x = Math.max(box.x, Math.floor(c.x));
            const right = Math.min(box.x + box.width, Math.ceil(c.x + c.width));
            return { box: { ...box, x, width: right - x } };
        },
    },

    {
        id: "timeline-merge",
        kind: "clip",
        // Page 3: B1 to B4 split into a move of their own, then its bar dragged up onto Page 3's
        // box, which is outlined with "Merge into Page 3"; on release the bar is gone
        async setup({ page, wait }) {
            await ready(page, wait);
            await selectPage(page, 11, wait);
            await select(page, range("B", 1, 4), wait);
            await pageBox(page, 11).click({
                button: "right",
                position: { x: 8, y: 13 },
            });
            await wait(800);
            await page
                .getByRole("menuitem", { name: /into new move/ })
                .first()
                .click();
            await wait(1500);
            // Out of the move's isolation, then nobody selected
            await page.keyboard.press("Escape");
            await wait(600);
            await page.keyboard.press("Escape");
            await wait(600);
            // The timeline pane made taller, so there's room under the Move 1 bar for the pointer
            // and the key cap instead of them covering the bar
            const sp = await page
                .getByTestId("timeline-splitter")
                .boundingBox();
            const grip = { x: sp.x + sp.width / 2, y: sp.y + sp.height / 2 };
            await page.mouse.move(grip.x, grip.y);
            await page.mouse.down();
            for (let i = 1; i <= 10; i++) {
                await page.mouse.move(grip.x, grip.y - 7 * i);
                await wait(25);
            }
            await page.mouse.up();
            await wait(800);
            await page.mouse.move(800, 990);
            await tidy(page);
            return { box: await pagesSpan(page, 10, 12, 60) };
        },
        async perform({ page, film, overlay }) {
            await overlay.enable();
            const bar = await page
                .locator("[data-timeline-range-track]")
                .first()
                .boundingBox();
            const p3 = await pageBox(page, 11).boundingBox();
            const grab = {
                x: bar.x + bar.width / 2,
                y: bar.y + bar.height / 2,
            };
            const rest = { x: grab.x + 80, y: grab.y + 10 };
            const drop = { x: grab.x, y: p3.y + p3.height / 2 };
            await page.mouse.move(rest.x, rest.y);
            await film.moveTo(page, rest, grab, 0.6);
            await film.hold(0.3);
            await page.mouse.down();
            await film.moveTo(page, grab, drop, 1.2);
            await film.hold(1.2);
            await page.mouse.up();
            await page.mouse.move(rest.x, rest.y);
            await film.hold(1.5);
        },
    },
    {
        id: "timeline-basic-point",
        kind: "still",
        mode: "basic",
        // Basic, Page 3: the playhead put on count 5 and B1 to B4 dragged there, so a tick marks
        // their position at that count; the tick's right-click menu open on "Remove this count's
        // position"
        async setup({ page, wait, around, union }) {
            await ready(page, wait);
            await selectPage(page, 11, wait);
            const { box: p3, perCount } = await countWidth(page, 11);
            // On the measure row under the page boxes: a click there moves the playhead (on the box
            // it selects the page)
            await page.mouse.click(p3.x + perCount * 4, p3.y + p3.height + 14);
            await wait(1000);
            const [b1] = await select(page, range("B", 1, 4), wait);
            await dragMarchers(page, b1, 0, 24, wait);
            // The playhead off the tick (it sits on it and takes the click), still in Page 3
            await page.mouse.click(p3.x + perCount * 8, p3.y + p3.height + 14);
            await wait(1000);
            await tidy(page);
            const tick = page.getByTestId("basic-point-tick").first();
            const tb = await tick.boundingBox();
            basicTickPoint = {
                x: tb.x + tb.width / 2,
                y: tb.y + tb.height / 2,
            };
            await page.mouse.click(basicTickPoint.x, basicTickPoint.y, {
                button: "right",
            });
            await wait(800);
            const menu = page.getByRole("menu").first();
            // From under the readout's row, so no fragment of it shows; the menu whole
            return {
                box: union(
                    await rowsSpan(page, 10, 12, 40),
                    await around(menu, 12),
                ),
            };
        },
        async perform({ overlay }) {
            // The pointer on the tick the menu belongs to
            await overlay.enable();
            await overlay.place(basicTickPoint.x, basicTickPoint.y);
        },
    },

    // Defined, Held, Not defined
    {
        id: "timeline-page-menu",
        kind: "still",
        // A page box's menu with marchers selected who are Not defined there (a new page at the
        // end), so Define as shown can be used: Define as shown, Hold from last keyframe, Clear
        // Page N, Subset, Delete page
        async setup({ page, wait, around, union }) {
            await ready(page, wait);
            await addPageAtEnd(page, wait, 8);
            await select(page, range("T", 1, 4), wait);
            const boxes = await pageBoxes(page);
            const last = boxes[boxes.length - 1];
            await pageBox(page, last.id).click({
                button: "right",
                position: { x: 8, y: 13 },
            });
            await wait(800);
            await tidy(page);
            const menu = page.getByRole("menu").first();
            return {
                box: union(
                    await belowControls(
                        page,
                        await around(pageBox(page, last.id), 40),
                    ),
                    await around(menu, 8),
                ),
            };
        },
    },
    {
        id: "timeline-clear-page-menu",
        kind: "still",
        // A page box's menu with marchers selected who are Defined there (T1 to T4 on Page 4), so
        // Clear Page 4 can be used
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
                    await belowControls(
                        page,
                        await around(pageBox(page, 12), 40),
                    ),
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
        // departure ticks where they move again. Page 1 is selected afterwards, so Page 4's box
        // isn't outlined over the line and the start flag is out of the crop (Pages 3 to 5A)
        async setup({ page, wait, around }) {
            await ready(page, wait);
            await selectPage(page, 12, wait);
            await select(page, range("T", 1, 4), wait);
            await page.keyboard.press("Control+KeyH");
            await wait(1500);
            // Page 1 selected, so the start flag and the playhead sit outside the picture
            await selectPage(page, 9, wait);
            await tidy(page);
            await page.mouse.move(800, 990);
            return { box: await rowsSpan(page, 11, 14, 24) };
        },
    },
    {
        id: "timeline-hold-style",
        kind: "still",
        // T1–T4 held on Page 4, with the playhead still on Page 4 (inside the hold): the
        // inspector's "Held · since Page 3" line and, under it, the Hold style choice opened on
        // its four options
        async setup({ page, wait, around, union }) {
            await ready(page, wait);
            await selectPage(page, 12, wait);
            await select(page, range("T", 1, 4), wait);
            await page.keyboard.press("Control+KeyH");
            await wait(1500);
            await tidy(page);
            const row = page.getByTestId("timeline-hold-style");
            await row.evaluate((el) => el.scrollIntoView({ block: "center" }));
            await wait(400);
            await row.getByRole("combobox").click();
            await wait(800);
            const list = page.getByRole("listbox");
            const line = page.getByTestId("timeline-hold-line");
            return {
                box: union(
                    await around(line, 12),
                    await around(row, 12),
                    await around(list, 12),
                ),
            };
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
            return { box: await rowsSpan(page, 11, 14, 24) };
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
        // A new page past the end, where everyone is Not defined, with T1 to T3 dragged forward,
        // so they're Defined there: close up on the trumpets, solid outlines (T1 to T3) beside
        // dashed ones (T4 to T6), nobody selected
        async setup({ page, wait }) {
            await ready(page, wait);
            await addPageAtEnd(page, wait, 5);
            const t = (await marchers(page)).get("T3");
            await page.mouse.move(t.x, t.y);
            await page.keyboard.down("Control");
            await page.mouse.wheel(0, -180);
            await page.keyboard.up("Control");
            await wait(1200);
            const [t1] = await select(page, range("T", 1, 3), wait);
            await dragMarchers(page, t1, 0, -40, wait);
            await tidy(page);
            const t6 = (await marchers(page)).get("T6");
            const empty = await emptyFieldPoint(page, t6, 60);
            await page.mouse.click(empty.x, empty.y);
            await page.mouse.move(800, 990);
            await wait(800);
            await tidy(page);
            // On the field only, not running into the timeline under it
            const box = await marchersBox(page, range("T", 1, 6), 50);
            const c = await page
                .getByTestId("fieldCanvas")
                .first()
                .boundingBox();
            const bottom = Math.min(
                box.y + box.height,
                Math.floor(c.y + c.height),
            );
            return { box: { ...box, height: bottom - box.y } };
        },
    },
    {
        id: "timeline-not-defined-line",
        kind: "still",
        // The inspector's state line for a marcher that's Not defined on a new page at the end:
        // "Not defined · showing Page 18"
        async setup({ page, wait, around }) {
            await ready(page, wait);
            await addPageAtEnd(page, wait, 5);
            await select(page, ["T4"], wait);
            await tidy(page);
            const line = page.getByTestId("timeline-hold-line").first();
            await line.evaluate((el) => el.scrollIntoView({ block: "center" }));
            await wait(400);
            return { box: await around(line, 14) };
        },
    },

    {
        id: "timeline-hold-drag",
        kind: "clip",
        // Expert: T1 to T4 Held over Pages 4 and 5, Page 5 selected, so the start flag is on Page
        // 4's flag, later than the hold's start. While they're dragged on the field the hold's
        // line stays dark before the start flag and lights from it on: the drag ends the hold
        // there and adds a move into Page 5
        async setup({ page, wait, union }) {
            await ready(page, wait);
            await selectPage(page, 12, wait);
            await select(page, range("T", 1, 4), wait);
            await page.keyboard.press("Control+KeyH");
            await wait(1500);
            await selectPage(page, 13, wait);
            await page.keyboard.press("Control+KeyH");
            await wait(1500);
            // Zoomed in on the trumpets, and cropped to them and Pages 4 to 5A, so the lines under
            // the pages are what the picture is about
            await zoomAt(page, (await marchers(page)).get("T2"), 2);
            // The field panned down (right-drag) so the trumpets sit near its bottom edge, just
            // over the timeline, and little field is left between them
            const from = await emptyFieldPoint(page, { x: 300, y: 300 });
            await page.mouse.move(from.x, from.y);
            await page.mouse.down({ button: "right" });
            for (let i = 1; i <= 10; i++) {
                await page.mouse.move(from.x, from.y + 12 * i);
                await wait(25);
            }
            await page.mouse.up({ button: "right" });
            await wait(800);
            await tidy(page);
            await page.mouse.move(800, 990);
            await wait(500);
            return {
                box: union(
                    await marchersBox(page, range("T", 1, 4), 70),
                    await rowsSpan(page, 12, 14, 30),
                ),
            };
        },
        async perform({ page, film, overlay }) {
            await overlay.enable();
            const t1 = (await marchers(page)).get("T1");
            const rest = { x: t1.x + 80, y: t1.y + 80 };
            const to = { x: t1.x + 60, y: t1.y - 40 };
            await page.mouse.move(rest.x, rest.y);
            await film.moveTo(page, rest, t1, 0.6);
            await page.mouse.down();
            await film.moveTo(page, t1, to, 1.2);
            // Held down a moment, so the lit line can be seen before the drop
            await film.hold(1.5);
            await page.mouse.up();
            await page.mouse.move(rest.x, rest.y);
            await film.hold(1.2);
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
            // B3 gets a keyframe in the middle of Page 5: the playhead to count 6, B3 dragged
            const { box: p5, perCount } = await countWidth(page, 13);
            await page.mouse.click(p5.x + perCount * 6, p5.y + p5.height + 14);
            await wait(1000);
            const [b3] = await select(page, ["B3"], wait);
            await dragMarchers(page, b3, 30, 0, wait);
            await tidy(page);
            // Page 5 again, with only B3 selected, so the square at its keyframe shows on its path
            // and no selection frame covers the others
            await selectPage(page, 13, wait);
            await select(page, ["B3"], wait);
            // Zoomed in on B3, so the square at its keyframe can be seen at page width
            const b3now = (await marchers(page)).get("B3");
            await zoomAt(page, b3now, 2.5);
            await page.mouse.move(800, 990);
            await tidy(page);
            // Tight on B3, its path and the square, shown wider than life on the page (maxWidth)
            const c = (await marchers(page)).get("B3");
            return {
                box: {
                    x: Math.round(c.x - 140),
                    y: Math.round(c.y - 110),
                    width: 340,
                    height: 200,
                },
            };
        },
    },
    {
        id: "timeline-next-paths",
        kind: "still",
        // Page 4 with Next paths on and start flag positions off: a line from each marcher's spot
        // at Page 4's set to a dot at its spot at Page 5's set (the brass move on Page 5)
        uiSettings: {
            nextPaths: true,
            startFlagPositions: {
                always: { dots: "off", paths: "off" },
                hold: { dots: "all", paths: "all" },
            },
        },
        async setup({ page, wait }) {
            await ready(page, wait);
            await selectPage(page, 12, wait);
            await page.mouse.move(800, 990);
            await tidy(page);
            return { box: await marchersBox(page, range("B", 1, 8), 120) };
        },
    },

    // Play the show: the speed button's slider
    {
        id: "timeline-speed-slider",
        kind: "still",
        // The speed button right-clicked: its slider from 0.1× to 8× and the common speeds
        async setup({ page, wait, around, union }) {
            await ready(page, wait);
            await selectPage(page, 11, wait);
            const speed = page.getByTestId("timeline-speed");
            await speed.click({ button: "right" });
            await wait(800);
            await tidy(page);
            const pop = page
                .locator("[data-radix-popper-content-wrapper]")
                .last();
            return {
                box: union(
                    await around(page.getByTestId("timeline-play"), 12),
                    await around(speed, 12),
                    await around(pop, 10),
                ),
            };
        },
    },

    // Add and change pages: the page in the inspector
    {
        id: "timeline-page-inspector",
        kind: "still",
        // Page 4's box selected with nobody selected: the inspector shows the page, with its
        // Counts, the Subset switch, its measures and Split page
        async setup({ page, wait, around, union }) {
            await ready(page, wait);
            await selectPage(page, 12, wait);
            await page.mouse.move(800, 990);
            await tidy(page);
            const split = page.getByRole("button", { name: "Split page" });
            await split.evaluate((el) =>
                el.scrollIntoView({ block: "center" }),
            );
            await wait(400);
            const form = split.locator("xpath=ancestor::form[1]");
            const f = await around(form, 12);
            // The section's heading, "Page 4", over the form
            const heading = page.getByText("Page 4", { exact: true }).last();
            const h = await around(heading, 12).catch(() => null);
            return { box: h ? union(f, { ...h, x: f.x, width: f.width }) : f };
        },
    },

    // Make marchers stand still: the page's main task
    {
        id: "timeline-hold-page",
        kind: "clip",
        // T1 to T4 selected on Page 4; the page's box right-clicked and Hold from last keyframe
        // pointed at (the row shows the hold it would make), then selected: the solid Held line
        // appears under Page 4
        async setup({ page, wait, around, union }) {
            await ready(page, wait);
            await selectPage(page, 12, wait);
            await select(page, range("T", 1, 4), wait);
            await tidy(page);
            // Open the menu once to measure it, so the crop holds it, then close it
            const p4 = await pageBox(page, 12).boundingBox();
            await page.mouse.click(p4.x + 10, p4.y + 13, { button: "right" });
            await wait(800);
            const menu = await around(page.getByRole("menu").first(), 10);
            await page.keyboard.press("Escape");
            await wait(600);
            await page.mouse.move(800, 990);
            // The selected trumpets whole over the menu, not cut by the crop's top edge
            return {
                box: union(
                    await rowsSpan(page, 11, 14, 24),
                    menu,
                    await marchersBox(page, range("T", 1, 4), 80),
                ),
            };
        },
        async perform({ page, film, overlay, box }) {
            await overlay.enable();
            const p4 = await pageBox(page, 12).boundingBox();
            const at = { x: p4.x + 10, y: p4.y + 13 };
            // Inside the crop, so the pointer isn't cut off at its bottom edge
            const rest = { x: at.x + 90, y: box.y + box.height - 45 };
            await page.mouse.move(rest.x, rest.y);
            await film.moveTo(page, rest, at, 0.6);
            await film.hold(0.2);
            await page.mouse.click(at.x, at.y, { button: "right" });
            await film.hold(0.6);
            const item = page
                .getByRole("menuitem", { name: /Hold from last keyframe/ })
                .first();
            const ib = await item.boundingBox();
            const on = { x: ib.x + 40, y: ib.y + ib.height / 2 };
            await film.moveTo(page, at, on, 0.6);
            // Pointed at, the row shows the hold it would make
            await film.hold(1.4);
            await page.mouse.click(on.x, on.y);
            await page.mouse.move(rest.x, rest.y);
            await film.hold(0.3);
            await tidy(page);
            await film.hold(1.5);
        },
    },

    // Defined, Held, Not defined: later pages light up during a drag
    {
        id: "timeline-later-pages",
        kind: "clip",
        // A new page at the end, where the trumpets are Not defined. Back on the page before it,
        // T1 to T4 are dragged: while the pointer is down the new page's line lights up, since
        // it will follow
        async setup({ page, wait, union }) {
            await ready(page, wait);
            await addPageAtEnd(page, wait, 8);
            await page.keyboard.press("KeyQ");
            await wait(1200);
            await select(page, range("T", 1, 4), wait);
            await tidy(page);
            const boxes = await pageBoxes(page);
            const a = boxes[boxes.length - 2];
            const b = boxes[boxes.length - 1];
            // The trumpets and the last two pages, not the whole field or the inspector
            const near = await marchersBox(page, range("T", 1, 4), 90);
            const rows = await rowsSpan(page, a.id, b.id, 40);
            return {
                box: union(near, {
                    ...rows,
                    x: Math.max(rows.x, near.x - 200),
                }),
            };
        },
        async perform({ page, film, overlay }) {
            await overlay.enable();
            const t1 = (await marchers(page)).get("T1");
            const rest = { x: t1.x + 80, y: t1.y + 80 };
            const to = { x: t1.x + 50, y: t1.y - 50 };
            await page.mouse.move(rest.x, rest.y);
            await film.moveTo(page, rest, t1, 0.6);
            await page.mouse.down();
            await film.moveTo(page, t1, to, 1);
            // Held down, so the lit line can be seen before the drop
            await film.hold(1.4);
            await page.mouse.up();
            await page.mouse.move(rest.x, rest.y);
            await film.hold(1.2);
        },
    },
];

export default shots;

// The shapes chapter (guides/shapes/*). Every shot opens the demo, puts the playhead at the end
// of the second page, selects one compact section and draws on the nearest empty stretch of
// field beside it, so no other marcher stands in or next to the shape. The shape tool times its
// presses (a double-click, a hold), so clips that draw go back to real time first
// (`film.release()`); their drags are still filmed one even step per frame.
import { ensureSelected } from "../select.mjs";

/** The nth page box on the timeline ruler, in order. */
const pageBox = (page, n) => page.locator("[data-timeline-range-page]").nth(n);

/** A paused playhead `fraction` of the way into the nth page box (a click in the clip lane seeks). */
async function seekInPage(page, n, fraction) {
    const b = await pageBox(page, n).boundingBox();
    if (!b) throw new Error(`no page box ${n} on the timeline`);
    await page.mouse.click(b.x + b.width * fraction, b.y + b.height + 50);
    await page.waitForTimeout(600);
}

const unionOf = (...boxes) => {
    const x = Math.min(...boxes.map((b) => b.x));
    const y = Math.min(...boxes.map((b) => b.y));
    const right = Math.max(...boxes.map((b) => b.x + (b.width ?? 0)));
    const bottom = Math.max(...boxes.map((b) => b.y + (b.height ?? 0)));
    return { x, y, width: right - x, height: bottom - y };
};
const grow = (b, by) => ({
    x: b.x - by,
    y: b.y - by,
    width: b.width + 2 * by,
    height: b.height + 2 * by,
});

/** Closes notices that would sit over the picture (the low-quality field notice, toasts). */
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

const marchers = (page) =>
    page.evaluate(() =>
        window.fieldTest
            .marchers()
            .filter((m) => m.onScreen)
            .map((m) => ({ id: m.id, label: m.label, ...m.screen })),
    );

/** The marchers of one section (label prefix): the biggest one that stands close together. */
async function compactSection(page, maxWidth = 360) {
    const groups = new Map();
    for (const m of await marchers(page)) {
        const prefix = m.label.replace(/\d+$/, "");
        groups.set(prefix, [...(groups.get(prefix) ?? []), m]);
    }
    const ranked = [...groups.values()]
        .map((ms) => ({ ms, bounds: unionOf(...ms) }))
        .filter(
            (g) =>
                g.ms.length >= 6 &&
                g.bounds.width <= maxWidth &&
                g.bounds.height <= maxWidth,
        )
        .sort((a, b) => b.ms.length - a.ms.length);
    if (!ranked.length) throw new Error("no compact section on screen");
    return ranked[0];
}

/** Selects the marchers whose labels start with `prefix`: one click, then Shift-clicks. */
async function selectSection(page, prefix) {
    const ms = (await marchers(page)).filter(
        (m) => m.label.replace(/\d+$/, "") === prefix,
    );
    if (!ms.length) throw new Error(`no ${prefix} marchers on screen`);
    await page.mouse.click(ms[0].x, ms[0].y);
    for (const m of ms.slice(1)) {
        await page.keyboard.down("Shift");
        await page.mouse.click(m.x, m.y);
        await page.keyboard.up("Shift");
    }
    await ensureSelected(
        page,
        ms.map((m) => m.label),
    );
    await page.waitForTimeout(300);
    return ms;
}

/**
 * The common start: the end of the second page, one compact section selected, the Shapes tab
 * open. Returns the section's bounds on screen and its label prefix.
 */
async function start(page) {
    await tidy(page);
    await seekInPage(page, 2, 0.98);
    const { ms, bounds } = await compactSection(page);
    const prefix = ms[0].label.replace(/\d+$/, "");
    await page.getByRole("tab", { name: /shapes/i }).click();
    await page.waitForTimeout(400);
    await selectSection(page, prefix);
    await tidy(page);
    // The field's zoom control sits in the corner most crops reach; it isn't part of any shot
    await page.evaluate(() => {
        const slider = document.querySelector(
            '[data-testid="canvas-zoom-slider"]',
        );
        const wrapper = slider?.closest("div")?.parentElement;
        if (wrapper) wrapper.style.visibility = "hidden";
    });
    return { bounds, prefix };
}

/** A quick drag, off camera. */
async function quickDrag(page, a, b, steps = 15) {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
        await page.mouse.move(
            a.x + ((b.x - a.x) * i) / steps,
            a.y + ((b.y - a.y) * i) / steps,
        );
        await page.waitForTimeout(20);
    }
    await page.mouse.up();
    await page.waitForTimeout(500);
}

const editorBar = (page) => page.getByTestId("shape-tool-readout");

/** Zooms the field by `factor` about `at` (Ctrl + wheel), off camera. */
async function zoomAt(page, at, factor) {
    await page.mouse.move(at.x, at.y);
    await page.keyboard.down("Control");
    // 0.99 per half unit of deltaY (view.ts)
    const total = (2 * Math.log(factor)) / Math.log(0.99);
    for (let i = 0; i < 10; i++) {
        await page.mouse.wheel(0, total / 10);
        await page.waitForTimeout(30);
    }
    await page.keyboard.up("Control");
    await page.waitForTimeout(500);
}

/** The selected section's bounds on screen, now. */
async function sectionBounds(page, prefix) {
    const ms = (await marchers(page)).filter(
        (m) => m.label.replace(/\d+$/, "") === prefix,
    );
    return unionOf(...ms);
}

/** `start`, then the field zoomed in on the section. */
async function startZoomed(page, factor = 1.5) {
    const { bounds, prefix } = await start(page);
    await zoomAt(
        page,
        { x: bounds.x + bounds.width / 2, y: bounds.y - 60 },
        factor,
    );
    return { bounds: await sectionBounds(page, prefix), prefix };
}

const overlayNow = (page) =>
    page.evaluate(() => window.fieldTest.shapeOverlay?.() ?? null);

/** The open shape's handle nearest `to`, on screen. */
async function handleNear(page, to) {
    const o = await overlayNow(page);
    if (!o?.handles?.length) throw new Error("no shape handles on the field");
    return [...o.handles].sort(
        (a, b) =>
            Math.hypot(a.x - to.x, a.y - to.y) -
            Math.hypot(b.x - to.x, b.y - to.y),
    )[0];
}

/**
 * A filmed drag along `points` (two or more), `seconds` for each leg, the button held through
 * every leg. `during(i)` runs before leg i (to press or release a key mid-drag).
 */
async function filmPath(page, film, points, seconds, during) {
    await page.mouse.move(points[0].x, points[0].y);
    await page.mouse.down();
    for (let leg = 1; leg < points.length; leg++) {
        await during?.(leg - 1);
        const a = points[leg - 1];
        const b = points[leg];
        const n = Math.max(1, Math.round(seconds * film.fps));
        for (let i = 1; i <= n; i++) {
            await page.mouse.move(
                a.x + ((b.x - a.x) * i) / n,
                a.y + ((b.y - a.y) * i) / n,
            );
            await film.frame();
        }
    }
}

/** A frame around the box drawn from `a` to `b` and the section under it, inside the field. */
function frameFor(bounds, a, b, pad = 70, minWidth = 640) {
    const area = grow(unionOf(bounds, { ...a }, { ...b }), pad);
    if (area.width < minWidth) {
        area.x -= (minWidth - area.width) / 2;
        area.width = minWidth;
    }
    const height = Math.max(area.height, area.width / 1.6);
    area.y -= (height - area.height) / 2;
    area.height = height;
    return area;
}

/** The field's canvas on screen: crops stay inside it, clear of the inspector and timeline. */
const fieldBox = (page) => page.locator("canvas").first().boundingBox();

/** `area` moved, and shrunk if it must be, to lie inside `field`. */
function inside(area, field) {
    const width = Math.min(area.width, field.width);
    const height = Math.min(area.height, field.height);
    const x = Math.min(
        Math.max(area.x, field.x),
        field.x + field.width - width,
    );
    const y = Math.min(
        Math.max(area.y, field.y),
        field.y + field.height - height,
    );
    return { x, y, width, height };
}

/** The two corners a box is drawn between: above the section, about as wide as it. */
const boxCorners = ({ x, y, width: w }) => [
    { x: x + w * 0.1, y: y - 210 },
    { x: x + w * 0.85, y: y - 95 },
];

/**
 * Corners for a box about as deep as it is wide, so twelve marchers come out 4 × 3 and the
 * spots read as a grid rather than an outline.
 */
const gridCorners = ({ x, y, width: w }) => [
    { x: x + w * 0.2, y: y - 250 },
    { x: x + w * 0.75, y: y - 95 },
];

/** Draws an open box between `gridCorners`, off camera; returns the corners. */
async function openGridBox(page, bounds) {
    const [a, b] = gridCorners(bounds);
    await page.keyboard.press("KeyB");
    await page.waitForTimeout(300);
    await quickDrag(page, a, b);
    // The pointer over the box, so its controls are at full strength
    await page.mouse.move((a.x + b.x) / 2 + 30, a.y + 12);
    await page.waitForTimeout(900);
    return [a, b];
}

/** Clicks each point in turn, double-clicking the last, off camera. */
async function clickPoints(page, points) {
    for (const p of points.slice(0, -1)) {
        await page.mouse.click(p.x, p.y);
        await page.waitForTimeout(250);
    }
    const last = points[points.length - 1];
    await page.mouse.dblclick(last.x, last.y);
    await page.waitForTimeout(600);
}

const placeButton = (page) => page.getByTestId("shape-editor-place");

/** Clicks Place, filmed: the pointer glides to it first. */
async function filmPlace(page, film, from) {
    const p = await placeButton(page).boundingBox();
    const to = { x: p.x + p.width / 2, y: p.y + p.height / 2 };
    await film.moveTo(page, from, to, 0.6);
    await page.mouse.click(to.x, to.y);
    await page.waitForTimeout(500);
    return to;
}

const sectionOf = (m) => m.label.replace(/\d+$/, "");

/**
 * The empty stretch of field nearest the selected section, `width` × `height` on screen: no
 * marcher in it or within `margin` of it, and `room` below it on the field for the floating
 * editor (and a menu that opens under it).
 */
async function emptyArea(page, prefix, width, height, room = 150) {
    const field = await fieldBox(page);
    const all = await marchers(page);
    const mine = all.filter((m) => sectionOf(m) === prefix);
    const sec = unionOf(...mine);
    const c = { x: sec.x + sec.width / 2, y: sec.y + sec.height / 2 };
    // Strictest first: a wide berth from other marchers and full room for the editor
    for (const [margin, below] of [
        [36, room],
        [24, room],
        [16, Math.min(room, 110)],
    ]) {
        let best = null;
        // Clear of the editing line and the select bar along the field's top edge
        for (
            let y = field.y + 50;
            y + height + below <= field.y + field.height;
            y += 8
        ) {
            for (
                let x = field.x + 40;
                x + width <= field.x + field.width - 60;
                x += 8
            ) {
                // The editing line at the top left
                if (x < field.x + 440 && y < field.y + 110) continue;
                const r = {
                    x: x - margin,
                    y: y - margin,
                    right: x + width + margin,
                    bottom: y + height + margin,
                };
                if (
                    all.some(
                        (p) =>
                            p.x >= r.x &&
                            p.x <= r.right &&
                            p.y >= r.y &&
                            p.y <= r.bottom,
                    )
                )
                    continue;
                const d = Math.hypot(x + width / 2 - c.x, y + height / 2 - c.y);
                if (!best || d < best.d)
                    best = { d, area: { x, y, width, height } };
            }
        }
        if (best) return best.area;
    }
    throw new Error(`no empty ${width} × ${height} stretch of field`);
}

/** `startZoomed`, then the empty area to draw in. */
async function startInArea(page, width, height, room) {
    const { bounds, prefix } = await startZoomed(page);
    const area = await emptyArea(page, prefix, width, height, room);
    return { bounds, prefix, area };
}

/** A crop of `area` and the editor's room under it (`below` px), inside the field. */
async function cropArea(
    page,
    area,
    below = 130,
    pad = 40,
    minWidth = 640,
    ...more
) {
    const cx = area.x + area.width / 2;
    const editor = {
        x: cx - 320,
        y: area.y + area.height,
        width: 640,
        height: below,
    };
    // Room above for the shape's knob
    const knob = { x: area.x, y: area.y - 50, width: 1, height: 1 };
    const all = unionOf(area, editor, knob, ...more);
    return inside(
        frameFor(
            all,
            { x: all.x, y: all.y },
            { x: all.x, y: all.y },
            pad,
            minWidth,
        ),
        await fieldBox(page),
    );
}

/** A key held long enough to read in the clip's key cap. */
async function filmKey(page, film, key, seconds = 0.6) {
    await page.keyboard.down(key);
    await film.hold(seconds);
    await page.keyboard.up(key);
}

/** Draws an open box filling `area`, off camera; returns its corners. */
async function openBoxIn(page, area) {
    const a = { x: area.x, y: area.y };
    const b = { x: area.x + area.width, y: area.y + area.height };
    await page.keyboard.press("KeyB");
    await page.waitForTimeout(300);
    await quickDrag(page, a, b);
    // The pointer over the box, so its controls are at full strength
    await page.mouse.move(area.x + area.width / 2 + 30, area.y + 12);
    await page.waitForTimeout(900);
    return [a, b];
}

/** Clicks the element, off camera, and waits. */
async function clickOn(page, locator, wait = 600) {
    const b = await locator.boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(wait);
}

/** The center of an element on screen. */
async function centerOf(locator) {
    const b = await locator.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

const BOX = [300, 165];

const shots = [
    {
        id: "shapes-tab",
        kind: "still",
        // The toolbar's Shapes tab with a section selected: the kinds, and the ring hint
        async setup({ page, around, union }) {
            await start(page);
            const tab = await around(
                page.getByRole("tab", { name: /shapes/i }),
                6,
            );
            const ribbon = await around(
                page.getByTestId("shapes-tab-ring-hint"),
                10,
            );
            const kinds = await around(
                page.getByTestId("shapes-tab-block"),
                10,
            );
            // Wide enough on the left for the ribbon's own edge
            kinds.x -= 12;
            kinds.width += 12;
            return { box: union(tab, ribbon, kinds) };
        },
    },
    {
        id: "shapes-snap-button",
        kind: "still",
        // The toolbar's Alignment tab with Snap turned off (pressed), up to Snap to grid
        async setup({ page, wait }) {
            await wait(4000);
            await tidy(page);
            await page.getByRole("tab", { name: "Alignment" }).click();
            await wait(400);
            await page.getByTestId("toolbar-snap-toggle").click();
            await page.mouse.move(800, 600);
            await wait(800);
            const list = await page
                .getByRole("tab", { name: "Alignment" })
                .locator("xpath=ancestor::*[@role='tablist'][1]")
                .boundingBox();
            const panel = await page
                .locator("[role='tabpanel'][data-state='active']")
                .first()
                .boundingBox();
            const place = await page
                .locator("[role='tabpanel'][data-state='active']")
                .getByText("Place all marchers", { exact: false })
                .first()
                .boundingBox();
            const x = list.x - 8;
            return {
                box: {
                    x,
                    y: list.y - 8,
                    width: place.x - 14 - x,
                    height: panel.y + panel.height + 2 - (list.y - 8),
                },
            };
        },
    },
    {
        id: "shapes-open-box",
        kind: "still",
        // A box drawn on empty field beside the trumpets and not placed yet: spots, handles,
        // knob and the floating editor
        async setup({ page }) {
            const { area } = await startInArea(page, ...BOX);
            await openBoxIn(page, area);
            const bar = await editorBar(page).boundingBox();
            return { box: await cropArea(page, area, 20, 30, 600, bar) };
        },
    },
    {
        id: "shapes-pathways",
        kind: "still",
        // An open box with the pathways button on: a line from each start ring to its spot
        async setup({ page }) {
            const { area, bounds } = await startInArea(page, ...BOX);
            await openBoxIn(page, area);
            await clickOn(
                page,
                page.getByRole("button", {
                    name: "Show the pathways from the start flag",
                }),
                900,
            );
            await page.mouse.move(area.x + area.width / 2 + 30, area.y + 12);
            await page.waitForTimeout(600);
            const bar = await editorBar(page).boundingBox();
            return {
                box: await cropArea(page, area, 20, 30, 600, bar, bounds),
            };
        },
    },
    {
        id: "shapes-draw-box",
        kind: "clip",
        // B, a drag corner to corner on empty field, then Place
        async setup({ page }) {
            const { area } = await startInArea(page, ...BOX);
            this.area = area;
            return { box: await cropArea(page, area) };
        },
        async perform({ page, film, overlay }) {
            await film.release();
            await overlay.enable();
            const a = { x: this.area.x, y: this.area.y };
            const b = {
                x: this.area.x + this.area.width,
                y: this.area.y + this.area.height,
            };
            const rest = { x: a.x - 60, y: a.y + 40 };
            await page.mouse.move(rest.x, rest.y);
            await film.hold(0.4);
            await filmKey(page, film, "KeyB");
            await film.moveTo(page, rest, a, 0.5);
            await film.drag(page, a, b, 1.4);
            await film.hold(0.8);
            await filmPlace(page, film, b);
            await film.hold(1.4);
        },
    },
    {
        id: "shapes-fills",
        kind: "clip",
        // An open box: Fill › Outline, then Fill › Spread
        async setup({ page }) {
            const { area } = await startInArea(page, ...BOX, 200);
            await openBoxIn(page, area);
            this.area = area;
            return { box: await cropArea(page, area, 190, 30) };
        },
        async perform({ page, film, overlay }) {
            await film.release();
            await overlay.enable();
            let at = {
                x: this.area.x + this.area.width / 2 + 30,
                y: this.area.y + 12,
            };
            await film.hold(0.5);
            for (const mode of ["outline", "spread"]) {
                const menu = await centerOf(
                    page.getByTestId("shape-mode-menu"),
                );
                await film.moveTo(page, at, menu, 0.5);
                await page.mouse.click(menu.x, menu.y);
                await page.waitForTimeout(500);
                await film.hold(0.3);
                const item = await centerOf(
                    page.getByTestId(`shape-mode-${mode}`),
                );
                await film.moveTo(page, menu, item, 0.4);
                await page.mouse.click(item.x, item.y);
                await page.waitForTimeout(500);
                // The pointer back over the box, so it shows at full strength
                at = {
                    x: this.area.x + this.area.width / 2,
                    y: this.area.y + 20,
                };
                await film.moveTo(page, item, at, 0.4);
                await film.hold(1.4);
            }
        },
    },
    {
        id: "shapes-modifier-keys",
        kind: "clip",
        // Alt held: the box grows from where the press was; Ctrl (⌘ on a Mac) added: equal
        // spacings across and deep
        async setup({ page }) {
            const { area } = await startInArea(page, 280, 170);
            this.center = {
                x: area.x + area.width / 2,
                y: area.y + area.height / 2,
            };
            return { box: await cropArea(page, area) };
        },
        async perform({ page, film, overlay }) {
            await film.release();
            await overlay.enable();
            const c = this.center;
            const rest = { x: c.x - 80, y: c.y + 30 };
            await page.mouse.move(rest.x, rest.y);
            await filmKey(page, film, "KeyB", 0.5);
            await film.moveTo(page, rest, c, 0.5);
            await page.keyboard.down("Alt");
            await film.hold(0.5);
            // Up and to the left, so the label to the right of the pointer, which names both
            // keys, stays in the frame
            const far = { x: c.x - 125, y: c.y - 55 };
            const farther = { x: c.x - 135, y: c.y - 80 };
            await filmPath(
                page,
                film,
                [c, far, far, farther],
                0.9,
                async (leg) => {
                    if (leg === 1) await page.keyboard.down("Control");
                },
            );
            await film.hold(0.6);
            await page.mouse.up();
            await page.keyboard.up("Control");
            await page.keyboard.up("Alt");
            // The pointer onto the box, so its editor shows at full strength
            await film.moveTo(page, farther, { x: c.x + 20, y: c.y - 10 }, 0.4);
            await film.hold(1.4);
        },
    },
    {
        id: "shapes-snap-guide",
        kind: "clip",
        // A box's side dragged onto a yard line: it lands there, with the orange guide named
        async setup({ page }) {
            const { area } = await startInArea(page, 220, 140);
            const [a, b] = await openBoxIn(page, area);
            const side = await handleNear(page, {
                x: b.x + 10,
                y: (a.y + b.y) / 2,
            });
            // Find, off camera, where the side lands on the next line to the right
            await page.mouse.move(side.x, side.y);
            await page.mouse.down();
            const held = [];
            for (let dx = 20; dx <= 220; dx += 1) {
                await page.mouse.move(side.x + dx, side.y);
                await page.waitForTimeout(30);
                const o = await overlayNow(page);
                const vertical = (o?.guides ?? []).some(
                    (g) => Math.abs(g.from.x - g.to.x) < 1e-6 && g.label,
                );
                if (vertical) held.push(dx);
                else if (held.length) break;
            }
            const landed = held.length
                ? { x: side.x + held[Math.floor(held.length / 2)], y: side.y }
                : null;
            await page.mouse.move(side.x, side.y, { steps: 5 });
            await page.mouse.up();
            await page.waitForTimeout(400);
            if (!landed) throw new Error("the side found no line to land on");
            this.side = side;
            this.landed = landed;
            await page.mouse.move(side.x - 40, side.y + 30);
            return {
                box: await cropArea(page, area, 120, 40, 640, {
                    x: landed.x + 60,
                    y: area.y - 60,
                    width: 1,
                    height: 1,
                }),
            };
        },
        async perform({ page, film, overlay }) {
            await film.release();
            await overlay.enable();
            const rest = { x: this.side.x - 40, y: this.side.y + 30 };
            await film.hold(0.3);
            await film.moveTo(page, rest, this.side, 0.5);
            await filmPath(page, film, [this.side, this.landed], 1.6);
            await film.hold(1.0);
            await page.mouse.up();
            await film.hold(1.2);
        },
    },
    {
        id: "shapes-draw-straight-line",
        kind: "clip",
        // L, one drag end to end on empty field, then Place
        async setup({ page }) {
            const { area } = await startInArea(page, 380, 60);
            this.ends = [
                { x: area.x, y: area.y + area.height },
                { x: area.x + area.width, y: area.y },
            ];
            return { box: await cropArea(page, area) };
        },
        async perform({ page, film, overlay }) {
            await film.release();
            await overlay.enable();
            const [a, b] = this.ends;
            const rest = { x: a.x - 40, y: a.y - 40 };
            await page.mouse.move(rest.x, rest.y);
            await film.hold(0.3);
            await filmKey(page, film, "KeyL");
            await film.moveTo(page, rest, a, 0.5);
            await film.drag(page, a, b, 1.3);
            await page.waitForTimeout(300);
            await film.hold(0.8);
            await filmPlace(page, film, b);
            await film.hold(1.4);
        },
    },
    {
        id: "shapes-draw-line",
        kind: "clip",
        // L, then clicks point after point; a double-click on the last finishes it; Place
        async setup({ page }) {
            const { area } = await startInArea(page, 380, 140);
            const { x, y, width: w, height: h } = area;
            this.points = [
                { x, y: y + h },
                { x: x + w * 0.4, y },
                { x: x + w, y },
            ];
            return { box: await cropArea(page, area) };
        },
        async perform({ page, film, overlay }) {
            await film.release();
            await overlay.enable();
            const [p1, p2, p3] = this.points;
            const rest = { x: p1.x - 40, y: p1.y - 40 };
            await page.mouse.move(rest.x, rest.y);
            await film.hold(0.3);
            await filmKey(page, film, "KeyL");
            await film.moveTo(page, rest, p1, 0.5);
            await page.mouse.click(p1.x, p1.y);
            await film.hold(0.2);
            await film.moveTo(page, p1, p2, 0.8);
            await page.mouse.click(p2.x, p2.y);
            await film.hold(0.2);
            await film.moveTo(page, p2, p3, 0.8);
            await page.mouse.dblclick(p3.x, p3.y);
            await page.waitForTimeout(300);
            await film.hold(0.8);
            await filmPlace(page, film, p3);
            await film.hold(1.4);
        },
    },
    {
        id: "shapes-draw-arc",
        kind: "clip",
        // Arc picked in the Shapes tab; a drag from end to end, then the middle handle pulled out
        async setup({ page }) {
            const { area } = await startInArea(page, 380, 190);
            await page.getByTestId("shapes-tab-arc").click();
            await page.waitForTimeout(300);
            this.ends = [
                { x: area.x, y: area.y + area.height },
                { x: area.x + area.width, y: area.y + area.height },
            ];
            // Wide enough for the whole floating editor, its degrees box at the left end
            return { box: await cropArea(page, area, 130, 40, 880) };
        },
        async perform({ page, film, overlay }) {
            await film.release();
            await overlay.enable();
            const [a, b] = this.ends;
            const rest = { x: a.x - 40, y: a.y + 30 };
            await page.mouse.move(rest.x, rest.y);
            await film.hold(0.2);
            await film.moveTo(page, rest, a, 0.4);
            await film.drag(page, a, b, 1.2);
            await page.waitForTimeout(300);
            await film.hold(0.5);
            const mid = { x: (a.x + b.x) / 2, y: a.y - 150 };
            const middle = await handleNear(page, mid);
            await film.moveTo(page, b, middle, 0.5);
            await film.drag(
                page,
                middle,
                { x: middle.x, y: middle.y - 40 },
                0.9,
            );
            await page.waitForTimeout(300);
            await film.hold(0.6);
            await filmPlace(page, film, { x: middle.x, y: middle.y - 40 });
            await film.hold(1.2);
        },
    },
    {
        id: "shapes-arc-closed",
        kind: "still",
        // An arc closed with a straight line, its Open or closed menu open showing the choice
        async setup({ page }) {
            const { area } = await startInArea(page, 360, 150, 240);
            await page.getByTestId("shapes-tab-arc").click();
            await page.waitForTimeout(300);
            await quickDrag(
                page,
                { x: area.x, y: area.y + area.height },
                { x: area.x + area.width, y: area.y + area.height },
            );
            await clickOn(page, page.getByTestId("shape-choice-ends"));
            await clickOn(page, page.getByTestId("shape-choice-ends-chord"));
            await clickOn(page, page.getByTestId("shape-choice-ends"));
            await page.mouse.move(
                area.x + area.width / 2,
                area.y + area.height - 4,
            );
            await page.waitForTimeout(600);
            const menu = await page
                .getByTestId("shape-choice-ends-content")
                .boundingBox();
            const bar = await editorBar(page).boundingBox();
            return { box: await cropArea(page, area, 20, 30, 600, menu, bar) };
        },
    },
    {
        id: "shapes-draw-circle",
        kind: "clip",
        // O, a drag from the center out to the rim on empty field, then Place
        async setup({ page }) {
            const { area } = await startInArea(page, 210, 210, 120);
            this.center = {
                x: area.x + area.width / 2,
                y: area.y + area.height / 2,
            };
            return { box: await cropArea(page, area, 110) };
        },
        async perform({ page, film, overlay }) {
            await film.release();
            await overlay.enable();
            const c = this.center;
            const rest = { x: c.x - 70, y: c.y + 50 };
            await page.mouse.move(rest.x, rest.y);
            await film.hold(0.3);
            await filmKey(page, film, "KeyO");
            await film.moveTo(page, rest, c, 0.5);
            const rim = { x: c.x + 95, y: c.y - 40 };
            await film.drag(page, c, rim, 1.2);
            await page.waitForTimeout(300);
            await film.hold(0.8);
            await filmPlace(page, film, rim);
            await film.hold(1.4);
        },
    },
    {
        id: "shapes-edit-placed",
        kind: "clip",
        // A placed box: a click on one of its marchers selects it whole, and its side handle
        // widens it, saved on release
        async setup({ page }) {
            const { area, prefix } = await startInArea(page, 260, 150);
            const [a, b] = await openBoxIn(page, area);
            await page.keyboard.press("Enter");
            await page.waitForTimeout(1200);
            await page.keyboard.press("Escape");
            await page.waitForTimeout(600);
            await tidy(page);
            const members = (await marchers(page)).filter(
                (m) =>
                    sectionOf(m) === prefix &&
                    m.x >= a.x - 10 &&
                    m.x <= b.x + 10 &&
                    m.y >= a.y - 10 &&
                    m.y <= b.y + 10,
            );
            if (!members.length) throw new Error("the box has no marchers");
            this.member = members.sort((m, n) => m.y - n.y || m.x - n.x)[0];
            this.corners = [a, b];
            return {
                box: await cropArea(page, area, 120, 40, 640, {
                    x: b.x + 100,
                    y: a.y,
                    width: 1,
                    height: 1,
                }),
            };
        },
        async perform({ page, film, overlay }) {
            await film.release();
            await overlay.enable();
            const [a, b] = this.corners;
            const m = this.member;
            const rest = { x: m.x - 50, y: m.y - 40 };
            await page.mouse.move(rest.x, rest.y);
            await film.hold(0.4);
            await film.moveTo(page, rest, m, 0.5);
            await page.mouse.click(m.x, m.y);
            await page.waitForTimeout(500);
            await film.hold(0.8);
            const side = await handleNear(page, {
                x: b.x + 5,
                y: (a.y + b.y) / 2,
            });
            await film.moveTo(page, m, side, 0.7);
            await film.drag(page, side, { x: side.x + 70, y: side.y }, 1.2);
            await page.waitForTimeout(600);
            await film.hold(1.6);
        },
    },
    {
        id: "shapes-take-out",
        kind: "clip",
        // A placed box with one marcher dragged out of it: the box is selected and Close up
        // spaces again the marchers left
        async setup({ page }) {
            const found = await startInArea(page, 260, 150);
            const { prefix } = found;
            // The field panned left with a right-drag, so the crop isn't held at the field's
            // right edge and Close up's tooltip, which runs right of the editor's end, fits
            const ref = (await marchers(page))[0];
            const from = {
                x: found.area.x + found.area.width / 2,
                y: found.area.y + found.area.height / 2,
            };
            await page.mouse.move(from.x, from.y);
            await page.mouse.down({ button: "right" });
            for (let i = 1; i <= 15; i++) {
                await page.mouse.move(from.x - (160 * i) / 15, from.y);
                await page.waitForTimeout(20);
            }
            await page.mouse.up({ button: "right" });
            await page.waitForTimeout(600);
            const moved = (await marchers(page)).find((m) => m.id === ref.id);
            const area = {
                ...found.area,
                x: found.area.x + (moved ? moved.x - ref.x : 0),
                y: found.area.y + (moved ? moved.y - ref.y : 0),
            };
            const [a, b] = await openBoxIn(page, area);
            await page.keyboard.press("Enter");
            await page.waitForTimeout(1200);
            await page.keyboard.press("Escape");
            await page.waitForTimeout(600);
            const inBox = () =>
                marchers(page).then((all) =>
                    all.filter(
                        (m) =>
                            sectionOf(m) === prefix &&
                            m.x >= a.x - 10 &&
                            m.x <= b.x + 10 &&
                            m.y >= a.y - 10 &&
                            m.y <= b.y + 10,
                    ),
                );
            const members = await inBox();
            if (members.length < 4) throw new Error("the box has no marchers");
            // The marcher in the middle of the front row, out on its own and dragged off
            const front = members
                .filter((m) => m.y > b.y - 20)
                .sort((m, n) => m.x - n.x);
            const out = front[Math.floor(front.length / 2)] ?? members[0];
            await page.keyboard.down("Control");
            await page.mouse.click(out.x, out.y);
            await page.keyboard.up("Control");
            await page.waitForTimeout(500);
            // Beside the box, not below it, where the floating editor won't cover them
            await quickDrag(page, out, { x: b.x + 70, y: (a.y + b.y) / 2 });
            await page.keyboard.press("Escape");
            await page.waitForTimeout(400);
            await page.keyboard.press("Escape");
            await page.waitForTimeout(600);
            await tidy(page);
            this.member = (await inBox()).sort(
                (m, n) => m.y - n.y || m.x - n.x,
            )[0];
            this.a = a;
            this.b = b;
            // Wide enough for Close up's tooltip, which runs right of the editor's end
            return { box: await cropArea(page, area, 130, 40, 900) };
        },
        async perform({ page, film, overlay }) {
            await film.release();
            await overlay.enable();
            const m = this.member;
            const rest = { x: m.x - 50, y: m.y - 40 };
            await page.mouse.move(rest.x, rest.y);
            await film.hold(0.6);
            await film.moveTo(page, rest, m, 0.5);
            await page.mouse.click(m.x, m.y);
            await page.waitForTimeout(600);
            await film.hold(0.6);
            const close = await centerOf(
                page.getByTestId("shape-editor-close-up"),
            );
            // Rests on Close up until its tooltip names it, then clicks it
            await film.moveTo(page, m, close, 0.6);
            await page.waitForTimeout(900);
            await film.hold(1.2);
            await page.mouse.click(close.x, close.y);
            await film.hold(0.6);
            // Off the editor, so the pointer doesn't end on the button that slides under it
            const away = { x: this.b.x + 90, y: this.a.y + 10 };
            await film.moveTo(page, close, away, 0.6);
            await film.hold(1.2);
        },
    },
    {
        id: "shapes-box-editor",
        kind: "still",
        // An open 4 × 3 box's floating editor, both rows, menus closed
        async setup({ page }) {
            const { area } = await startInArea(page, ...BOX);
            await openBoxIn(page, area);
            return { box: grow(await editorBar(page).boundingBox(), 12) };
        },
    },
    {
        id: "shapes-layout-menu",
        kind: "still",
        // An open box in Grid with its Layout menu open: Full, Stagger, Rounded, Short back, Notched
        async setup({ page }) {
            const { area } = await startInArea(page, ...BOX, 420);
            await openBoxIn(page, area);
            await page.getByTestId("shape-layout-menu").click();
            await page.waitForTimeout(600);
            const bar = await editorBar(page).boundingBox();
            const menu = await page
                .getByTestId("shape-layout-menu-content")
                .boundingBox();
            return { box: grow(unionOf(bar, menu), 16) };
        },
    },
    {
        id: "shapes-ring",
        kind: "still",
        // R tapped over empty field with a section selected: the shape ring open around the pointer
        async setup({ page }) {
            const { prefix } = await start(page);
            const area = await emptyArea(page, prefix, 260, 260, 0);
            this.at = {
                x: area.x + area.width / 2,
                y: area.y + area.height / 2,
            };
            await page.mouse.move(this.at.x, this.at.y);
            await page.waitForTimeout(300);
            await page.keyboard.press("KeyR");
            await page.waitForTimeout(800);
            const ring = await page.getByTestId("shape-ring").boundingBox();
            return { box: grow(ring, 40) };
        },
        async perform({ overlay }) {
            await overlay.enable();
            await overlay.place(this.at.x, this.at.y);
        },
    },
    {
        id: "shapes-line-editor",
        kind: "still",
        // An open line with a corner: its floating editor, both rows
        async setup({ page }) {
            const { area } = await startInArea(page, 380, 140);
            const { x, y, width: w, height: h } = area;
            await page.keyboard.press("KeyL");
            await page.waitForTimeout(300);
            await clickPoints(page, [
                { x, y: y + h },
                { x: x + w * 0.4, y },
                { x: x + w, y },
            ]);
            await page.mouse.move(x + w * 0.4, y + 10);
            await page.waitForTimeout(900);
            return { box: grow(await editorBar(page).boundingBox(), 12) };
        },
    },
    {
        id: "shapes-arc-editor",
        kind: "still",
        // An open arc: the first half of its floating editor's first row, degrees to interval lock
        async setup({ page }) {
            const { area } = await startInArea(page, 300, 150);
            await page.getByTestId("shapes-tab-arc").click();
            await page.waitForTimeout(300);
            await quickDrag(
                page,
                { x: area.x, y: area.y + area.height },
                { x: area.x + area.width, y: area.y + area.height },
            );
            // The pointer on the arc's middle handle, so the editor shows at full strength
            const mid = await handleNear(page, {
                x: area.x + area.width / 2,
                y: area.y,
            });
            await page.mouse.move(mid.x, mid.y);
            await page.waitForTimeout(900);
            const bar = await editorBar(page).boundingBox();
            const lock = await page
                .getByTestId("shape-editor-interval-lock")
                .boundingBox();
            return {
                box: {
                    x: bar.x - 4,
                    y: lock.y - 16,
                    width: lock.x + lock.width + 14 - (bar.x - 4),
                    height: lock.height + 32,
                },
            };
        },
    },
    {
        id: "shapes-curve-bend",
        kind: "clip",
        // An open curve through three points: its middle point is clicked, and one end of the
        // bar through it is dragged out, so the bend gets rounder
        async setup({ page }) {
            const { area } = await startInArea(page, 380, 170);
            const { x, y, width: w, height: h } = area;
            await page.getByTestId("shapes-tab-curve").click();
            await page.waitForTimeout(300);
            this.points = [
                { x, y: y + h },
                { x: x + w * 0.5, y },
                { x: x + w, y: y + h },
            ];
            await clickPoints(page, this.points);
            await page.mouse.move(x + w * 0.5, y + h + 40);
            await page.waitForTimeout(600);
            return { box: await cropArea(page, area) };
        },
        async perform({ page, film, overlay }) {
            await film.release();
            await overlay.enable();
            const mid = await handleNear(page, this.points[1]);
            const rest = { x: mid.x + 60, y: mid.y + 90 };
            await page.mouse.move(rest.x, rest.y);
            await film.hold(0.4);
            await film.moveTo(page, rest, mid, 0.6);
            await page.mouse.click(mid.x, mid.y);
            await page.waitForTimeout(400);
            await film.hold(0.8);
            const o = await overlayNow(page);
            const bar = o?.barHandles ?? [];
            if (!bar.length) throw new Error("the point shows no bar");
            // The bar end on the right, dragged further out along the bar
            const end = [...bar].sort((p, q) => q.at.x - p.at.x)[0].at;
            const out = {
                x: mid.x + (end.x - mid.x) * 3.2,
                y: mid.y + (end.y - mid.y) * 3.2,
            };
            await film.moveTo(page, mid, end, 0.5);
            await film.drag(page, end, out, 1.2);
            await page.waitForTimeout(300);
            await film.hold(1.4);
        },
    },
];

export default shots;

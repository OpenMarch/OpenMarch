// The shapes chapter (guides/shapes/*). Every shot opens the demo, puts the playhead at the end
// of the second page, selects one compact section and draws near it. The shape tool times its
// presses (a double-click, a hold), so clips that draw go back to real time first
// (`film.release()`); their drags are still filmed one even step per frame.

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
        id: "shapes-open-box",
        kind: "still",
        // A box drawn above the trumpets and not placed yet: spots, handles, knob and the
        // floating editor
        async setup({ page }) {
            const { bounds } = await startZoomed(page);
            const [a, b] = boxCorners(bounds);
            await page.keyboard.press("KeyB");
            await page.waitForTimeout(300);
            await quickDrag(page, a, b);
            // The pointer over the box, so its controls are at full strength
            await page.mouse.move((a.x + b.x) / 2 + 30, a.y + 12);
            await page.waitForTimeout(900);
            const bar = await editorBar(page).boundingBox();
            return {
                box: inside(
                    frameFor(bar, a, { x: b.x, y: b.y }, 36, 600),
                    await fieldBox(page),
                ),
            };
        },
    },
    {
        id: "shapes-draw-box",
        kind: "clip",
        // B, a drag corner to corner, then Place
        async setup({ page }) {
            const { bounds } = await startZoomed(page);
            this.corners = boxCorners(bounds);
            return {
                box: inside(
                    frameFor(bounds, ...this.corners),
                    await fieldBox(page),
                ),
            };
        },
        async perform({ page, film, overlay }) {
            await film.release();
            await overlay.enable();
            const [a, b] = this.corners;
            const rest = { x: a.x - 60, y: a.y + 40 };
            await page.mouse.move(rest.x, rest.y);
            await film.hold(0.4);
            await page.keyboard.press("KeyB");
            await film.hold(0.5);
            await film.moveTo(page, rest, a, 0.5);
            await film.drag(page, a, b, 1.4);
            await film.hold(0.8);
            await filmPlace(page, film, b);
            await film.hold(1.4);
        },
    },
    {
        id: "shapes-fill-menu",
        kind: "still",
        // The floating editor's Fill menu open on an open box
        async setup({ page }) {
            const { bounds } = await start(page);
            const [a, b] = boxCorners(bounds);
            await page.keyboard.press("KeyB");
            await page.waitForTimeout(300);
            await quickDrag(page, a, b);
            await page.getByTestId("shape-mode-menu").click();
            await page.waitForTimeout(600);
            const bar = await editorBar(page).boundingBox();
            const menu = await page
                .getByTestId("shape-mode-menu-content")
                .boundingBox();
            return { box: grow(unionOf(bar, menu), 16) };
        },
    },
    {
        id: "shapes-modifier-keys",
        kind: "clip",
        // Alt held: the box grows from where the press was; Ctrl (⌘ on a Mac) added: equal
        // spacings across and deep
        async setup({ page }) {
            const { bounds } = await startZoomed(page);
            const { x, y, width: w } = bounds;
            this.center = { x: x + w * 0.5, y: y - 150 };
            this.corners = [
                { x: x + w * 0.15, y: y - 220 },
                { x: x + w * 0.85, y: y - 80 },
            ];
            return {
                box: inside(
                    frameFor(bounds, ...this.corners, 80),
                    await fieldBox(page),
                ),
            };
        },
        async perform({ page, film, overlay }) {
            await film.release();
            await overlay.enable();
            const c = this.center;
            const rest = { x: c.x - 80, y: c.y + 30 };
            await page.mouse.move(rest.x, rest.y);
            await page.keyboard.press("KeyB");
            await film.hold(0.4);
            await film.moveTo(page, rest, c, 0.5);
            await page.keyboard.down("Alt");
            await film.hold(0.5);
            const far = { x: c.x + 150, y: c.y + 45 };
            const farther = { x: c.x + 170, y: c.y + 75 };
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
            await film.hold(1.4);
        },
    },
    {
        id: "shapes-snap-guide",
        kind: "clip",
        // A box's side dragged onto a yard line: it lands there, with the orange guide named
        async setup({ page }) {
            const { bounds } = await startZoomed(page);
            const [a, b] = boxCorners(bounds);
            await page.keyboard.press("KeyB");
            await page.waitForTimeout(300);
            await quickDrag(page, a, b);
            const side = await handleNear(page, {
                x: b.x + 10,
                y: (a.y + b.y) / 2,
            });
            // Find, off camera, where the side lands on the next line to the right
            await page.mouse.move(side.x, side.y);
            await page.mouse.down();
            const held = [];
            for (let dx = 20; dx <= 200; dx += 1) {
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
            const bar = await editorBar(page).boundingBox();
            return {
                box: inside(
                    frameFor(
                        unionOf(bounds, bar),
                        a,
                        { x: landed.x + 200, y: b.y },
                        30,
                    ),
                    await fieldBox(page),
                ),
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
        id: "shapes-draw-line",
        kind: "clip",
        // L, then clicks point after point; a double-click on the last finishes it; Place
        async setup({ page }) {
            const { bounds } = await startZoomed(page);
            const { x, y, width: w } = bounds;
            this.points = [
                { x: x + w * 0.05, y: y - 80 },
                { x: x + w * 0.4, y: y - 210 },
                { x: x + w * 0.95, y: y - 210 },
            ];
            return {
                box: inside(
                    frameFor(bounds, this.points[1], this.points[2], 70, 780),
                    await fieldBox(page),
                ),
            };
        },
        async perform({ page, film, overlay }) {
            await film.release();
            await overlay.enable();
            const [p1, p2, p3] = this.points;
            const rest = { x: p1.x - 40, y: p1.y - 40 };
            await page.mouse.move(rest.x, rest.y);
            await film.hold(0.3);
            await page.keyboard.press("KeyL");
            await film.hold(0.5);
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
            const { bounds } = await startZoomed(page);
            const { x, y, width: w } = bounds;
            await page.getByTestId("shapes-tab-arc").click();
            await page.waitForTimeout(300);
            this.ends = [
                { x: x + w * 0.05, y: y - 90 },
                { x: x + w * 0.95, y: y - 90 },
            ];
            return {
                box: inside(
                    frameFor(
                        bounds,
                        { x: this.ends[0].x, y: y - 260 },
                        this.ends[1],
                        70,
                        940,
                    ),
                    await fieldBox(page),
                ),
            };
        },
        async perform({ page, film, overlay }) {
            await film.release();
            await overlay.enable();
            const [a, b] = this.ends;
            const rest = { x: a.x - 40, y: a.y + 30 };
            await page.mouse.move(rest.x, rest.y);
            await film.hold(0.4);
            await film.moveTo(page, rest, a, 0.5);
            await film.drag(page, a, b, 1.3);
            await page.waitForTimeout(300);
            await film.hold(0.6);
            const mid = { x: (a.x + b.x) / 2, y: a.y - 200 };
            const middle = await handleNear(page, mid);
            await film.moveTo(page, b, middle, 0.6);
            await film.drag(
                page,
                middle,
                { x: middle.x, y: middle.y - 45 },
                1.0,
            );
            await page.waitForTimeout(300);
            await film.hold(0.8);
            await filmPlace(page, film, { x: middle.x, y: middle.y - 45 });
            await film.hold(1.4);
        },
    },
    {
        id: "shapes-draw-circle",
        kind: "clip",
        // O, a drag from the center out to the rim, then Place
        async setup({ page }) {
            const { bounds } = await startZoomed(page);
            const { x, y, width: w } = bounds;
            this.center = { x: x + w * 0.5, y: y - 150 };
            return {
                box: inside(
                    frameFor(
                        bounds,
                        { x: this.center.x - 130, y: this.center.y - 130 },
                        { x: this.center.x + 130, y: this.center.y + 130 },
                        50,
                    ),
                    await fieldBox(page),
                ),
            };
        },
        async perform({ page, film, overlay }) {
            await film.release();
            await overlay.enable();
            const c = this.center;
            const rest = { x: c.x - 70, y: c.y + 50 };
            await page.mouse.move(rest.x, rest.y);
            await film.hold(0.3);
            await page.keyboard.press("KeyO");
            await film.hold(0.5);
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
            const { bounds, prefix } = await startZoomed(page);
            const [a, b] = boxCorners(bounds);
            await page.keyboard.press("KeyB");
            await page.waitForTimeout(300);
            await quickDrag(page, a, b);
            await page.keyboard.press("Enter");
            await page.waitForTimeout(1200);
            // Nothing selected: a click on empty field, below the section
            await page.mouse.click(
                bounds.x - 120,
                bounds.y + bounds.height + 60,
            );
            await page.waitForTimeout(600);
            await tidy(page);
            const members = (await marchers(page)).filter(
                (m) =>
                    m.label.replace(/\d+$/, "") === prefix &&
                    m.y < bounds.y - 40,
            );
            if (!members.length) throw new Error("the box has no marchers");
            this.member = members.sort((m, n) => m.y - n.y || m.x - n.x)[0];
            this.corners = [a, b];
            return {
                box: inside(
                    frameFor(bounds, a, { x: b.x + 90, y: b.y }, 60),
                    await fieldBox(page),
                ),
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
];

export default shots;

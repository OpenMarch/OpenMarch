// The 3D View and props chapter (guides/3d-view/*).
//
// The 3D View is a window of its own: `open3d` opens it, sizes it to the capture window and
// waits for the scene to draw; a shot returns `{ box, target: view }` to film it. Props are
// drawn in the editor window with the Props panel's tools.

/** The nth page box on the timeline ruler, in order. */
const pageBox = (page, n) => page.locator("[data-timeline-range-page]").nth(n);

/** A paused playhead `fraction` of the way into the nth page box (a click in the clip lane seeks). */
async function seekInPage(page, n, fraction) {
    const b = await pageBox(page, n).boundingBox();
    if (!b) throw new Error(`no page box ${n} on the timeline`);
    await page.mouse.click(b.x + b.width * fraction, b.y + b.height + 50);
    await page.waitForTimeout(600);
}

/** Closes notices that would sit over a picture (the low-quality notices, toasts). */
async function tidy(page) {
    for (let i = 0; i < 2; i++)
        await page
            .getByRole("button", { name: "Got it" })
            .first()
            .click({ timeout: 1500 })
            .catch(() => {});
    await page
        .locator("[data-sonner-toast]")
        .evaluateAll((els) =>
            els.forEach((e) => (e.style.visibility = "hidden")),
        )
        .catch(() => {});
}

/** A quick drag for setting things up off camera. */
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
}

/** Opens the 3D View, sizes it like the editor window, waits for it to draw; returns its page. */
async function open3d({ app, page, window: size, wait }) {
    await tidy(page);
    const opened = app.waitForEvent("window");
    await page.getByRole("button", { name: "Open 3D View" }).click();
    const view = await opened;
    const logs = [];
    view.on("console", (m) => logs.push(m.text()));
    await view.waitForLoadState("domcontentloaded");
    await app.evaluate(({ BrowserWindow }, s) => {
        const w = BrowserWindow.getAllWindows().find((x) =>
            x.getURL().includes("view=3d"),
        );
        w.setContentBounds({ x: 0, y: 0, ...s });
        w.show();
        w.focus();
    }, size);
    await app.evaluate(({ BrowserWindow }) => {
        for (const w of BrowserWindow.getAllWindows())
            w.webContents.setBackgroundThrottling(false);
    });
    await view.getByTestId("view3d-scene").waitFor({ timeout: 60000 });
    const baked = async (count) => {
        for (
            let i = 0;
            i < 120 && logs.filter((l) => l.includes("baked")).length < count;
            i++
        )
            await wait(500);
    };
    await baked(1);
    await wait(2500);
    await tidy(view);
    // The pointer off the scene, so no hover shows
    await view.mouse.move(size.width - 4, size.height / 2);
    await wait(800);
    return { view, baked };
}

/** Turns the input overlay on in another window, framed on `box`. */
const overlayIn = (target, box) =>
    target.evaluate((f) => {
        window.__docsOverlay.setFrame(f);
        window.__docsOverlay.enable();
    }, box);

/** Field units to screen points, from the marchers on screen (the field is drawn without rotation). */
async function fieldToScreen(page) {
    const ms = await page.evaluate(() =>
        window.fieldTest
            .marchers()
            .filter((m) => m.onScreen)
            .map((m) => ({ fx: m.x, fy: m.y, ...m.screen })),
    );
    const a = ms.reduce((p, m) => (m.fx < p.fx ? m : p));
    const b = ms.reduce((p, m) => (m.fx > p.fx ? m : p));
    const c = ms.reduce((p, m) => (m.fy < p.fy ? m : p));
    const d = ms.reduce((p, m) => (m.fy > p.fy ? m : p));
    const sx = (b.x - a.x) / (b.fx - a.fx);
    const sy = (d.y - c.y) / (d.fy - c.fy);
    return ({ x, y }) => ({
        x: a.x + (x - a.fx) * sx,
        y: c.y + (y - c.fy) * sy,
    });
}

/** The field's properties (steps, center front point). */
async function fieldProperties(page) {
    const { rows } = await page.evaluate(() =>
        window.electron.sqlProxy(
            "select json_data from field_properties",
            [],
            "all",
        ),
    );
    return JSON.parse(rows[0].json_data ?? rows[0][0]);
}

/**
 * Where a riser goes in open field behind the band: a rectangle `widthSteps` × `depthSteps`
 * centred `back` steps behind the front sideline and `side` steps from the 50 (field units).
 */
async function riserSpot(page, { back = 73, side = -20 } = {}) {
    const fp = await fieldProperties(page);
    const pps = fp.width / 160;
    return {
        pps,
        center: {
            x: fp.centerFrontPoint.xPixels + side * pps,
            y: fp.centerFrontPoint.yPixels - back * pps,
        },
    };
}

/** Opens the Props panel if it isn't open. */
async function propsPanel(page) {
    if (
        !(await page
            .getByRole("button", { name: "Rectangle" })
            .isVisible()
            .catch(() => false))
    ) {
        await page.locator("#sidebar-launcher-props").click();
        await page.waitForTimeout(500);
    }
}

const items = (page) => page.evaluate(() => window.fieldTest.items?.() ?? []);

/** Sets a number field in the Edit Prop panel. */
async function setPropField(page, label, value) {
    const input = page.getByLabel(label, { exact: true }).first();
    await input.fill(String(value));
    await input.press("Enter");
    await page.waitForTimeout(600);
}

/**
 * Draws a rectangle prop (8 × 3 steps) behind the band at the start of page 2, off camera,
 * and returns its item. With `height` and `color`, sets them too.
 */
async function drawRiser(page, { height, color, name } = {}) {
    await seekInPage(page, 2, 0.02);
    const toScreen = await fieldToScreen(page);
    const { pps, center } = await riserSpot(page);
    await propsPanel(page);
    const had = new Set((await items(page)).map((i) => i.id));
    await page.getByRole("button", { name: "Rectangle" }).click();
    await page.waitForTimeout(300);
    await quickDrag(
        page,
        toScreen({ x: center.x - 4 * pps, y: center.y - 1.5 * pps }),
        toScreen({ x: center.x + 4 * pps, y: center.y + 1.5 * pps }),
    );
    let item;
    for (let i = 0; i < 20 && !item; i++) {
        item = (await items(page)).find((it) => !had.has(it.id));
        if (!item) await page.waitForTimeout(250);
    }
    if (!item) throw new Error("the prop wasn't drawn");
    const index = (await items(page)).findIndex((it) => it.id === item.id);
    if (height !== undefined || name) {
        await propsPanel(page);
        await page
            .getByRole("button", { name: "Edit prop" })
            .nth(index)
            .click();
        await page.waitForTimeout(500);
        if (name) {
            const input = page.getByLabel("Name", { exact: true }).first();
            await input.fill(name);
            await input.press("Enter");
            await page.waitForTimeout(400);
        }
        if (height !== undefined) await setPropField(page, "Height", height);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
    }
    if (color)
        await page.evaluate(
            ([c, id]) =>
                window.electron.sqlProxy(
                    "update items set color = ? where marcher_id = ?",
                    [c, id],
                    "run",
                ),
            [color, item.id],
        );
    return { item, index };
}

/** A bright amber, so the prop stands out from the field in both themes. */
const AMBER = "rgba(255, 184, 0, 1)";

/**
 * The open sidebar panel, cropped to its content: the panel runs the window's full height, so
 * the box ends a little below its lowest control.
 */
async function sidebarPanelBox(page) {
    const box = await page
        .locator("div.backdrop-blur-32.absolute.z-40")
        .first()
        .evaluate((panel) => {
            const r = panel.getBoundingClientRect();
            let bottom = r.top;
            for (const el of panel.querySelectorAll("*")) {
                const b = el.getBoundingClientRect();
                if (b.height > 0 && b.height < r.height - 40)
                    bottom = Math.max(bottom, b.bottom);
            }
            return { x: r.left, y: r.top, width: r.width, bottom };
        });
    return {
        x: Math.max(0, box.x - 12),
        y: Math.max(0, box.y - 12),
        width: box.width + 24,
        height: box.bottom - box.y + 36,
    };
}

const shots = [
    {
        id: "3d-window",
        kind: "still",
        // The whole 3D View window on its default camera, a few pages in
        async setup(ctx) {
            await seekInPage(ctx.page, 3, 0.5);
            const { view } = await open3d(ctx);
            return { box: ctx.whole, target: view };
        },
    },
    {
        id: "3d-move-view",
        kind: "clip",
        // Orbit with a drag, pan with Shift+drag, zoom with the wheel
        async setup(ctx) {
            await seekInPage(ctx.page, 3, 0.5);
            const { view } = await open3d(ctx);
            this.view = view;
            const b = ctx.whole;
            // The scene without the overlay's corners: the middle of the window
            return {
                box: {
                    x: 160,
                    y: 110,
                    width: b.width - 320,
                    height: b.height - 220,
                },
                target: view,
            };
        },
        async perform({ film, box }) {
            const view = this.view;
            await overlayIn(view, box);
            const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
            await view.mouse.move(c.x - 160, c.y + 130);
            await film.hold(0.4);
            // Orbit: drag sideways
            await film.drag(
                view,
                { x: c.x - 160, y: c.y + 130 },
                { x: c.x + 120, y: c.y + 110 },
                1.4,
            );
            await film.hold(0.8);
            // Pan: Shift+drag
            await view.keyboard.down("Shift");
            await film.hold(0.3);
            await film.drag(
                view,
                { x: c.x + 120, y: c.y + 110 },
                { x: c.x - 40, y: c.y + 90 },
                1.0,
            );
            await view.keyboard.up("Shift");
            await film.hold(0.6);
            // Zoom: the wheel, toward the pointer
            for (let i = 0; i < 6; i++) {
                await view.mouse.wheel(0, -120);
                await film.hold(0.12);
            }
            await film.hold(1.2);
        },
    },
    {
        id: "3d-camera-menu",
        kind: "still",
        async setup(ctx) {
            await seekInPage(ctx.page, 3, 0.5);
            const { view } = await open3d(ctx);
            await view.getByTestId("view3d-camera-menu").click();
            await ctx.wait(600);
            const menu = view.getByTestId("view3d-camera-picker");
            await menu.waitFor();
            return {
                box: ctx.union(
                    await ctx.around(view.getByTestId("view3d-camera-bar"), 16),
                    await ctx.around(menu, 16),
                ),
                target: view,
            };
        },
    },
    {
        id: "3d-cameras-panel",
        kind: "still",
        async setup(ctx) {
            await seekInPage(ctx.page, 3, 0.5);
            const { view } = await open3d(ctx);
            await view.getByTestId("view3d-camera-menu").click();
            await ctx.wait(400);
            await view.getByTestId("view3d-camera-edit").click();
            const panel = view.getByTestId("view3d-cameras-panel");
            await panel.waitFor();
            await view.mouse.move(ctx.window.width - 4, ctx.window.height / 2);
            await ctx.wait(800);
            return {
                box: ctx.union(
                    await ctx.around(view.getByTestId("view3d-camera-bar"), 16),
                    await ctx.around(panel, 16),
                ),
                target: view,
            };
        },
    },
    {
        id: "3d-settings",
        kind: "still",
        async setup(ctx) {
            await seekInPage(ctx.page, 3, 0.5);
            const { view } = await open3d(ctx);
            await view.getByTestId("view3d-settings-button").click();
            const panel = view.getByTestId("view3d-settings");
            await panel.waitFor();
            await view.mouse.move(4, ctx.window.height / 2);
            await ctx.wait(800);
            return {
                box: await ctx.around(panel, 16),
                target: view,
            };
        },
    },
    {
        id: "3d-marchers",
        kind: "still",
        // Close in on the band: the uniforms, instruments and flags
        async setup(ctx) {
            await seekInPage(ctx.page, 3, 0.5);
            const { view } = await open3d(ctx);
            // The Front row camera: close to the sideline, at the band's height
            await view.keyboard.press("Digit2");
            await view.mouse.move(ctx.window.width - 4, ctx.window.height / 2);
            await ctx.wait(3000);
            return {
                box: {
                    x: 200,
                    y: 330,
                    width: ctx.window.width - 400,
                    height: 440,
                },
                target: view,
            };
        },
    },
    {
        id: "3d-props-panel",
        kind: "still",
        // The Props panel with two props
        async setup(ctx) {
            const { page } = ctx;
            await drawRiser(page, { height: 1.2, color: AMBER, name: "Riser" });
            await propsPanel(page);
            await ctx.wait(800);
            return { box: await sidebarPanelBox(page) };
        },
    },
    {
        id: "3d-props-draw",
        kind: "clip",
        // Choose Rectangle in the Props panel, then drag on the field
        async setup(ctx) {
            const { page } = ctx;
            await seekInPage(page, 2, 0.02);
            await propsPanel(page);
            await tidy(page);
            const toScreen = await fieldToScreen(page);
            const { pps, center } = await riserSpot(page);
            this.from = toScreen({
                x: center.x - 4 * pps,
                y: center.y - 1.5 * pps,
            });
            this.to = toScreen({
                x: center.x + 4 * pps,
                y: center.y + 1.5 * pps,
            });
            const panel = await ctx.around(
                page.getByRole("button", { name: "Rectangle" }),
                40,
            );
            const field = await page.locator("canvas").first().boundingBox();
            // From the panel's tools to the drawing, and down to the notice
            return {
                box: ctx.union(panel, {
                    x: this.to.x + 140,
                    y: field.y + 4,
                    width: 1,
                    height: Math.min(field.height - 8, 640),
                }),
            };
        },
        async perform({ page, film, overlay }) {
            await overlay.enable();
            const rect = await page
                .getByRole("button", { name: "Rectangle" })
                .boundingBox();
            const at = {
                x: rect.x + rect.width / 2,
                y: rect.y + rect.height / 2,
            };
            await page.mouse.move(at.x + 120, at.y + 120);
            await film.hold(0.3);
            await film.moveTo(page, { x: at.x + 120, y: at.y + 120 }, at, 0.6);
            await page.mouse.click(at.x, at.y);
            await film.hold(0.6);
            await film.moveTo(page, at, this.from, 0.7);
            await film.hold(0.3);
            await film.drag(page, this.from, this.to, 1.2);
            await page.waitForTimeout(600);
            await film.hold(1.4);
        },
    },
    {
        id: "3d-props-edit",
        kind: "still",
        // The Edit Prop panel for a riser 1.2 m tall
        async setup(ctx) {
            const { page } = ctx;
            const { index } = await drawRiser(page, {
                height: 1.2,
                color: AMBER,
                name: "Riser",
            });
            await seekInPage(page, 2, 0.02);
            await propsPanel(page);
            await page
                .getByRole("button", { name: "Edit prop" })
                .nth(index)
                .click();
            await ctx.wait(800);
            return { box: await sidebarPanelBox(page) };
        },
    },
    {
        id: "3d-props-handles",
        kind: "clip",
        // A selected prop: turn it with the round handle, then resize it from a corner
        async setup(ctx) {
            const { page } = ctx;
            const { item } = await drawRiser(page, { color: AMBER });
            await seekInPage(page, 2, 0.02);
            const now = (await items(page)).find((i) => i.id === item.id);
            await page.mouse.click(now.screen.x, now.screen.y);
            await ctx.wait(600);
            const handles = await page.evaluate(() =>
                window.fieldTest.handles(),
            );
            if (!handles) throw new Error("the prop shows no handles");
            this.handles = handles;
            this.center = now.screen;
            const xs = Object.values(handles).map((h) => h.x);
            const ys = Object.values(handles).map((h) => h.y);
            const left = Math.min(...xs) - 120;
            const top = Math.min(...ys) - 110;
            const right = Math.max(...xs) + 140;
            const bottom = Math.max(...ys) + 130;
            return {
                box: {
                    x: left,
                    y: top,
                    width: right - left,
                    height: bottom - top,
                },
            };
        },
        async perform({ page, film, overlay }) {
            await overlay.enable();
            const rot = this.handles.rot;
            const c = this.center;
            await page.mouse.move(rot.x + 60, rot.y - 40);
            await film.hold(0.3);
            await film.moveTo(page, { x: rot.x + 60, y: rot.y - 40 }, rot, 0.5);
            // A quarter turn about the center, along an arc
            const r = Math.hypot(rot.x - c.x, rot.y - c.y);
            const a0 = Math.atan2(rot.y - c.y, rot.x - c.x);
            const end = {
                x: c.x + r * Math.cos(a0 + Math.PI / 6),
                y: c.y + r * Math.sin(a0 + Math.PI / 6),
            };
            await film.drag(page, rot, end, 1.0);
            await page.waitForTimeout(600);
            await film.hold(0.6);
            const handles = await page.evaluate(() =>
                window.fieldTest.handles(),
            );
            const se = handles.se;
            await film.moveTo(page, end, se, 0.5);
            await film.drag(page, se, { x: se.x + 40, y: se.y + 30 }, 0.9);
            await page.waitForTimeout(600);
            await film.hold(1.2);
        },
    },
    {
        id: "3d-props-block",
        kind: "still",
        // An amber riser, 1.2 m tall, drawn in the 3D View as a block behind the band
        async setup(ctx) {
            const { page } = ctx;
            await drawRiser(page, { height: 1.2, color: AMBER });
            await page.locator("#sidebar-launcher-props").click();
            await page.keyboard.press("Escape");
            await seekInPage(page, 2, 0.5);
            const { view } = await open3d(ctx);
            return {
                box: {
                    x: 200,
                    y: 120,
                    width: ctx.window.width - 400,
                    height: ctx.window.height - 300,
                },
                target: view,
            };
        },
    },
];

export default shots;

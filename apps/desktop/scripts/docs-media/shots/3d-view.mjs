// cspell:words filechooser Khronos
// The 3D View and props chapter (guides/3d-view/*).
//
// The 3D View is a window of its own: `open3d` opens it, sizes it to the capture window and
// waits for the scene to draw; a shot returns `{ box, target: view }` to film it. Props are
// drawn in the editor window with the Props panel's tools.

import path from "node:path";
import { fileURLToPath } from "node:url";

/** The demo silk Artwork, painted on the Standard silk's template (fork #973). */
const SILK_ARTWORK = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "assets",
    "silk-artwork.png",
);

/**
 * Opens 3D View settings › Performers, picks the Standard silk and imports
 * the demo Artwork; leaves the panel open and returns it.
 */
async function paintSilks(view) {
    await view.getByTestId("view3d-settings-button").click();
    const panel = view.getByTestId("view3d-settings");
    await panel.waitFor();
    await view.getByTestId("view3d-settings-tab-performers").click();
    await view
        .getByTestId("view3d-silk-shape-picker")
        .locator('[data-value="standard"]')
        .click();
    await view
        .getByTestId("view3d-silk-artwork-file")
        .setInputFiles(SILK_ARTWORK);
    await view
        .getByTestId("view3d-silk-artwork-name")
        .waitFor({ timeout: 20000 });
    return panel;
}

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

/** A chair model from the import tests (Khronos glTF sample, CC0) */
const CHAIR_GLB = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../src/showAssets/modelImport/__test__/fixtures/SheenChair.glb",
);
/** A flat test-pattern model from the import tests (Khronos glTF sample, CC0) */
const PATTERN_GLB = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../src/showAssets/modelImport/__test__/fixtures/TextureCoordinateTest.glb",
);

/**
 * Imports the chair through the Props panel's Import… and waits for its review; with `add`, adds
 * it to the show as "Chair" and waits for its tile under Imported.
 */
async function importChair(
    page,
    { add = false, file = CHAIR_GLB, name = "Chair" } = {},
) {
    await propsPanel(page);
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("import-model-tile").click();
    await (await chooser).setFiles(file);
    const review = page.getByTestId("model-import-review");
    await review
        .getByTestId("model-import-picture")
        .waitFor({ timeout: 60_000 });
    await page.waitForFunction(
        () => !document.querySelector('[aria-label="Preparing the model…"]'),
        null,
        { timeout: 60_000 },
    );
    if (!add) return;
    await review.getByTestId("model-import-name").fill(name);
    await review.getByTestId("model-import-add").click();
    await page
        .getByRole("button", { name: `Place ${name}` })
        .waitFor({ timeout: 30_000 });
}

/** Sets a number field in the Edit Prop panel. */
/**
 * Types into a prop's Width, Depth or Height box. A number is meters; text is typed as it is
 * (`20'`). The boxes show the show's units, and a bare number would be feet or inches there.
 */
async function setPropField(page, label, value) {
    const input = page.getByLabel(label, { exact: true }).first();
    await input.fill(typeof value === "number" ? `${value} m` : value);
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
            // A scrolled list's rows run on past the panel: stop at its edge
            return {
                x: r.left,
                y: r.top,
                width: r.width,
                bottom: Math.min(bottom, r.bottom - 24),
            };
        });
    return {
        x: Math.max(0, box.x - 12),
        y: Math.max(0, box.y - 12),
        width: box.width + 24,
        height: box.bottom - box.y + 36,
    };
}

/** The front ensemble view, opened from its row at the top of the Marchers panel. */
async function frontEnsembleView(page) {
    for (let i = 0; i < 4; i++) {
        if (await frontEnsembleViewOpen(page)) return;
        const row = page.getByTestId("front-ensemble-summary");
        if (await row.isVisible().catch(() => false))
            await row.getByRole("button").click();
        else await page.locator("#sidebar-launcher-marchers").click();
        await page.waitForTimeout(700);
    }
}

/** Whether the front ensemble view is showing: its presets in the body (no pit) or header */
async function frontEnsembleViewOpen(page) {
    for (const id of ["pit-preset-start", "pit-presets-button"])
        if (
            await page
                .getByTestId(id)
                .isVisible()
                .catch(() => false)
        )
            return true;
    return false;
}

/**
 * Applies a front ensemble preset, with its players: from the view's body while the show has no
 * pit, otherwise from the header's popover.
 */
async function applyPitPreset(page, size) {
    await frontEnsembleView(page);
    const start = page.getByTestId("pit-preset-start");
    if (await start.isVisible().catch(() => false)) {
        await start.getByTestId(`pit-preset-card-${size}`).click();
        await start.getByRole("button", { name: "Use this preset" }).click();
    } else {
        await page.getByTestId("pit-presets-button").click();
        const popover = page.getByRole("dialog", { name: "Presets" });
        await popover.getByTestId(`pit-preset-${size}`).click();
        await popover.getByRole("button", { name: "Apply" }).click();
    }
    await page.waitForTimeout(2500);
}

/** Closes the sidebar panel the front ensemble view lives in. */
async function closeMarchersPanel(page) {
    for (let i = 0; i < 3; i++) {
        const open =
            (await frontEnsembleViewOpen(page)) ||
            (await page
                .getByTestId("front-ensemble-summary")
                .isVisible()
                .catch(() => false));
        if (!open) return;
        await page.locator("#sidebar-launcher-marchers").click();
        await page.waitForTimeout(600);
    }
}

/** Zooms the field `steps` wheel notches about a screen point (ctrl-wheel, as a trackpad pinch). */
async function zoomFieldAt(page, at, steps) {
    await page.evaluate(
        ([x, y, n]) => {
            const target = document.elementFromPoint(x, y);
            for (let i = 0; i < n; i++)
                target.dispatchEvent(
                    new WheelEvent("wheel", {
                        deltaY: -100,
                        ctrlKey: true,
                        clientX: x,
                        clientY: y,
                        bubbles: true,
                        cancelable: true,
                    }),
                );
        },
        [at.x, at.y, steps],
    );
    await page.waitForTimeout(1200);
}

/**
 * A clip of one camera gesture in the 3D View, from the press box a few pages in, cropped to
 * the middle of the window (without the overlay's corners). `gesture(view, film, center)`
 * performs it.
 */
const viewClip = (gesture) => ({
    async setup(ctx) {
        await seekInPage(ctx.page, 3, 0.5);
        const { view } = await open3d(ctx);
        this.view = view;
        const b = ctx.whole;
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
        await overlayIn(this.view, box);
        await gesture(this.view, film, {
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
        });
    },
});

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
        id: "3d-controls",
        kind: "still",
        // The playback controls and readout at the 3D View's bottom left, a few pages in
        async setup(ctx) {
            await seekInPage(ctx.page, 3, 0.5);
            const { view } = await open3d(ctx);
            // The controls and the readout beside them (the readout ends about 432 points in)
            return {
                box: { x: 0, y: 935, width: 450, height: 65 },
                target: view,
            };
        },
    },
    {
        id: "3d-move-view",
        kind: "clip",
        // The default (Orbit) controls, one gesture: a plain drag orbits the camera
        ...viewClip(async (view, film, c) => {
            const a = { x: c.x + 130, y: c.y + 150 };
            const b = { x: c.x - 130, y: c.y + 150 };
            await view.mouse.move(a.x, a.y);
            await film.hold(0.5);
            await film.drag(view, a, b, 1.4);
            await film.hold(1.4);
        }),
    },
    {
        id: "3d-orbit-view",
        kind: "clip",
        // The default (Orbit) controls, one gesture: a right-drag pans across the field
        ...viewClip(async (view, film, c) => {
            const a = { x: c.x + 120, y: c.y + 120 };
            const b = { x: c.x - 120, y: c.y + 110 };
            await view.mouse.move(a.x, a.y);
            await film.hold(0.5);
            await film.drag(view, a, b, 1.6, { button: "right" });
            await film.hold(1.4);
        }),
    },
    {
        id: "3d-zoom-view",
        kind: "clip",
        // The default (Map) controls, one gesture: the wheel zooms toward the pointer, on the band
        ...viewClip(async (view, film, c) => {
            // The middle of the band, from the press box
            const z = { x: 800, y: 735 };
            await view.mouse.move(z.x, z.y);
            await film.hold(0.5);
            await view.evaluate(() => window.__docsOverlay.show("Scroll"));
            for (let i = 0; i < 3; i++) {
                await view.mouse.wheel(0, -120);
                await film.hold(0.25);
            }
            await film.hold(0.6);
            await view.evaluate(() => window.__docsOverlay.show(null));
            await film.hold(1.2);
        }),
    },
    {
        id: "3d-pick-seat",
        kind: "clip",
        // Pick a seat: select the armchair, click a seat in the visitors' stands, the view flies there
        async setup(ctx) {
            await seekInPage(ctx.page, 3, 0.5);
            const { view } = await open3d(ctx);
            this.view = view;
            return {
                // The top left of the window, the armchair and the visitors' stands: bigger on
                // the page than the whole window
                box: { x: 0, y: 36, width: 1200, height: 720 },
                target: view,
            };
        },
        async perform({ film, box }) {
            const view = this.view;
            await overlayIn(view, box);
            const b = await view.getByTestId("view3d-pick-seat").boundingBox();
            const at = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
            // A seat near the top of the visitors' stands, across the field from the press box,
            // so the view from it looks over the field, not the track
            const seat = { x: 780, y: 550 };
            await view.mouse.move(at.x + 160, at.y + 140);
            await film.hold(0.3);
            await film.moveTo(view, { x: at.x + 160, y: at.y + 140 }, at, 0.6);
            await view.mouse.click(at.x, at.y);
            await film.hold(0.6);
            await film.moveTo(view, at, seat, 0.9);
            // On the seat a beat, so its highlight shows before the click
            await film.hold(0.8);
            await view.mouse.click(seat.x, seat.y);
            await film.hold(0.3);
            // The pointer out of the view while it flies
            await view.mouse.move(1196, 400);
            await film.hold(3.0);
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
            await view.getByTestId("view3d-settings-tab-venue").click();
            await view.mouse.move(4, ctx.window.height / 2);
            await ctx.wait(800);
            // The panel from its title down to the Lighting row: the rows this still is about
            const top = await ctx.around(panel, 16);
            const lighting = await ctx.around(
                view.getByTestId("view3d-lighting-picker"),
                8,
            );
            return {
                box: {
                    x: top.x,
                    y: top.y,
                    width: top.width,
                    height: lighting.y + lighting.height - top.y,
                },
                target: view,
            };
        },
    },
    {
        id: "3d-venue-arena",
        kind: "still",
        // Narrower than the usual 1600 pixels: the crowd is busy, and a full-size still runs past 150 KB
        width: 1280,
        // Another venue for comparison: the Indoor arena under Show lights, from its first camera
        async setup(ctx) {
            await seekInPage(ctx.page, 3, 0.5);
            // A show name and credits, so the scoreboard shows them (not the file's name)
            await ctx.page.evaluate(() =>
                window.electron.sqlProxy(
                    "update workspace_settings set json_data = json_set(coalesce(json_data, '{}'), '$.projectName', 'Northern Lights', '$.designer', 'Sam Rivera', '$.client', 'Lakeside High School')",
                    [],
                    "run",
                ),
            );
            const { view, baked } = await open3d(ctx);
            await view.getByTestId("view3d-settings-button").click();
            await view.getByTestId("view3d-settings").waitFor();
            await view
                .getByTestId("view3d-venue-picker")
                .locator('[data-value="arena"]')
                .click();
            await baked(2);
            await ctx.wait(1500);
            await view
                .getByTestId("view3d-lighting-picker")
                .locator('[data-value="show"]')
                .click()
                .catch(() => {});
            await ctx.wait(1500);
            await view.getByTestId("view3d-settings-button").click();
            await tidy(view);
            await view.keyboard.press("Digit1");
            await view.mouse.move(ctx.window.width - 4, ctx.window.height / 2);
            await ctx.wait(3000);
            return {
                // The band, the stands and the whole scoreboard, without the judges' table in
                // front or the dark guard members at the front left
                box: { x: 360, y: 40, width: 1120, height: 560 },
                target: view,
            };
        },
    },
    {
        id: "3d-venue-mark-diesel",
        kind: "still",
        // Narrower than the usual 1600 pixels, like the arena: the crowd is busy
        width: 1280,
        covers: [
            "apps/desktop/src/view3d/core/kits/markDiesel.ts",
            "apps/desktop/src/view3d/core/kits/markDiesel",
        ],
        // Mark Diesel Stadium with its roof closed, from its first camera
        async setup(ctx) {
            await seekInPage(ctx.page, 3, 0.5);
            const { view, baked } = await open3d(ctx);
            await view.getByTestId("view3d-settings-button").click();
            await view.getByTestId("view3d-settings").waitFor();
            await view
                .getByTestId("view3d-venue-picker")
                .locator('[data-value="markDiesel"]')
                .click();
            await baked(2);
            await ctx.wait(1500);
            // The sample show's Day carries over, and Day opens the roof
            await view
                .getByTestId("view3d-lighting-picker")
                .locator('[data-value="roofClosed"]')
                .click();
            await ctx.wait(1500);
            await view.getByTestId("view3d-settings-button").click();
            await tidy(view);
            await view.keyboard.press("Digit1");
            await view.mouse.move(ctx.window.width - 4, ctx.window.height / 2);
            await ctx.wait(3000);
            return { box: ctx.whole, target: view };
        },
    },
    {
        id: "3d-silk-settings",
        kind: "still",
        // The flag silk rows of 3D View settings › Performers: the shapes, and imported Artwork
        async setup(ctx) {
            await seekInPage(ctx.page, 3, 0.5);
            const { view } = await open3d(ctx);
            await paintSilks(view);
            // the rows, labels and all: the shapes, and the Artwork under them
            const shapeRow = view
                .getByTestId("view3d-silk-shape-picker")
                .locator("xpath=..");
            const artworkRow = view
                .getByTestId("view3d-silk-artwork")
                .locator("xpath=..");
            // the shapes' row near the top of the panel, clear of its edge
            await shapeRow.evaluate((el) => {
                el.scrollIntoView({ block: "start" });
                let scroller = el.parentElement;
                while (
                    scroller &&
                    !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)
                )
                    scroller = scroller.parentElement;
                if (scroller) scroller.scrollTop -= 24;
            });
            await view.mouse.move(4, ctx.window.height / 2);
            await ctx.wait(1500);
            return {
                // tight below the Artwork, so the next row's control stays out
                box: ctx.union(
                    await ctx.around(shapeRow, 10),
                    await ctx.around(artworkRow, 4),
                ),
                target: view,
            };
        },
    },
    {
        id: "3d-silk-artwork",
        kind: "still",
        // The guard's flags in the Standard shape, painted with imported Artwork
        async setup(ctx) {
            await seekInPage(ctx.page, 3, 0.5);
            const { view } = await open3d(ctx);
            await paintSilks(view);
            await view.getByTestId("view3d-settings-button").click();
            await ctx.wait(1500);
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
        id: "3d-uniforms",
        kind: "still",
        // The band in Night Watch and the guard in Ultraviolet Fade, from the front row
        async setup(ctx) {
            await seekInPage(ctx.page, 3, 0.5);
            const { view } = await open3d(ctx);
            await view.getByTestId("view3d-settings-button").click();
            await view.getByTestId("view3d-settings").waitFor();
            await view
                .getByTestId("view3d-uniform-picker")
                .locator('[data-value="military"]')
                .click();
            await ctx.wait(1500);
            await view
                .getByTestId("view3d-guard-uniform-picker")
                .locator('[data-value="fade"]')
                .click();
            await ctx.wait(1500);
            await view.getByTestId("view3d-settings-button").click();
            // The Front row camera: close to the sideline, at the band's height
            await view.keyboard.press("Digit2");
            await view.mouse.move(ctx.window.width - 4, ctx.window.height / 2);
            await ctx.wait(3000);
            return {
                box: { x: 300, y: 340, width: 1000, height: 400 },
                target: view,
            };
        },
    },
    {
        id: "3d-marchers",
        kind: "still",
        // Close in on the band: brass with horns up, the drumline, a flag
        async setup(ctx) {
            await seekInPage(ctx.page, 3, 0.5);
            const { view } = await open3d(ctx);
            // The Front row camera: close to the sideline, at the band's height
            await view.keyboard.press("Digit2");
            await view.mouse.move(ctx.window.width - 4, ctx.window.height / 2);
            await ctx.wait(3000);
            // A tight crop on the drumline and the brass beside it (the capture is 2×)
            return {
                box: {
                    x: 700,
                    y: 440,
                    width: 680,
                    height: 250,
                },
                target: view,
            };
        },
    },
    {
        id: "3d-props-panel",
        kind: "still",
        // The Props panel with a riser drawn and a chair imported
        async setup(ctx) {
            const { page } = ctx;
            await drawRiser(page, { height: 1.2, color: AMBER, name: "Riser" });
            await importChair(page, { add: true });
            await propsPanel(page);
            // The pointer off the panel, so no row shows its hover color
            await page.mouse.move(1596, 996);
            await ctx.wait(800);
            // Down to the prop's row: the list has one prop, and the panel runs on empty below it
            const panel = await sidebarPanelBox(page);
            const row = await ctx.around(
                page.getByRole("button", { name: "Edit prop" }).first(),
                44,
            );
            return {
                box: { ...panel, height: row.y + row.height - panel.y },
            };
        },
    },
    {
        id: "3d-props-import-review",
        kind: "still",
        // The import review for a chair: its picture with the axis drawing, Rotate X, Y and Z
        // (the pointer on Rotate Z, so its axis lights up with the arrow), its size, Simplify
        async setup(ctx) {
            const { page } = ctx;
            await importChair(page);
            await page.getByTestId("model-import-rotate-z").hover();
            await ctx.wait(600);
            return { box: await sidebarPanelBox(page) };
        },
    },
    {
        id: "3d-props-import-compare",
        kind: "still",
        // The import review's Compare in 3D for the chair: the Original (39,936 triangles), with
        // Light and the far-away copy beside it in the switch, turned a little so the cushions'
        // detail shows
        async setup(ctx) {
            const { page } = ctx;
            await importChair(page);
            await page.getByTestId("model-import-compare").click();
            const dialog = page.getByTestId("model-compare");
            await dialog.waitFor({ timeout: 30_000 });
            await page.getByTestId("model-compare-other").click();
            // The Original is imported again, then drawn
            await ctx.wait(6000);
            const canvas = await page
                .getByTestId("model-compare")
                .locator("canvas")
                .boundingBox();
            if (canvas) {
                const x = canvas.x + canvas.width / 2;
                const y = canvas.y + canvas.height / 2;
                await page.mouse.move(x, y);
                await page.mouse.down();
                await page.mouse.move(x - 60, y + 10, { steps: 8 });
                await page.mouse.up();
            }
            await page.mouse.move(4, 4);
            await ctx.wait(1500);
            return {
                box: await ctx.around(page.getByRole("dialog"), 8),
            };
        },
    },
    {
        id: "3d-props-assets",
        kind: "still",
        // The Assets view: a chair on the field and a test pattern nothing uses, with the note
        async setup(ctx) {
            const { page } = ctx;
            await seekInPage(page, 2, 0.02);
            const toScreen = await fieldToScreen(page);
            const { center } = await riserSpot(page);
            await importChair(page, { add: true });
            await page.getByRole("button", { name: "Place Chair" }).click();
            await page.waitForTimeout(300);
            const at = toScreen(center);
            await page.mouse.click(at.x, at.y);
            await page.waitForTimeout(800);
            await importChair(page, {
                add: true,
                file: PATTERN_GLB,
                name: "Test pattern",
            });
            await page.getByTestId("imported-models-manage").click();
            await page.getByTestId("assets-view").waitFor();
            await page.mouse.move(1596, 996);
            // Let the pictures load
            await ctx.wait(1500);
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
            // A riser about 10 yards wide and 6 steps deep, big enough to see at page width
            this.from = toScreen({
                x: center.x - 8 * pps,
                y: center.y - 3 * pps,
            });
            this.to = toScreen({
                x: center.x + 8 * pps,
                y: center.y + 3 * pps,
            });
            const panel = await sidebarPanelBox(page);
            // Where the note that says how to draw shows: choose Rectangle off camera, measure
            // the note, cancel, and open the panel again
            await page.getByRole("button", { name: "Rectangle" }).click();
            const note = page.getByText("Drag on the field to draw the prop", {
                exact: false,
            });
            await note.waitFor();
            await page.waitForTimeout(400);
            const n = await ctx.around(
                page.getByRole("button", { name: "Cancel" }).last(),
                0,
            );
            const t = await note.boundingBox();
            await page.getByRole("button", { name: "Cancel" }).last().click();
            await page.waitForTimeout(400);
            await propsPanel(page);
            await page.mouse.move(800, 990);
            await page.waitForTimeout(600);
            // The panel, the rectangle and the note, and no more, so the panel's buttons and the
            // note read at page width
            const right = Math.max(t.x + t.width + 40, this.to.x + 80);
            const bottom = n.y + n.height + 32;
            return {
                box: {
                    x: panel.x,
                    y: panel.y,
                    width: right - panel.x,
                    height: bottom - panel.y,
                },
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
        id: "3d-props-polygon",
        kind: "clip",
        // Choose Polygon, click three corners, then double-click the fourth to finish
        async setup(ctx) {
            const { page } = ctx;
            await seekInPage(page, 2, 0.02);
            await propsPanel(page);
            await tidy(page);
            const toScreen = await fieldToScreen(page);
            const { pps, center } = await riserSpot(page);
            const at = (dx, dy) =>
                toScreen({ x: center.x + dx * pps, y: center.y + dy * pps });
            this.corners = [at(-6, -2), at(6, -2), at(4, 2.5), at(-4, 2.5)];
            // The whole panel's top (title, outline buttons and the line under them) and the
            // corners, starting below the toolbar
            const panel = await sidebarPanelBox(page);
            const hint = await ctx.around(
                page.getByText("No props yet", { exact: false }).first(),
                24,
            );
            const xs = this.corners.map((c) => c.x);
            const ys = this.corners.map((c) => c.y);
            const right = Math.max(...xs) + 160;
            const bottom = Math.max(
                Math.max(...ys) + 140,
                hint.y + hint.height,
            );
            return {
                box: {
                    x: panel.x,
                    y: panel.y,
                    width: right - panel.x,
                    height: bottom - panel.y,
                },
            };
        },
        async perform({ page, film, overlay }) {
            await overlay.enable();
            const b = await page
                .getByRole("button", { name: "Polygon" })
                .boundingBox();
            const at = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
            await page.mouse.move(at.x + 120, at.y + 120);
            await film.hold(0.3);
            await film.moveTo(page, { x: at.x + 120, y: at.y + 120 }, at, 0.6);
            await film.hold(0.3);
            await page.mouse.click(at.x, at.y);
            await film.hold(0.9);
            let from = at;
            const [c1, c2, c3, c4] = this.corners;
            for (const c of [c1, c2, c3]) {
                await film.moveTo(page, from, c, 0.5);
                await page.mouse.click(c.x, c.y);
                await film.hold(0.3);
                from = c;
            }
            await film.moveTo(page, from, c4, 0.5);
            await page.mouse.dblclick(c4.x, c4.y);
            await page.waitForTimeout(600);
            await film.hold(1.6);
        },
    },
    {
        id: "3d-props-edit",
        kind: "still",
        // The Edit Prop panel for a riser 20 × 6 ft, 4 ft tall
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
            // Round sizes, so the picture matches its alt text
            await setPropField(page, "Width", "20'");
            await setPropField(page, "Depth", "6'");
            await setPropField(page, "Height", "4'");
            // No focus ring left on the last field
            await page.evaluate(() => document.activeElement?.blur());
            await page.mouse.move(1596, 996);
            await ctx.wait(600);
            // From the panel's top to its last control, the Roll-out menu
            const panel = await sidebarPanelBox(page);
            const last = await ctx.around(
                page.getByText("Roll-out", { exact: true }).locator("xpath=.."),
                16,
            );
            return {
                box: {
                    ...panel,
                    height: last.y + last.height - panel.y,
                },
            };
        },
    },
    {
        id: "3d-props-handles",
        kind: "clip",
        // A prop with its handles shown: turn it with the round handle, then resize it from a corner
        async setup(ctx) {
            const { page } = ctx;
            const { item } = await drawRiser(page, { color: AMBER });
            await seekInPage(page, 2, 0.02);
            await tidy(page);
            // Zoom the field in on the prop, so its handles are easy to tell apart
            const before = (await items(page)).find((i) => i.id === item.id);
            await zoomFieldAt(page, before.screen, 3);
            const now = (await items(page)).find((i) => i.id === item.id);
            // Its handles show once asked for: right-click, Resize and turn (props epic step 2)
            await page.mouse.click(now.screen.x, now.screen.y, {
                button: "right",
            });
            await page.getByTestId("field-menu-resizeSelectedItem").click();
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
            // From the press box the block is behind the band, left of the 50: zoom toward it
            const block = { x: 633, y: 649 };
            await view.mouse.move(block.x, block.y);
            for (let i = 0; i < 5; i++) {
                await view.mouse.wheel(0, -120);
                await ctx.wait(150);
            }
            await view.mouse.move(ctx.window.width - 4, ctx.window.height / 2);
            await ctx.wait(3000);
            return {
                box: {
                    x: block.x - 450,
                    y: block.y - 290,
                    width: 900,
                    height: 540,
                },
                target: view,
            };
        },
    },
    {
        id: "3d-props-imported",
        kind: "still",
        // Three imported chairs behind the band, where the riser stands in 3d-props-block, drawn
        // in the 3D View as the model
        async setup(ctx) {
            const { page } = ctx;
            await seekInPage(page, 2, 0.02);
            const toScreen = await fieldToScreen(page);
            const { pps, center } = await riserSpot(page);
            await importChair(page, { add: true });
            for (const feet of [-5, 0, 5]) {
                await propsPanel(page);
                await page.getByRole("button", { name: "Place Chair" }).click();
                await page.waitForTimeout(300);
                const at = toScreen({ x: center.x + feet * pps, y: center.y });
                await page.mouse.click(at.x, at.y);
                await page.waitForTimeout(800);
            }
            await page.keyboard.press("Escape");
            await seekInPage(page, 2, 0.5);
            const { view } = await open3d(ctx);
            const chairs = { x: 633, y: 649 };
            await view.mouse.move(chairs.x, chairs.y);
            for (let i = 0; i < 7; i++) {
                await view.mouse.wheel(0, -120);
                await ctx.wait(150);
            }
            await view.mouse.move(ctx.window.width - 4, ctx.window.height / 2);
            // The model loads from the show, then draws in place of the blocks
            await ctx.wait(4000);
            return {
                box: {
                    x: chairs.x - 450,
                    y: chairs.y - 290,
                    width: 900,
                    height: 540,
                },
                target: view,
            };
        },
    },
    {
        id: "3d-front-ensemble-add",
        kind: "still",
        // The front ensemble's Add view: every model as a picture, by group, with search
        async setup(ctx) {
            const { page } = ctx;
            await frontEnsembleView(page);
            // The header's Add once there's a pit; an empty view's Add equipment otherwise
            await page
                .getByRole("button", { name: "Add", exact: true })
                .or(
                    page.getByRole("button", {
                        name: "Add equipment",
                        exact: true,
                    }),
                )
                .first()
                .click();
            // Off the pictures, so none is hovered
            await page.mouse.move(1596, 996);
            // Let the pictures load
            await ctx.wait(1500);
            return { box: await sidebarPanelBox(page) };
        },
    },
    {
        id: "3d-front-ensemble-field",
        kind: "still",
        // A Medium pit on the field, close enough to show the bars, drums and podium steps
        async setup(ctx) {
            const { page } = ctx;
            await applyPitPreset(page, "medium");
            await closeMarchersPanel(page);
            await tidy(page);
            // Pan the field up so the pit is mid-canvas, then zoom on the drum set
            await page.evaluate(() => {
                const c = document.elementFromPoint(800, 450);
                for (let i = 0; i < 6; i++)
                    c.dispatchEvent(
                        new WheelEvent("wheel", {
                            deltaY: 100,
                            clientX: 800,
                            clientY: 450,
                            bubbles: true,
                            cancelable: true,
                        }),
                    );
            });
            await ctx.wait(1000);
            const drumSet = (await items(page)).reduce((a, b) =>
                Math.abs(b.x - 900) + Math.abs(b.y - 990) <
                Math.abs(a.x - 900) + Math.abs(a.y - 990)
                    ? b
                    : a,
            );
            // Two notches: close enough for the bars and drums, with the whole pit and the
            // mixer behind it in frame
            await zoomFieldAt(page, drumSet.screen, 2);
            return {
                box: await ctx.around(
                    page.getByTestId("fieldCanvas").first(),
                    0,
                ),
            };
        },
    },
    {
        id: "3d-front-ensemble-3d",
        kind: "still",
        // A little under the usual 1600 pixels, to stay under 150 KB
        width: 1400,
        // The Medium pit in the 3D View: players at their instruments, the drum major on the podium
        async setup(ctx) {
            const { page } = ctx;
            await applyPitPreset(page, "medium");
            await closeMarchersPanel(page);
            const { view } = await open3d(ctx);
            // The Front row camera: down at the pit, from the audience side
            await view.keyboard.press("Digit2");
            await view.mouse.move(ctx.window.width - 4, ctx.window.height / 2);
            await ctx.wait(3000);
            // The pit and its players, with the band beyond
            return {
                box: {
                    x: 560,
                    y: 380,
                    width: 1040,
                    height: 400,
                },
                target: view,
            };
        },
    },
    {
        id: "3d-front-ensemble-presets",
        kind: "still",
        // The front ensemble view of a show with no pit: the presets (Medium chosen) and Build it
        // yourself in its body
        async setup(ctx) {
            const { page } = ctx;
            await tidy(page);
            await frontEnsembleView(page);
            const presets = page.getByTestId("pit-preset-start");
            await presets.waitFor();
            await presets.getByTestId("pit-preset-card-medium").click();
            await page.mouse.move(1596, 996);
            await ctx.wait(800);
            // The panel's header and both ways to start under it; the empty panel below stays out
            const panel = await sidebarPanelBox(page);
            const body = await ctx.around(
                page.getByRole("region", { name: "Or build it yourself" }),
                16,
            );
            return {
                box: {
                    x: panel.x,
                    y: panel.y,
                    width: panel.width - 12,
                    height: body.y + body.height - panel.y,
                },
            };
        },
    },
    {
        id: "3d-front-ensemble-summary",
        kind: "still",
        // The Front ensemble and podiums row at the top of the Marchers panel, for a Medium pit
        async setup(ctx) {
            const { page } = ctx;
            await applyPitPreset(page, "medium");
            await closeMarchersPanel(page);
            await tidy(page);
            await page.locator("#sidebar-launcher-marchers").click();
            const row = page.getByTestId("front-ensemble-summary");
            await row.waitFor();
            await page.mouse.move(1596, 996);
            await ctx.wait(800);
            const panel = await sidebarPanelBox(page);
            const r = await ctx.around(row, 16);
            return {
                box: {
                    x: panel.x,
                    y: panel.y,
                    width: panel.width,
                    height: r.y + r.height - panel.y,
                },
            };
        },
    },
    {
        id: "venue-on-field",
        kind: "still",
        // The editor's field with the venue on it (Faint), and the Venue button's menu open
        // beside the display bar (fork #1207)
        covers: [
            "apps/desktop/src/components/canvas/display/VenueButton.tsx",
            "apps/desktop/src/field/three/venueUnderlay",
        ],
        async setup(ctx) {
            const { page } = ctx;
            await tidy(page);
            const button = page.getByTestId("field-display-venue");
            await button.click();
            await page.getByTestId("field-display-venue-faint").click();
            await page.getByTestId("field-display-venue-around-edge").click();
            await page.mouse.move(4, ctx.window.height / 2);
            await ctx.wait(1500);
            const menu = page
                .locator("[data-radix-popper-content-wrapper]")
                .first();
            return {
                box: ctx.union(
                    await ctx.around(
                        page.getByTestId("fieldCanvas").first(),
                        0,
                    ),
                    await ctx.around(menu, 12),
                ),
            };
        },
    },
    {
        id: "venue-on-field-stands",
        kind: "still",
        // Zoomed out with Soft and Stands: the stadium around the field, from above
        async setup(ctx) {
            const { page } = ctx;
            await tidy(page);
            await page.getByTestId("field-display-venue").click();
            await page.getByTestId("field-display-venue-soft").click();
            await page.getByTestId("field-display-venue-around-stands").click();
            await page.keyboard.press("Escape");
            // No tooltip on the button the menu closed back to
            await ctx.wait(400);
            await page.evaluate(() =>
                /** @type {HTMLElement | null} */ (
                    document.activeElement
                )?.blur(),
            );
            const canvas = page.getByTestId("fieldCanvas").first();
            const c = await canvas.boundingBox();
            // Out about three times (ctrl-wheel, as a trackpad pinch)
            await page.evaluate(
                ([x, y]) => {
                    const target = document.elementFromPoint(x, y);
                    for (let i = 0; i < 6; i++)
                        target.dispatchEvent(
                            new WheelEvent("wheel", {
                                deltaY: 100,
                                ctrlKey: true,
                                clientX: x,
                                clientY: y,
                                bubbles: true,
                                cancelable: true,
                            }),
                        );
                },
                [c.x + c.width / 2, c.y + c.height / 2],
            );
            await page.mouse.move(4, ctx.window.height / 2);
            await page.keyboard.press("Escape");
            await ctx.wait(2000);
            return { box: await ctx.around(canvas, 0) };
        },
    },
    {
        id: "venue-camera-on-field",
        kind: "still",
        // The 3D View's camera on the 2D field (#1227): the camera chip, its wedge and the ring it
        // looks at, zoomed out, with the 3D View open on its default camera
        covers: [
            "apps/desktop/src/field/three/venueUnderlay/CameraHandle.tsx",
            "apps/desktop/src/field/three/venueUnderlay/CameraMarkerLayer.tsx",
        ],
        async setup(ctx) {
            const { page } = ctx;
            await tidy(page);
            await page.getByTestId("field-display-venue").click();
            await page.getByTestId("field-display-venue-faint").click();
            await page.getByTestId("field-display-venue-around-edge").click();
            await page.getByTestId("field-display-venue-camera").click();
            await page.keyboard.press("Escape");
            await open3d(ctx);
            await page.bringToFront();
            await page.evaluate(() =>
                /** @type {HTMLElement | null} */ (
                    document.activeElement
                )?.blur(),
            );
            const canvas = page.getByTestId("fieldCanvas").first();
            const c = await canvas.boundingBox();
            // Out (ctrl-wheel, as a trackpad pinch), so the camera in front of the field shows
            await page.evaluate(
                ([x, y]) => {
                    const target = document.elementFromPoint(x, y);
                    for (let i = 0; i < 5; i++)
                        target.dispatchEvent(
                            new WheelEvent("wheel", {
                                deltaY: 100,
                                ctrlKey: true,
                                clientX: x,
                                clientY: y,
                                bubbles: true,
                                cancelable: true,
                            }),
                        );
                },
                [c.x + c.width / 2, c.y + c.height / 2],
            );
            await page.getByTestId("fieldView3dCameraMove").waitFor();
            await page.mouse.move(4, ctx.window.height / 2);
            await ctx.wait(1500);
            return { box: await ctx.around(canvas, 0) };
        },
    },
];

export default shots;

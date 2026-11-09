// cspell:words rawvideo
// The What's new clips. Each sets things up off camera (`prepare`, which returns the region to
// film and the window it's in) and then films itself frame by frame (`perform`, with `film`
// from record.mjs: `freeze`, `skip`, `frame`, `hold`, `drag`). Time only moves when `film`
// moves it, so a clip may wait in real time (for the database, the audio to start) freely.
// `show` picks the show: the demo (web/public/demos/part1-demo.dots, converted to timelines) or
// "line" (line-test.dots, the timeline clip's show). The window is 1600 × 1000 unless --window says otherwise. `pending`
// names the PR a clip waits on:
// it's recorded only when named.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** The nth page box on the timeline ruler, in order. */
const pageBox = (page, n) => page.locator("[data-timeline-range-page]").nth(n);

/** A paused playhead `fraction` of the way into the nth page box (a click in the clip lane seeks). */
async function seekInPage(page, n, fraction) {
    const b = await pageBox(page, n).boundingBox();
    if (!b) throw new Error(`no page box ${n} on the timeline`);
    await page.mouse.click(b.x + b.width * fraction, b.y + b.height + 50);
    await page.waitForTimeout(600);
}

async function box(locator) {
    const b = await locator.boundingBox();
    if (!b) throw new Error(`not on screen: ${locator}`);
    return b;
}

const union = (...boxes) => {
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
const even = (n) => Math.round(n / 2) * 2;

/** Closes notices that would sit over the clip (the low-quality field notice, toasts). */
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

const marchers = (page) =>
    page.evaluate(() =>
        window.fieldTest
            .marchers()
            .filter((m) => m.onScreen)
            .map((m) => ({
                id: m.id,
                label: m.label,
                fx: m.x,
                fy: m.y,
                ...m.screen,
            })),
    );

/** The marchers of one section (label prefix): the biggest one that stands close together. */
async function compactSection(page, maxWidth = 360) {
    const groups = new Map();
    for (const m of await marchers(page)) {
        const prefix = m.label.replace(/\d+$/, "");
        groups.set(prefix, [...(groups.get(prefix) ?? []), m]);
    }
    const ranked = [...groups.values()]
        .map((ms) => ({ ms, bounds: union(...ms) }))
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
    return ms;
}

/**
 * Plays from the start of page box `from` to partway into page box `to`: a click on a page's box
 * puts the start flag there, a click in the clip lane moves the playhead, and Play plays from
 * the start flag to the playhead. Waits (in real time) for the audio clock to start.
 */
async function playFrom(page, from, to = from + 2, fraction = 0.6) {
    await pageBox(page, from).click();
    await page.waitForTimeout(400);
    await seekInPage(page, to, fraction);
    // The pointer out of the way, onto the transport
    const transport = await box(page.getByTestId("timeline-transport"));
    await page.mouse.move(transport.x + transport.width - 2, transport.y + 2);
    await page
        .getByTestId("timeline-transport")
        .getByRole("button", { name: /^Play/ })
        .first()
        .click();
    await page.waitForTimeout(800);
}

/** Opens the 3D View, fills the screen with it, waits for it to draw; returns its page. */
async function open3dView(app, page, keepWindowsLive, windowSize) {
    const opened = app.waitForEvent("window");
    await page.getByRole("button", { name: "Open 3D View" }).click();
    const view = await opened;
    const logs = [];
    view.on("console", (m) => logs.push(m.text()));
    await view.waitForLoadState("domcontentloaded");
    await app.evaluate(({ BrowserWindow }, size) => {
        const w = BrowserWindow.getAllWindows().find((x) =>
            x.getURL().includes("view=3d"),
        );
        w.setContentBounds({ x: 0, y: 0, ...size });
        w.show();
        w.focus();
    }, windowSize);
    await keepWindowsLive(app);
    await view.getByTestId("view3d-scene").waitFor({ timeout: 60000 });
    const baked = async (count) => {
        for (
            let i = 0;
            i < 120 && logs.filter((l) => l.includes("baked")).length < count;
            i++
        )
            await view.waitForTimeout(500);
    };
    await baked(1);
    await tidy(view);
    await view.waitForTimeout(1500);
    return { view, baked };
}

/**
 * Lifts the 3D View's camera, off camera, to a higher box angle than the press box seat: an
 * orbit (Shift) drag of `tilt` px tilts it down onto the field, then a plain drag of `pan` px pans it
 * back, so the whole band sits mid-field. Each drag is slow, so the orbit's momentum is small.
 */
async function higherBoxAngle(view, { tilt = 65, pan = 90 } = {}) {
    const scene = await box(view.getByTestId("view3d-scene"));
    const c = { x: scene.x + scene.width / 2, y: scene.y + scene.height / 2 };
    await view.keyboard.down("Shift");
    await quickDrag(view, c, { x: c.x, y: c.y + tilt }, 40);
    await view.keyboard.up("Shift");
    await view.waitForTimeout(2500);
    if (!pan) return;
    await quickDrag(view, c, { x: c.x, y: c.y - pan }, 30);
    await view.waitForTimeout(2500);
}

/**
 * The 3D scene above the window's bottom bar: the field and the stands. With `zoom`, a
 * `zoom.height` share of the scene's height centred at `zoom.centerY` of it (closer in).
 */
async function sceneFrame(view, frameAround, zoom) {
    const scene = await box(view.getByTestId("view3d-scene"));
    const height = scene.height * (zoom?.height ?? 0.64);
    const width = height * 1.6;
    const y = zoom
        ? scene.y + scene.height * zoom.centerY - height / 2
        : scene.y + scene.height - 45 - height;
    return frameAround({
        x: scene.x + (scene.width - width) / 2,
        y,
        width,
        height,
    });
}

/** Field units to screen points, from the marchers on screen (the field is drawn without rotation). */
async function fieldToScreen(page) {
    const ms = await marchers(page);
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

/** Field pixels per meter: steps across the field (160) and the step size. */
async function fieldPixelsPerMeter(page) {
    const [row] = (
        await page.evaluate(() =>
            window.electron.sqlProxy(
                "select json_data from field_properties",
                [],
                "all",
            ),
        )
    ).rows;
    const fp = JSON.parse(row.json_data ?? row[0]);
    return fp.width / 160 / (fp.stepSizeInches * 0.0254);
}

/**
 * The box (window points) around the riser in the 3D View, found by its color: lit and shaded,
 * the amber draws about (190, 160, 60) to (220, 200, 100). Brass is the same hue in small spots,
 * so only the pixels around the densest 40 px cell (the riser) count. Null if none.
 */
async function riserInView(view) {
    const { width, height } = await view.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
    }));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "whats-new-riser-"));
    const png = path.join(dir, "view.png");
    await view.screenshot({ path: png });
    const rgb = execFileSync(
        "ffmpeg",
        [
            "-loglevel",
            "error",
            "-i",
            png,
            "-vf",
            `scale=${width}:${height}`,
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-",
        ],
        { maxBuffer: width * height * 3 + 1024 },
    );
    fs.rmSync(dir, { recursive: true, force: true });
    const hits = [];
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 3;
            const [r, g, b] = [rgb[i], rgb[i + 1], rgb[i + 2]];
            if (
                r >= 150 &&
                g / r >= 0.78 &&
                g / r <= 0.95 &&
                b / r >= 0.25 &&
                b / r <= 0.5
            )
                hits.push([x, y]);
        }
    if (hits.length < 30) return null;
    const CELL = 40;
    const cells = new Map();
    for (const [x, y] of hits) {
        const key = `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
        cells.set(key, (cells.get(key) ?? 0) + 1);
    }
    const [densest] = [...cells].sort((a, b) => b[1] - a[1])[0];
    const [cx, cy] = densest.split(",").map((v) => (Number(v) + 0.5) * CELL);
    const near = hits.filter(
        ([x, y]) => Math.abs(x - cx) < 5 * CELL && Math.abs(y - cy) < 5 * CELL,
    );
    const xs = near.map(([x]) => x);
    const ys = near.map(([, y]) => y);
    return union(
        { x: Math.min(...xs), y: Math.min(...ys) },
        { x: Math.max(...xs), y: Math.max(...ys) },
    );
}

/** The bright color the riser is painted (props have a color). */
const RISER_COLOR = "rgba(255, 184, 0, 1)";
/** A marcher's reach, in meters, for the overlap check. */
const MARCHER_RADIUS_M = 0.5;

/**
 * A riser in open field behind the band: drawn on page 2 near the back sideline, and by the end
 * of page 3 slid along the back and turned 90°, well clear of the guard. Returns the prop's id.
 */
// eslint-disable-next-line max-lines-per-function
async function drawRiserBehindTheBand(page) {
    const panel = async () => {
        if (
            !(await page
                .getByRole("button", { name: "Rectangle" })
                .isVisible()
                .catch(() => false))
        ) {
            await page.locator("#sidebar-launcher-props").click();
            await page.waitForTimeout(500);
        }
    };
    const setField = async (label, value) => {
        const input = page.getByLabel(label, { exact: true }).first();
        await input.fill(String(value));
        await input.press("Enter");
        await page.waitForTimeout(600);
    };
    const items = () => page.evaluate(() => window.fieldTest.items?.() ?? []);
    await seekInPage(page, 2, 0.05);
    const toScreen = await fieldToScreen(page);
    const ppm = await fieldPixelsPerMeter(page);
    const front = await page.evaluate(() =>
        window.electron.sqlProxy(
            "select json_data from field_properties",
            [],
            "all",
        ),
    );
    const fp = JSON.parse(front.rows[0].json_data ?? front.rows[0][0]);
    const pps = fp.width / 160;
    const cx = fp.centerFrontPoint.xPixels;
    const backY = (steps) => fp.centerFrontPoint.yPixels - steps * pps;
    // 8 m × 2 m, 74 steps behind the front sideline (the guard is within 55), left of center
    const half = { w: (8 * ppm) / 2, d: (2 * ppm) / 2 };
    const start = { x: cx - 20 * pps, y: backY(74) };
    const end = { x: cx + 18 * pps, y: backY(72) };

    await panel();
    const had = new Set((await items()).map((item) => item.id));
    await page.getByRole("button", { name: "Rectangle" }).click();
    await page.waitForTimeout(300);
    await quickDrag(
        page,
        toScreen({ x: start.x - half.w, y: start.y - half.d }),
        toScreen({ x: start.x + half.w, y: start.y + half.d }),
    );
    const drawnIndex = () =>
        items().then((all) => all.findIndex((item) => !had.has(item.id)));
    for (let i = 0; i < 20 && (await drawnIndex()) < 0; i++)
        await page.waitForTimeout(250);
    if ((await drawnIndex()) < 0) throw new Error("the prop wasn't drawn");
    const id = (await items())[await drawnIndex()].id;
    const edit = async () =>
        page.getByRole("button", { name: "Edit prop" }).nth(await drawnIndex());

    await panel();
    await (await edit()).click();
    await page.waitForTimeout(500);
    await setField("Height", 1.2);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    // The color, straight into the show: the 3D View, opened afterwards, reads it
    await page.evaluate(
        ([color, itemMarcher]) =>
            window.electron.sqlProxy(
                "update items set color = ? where marcher_id = ?",
                [color, itemMarcher],
                "run",
            ),
        [RISER_COLOR, id],
    );

    await seekInPage(page, 3, 1);
    await panel();
    await (await edit()).click();
    await page.waitForTimeout(500);
    await setField("Rotation", 90);
    await setField("Transition", 8);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const now = (await items())[await drawnIndex()].screen;
    await page.mouse.click(now.x, now.y);
    await page.waitForTimeout(300);
    await quickDrag(page, now, toScreen(end));
    await page.waitForTimeout(800);
    await page.locator("#sidebar-launcher-props").click();
    await page.keyboard.press("Escape");
    return { id, ppm };
}

/**
 * Throws if the riser overlaps a marcher on the field now: each marcher (a circle of
 * MARCHER_RADIUS_M) against the riser's turned rectangle, in field units.
 */
async function checkRiserClear(page, id, ppm, frame, positions) {
    const { item, ms } = await page.evaluate((itemId) => {
        const items = window.fieldTest.items?.() ?? [];
        // Props are marchers too: leave them out
        const props = new Set(items.map((i) => i.id));
        return {
            item: items.find((i) => i.id === itemId),
            ms: window.fieldTest
                .marchers()
                .filter((m) => !props.has(m.id))
                .map((m) => ({ label: m.label, x: m.x, y: m.y })),
        };
    }, id);
    if (!item) throw new Error(`frame ${frame}: the riser isn't on the field`);
    positions.push(item);
    const r = MARCHER_RADIUS_M * ppm;
    const angle = (-item.rotation * Math.PI) / 180;
    const [hw, hd] = [(item.width * ppm) / 2 + r, (item.depth * ppm) / 2 + r];
    for (const m of ms) {
        const dx = m.x - item.x;
        const dy = m.y - item.y;
        const lx = dx * Math.cos(angle) - dy * Math.sin(angle);
        const ly = dx * Math.sin(angle) + dy * Math.cos(angle);
        if (Math.abs(lx) < hw && Math.abs(ly) < hd)
            throw new Error(`frame ${frame}: ${m.label} overlaps the riser`);
    }
}

export const CLIPS = [
    {
        name: "timeline",
        show: "line",
        async prepare({ page }) {
            await tidy(page);
            // Move 1 runs over page boxes 1 and 2; its rows are the last in the timeline
            const pages = union(
                await box(pageBox(page, 1)),
                await box(pageBox(page, 2)),
            );
            const lastRow = await box(page.getByText("Move 2").first());
            const timeline = await box(page.getByTestId("timeline-pane"));
            /** Everywhere the marchers stand during Move 1, on screen. */
            const spread = async () => {
                const seen = [];
                const at = [1, 2].flatMap((n) =>
                    [0.02, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 0.99].map((f) => [
                        n,
                        f,
                    ]),
                );
                for (const [n, f] of at) {
                    await seekInPage(page, n, f);
                    seen.push(...(await marchers(page)));
                }
                return union(...seen);
            };
            // Zoom the field in on the marchers (a pinch, at their middle), then pan them to
            // just above Move 1's rows, so one close frame holds both
            const before = await spread();
            const middle = (b) => ({
                x: b.x + b.width / 2,
                y: b.y + b.height / 2,
            });
            const zoom = 1.6;
            await page.mouse.move(middle(before).x, middle(before).y);
            await page.keyboard.down("Control");
            // 0.99 per half unit of deltaY (view.ts): 1.6× is deltaY 2·log(1.6)/log(0.99)
            const total = (2 * Math.log(zoom)) / Math.log(0.99);
            for (let i = 0; i < 10; i++) {
                await page.mouse.wheel(0, total / 10);
                await page.waitForTimeout(30);
            }
            await page.keyboard.up("Control");
            await page.waitForTimeout(400);
            /** A middle-button drag on the field, which pans it. */
            const pan = async (from, to) => {
                await page.mouse.move(from.x, from.y);
                await page.mouse.down({ button: "middle" });
                for (let i = 1; i <= 20; i++) {
                    await page.mouse.move(
                        from.x + ((to.x - from.x) * i) / 20,
                        from.y + ((to.y - from.y) * i) / 20,
                    );
                    await page.waitForTimeout(20);
                }
                await page.mouse.up({ button: "middle" });
                await page.waitForTimeout(400);
            };
            const zoomed = await spread();
            await pan(middle(zoomed), {
                x: pages.x + pages.width / 2,
                y: timeline.y - 40 - zoomed.height / 2,
            });
            // The frame: the marchers and Move 1's rows, cut off just under the last row, and
            // clear of the field's tool rail (the field pans right until it is)
            const rail = timeline.x + 60;
            const bottom = Math.min(
                lastRow.y + lastRow.height + 14,
                timeline.y + timeline.height,
            );
            let frame;
            for (let tries = 0; tries < 6; tries++) {
                const seen = grow(await spread(), 36);
                const left = Math.min(seen.x, pages.x - 24);
                const right = Math.max(
                    seen.x + seen.width,
                    pages.x + pages.width + 24,
                );
                const width = Math.max(right - left, (bottom - seen.y) * 1.6);
                const x = (left + right) / 2 - width / 2;
                frame = { x, width };
                if (x >= rail - 1) break;
                const m = middle(seen);
                await pan(m, { x: m.x + rail - x + 6, y: m.y });
            }
            const { x, width } = frame;
            if (x < rail - 1)
                throw new Error(
                    "the marchers don't fit clear of the tool rail",
                );
            const height = width / 1.6;
            return {
                box: {
                    x: even(x),
                    y: even(bottom - height),
                    width: even(width),
                    height: even(height),
                },
            };
        },
        async perform({ page, film }) {
            await film.freeze();
            // Move 1's 16 counts (8 s at 120 bpm), from the second page, playing a couple of
            // counts past it: still playing at the end (a stopped show draws its marchers
            // differently)
            await playFrom(page, 1, 3, 0.15);
            await film.hold(8 + 0.6);
        },
    },
    {
        name: "shapes",
        // A box, a line, then an arc for the same section, each placed; the drags cross yard
        // lines, so the snapping guides show.
        async prepare({ page, frameAround }) {
            await tidy(page);
            await seekInPage(page, 2, 0.98);
            const { ms, bounds } = await compactSection(page);
            this.prefix = ms[0].label.replace(/\d+$/, "");
            await page.getByRole("tab", { name: /shapes/i }).click();
            await page.waitForTimeout(500);
            const { x, y, width: w } = bounds;
            this.draws = [
                [
                    "block",
                    { x: x + w * 0.15, y: y - 190 },
                    { x: x + w * 0.85, y: y - 80 },
                ],
                [
                    "line",
                    { x: x - 30, y: y - 40 },
                    { x: x + w + 30, y: y - 10 },
                ],
                [
                    "arc",
                    { x: x + w * 0.05, y: y - 110 },
                    { x: x + w * 0.95, y: y - 110 },
                ],
            ];
            await selectSection(page, this.prefix);
            const area = union(
                bounds,
                ...this.draws.flatMap(([, a, b]) => [a, b]),
            );
            return { box: frameAround(grow(area, 80), 720) };
        },
        async perform({ page, film }) {
            // Not frozen: the shape tool times its presses, so it runs in real time. The drags
            // are still even, one step per frame.
            await film.hold(0.3);
            for (const [i, [kind, a, b]] of this.draws.entries()) {
                if (i > 0) {
                    // Close the placed shape, then select the section where it stands now
                    await page.keyboard.press("Escape");
                    await page.keyboard.press("Escape");
                    await selectSection(page, this.prefix);
                }
                await page.getByTestId(`shapes-tab-${kind}`).click();
                await film.hold(0.2);
                await film.drag(page, a, b, 1.1);
                await film.hold(0.4);
                await page
                    .getByRole("button", { name: "Place", exact: true })
                    .first()
                    .click();
                // The placing writes the show: wait for it in real time, then hold on it
                await page.waitForTimeout(500);
                await film.hold(0.9);
            }
            await film.hold(0.6);
        },
    },
    {
        name: "view3d",
        async prepare({ app, page, frameAround, keepWindowsLive, windowSize }) {
            await tidy(page);
            const { view, baked } = await open3dView(
                app,
                page,
                keepWindowsLive,
                windowSize,
            );
            // The Pro dome venue, then wait for it to draw
            await view.getByTestId("view3d-settings-button").click();
            await view.waitForTimeout(500);
            await view
                .getByTestId("view3d-venue-picker")
                .locator('[data-value="pro"]')
                .click();
            await baked(2);
            await view.waitForTimeout(2000);
            await view.getByTestId("view3d-settings-button").click();
            await tidy(view);
            await higherBoxAngle(view);
            await view.waitForTimeout(800);
            this.view = view;
            return {
                // The whole field, from above the press box
                box: await sceneFrame(view, frameAround, {
                    height: 0.74,
                    centerY: 0.53,
                }),
                target: view,
            };
        },
        async perform({ page, film }) {
            await film.freeze();
            // Pages 3 to 5 are all moves: a beat in, the band is mid-march
            await playFrom(page, 3, 5);
            await film.skip(0.5);
            await film.hold(6 + 0.6);
        },
    },
    {
        name: "props",
        async prepare({
            app,
            page,
            frameAround,
            keepWindowsLive,
            windowSize,
            log,
        }) {
            await tidy(page);
            const { id, ppm } = await drawRiserBehindTheBand(page);
            this.riser = { id, ppm };
            this.log = log;
            await pageBox(page, 3).click();
            await tidy(page);
            const { view } = await open3dView(
                app,
                page,
                keepWindowsLive,
                windowSize,
            );
            // The show's venue (the high-school stadium) seen from its press box is low enough
            // that the guard's flags, though well in front, rise over the riser: a higher angle
            await higherBoxAngle(view, { tilt: 45, pan: 0 });
            // Where the riser is before and after it moves (the 3D View follows the paused
            // playhead), so the frame holds its whole slide and turn
            const seen = [];
            for (const [n, f] of [
                [3, 0.02],
                [4, 0.02],
            ]) {
                await seekInPage(page, n, f);
                await view.waitForTimeout(1500);
                const b = await riserInView(view);
                if (!b) throw new Error("can't find the riser in the 3D View");
                seen.push(b);
            }
            return {
                // Closer in, on the riser and the band in front of it
                box: frameAround(grow(union(...seen), 120), 760),
                target: view,
            };
        },
        async perform({ page, film }) {
            await film.freeze();
            // Page 3: the riser slides along the back and turns while the band marches
            await playFrom(page, 3, 4, 0.2);
            const positions = [];
            await film.hold(6 + 0.6, (i) =>
                checkRiserClear(
                    page,
                    this.riser.id,
                    this.riser.ppm,
                    i,
                    positions,
                ),
            );
            const first = positions[0];
            const last = positions.at(-1);
            if (
                Math.hypot(last.x - first.x, last.y - first.y) < 1 &&
                last.rotation === first.rotation
            )
                throw new Error(
                    "the riser never moved: the overlap check saw a still prop",
                );
            this.log(
                `   riser clear of every marcher in all ${positions.length} frames (moved ${Math.round(Math.hypot(last.x - first.x, last.y - first.y))} field px, turned ${last.rotation - first.rotation}°)`,
            );
        },
    },
    {
        name: "tempo",
        show: "tempo",
        // Edit music (tempo mode) on tempo-changes.dots, measures 6–11 in the timeline pane: it
        // plays at ♩118, slows gradually to ♩81 (a ramp from the middle of measure 7 to the end
        // of measure 9, a 2/4 bar), then jumps back to ♩118 at measure 10. The playhead slows
        // through the ramp and picks up again after it.
        async prepare({ page, log }) {
            await tidy(page);
            await page.getByTestId("timeline-tempo-mode").click();
            await page.waitForTimeout(1500);
            const labels = page.getByTestId("tempo-label");
            const texts = await labels.allTextContents();
            // ♩118 from count 1, the ramp ♩118→81 from count 28, back to ♩118 on count 35
            if (
                texts.length < 3 ||
                !/118.*81/.test(texts[1]) ||
                !/118/.test(texts[2])
            )
                throw new Error(
                    `unexpected tempo labels: ${texts.join(" | ")}`,
                );
            const ramp = labels.nth(1);
            const back = labels.nth(2);
            // The pane's left 16:10, so the lane names and measure numbers read on the slide
            const pane = await box(page.getByTestId("timeline-pane"));
            const band = await box(page.getByTestId("tempo-band"));
            const width = pane.height * 1.6;
            const right = pane.x + width;
            // Counts 22–44 (measures 6–11) across the lanes
            const counts = 23;
            const perCount = async () =>
                ((await box(back)).x - (await box(ramp)).x) / 7;
            const wanted = (right - band.x - 12) / counts;
            await page.mouse.move(band.x + 40, band.y + 100);
            await page.keyboard.down("Control");
            for (let i = 0; i < 80 && (await perCount()) < wanted; i++) {
                await page.mouse.wheel(0, -4);
                await page.waitForTimeout(100);
            }
            await page.keyboard.up("Control");
            await page.waitForTimeout(600);
            const ppc = await perCount();
            // Scroll so count 22 is just inside the lanes (set up off camera)
            const count22 = (await box(ramp)).x - 6 * ppc;
            await page
                .getByTestId("timeline-viewport")
                .evaluate(
                    (v, by) => (v.scrollLeft += by),
                    count22 - (band.x + 8),
                );
            await page.waitForTimeout(600);
            log(
                `   ${ppc.toFixed(1)} px a count (wanted ${wanted.toFixed(1)})`,
            );
            if ((await box(back)).x + 3 * ppc > right)
                throw new Error("the return to ♩118 isn't in the frame");
            // Playing starts on count 25, three counts before the ramp
            const rampX = (await box(ramp)).x;
            this.playAt = {
                x: rampX - 3 * ppc + 2,
                y: band.y + band.height - 30,
            };
            await page.mouse.move(800, 200);
            await page.waitForTimeout(400);
            return {
                box: {
                    x: even(pane.x),
                    y: even(pane.y),
                    width: even(width),
                    height: even(pane.height),
                },
            };
        },
        async perform({ page, film }) {
            await film.freeze();
            // A click in the music moves the playhead; play from there through the ramp and
            // the return to ♩118 (counts 25–40, about 8.5 s)
            await page.mouse.click(this.playAt.x, this.playAt.y);
            await page.waitForTimeout(500);
            await page.mouse.move(800, 200);
            await page.getByTestId("timeline-play").click();
            await page.waitForTimeout(800);
            await film.hold(8 + 0.6);
        },
    },
    {
        name: "pathways",
        // TODO(#674): check the selectors once the Path pen is on main, then record with
        // `record.mjs pathways` and add pathways.mp4 to the slide (whatsNewSlides.ts).
        pending: "#674",
        async prepare({ page, frameAround }) {
            await tidy(page);
            await seekInPage(page, 3, 0.02);
            const { ms, bounds } = await compactSection(page);
            // The pen draws for one marcher
            await page.mouse.click(ms[0].x, ms[0].y);
            this.start = ms[0];
            return { box: frameAround(grow(bounds, 160), 720) };
        },
        async perform({ page, film }) {
            const { x, y } = this.start;
            await film.freeze();
            // P, click the corners, Enter; then play the move along the path
            await page.keyboard.press("p");
            for (const [dx, dy] of [
                [60, -60],
                [140, -60],
                [140, 40],
                [220, 40],
            ]) {
                await page.mouse.click(x + dx, y + dy);
                await film.hold(0.4);
            }
            await page.keyboard.press("Enter");
            await page.waitForTimeout(600);
            await film.hold(0.3);
            await playFrom(page, 3);
            await film.hold(4);
        },
    },
];

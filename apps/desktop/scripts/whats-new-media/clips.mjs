// The What's new clips. Each sets things up off camera (`prepare`, which returns the region to
// film and the window it's in) and then films itself frame by frame (`perform`, with `film`
// from record.mjs: `freeze`, `skip`, `frame`, `hold`, `drag`). Time only moves when `film`
// moves it, so a clip may wait in real time (for the database, the audio to start) freely.
// `show` picks the show: the demo (web/public/demos/part1-demo.dots, converted to timelines) or
// "drill" (drillShow.mjs). The window is 1600 × 1000 unless --window says otherwise. `pending`
// names the PR a clip waits on:
// it's recorded only when named.

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
        show: "drill",
        async prepare({ page }) {
            await tidy(page);
            await page
                .getByRole("button", { name: "Fit the show" })
                .first()
                .click()
                .catch(() => {});
            await page.waitForTimeout(500);
            // A taller timeline, so all three moves' rows show under the ruler
            const splitter = await box(page.getByTestId("timeline-splitter"));
            const grip = {
                x: splitter.x + splitter.width / 2,
                y: splitter.y + splitter.height / 2,
            };
            await quickDrag(page, grip, { x: grip.x, y: grip.y - 140 });
            await page.waitForTimeout(800);
            const field = await box(page.getByTestId("threeField"));
            const timeline = await box(page.getByTestId("timeline-pane"));
            // The field and the timeline, as wide as they are, bottom-aligned
            const width = Math.min(field.width, timeline.width);
            const height = width / 1.6;
            const bottom = timeline.y + timeline.height;
            return {
                box: {
                    x: even(timeline.x),
                    y: even(bottom - height),
                    width: even(width),
                    height: even(height),
                },
            };
        },
        async perform({ page, film }) {
            await film.freeze();
            // Counts 1–16 (8 s at 120 bpm): from the first page to the end of the fourth
            await playFrom(page, 0, 3, 0.99);
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
            await view.waitForTimeout(800);
            this.view = view;
            return { box: await sceneFrame(view, frameAround), target: view };
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
            // Closer in, on the back of the field where the riser moves
            return {
                box: await sceneFrame(view, frameAround, {
                    height: 0.42,
                    centerY: 0.6,
                }),
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
        // TODO(#550): check the selectors once tempo mode is on main, then record with
        // `record.mjs tempo` and add tempo.mp4 to the slide (whatsNewSlides.ts).
        pending: "#550",
        async prepare({ page }) {
            await tidy(page);
            await pageBox(page, 3).click();
            // Tempo (Shift+T) opens the lanes: rehearsal marks, measures, tempo, the music
            await page
                .getByRole("button", { name: /^Tempo/ })
                .first()
                .click();
            await page.waitForTimeout(1500);
            const pane = await box(page.getByTestId("timeline-pane"));
            const height = Math.min(pane.width / 1.6, 1000);
            return {
                box: {
                    x: even(pane.x),
                    y: even(Math.max(0, pane.y + pane.height - height)),
                    width: even(pane.width),
                    height: even(height),
                },
            };
        },
        async perform({ page, film }) {
            await film.freeze();
            // Drag a count's handle onto its hit in the music, then add a tempo change with a
            // double-click on the tempo lane and drag its dot up.
            const h = await box(page.getByTestId("tempo-count-handle").nth(4));
            const from = { x: h.x + h.width / 2, y: h.y + h.height / 2 };
            await film.hold(0.4);
            await film.drag(page, from, { x: from.x + 40, y: from.y }, 1.2);
            await film.hold(0.6);
            const lane = await box(page.getByTestId("tempo-lane"));
            const at = {
                x: lane.x + lane.width * 0.5,
                y: lane.y + lane.height * 0.5,
            };
            await page.mouse.dblclick(at.x, at.y);
            await page.waitForTimeout(400);
            await film.hold(0.4);
            await film.drag(
                page,
                at,
                { x: at.x, y: at.y - lane.height * 0.3 },
                1.2,
            );
            await film.hold(1.5);
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

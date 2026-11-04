/* eslint-disable no-console -- part of a command-line script: it reports progress */
// The What's new clips: what each one sets up off camera (`prepare`, which returns the region
// to record) and what it does on camera (`perform`). `seconds` is the finished loop's length;
// `lead` skips that many seconds at the start of the recording (playback settling in).
// `show` picks the show (record.mjs): the demo, web/public/demos/part1-demo.dots converted to
// timelines, or "expert", the same with Expert-mode moves added (expertShow.mjs). The window is
// 1600 × 1000. `pending` names the PR a clip waits on: it's recorded only when named.

/** The nth page box on the timeline ruler, in order (0 is the start, before the first page). */
const pageBox = (page, n) => page.locator("[data-timeline-range-page]").nth(n);

/** A paused playhead `fraction` of the way into the nth page box (a click in the clip lane seeks). */
async function seekInPage(page, n, fraction) {
    const b = await pageBox(page, n).boundingBox();
    if (!b) throw new Error(`no page ${n} on the timeline`);
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
    const right = Math.max(...boxes.map((b) => b.x + b.width));
    const bottom = Math.max(...boxes.map((b) => b.y + b.height));
    return { x, y, width: right - x, height: bottom - y };
};
const grow = (b, by) => ({
    x: b.x - by,
    y: b.y - by,
    width: b.width + 2 * by,
    height: b.height + 2 * by,
});

/** Closes notices that would sit over the clip (the low-quality field notice, toasts). */
async function tidy(page) {
    await page
        .getByRole("button", { name: "Got it" })
        .click({ timeout: 1500 })
        .catch(() => {});
    await page
        .locator("[data-sonner-toast]")
        .evaluateAll((els) =>
            els.forEach((e) => {
                e.style.visibility = "hidden";
            }),
        )
        .catch(() => {});
}

/** A mouse drag in `steps` moves `ms` apart, slow enough to watch. */
async function slowDrag(page, a, b, { steps = 40, ms = 30 } = {}) {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
        await page.mouse.move(
            a.x + ((b.x - a.x) * i) / steps,
            a.y + ((b.y - a.y) * i) / steps,
        );
        await page.waitForTimeout(ms);
    }
    await page.mouse.up();
}

const marchers = (page) =>
    page.evaluate(() =>
        window.fieldTest
            .marchers()
            .filter((m) => m.onScreen)
            .map((m) => ({ id: m.id, label: m.label, ...m.screen })),
    );

/** The marchers of one section (label prefix): the biggest one that stands close together. */
async function compactSection(page, maxWidth = 360, minX = 0) {
    const groups = new Map();
    for (const m of await marchers(page)) {
        const prefix = m.label.replace(/\d+$/, "");
        groups.set(prefix, [...(groups.get(prefix) ?? []), m]);
    }
    const ranked = [...groups.values()]
        .map((ms) => ({
            ms,
            bounds: union(...ms.map((m) => ({ ...m, width: 0, height: 0 }))),
        }))
        .filter(
            (g) =>
                g.ms.length >= 6 &&
                g.bounds.width <= maxWidth &&
                g.bounds.height <= maxWidth &&
                g.bounds.x >= minX,
        )
        .sort((a, b) => b.ms.length - a.ms.length);
    if (!ranked.length) throw new Error("no compact section on screen");
    return ranked[0];
}

/**
 * Plays from the start of page box `from` to partway into page box `to`: a click on a page's
 * box puts the start flag there, a click in the clip lane moves the playhead, and Play plays
 * from the start flag to the playhead.
 */
async function playFrom(page, from, to = from + 2) {
    await pageBox(page, from).click();
    await page.waitForTimeout(400);
    await seekInPage(page, to, 0.6);
    await page.mouse.move(1599, 999);
    await page
        .getByTestId("timeline-transport")
        .getByRole("button", { name: /^Play/ })
        .first()
        .click();
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
 * Sets the transport's playback speed by stepping its button (1, 1.5, 2, 4, 0.25, 0.5). The
 * 3D View follows it. Clips that draw slowly play slowed down and are sped up when encoded.
 */
async function setSpeed(page, label) {
    const button = page
        .getByRole("button", { name: /playback speed/i })
        .first();
    for (let i = 0; i < 6; i++) {
        if ((await button.innerText()).trim() === label) return;
        await button.click();
        await page.waitForTimeout(200);
    }
    throw new Error(`couldn't set the speed to ${label}`);
}

/** Opens the 3D View, fills the screen with it, waits for it to draw; returns its page. */
async function open3dView(app, page) {
    const opened = app.waitForEvent("window");
    await page.getByRole("button", { name: "Open 3D View" }).click();
    const view = await opened;
    const logs = [];
    view.on("console", (m) => logs.push(m.text()));
    await view.waitForLoadState("domcontentloaded");
    await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((x) =>
            x.getURL().includes("view=3d"),
        );
        w.setBounds({ x: 0, y: 0, width: 1600, height: 1000 });
        w.show();
        w.focus();
    });
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
    return { view, logs, baked };
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

/** Draws a riser in open field behind the band; at the end of page 3 it has turned and slid. */
async function drawMovingRiser(page, { height } = {}) {
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
    await panel();
    const field = await box(page.getByTestId("threeField"));
    const a = {
        x: field.x + field.width * 0.62,
        y: field.y + field.height * 0.24,
    };
    const b = { x: a.x + 190, y: a.y + 40 };
    const had = new Set((await items()).map((item) => item.id));
    await page.getByRole("button", { name: "Rectangle" }).click();
    await page.waitForTimeout(300);
    await slowDrag(page, a, b, { steps: 15, ms: 30 });
    await page.waitForTimeout(700);
    // The show may have props already: find the new one, and its row in the panel.
    const drawn = () =>
        items().then((all) => all.findIndex((item) => !had.has(item.id)));
    // The props list catches up a moment after the draw.
    for (let i = 0; i < 20 && (await drawn()) < 0; i++)
        await page.waitForTimeout(250);
    if ((await drawn()) < 0) throw new Error("the prop wasn't drawn");
    const editButton = async () =>
        page.getByRole("button", { name: "Edit prop" }).nth(await drawn());
    if (height) {
        await panel();
        await (await editButton()).click();
        await page.waitForTimeout(500);
        await setField("Height", height);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
    }
    await seekInPage(page, 3, 1);
    await panel();
    await (await editButton()).click();
    await page.waitForTimeout(500);
    await setField("Rotation", 90);
    await setField("Transition", 8);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const before = (await items())[await drawn()].screen;
    await page.mouse.click(before.x, before.y);
    await page.waitForTimeout(300);
    const to = { x: before.x - 200, y: before.y + 70 };
    await slowDrag(page, before, to, { steps: 15, ms: 20 });
    await page.waitForTimeout(800);
    // Close the panel and deselect, so only the show plays.
    await page.locator("#sidebar-launcher-props").click();
    await page.keyboard.press("Escape");
    return { field, a, b, to };
}

export const CLIPS = [
    {
        name: "timeline",
        show: "expert",
        seconds: 6,
        lead: 1,
        async prepare({ page }) {
            await tidy(page);
            await pageBox(page, 3).click();
            const field = await box(page.getByTestId("threeField"));
            const timeline = await box(page.getByTestId("timeline-pane"));
            // The stacked moves and the field above them, from the start of the show.
            const width = Math.min(field.width, timeline.width) * 0.85;
            const height = width / 1.6;
            const bottom = timeline.y + timeline.height;
            return {
                box: {
                    x: Math.round(timeline.x / 2) * 2,
                    y: Math.round((bottom - height) / 2) * 2,
                    width: Math.round(width / 2) * 2,
                    height: Math.round(height / 2) * 2,
                },
            };
        },
        async perform({ page }) {
            await playFrom(page, 3, 6);
        },
    },
    {
        name: "shapes",
        // A box, a line, then an arc for the same section, each placed; the drags cross yard
        // lines, so the snapping guides show.
        seconds: 10,
        async prepare({ page, frameAround }) {
            await tidy(page);
            await seekInPage(page, 2, 0.98);
            const { ms, bounds } = await compactSection(page);
            const prefix = ms[0].label.replace(/\d+$/, "");
            await page.getByRole("tab", { name: /shapes/i }).click();
            await page.waitForTimeout(500);
            const { x, y, width: w } = bounds;
            this.prefix = prefix;
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
            await selectSection(page, prefix);
            const points = this.draws.flatMap(([, a, b]) => [a, b]);
            const area = union(
                bounds,
                ...points.map((p) => ({ ...p, width: 0, height: 0 })),
            );
            return { box: frameAround(grow(area, 80), 720) };
        },
        async perform({ page }) {
            for (const [i, [kind, a, b]] of this.draws.entries()) {
                if (i > 0) {
                    // Close the placed shape, then select the section where it stands now.
                    await page.keyboard.press("Escape");
                    await page.keyboard.press("Escape");
                    await page.waitForTimeout(200);
                    await selectSection(page, this.prefix);
                }
                await page.getByTestId(`shapes-tab-${kind}`).click();
                await page.waitForTimeout(300);
                await slowDrag(page, a, b, { steps: 18, ms: 40 });
                await page.waitForTimeout(500);
                await page
                    .getByRole("button", { name: "Place", exact: true })
                    .first()
                    .click();
                await page.waitForTimeout(900);
            }
        },
    },
    {
        name: "view3d",
        seconds: 6,
        // The dome draws slowly in software: played at a quarter speed, sped up 4×. The lead
        // (real seconds) skips the first beat, so the first frame is mid-march.
        slowdown: 4,
        lead: 3,
        async prepare({ app, page, frameAround }) {
            await tidy(page);
            const { view, baked } = await open3dView(app, page);
            // The Pro dome venue, then wait for it to draw.
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
            await setSpeed(page, "0.25×");
            await view.waitForTimeout(800);
            return {
                box: await sceneFrame(view, frameAround),
                window: "view=3d",
                target: view,
            };
        },
        async perform({ page }) {
            // Pages 3 to 5 are all moves: the first frame is mid-march.
            await playFrom(page, 3, 5);
        },
    },
    {
        name: "props",
        seconds: 6,
        slowdown: 4,
        async prepare({ app, page, frameAround }) {
            await tidy(page);
            // A 1.2 m riser that turns and slides on page 3, seen in the 3D View.
            await drawMovingRiser(page, { height: 1.2 });
            await pageBox(page, 3).click();
            await tidy(page);
            const { view } = await open3dView(app, page);
            await setSpeed(page, "0.25×");
            // Playing before the recording starts: the 3D View takes a moment to leave the
            // paused frame. The riser turns from page 3's third count.
            await playFrom(page, 3);
            await page.waitForTimeout(2000);
            return {
                // Closer in, on the riser behind the band.
                box: await sceneFrame(view, frameAround, {
                    height: 0.42,
                    centerY: 0.66,
                }),
                window: "view=3d",
                target: view,
            };
        },
        async perform() {},
    },
    {
        name: "tempo",
        // TODO(#550): check the selectors once tempo mode is on main, then record with
        // `record.mjs tempo` and add tempo.mp4 to the slide (whatsNewSlides.ts).
        pending: "#550",
        seconds: 8,
        async prepare({ page }) {
            await tidy(page);
            await pageBox(page, 3).click();
            // Tempo (Shift+T) opens the lanes: rehearsal marks, measures, tempo, the music.
            await page
                .getByRole("button", { name: /^Tempo/ })
                .first()
                .click();
            await page.waitForTimeout(1500);
            const pane = await box(page.getByTestId("timeline-pane"));
            const height = pane.width / 1.6;
            return {
                box: {
                    x: Math.round(pane.x / 2) * 2,
                    y:
                        Math.round(
                            Math.max(0, pane.y + pane.height - height) / 2,
                        ) * 2,
                    width: Math.round(pane.width / 2) * 2,
                    height: Math.round(Math.min(height, 1000) / 2) * 2,
                },
            };
        },
        async perform({ page }) {
            // Drag a count's handle onto its hit in the music, then add a tempo change with a
            // double-click on the tempo lane and drag its dot up.
            const handle = page.getByTestId("tempo-count-handle").nth(4);
            const h = await box(handle);
            await slowDrag(
                page,
                { x: h.x + h.width / 2, y: h.y + h.height / 2 },
                { x: h.x + 40, y: h.y + h.height / 2 },
                { steps: 20, ms: 40 },
            );
            const lane = await box(page.getByTestId("tempo-lane"));
            const at = {
                x: lane.x + lane.width * 0.5,
                y: lane.y + lane.height * 0.5,
            };
            await page.mouse.dblclick(at.x, at.y);
            await page.waitForTimeout(400);
            await slowDrag(
                page,
                at,
                { x: at.x, y: at.y - lane.height * 0.3 },
                { steps: 20, ms: 40 },
            );
        },
    },
    {
        name: "pathways",
        // TODO(#674): check the selectors once the Path pen is on main, then record with
        // `record.mjs pathways` and add pathways.mp4 to the slide (whatsNewSlides.ts).
        pending: "#674",
        seconds: 8,
        async prepare({ page, frameAround }) {
            await tidy(page);
            await seekInPage(page, 3, 0.02);
            const { ms, bounds } = await compactSection(page);
            // The pen draws for one marcher.
            await page.mouse.click(ms[0].x, ms[0].y);
            this.start = ms[0];
            return { box: frameAround(grow(bounds, 160), 720) };
        },
        async perform({ page }) {
            const { x, y } = this.start;
            // P, click the corners, Enter; then play the move along the path.
            await page.keyboard.press("p");
            for (const [dx, dy] of [
                [60, -60],
                [140, -60],
                [140, 40],
                [220, 40],
            ]) {
                await page.mouse.click(x + dx, y + dy);
                await page.waitForTimeout(500);
            }
            await page.keyboard.press("Enter");
            await page.waitForTimeout(600);
            await playFrom(page, 3);
        },
    },
];

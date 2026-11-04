/* eslint-disable no-console -- part of a command-line script: it reports progress */
// The What's new clips: what each one sets up off camera (`prepare`, which returns the region
// to record) and what it does on camera (`perform`). `seconds` is the finished loop's length;
// `lead` skips that many seconds at the start of the recording (playback settling in).
// The show is web/public/demos/part1-demo.dots, converted to timelines, at 1600 × 1000.

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

export const CLIPS = [
    {
        name: "timeline",
        seconds: 6,
        lead: 1,
        async prepare({ page }) {
            await tidy(page);
            await pageBox(page, 3).click();
            const field = await box(page.getByTestId("threeField"));
            const timeline = await box(page.getByTestId("timeline-pane"));
            // The timeline's first pages and the field above them: big enough to read.
            const width = Math.min(field.width, timeline.width) * 0.72;
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
            await playFrom(page, 2, 5);
        },
    },
    {
        name: "shapes",
        // Long enough to hold on the marchers in the box after Place.
        seconds: 8,
        async prepare({ page, frameAround, shot }) {
            await tidy(page);
            await seekInPage(page, 2, 0.98);
            const { ms, bounds } = await compactSection(page);
            // Select the section: click one marcher, Shift-click the rest.
            await page.mouse.click(ms[0].x, ms[0].y);
            for (const m of ms.slice(1)) {
                await page.keyboard.down("Shift");
                await page.mouse.click(m.x, m.y);
                await page.keyboard.up("Shift");
            }
            await page.getByRole("tab", { name: /shapes/i }).click();
            await page.waitForTimeout(500);
            // A box drawn above the section, in open field, so its marchers march up into it.
            const draw = {
                a: { x: bounds.x + bounds.width * 0.15, y: bounds.y - 190 },
                b: { x: bounds.x + bounds.width * 0.85, y: bounds.y - 80 },
            };
            this.draw = draw;
            console.log(
                `   section ${ms[0].label}… ${JSON.stringify(bounds)} draw ${JSON.stringify(draw)}`,
            );
            await shot("selected");
            const drawBox = union(
                { ...draw.a, width: 0, height: 0 },
                { ...draw.b, width: 0, height: 0 },
            );
            return { box: frameAround(grow(union(bounds, drawBox), 70), 720) };
        },
        async perform({ page }) {
            await page.getByTestId("shapes-tab-block").click();
            await page.waitForTimeout(500);
            await slowDrag(page, this.draw.a, this.draw.b, {
                steps: 25,
                ms: 40,
            });
            await page.waitForTimeout(700);
            // Place puts the marchers in the box.
            await page
                .getByRole("button", { name: "Place", exact: true })
                .first()
                .click();
        },
    },
    {
        name: "props",
        seconds: 6,
        lead: 0.5,
        async prepare({ page, frameAround, shot }) {
            await tidy(page);
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
            const items = () =>
                page.evaluate(() => window.fieldTest.items?.() ?? []);
            await seekInPage(page, 2, 0.05);
            await panel();
            // A riser in open field behind the band (the panel covers the field's left side).
            const field = await box(page.getByTestId("threeField"));
            const a = {
                x: field.x + field.width * 0.62,
                y: field.y + field.height * 0.24,
            };
            const b = { x: a.x + 190, y: a.y + 40 };
            await page.getByRole("button", { name: "Rectangle" }).click();
            await page.waitForTimeout(300);
            await slowDrag(page, a, b, { steps: 15, ms: 30 });
            await page.waitForTimeout(700);
            if ((await items()).length !== 1) {
                await shot("no-prop");
                throw new Error("the prop wasn't drawn");
            }
            // At the end of page 3 it has turned and slid, over 8 counts.
            await seekInPage(page, 3, 1);
            await panel();
            await page
                .getByRole("button", { name: "Edit prop" })
                .first()
                .click();
            await page.waitForTimeout(500);
            await setField("Rotation", 90);
            await setField("Transition", 8);
            await page.keyboard.press("Escape");
            await page.keyboard.press("Escape");
            await page.waitForTimeout(300);
            const before = (await items())[0].screen;
            await page.mouse.click(before.x, before.y);
            await page.waitForTimeout(300);
            const to = { x: before.x - 200, y: before.y + 70 };
            await slowDrag(page, before, to, { steps: 15, ms: 20 });
            await page.waitForTimeout(800);
            // Close the panel and deselect, so the clip shows only the show playing.
            await page.locator("#sidebar-launcher-props").click();
            await page.keyboard.press("Escape");
            await pageBox(page, 3).click();
            await tidy(page);
            await shot("ready");
            const frame = grow(
                union(
                    { ...a, width: b.x - a.x, height: b.y - a.y },
                    { ...to, width: 0, height: 0 },
                ),
                150,
            );
            // Kept inside the field, below the toolbar.
            const shown = frameAround(frame, 760);
            shown.y = Math.max(shown.y, Math.ceil(field.y / 2) * 2);
            return { box: shown };
        },
        async perform({ page }) {
            await playFrom(page, 3);
        },
    },
    {
        name: "view3d",
        seconds: 6,
        lead: 1,
        async prepare({ app, page, frameAround }) {
            await tidy(page);
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
            for (
                let i = 0;
                i < 120 && !logs.some((l) => l.includes("baked"));
                i++
            )
                await view.waitForTimeout(500);
            await tidy(view);
            await view.waitForTimeout(2000);
            // The field and the stands, above the window's bottom bar.
            const scene = await box(view.getByTestId("view3d-scene"));
            const height = scene.height * 0.64;
            const width = height * 1.6;
            return {
                box: frameAround({
                    x: scene.x + (scene.width - width) / 2,
                    y: scene.y + scene.height - 45 - height,
                    width,
                    height,
                }),
                window: "view=3d",
                target: view,
            };
        },
        async perform({ page }) {
            await playFrom(page, 3);
        },
    },
];

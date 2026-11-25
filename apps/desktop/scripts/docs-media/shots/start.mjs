// The Start here chapter (guides/start/*).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DESKTOP = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
);
/** A show from before timelines (the demo, as 0.1.7 saved it). */
const PAGE_ERA_SHOW = path.join(DESKTOP, "web/public/demos/part1-demo.dots");

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

/** The timeline a few pages into the show, nothing selected on the field. */
async function timelineAtPage3({ page, around, wait }) {
    await wait(3000);
    await tidy(page);
    await page.keyboard.press("KeyE");
    await page.keyboard.press("KeyE");
    await page.keyboard.press("KeyE");
    await wait(1500);
    await tidy(page);
    // Home to Page 4 only, so the page boxes, the move's bar and the flags can be read
    const pane = await around(page.getByTestId("timeline-pane"), 0);
    const p4 = await page
        .locator('[data-timeline-range-page="12"]')
        .first()
        .boundingBox();
    return {
        box: { ...pane, width: Math.round(p4.x + p4.width + 24 - pane.x) },
    };
}

/** Opens the Settings window on `section`, sized for a picture, and frames all of it. */
export async function settingsWindow({ app, page, wait }, sectionLabel) {
    const opened = app.waitForEvent("window");
    await page.evaluate(() => window.electron.openSettingsWindow());
    const settings = await opened;
    await settings.waitForLoadState("domcontentloaded");
    const size = { width: 900, height: 640 };
    await app.evaluate(
        ({ BrowserWindow }, { s, url }) => {
            const win = BrowserWindow.getAllWindows().find(
                (w) => w.webContents.getURL() === url,
            );
            win.setContentBounds({ x: 0, y: 0, ...s });
            win.webContents.setBackgroundThrottling(false);
        },
        { s: size, url: settings.url() },
    );
    await wait(800);
    if (sectionLabel)
        await settings
            .getByRole("button", { name: sectionLabel, exact: true })
            .or(settings.getByRole("tab", { name: sectionLabel, exact: true }))
            .first()
            .click();
    await wait(800);
    // No focus ring on the section just chosen
    await settings.evaluate(() => document.activeElement?.blur());
    await wait(300);
    return {
        target: settings,
        box: { x: 0, y: 0, ...size },
    };
}

/**
 * Opens File › New File and goes through the new-show steps up to Performers, with eight
 * trumpets entered and not yet created. Returns the dialog.
 */
async function newShowToPerformers({ page, wait }) {
    await wait(3000);
    await tidy(page);
    await page.getByRole("tab", { name: "File" }).click();
    await wait(500);
    await page.getByRole("button", { name: "New File" }).first().click();
    await wait(1200);
    const dialog = page.getByRole("dialog").last();
    const next = () =>
        dialog.getByRole("button", { name: "Next", exact: true }).click();
    await dialog.getByText("Start blank show").click();
    await wait(400);
    await next();
    await wait(800);
    await dialog.getByPlaceholder("Show name").fill("Fall Show");
    await wait(600);
    await next(); // Project details
    await wait(800);
    await next(); // Activity and field
    await wait(1000);
    await dialog.getByLabel(/quantity/i).fill("8");
    await dialog.getByRole("combobox").first().click();
    await wait(400);
    await page.getByRole("option", { name: "Trumpet", exact: true }).click();
    await wait(800);
    await page.mouse.move(5, 500);
    return dialog;
}

/** Makes a new show of eight trumpets through File › New File, and waits for it to open. */
async function createNewShow(ctx) {
    const { page, wait } = ctx;
    const dialog = await newShowToPerformers(ctx);
    await dialog.getByRole("button", { name: /^Create 8 Trumpet/ }).click();
    await wait(800);
    for (let i = 0; i < 5; i++) {
        const create = dialog.getByRole("button", { name: "Create show" });
        if (await create.isVisible().catch(() => false)) break;
        // Next where it can go on (it keeps the marchers just made), Skip where it can't
        const next = dialog.getByRole("button", { name: "Next", exact: true });
        if (await next.isEnabled().catch(() => false)) await next.click();
        else
            await dialog
                .getByRole("button", { name: /^Skip( for now)?$/ })
                .first()
                .click();
        await wait(1500);
    }
    await dialog.getByRole("button", { name: "Create show" }).click();
    await page.waitForFunction(
        () => (window.fieldTest?.marchers().length ?? 0) === 8,
        null,
        { timeout: 60000 },
    );
    await wait(3000);
    await tidy(page);
    await page.mouse.move(800, 500);
    await wait(500);
}

/** The new show's marchers on screen, by drill number. */
const trumpets = (page) =>
    page.evaluate(() =>
        window.fieldTest
            .marchers()
            .map((m) => ({ label: m.label, x: m.screen.x, y: m.screen.y })),
    );

/** The box around `points`, grown by `pad`. */
function boundsOf(points, pad = 0) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const x = Math.min(...xs) - pad;
    const y = Math.min(...ys) - pad;
    return {
        x,
        y,
        width: Math.max(...xs) + pad - x,
        height: Math.max(...ys) + pad - y,
    };
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

/** A drag off camera, in small steps. */
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
    await page.waitForTimeout(600);
}

/** The two corners of a 4 × 2 box below and right of the trumpets' row. */
function tutorialBoxCorners(row) {
    const b = boundsOf(row);
    const a = { x: b.x + b.width * 0.35, y: b.y + 110 };
    return [a, { x: a.x + b.width * 0.9, y: a.y + b.width * 0.42 }];
}

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

/**
 * The tutorial's new show (eight trumpets in a row at the back corner, Basic), zoomed in on the
 * corner of the field where they stand, all of them selected.
 */
async function tutorialShow(ctx) {
    const { page, wait } = ctx;
    await createNewShow(ctx);
    const row = await trumpets(page);
    const b = boundsOf(row);
    // Zoomed about the row itself, so it stays clear of the field's top edge
    await zoomAt(page, { x: b.x + b.width / 2, y: b.y }, 1.8);
    await page.keyboard.press("Control+KeyA");
    await wait(600);
    await page.mouse.move(5, 500);
    await wait(400);
}

/** The tutorial's opening set: the trumpets placed in a 4 × 2 box at home, off camera. */
async function tutorialOpeningSet(ctx) {
    const { page, wait } = ctx;
    await tutorialShow(ctx);
    const [a, b] = tutorialBoxCorners(await trumpets(page));
    await page.keyboard.press("KeyB");
    await wait(400);
    await quickDrag(page, a, b);
    await wait(800);
    await page.keyboard.press("Enter");
    await wait(2000);
    await tidy(page);
}

/** Selects Page 1's box (the first wide one; home's is narrow), off camera. */
async function selectPage1(page, wait) {
    const boxes = await page
        .locator("[data-timeline-range-page]")
        .evaluateAll((els) =>
            els.map((e) => {
                const r = e.getBoundingClientRect();
                return { x: r.x, y: r.y, width: r.width };
            }),
        );
    const p1 = boxes.filter((r) => r.width > 60).sort((m, n) => m.x - n.x)[0];
    await page.mouse.click(p1.x + p1.width / 2, p1.y + 13);
    await wait(1200);
    return p1;
}

const shots = [
    {
        id: "start-new-show-performers",
        kind: "still",
        // The new-show window's Performers step, eight trumpets entered
        async setup(ctx) {
            const dialog = await newShowToPerformers(ctx);
            return { box: await ctx.around(dialog, 0) };
        },
    },
    {
        id: "start-new-show",
        kind: "still",
        mode: "basic",
        // The editor straight after Create show: the marchers in rows, no pages yet
        async setup(ctx) {
            await createNewShow(ctx);
            return {};
        },
    },
    {
        id: "start-select-first-page",
        kind: "clip",
        mode: "basic",
        // In the new show, selecting Page 1's box: the page is selected and the playhead
        // goes to its end
        async setup(ctx) {
            const { page } = ctx;
            await createNewShow(ctx);
            const pane = await page.getByTestId("timeline-pane").boundingBox();
            return {
                box: {
                    x: Math.floor(pane.x),
                    y: Math.floor(pane.y),
                    width: 760,
                    height: Math.ceil(pane.height),
                },
            };
        },
        async perform({ page, film, overlay, box }) {
            await overlay.enable();
            // Page 1's box: the first wide page box (home's is narrow)
            const boxes = await page
                .locator("[data-timeline-range-page]")
                .evaluateAll((els) =>
                    els.map((e) => {
                        const r = e.getBoundingClientRect();
                        return { x: r.x, y: r.y, width: r.width };
                    }),
                );
            const p1 = boxes
                .filter((r) => r.width > 60)
                .sort((m, n) => m.x - n.x)[0];
            const target = { x: p1.x + p1.width / 2, y: p1.y + 13 };
            const rest = { x: box.x + 120, y: box.y + box.height - 20 };
            await page.mouse.move(rest.x, rest.y);
            await film.hold(0.4);
            await film.moveTo(page, rest, target, 0.8);
            await page.mouse.down();
            await film.hold(0.1);
            await page.mouse.up();
            await film.hold(0.6);
            await film.moveTo(page, target, rest, 0.5);
            await film.hold(1.6);
        },
    },
    {
        id: "start-timeline-basic",
        kind: "still",
        mode: "basic",
        setup: timelineAtPage3,
    },
    {
        id: "start-timeline-expert",
        kind: "still",
        mode: "expert",
        // The same page, with a few marchers moving from partway through it in a move of their
        // own, so the timeline shows a move's bar that doesn't fill the page. The loop stays off.
        async setup(ctx) {
            const { page, wait } = ctx;
            const framed = await timelineAtPage3(ctx);
            // The page the start flag is on, and its width per count
            const pennant = await page
                .getByTestId("timeline-start-pennant")
                .boundingBox();
            const boxes = await page
                .locator("[data-timeline-range-page]")
                .evaluateAll((els) =>
                    els.map((e) => {
                        const r = e.getBoundingClientRect();
                        return {
                            x: r.x,
                            width: r.width,
                            start: Number(e.dataset.timelineRangeStart),
                            end: Number(e.dataset.timelineRangeEnd),
                        };
                    }),
                );
            const px = pennant.x + pennant.width / 2;
            const on = boxes.find((b) => px >= b.x - 2 && px < b.x + b.width);
            const perCount = on.width / (on.end - on.start);
            // The start flag four counts into the page
            const a = { x: px, y: pennant.y + pennant.height / 2 };
            await page.mouse.move(a.x, a.y);
            await page.mouse.down();
            for (let i = 1; i <= 12; i++) {
                await page.mouse.move(a.x + (perCount * 4 * i) / 12, a.y);
                await wait(25);
            }
            await page.mouse.up();
            await wait(1000);
            // Four marchers moved from there to the page's end
            const picks = await page.evaluate(() =>
                window.fieldTest
                    .marchers()
                    .filter((m) => m.onScreen)
                    .sort((a, b) => a.label.localeCompare(b.label))
                    .slice(0, 4)
                    .map((m) => m.screen),
            );
            await page.mouse.click(picks[0].x, picks[0].y);
            await page.keyboard.down("Shift");
            for (const p of picks.slice(1)) await page.mouse.click(p.x, p.y);
            await page.keyboard.up("Shift");
            await wait(500);
            const from = picks[0];
            await page.mouse.move(from.x, from.y);
            await page.mouse.down();
            for (let i = 1; i <= 12; i++) {
                await page.mouse.move(from.x, from.y + (40 * i) / 12);
                await wait(25);
            }
            await page.mouse.up();
            await wait(1500);
            await page.keyboard.press("Escape");
            await wait(500);
            const loop = page.getByTestId("timeline-loop");
            if ((await loop.getAttribute("aria-pressed")) === "true")
                await loop.click();
            await tidy(page);
            await page.mouse.move(5, 500);
            await wait(800);
            return framed;
        },
    },
    {
        id: "start-basic-expert-mark",
        kind: "still",
        mode: "expert",
        // A move across Page 5's flag made in Expert (S1–S3, Pages 5 and 5A selected together),
        // then the show opened in Basic: the pages get an E, pointed at to show its tooltip
        async setup({ page, wait }) {
            await wait(3000);
            await tidy(page);
            const box = (id) =>
                page.locator(`[data-timeline-range-page="${id}"]`).first();
            await box(13).click({ position: { x: 8, y: 13 } });
            await wait(1200);
            await page.keyboard.down("Shift");
            await box(14).click({ position: { x: 8, y: 13 } });
            await page.keyboard.up("Shift");
            await wait(1200);
            const pts = await page.evaluate(() =>
                window.fieldTest
                    .marchers()
                    .filter((m) => ["S1", "S2", "S3"].includes(m.label))
                    .map((m) => m.screen),
            );
            await page.mouse.click(pts[0].x, pts[0].y);
            await page.keyboard.down("Shift");
            for (const p of pts.slice(1)) await page.mouse.click(p.x, p.y);
            await page.keyboard.up("Shift");
            await wait(500);
            const from = pts[0];
            await page.mouse.move(from.x, from.y);
            await page.mouse.down();
            for (let i = 1; i <= 12; i++) {
                await page.mouse.move(from.x + 5 * i, from.y - 4 * i);
                await wait(25);
            }
            await page.mouse.up();
            await wait(1500);
            await page.keyboard.press("Escape");
            // Switch to Basic as a reader would, from the command palette
            await page.keyboard.press("Control+KeyK");
            await wait(500);
            await page.keyboard.type("Switch to Basic");
            await wait(500);
            await page.keyboard.press("Enter");
            await wait(2500);
            await tidy(page);
            const mark = page.getByTestId("basic-expert-mark").first();
            await mark.waitFor({ timeout: 10000 });
            await mark.hover();
            await wait(1200);
            const m = await mark.boundingBox();
            this.mark = { x: m.x + m.width / 2, y: m.y + m.height / 2 };
            const a = await box(13).boundingBox();
            const b = await box(14).boundingBox();
            const pane = await page.getByTestId("timeline-pane").boundingBox();
            const tip = await page
                .locator("[data-radix-popper-content-wrapper]")
                .first()
                .boundingBox();
            const x = Math.max(0, Math.floor(Math.min(a.x - 60, tip.x - 12)));
            const y = Math.floor(Math.min(a.y - 20, tip.y - 12));
            const right = Math.min(
                1600,
                Math.ceil(Math.max(b.x + b.width + 40, tip.x + tip.width + 12)),
            );
            return {
                box: {
                    x,
                    y,
                    width: right - x,
                    height: Math.ceil(pane.y + pane.height) - y,
                },
            };
        },
        // The pointer on the first E, so it's clear which mark the tooltip is for
        async perform({ overlay }) {
            await overlay.enable();
            await overlay.place(this.mark.x, this.mark.y);
        },
    },
    {
        id: "start-convert-dialog",
        kind: "still",
        // The app confirms the demo's own conversion when it starts, so this opens a second
        // copy of the page-era show, which asks again over the open show.
        async setup({ page, around, wait }) {
            await wait(2000);
            await tidy(page);
            const folder = "/tmp/Shows";
            fs.mkdirSync(folder, { recursive: true });
            const file = path.join(folder, "Fall Show.dots");
            fs.copyFileSync(PAGE_ERA_SHOW, file);
            for (const old of fs.readdirSync(folder))
                if (old.includes(".pre-conversion"))
                    fs.rmSync(path.join(folder, old));
            await page.evaluate((f) => window.electron.openRecentFile(f), file);
            const dialog = page.getByTestId("convert-show-dialog");
            await dialog.waitFor({ timeout: 20000 });
            await wait(800);
            return { box: await around(dialog, 0) };
        },
    },
    {
        id: "start-first-show-box",
        kind: "clip",
        mode: "basic",
        // The tutorial's opening set: the eight new trumpets selected at home, B, a drag below
        // them for a 4 × 2 box, then Place
        async setup(ctx) {
            const { page } = ctx;
            await tutorialShow(ctx);
            const row = await trumpets(page);
            this.corners = tutorialBoxCorners(row);
            const area = boundsOf([...row, ...this.corners], 70);
            const width = Math.max(area.width, 720);
            area.x -= (width - area.width) / 2;
            area.width = width;
            const height = Math.max(area.height, 440);
            area.height = height;
            const field = await page.locator("canvas").first().boundingBox();
            return { box: inside(area, field) };
        },
        async perform({ page, film, overlay }) {
            await film.release();
            await overlay.enable();
            const [a, b] = this.corners;
            const rest = { x: a.x - 60, y: a.y + 60 };
            await page.mouse.move(rest.x, rest.y);
            await film.hold(0.4);
            // B held for a moment, so its key cap shows before the drag starts
            await page.keyboard.down("KeyB");
            await film.hold(0.6);
            await page.keyboard.up("KeyB");
            await film.hold(0.3);
            await film.moveTo(page, rest, a, 0.5);
            await film.drag(page, a, b, 1.2);
            await film.hold(0.8);
            const place = await page
                .getByTestId("shape-editor-place")
                .boundingBox();
            const to = {
                x: place.x + place.width / 2,
                y: place.y + place.height / 2,
            };
            await film.moveTo(page, b, to, 0.6);
            await page.mouse.click(to.x, to.y);
            await film.hold(2.0);
        },
    },
    {
        id: "start-first-show-move",
        kind: "clip",
        mode: "basic",
        // Page 1 selected in the tutorial's show: the trumpets dragged toward the 50, then
        // dragged again with Shift held, moving more slowly than the pointer
        async setup(ctx) {
            const { page, wait } = ctx;
            await tutorialOpeningSet(ctx);
            await selectPage1(page, wait);
            await page.keyboard.press("Control+KeyA");
            await wait(600);
            await page.mouse.move(5, 500);
            await wait(400);
            const row = await trumpets(page);
            const b = boundsOf(row);
            // T4: a marcher on the box's edge between its handles, so the drag moves the marchers
            this.grab = row.find((m) => m.label === "T4");
            const area = {
                x: b.x - 120,
                y: b.y - 110,
                width: Math.max(760, b.width + 420),
                height: 440,
            };
            const field = await page.locator("canvas").first().boundingBox();
            return { box: inside(area, field) };
        },
        async perform({ page, film, overlay }) {
            await overlay.enable();
            const grab = this.grab;
            const rest = { x: grab.x + 70, y: grab.y + 80 };
            await page.mouse.move(rest.x, rest.y);
            await film.hold(0.3);
            await film.moveTo(page, rest, grab, 0.5);
            const to = { x: grab.x + 170, y: grab.y + 60 };
            await film.drag(page, grab, to, 1.1);
            await film.hold(0.6);
            await page.keyboard.down("Shift");
            await film.hold(0.3);
            await film.drag(page, to, { x: to.x + 120, y: to.y }, 1.2);
            await film.hold(0.2);
            await page.keyboard.up("Shift");
            await film.hold(1.0);
        },
    },
    {
        id: "start-first-show-play",
        kind: "clip",
        mode: "basic",
        // Basic, the tutorial's show with Page 1 set: the playhead dragged from home to the end
        // of Page 1, and the trumpets walk from the opening set to Page 1's set
        async setup(ctx) {
            const { page, wait } = ctx;
            await tutorialOpeningSet(ctx);
            const p1 = await selectPage1(page, wait);
            this.p1 = p1;
            await page.keyboard.press("Control+KeyA");
            await wait(600);
            const row = await trumpets(page);
            const grab = row.find((m) => m.label === "T4");
            await quickDrag(page, grab, { x: grab.x + 260, y: grab.y + 90 });
            await wait(1200);
            await page.keyboard.press("Escape");
            await wait(400);
            await page.keyboard.press("Home");
            await wait(1200);
            await tidy(page);
            await page.mouse.move(5, 500);
            await wait(400);
            const pane = await page.getByTestId("timeline-pane").boundingBox();
            return {
                box: {
                    x: 0,
                    y: 120,
                    width: Math.max(960, Math.round(p1.x + p1.width + 200)),
                    height: Math.ceil(pane.y + pane.height) - 120,
                },
            };
        },
        async perform({ page, film, overlay }) {
            await overlay.enable();
            const ph = await page
                .getByTestId("timeline-playhead")
                .boundingBox();
            const grab = { x: ph.x + ph.width / 2, y: ph.y + 8 };
            const rest = { x: grab.x + 60, y: grab.y + 70 };
            await page.mouse.move(rest.x, rest.y);
            await film.moveTo(page, rest, grab, 0.6);
            await film.hold(0.3);
            const end = { x: this.p1.x + this.p1.width - 1, y: grab.y };
            await film.drag(page, grab, end, 2.6);
            await film.hold(1.2);
        },
    },
    {
        id: "start-report-drawer-form",
        kind: "still",
        // The report drawer signed in (the session is stubbed), with Something is broken chosen
        async setup({ app, page, around, wait }) {
            await wait(2000);
            await tidy(page);
            await app.evaluate(({ ipcMain, BrowserWindow }) => {
                const state = {
                    isAuthenticated: true,
                    isLoading: false,
                    user: {
                        id: "user_docs",
                        email: "director@example.com",
                        firstName: "Sam",
                        lastName: "Rivera",
                        imageUrl: null,
                    },
                    error: null,
                };
                ipcMain.removeHandler("auth:get-state");
                ipcMain.handle("auth:get-state", () => state);
                for (const w of BrowserWindow.getAllWindows())
                    w.webContents.send("auth:state-changed", state);
            });
            await wait(800);
            await page
                .getByRole("button", { name: "Submit bug or feedback" })
                .click();
            const drawer = page.getByRole("dialog", {
                name: "Report a bug or send feedback",
            });
            await drawer.waitFor({ timeout: 10000 });
            await wait(800);
            await drawer
                .getByText("Something is broken", { exact: false })
                .first()
                .click()
                .catch(() => {});
            await wait(800);
            await page.mouse.move(5, 500);
            await wait(300);
            return { box: await around(drawer, 8) };
        },
    },
    {
        id: "start-help-window",
        kind: "still",
        // The Help window from the title bar's question mark, with a question typed in
        async setup({ page, around, wait }) {
            await wait(2000);
            await tidy(page);
            await page.getByTestId("titlebar-help").click();
            const dialog = page.getByTestId("help-dialog");
            await dialog.waitFor({ timeout: 10000 });
            await page
                .getByTestId("help-question")
                .fill("How do I make marchers stand still for 8 counts?");
            await page.mouse.move(5, 500);
            await wait(500);
            return { box: await around(dialog, 24) };
        },
    },
];

export default shots;

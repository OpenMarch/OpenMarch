// The Marchers chapter (guides/marchers/*).
import { ensureSelected } from "../select.mjs";

/** Waits for the show's field, then goes to the end of Page 1 (two pages after home). */
async function toPage1(page, wait) {
    // The demo is a 0.1.7 show: confirm its conversion if the app asks
    for (let i = 0; i < 120; i++) {
        const ready = await page.evaluate(
            () => (window.fieldTest?.marchers().length ?? 0) > 0,
        );
        if (ready) break;
        const confirm = page.getByRole("button", { name: "Confirm" });
        if (await confirm.isVisible().catch(() => false))
            await confirm.click().catch(() => {});
        await wait(500);
    }
    await wait(1500);
    await page.keyboard.press("KeyE");
    await page.keyboard.press("KeyE");
    await wait(1500);
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

/** The bounds of the named marchers' dots. */
function bounds(points) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return {
        left: Math.min(...xs),
        right: Math.max(...xs),
        top: Math.min(...ys),
        bottom: Math.max(...ys),
    };
}

/** A box centered on `c`, `width` × `height`, kept inside the 1600 × 1000 window. */
function boxAround(c, width, height) {
    const x = Math.max(0, Math.min(1600 - width, c.x - width / 2));
    const y = Math.max(0, Math.min(1000 - height, c.y - height / 2));
    return { x, y, width, height };
}

const named = (all, labels) => labels.map((label) => all.get(label));
const range = (prefix, from, to) =>
    Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);

/** Selects the named marchers by Shift-clicking each (not filmed). */
async function shiftSelect(page, points, wait) {
    await page.keyboard.down("Shift");
    for (const p of points) await page.mouse.click(p.x, p.y);
    await page.keyboard.up("Shift");
    await ensureSelected(
        page,
        points.map((p) => p.label),
        wait,
    );
    await page.mouse.move(800, 950);
    await wait(500);
}

const openSidebarPanel = async (page, name, wait) => {
    await page.locator(`#sidebar button[title="${name}"]`).click();
    await wait(800);
};

/** The open sidebar panel, `height` tall from its top. */
async function sidebarPanel(page, height) {
    const b = await page.locator(".animate-scale-in").first().boundingBox();
    return {
        x: b.x - 16,
        y: b.y - 16,
        width: b.width + 32,
        height: Math.min(height, b.height + 32),
    };
}

/** The toolbar: its tabs and the open tab's tools. */
async function toolbar(page) {
    const list = await page
        .getByRole("tab", { name: "Alignment" })
        .locator("xpath=ancestor::*[@role='tablist'][1]");
    const tabs = await list.boundingBox();
    const panel = await page
        .locator("[role='tabpanel'][data-state='active']")
        .first()
        .boundingBox();
    const right = Math.max(tabs.x + tabs.width, panel.x + panel.width);
    return {
        x: tabs.x - 8,
        y: tabs.y - 8,
        width: Math.min(1270, right + 16) - (tabs.x - 8),
        height: panel.y + panel.height + 10 - (tabs.y - 8),
    };
}

/** The toolbar cut off just past `last`, so its tools show near full size. */
async function toolbarUpTo(page, last) {
    const bar = await toolbar(page);
    const end = await last.boundingBox();
    if (!end) return bar;
    return { ...bar, width: end.x + end.width + 16 - bar.x };
}

/** Switches the window to the tablet layout, as Settings › Touch & Input › Layout › Tablet does. */
async function toTablet(page, wait) {
    await page.evaluate(() => {
        localStorage.setItem("openmarch:inputMode", "touch");
        window.dispatchEvent(
            new StorageEvent("storage", {
                key: "openmarch:inputMode",
                newValue: "touch",
            }),
        );
    });
    await page
        .getByTestId("touch-modifier-buttons")
        .waitFor({ timeout: 10000 });
    await wait(1500);
}

const shots = [
    {
        id: "marchers-add-form",
        kind: "still",
        // The Add Marchers form, filled in for four trumpets
        async setup({ page, wait }) {
            await toPage1(page, wait);
            await openSidebarPanel(page, "Marchers", wait);
            await page
                .getByRole("button", { name: "Add", exact: true })
                .click();
            await wait(800);
            await page
                .locator("#marcherForm input[type='number']")
                .first()
                .fill("4");
            await page
                .locator("#marcherForm button[role='combobox']")
                .first()
                .click();
            await wait(400);
            await page
                .getByRole("option", { name: "Trumpet", exact: true })
                .click();
            await wait(600);
            return { box: await sidebarPanel(page, 470) };
        },
    },
    {
        id: "marchers-select-box",
        kind: "clip",
        // A box drag selects a row; Shift-click adds one more marcher
        async setup({ page, wait }) {
            await toPage1(page, wait);
            const all = await marchers(page);
            const row = bounds(named(all, range("B", 1, 8)));
            return {
                box: boxAround(
                    {
                        x: (row.left + row.right) / 2,
                        y: (row.top + row.bottom) / 2,
                    },
                    760,
                    360,
                ),
            };
        },
        async perform({ page, film, overlay }) {
            await overlay.enable();
            const all = await marchers(page);
            const row = bounds(named(all, range("B", 1, 8)));
            const a = { x: row.left - 22, y: row.top - 18 };
            const b = { x: row.right + 22, y: row.bottom + 16 };
            const rest = { x: a.x - 60, y: a.y + 60 };
            await page.mouse.move(rest.x, rest.y);
            await film.hold(0.3);
            await film.moveTo(page, rest, a, 0.5);
            await film.drag(page, a, b, 1.0);
            await film.hold(0.7);
            const u2 = all.get("U2");
            await film.moveTo(page, b, u2, 0.6);
            await page.keyboard.down("Shift");
            await film.hold(0.3);
            await page.mouse.down();
            await film.hold(0.1);
            await page.mouse.up();
            await film.hold(0.3);
            await page.keyboard.up("Shift");
            await film.hold(1.0);
        },
    },
    {
        id: "marchers-select-tool",
        kind: "still",
        // The Select bar at the field's top right with Lasso picked, and its tooltip naming the key
        covers: [
            "apps/desktop/src/components/canvas/display/SelectToolBar.tsx",
        ],
        async setup({ page, wait, around, union }) {
            await toPage1(page, wait);
            const bar = page.getByTestId("field-select-tool");
            const lasso = page.getByTestId("field-select-tool-lasso");
            await lasso.click();
            // Off and back on, so the tooltip opens from a hover rather than the click
            await page.mouse.move(800, 500);
            await wait(300);
            await lasso.hover();
            await wait(1500);
            const tip = page
                .locator("[data-radix-popper-content-wrapper]")
                .first();
            return {
                box: union(
                    await around(tip, 12),
                    await around(page.getByTestId("field-display-bar"), 12),
                    await around(bar, 12),
                ),
            };
        },
    },
    {
        id: "marchers-select-lasso",
        kind: "clip",
        // With Lasso picked on the Select bar, a drag on empty field draws a lasso around a curved group
        covers: ["apps/desktop/src/field/fieldSelectTool.ts"],
        async setup({ page, wait }) {
            await toPage1(page, wait);
            await page.getByTestId("field-select-tool-lasso").click();
            const center = (await marchers(page)).get("G4");
            return { box: boxAround(center, 560, 360) };
        },
        async perform({ page, film, overlay }) {
            await overlay.enable();
            const center = (await marchers(page)).get("G4");
            const points = Array.from({ length: 25 }, (_, i) => {
                const t = -Math.PI / 2 + (i / 24) * Math.PI * 2;
                return {
                    x: center.x + 90 * Math.cos(t),
                    y: center.y - 12 + 104 * Math.sin(t),
                };
            });
            const rest = { x: points[0].x + 120, y: points[0].y - 20 };
            await page.mouse.move(rest.x, rest.y);
            await film.hold(0.3);
            await film.moveTo(page, rest, points[0], 0.5);
            await page.mouse.down();
            for (let i = 1; i < points.length; i++)
                await film.moveTo(page, points[i - 1], points[i], 0.06);
            await film.hold(0.2);
            await page.mouse.up();
            await film.hold(1.2);
        },
    },
    {
        id: "marchers-select-tab",
        kind: "still",
        // The Select tab: Select by Section, the section chips and Select all
        async setup({ page, wait }) {
            await toPage1(page, wait);
            await page.getByRole("tab", { name: "Select" }).click();
            await wait(600);
            const all = page
                .locator("[role='tabpanel'][data-state='active']")
                .getByText("Select all", { exact: true })
                .last();
            return { box: await toolbarUpTo(page, all) };
        },
    },
    {
        id: "marchers-coordinate-rounding",
        kind: "still",
        // The Coordinate Rounding menu open, X rounding to half steps, the offset off
        uiSettings: { coordinateRounding: { nearestXSteps: 0.5 } },
        async setup({ page, wait, around, union }) {
            await toPage1(page, wait);
            const bar = await toolbar(page);
            await page
                .getByText("Coordinate Rounding", { exact: true })
                .click();
            await wait(600);
            const disable = page.getByRole("button", {
                name: "Disable Offset",
            });
            if (await disable.count()) {
                await disable.click();
                await wait(400);
            }
            const menu = await around(
                page.locator("[data-radix-popper-content-wrapper]").last(),
                12,
            );
            const both = union(bar, menu);
            return { box: { ...both, width: Math.min(both.width, 384) } };
        },
    },
    {
        id: "marchers-move-drag",
        kind: "clip",
        // Dragging a selected row back, then holding Shift for a fine adjustment
        async setup({ page, wait }) {
            await toPage1(page, wait);
            const all = await marchers(page);
            const row = named(all, range("B", 1, 8));
            await shiftSelect(page, row, wait);
            const b = bounds(row);
            return {
                box: boxAround(
                    { x: (b.left + b.right) / 2, y: b.top - 40 },
                    760,
                    400,
                ),
            };
        },
        async perform({ page, film, overlay }) {
            await overlay.enable();
            const all = await marchers(page);
            const grab = all.get("B4");
            const rest = { x: grab.x + 80, y: grab.y + 70 };
            await page.mouse.move(rest.x, rest.y);
            await film.hold(0.3);
            await film.moveTo(page, rest, grab, 0.5);
            const back = { x: grab.x, y: grab.y - 90 };
            await film.drag(page, grab, back, 1.1);
            await film.hold(0.6);
            await page.keyboard.down("Shift");
            await film.hold(0.3);
            const across = { x: back.x + 120, y: back.y };
            await film.drag(page, back, across, 1.2);
            await film.hold(0.2);
            await page.keyboard.up("Shift");
            await film.hold(1.0);
        },
    },
    {
        id: "marchers-inspector",
        kind: "still",
        // The inspector's Arrange section, with eight marchers selected
        async setup({ page, wait }) {
            await toPage1(page, wait);
            const all = await marchers(page);
            await shiftSelect(page, named(all, range("B", 1, 8)), wait);
            await wait(600);
            const title = page.getByText("Arrange", { exact: true }).first();
            await title.evaluate((el) => el.scrollIntoView({ block: "start" }));
            await wait(400);
            const a = await title.boundingBox();
            const section = await page
                .getByTestId("arrange-section")
                .boundingBox();
            const top = a.y - 14;
            return {
                box: {
                    x: 1272,
                    y: top,
                    width: 322,
                    height: section.y + section.height + 16 - top,
                },
            };
        },
    },
    {
        id: "marchers-align",
        kind: "clip",
        // An arc of marchers aligned into a line (Alt+V)
        async setup({ page, wait }) {
            await toPage1(page, wait);
            const all = await marchers(page);
            const arc = named(all, range("T", 1, 12));
            await shiftSelect(page, arc, wait);
            const b = bounds(arc);
            return {
                box: boxAround(
                    {
                        x: (b.left + b.right) / 2 - 30,
                        y: (b.top + b.bottom) / 2,
                    },
                    500,
                    240,
                ),
            };
        },
        async perform({ page, film, overlay }) {
            await overlay.enable();
            await page.mouse.move(1500, 960);
            await film.hold(0.6);
            await page.keyboard.down("Alt");
            await film.hold(0.2);
            await page.keyboard.press("KeyV");
            await film.hold(0.3);
            await page.keyboard.up("Alt");
            await film.hold(1.6);
        },
    },
    {
        id: "marchers-space",
        kind: "clip",
        // A line of marchers with uneven gaps spaced evenly between its ends (Shift+H)
        async setup({ page, wait }) {
            await toPage1(page, wait);
            const labels = range("T", 1, 12);
            await shiftSelect(page, named(await marchers(page), labels), wait);
            await page.keyboard.press("Alt+KeyV");
            await wait(800);
            // Uneven gaps: two marchers in the middle of the line pulled sideways
            await page.keyboard.press("Escape");
            await wait(400);
            const line = named(await marchers(page), labels).sort(
                (m, n) => m.x - n.x,
            );
            for (const [m, dx] of [
                [line[3], 22],
                [line[7], -20],
            ]) {
                await page.mouse.move(m.x, m.y);
                await page.mouse.down();
                for (let i = 1; i <= 8; i++) {
                    await page.mouse.move(m.x + (dx * i) / 8, m.y);
                    await wait(30);
                }
                await page.mouse.up();
                await wait(500);
            }
            await page.keyboard.press("Escape");
            await wait(300);
            const now = named(await marchers(page), labels);
            await shiftSelect(page, now, wait);
            // A Shift-click on a marcher still selected from its drag takes it out again: add back
            // any of the twelve left out, so the whole line is selected
            for (let i = 0; i < 3; i++) {
                const missing = await page.evaluate((want) => {
                    const sel = new Set(window.fieldTest.selection());
                    return window.fieldTest
                        .marchers()
                        .filter((m) => want.includes(m.label) && !sel.has(m.id))
                        .map((m) => ({ x: m.screen.x, y: m.screen.y }));
                }, labels);
                if (missing.length === 0) break;
                await shiftSelect(page, missing, wait);
            }
            const b = bounds(now);
            return {
                box: boxAround(
                    { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 },
                    560,
                    200,
                ),
            };
        },
        async perform({ page, film, overlay }) {
            await overlay.enable();
            await page.mouse.move(1500, 960);
            await film.hold(0.6);
            await page.keyboard.down("Shift");
            await film.hold(0.2);
            await page.keyboard.press("KeyH");
            await film.hold(0.4);
            await page.keyboard.up("Shift");
            await film.hold(1.8);
        },
    },
    {
        id: "marchers-move-pad",
        kind: "still",
        // The tablet layout's inspector with three marchers selected: the Move pad
        async setup({ page, wait, around }) {
            await toPage1(page, wait);
            await toTablet(page, wait);
            const all = await marchers(page);
            await page.keyboard.down("Shift");
            for (const label of ["B3", "B4", "B5"]) {
                const m = all.get(label);
                await page.mouse.click(m.x, m.y);
            }
            await page.keyboard.up("Shift");
            await page.mouse.move(5, 500);
            await wait(800);
            const pad = page.getByTestId("move-pad");
            await pad.evaluate((el) => el.scrollIntoView({ block: "center" }));
            await wait(500);
            return { box: await around(pad, 14) };
        },
    },
    {
        id: "marchers-tags",
        kind: "still",
        // The inspector's tag row for selected marchers: a tag, and the create, add and remove buttons
        async setup({ page, wait }) {
            await toPage1(page, wait);
            const all = await marchers(page);
            await shiftSelect(page, named(all, range("B", 1, 4)), wait);
            const create = page.getByRole("button", {
                name: "Create new tag with selected marchers",
            });
            await create.evaluate((el) =>
                el.scrollIntoView({ block: "center" }),
            );
            await wait(400);
            await create.click();
            await wait(500);
            await page.locator("#tag-name-input").fill("Soloists");
            await page.getByRole("button", { name: "Create Tag" }).click();
            await wait(1200);
            await page.mouse.move(800, 950);
            await create.evaluate((el) =>
                el.scrollIntoView({ block: "center" }),
            );
            await wait(500);
            const chip = await page
                .getByText("Soloists", { exact: true })
                .first()
                .boundingBox();
            const c = await create.boundingBox();
            const remove = await page
                .getByRole("button", {
                    name: "Remove selected marchers from tag",
                })
                .boundingBox();
            const parts = [chip, c, remove].filter(Boolean);
            const top = Math.min(...parts.map((p) => p.y)) - 12;
            const bottom = Math.max(...parts.map((p) => p.y + p.height)) + 14;
            return {
                box: { x: 1272, y: top, width: 322, height: bottom - top },
            };
        },
    },
    {
        id: "marchers-rotate",
        kind: "clip",
        // Turning a selected block with the rotate handle
        async setup({ page, wait }) {
            await toPage1(page, wait);
            const all = await marchers(page);
            const block = named(all, [
                ...range("U", 1, 4),
                ...range("B", 1, 8),
            ]);
            await shiftSelect(page, block, wait);
            const b = bounds(block);
            return {
                box: boxAround(
                    {
                        x: (b.left + b.right) / 2 - 30,
                        y: (b.top + b.bottom) / 2 - 20,
                    },
                    560,
                    420,
                ),
            };
        },
        async perform({ page, film, overlay }) {
            await overlay.enable();
            const handles = await page.evaluate(() =>
                window.fieldTest.handles(),
            );
            const rot = handles.rot;
            const center = {
                x: (handles.w.x + handles.e.x) / 2,
                y: (handles.n.y + handles.s.y) / 2,
            };
            const r = Math.hypot(rot.x - center.x, rot.y - center.y);
            const start = Math.atan2(rot.y - center.y, rot.x - center.x);
            const rest = { x: rot.x + 90, y: rot.y + 30 };
            await page.mouse.move(rest.x, rest.y);
            await film.hold(0.3);
            await film.moveTo(page, rest, rot, 0.5);
            await page.mouse.down();
            let last = rot;
            const steps = 30;
            for (let i = 1; i <= steps; i++) {
                const a = start + (i / steps) * (Math.PI / 4);
                const p = {
                    x: center.x + r * Math.cos(a),
                    y: center.y + r * Math.sin(a),
                };
                await page.mouse.move(p.x, p.y);
                await film.frame();
                last = p;
            }
            await film.hold(0.3);
            await page.mouse.up();
            await page.mouse.move(last.x + 40, last.y + 40);
            await film.hold(1.2);
        },
    },
    {
        id: "marchers-pivot",
        kind: "clip",
        // Ctrl-dragging a selected block's pivot out of its center onto its corner marcher, then
        // turning around it
        async setup({ page, wait }) {
            await toPage1(page, wait);
            const all = await marchers(page);
            const block = named(all, [
                ...range("U", 1, 4),
                ...range("B", 1, 8),
            ]);
            await shiftSelect(page, block, wait);
            const b = bounds(block);
            return {
                box: boxAround(
                    {
                        x: (b.left + b.right) / 2 - 30,
                        y: (b.top + b.bottom) / 2 - 20,
                    },
                    620,
                    480,
                ),
            };
        },
        async perform({ page, film, overlay }) {
            await overlay.enable();
            const pivot = await page.evaluate(() =>
                window.fieldTest.selectionPivot(),
            );
            const handles = await page.evaluate(() =>
                window.fieldTest.handles(),
            );
            // The marcher nearest the frame's back-left corner
            const block = named(await marchers(page), [
                ...range("U", 1, 4),
                ...range("B", 1, 8),
            ]);
            const near = (m) =>
                Math.hypot(m.x - handles.nw.x, m.y - handles.nw.y);
            const nearest = block.reduce((a, m) => (near(m) < near(a) ? m : a));
            const corner = { x: nearest.x, y: nearest.y };
            const rest = { x: pivot.screen.x + 60, y: pivot.screen.y + 50 };
            await page.mouse.move(rest.x, rest.y);
            await film.hold(0.3);
            await film.moveTo(page, rest, pivot.screen, 0.5);
            await page.keyboard.down("Control");
            await film.hold(0.3);
            await page.mouse.down();
            await film.moveTo(page, pivot.screen, corner, 0.9);
            await page.mouse.up();
            await page.keyboard.up("Control");
            await film.hold(0.6);
            // Turn a quarter around it with the round handle
            const rot = handles.rot;
            const r = Math.hypot(rot.x - corner.x, rot.y - corner.y);
            const start = Math.atan2(rot.y - corner.y, rot.x - corner.x);
            await film.moveTo(page, corner, rot, 0.5);
            await page.mouse.down();
            let last = rot;
            const steps = 36;
            for (let i = 1; i <= steps; i++) {
                const a = start + (i / steps) * (Math.PI / 2);
                const p = {
                    x: corner.x + r * Math.cos(a),
                    y: corner.y + r * Math.sin(a),
                };
                await page.mouse.move(p.x, p.y);
                await film.frame();
                last = p;
            }
            await film.hold(0.3);
            await page.mouse.up();
            await page.mouse.move(last.x + 40, last.y + 40);
            await film.hold(1.2);
        },
    },
    {
        id: "marchers-appearance",
        kind: "still",
        // The Appearance panel's Section tab with a style for one section, given a red fill and a
        // square shape
        async setup({ page, wait }) {
            await toPage1(page, wait);
            await openSidebarPanel(page, "Appearance", wait);
            // The demo may come with section styles; add one only when it has none
            if (await page.getByText("No section styles defined yet").count()) {
                await page.getByText("Add Section Style").click();
                await wait(500);
                await page
                    .locator("[role='menuitem']:not([data-disabled])")
                    .first()
                    .click();
                await wait(800);
            }
            const panel = page.locator(".animate-scale-in").first();
            // A red fill, from the color picker's swatches
            await panel
                .getByText("Fill Color", { exact: true })
                .first()
                .click();
            await wait(500);
            await page.locator("[title='#D0021B']").first().click();
            await wait(300);
            await page.getByText("Save", { exact: true }).last().click();
            await wait(600);
            // A square dot
            await panel.getByRole("combobox").first().click();
            await wait(400);
            await page.getByRole("option").nth(2).click();
            await wait(1000);
            return { box: await sidebarPanel(page, 262) };
        },
    },
];

export default shots;

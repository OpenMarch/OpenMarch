// The Marchers chapter (guides/marchers/*).

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

const shots = [
    {
        id: "marchers-panel",
        kind: "still",
        // The Marchers panel: the list, with Add and Marcher Appearance
        async setup({ page, wait }) {
            await toPage1(page, wait);
            await openSidebarPanel(page, "Marchers", wait);
            return { box: await sidebarPanel(page, 520) };
        },
    },
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
        id: "marchers-select-lasso",
        kind: "clip",
        // Double-click and drag on empty field draws a lasso around a curved group
        async setup({ page, wait }) {
            await toPage1(page, wait);
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
            await page.mouse.click(points[0].x, points[0].y);
            await film.hold(0.1);
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
            return { box: await toolbar(page) };
        },
    },
    {
        id: "marchers-alignment-tab",
        kind: "still",
        // The Alignment tab: coordinate rounding, the locks, Snap and Snap to grid, Place all marchers
        async setup({ page, wait }) {
            await toPage1(page, wait);
            return { box: await toolbar(page) };
        },
    },
    {
        id: "marchers-coordinate-rounding",
        kind: "still",
        // The Coordinate Rounding menu open
        async setup({ page, wait, around, union }) {
            await toPage1(page, wait);
            const bar = await toolbar(page);
            await page
                .getByText("Coordinate Rounding", { exact: true })
                .click();
            await wait(600);
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
        // The inspector's Align and Distribute tools, with eight marchers selected
        async setup({ page, wait }) {
            await toPage1(page, wait);
            const all = await marchers(page);
            await shiftSelect(page, named(all, range("B", 1, 8)), wait);
            await wait(600);
            const align = page.getByRole("heading", {
                name: "Align",
                exact: true,
            });
            await align.evaluate((el) => el.scrollIntoView({ block: "start" }));
            await wait(400);
            const a = await align.boundingBox();
            const place = await page
                .getByText("Place selected marchers")
                .first()
                .boundingBox();
            const top = a.y - 14;
            return {
                box: {
                    x: 1272,
                    y: top,
                    width: 322,
                    height: place.y + place.height + 16 - top,
                },
            };
        },
    },
    {
        id: "marchers-align",
        kind: "clip",
        // An arc of marchers aligned into a line (Alt+V), then spaced evenly (Shift+H)
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
            await film.hold(1.3);
            await page.keyboard.down("Shift");
            await film.hold(0.2);
            await page.keyboard.press("KeyH");
            await film.hold(0.3);
            await page.keyboard.up("Shift");
            await film.hold(1.5);
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
        id: "marchers-appearance",
        kind: "still",
        // The Appearance panel's Section tab with a style for the Trumpets
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
            return { box: await sidebarPanel(page, 270) };
        },
    },
];

export default shots;

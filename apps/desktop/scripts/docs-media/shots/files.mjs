// The Files and export chapter (guides/files/*).

/** Closes notices that would sit over a picture (the low-quality notice, toasts). */
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

/** Opens the toolbar's File tab. */
async function fileTab(page) {
    await page.getByRole("tab", { name: "File", exact: true }).click();
    await page.waitForTimeout(400);
}

/**
 * Waits until `locator` stops moving or resizing (a dialog re-centers as its preview loads),
 * then frames it.
 */
async function settledBox(page, around, locator, pad) {
    let last = "";
    for (let i = 0; i < 40; i++) {
        const b = await locator.boundingBox();
        const key = JSON.stringify(b);
        if (b && key === last) break;
        last = key;
        await page.waitForTimeout(500);
    }
    return around(locator, pad);
}

/** Opens the Export dialog on one of its tabs. */
async function exportDialog(page, tab) {
    await tidy(page);
    await fileTab(page);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByRole("tab", { name: tab, exact: true }).click();
    await page.waitForTimeout(2500);
    // The pointer off the dialog, so no hover or tooltip shows
    await page.mouse.move(4, 996);
    await page.waitForTimeout(400);
    return dialog;
}

const shots = [
    {
        id: "files-launch",
        kind: "still",
        // The start page with the show in Recent Files, after closing it
        async setup({ page, wait, around }) {
            await tidy(page);
            await fileTab(page);
            await page.getByRole("button", { name: "Exit File" }).click();
            await page
                .getByText("Recent Files", { exact: true })
                .first()
                .waitFor({ timeout: 20000 });
            await wait(2500);
            await page.mouse.move(1596, 996);
            await wait(400);
            // The sidebar's New File and Open File, and the Recent Files card beside them
            const card = await around(
                page
                    .getByText("show.dots", { exact: true })
                    .first()
                    .locator("xpath=../.."),
                24,
            );
            const clear = await around(
                page.getByRole("button", { name: "Clear missing" }),
                16,
            );
            return {
                box: {
                    x: 0,
                    y: 40,
                    width: Math.max(card.x + card.width, clear.x + clear.width),
                    height: card.y + card.height - 40,
                },
            };
        },
    },
    {
        id: "files-file-tab",
        kind: "still",
        // The toolbar's File tab: Open File, New File, Save Copy, Exit File, Export and Settings
        async setup({ page, wait, around, union }) {
            await tidy(page);
            await fileTab(page);
            await page.mouse.move(1596, 996);
            await wait(400);
            return {
                box: union(
                    await around(
                        page.getByRole("tab", { name: "File", exact: true }),
                        10,
                    ),
                    await around(
                        page.getByRole("button", { name: "Settings" }).first(),
                        10,
                    ),
                    await around(
                        page.getByRole("button", { name: "Open File" }),
                        10,
                    ),
                ),
            };
        },
    },
    {
        id: "files-export-sheets",
        kind: "still",
        async setup({ page, around }) {
            const dialog = await exportDialog(page, "Coordinate Sheets");
            return { box: await settledBox(page, around, dialog, 4) };
        },
    },
    {
        id: "files-export-charts",
        kind: "still",
        async setup({ page, around }) {
            const dialog = await exportDialog(page, "Drill Charts");
            // Individual Drill Charts on, so the preview shows one marcher's chart with its paths
            await dialog.getByRole("checkbox").first().click();
            // The preview draws the show's own chart once its positions are read
            await page
                .locator('[data-testid="drill-chart-preview"][data-view-from]')
                .waitFor({ timeout: 20_000 });
            await page.waitForTimeout(500);
            await page.mouse.move(4, 996);
            return { box: await settledBox(page, around, dialog, 4) };
        },
    },
    {
        id: "files-video-settings",
        kind: "still",
        // The top of the Video tab: the dialog's tabs and the Resolution, Frame rate and Video
        // background settings, down to the top of the preview
        async setup({ page, around, wait }) {
            const dialog = await exportDialog(page, "Video");
            await wait(2500);
            await page
                .locator(".export-coordinates-dialog")
                .evaluate((el) => (el.scrollTop = 0));
            await wait(800);
            const d = await settledBox(page, around, dialog, 4);
            const canvas = await page
                .locator(".export-coordinates-dialog canvas")
                .first()
                .boundingBox();
            const bottom = Math.min(d.y + d.height, canvas.y + 24);
            return {
                box: { x: d.x, y: d.y, width: d.width, height: bottom - d.y },
            };
        },
    },
    {
        id: "files-export-video",
        kind: "still",
        async setup({ page, around, wait }) {
            const dialog = await exportDialog(page, "Video");
            await wait(2500);
            // Scrolled so the preview starts near the top
            const canvas = page
                .locator(".export-coordinates-dialog canvas")
                .first();
            await page.locator(".export-coordinates-dialog").evaluate(
                (el, c) => {
                    const r = c.getBoundingClientRect();
                    el.scrollTop += r.top - el.getBoundingClientRect().top - 60;
                },
                await canvas.elementHandle(),
            );
            await wait(800);
            const d = await settledBox(page, around, dialog, 4);
            const c = await canvas.boundingBox();
            // The On-screen info heading and the whole preview; the checkboxes under it don't
            // fit in the window with it, and the page lists them
            const top = Math.max(d.y, c.y - 52);
            const bottom = Math.min(d.y + d.height, c.y + c.height + 20);
            return {
                box: { x: d.x, y: top, width: d.width, height: bottom - top },
            };
        },
    },
    {
        id: "files-video-overlay",
        kind: "clip",
        // In the video preview: drag the info box to the top, then drag its corner to make it larger
        async setup({ page, around, wait }) {
            await exportDialog(page, "Video");
            await wait(2500);
            const canvas = page
                .locator(".export-coordinates-dialog canvas")
                .first();
            await canvas.evaluate((el) =>
                el.scrollIntoView({ block: "center" }),
            );
            await wait(800);
            const b = await canvas.boundingBox();
            // Find the box's corner and side handles from the cursor the preview shows over them
            const found = {};
            for (
                let y = b.y + b.height - 4;
                y > b.y + 4 && !found.scale;
                y -= 3
            )
                for (let x = b.x + 4; x < b.x + b.width - 4; x += 6) {
                    await page.mouse.move(x, y);
                    const cursor = await canvas.evaluate(
                        (el) => el.style.cursor,
                    );
                    if (cursor === "nwse-resize") {
                        found.scale = { x, y };
                        break;
                    }
                }
            if (!found.scale)
                throw new Error("no info box corner in the preview");
            this.corner = found.scale;
            this.canvas = b;
            await page.mouse.move(b.x + b.width + 40, b.y - 30);
            await wait(400);
            return { box: await around(canvas, 12) };
        },
        async perform({ page, film, overlay }) {
            await overlay.enable();
            const b = this.canvas;
            const c = this.corner;
            // Inside the box, a little in from its corner
            const grab = { x: c.x - 60, y: c.y - 14 };
            const start = { x: b.x + b.width - 40, y: b.y + 40 };
            await page.mouse.move(start.x, start.y);
            await film.hold(0.3);
            await film.moveTo(page, start, grab, 0.6);
            const up = { x: grab.x + b.width * 0.15, y: b.y + b.height * 0.25 };
            await film.drag(page, grab, up, 1.2);
            await film.hold(0.5);
            const corner = {
                x: c.x + (up.x - grab.x),
                y: c.y + (up.y - grab.y),
            };
            await film.moveTo(page, up, corner, 0.5);
            await film.drag(
                page,
                corner,
                { x: corner.x + 40, y: corner.y + 50 },
                1.0,
            );
            await film.hold(1.4);
        },
    },
];

export default shots;

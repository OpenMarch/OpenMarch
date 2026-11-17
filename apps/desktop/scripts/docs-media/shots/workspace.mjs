// The workspace chapter (guides/workspace/*).

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
    // Fit the field to the layout's larger field
    await page
        .getByTitle("Reset Zoom and Center")
        .click()
        .catch(() => {});
    await page.mouse.move(5, 500);
    await wait(1500);
}

const shots = [
    {
        id: "workspace-tablet-layout",
        kind: "still",
        // The whole window in the tablet layout, a page into the show
        async setup({ page, wait }) {
            await toPage1(page, wait);
            await toTablet(page, wait);
            return {};
        },
    },
    {
        id: "workspace-touch-buttons",
        kind: "still",
        // The tablet layout's row of buttons over the field
        async setup({ page, wait, around }) {
            await toPage1(page, wait);
            await toTablet(page, wait);
            return {
                box: await around(
                    page.getByTestId("touch-modifier-buttons"),
                    10,
                ),
            };
        },
    },
    {
        id: "window-overview",
        kind: "still",
        // The whole window, a few pages into the show
        async setup({ page, wait }) {
            await wait(4000);
            await page.keyboard.press("KeyE");
            await page.keyboard.press("KeyE");
            await wait(1500);
            return {};
        },
    },
    {
        id: "window-toolbar",
        kind: "still",
        // The title bar and the toolbar, with the Alignment tab's controls showing
        async setup({ page, wait }) {
            await toPage1(page, wait);
            await page.mouse.move(800, 500);
            await wait(500);
            // The menu to the end of the Alignment tab's controls, so the tab names can be read
            return { box: { x: 0, y: 0, width: 900, height: 120 } };
        },
    },
    {
        id: "window-toolbar-end",
        kind: "still",
        // The right end of the title bar and toolbar: search, Help, Submit bug or feedback, Open 3D
        // View and the Editor and Preview switch
        async setup({ page, wait }) {
            await toPage1(page, wait);
            await page.mouse.move(800, 500);
            await wait(500);
            return { box: { x: 1010, y: 0, width: 430, height: 72 } };
        },
    },
    {
        id: "window-command-palette",
        kind: "still",
        // The command palette with "split" typed: the matching commands, one dimmed
        async setup({ page, wait, around }) {
            await toPage1(page, wait);
            await page.keyboard.press("Control+KeyK");
            await wait(800);
            await page.keyboard.type("split", { delay: 60 });
            await wait(1000);
            const dialog = page.getByRole("dialog").last();
            return { box: await around(dialog, 10) };
        },
    },
    {
        id: "window-sidebar",
        kind: "still",
        // The sidebar's icons, with the Marchers panel open beside them
        async setup({ page, wait }) {
            await toPage1(page, wait);
            // The first icon in the sidebar is Marchers
            await page.mouse.click(29, 150);
            await wait(1200);
            await page.mouse.move(1000, 500);
            await wait(500);
            return { box: { x: 0, y: 118, width: 560, height: 700 } };
        },
    },
    {
        id: "window-inspector",
        kind: "still",
        // The inspector with three marchers selected, Arrange at the top
        async setup({ page, wait }) {
            await toPage1(page, wait);
            const picks = await page.evaluate(() =>
                window.fieldTest
                    .marchers()
                    .filter((m) => m.onScreen && /^B\d$/.test(m.label))
                    .sort((a, b) => a.label.localeCompare(b.label))
                    .slice(0, 3)
                    .map((m) => m.screen),
            );
            await page.mouse.click(picks[0].x, picks[0].y);
            await page.keyboard.down("Shift");
            for (const p of picks.slice(1)) await page.mouse.click(p.x, p.y);
            await page.keyboard.up("Shift");
            await page.mouse.move(800, 300);
            await wait(1200);
            return { box: { x: 1270, y: 36, width: 330, height: 640 } };
        },
    },
    {
        id: "workspace-pan-zoom",
        kind: "clip",
        // Right-drag pans, Ctrl+scroll zooms at the pointer, the percentage fits the field again
        async setup({ page, wait }) {
            await toPage1(page, wait);
            return { box: await page.locator("canvas").first().boundingBox() };
        },
        async perform({ page, film, overlay, box }) {
            await overlay.enable();
            const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
            const start = { x: c.x - 200, y: c.y - 40 };
            await page.mouse.move(start.x, start.y);
            await film.hold(0.4);
            const panned = { x: start.x + 220, y: start.y - 90 };
            await film.drag(page, start, panned, 1.0, { button: "right" });
            await film.hold(0.4);
            const zoomAt = { x: c.x + 60, y: c.y + 40 };
            await film.moveTo(page, panned, zoomAt, 0.5);
            await page.keyboard.down("Control");
            await film.hold(0.2);
            for (let i = 0; i < 8; i++) {
                await page.mouse.wheel(0, -12);
                await film.hold(0.08);
            }
            await film.hold(0.3);
            await page.keyboard.up("Control");
            await film.hold(0.5);
            const reset = await page
                .getByTitle("Reset Zoom and Center")
                .boundingBox();
            const target = {
                x: reset.x + reset.width / 2,
                y: reset.y + reset.height / 2,
            };
            await film.moveTo(page, zoomAt, target, 0.7);
            await page.mouse.down();
            await film.hold(0.1);
            await page.mouse.up();
            await film.hold(1.4);
        },
    },
    {
        id: "workspace-zoom-controls",
        kind: "still",
        // The zoom controls at the field's corner
        async setup({ page, wait, around }) {
            await toPage1(page, wait);
            const controls = page
                .getByTestId("canvas-zoom-slider")
                .locator("xpath=../..");
            return { box: await around(controls, 10) };
        },
    },
    {
        id: "workspace-preview",
        kind: "clip",
        // Selecting Preview: the editing panels go and the field fills the window
        async setup({ page, wait }) {
            await toPage1(page, wait);
            return {};
        },
        async perform({ page, film, overlay }) {
            await overlay.enable();
            const from = { x: 760, y: 420 };
            await page.mouse.move(from.x, from.y);
            await film.hold(0.4);
            const button = await page
                .getByTestId("workspace-view-preview")
                .boundingBox();
            const to = {
                x: button.x + button.width / 2,
                y: button.y + button.height / 2,
            };
            await film.moveTo(page, from, to, 0.8);
            await page.mouse.down();
            await film.hold(0.1);
            await page.mouse.up();
            await film.hold(1.8);
        },
    },
];

export default shots;

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

const shots = [
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

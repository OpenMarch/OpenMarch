// The field chapter (guides/field/*).

/** Closes notices that would sit over the picture (the low-quality field notice, toasts). */
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

/** The open sidebar panel (Field, Show settings, Metronome…). */
const panel = (page) => page.locator("div.absolute.z-40.bg-modal").first();

/** Opens a sidebar panel by its launcher's content id and waits for it. */
async function openPanel(page, wait, contentId) {
    await tidy(page);
    await page.locator(`[id="sidebar-launcher-${contentId}"]`).click();
    await panel(page).waitFor();
    await wait(600);
}

/** Opens the Field panel (#824) from the sidebar, on its Setup tab, and waits for it */
async function openFieldPanel(page, wait) {
    await tidy(page);
    await page.locator("#sidebar-launcher-field").click();
    await page.getByTestId("field-edit-panel").waitFor();
    await wait(800);
}

/** Opens the Field panel on its Lines tab (the mode for lines), and waits for it */
async function editField(page, wait) {
    await openFieldPanel(page, wait);
    await page.getByTestId("field-tab-lines").click();
    await page.waitForFunction(() => window.fieldTest?.fieldEdit?.() != null);
    await wait(800);
}

/** The mode's lines (window.fieldTest.fieldEdit()), X side 1 to side 2 then Y front to back */
const fieldLines = (page) =>
    page.evaluate(() => window.fieldTest.fieldEdit().lines);

/** Two neighboring X lines on side 2, the second and third out from the center */
async function sideTwoPair(page) {
    const xs = (await fieldLines(page))
        .filter((l) => l.axis === "x" && l.steps > 0)
        .sort((a, b) => a.steps - b.steps);
    return [xs[1], xs[2]];
}

/** The field's pane: the rulers and the field, beside the Field panel */
async function fieldPane(page) {
    const field = await page.locator("canvas").first().boundingBox();
    return {
        x: field.x - 4,
        y: field.y - 4,
        width: field.width + 8,
        height: field.height + 8,
    };
}

/** Pages forward from the first for the step size warning picture */
const STEP_WARNING_PAGES = 5;
/** A threshold low enough that the demo's moves on that page go over it */
const STEP_WARNING_INCHES = "9";

const shots = [
    {
        id: "field-edit-mode",
        kind: "still",
        // The whole window on the Lines tab: the list and the picked line's Line section, the
        // rulers, the hint and the dimmed drill
        async setup({ page, wait }) {
            await wait(3000);
            await editField(page, wait);
            const [line] = await sideTwoPair(page);
            await page.mouse.click(line.screen.x, line.screen.y);
            await page.mouse.move(800, 990);
            await wait(600);
            return { box: { x: 0, y: 0, width: 1600, height: 1000 } };
        },
    },
    {
        id: "field-ruler-drag",
        kind: "clip",
        // A line dragged out of the top ruler between two yard lines; its twin comes with it
        async setup({ page, wait }) {
            await wait(3000);
            await editField(page, wait);
            await page.mouse.move(800, 990);
            await wait(400);
            return { box: await fieldPane(page) };
        },
        async perform({ page, film, overlay }) {
            await overlay.enable();
            const [a, b] = await sideTwoPair(page);
            const from = { x: (a.tab.x + b.tab.x) / 2 + 2, y: a.tab.y };
            await page.mouse.move(from.x, from.y + 200);
            await film.moveTo(page, { x: from.x, y: from.y + 200 }, from, 0.6);
            await film.hold(0.3);
            await film.drag(page, from, { x: from.x, y: a.screen.y }, 1.6);
            await film.hold(1.2);
        },
    },
    {
        id: "field-line-detail",
        kind: "still",
        // The Lines tab's Line section for a picked yard line: its values, all changed here
        async setup({ page, wait, around }) {
            await wait(3000);
            await editField(page, wait);
            const [line] = await sideTwoPair(page);
            await page.mouse.click(line.screen.x, line.screen.y);
            await page.mouse.move(800, 990);
            const detail = page.getByTestId("field-line-detail");
            await detail.getByTestId("field-line-position").waitFor();
            await wait(500);
            return { box: await around(detail, 8) };
        },
    },
    {
        id: "field-inspector",
        kind: "still",
        // The Field panel as it opens: Done and X, the tabs, and Setup (template, size, names)
        async setup({ page, wait, around }) {
            await wait(3000);
            await openFieldPanel(page, wait);
            await page.mouse.move(800, 990);
            await wait(500);
            return {
                box: await around(page.getByTestId("field-edit-panel"), 6),
            };
        },
    },
    {
        id: "field-keys-help",
        kind: "still",
        // The panel's keyboard help: Tab walks the lines, F6 moves between the parts, the keys
        async setup({ page, wait, around }) {
            await wait(3000);
            await editField(page, wait);
            await page.getByTestId("field-edit-keys").click();
            const help = page.getByTestId("field-edit-keys-help");
            await help.waitFor();
            await wait(500);
            return { box: await around(help, 8) };
        },
    },
    {
        id: "field-template",
        kind: "still",
        // Another template picked: the sheet says what changes before it switches
        async setup({ page, wait, around }) {
            await wait(3000);
            await openFieldPanel(page, wait);
            await page.getByTestId("field-template-select").click();
            await page
                .getByRole("option", { name: "Indoor 50x70 - 24-inch steps" })
                .click();
            const dialog = page.getByRole("alertdialog");
            await dialog.waitFor();
            await wait(600);
            return { box: await around(dialog, 8) };
        },
    },
    {
        id: "field-step-warnings",
        kind: "still",
        // Warnings are off until turned on in Settings › Field
        uiSettings: { stepSizeWarnings: true },
        // The threshold lowered to 8 to 5 (22.5 in), so this page's long moves show in red
        async setup({ page, wait }) {
            await wait(3000);
            await openFieldPanel(page, wait);
            const input = page.getByTestId("field-step-warning");
            await input.fill(STEP_WARNING_INCHES);
            await input.press("Enter");
            await wait(600);
            await page.getByTestId("field-edit-done").click();
            await wait(600);
            for (let i = 0; i < STEP_WARNING_PAGES; i++) {
                await page.keyboard.press("KeyE");
                await wait(500);
            }
            await wait(1500);
            const field = await page.locator("canvas").first().boundingBox();
            return {
                box: {
                    x: field.x,
                    y: field.y,
                    width: field.width,
                    height: field.height,
                },
            };
        },
    },
    {
        id: "field-show-settings",
        kind: "still",
        async setup({ page, wait, around }) {
            await wait(3000);
            await openPanel(page, wait, "workspace-settings");
            // The fields, without the empty space under them
            const p = await panel(page).boundingBox();
            const last = await panel(page)
                .getByText("Measure Number Offset")
                .boundingBox();
            return {
                box: {
                    x: p.x,
                    y: p.y,
                    width: p.width,
                    height: last.y + last.height + 40 - p.y,
                },
            };
        },
    },
];

export default shots;

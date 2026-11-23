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

/** Where the back of the field (the backmost Y line) is drawn on screen, window points */
async function backEdgeY(page) {
    const ys = (await fieldLines(page)).filter((l) => l.axis === "y");
    return Math.min(...ys.map((l) => l.screen.y));
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

/** Lowers the step limit, closes the Field panel and goes to the page whose moves break it. */
async function stepWarningsPage(
    page,
    wait,
    inches = STEP_WARNING_INCHES,
    pages = STEP_WARNING_PAGES,
) {
    await wait(3000);
    await openFieldPanel(page, wait);
    const input = page.getByTestId("field-step-warning");
    await input.fill(inches);
    await input.press("Enter");
    await wait(600);
    await page.getByTestId("field-edit-done").click();
    await wait(600);
    for (let i = 0; i < pages; i++) {
        await page.keyboard.press("KeyE");
        await wait(500);
    }
    await wait(1500);
}

/** A box around the marchers whose labels match, grown by `pad` (window points). */
async function aroundMarchers(page, labels, pad) {
    const pts = (await page.evaluate(() => window.fieldTest.marchers())).filter(
        (m) => labels.test(m.label),
    );
    if (pts.length === 0) throw new Error(`no marchers match ${labels}`);
    const xs = pts.map((m) => m.screen.x);
    const ys = pts.map((m) => m.screen.y);
    const x = Math.min(...xs) - pad;
    const y = Math.min(...ys) - pad;
    return {
        x,
        y,
        width: Math.max(...xs) + pad - x,
        height: Math.max(...ys) + pad - y,
    };
}

const shots = [
    {
        id: "field-edit-mode",
        kind: "still",
        // The Lines tab beside the field: the list and the picked line's Line section, the rulers,
        // the hint and the dimmed drill (the window's toolbar, inspector and timeline cut away)
        // The 45s hidden first (H), so the list shows a crossed-out eye beside the reference
        // crosshair icons; then the 40 picked. Cropped to the panel and the left two thirds of the
        // field, below the toolbar, so the list and the panel's notes read at page width
        async setup({ page, wait, union }) {
            await wait(3000);
            await editField(page, wait);
            const xs = (await fieldLines(page))
                .filter((l) => l.axis === "x" && l.steps > 0)
                .sort((a, b) => a.steps - b.steps);
            await page.mouse.click(xs[0].screen.x, xs[0].screen.y);
            await wait(300);
            await page.keyboard.press("KeyH");
            await wait(400);
            const [line] = await sideTwoPair(page);
            await page.mouse.click(line.screen.x, line.screen.y);
            await page.mouse.move(800, 990);
            await wait(600);
            const panelBox = await page
                .getByTestId("field-edit-panel")
                .boundingBox();
            const field = await fieldPane(page);
            const b = union(panelBox, {
                ...field,
                width: (field.width * 2) / 3,
            });
            // The panel's and the rulers' top, no higher: the toolbar above stays out
            const top = Math.min(panelBox.y, field.y + 4);
            return {
                box: {
                    x: b.x - 6,
                    y: top,
                    width: b.width + 12,
                    height: b.y + b.height + 6 - top,
                },
            };
        },
    },
    {
        id: "field-ruler-drag",
        kind: "clip",
        // A line dragged out of the top ruler between two yard lines; its twin comes with it
        // Cropped to the top ruler and the top of the field, from side 1's 35 to past side 2's 30
        async setup({ page, wait }) {
            await wait(3000);
            await editField(page, wait);
            await page.mouse.move(800, 990);
            await wait(400);
            const field = await fieldPane(page);
            const xs = (await fieldLines(page))
                .filter((l) => l.axis === "x")
                .sort((p, q) => p.steps - q.steps);
            const at = (steps) => xs.find((l) => l.steps === steps).screen.x;
            const left = at(-24) - 40;
            // Ends inside the field's own pane: the panel beside it stays out
            const right = Math.min(at(32) + 260, field.x + field.width - 4);
            return {
                box: {
                    x: left,
                    y: field.y,
                    width: right - left,
                    height: (await backEdgeY(page)) + 230 - field.y,
                },
            };
        },
        async perform({ page, film, overlay }) {
            await overlay.enable();
            // Pressed on the ruler halfway between side 2's 40 and 35 tabs, on bare ruler (not a
            // tab, which would move that line): a new line, the 37.5, comes out
            const [a, b] = await sideTwoPair(page);
            const from = { x: (a.tab.x + b.tab.x) / 2, y: a.tab.y };
            const hit = await page.evaluate(
                ({ x, y }) =>
                    document
                        .elementFromPoint(x, y)
                        ?.closest("[data-field-line-tab]") != null,
                from,
            );
            if (hit) throw new Error("the press would land on a line's tab");
            await page.mouse.move(from.x, from.y + 160);
            await film.moveTo(page, { x: from.x, y: from.y + 160 }, from, 0.6);
            await film.hold(0.3);
            // Let go above the back hash, clear of the key cap at the bottom of the clip
            const to = { x: from.x, y: (await backEdgeY(page)) + 60 };
            await film.drag(page, from, to, 1.6);
            await film.hold(0.6);
            // The pointer leaves the field, so no line lights up under it
            await film.moveTo(page, to, { x: to.x + 40, y: to.y + 400 }, 0.5);
            await film.hold(1.4);
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
            // Scrolled so the section's last control (Delete line) is in view too
            await detail
                .getByRole("button", { name: /Delete/ })
                .last()
                .scrollIntoViewIfNeeded()
                .catch(() => {});
            await wait(500);
            // The section only: the transport below the panel stays out
            const d = await detail.boundingBox();
            const panelBox = await page
                .getByTestId("field-edit-panel")
                .boundingBox();
            const top = Math.max(d.y, panelBox.y) - 8;
            const bottom = Math.min(
                d.y + d.height,
                panelBox.y + panelBox.height,
            );
            return {
                box: {
                    x: d.x - 8,
                    y: top,
                    width: d.width + 16,
                    height: bottom + 8 - top,
                },
            };
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
            // To the sheet's edge, with no padding onto the field
            return { box: await around(dialog, 0) };
        },
    },
    {
        id: "field-step-warnings",
        kind: "still",
        // Warnings are off until turned on in Settings › Field; paths on, so an ordinary path
        // shows beside a warned one
        uiSettings: { stepSizeWarnings: true, nextPaths: true },
        // A 25-inch limit on page 11, whose move to page 12 is 8 counts: of guards G1 to G5, G3
        // and G5 go over it and their neighbors don't, so warned and ordinary paths sit side by side
        async setup({ page, wait }) {
            await stepWarningsPage(page, wait, "25", 11);
            await page.mouse.move(800, 990);
            await wait(800);
            const b = await aroundMarchers(page, /^G[1-5]$/, 130);
            const cx = b.x + b.width / 2;
            return { box: { ...b, x: cx - 350, width: 700 } };
        },
    },
    {
        id: "field-step-inspector",
        kind: "still",
        uiSettings: { stepSizeWarnings: true },
        // The same move and limit as field-step-warnings, with G1 to G5 selected: the inspector's
        // step sizes, the largest (one of the red paths there) with its red warning icon. The
        // field draws the selected page's move into the next page, the inspector the move into
        // the selected page (useTimelineStepSizes), so this is one page on: page 12
        async setup({ page, wait }) {
            await stepWarningsPage(page, wait, "25", 12);
            const guard = (
                await page.evaluate(() => window.fieldTest.marchers())
            ).filter((m) => /^G[1-5]$/.test(m.label));
            await page.mouse.click(guard[0].screen.x, guard[0].screen.y);
            await page.keyboard.down("Shift");
            for (const m of guard.slice(1))
                await page.mouse.click(m.screen.x, m.screen.y);
            await page.keyboard.up("Shift");
            await page.mouse.move(800, 990);
            await wait(800);
            // The marcher section is under Arrange and the page: scroll the inspector to it
            const label = page.getByText("Largest step size").first();
            await label.waitFor();
            await label.scrollIntoViewIfNeeded();
            await wait(500);
            const l = await label.boundingBox();
            const smallest = await page
                .getByText("Smallest step size")
                .first()
                .boundingBox();
            // From the marcher heading with the selection count down to the two rows, inside the
            // scrollbar
            const heading = await page
                .getByText(/^5 marchers/)
                .first()
                .boundingBox({ timeout: 2000 })
                .catch(() => null);
            const top = (heading ?? smallest ?? l).y - 12;
            return {
                box: {
                    x: l.x - 16,
                    y: top,
                    width: 300,
                    height: l.y + l.height + 24 - top,
                },
            };
        },
    },
    {
        id: "field-show-settings",
        kind: "still",
        // The whole panel: the show's details, the numbers, Performer defaults and the buttons
        async setup({ page, wait, around }) {
            await wait(3000);
            await openPanel(page, wait, "workspace-settings");
            await page.mouse.move(800, 990);
            // To the panel's edge: the field's ruler beside it stays out
            return { box: await around(panel(page), 0) };
        },
    },
    {
        id: "field-appearance",
        kind: "still",
        // The Field panel's Appearance tab: markings and labels, the background image, colors
        async setup({ page, wait, around }) {
            await wait(3000);
            await openFieldPanel(page, wait);
            await page.getByTestId("field-tab-appearance").click();
            await wait(800);
            await page.mouse.move(800, 990);
            // Down to just above the Background image heading, so no control is cut in half
            const b = await around(page.getByTestId("field-edit-panel"), 6);
            const heading = await page
                .getByTestId("field-edit-panel")
                .getByText("Background image", { exact: true })
                .first()
                .boundingBox({ timeout: 3000 })
                .catch(() => null);
            if (!heading || heading.y > b.y + b.height) return { box: b };
            return { box: { ...b, height: heading.y - 8 - b.y } };
        },
    },
];

export default shots;

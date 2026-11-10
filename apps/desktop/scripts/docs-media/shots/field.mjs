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

/** Opens the Field panel and turns on Customize, so the tabs show. */
async function customize(page, wait) {
    await openPanel(page, wait, "field");
    // The demo's field is already custom; a template field has a Customize button
    const button = page.getByRole("button", { name: "Customize" });
    if (await button.isVisible().catch(() => false)) await button.click();
    await page.getByRole("tab", { name: "General" }).waitFor();
    await wait(500);
}

/** Pages forward from the first for the step size warning picture */
const STEP_WARNING_PAGES = 5;
/** A threshold low enough that the demo's moves on that page go over it */
const STEP_WARNING_INCHES = "9";

const shots = [
    {
        id: "field-panel",
        kind: "still",
        async setup({ page, wait, around }) {
            await wait(3000);
            await openPanel(page, wait, "field");
            return { box: await around(panel(page), 6) };
        },
    },
    {
        id: "field-template",
        kind: "still",
        // A template picked from the list, before Apply Field Type
        async setup({ page, wait, around, union }) {
            await wait(3000);
            await openPanel(page, wait, "field");
            await panel(page).getByRole("combobox").first().click();
            await page
                .getByRole("option", {
                    name: "Indoor 50x70 - 24-inch steps",
                })
                .click();
            await wait(600);
            const apply = page.getByRole("button", {
                name: "Apply Field Type",
            });
            await apply.waitFor();
            const heading = panel(page).getByText("Customization", {
                exact: true,
            });
            const warning = panel(page).getByText(/Marchers will not move/);
            const p = await panel(page).boundingBox();
            const top = await heading.boundingBox();
            const bottom = await warning.boundingBox();
            return {
                box: {
                    x: p.x,
                    y: top.y - 12,
                    width: p.width,
                    height: bottom.y + bottom.height + 16 - (top.y - 12),
                },
            };
        },
    },
    {
        id: "field-checkpoints",
        kind: "still",
        async setup({ page, wait, around }) {
            await wait(3000);
            await customize(page, wait);
            await page.getByRole("tab", { name: "Checkpoints" }).click();
            await wait(400);
            await panel(page)
                .getByRole("tab", { name: "Checkpoints" })
                .evaluate((el) => el.scrollIntoView({ block: "start" }));
            await wait(400);
            // Open the first checkpoint's editor
            await panel(page)
                .getByText("0 yard line", { exact: true })
                .first()
                .click();
            await wait(600);
            const p = await panel(page).boundingBox();
            const tabs = await panel(page)
                .getByRole("tab", { name: "Checkpoints" })
                .boundingBox();
            return {
                box: {
                    x: p.x,
                    y: tabs.y - 12,
                    width: p.width,
                    height:
                        Math.min(p.y + p.height, tabs.y + 600) - (tabs.y - 12),
                },
            };
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
            await customize(page, wait);
            const input = panel(page)
                .getByText(/^Step Size Warning Threshold/)
                .locator("xpath=ancestor::*[.//input][1]")
                .locator("input");
            await input.fill(STEP_WARNING_INCHES);
            await input.press("Enter");
            await wait(600);
            await page.getByRole("button", { name: "Close panel" }).click();
            await wait(400);
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

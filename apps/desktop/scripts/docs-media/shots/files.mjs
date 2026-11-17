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
        async setup({ page, wait, whole }) {
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
            return { box: whole };
        },
    },
    {
        id: "files-file-tab",
        kind: "still",
        async setup({ page, around }) {
            await tidy(page);
            await fileTab(page);
            await page.mouse.move(1000, 600);
            const tabs = page.getByRole("tablist").first();
            const panel = page.getByRole("tabpanel").first();
            const a = await around(tabs, 8);
            const b = await around(panel, 8);
            const x = Math.min(a.x, b.x);
            const y = Math.min(a.y, b.y);
            return {
                box: {
                    x,
                    y,
                    width: Math.min(
                        1000,
                        Math.max(a.x + a.width, b.x + b.width) - x,
                    ),
                    height: Math.max(a.y + a.height, b.y + b.height) - y,
                },
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
            return { box: await settledBox(page, around, dialog, 4) };
        },
    },
    {
        id: "files-export-video",
        kind: "still",
        async setup({ page, around, wait }) {
            const dialog = await exportDialog(page, "Video");
            await wait(2500);
            return { box: await settledBox(page, around, dialog, 4) };
        },
    },
    {
        id: "files-mobile-panel",
        kind: "still",
        // The Mobile app panel before signing in
        async setup({ page, wait, around }) {
            await tidy(page);
            await page.locator("#sidebar-launcher-mobile-export").click();
            await wait(3000);
            await page.mouse.move(1596, 996);
            const panel = page
                .locator("div.backdrop-blur-32.absolute.z-40")
                .first();
            return { box: await around(panel, 12) };
        },
    },
];

export default shots;

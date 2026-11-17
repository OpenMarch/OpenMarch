// Shared by the shot files: make sure a selection really happened before a shot is taken.

/**
 * After a shot's clicks, checks that every named marcher is selected and Shift-clicks the ones
 * that aren't. A Shift-click can miss (a selection handle near the marcher takes it), and a
 * picture of the wrong selection is worse than none, so this throws if they still aren't selected.
 */
export async function ensureSelected(
    page,
    labels,
    wait = (ms) => page.waitForTimeout(ms),
) {
    for (let i = 0; ; i++) {
        const missing = await page.evaluate((want) => {
            const selected = new Set(window.fieldTest.selection());
            return window.fieldTest
                .marchers()
                .filter((m) => want.includes(m.label) && !selected.has(m.id))
                .map((m) => ({ label: m.label, x: m.screen.x, y: m.screen.y }));
        }, labels);
        if (missing.length === 0) return;
        if (i === 3)
            throw new Error(
                `couldn't select ${missing.map((m) => m.label).join(", ")}`,
            );
        await page.keyboard.down("Shift");
        for (const m of missing) await page.mouse.click(m.x, m.y);
        await page.keyboard.up("Shift");
        await wait(300);
    }
}

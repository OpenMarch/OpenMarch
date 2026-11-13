// The Start here chapter (guides/start/*).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DESKTOP = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
);
/** A show from before timelines (the demo, as 0.1.7 saved it). */
const PAGE_ERA_SHOW = path.join(DESKTOP, "web/public/demos/part1-demo.dots");

/** Hides toasts and closes the low-quality field notice, so nothing sits over the picture. */
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

/** The timeline a few pages into the show, nothing selected on the field. */
async function timelineAtPage3({ page, around, wait }) {
    await wait(3000);
    await tidy(page);
    await page.keyboard.press("KeyE");
    await page.keyboard.press("KeyE");
    await page.keyboard.press("KeyE");
    await wait(1500);
    await tidy(page);
    return { box: await around(page.getByTestId("timeline-pane"), 0) };
}

/** Opens the Settings window on `section`, sized for a picture, and frames all of it. */
export async function settingsWindow({ app, page, wait }, sectionLabel) {
    const opened = app.waitForEvent("window");
    await page.evaluate(() => window.electron.openSettingsWindow());
    const settings = await opened;
    await settings.waitForLoadState("domcontentloaded");
    const size = { width: 900, height: 640 };
    await app.evaluate(
        ({ BrowserWindow }, { s, url }) => {
            const win = BrowserWindow.getAllWindows().find(
                (w) => w.webContents.getURL() === url,
            );
            win.setContentBounds({ x: 0, y: 0, ...s });
            win.webContents.setBackgroundThrottling(false);
        },
        { s: size, url: settings.url() },
    );
    await wait(800);
    if (sectionLabel)
        await settings
            .getByRole("button", { name: sectionLabel, exact: true })
            .or(settings.getByRole("tab", { name: sectionLabel, exact: true }))
            .first()
            .click();
    await wait(800);
    // No focus ring on the section just chosen
    await settings.evaluate(() => document.activeElement?.blur());
    await wait(300);
    return {
        target: settings,
        box: { x: 0, y: 0, ...size },
    };
}

const shots = [
    {
        id: "start-timeline-basic",
        kind: "still",
        mode: "basic",
        setup: timelineAtPage3,
    },
    {
        id: "start-timeline-expert",
        kind: "still",
        mode: "expert",
        // The same page, with a few marchers split off into a move of their own, so the
        // timeline shows a move's bar under the pages
        async setup(ctx) {
            const { page, wait } = ctx;
            const framed = await timelineAtPage3(ctx);
            const picks = await page.evaluate(() =>
                window.fieldTest
                    .marchers()
                    .filter((m) => m.onScreen)
                    .sort((a, b) => a.label.localeCompare(b.label))
                    .slice(0, 6)
                    .map((m) => m.screen),
            );
            await page.mouse.click(picks[0].x, picks[0].y);
            await page.keyboard.down("Shift");
            for (const p of picks.slice(1)) await page.mouse.click(p.x, p.y);
            await page.keyboard.up("Shift");
            await wait(500);
            await page.keyboard.press("Control+KeyK");
            await wait(500);
            await page.keyboard.type("Split selected marchers");
            await wait(500);
            await page.keyboard.press("Enter");
            await wait(2000);
            await tidy(page);
            await page.mouse.move(5, 500);
            return framed;
        },
    },
    {
        id: "start-editor-mode-setting",
        kind: "still",
        async setup(ctx) {
            await ctx.wait(2000);
            return settingsWindow(ctx, "Timeline");
        },
    },
    {
        id: "start-convert-dialog",
        kind: "still",
        // The app confirms the demo's own conversion when it starts, so this opens a second
        // copy of the page-era show, which asks again over the open show.
        async setup({ page, around, wait }) {
            await wait(2000);
            await tidy(page);
            const folder = "/tmp/Shows";
            fs.mkdirSync(folder, { recursive: true });
            const file = path.join(folder, "Fall Show.dots");
            fs.copyFileSync(PAGE_ERA_SHOW, file);
            for (const old of fs.readdirSync(folder))
                if (old.includes(".pre-conversion"))
                    fs.rmSync(path.join(folder, old));
            await page.evaluate((f) => window.electron.openRecentFile(f), file);
            const dialog = page.getByTestId("convert-show-dialog");
            await dialog.waitFor({ timeout: 20000 });
            await wait(800);
            return { box: await around(dialog, 0) };
        },
    },
    {
        id: "start-report-drawer",
        kind: "still",
        // The report drawer over the editor, before signing in (the recorder isn't signed in)
        async setup({ page, around, wait }) {
            await wait(2000);
            await tidy(page);
            await page
                .getByRole("button", { name: "Submit bug or feedback" })
                .click();
            const drawer = page.getByRole("dialog", {
                name: "Report a bug or send feedback",
            });
            await drawer.waitFor({ timeout: 10000 });
            await wait(800);
            await page.mouse.move(5, 500);
            // Only the top: the rest of the drawer is empty until you sign in
            const box = await around(drawer, 8);
            return { box: { ...box, height: 280 } };
        },
    },
];

export default shots;

// The music chapter (guides/music/*).
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEMPO_SHOW = "scripts/docs-media/shows/music-tempo.dots";
/** A score with repeats, a D.S. al Coda written in words, and no problems otherwise */
const SCORE = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../../../packages/musicxml-parser/src/__test__/corpus/files/scorewriter-comparison/Finale/RepeatsTest/RepeatsTest Finale.musicxml",
);

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

async function box(locator) {
    const b = await locator.boundingBox();
    if (!b) throw new Error(`not on screen: ${locator}`);
    return b;
}

/** Turns Edit music on and waits for its lanes. */
async function editMusic(page, wait) {
    await tidy(page);
    await page.getByTestId("timeline-tempo-mode").click();
    await page.getByTestId("tempo-band").waitFor();
    await wait(1200);
}

/** The timeline pane, where Edit music's lanes are. */
const pane = (page) => page.getByTestId("timeline-pane");

/** The band's first tempo label (♩118) and where its line is. */
async function tempoLine(page) {
    const label = await box(page.getByTestId("tempo-label").first());
    return { x: label.x, y: label.y + label.height + 2 };
}

const shots = [
    {
        id: "music-edit-music",
        kind: "still",
        show: TEMPO_SHOW,
        async setup({ page, wait, around }) {
            await wait(3000);
            await editMusic(page, wait);
            await page.mouse.move(800, 200);
            return { box: await around(pane(page), 4) };
        },
    },
    {
        id: "music-timeline-waveform",
        kind: "still",
        show: TEMPO_SHOW,
        // The ordinary timeline: pages, counts, measures and the music's waveform
        async setup({ page, wait, around }) {
            await wait(3000);
            await tidy(page);
            await page.mouse.move(800, 200);
            return { box: await around(pane(page), 4) };
        },
    },
    {
        id: "music-file-menu",
        kind: "still",
        show: TEMPO_SHOW,
        async setup({ page, wait, union }) {
            await wait(3000);
            await editMusic(page, wait);
            await page.getByTestId("tempo-music-file").click();
            const menu = page.getByTestId("tempo-music-menu");
            await menu.waitFor();
            await wait(500);
            const header = await box(page.getByTestId("tempo-mode-header"));
            const m = await box(menu);
            const b = union(
                { x: header.x, y: header.y, width: 520, height: header.height },
                m,
            );
            return {
                box: {
                    x: b.x - 8,
                    y: b.y - 8,
                    width: b.width + 16,
                    height: b.height + 16,
                },
            };
        },
    },
    {
        id: "music-tempo-drag",
        kind: "clip",
        show: TEMPO_SHOW,
        // The first tempo stretch's line dragged from ♩118 up, then back down
        async setup({ page, wait, around }) {
            await wait(3000);
            await editMusic(page, wait);
            await page.mouse.move(800, 200);
            return { box: await around(pane(page), 4) };
        },
        async perform({ page, film, overlay }) {
            await overlay.enable();
            const line = await tempoLine(page);
            const at = { x: line.x + 160, y: line.y };
            await film.moveTo(page, { x: at.x + 200, y: at.y - 120 }, at, 0.6);
            await film.hold(0.3);
            await film.drag(page, at, { x: at.x, y: at.y - 24 }, 1.2);
            await film.hold(1.5);
        },
    },
    {
        id: "music-count-menu",
        kind: "still",
        show: TEMPO_SHOW,
        // Right-click on the tempo lane: the count's menu
        async setup({ page, wait, union }) {
            await wait(3000);
            await editMusic(page, wait);
            const line = await tempoLine(page);
            await page.mouse.click(line.x + 330, line.y + 20, {
                button: "right",
            });
            const menu = page.getByTestId("tempo-menu");
            await menu.waitFor();
            await wait(500);
            const band = await box(page.getByTestId("tempo-band"));
            const m = await box(menu);
            const b = union(
                {
                    x: band.x,
                    y: band.y,
                    width: m.x + m.width - band.x,
                    height: 1,
                },
                m,
            );
            return {
                box: {
                    x: b.x - 4,
                    y: Math.min(b.y, m.y) - 8,
                    width: b.width + 24,
                    height: b.height + 16,
                },
            };
        },
    },
    {
        id: "music-time-signature",
        kind: "still",
        show: TEMPO_SHOW,
        // A time signature chip's menu
        async setup({ page, wait, union }) {
            await wait(3000);
            await editMusic(page, wait);
            await page
                .getByTitle(/^Time signature 2\/4/)
                .first()
                .click();
            const menu = page.getByTestId("tempo-menu");
            await menu.waitFor();
            await wait(500);
            const band = await box(page.getByTestId("tempo-band"));
            const m = await box(menu);
            const left = Math.max(band.x, m.x - 360);
            const b = union({ x: left, y: band.y, width: 1, height: 1 }, m);
            return {
                box: {
                    x: b.x - 4,
                    y: b.y - 8,
                    width: b.width + 24,
                    height: b.height + 16,
                },
            };
        },
    },
    {
        id: "music-import-score",
        kind: "still",
        show: TEMPO_SHOW,
        // Import › MusicXML score… asks before anything changes
        async setup({ page, wait, around }) {
            await wait(3000);
            await editMusic(page, wait);
            await page.getByTestId("tempo-import").click();
            await page.getByTestId("tempo-import-score").click();
            const dialog = page.getByRole("alertdialog");
            await dialog.waitFor();
            await wait(600);
            return { box: await around(dialog, 12) };
        },
    },
    {
        id: "music-import-checks",
        kind: "still",
        show: TEMPO_SHOW,
        // A score with repeats and a jump written in words: the things to check after import
        async setup({ page, wait, around }) {
            await wait(3000);
            await editMusic(page, wait);
            await page
                .locator('input[type="file"][accept*="musicxml"]')
                .setInputFiles(SCORE);
            const show = page
                .locator("[data-sonner-toast]")
                .getByRole("button", { name: "Show", exact: true });
            await show.waitFor({ timeout: 20000 });
            await show.click();
            const dialog = page.getByRole("dialog");
            await dialog.waitFor();
            await wait(800);
            return { box: await around(dialog, 12) };
        },
    },
    {
        id: "music-metronome",
        kind: "still",
        show: TEMPO_SHOW,
        async setup({ page, wait, around }) {
            await wait(3000);
            await tidy(page);
            await page
                .locator('[id="sidebar-launcher-@openmarch/metronome"]')
                .click();
            const panel = page.locator("div.absolute.z-40.bg-modal").first();
            await panel.waitFor();
            await wait(600);
            const p = await box(panel);
            const last = await box(panel.getByText("Beat style"));
            return {
                box: {
                    x: p.x - 4,
                    y: p.y - 4,
                    width: p.width + 8,
                    height: last.y + last.height + 28 - p.y,
                },
            };
        },
    },
    {
        id: "music-sound",
        kind: "still",
        show: TEMPO_SHOW,
        // The timeline's Sound button: mute, volume and the metronome
        async setup({ page, wait, union }) {
            await wait(3000);
            await tidy(page);
            const button = page.getByTestId("timeline-sound");
            await button.click();
            await wait(600);
            const pop = page
                .locator("[data-radix-popper-content-wrapper]")
                .last();
            const b = union(await box(button), await box(pop));
            return {
                box: {
                    x: b.x - 12,
                    y: b.y - 12,
                    width: b.width + 24,
                    height: b.height + 24,
                },
            };
        },
    },
];

export default shots;

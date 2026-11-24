// The music chapter (guides/music/*).
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEMPO_SHOW = "scripts/docs-media/shows/music-tempo.dots";
/**
 * A score with repeats and jumps written in words, and no problems otherwise: a copy of the
 * parser corpus's RepeatsTest Finale.musicxml, named like a band's score
 */
const SCORE = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../assets/Opener - full score.musicxml",
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

/** The pane cut to its left part (measures 1 to about 10), so it shows near full size on the page. */
async function leftOfPane(page, around, width = 860) {
    const b = await around(pane(page), 4);
    return { ...b, width: Math.min(b.width, width) };
}

/** The tempo band's box, its pixels per count, and the x of the left edge of count `beat` (1-based). */
async function bandGeometry(page) {
    const band = page.getByTestId("tempo-band");
    const b = await box(band);
    const ppb = Number(await band.getAttribute("data-ppb"));
    return { band: b, ppb, xOfBeat: (beat) => b.x + (beat - 1) * ppb };
}

/**
 * Zooms the timeline in (Mod+scroll over the band's left end, so count 1 stays put) until
 * `counts` counts fill `width` window points. Edit music only: it reads the band's pixels a count.
 */
async function zoomToCounts(page, wait, counts, width) {
    const band = page.getByTestId("tempo-band");
    const b = await box(band);
    await page.mouse.move(b.x + 2, b.y + 60);
    for (let i = 0; i < 60; i++) {
        const ppb = Number(await band.getAttribute("data-ppb"));
        if (ppb * counts >= width) break;
        await page.keyboard.down("Control");
        await page.mouse.wheel(0, -60);
        await page.keyboard.up("Control");
        await wait(120);
    }
    await wait(800);
}

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
        // Zoomed in a little, to measures 1 to 11:
        // the header's left half and the four lanes, with the ramp and the jump
        async setup({ page, wait, around }) {
            await wait(3000);
            await editMusic(page, wait);
            await zoomToCounts(page, wait, 46, 780);
            await page.mouse.move(800, 200);
            return { box: await leftOfPane(page, around) };
        },
    },
    {
        id: "music-timeline-waveform",
        kind: "still",
        show: TEMPO_SHOW,
        // The ordinary timeline's left part, so its labels read at page width: the controls,
        // pages, counts, measures and the music's waveform
        async setup({ page, wait, around }) {
            await wait(3000);
            await tidy(page);
            await page.mouse.move(800, 200);
            const b = await leftOfPane(page, around, 820);
            // From the controls row down: the panel above the timeline stays out
            const controls = await box(page.getByTestId("timeline-tempo-mode"));
            const top = controls.y - 10;
            return {
                box: { ...b, y: top, height: b.y + b.height - top },
            };
        },
    },
    {
        id: "music-file-menu",
        kind: "still",
        // Two recordings, so the check mark shows which one plays
        show: "scripts/docs-media/shows/music-two-recordings.dots",
        async setup({ page, wait, union }) {
            await wait(3000);
            await editMusic(page, wait);
            await page.getByTestId("tempo-music-file").click();
            const menu = page.getByTestId("tempo-music-menu");
            await menu.waitFor();
            await wait(500);
            const header = await box(page.getByTestId("tempo-mode-header"));
            const m = await box(menu);
            // The menu and the header above it, ending after Metronome (not mid-button)
            const metronome = await box(
                page
                    .getByTestId("tempo-mode-header")
                    .getByRole("button", { name: /Metronome/ })
                    .first(),
            );
            const b = union(
                {
                    x: header.x,
                    y: header.y,
                    width: metronome.x + metronome.width + 8 - header.x,
                    height: header.height,
                },
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
        // Zoomed in to measures 1 to 6, the first tempo stretch's line dragged well down from ♩118:
        // the counts get longer, so the waveform squeezes and slides left under them
        async setup({ page, wait, around }) {
            await wait(3000);
            await editMusic(page, wait);
            await zoomToCounts(page, wait, 24, 780);
            await page.mouse.move(800, 200);
            const b = await leftOfPane(page, around);
            // From the Marks lane down: the header and transport stay out
            const band = await box(page.getByTestId("tempo-band"));
            const top = band.y - 4;
            return { box: { ...b, y: top, height: b.y + b.height - top } };
        },
        async perform({ page, film, overlay }) {
            await overlay.enable();
            const line = await tempoLine(page);
            const at = { x: line.x + 300, y: line.y };
            await film.moveTo(page, { x: at.x + 200, y: at.y + 120 }, at, 0.6);
            await film.hold(0.4);
            // Down (slower): ♩118 is the top of the lane here, so a drag up only rescales it
            await film.drag(page, at, { x: at.x, y: at.y + 36 }, 1.8);
            await film.hold(2.5);
        },
    },
    {
        id: "music-count-menu",
        kind: "still",
        show: TEMPO_SHOW,
        // A count made a hold, then right-clicked again: Hold length… and Not a hold, over the
        // tempo line's gap and the fermata sign
        // Zoomed in so a count is wide, and right-clicked near its right edge, so the menu opens
        // clear of the fermata sign over the middle of the count
        async setup({ page, wait, union }) {
            await wait(3000);
            await editMusic(page, wait);
            await zoomToCounts(page, wait, 16, 780);
            const { ppb, xOfBeat } = await bandGeometry(page);
            const line = await tempoLine(page);
            // m. 3, count 2
            const count = 10;
            const at = { x: xOfBeat(count) + ppb - 6, y: line.y + 30 };
            await page.mouse.click(at.x, at.y, { button: "right" });
            const menu = page.getByTestId("tempo-menu");
            await menu.waitFor();
            await menu.getByText("Make a hold (fermata)").click();
            await menu.waitFor({ state: "hidden" });
            // The band redraws from the saved tempo: wait until it lists the hold
            await page.waitForFunction(
                () =>
                    document
                        .querySelector('[data-testid="tempo-band"]')
                        ?.getAttribute("data-holds") !== "",
            );
            await wait(1500);
            await page.mouse.click(at.x, at.y, { button: "right" });
            await menu.getByText("Not a hold").waitFor();
            await wait(500);
            const band = await box(page.getByTestId("tempo-band"));
            const m = await box(menu);
            // Two counts before the held one, through the Tempo lane; the menu above it
            const left = Math.max(band.x, xOfBeat(count - 2));
            const b = union(
                { x: left, y: line.y - 34, width: 1, height: 100 },
                m,
            );
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
        id: "music-count-ask",
        kind: "still",
        show: TEMPO_SHOW,
        // Add a count after…: the box asks what happens to everything after it
        async setup({ page, wait, union }) {
            await wait(3000);
            await editMusic(page, wait);
            const line = await tempoLine(page);
            const at = { x: line.x + 250, y: line.y + 20 };
            await page.mouse.click(at.x, at.y, { button: "right" });
            const menu = page.getByTestId("tempo-menu");
            await menu.waitFor();
            await menu.getByText("Add a count after…").click();
            const ask = page.getByTestId("tempo-count-ask");
            await ask.waitFor();
            await page.mouse.move(at.x, at.y + 300);
            await wait(600);
            // The box and the Tempo lane under it, no wider than the box
            const a = await box(ask);
            const b = union(a, { x: a.x, y: line.y, width: 1, height: 40 });
            return {
                box: {
                    x: b.x - 10,
                    y: b.y - 10,
                    width: b.width + 20,
                    height: b.height + 14,
                },
            };
        },
    },
    {
        id: "music-gradual",
        kind: "clip",
        show: TEMPO_SHOW,
        // A jump from ♩118 to a faster tempo at measure 4 turned into a ramp with the square end
        // dot, then bent with the round handle in its middle
        async setup({ page, wait }) {
            await wait(3000);
            await editMusic(page, wait);
            const { band, ppb, xOfBeat } = await bandGeometry(page);
            const line = await tempoLine(page);
            // A tempo change at measure 4 (count 13), then that stretch dragged faster: a jump
            await page.mouse.dblclick(xOfBeat(13) + ppb / 2, line.y + 30);
            await wait(800);
            const from = { x: xOfBeat(17) + ppb / 2, y: line.y };
            await page.mouse.move(from.x, from.y);
            await page.mouse.down();
            await page.mouse.move(from.x, from.y - 12, { steps: 4 });
            await page.mouse.move(from.x, from.y - 26, { steps: 6 });
            await page.mouse.up();
            await wait(800);
            await page.mouse.move(xOfBeat(30), band.y + 300);
            await wait(400);
            return {
                box: {
                    x: band.x - 60,
                    y: band.y - 4,
                    width: 24 * ppb + 60,
                    // ends above the Music lane's name
                    height: 42 + 76 + 2,
                },
            };
        },
        async perform({ page, film, overlay }) {
            await overlay.enable();
            const { ppb, xOfBeat } = await bandGeometry(page);
            const line = await tempoLine(page);
            // The square dot on the first stretch's last count (count 12)
            const end = { x: xOfBeat(12) + ppb / 2, y: line.y };
            await film.moveTo(
                page,
                { x: end.x - 120, y: end.y + 50 },
                { x: end.x - 40, y: end.y },
                0.5,
            );
            await film.moveTo(page, { x: end.x - 40, y: end.y }, end, 0.4);
            await film.hold(0.4);
            // Drag it up a pixel a frame until it catches at the next tempo (the drag tag reads it)
            const target = await page
                .getByTestId("tempo-label")
                .nth(1)
                .innerText();
            const bpm = target.replace(/[^0-9.]/g, "");
            await page.mouse.down();
            let dy = 0;
            for (; dy < 80; dy++) {
                await page.mouse.move(end.x, end.y - dy);
                await film.frame();
                const tag = await page
                    .getByTestId("tempo-drag-tag")
                    .first()
                    .innerText()
                    .catch(() => "");
                if (dy > 4 && tag.replace(/[^0-9.]/g, "") === bpm) break;
            }
            await film.hold(0.4);
            await page.mouse.up();
            await film.hold(0.8);
            // The ramp's round handle, in its middle (counts 1 to 12: x of count 7), bent down
            const top = end.y - dy;
            const mid = { x: xOfBeat(7), y: (end.y + top) / 2 };
            await film.moveTo(page, { x: end.x, y: top }, mid, 0.6);
            await film.hold(0.4);
            await film.drag(page, mid, { x: mid.x, y: mid.y + 12 }, 0.8);
            await film.hold(1.4);
        },
    },
    {
        id: "music-add",
        kind: "still",
        show: TEMPO_SHOW,
        // Edit music in a show with no music yet: the left end of the header, from Editing music
        // to Metronome, near full size (Import and Done are in music-import-menu)
        async setup({ page, wait, union }) {
            await wait(3000);
            await editMusic(page, wait);
            await page.getByTestId("tempo-music-file").click();
            await page.getByTestId("tempo-music-delete").click();
            await page.getByTestId("tempo-music-delete-confirm").click();
            await page.getByTestId("tempo-add-music").waitFor();
            await page.mouse.move(800, 200);
            await tidy(page);
            await wait(800);
            const header = await box(page.getByTestId("tempo-mode-header"));
            const metronome = await box(
                page
                    .getByTestId("tempo-mode-header")
                    .getByRole("button", { name: /Metronome/ })
                    .first(),
            );
            return {
                box: {
                    x: header.x - 4,
                    y: header.y - 4,
                    width: metronome.x + metronome.width + 12 - header.x,
                    height: header.height + 8,
                },
            };
        },
    },
    {
        id: "music-time-signature",
        kind: "still",
        show: TEMPO_SHOW,
        // A time signature chip's menu, with the chip and the measures lane beside it
        async setup({ page, wait, union }) {
            await wait(3000);
            await editMusic(page, wait);
            const chipAt = page.getByTitle(/^Time signature 2\/4/).first();
            const chip = await box(chipAt);
            await chipAt.click();
            const menu = page.getByTestId("tempo-menu");
            await menu.waitFor();
            await wait(500);
            const m = await box(menu);
            // The menu and the Meas. lane under it, with the chip and a measure before it
            const left = Math.min(chip.x, m.x) - 60;
            const b = union(
                { x: left, y: chip.y, width: 1, height: chip.height + 4 },
                m,
            );
            return {
                box: {
                    x: b.x,
                    y: b.y - 8,
                    width: b.width + 12,
                    height: b.height + 14,
                },
            };
        },
    },
    {
        id: "music-import-menu",
        kind: "still",
        show: TEMPO_SHOW,
        // Edit music's Import button with its menu open: Audio file and MusicXML score, at the
        // header's right end beside Done
        async setup({ page, wait, union }) {
            await wait(3000);
            await editMusic(page, wait);
            const button = page.getByTestId("tempo-import");
            await button.click();
            const item = page.getByTestId("tempo-import-score");
            await item.waitFor();
            await item.hover();
            await wait(600);
            const header = await box(page.getByTestId("tempo-mode-header"));
            const b = union(await box(item.locator("..")), {
                x: header.x + header.width - 480,
                y: header.y,
                width: 480,
                height: header.height,
            });
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
        id: "music-tap-tempo",
        kind: "still",
        show: TEMPO_SHOW,
        // Tap tempo after eight taps half a second apart: about ♩120 and Use
        async setup({ page, wait, union }) {
            await wait(3000);
            await editMusic(page, wait);
            await page
                .getByTestId("tempo-mode-header")
                .getByRole("button", { name: "Tap tempo" })
                .click();
            const panel = page.getByTestId("tap-tempo");
            await panel.waitFor();
            for (let i = 0; i < 8; i++) {
                await page.keyboard.press("KeyT");
                await wait(500);
            }
            await page.mouse.move(800, 990);
            await wait(400);
            const header = await box(page.getByTestId("tempo-mode-header"));
            const p = await box(panel);
            const b = union(p, {
                x: p.x,
                y: header.y,
                width: p.width,
                height: header.height,
            });
            return {
                box: {
                    x: b.x - 10,
                    y: b.y - 10,
                    width: b.width + 20,
                    height: b.height + 20,
                },
            };
        },
    },
    {
        id: "music-metronome-panel",
        kind: "still",
        show: TEMPO_SHOW,
        // The Metronome panel from the sidebar: on/off, accent, measure-only clicks, volume and
        // the click's sound, with the sidebar button beside it
        async setup({ page, wait }) {
            await wait(3000);
            await tidy(page);
            const launcher = page.locator(
                '[id="sidebar-launcher-@openmarch/metronome"]',
            );
            await launcher.click();
            const panel = page.locator("div.absolute.z-40.bg-modal").first();
            await panel.waitFor();
            await page.mouse.move(800, 990);
            await wait(800);
            const l = await box(launcher);
            const p = await box(panel);
            // Ends under the last control (Beat style), not at the panel's foot
            const last = await box(panel.getByText("Beat style").first());
            const bottom = Math.min(p.y + p.height, last.y + last.height + 40);
            return {
                box: {
                    x: l.x - 8,
                    y: Math.min(l.y, p.y) - 8,
                    width: p.x + p.width + 8 - (l.x - 8),
                    height:
                        Math.max(bottom, l.y + l.height) +
                        8 -
                        (Math.min(l.y, p.y) - 8),
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
        id: "music-sound",
        kind: "still",
        show: TEMPO_SHOW,
        // The timeline's Sound button with the metronome on (the dot on the button): mute, volume
        // and the metronome
        async setup({ page, wait, union }) {
            await wait(3000);
            await tidy(page);
            await page.keyboard.press("Control+KeyM");
            await wait(400);
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
                    y: b.y - 4,
                    width: b.width + 24,
                    height: b.height + 16,
                },
            };
        },
    },
];

export default shots;

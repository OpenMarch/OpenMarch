// cspell:ignore rawvideo
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import type { Page } from "@playwright/test";
import { FieldProperties } from "@openmarch/core";
import { test, expect, type Show } from "../fixtures.mjs";
import { seedShowSql } from "../seed.mjs";

/**
 * The video export (#207) draws its frames through the field off screen.
 * These check the video file it saves: its
 * size and length, and where the marchers are in its frames, against the
 * show file. Frames are read with ffmpeg.
 */

// T1 walks from (400, 300) to (600, 300) over page 1, beats 1 to 9 at half a
// second a beat; T2 stands at (400, 500). The show is 4 s long.
const seed = seedShowSql({
    beats: 16,
    measureStarts: [1, 5, 9, 13],
    pageStarts: [1],
    marchers: [1, 2].map((id) => ({
        id,
        section: "Trumpet",
        prefix: "T",
        order: id,
    })),
    positions: [
        [
            [1, 400, 300],
            [2, 400, 500],
        ],
        [
            [1, 600, 300],
            [2, 400, 500],
        ],
    ],
});
const SHOW_SECONDS = 4;
const FRAME = { width: 1920, height: 1080 };
/** `FIELD_MARGIN_PX` in `videoFrameRenderer.ts`: field units around the fitted field. */
const FIELD_MARGIN = 40;

const openVideoExport = async (page: Page) => {
    await page.getByRole("tab", { name: "File" }).click();
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page.getByRole("tab", { name: "Video" }).click();
};

/** Where a field point lands in a frame of the default framing: the field fitted with its margin, centered. */
async function framePixel(show: Show) {
    const [row] = await show.query<{ json_data: string }>(
        "SELECT json_data FROM field_properties",
    );
    const field = new FieldProperties(JSON.parse(row.json_data));
    const zoom = Math.min(
        FRAME.width / (field.width + FIELD_MARGIN * 2),
        FRAME.height / (field.height + FIELD_MARGIN * 2),
    );
    const panX = (FRAME.width - field.width * zoom) / 2;
    const panY = (FRAME.height - field.height * zoom) / 2;
    return (x: number, y: number) => ({
        x: Math.round(panX + x * zoom),
        y: Math.round(panY + y * zoom),
    });
}

type Probe = { width: number; height: number; duration: number };

function probe(file: string): Probe {
    const out = JSON.parse(
        execFileSync("ffprobe", [
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height:format=duration",
            "-of",
            "json",
            file,
        ]).toString(),
    );
    return {
        width: out.streams[0].width,
        height: out.streams[0].height,
        duration: Number(out.format.duration),
    };
}

/** The frame shown at `seconds`, as RGB bytes. */
function frameAt(file: string, seconds: number) {
    const rgb = execFileSync(
        "ffmpeg",
        [
            "-v",
            "error",
            "-ss",
            String(seconds),
            "-i",
            file,
            "-frames:v",
            "1",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-",
        ],
        { maxBuffer: FRAME.width * FRAME.height * 4 },
    );
    return (at: { x: number; y: number }) => {
        const i = (at.y * FRAME.width + at.x) * 3;
        return [rgb[i], rgb[i + 1], rgb[i + 2]];
    };
}

/** Within video compression's error of each other. */
const close = (a: number[], b: number[]) =>
    a.every((value, i) => Math.abs(value - b[i]) <= 40);

test.use({ seedSql: seed });
// Every frame is drawn and encoded on this machine's CPU
test.setTimeout(240_000);

test("saves a video of the show with the marchers where the show puts them", async ({
    show,
}) => {
    const { page } = show;
    await openVideoExport(page);
    await page.getByRole("combobox", { name: /^\d+ fps$/ }).click();
    await page.getByRole("option", { name: "30 fps" }).click();
    const exportButton = page.getByRole("button", {
        name: "Export",
        exact: true,
    });
    await expect(exportButton).toBeEnabled();
    await exportButton.click();
    await expect(page.getByText("Export completed!")).toBeVisible({
        timeout: 200_000,
    });

    const file = show.videoExportPath;
    const video = probe(file);
    expect(video.width).toBe(FRAME.width);
    expect(video.height).toBe(FRAME.height);
    expect(video.duration).toBeGreaterThan(SHOW_SECONDS - 0.1);
    expect(video.duration).toBeLessThan(SHOW_SECONDS + 0.2);

    const pixel = await framePixel(show);
    const first = frameAt(file, 0.05);
    const middle = frameAt(file, 2);
    const last = frameAt(file, 3.9);
    // T2 never moves: its dot's color, in every frame
    const marcher = first(pixel(400, 500));
    expect(close(middle(pixel(400, 500)), marcher)).toBe(true);
    expect(close(last(pixel(400, 500)), marcher)).toBe(true);
    // T1 starts at x 400, is halfway at 2 s, and has nearly arrived by the end
    expect(close(first(pixel(400, 300)), marcher)).toBe(true);
    expect(close(middle(pixel(500, 300)), marcher)).toBe(true);
    expect(close(last(pixel(595, 300)), marcher)).toBe(true);
    // ...and where it was is field again
    expect(close(last(pixel(400, 300)), marcher)).toBe(false);
    expect(close(first(pixel(595, 300)), marcher)).toBe(false);
});

test.describe("losing WebGL mid-export", () => {
    test.use({
        // A 32 s show, so the export is still drawing when its context goes
        seedSql: seedShowSql({
            beats: 16,
            beatSeconds: 4,
            pageStarts: [1],
            marchers: [{ id: 1, section: "Trumpet", prefix: "T", order: 1 }],
            positions: [[[1, 400, 300]], [[1, 600, 300]]],
        }),
        // Keeps every WebGL context the page makes, to lose the export's
        initScript: `{
            const getContext = HTMLCanvasElement.prototype.getContext;
            window.__omGlContexts = [];
            HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
                const context = getContext.call(this, type, ...rest);
                if (context && String(type).startsWith("webgl")) window.__omGlContexts.push(context);
                return context;
            };
        }`,
        // One pattern: a two-item array reads as a fixture tuple
        allowedPageErrors: [/Video export failed|context/i],
    });
    test.skip(
        ({ target }) => target !== "browser",
        "Reaches the export's context through an init script",
    );

    test("stops with an explanation and saves no video", async ({ show }) => {
        const { page } = show;
        await openVideoExport(page);
        const exportButton = page.getByRole("button", {
            name: "Export",
            exact: true,
        });
        await expect(exportButton).toBeEnabled();
        await exportButton.click();
        // The export's own field draws 1080p frames; the preview's is smaller
        const exportContext = `window.__omGlContexts.find(
            (c) => c.canvas.width === 1920 && c.canvas.height === 1080,
        )`;
        await expect.poll(() => page.evaluate(`!!${exportContext}`)).toBe(true);
        await page.evaluate(
            `${exportContext}.getExtension("WEBGL_lose_context").loseContext()`,
        );
        await expect(
            page.getByText("context was lost", { exact: false }),
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText("Export completed!")).toHaveCount(0);
        expect(fs.existsSync(show.videoExportPath)).toBe(false);
    });
});

test.describe("without WebGL", () => {
    test.use({
        initScript: `{
            const getContext = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
                if (String(type).startsWith("webgl") || type === "experimental-webgl") return null;
                return getContext.call(this, type, ...rest);
            };
        }`,
        // Three's own report of the context it couldn't create
        allowedPageErrors: [/WebGL/],
    });
    test.skip(
        ({ target }) => target !== "browser",
        "Takes WebGL away with an init script",
    );

    test("says the export needs WebGL and can't start", async ({ show }) => {
        const { page } = show;
        await openVideoExport(page);
        await expect(
            page.getByText("Video export needs WebGL", { exact: false }),
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Export", exact: true }),
        ).toBeDisabled();
    });
});

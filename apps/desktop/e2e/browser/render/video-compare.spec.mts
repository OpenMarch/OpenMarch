import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "../fixtures.mjs";

/**
 * Video export comparisons (#207), not a scenario: it only runs with
 * `VIDEO_COMPARE=<folder>`. It exports the converted demo shows at 1080p,
 * 30 fps, through the export dialog, and saves each video as
 * `<folder>/<VIDEO_COMPARE_LABEL>/<case>.<webm|mp4>`. Run it on two checkouts
 * (say `before` and `after`), then pair the videos' frames with
 * `video-compare.sh <folder> before after`.
 */

const out = process.env.VIDEO_COMPARE;
const label = process.env.VIDEO_COMPARE_LABEL ?? "after";
const desktop = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
);

/** Every dot shape, outlines, a hidden section and hidden labels (as `render-compare.spec.mts`). */
const VARIETY_SQL = [
    `DELETE FROM section_appearances`,
    `INSERT INTO section_appearances (section, fill_color, outline_color, shape_type, visible, label_visible) VALUES
        ('Trumpet', 'rgba(30,90,220,1)', 'rgba(0,0,0,1)', 'square', 1, 1),
        ('Clarinet', 'rgba(250,200,0,1)', 'rgba(255,255,255,1)', 'triangle', 1, 1),
        ('Color Guard', 'rgba(140,40,180,1)', NULL, 'x', 1, 1),
        ('Flute', 'rgba(0,160,0,1)', 'rgba(255,120,0,1)', 'x', 1, 1),
        ('Tuba', NULL, 'rgba(0,0,0,1)', 'circle', 1, 0),
        ('Bari Sax', NULL, NULL, NULL, 0, 0)`,
];

/** The field render comparisons' checkerboard, fitted at 60% opacity. */
const IMAGE_SQL = [
    `UPDATE field_properties SET image = X'${fs
        .readFileSync(new URL("./field-image.png", import.meta.url))
        .toString("hex")}', json_data = json_set(json_data,
        '$.showFieldImage', json('true'),
        '$.imageFillOrFit', 'fit',
        '$.backgroundImageOpacity', 0.6)`,
];

const CASES = [
    {
        name: "part1-variety",
        file: "view3d-web/public/demos/part1-demo.dots",
        seedSql: VARIETY_SQL,
    },
    {
        name: "part1-image",
        file: "view3d-web/public/demos/part1-demo.dots",
        seedSql: IMAGE_SQL,
    },
    {
        name: "daft-punk",
        file: "view3d-web/public/demos/lhb-daft-punk-pt2.dots",
        seedSql: [],
    },
];

for (const c of CASES)
    test.describe(c.name, () => {
        test.skip(!out, "set VIDEO_COMPARE to export");
        test.use({
            showFile: path.join(desktop, c.file),
            seedSql: c.seedSql,
        });
        // Minutes of video, drawn and encoded on this machine's CPU
        test.setTimeout(3_600_000);

        test("export", async ({ show }) => {
            const { page } = show;
            await page.getByRole("tab", { name: "File" }).click();
            await page
                .getByRole("button", { name: "Export", exact: true })
                .click();
            await page.getByRole("tab", { name: "Video" }).click();
            await page.getByRole("combobox", { name: /^\d+ fps$/ }).click();
            await page.getByRole("option", { name: "30 fps" }).click();
            const exportButton = page.getByRole("button", {
                name: "Export",
                exact: true,
            });
            await expect(exportButton).toBeEnabled({ timeout: 60_000 });
            const started = Date.now();
            await exportButton.click();
            await expect(page.getByText("Export completed!")).toBeVisible({
                timeout: 3_500_000,
            });
            const seconds = (Date.now() - started) / 1000;

            const video = fs.readFileSync(show.videoExportPath);
            // WebM files start with these four bytes; anything else here is MP4
            const extension =
                video.subarray(0, 4).toString("hex") === "1a45dfa3"
                    ? "webm"
                    : "mp4";
            const folder = path.join(out!, label);
            fs.mkdirSync(folder, { recursive: true });
            fs.writeFileSync(
                path.join(folder, `${c.name}.${extension}`),
                video,
            );
            fs.appendFileSync(
                path.join(folder, "export-times.tsv"),
                `${c.name}\t${seconds.toFixed(1)}\n`,
            );
        });
    });

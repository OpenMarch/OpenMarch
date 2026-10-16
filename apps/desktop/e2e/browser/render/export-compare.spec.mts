import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "../fixtures.mjs";
import { waitForField } from "../app.mjs";

/**
 * Drill chart export captures for the parity gate (#208): exports the demo
 * shows' drill charts through the export dialog, full charts and individual
 * charts, and saves every chart's SVG pages (the PDF's input; the host
 * writes them instead of making PDFs). It only runs with
 * `EXPORT_COMPARE=<folder>`, and saves to `<folder>/<EXPORT_COMPARE_LABEL>/`
 * (default `after`):
 *
 *     EXPORT_COMPARE=/tmp/ec pnpm exec playwright test --project=render export-compare
 *
 * Compare two labels, or a label with #206's approved `after` set (fork
 * prerelease `export-diff-206`), file by file. The drill charts are drawn
 * from show data whichever field is on screen.
 */

const out = process.env.EXPORT_COMPARE;
const label = process.env.EXPORT_COMPARE_LABEL ?? "after";
const desktop = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
);
const DEMOS = path.join(desktop, "view3d-web/public/demos");
/** A 64 by 24 PNG: a checkerboard of 8 px squares with a red border. */
const IMAGE_PNG = fs
    .readFileSync(new URL("./field-image.png", import.meta.url))
    .toString("hex");

const SHOWS = [
    { name: "part1-demo", file: "part1-demo.dots", seedSql: [] as string[] },
    { name: "lhb-daft-punk-pt2", file: "lhb-daft-punk-pt2.dots", seedSql: [] },
    {
        // Part 1 with a field image, fitted at 60% opacity
        name: "part1-image",
        file: "part1-demo.dots",
        seedSql: [
            `UPDATE field_properties SET json_data = json_set(json_data, '$.imageFillOrFit', 'fit', '$.backgroundImageOpacity', 0.6), image = X'${IMAGE_PNG}'`,
        ],
    },
];

for (const show of SHOWS)
    for (const individual of [false, true])
        test.describe(`${show.name}${individual ? " individual" : ""}`, () => {
            test.skip(!out, "set EXPORT_COMPARE to capture");
            test.use({
                showFile: path.join(DEMOS, show.file),
                seedSql: show.seedSql,
            });

            test("exports drill charts", async ({ show: app }, testInfo) => {
                // Individual charts are slow: builds before #206 took minutes
                // for Part 1's 95 and didn't finish Daft Punk's 385 in 28
                // minutes (#208)
                test.setTimeout(1_800_000);
                const { page } = app;
                await waitForField(page);
                await page.getByRole("tab", { name: "File" }).click();
                await page
                    .getByRole("button", { name: "Export", exact: true })
                    .click();
                await page.getByRole("tab", { name: "Drill Charts" }).click();
                if (individual)
                    await page
                        .locator("label", {
                            hasText: "Individual Drill Charts",
                        })
                        .locator("xpath=..")
                        .getByRole("checkbox")
                        .click();
                const dialog = page.getByRole("dialog");
                await dialog
                    .getByRole("button", { name: "Export", exact: true })
                    .click();
                await expect(
                    page.getByText("Successfully exported as PDF!"),
                ).toBeVisible({ timeout: 1_700_000 });
                const from = testInfo.outputPath("exported-drill-charts");
                const to = path.join(out!, label, show.name);
                fs.mkdirSync(to, { recursive: true });
                for (const file of fs.readdirSync(from))
                    if (!individual || !file.startsWith("MAIN-"))
                        fs.copyFileSync(
                            path.join(from, file),
                            path.join(to, file),
                        );
            });
        });

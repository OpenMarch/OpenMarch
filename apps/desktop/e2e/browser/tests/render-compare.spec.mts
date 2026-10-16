import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures.mjs";
import { drawnMarchers, waitForField } from "../app.mjs";

/**
 * Render comparison captures (ADR 0005 D-6.2), not a scenario: it only runs
 * with `RENDER_COMPARE=<folder>`, and saves to `<folder>/<RENDER_COMPARE_LABEL>`
 * (default `after`). Run it on two checkouts (a detached worktree for the
 * base), then pair the two with `e2e/browser/render-compare.py`:
 *
 *   RENDER_COMPARE=/tmp/rc RENDER_COMPARE_LABEL=before pnpm exec playwright test --project=browser render-compare
 *   RENDER_COMPARE=/tmp/rc pnpm exec playwright test --project=browser render-compare
 *   python3 e2e/browser/render-compare.py /tmp/rc before after
 *
 * Each capture is a screenshot of the window plus the field test API's view
 * and marchers (`<name>.json`), so the pairing script can crop both runs to
 * the same region in field units whatever each one's zoom and pan.
 */

const out = process.env.RENDER_COMPARE;
const label = process.env.RENDER_COMPARE_LABEL ?? "after";
const desktop = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
);

/** Window sizes: the fields fit the show to the window, so each is a zoom. */
const SIZES = [
    { name: "small", width: 900, height: 600 },
    { name: "large", width: 2400, height: 1500 },
];

/** Every dot shape, outlines, a hidden marcher and hidden labels, on part 1. */
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

const SHOWS = [
    {
        name: "part1",
        file: "view3d-web/public/demos/part1-demo.dots",
        seedSql: [],
    },
    {
        name: "part1-variety",
        file: "view3d-web/public/demos/part1-demo.dots",
        seedSql: VARIETY_SQL,
    },
    {
        name: "daft-punk",
        file: "view3d-web/public/demos/lhb-daft-punk-pt2.dots",
        seedSql: [],
    },
];

for (const show of SHOWS)
    test.describe(show.name, () => {
        test.skip(!out, "set RENDER_COMPARE to capture");
        test.use({
            showFile: path.join(desktop, show.file),
            seedSql: show.seedSql,
        });

        test("captures", async ({ show: app }, testInfo) => {
            testInfo.setTimeout(180_000);
            const { page } = app;
            await waitForField(page);
            const firstPageId = await page.evaluate(() =>
                window.fieldTest!.pageId(),
            );
            const folder = path.join(out!, label);
            fs.mkdirSync(folder, { recursive: true });

            // Times: home, a page part way in, and four beats past it (mid-move)
            const stops = [
                { name: "home", keys: [] as string[] },
                { name: "page4", keys: ["e", "e", "e", "e"] },
                {
                    name: "page4+4",
                    keys: [
                        "e",
                        "e",
                        "e",
                        "e",
                        "Shift+E",
                        "Shift+E",
                        "Shift+E",
                        "Shift+E",
                    ],
                },
            ];
            for (const size of SIZES) {
                // The field fits the show when it opens
                await page.setViewportSize(size);
                await page.reload();
                await waitForField(page);
                for (const stop of stops) {
                    await page.keyboard.press("Home");
                    await expect
                        .poll(() =>
                            page.evaluate(() => window.fieldTest!.pageId()),
                        )
                        .toBe(firstPageId);
                    for (const key of stop.keys) await page.keyboard.press(key);
                    await capture(
                        page,
                        folder,
                        `${show.name}-${stop.name}-${size.name}`,
                    );
                }
            }
        });
    });

/** Once the field holds still, saves a screenshot and the field test API's view and marchers. */
async function capture(page: Page, folder: string, name: string) {
    let last = "";
    await expect
        .poll(async () => {
            const now = JSON.stringify(await drawnMarchers(page));
            const same = now === last;
            last = now;
            return same;
        })
        .toBe(true);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(folder, `${name}.png`) });
    const state = await page.evaluate(() => {
        const r = document
            .querySelector('[data-testid="fieldCanvas"]')!
            .getBoundingClientRect();
        return {
            viewport: window.fieldTest!.viewport(),
            rect: { x: r.x, y: r.y, width: r.width, height: r.height },
            marchers: window.fieldTest!.marchers(),
            pageId: window.fieldTest!.pageId(),
        };
    });
    fs.writeFileSync(path.join(folder, `${name}.json`), JSON.stringify(state));
}

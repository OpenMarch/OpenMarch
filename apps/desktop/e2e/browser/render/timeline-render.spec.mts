import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import { waitForField } from "../app.mjs";
import { pressKeep } from "../timeline.mjs";
import { field, OUT, saveCapture, settle } from "./compare.mjs";

/**
 * Render captures of the timeline's drawing on the field (#201; see README.md
 * here): pathways, midpoints, endpoints, step-size warnings, an isolated
 * move's scene with its dimmed marchers, kept marks and collision markers, on
 * a converted demo show. Not a pass/fail suite: it writes screenshots, and
 * with `RENDER_BASE` side-by-sides and diffs against an earlier run, for a
 * person to review.
 *
 *     RENDER_LABEL=before pnpm exec playwright test --project=render timeline-render
 *     RENDER_LABEL=after RENDER_BASE=before pnpm exec playwright test --project=render timeline-render
 *
 * Output goes to `RENDER_OUT` (default `$TMPDIR/openmarch-field-render`).
 */

const desktop = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
);
const DEMO = path.join(desktop, "view3d-web/public/demos/part1-demo.dots");

type Settings = {
    previousPaths?: boolean;
    nextPaths?: boolean;
    stepSizeWarnings?: boolean;
    showCollisions?: boolean;
};

type Case = {
    name: string;
    settings: Settings;
    seedSql?: string[];
    /** Brings the field to what's compared, after the show opens; runs once per size. */
    setup: (page: Page, show: Show) => Promise<void>;
};

/** Goes to the page `n` pages after the first, then `beats` beats on. */
const goTo =
    (n: number, beats = 0) =>
    async (page: Page) => {
        await page.keyboard.press("Home");
        for (let i = 0; i < n; i++) await page.keyboard.press("e");
        for (let i = 0; i < beats; i++) await page.keyboard.press("Shift+E");
    };

/** Waits until the field shows the same page and marchers twice in a row. */
async function settledOnPage(page: Page) {
    let last = "";
    await expect
        .poll(async () => {
            const now = await page.evaluate(() =>
                JSON.stringify([
                    window.fieldTest!.pageId(),
                    window.fieldTest!.marchers().map((m) => [m.x, m.y]),
                ]),
            );
            const same = now === last && now.length > 20;
            last = now;
            return same;
        })
        .toBe(true);
}

const PATHS: Settings = { previousPaths: true, nextPaths: true };
/** A threshold most moves in the demo are over, so warnings show */
const LOW_THRESHOLD = [
    `UPDATE field_properties SET json_data = json_set(json_data, '$.stepSizeWarningThresholdInches', 14)`,
];

/**
 * Isolates the move over the page box that starts at `startBeat` (as the
 * timeline marks it), as double-clicking the box does. In the demo, the move
 * of the box at 53 has only 4 marchers (the rest are dimmed) and the one at 37
 * has 91 of 95.
 */
const isolate = (startBeat: number) => async (page: Page) => {
    const box = page
        .locator(
            `[data-timeline-range-page][data-timeline-range-start="${startBeat}"]`,
        )
        .first();
    // The stored moves load after the field: until then a double-click finds none
    await expect(async () => {
        await box.scrollIntoViewIfNeeded();
        await box.dblclick();
        await expect(page.getByTestId("timeline-isolation-bar")).toBeVisible({
            timeout: 1000,
        });
    }).toPass();
};

const CASES: Case[] = [
    // The baseline: nothing of the timeline's drawn, so the diff is the field's and the marchers'
    { name: "plain-page4", settings: {}, setup: goTo(4) },
    { name: "paths-page4", settings: PATHS, setup: goTo(4) },
    { name: "paths-page4-mid-move", settings: PATHS, setup: goTo(4, 4) },
    { name: "paths-page9", settings: PATHS, setup: goTo(9) },
    {
        name: "warnings",
        settings: { ...PATHS, stepSizeWarnings: true },
        seedSql: LOW_THRESHOLD,
        setup: goTo(4),
    },
    {
        // A next path over the threshold shows with its toggle off
        name: "warnings-paths-off",
        settings: { stepSizeWarnings: true },
        seedSql: LOW_THRESHOLD,
        setup: goTo(4),
    },
    { name: "isolation-few", settings: PATHS, setup: isolate(53) },
    { name: "isolation-most", settings: {}, setup: isolate(37) },
    {
        // With a member selected, the others' paths step back
        name: "isolation-selected",
        settings: {},
        setup: async (page, show) => {
            await isolate(37)(page, show);
            const member = (
                await page.evaluate(() => window.fieldTest!.marchers())
            ).find((m) => !m.dimmed && m.onScreen)!;
            await page.mouse.click(member.screen.x, member.screen.y);
            await expect
                .poll(() => page.evaluate(() => window.fieldTest!.selection()))
                .toEqual([member.id]);
        },
    },
    {
        // The move of the box at 53 has 4 marchers: the other 91 follow there, and K keeps them
        name: "kept",
        settings: {},
        setup: async (page, { query }) => {
            const box = page
                .locator(
                    '[data-timeline-range-page][data-timeline-range-start="53"]',
                )
                .first();
            await box.scrollIntoViewIfNeeded();
            await box.click();
            await settledOnPage(page);
            // An empty corner of the field: clicks there clear the selection
            const field = (await page
                .getByTestId("fieldCanvas")
                .first()
                .boundingBox())!;
            const kept = async () =>
                (
                    await query<{ n: number }>(
                        "SELECT count(*) AS n FROM timeline_kept_assignments",
                    )
                )[0]!.n;
            // K toggles: keep only once, at the first size
            if ((await kept()) === 0) {
                await page.mouse.click(field.x + 12, field.y + 12);
                await page.keyboard.press("ControlOrMeta+a");
                await pressKeep(page);
                await expect.poll(kept).toBe(91);
                await page.mouse.click(field.x + 12, field.y + 12);
            }
            await page.waitForTimeout(500);
        },
    },
    {
        name: "collisions",
        settings: { showCollisions: true },
        setup: async (page) => {
            await goTo(4)(page);
            await settledOnPage(page);
            const marchers = await page.evaluate(() =>
                window.fieldTest!.marchers(),
            );
            const [a, b, c, d] = marchers;
            // A page change replaces the page's collisions: put them on once it has settled
            await page.evaluate(
                (pairs) => window.openmarchCollisions!.show(pairs),
                [a!, c!].map((m, i) => ({
                    marcher1Id: m.id,
                    marcher2Id: (i ? d : b)!.id,
                    label: `${m.label},${(i ? d : b)!.label}`,
                    x: m.x + 3,
                    y: m.y + 2,
                    distance: 6 + i * 3,
                })),
            );
            await expect(
                page.getByRole("tab", { name: "Collisions" }),
            ).toBeVisible();
        },
    },
];

const SIZES = [
    { name: "fit", width: 1600, height: 1000 },
    { name: "large", width: 3600, height: 2200 },
] as const;

/** The user's UI settings (localStorage), then a reload so the app reads them. */
async function applySettings(page: Page, settings: Settings) {
    await page.evaluate((settings) => {
        const key = Object.keys(localStorage).find((k) =>
            /ui.?settings/i.test(k),
        );
        if (!key) throw new Error("No UI settings in localStorage");
        const stored = JSON.parse(localStorage.getItem(key)!);
        localStorage.setItem(
            key,
            JSON.stringify({
                ...stored,
                previousPaths: false,
                nextPaths: false,
                stepSizeWarnings: false,
                showCollisions: false,
                ...settings,
            }),
        );
    }, settings);
    await page.reload();
    await waitForField(page);
}

/**
 * Hides what the app draws over the field (toolbars, the isolation bar,
 * badges), but not the field's own overlays (its kept marks).
 */
async function hideChrome(page: Page) {
    await page.evaluate(() => {
        const canvas = document.querySelector('[data-testid="fieldCanvas"]')!;
        const box = canvas.getBoundingClientRect();
        const keep = document.querySelector('[data-testid="field-kept-marks"]');
        for (const el of document.querySelectorAll<HTMLElement>("body *")) {
            if (el.contains(canvas) || canvas.contains(el)) continue;
            if (el.querySelector("canvas")) continue;
            if (keep && (keep.contains(el) || el.contains(keep))) continue;
            const r = el.getBoundingClientRect();
            const overlaps =
                r.right > box.left &&
                r.left < box.right &&
                r.bottom > box.top &&
                r.top < box.bottom;
            if (overlaps && el.tagName !== "CANVAS")
                el.style.visibility = "hidden";
        }
    });
}

/** The field's box on screen, overlays included. */
async function shot(page: Page) {
    const box = (await field(page).boundingBox())!;
    return page.screenshot({ clip: box });
}

for (const c of CASES)
    test.describe(c.name, () => {
        test.use({ showFile: DEMO, seedSql: c.seedSql ?? [] });

        test("render", async ({ show }) => {
            test.setTimeout(180_000);
            const { page } = show;
            fs.mkdirSync(OUT, { recursive: true });
            await applySettings(page, c.settings);
            for (const size of SIZES) {
                await page.setViewportSize(size);
                // The field fits the show when it opens
                await page.reload();
                await waitForField(page);
                await c.setup(page, show);
                await hideChrome(page);
                await settle(page);
                await page.waitForTimeout(500);
                await saveCapture(
                    page,
                    `timeline-${c.name}-${size.name}`,
                    await shot(page),
                    [`timeline-${c.name}`, size.name],
                );
            }
        });
    });

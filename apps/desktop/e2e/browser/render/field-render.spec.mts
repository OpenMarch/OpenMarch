import fs from "node:fs";
import type { Page } from "@playwright/test";
import {
    createFieldTheme,
    FieldProperties,
    type FieldTheme,
} from "@openmarch/core";
import { tsImport } from "tsx/esm/api";
import { test, expect } from "../fixtures.mjs";
import { field, OUT, saveCapture, settle } from "./compare.mjs";

/**
 * Render captures of the field itself (#200; see README.md here). Not a
 * pass/fail suite: it writes screenshots, and with `RENDER_BASE` side-by-sides
 * and diffs against an earlier run, for a person to review:
 *
 *     RENDER_LABEL=before pnpm exec playwright test --project=render field-render
 *     RENDER_LABEL=after RENDER_BASE=before pnpm exec playwright test --project=render field-render
 *
 * Output goes to `RENDER_OUT` (default `$TMPDIR/openmarch-field-render`).
 */

/** A 64 by 24 PNG: a checkerboard of 8 px squares with a red border, wider than any field. */
const IMAGE_PNG = fs
    .readFileSync(new URL("./field-image.png", import.meta.url))
    .toString("hex");

const DARK_THEME: FieldTheme = createFieldTheme({
    background: { r: 24, g: 28, b: 36, a: 1 },
    primaryStroke: { r: 235, g: 235, b: 235, a: 1 },
    secondaryStroke: { r: 120, g: 130, b: 150, a: 1 },
    tertiaryStroke: { r: 60, g: 66, b: 80, a: 1 },
    fieldLabel: { r: 250, g: 200, b: 60, a: 0.8 },
    externalLabel: { r: 140, g: 200, b: 255, a: 1 },
});

type Case = {
    name: string;
    fieldProperties: FieldProperties;
    /** The user's grid and half line settings; both on by default. */
    gridLines?: boolean;
    halfLines?: boolean;
    image?: boolean;
};

// The app's built-in field templates (its sources aren't ES modules Node can load directly)
type Templates = Record<string, FieldProperties>;
const templatesModule = (await tsImport(
    "../../../src/global/classes/FieldProperties.templates.ts",
    import.meta.url,
)) as { default: Templates | { default: Templates } };
const templates: Templates =
    "default" in templatesModule.default
        ? (templatesModule.default.default as Templates)
        : (templatesModule.default as Templates);
const hs = templates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
const variant = (base: FieldProperties, overrides: Partial<FieldProperties>) =>
    new FieldProperties({ ...base, ...overrides });

const CASES: Case[] = [
    ...Object.entries(templates).map(([name, fieldProperties]) => ({
        name: `template-${name}`,
        fieldProperties,
    })),
    {
        name: "theme-dark-hs",
        fieldProperties: variant(hs, { theme: DARK_THEME }),
    },
    {
        name: "theme-dark-indoor",
        fieldProperties: variant(templates.INDOOR_50x80_8to5, {
            theme: DARK_THEME,
        }),
    },
    {
        name: "theme-translucent-lines",
        fieldProperties: variant(hs, {
            theme: createFieldTheme({
                primaryStroke: { r: 0, g: 0, b: 160, a: 0.5 },
                secondaryStroke: { r: 200, g: 0, b: 0, a: 0.4 },
                tertiaryStroke: { r: 0, g: 120, b: 0, a: 0.25 },
            }),
        }),
    },
    {
        name: "variant-no-hashes",
        fieldProperties: variant(hs, { useHashes: false }),
    },
    {
        name: "variant-labels-hidden",
        fieldProperties: variant(hs, {
            topLabelsVisible: false,
            rightLabelsVisible: false,
        }),
    },
    {
        name: "variant-half-lines-2x3",
        fieldProperties: variant(hs, {
            halfLineXInterval: 2,
            halfLineYInterval: 3,
        }),
    },
    { name: "setting-no-grid", fieldProperties: hs, gridLines: false },
    { name: "setting-no-half", fieldProperties: hs, halfLines: false },
    {
        name: "setting-no-grid-no-half",
        fieldProperties: hs,
        gridLines: false,
        halfLines: false,
    },
    {
        name: "image-fit",
        fieldProperties: variant(hs, {
            showFieldImage: true,
            imageFillOrFit: "fit",
            backgroundImageOpacity: 1,
        }),
        image: true,
    },
    {
        name: "image-fill-half-opacity",
        fieldProperties: variant(hs, {
            showFieldImage: true,
            imageFillOrFit: "fill",
            backgroundImageOpacity: 0.5,
        }),
        image: true,
    },
    {
        name: "image-fit-dark-indoor",
        fieldProperties: variant(templates.INDOOR_50x80_8to5, {
            theme: DARK_THEME,
            showFieldImage: true,
            imageFillOrFit: "fit",
            backgroundImageOpacity: 0.6,
        }),
        image: true,
    },
];

/** Window sizes: the whole field small, and large enough to read lines and labels. */
const SIZES = [
    { name: "fit", width: 1600, height: 1000 },
    { name: "large", width: 3600, height: 2200 },
] as const;

async function setGridSettings(
    page: Page,
    gridLines: boolean,
    halfLines: boolean,
) {
    if (gridLines && halfLines) return;
    await page.evaluate(
        ([gridLines, halfLines]) => {
            const key = Object.keys(localStorage).find((k) =>
                /ui.?settings/i.test(k),
            );
            if (!key) throw new Error("No UI settings in localStorage");
            const settings = JSON.parse(localStorage.getItem(key)!);
            localStorage.setItem(
                key,
                JSON.stringify({ ...settings, gridLines, halfLines }),
            );
        },
        [gridLines, halfLines] as const,
    );
    await page.reload();
    await expect(field(page)).toBeVisible({ timeout: 20_000 });
}

for (const c of CASES) {
    test.describe(c.name, () => {
        test.use({
            seedSql: [
                `UPDATE field_properties SET json_data = '${JSON.stringify(
                    c.fieldProperties,
                ).replace(/'/g, "''")}'${
                    c.image ? `, image = X'${IMAGE_PNG}'` : ""
                }`,
            ],
        });

        test("render", async ({ show }) => {
            const { page } = show;
            fs.mkdirSync(OUT, { recursive: true });
            await setGridSettings(
                page,
                c.gridLines ?? true,
                c.halfLines ?? true,
            );
            if (c.image)
                await expect
                    .poll(() =>
                        page.evaluate(
                            () => window.fieldTest?.fieldImage() ?? null,
                        ),
                    )
                    .not.toBeNull();
            // Hide what's drawn over the field (zoom controls, badges), so only the field is compared
            await page.evaluate(() => {
                const canvas = document.querySelector(
                    '[data-testid="fieldCanvas"]',
                )!;
                const box = canvas.getBoundingClientRect();
                for (const el of document.querySelectorAll<HTMLElement>(
                    "body *",
                )) {
                    if (el.contains(canvas) || canvas.contains(el)) continue;
                    if (el.querySelector("canvas")) continue;
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

            for (const size of SIZES) {
                await page.setViewportSize(size);
                await settle(page);
                await page.waitForTimeout(300);
                await page.waitForTimeout(500);
                await saveCapture(
                    page,
                    `${c.name}-${size.name}`,
                    await field(page).screenshot(),
                    [c.name, size.name],
                );
            }
        });
    });
}

import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures.mjs";

// The show's field image is drawn with its fit or fill setting and its
// opacity (`planFieldImage`).

/** A 4 by 1 PNG: four times as wide as it is tall, wider than any field. */
const WIDE_PNG =
    "89504e470d0a1a0a0000000d4948445200000004000000010802000000765e989a0000000d49444154789c6338a1a10147001efd04610bd608430000000049454e44ae426082";

const withImage = (
    imageFillOrFit: "fit" | "fill",
    { show = true, opacity = 0.4 } = {},
) => [
    `UPDATE field_properties SET
        json_data = json_set(json_data,
            '$.showFieldImage', json('${show}'),
            '$.imageFillOrFit', '${imageFillOrFit}',
            '$.backgroundImageOpacity', ${opacity}),
        image = X'${WIDE_PNG}'`,
];

/** Within three quarters of a field unit, for edges drawn between pixels. */
const TOLERANCE = 0.75;

/** The field's size in field units, as `FieldProperties` works it out. */
async function fieldSize(show: { query: <T>(sql: string) => Promise<T[]> }) {
    const [row] = await show.query<{ json_data: string }>(
        "SELECT json_data FROM field_properties",
    );
    const fp = JSON.parse(row.json_data) as {
        stepSizeInches: number;
        xCheckpoints: { stepsFromCenterFront: number }[];
        yCheckpoints: { stepsFromCenterFront: number }[];
    };
    const pixelsPerStep = fp.stepSizeInches * 0.5;
    const extent = (cs: { stepsFromCenterFront: number }[]) => {
        const steps = cs.map((c) => c.stepsFromCenterFront);
        return (Math.max(0, ...steps) - Math.min(0, ...steps)) * pixelsPerStep;
    };
    return { width: extent(fp.xCheckpoints), height: extent(fp.yCheckpoints) };
}

/** Waits until the field draws the image, and reads where. */
async function drawnImage(page: Page) {
    await expect
        .poll(() => page.evaluate(() => window.fieldTest?.fieldImage() ?? null))
        .not.toBeNull();
    return (await page.evaluate(() => window.fieldTest!.fieldImage()))!;
}

function expectPlacement(
    actual: { x: number; y: number; width: number; height: number },
    expected: { x: number; y: number; width: number; height: number },
) {
    for (const key of ["x", "y", "width", "height"] as const)
        expect(
            Math.abs(actual[key] - expected[key]),
            `${key}: ${actual[key]} vs ${expected[key]}`,
        ).toBeLessThan(TOLERANCE);
}

test.describe("a filled field image", () => {
    test.use({ seedSql: withImage("fill") });

    test("covers the field's height and overflows its sides, centered", async ({
        show,
    }) => {
        const { width, height } = await fieldSize(show);
        const image = await drawnImage(show.page);
        expectPlacement(image, {
            x: (width - height * 4) / 2,
            y: 0,
            width: height * 4,
            height,
        });
        expect(image.opacity).toBeCloseTo(0.4);
    });
});

test.describe("a fitted field image", () => {
    test.use({ seedSql: withImage("fit", { opacity: 0.75 }) });

    test("spans the field's width, centered top to bottom", async ({
        show,
    }) => {
        const { width, height } = await fieldSize(show);
        const image = await drawnImage(show.page);
        expectPlacement(image, {
            x: 0,
            y: (height - width / 4) / 2,
            width,
            height: width / 4,
        });
        expect(image.opacity).toBeCloseTo(0.75);
    });
});

test.describe("a hidden field image", () => {
    test.use({ seedSql: withImage("fit", { show: false }) });

    test("isn't drawn", async ({ show }) => {
        await expect
            .poll(() =>
                show.page.evaluate(() => window.fieldTest?.pageId() ?? null),
            )
            .not.toBeNull();
        // Give the image time to load, as it would if it were shown
        await show.page.waitForTimeout(500);
        expect(
            await show.page.evaluate(() => window.fieldTest!.fieldImage()),
        ).toBeNull();
    });
});

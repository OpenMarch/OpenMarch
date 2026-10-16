import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures.mjs";
import {
    clickMarcher,
    drawnMarchers,
    expectCanvasMatchesShow,
    selectedDrillNumbers,
    waitForField,
} from "../app.mjs";
import { seedShowSql } from "../seed.mjs";
import type { FieldTestQuality } from "../../../src/field/fieldTestApi";

// Weak machines (#205, ADR 0005 D-3): the field's low-quality mode, what
// it does with no WebGL, and how it gets through a lost WebGL context. The
// machines these run on draw WebGL in software (SwiftShader), which is the
// case the low-quality mode is for.

// Two marchers who trade places over page 1
test.use({
    seedSql: seedShowSql({
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
                [2, 600, 300],
            ],
            [
                [1, 600, 300],
                [2, 400, 300],
            ],
        ],
    }),
});

const quality = (page: Page): Promise<FieldTestQuality> =>
    page.evaluate(() => window.fieldTest!.quality!());

/** The field's canvas element (the WebGL one, inside the R3F wrapper). */
const FIELD_CANVAS = "[data-testid=threeField] canvas";

/**
 * The color on screen at a point in the viewport, as the user sees it: a
 * one-pixel screenshot, decoded in the page.
 */
async function screenColor(page: Page, x: number, y: number) {
    const png = await page.screenshot({
        clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 },
        animations: "allow",
    });
    return page.evaluate(async (base64) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(
            new Blob([bytes], { type: "image/png" }),
        );
        const canvas = new OffscreenCanvas(1, 1);
        const context = canvas.getContext("2d")!;
        context.drawImage(bitmap, 0, 0);
        return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
    }, png.toString("base64"));
}

const colorsClose = (a: number[], b: number[]) =>
    a.every((value, i) => Math.abs(value - b[i]) <= 24);

/**
 * What a marcher's dot looks like on screen, and the field beside it: the dot
 * is drawn when its center has the dot's color, and the field 30 px away
 * doesn't.
 */
async function dotColors(page: Page, drillNumber: string) {
    const marcher = (await drawnMarchers(page)).find(
        (m) => m.drillNumber === drillNumber,
    )!;
    return {
        dot: await screenColor(page, marcher.screen.x, marcher.screen.y),
        beside: await screenColor(
            page,
            marcher.screen.x,
            marcher.screen.y + 30,
        ),
    };
}

/** Waits until every marcher's dot is drawn on screen in `dotColor`. */
async function expectDotsDrawn(page: Page, dotColor: number[]) {
    await expect
        .poll(async () => {
            for (const { screen } of await drawnMarchers(page)) {
                const color = await screenColor(page, screen.x, screen.y);
                if (!colorsClose(color, dotColor)) return false;
            }
            return true;
        })
        .toBe(true);
}

/** Loses the field's WebGL context, as a driver reset or sleep does. */
const loseContext = (page: Page) =>
    page.evaluate((selector) => {
        const canvas = document.querySelector<HTMLCanvasElement>(selector)!;
        const gl = canvas.getContext("webgl2")!;
        const extension = gl.getExtension("WEBGL_lose_context")!;
        // Kept for the restore: a lost context has no extensions to get
        (window as { __omLoseContext?: unknown }).__omLoseContext = extension;
        canvas.dataset.omLost = "true";
        extension.loseContext();
    }, FIELD_CANVAS);

const restoreContext = (page: Page) =>
    page.evaluate(() =>
        (
            window as { __omLoseContext?: { restoreContext(): void } }
        ).__omLoseContext!.restoreContext(),
    );

test.describe("on software WebGL", () => {
    test.use({ fieldQualityNotice: true });

    test("the field draws in low-quality mode and explains why once", async ({
        show,
    }) => {
        const { page } = show;
        const notice = page.getByText("The field is in low-quality mode");

        expect(await quality(page)).toEqual(
            expect.objectContaining({
                mode: "low",
                reason: "software",
                gl: "software",
                // Fewer pixels and labels hidden sooner than at full quality (DPR up to 2, 4 px)
                pixelRatio: 1,
                labelsHiddenBelow: 8,
                contextLost: false,
            }),
        );
        expect((await quality(page)).renderer).toMatch(/swiftshader/i);
        await expectCanvasMatchesShow(show);

        // Once: why, and how to turn graphics acceleration on
        await expect(notice).toBeVisible();
        await expect(
            page.getByText(/turn on graphics acceleration|graphics drivers/),
        ).toBeVisible();
        await page.getByRole("button", { name: "Got it" }).click();
        await expect(notice).toHaveCount(0);

        // Not again: the next session stays in low-quality mode, quietly
        await page.reload();
        await waitForField(page);
        await expectCanvasMatchesShow(show);
        expect((await quality(page)).mode).toBe("low");
        await page.waitForTimeout(1000);
        await expect(notice).toHaveCount(0);
    });

    test("low-quality mode draws one CSS pixel per device pixel on a high-density screen", async ({
        show,
    }) => {
        const { page } = show;
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Emulation.setDeviceMetricsOverride", {
            width: 1600,
            height: 1000,
            deviceScaleFactor: 2,
            mobile: false,
        });
        await page.reload();
        await waitForField(page);
        await expectCanvasMatchesShow(show);

        expect(await page.evaluate(() => window.devicePixelRatio)).toBe(2);
        expect((await quality(page)).pixelRatio).toBe(1);
    });
});

test.describe("with no WebGL", () => {
    test.use({
        initScript: `{
            const getContext = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
                if (String(type).startsWith("webgl") || type === "experimental-webgl") return null;
                return getContext.call(this, type, ...rest);
            };
        }`,
    });
    test.skip(
        ({ target }) => target !== "browser",
        "Takes WebGL away with an init script",
    );

    test("the field explains instead of crashing the app", async ({ show }) => {
        const { page } = show;
        const unavailable = page.getByTestId("fieldUnavailable");

        await expect(unavailable).toBeVisible();
        await expect(unavailable).toContainText("The field can't be drawn");
        // How to get graphics back: the browser's setting, or the desktop app's drivers
        await expect(unavailable).toContainText(
            /graphics acceleration|graphics drivers/,
        );
        expect(await quality(page)).toEqual(
            expect.objectContaining({
                mode: "low",
                reason: "noWebGL",
                gl: "none",
            }),
        );
        // The rest of the app still works: the show is open and pages change
        await expect(
            page.getByRole("heading", { name: "Page 0" }),
        ).toBeVisible();
        await page.keyboard.press("e");
        await expect(
            page.getByRole("heading", { name: "Page 1" }),
        ).toBeVisible();

        // Trying again without WebGL explains again, still without crashing
        await unavailable.getByRole("button", { name: "Try again" }).click();
        await expect(unavailable).toBeVisible();
    });
});

test("a lost WebGL context comes back and the field draws the show again", async ({
    show,
}) => {
    const { page } = show;
    await expectCanvasMatchesShow(show);
    const before = await dotColors(page, "T1");
    expect(
        colorsClose(before.dot, before.beside),
        "the dot shows on the field",
    ).toBe(false);

    await loseContext(page);
    await expect.poll(async () => (await quality(page)).contextLost).toBe(true);
    // The show moves on while the context is gone
    await page.keyboard.press("e");
    await expect(page.getByRole("heading", { name: "Page 1" })).toBeVisible();

    await restoreContext(page);
    await expect
        .poll(async () => (await quality(page)).contextLost)
        .toBe(false);
    // The same canvas, drawing again, with the page shown now
    expect(await page.locator(FIELD_CANVAS).getAttribute("data-om-lost")).toBe(
        "true",
    );
    await expectCanvasMatchesShow(show);
    expect(
        (await drawnMarchers(page)).find((m) => m.drillNumber === "T1"),
    ).toEqual(expect.objectContaining({ x: 600, y: 300 }));
    await expectDotsDrawn(page, before.dot);
});

test("a WebGL context that doesn't come back is replaced, without reopening the show", async ({
    show,
}) => {
    const { page } = show;
    await expectCanvasMatchesShow(show);
    const before = await dotColors(page, "T1");

    await loseContext(page);
    await expect.poll(async () => (await quality(page)).contextLost).toBe(true);
    await page.keyboard.press("e");
    await expect(page.getByRole("heading", { name: "Page 1" })).toBeVisible();

    // Never restored: the field starts over on a new canvas
    await expect(page.locator(`${FIELD_CANVAS}[data-om-lost]`)).toHaveCount(0, {
        timeout: 10_000,
    });
    await expect(page.locator(FIELD_CANVAS)).toHaveCount(1);
    // The new canvas reports its context a moment after it mounts
    await expect
        .poll(async () => (await quality(page)).contextLost)
        .toBe(false);
    await expectCanvasMatchesShow(show);
    await expectDotsDrawn(page, before.dot);
    // The new canvas takes the pointer: a click selects
    await clickMarcher(page, "T2");
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["T2"]);
});

test("the desktop app drops to low-quality mode when its GPU process crashes", async ({
    show,
    target,
}) => {
    test.skip(target !== "electron", "Only the desktop app has a GPU process");
    const { page } = show;
    await expectCanvasMatchesShow(show);
    const before = await dotColors(page, "T1");

    await show.killGpuProcess!();

    await expect(
        page.getByText(/graphics processor stopped responding/),
    ).toBeVisible();
    expect((await quality(page)).reason).toBe("gpuCrashed");
    // Chromium starts a new GPU process; the field draws again on it
    await expect
        .poll(async () => (await quality(page)).contextLost)
        .toBe(false);
    await expectCanvasMatchesShow(show);
    await expectDotsDrawn(page, before.dot);
});

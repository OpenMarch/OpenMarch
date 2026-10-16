import { test, expect } from "../fixtures.mjs";
import { expectCanvasMatchesShow } from "../app.mjs";
import { seedShowSql } from "../seed.mjs";

// The in-app field benchmark (#205, ADR 0005 D-6.5), on both fields until
// #209, so the parity gate (#208) can compare them on the same machine.

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

test("the field benchmark runs from the command palette and puts the field back", async ({
    show,
}) => {
    test.setTimeout(90_000);
    const { page } = show;
    await expectCanvasMatchesShow(show);
    const viewBefore = await page.evaluate(() => window.fieldTest!.viewport());

    await page.keyboard.press("ControlOrMeta+k");
    await page.getByPlaceholder("Search commands…").fill("field benchmark");
    await page.keyboard.press("Enter");
    const dialog = page.getByTestId("fieldBenchmark");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Run", exact: true }).click();

    // Nothing covers the field while it's measured
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("fieldBenchmarkRunning")).toBeVisible();
    const table = page.getByTestId("fieldBenchmarkTable");
    await expect(table).toBeVisible({ timeout: 60_000 });

    // A row per scenario: frames measured for each one that exists yet
    const rows = await table
        .locator("tbody tr")
        .evaluateAll((trs) =>
            trs.map((tr) =>
                [...tr.querySelectorAll("td")].map((td) => td.textContent),
            ),
        );
    expect(rows.map((row) => row[0])).toEqual([
        "play",
        "scrub",
        "zoom",
        "pan",
        "drag",
    ]);
    const least = { fps: 5, frames: 10 };
    for (const row of rows.slice(0, 4)) {
        expect(Number(row[1]), `${row[0]} fps`).toBeGreaterThan(least.fps);
        const [, measured] = row[5]!.split("/").map(Number);
        expect(measured, `${row[0]} frames`).toBeGreaterThan(least.frames);
    }
    expect(rows[4][1]).toContain("not measured yet");
    // Which field was measured, and on what
    await expect(dialog).toContainText("three.js field · ");
    // Software GL here: SwiftShader, or llvmpipe
    await expect(dialog).toContainText(/swiftshader|llvmpipe/i);
    await expect(dialog).toContainText("lower bound");
    // Measured on a production build: no warning that the numbers don't count
    await expect(dialog).not.toContainText("development build");

    // What the scenarios changed is back: the view and the page
    await dialog.press("Escape");
    expect(await page.evaluate(() => window.fieldTest!.viewport())).toEqual(
        viewBefore,
    );
    await expect(page.getByRole("heading", { name: "Page 0" })).toBeVisible();
    await expectCanvasMatchesShow(show);
});

import { test, expect } from "../fixtures.mjs";
import { drawnMarchers, expectCanvasMatchesShow } from "../app.mjs";
import { seedShowSql } from "../seed.mjs";

// Two marchers trade places over page 1, a straight move from beat 1 to beat
// 9 (the last page's 8 counts), half a second a beat.
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

type Sample = {
    /** The transport clock's show time, in seconds, read in the same frame. */
    time: number;
    t1: { x: number; y: number };
    t2: { x: number; y: number };
};

test("playback draws the marchers where the show puts them at each moment", async ({
    show,
}) => {
    const { page } = show;
    await expectCanvasMatchesShow(show);
    // When the move starts: beat 1's timestamp, after beat 0
    const [{ start }] = await show.query<{ start: number }>(
        "SELECT SUM(duration) AS start FROM beats WHERE position < 1",
    );
    const moveSeconds = 8 * 0.5;
    /** Where the show file puts T1 at a time: a straight, even move. */
    const t1At = (time: number) =>
        400 + 200 * Math.min(1, Math.max(0, (time - start) / moveSeconds));

    await page.keyboard.press("Space");

    // Read the field on every frame for a while, as it plays
    const samples: Sample[] = await page.evaluate(
        () =>
            new Promise<Sample[]>((resolve) => {
                const out: Sample[] = [];
                const start = performance.now();
                const read = () => {
                    const marchers = window.fieldTest!.marchers();
                    const at = (label: string) => {
                        const { x, y } = marchers.find(
                            (m) => m.label === label,
                        )!;
                        return { x, y };
                    };
                    // The clock writes the live playback time each frame
                    const clock = [
                        ...document.querySelectorAll("span.font-mono"),
                    ]
                        .map((span) => span.textContent ?? "")
                        .find((text) => /^\d\d:\d\d\.\d{3}$/.test(text));
                    const [minutes, seconds] = (clock ?? "NaN:NaN").split(":");
                    out.push({
                        time: Number(minutes) * 60 + Number(seconds),
                        t1: at("T1"),
                        t2: at("T2"),
                    });
                    if (performance.now() - start < 2500)
                        requestAnimationFrame(read);
                    else resolve(out);
                };
                requestAnimationFrame(read);
            }),
    );
    await page.keyboard.press("Space");

    // Mid-move: somewhere strictly between the two pages' positions
    const moving = samples.filter(({ t1 }) => t1.x > 400.5 && t1.x < 599.5);
    expect(moving.length, "frames drawn mid-move").toBeGreaterThan(5);
    for (const { time, t1, t2 } of samples) {
        // At the moment the clock shows, within a frame of the move (25 units a second)
        expect(
            Math.abs(t1.x - t1At(time)),
            `T1 at ${time} s: drawn ${t1.x}, the show says ${t1At(time)}`,
        ).toBeLessThan(2);
        // Both are on the same moment of the same move
        expect(t1.x + t2.x).toBeCloseTo(1000, 1);
        expect(t1.y).toBeCloseTo(300, 1);
        expect(t2.y).toBeCloseTo(300, 1);
    }
    // Time only goes forward while playing
    for (let i = 1; i < samples.length; i++)
        expect(samples[i].t1.x).toBeGreaterThanOrEqual(
            samples[i - 1].t1.x - 0.01,
        );

    // Paused, the field holds the moment it stopped at
    await expect
        .poll(async () => {
            const drawn = await drawnMarchers(page);
            const t1 = drawn.find((m) => m.drillNumber === "T1")!;
            const t2 = drawn.find((m) => m.drillNumber === "T2")!;
            return Math.abs(t1.x + t2.x - 1000) < 0.01 && t1.x > 400;
        })
        .toBe(true);
});

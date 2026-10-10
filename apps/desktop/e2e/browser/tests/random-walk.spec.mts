import type { Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    clickMarcher,
    drawnMarchers,
    expectCanvasMatchesShow,
    waitForIdle,
} from "../app.mjs";

/**
 * Seeded random editing sessions at a person's pace: each step starts once the
 * previous one has finished writing. After every step the canvas must match
 * the show file and the page must not log an error; at the end, undoing
 * everything must give back the show we started with.
 *
 * A failure names its seed and the steps taken. Rerun one seed with
 * `RANDOM_WALK_SEEDS=<seed> pnpm run e2e:browser random-walk`.
 * `RANDOM_WALK_STEPS` sets the length of each walk.
 *
 * `RANDOM_WALK_FAST=1` drops the pause between steps, so writes overlap the
 * way they do when someone holds a key. That mode finds races; its failures
 * depend on timing and may not repeat for the same seed.
 */

const SEEDS = (process.env.RANDOM_WALK_SEEDS ?? "1,2,3").split(",").map(Number);
const STEPS = Number(process.env.RANDOM_WALK_STEPS ?? 20);
const FAST = process.env.RANDOM_WALK_FAST === "1";
/** Waits for the app's writes to finish, unless the walk is in fast mode. */
const settle = (page: Page) => (FAST ? Promise.resolve() : waitForIdle(page));

// Six trumpets on three pages, spread out so all are in view.
const MARCHERS = [1, 2, 3, 4, 5, 6];
test.use({
    seedSql: [
        `INSERT INTO beats (id, duration, position)
         VALUES ${Array.from({ length: 48 }, (_, i) => `(${i + 1}, 0.5, ${i + 1})`).join(", ")}`,
        `INSERT INTO pages (id, start_beat) VALUES (1, 16), (2, 32)`,
        `INSERT INTO marchers (id, section, drill_prefix, drill_order)
         VALUES ${MARCHERS.map((id) => `(${id}, 'Trumpet', 'T', ${id})`).join(", ")}`,
        `INSERT INTO marcher_pages (marcher_id, page_id, x, y)
         VALUES ${[0, 1, 2]
             .flatMap((pageId) =>
                 MARCHERS.map(
                     (id) =>
                         `(${id}, ${pageId}, ${450 + id * 70}, ${280 + pageId * 60 + (id % 2) * 40})`,
                 ),
             )
             .join(", ")}`,
    ],
});

/** mulberry32: a small, fast random number generator that takes a seed. */
function random(seed: number) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

type Step = { name: string; run: () => Promise<void> };

function steps(show: Show, next: () => number): Step[] {
    const { page } = show;
    const pick = <T,>(items: T[]) => items[Math.floor(next() * items.length)];
    const press = (key: string) => async () => {
        await page.keyboard.press(key);
    };
    return [
        {
            name: "drag a marcher",
            run: async () => {
                const visible = (await drawnMarchers(page)).filter(
                    (m) => m.onScreen,
                );
                if (visible.length === 0) return;
                const marcher = pick(visible);
                const by = {
                    x: Math.round((next() - 0.5) * 300),
                    y: Math.round((next() - 0.5) * 200),
                };
                await page.mouse.move(marcher.screen.x, marcher.screen.y);
                await page.mouse.down();
                await page.mouse.move(
                    marcher.screen.x + by.x,
                    marcher.screen.y + by.y,
                    { steps: 8 },
                );
                await page.mouse.up();
            },
        },
        { name: "next page", run: press("e") },
        { name: "previous page", run: press("q") },
        {
            name: "select all and align",
            run: async () => {
                await page.keyboard.press("Control+a");
                await settle(page);
                await page.keyboard.press("Alt+v");
            },
        },
        {
            name: "swap two marchers",
            run: async () => {
                const [a, b] = [...MARCHERS]
                    .sort(() => next() - 0.5)
                    .slice(0, 2);
                await page.keyboard.press("Escape");
                await settle(page);
                await clickMarcher(page, `T${a}`);
                await clickMarcher(page, `T${b}`, { add: true });
                await page.keyboard.press("Control+s");
            },
        },
        { name: "copy all from previous page", run: press("Control+Shift+P") },
        { name: "undo", run: press("Control+z") },
        { name: "redo", run: press("Control+Shift+Z") },
    ];
}

const snapshot = (show: Show) =>
    show.query(
        "SELECT marcher_id, page_id, x, y FROM marcher_pages ORDER BY page_id, marcher_id",
    );

for (const seed of SEEDS) {
    test(`random edits, seed ${seed}`, async ({ show }, testInfo) => {
        // Long walks need more than the default 30 seconds.
        testInfo.setTimeout(30_000 + STEPS * 3_000);
        const { page } = show;
        const next = random(seed);
        const start = await snapshot(show);
        const taken: string[] = [];
        await waitForIdle(page);
        await expectCanvasMatchesShow(show);

        for (let i = 0; i < STEPS; i++) {
            const step = steps(show, next)[Math.floor(next() * 8)];
            taken.push(step.name);
            await test.step(`${i + 1}. ${step.name}`, step.run);
            await expectCanvasMatchesShow(show).catch((error) => {
                throw new Error(
                    `Seed ${seed}, after: ${taken.join(" → ")}\n${error}`,
                );
            });
            await page.keyboard.press("Escape");
            await settle(page);
        }

        // Undo everything; the show must be back where it started.
        const undoCount = async () =>
            (
                await show.query<{ count: number }>(
                    "SELECT COUNT(DISTINCT history_group) AS count FROM history_undo",
                )
            )[0].count;
        for (
            let guard = 0;
            (await undoCount()) > 0 && guard < STEPS * 2;
            guard++
        ) {
            const before = await undoCount();
            await expectCanvasMatchesShow(show);
            await page.keyboard.press("Control+z");
            await waitForIdle(page);
            await expect.poll(undoCount).toBeLessThan(before);
        }
        expect(
            await snapshot(show),
            `Seed ${seed}, after: ${taken.join(" → ")}`,
        ).toEqual(start);
        await expectCanvasMatchesShow(show);
    });
}

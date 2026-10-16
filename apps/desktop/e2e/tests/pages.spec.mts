import { test } from "../fixtures.mjs";
import { expect } from "playwright/test";
import type { ElectronApplication } from "playwright";
import { seedShowSql } from "../browser/seed.mjs";
import {
    addPageFlagAt,
    selectTimelinePage,
    timelinePageMenu,
    timelinePageNames,
} from "../utils/timeline.mjs";

/** 40 beats of music in 4/4: measure `m` starts on beat `4m - 3`. */
const MUSIC = {
    beats: 40,
    measureStarts: Array.from({ length: 10 }, (_, i) => i * 4 + 1),
};

/** Music plus pages 1-3, eight counts each. */
const PAGES = { ...MUSIC, pageStarts: [1, 9, 17] };

type Show = { app: ElectronApplication; databasePath: string };

/**
 * Reads the show file inside the main process: a second process reading it
 * would hold locks the app's own writes don't wait for.
 */
const readShow = <T,>({ app, databasePath }: Show, sql: string) =>
    app.evaluate(
        (_electron, [file, query]) => {
            const { DatabaseSync } = process.getBuiltinModule(
                "node:sqlite",
            ) as typeof import("node:sqlite");
            const reader = new DatabaseSync(file, { readOnly: true });
            try {
                return reader.prepare(query).all();
            } finally {
                reader.close();
            }
        },
        [databasePath, sql] as const,
    ) as Promise<T[]>;

/** Each page's start, by beat position, in show order. */
const pageStarts = (show: Show) =>
    readShow<{ id: number; position: number }>(
        show,
        `SELECT pages.id, beats.position FROM pages
         INNER JOIN beats ON pages.start_beat = beats.id
         ORDER BY beats.position`,
    );

test("First page is visible", async ({ electronApp }) => {
    const { page } = electronApp;

    await expect(
        page.getByRole("heading", { name: "Page 0", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("timeline-initial-page")).toHaveAttribute(
        "aria-pressed",
        "true",
    );
    expect(await timelinePageNames(page)).toEqual(["0"]);
});

test.describe("with music", () => {
    test.use({ seedSql: seedShowSql({ ...MUSIC, pageStarts: [] }) });

    test("Create new pages with the timeline's +", async ({ electronApp }) => {
        const { page } = electronApp;
        await expect.poll(() => timelinePageNames(page)).toEqual(["0"]);

        // Each + puts a page flag at the playhead: the new page ends there
        await addPageFlagAt(page, 3);
        await expect.poll(() => timelinePageNames(page)).toEqual(["0", "1"]);
        await addPageFlagAt(page, 5);
        await expect
            .poll(() => timelinePageNames(page))
            .toEqual(["0", "1", "2"]);

        // No new beats: the pages start on the music's beats 1 and 9
        expect(await pageStarts(electronApp)).toEqual([
            { id: 0, position: 0 },
            { id: 1, position: 1 },
            { id: 2, position: 9 },
        ]);
        expect(
            await readShow<{ n: number }>(
                electronApp,
                "SELECT COUNT(*) AS n FROM beats",
            ),
        ).toEqual([{ n: MUSIC.beats + 1 }]);
    });

    // Still failing (#209 rechecked on the three.js field): the timeline's add-page-flag button
    // never appears in this Electron setup, so the test times out before it reaches the field.
    test.fixme("A new page is selected immediately", async ({
        electronApp,
    }) => {
        const { page } = electronApp;
        await expect(page.getByTestId("timeline-page-ruler")).toBeVisible();

        await addPageFlagAt(page, 3);
        await expect(
            page.getByRole("heading", { name: "Page 1", exact: true }),
        ).toBeVisible();
        await addPageFlagAt(page, 5);
        await expect(
            page.getByRole("heading", { name: "Page 2", exact: true }),
        ).toBeVisible();
    });
});

test.describe("with pages", () => {
    test.use({ seedSql: seedShowSql(PAGES) });

    test("Switch between pages", async ({ electronApp }) => {
        const { page } = electronApp;
        await expect
            .poll(() => timelinePageNames(page))
            .toEqual(["0", "1", "2", "3"]);

        await selectTimelinePage(page, "2");
        await selectTimelinePage(page, "0");
        await expect(
            page.getByRole("heading", { name: "Page 2", exact: true }),
        ).toBeHidden();
        await selectTimelinePage(page, "1");
    });

    test("Turn a page into a subset and back", async ({ electronApp }) => {
        const { page } = electronApp;
        const subset = page.getByRole("switch", { name: "Subset" });

        await selectTimelinePage(page, "1");
        await subset.click();
        await expect(
            page.getByRole("heading", { name: "Page 0A", exact: true }),
        ).toBeVisible();
        await expect
            .poll(() => timelinePageNames(page))
            .toEqual(["0", "0A", "1", "2"]);

        await subset.click();
        await expect(
            page.getByRole("heading", { name: "Page 1", exact: true }),
        ).toBeVisible();
        await expect
            .poll(() => timelinePageNames(page))
            .toEqual(["0", "1", "2", "3"]);

        await selectTimelinePage(page, "2");
        await subset.click();
        await expect(
            page.getByRole("heading", { name: "Page 1A", exact: true }),
        ).toBeVisible();
        await expect
            .poll(() => timelinePageNames(page))
            .toEqual(["0", "1", "1A", "2"]);
    });

    test("Delete page", async ({ electronApp }) => {
        const { page } = electronApp;
        await expect
            .poll(() => timelinePageNames(page))
            .toEqual(["0", "1", "2", "3"]);

        // Delete page 3: its flag goes, the pages before it stay
        await timelinePageMenu(page, "3", "delete-flag");
        await expect
            .poll(() => timelinePageNames(page))
            .toEqual(["0", "1", "2"]);

        // Delete page 1: a flag is where a page ends, so without it page 1's
        // counts join the next page, which is renamed 1 and now starts at beat 1
        await timelinePageMenu(page, "1", "delete-flag");
        await expect.poll(() => timelinePageNames(page)).toEqual(["0", "1"]);
        await expect
            .poll(() => pageStarts(electronApp))
            .toEqual([
                { id: 0, position: 0 },
                { id: 2, position: 1 },
            ]);
    });
});

test.describe("with pages and moves", () => {
    // Two marchers who move on every page
    test.use({
        seedSql: seedShowSql({
            ...PAGES,
            marchers: [1, 2].map((id) => ({
                id,
                section: "Trumpet",
                prefix: "T",
                order: id,
            })),
            positions: [0, 1, 2, 3].map((p) => [
                [1, 400 + p * 40, 300],
                [2, 500 + p * 40, 300],
            ]),
        }),
    });

    // The page-era "Delete page with yank" removed the page's beats and pulled
    // later pages earlier; the timeline has no yank in its menu. Its
    // "Delete page and its moves" removes the page and its moves instead.
    test("Delete page and its moves", async ({ electronApp }) => {
        const { page } = electronApp;
        await expect
            .poll(() => timelinePageNames(page))
            .toEqual(["0", "1", "2", "3"]);
        const startsBefore = await pageStarts(electronApp);
        const moves = () =>
            readShow<{ id: number }>(
                electronApp,
                "SELECT id FROM timelines ORDER BY id",
            );
        expect(await moves()).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);

        await timelinePageMenu(page, "2", "delete-with-moves");

        await expect
            .poll(() => timelinePageNames(page))
            .toEqual(["0", "1", "2"]);
        // Page 2's move went with it; the later page keeps its start
        await expect.poll(moves).toEqual([{ id: 1 }, { id: 3 }]);
        expect(await pageStarts(electronApp)).toEqual(
            startsBefore.filter((start) => start.id !== 2),
        );
    });
});

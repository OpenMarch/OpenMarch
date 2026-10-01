import * as fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it as plainIt, vi } from "vitest";
import {
    DbConnection,
    describeDbTests,
    getTempDotsPath,
    schema,
} from "@/test/base";
import { eq } from "drizzle-orm";
import { updateMarcherPages } from "@/db-functions/marcherPage";
import { moveMarchersOnPage } from "@/db-functions/timelineMoves";
import { updateWorkspaceSettingsParsed } from "@/db-functions/workspaceSettings";
import { fromDatabasePages } from "@/global/classes/Page";
import { workspaceSettingsSchema } from "@/settings/workspaceSettings";
import {
    convertPagesToTimeline,
    readShowTiming,
} from "@/timeline/convert/writePageConversion";
import { pageEndBeat } from "@/timeline/timelineCanvas";
import { acquireExportResolver } from "@/timeline/timelineExport";
import {
    isSourceInTimelineMode,
    lastPageEndBeat,
    SourceTimelineReadError,
} from "@/timeline/sourceTimelinePositions";
import {
    keepFixturesInPageMode,
    withPageEraFreezeLifted,
} from "@/test/timelineMode";

// P7.17: these tests set up timeline mode themselves
keepFixturesInPageMode(
    "its tests convert the show or write timeline rows, and set the flag, themselves",
);

vi.mock("electron", () => ({ dialog: {}, ipcMain: {} }));

const { readPreviousDotsFile } =
    await import("../previous-dots-import-service");

/**
 * "Import from a previous show" starts the new show from the source's last page. A timeline-mode
 * source's `marcher_pages` rows are frozen page-era data, so its positions come from the source's
 * resolver at the last page's end beat (docs/timeline/phases/07-page-parity.md P7.16). A page-mode
 * source is read as before.
 */

const setTimelineMode = (db: DbConnection, timelineMode: boolean) =>
    updateWorkspaceSettingsParsed({
        db,
        settings: workspaceSettingsSchema.parse({ timelineMode }),
    });

const lastPage = async (db: DbConnection) => {
    const { pages } = await readShowTiming(db);
    return [...pages].sort((a, b) => a.order - b.order).at(-1)!;
};

/** `drill_prefix + drill_order` to marcher id, for the source file's marchers. */
const marcherIdsByDrillNumber = async (db: DbConnection) =>
    new Map(
        (await db.select().from(schema.marchers).all()).map((m) => [
            `${m.drill_prefix}${m.drill_order}`,
            m.id,
        ]),
    );

const byMarcherId = async (
    db: DbConnection,
    coordinates: Awaited<
        ReturnType<typeof readPreviousDotsFile>
    >["coordinates"],
) => {
    const ids = await marcherIdsByDrillNumber(db);
    return new Map(
        coordinates.map((c) => [
            ids.get(`${c.drill_prefix}${c.drill_order}`)!,
            c,
        ]),
    );
};

const lastPageRows = async (db: DbConnection) => {
    const page = await lastPage(db);
    return db
        .select()
        .from(schema.marcher_pages)
        .where(eq(schema.marcher_pages.page_id, page.id))
        .all();
};

/** What `readPreviousDotsFile` returns per marcher; never `home_x`, `home_y` or timestamps. */
const MARCHER_KEYS = [
    "drill_order",
    "drill_prefix",
    "name",
    "notes",
    "section",
    "year",
];

const TIMELINE_TABLE_NAMES = [
    "timeline_slot_destinations",
    "timeline_assignments",
    "timeline_transitions",
    "timeline_shapes",
    "timelines",
    "timeline_change_log",
];

/**
 * Runs `body` on a consistent copy of the fixture's file (`VACUUM INTO`), so a test can damage
 * the copy without touching the fixture's connection. The copy is removed afterwards.
 */
const withSourceCopy = async (
    task: { id: string },
    body: (copy: string) => Promise<void>,
) => {
    const source = getTempDotsPath(task);
    const copy = `${source}.copy.dots`;
    fs.rmSync(copy, { force: true });
    const raw = new DatabaseSync(source, { readOnly: true });
    try {
        raw.exec(`VACUUM INTO '${copy}'`);
    } finally {
        raw.close();
    }
    try {
        await body(copy);
    } finally {
        fs.rmSync(copy, { force: true });
    }
};

/** Opens `file` directly (no migrations, no proxy) to change it. */
const editFile = (file: string, edit: (raw: DatabaseSync) => void) => {
    const raw = new DatabaseSync(file);
    try {
        raw.exec("PRAGMA foreign_keys = OFF");
        edit(raw);
    } finally {
        raw.close();
    }
};

const dropTriggers = (raw: DatabaseSync) => {
    const triggers = raw
        .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'")
        .all() as { name: string }[];
    for (const { name } of triggers) raw.exec(`DROP TRIGGER "${name}"`);
};

describeDbTests("readPreviousDotsFile", (it) => {
    it("page mode reads the last page's marcher_pages rows, as before", async ({
        db,
        marchersAndPages: _,
        task,
    }) => {
        const rows = await lastPageRows(db);
        expect(rows.length).toBeGreaterThan(0);

        const { coordinates } = await readPreviousDotsFile(
            getTempDotsPath(task),
        );

        const imported = await byMarcherId(db, coordinates);
        expect(imported.size).toBe(rows.length);
        for (const row of rows) {
            expect(imported.get(row.marcher_id)).toMatchObject({
                x: row.x,
                y: row.y,
            });
        }
    });

    it("a converted show with the flag off still reads marcher_pages", async ({
        db,
        marchersAndPages: _,
        task,
    }) => {
        await convertPagesToTimeline(db);
        await setTimelineMode(db, false);
        const page = await lastPage(db);
        await updateMarcherPages({
            db,
            modifiedMarcherPages: [
                { marcher_id: 1, page_id: page.id, x: 11, y: 22 },
            ],
        });

        const { coordinates } = await readPreviousDotsFile(
            getTempDotsPath(task),
        );

        expect((await byMarcherId(db, coordinates)).get(1)).toMatchObject({
            x: 11,
            y: 22,
        });
    });

    it("timeline mode samples the resolver at the last page's end beat, never marcher_pages", async ({
        db,
        marchersAndPages: _,
        task,
    }) => {
        await convertPagesToTimeline(db);
        await setTimelineMode(db, true);
        const page = await lastPage(db);
        const before = await acquireExportResolver(db);
        const [x, y] = before.positionAt(1, pageEndBeat(page));
        await moveMarchersOnPage({
            db,
            page,
            moves: [{ marcherId: 1, x: x + 24, y: y - 12 }],
        });
        // A frozen page-era row that disagrees with the timeline is ignored (written with the
        // freeze lifted, as only a file from before the conversion could have it)
        await withPageEraFreezeLifted(db, () =>
            updateMarcherPages({
                db,
                modifiedMarcherPages: [
                    { marcher_id: 2, page_id: page.id, x: 1, y: 1 },
                ],
            }),
        );
        const resolver = await acquireExportResolver(db);

        const { coordinates } = await readPreviousDotsFile(
            getTempDotsPath(task),
        );

        const imported = await byMarcherId(db, coordinates);
        expect(imported.size).toBe(resolver.marcherIds().length);
        for (const id of resolver.marcherIds()) {
            const [rx, ry] = resolver.positionAt(id, pageEndBeat(page));
            expect(imported.get(id)!.x).toBeCloseTo(rx, 9);
            expect(imported.get(id)!.y).toBeCloseTo(ry, 9);
        }
        expect(imported.get(1)!.x).toBeCloseTo(x + 24, 9);
        expect(imported.get(1)!.y).toBeCloseTo(y - 12, 9);
        expect(imported.get(2)).not.toMatchObject({ x: 1, y: 1 });
    });
});

describeDbTests("readPreviousDotsFile on unusual sources", (it) => {
    it("reads a source from before migration 0017 (no timeline tables, no homes)", async ({
        db,
        marchersAndPages: _,
        task,
    }) => {
        const rows = await lastPageRows(db);
        await withSourceCopy(task, async (copy) => {
            editFile(copy, (raw) => {
                dropTriggers(raw);
                const views = raw
                    .prepare(
                        "SELECT name FROM sqlite_master WHERE type = 'view' AND name LIKE 'timeline%'",
                    )
                    .all() as { name: string }[];
                for (const { name } of views) raw.exec(`DROP VIEW "${name}"`);
                for (const table of TIMELINE_TABLE_NAMES)
                    raw.exec(`DROP TABLE IF EXISTS ${table}`);
                raw.exec("ALTER TABLE marchers DROP COLUMN home_x");
                raw.exec("ALTER TABLE marchers DROP COLUMN home_y");
            });

            const { coordinates, marchers } = await readPreviousDotsFile(copy);

            const imported = await byMarcherId(db, coordinates);
            expect(imported.size).toBe(rows.length);
            for (const row of rows)
                expect(imported.get(row.marcher_id)).toMatchObject({
                    x: row.x,
                    y: row.y,
                });
            expect(marchers.length).toBeGreaterThan(0);
            for (const marcher of marchers)
                expect(Object.keys(marcher).sort()).toEqual(MARCHER_KEYS);
        });
    });

    it("returns only the marcher fields the import uses", async ({
        db: _db,
        marchersAndPages: _,
        task,
    }) => {
        const { marchers } = await readPreviousDotsFile(getTempDotsPath(task));
        expect(marchers.length).toBeGreaterThan(0);
        for (const marcher of marchers)
            expect(Object.keys(marcher).sort()).toEqual(MARCHER_KEYS);
    });

    it("says the timeline couldn't be read, closes the file, and never falls back to marcher_pages", async ({
        db,
        marchersAndPages: _,
        task,
    }) => {
        await convertPagesToTimeline(db);
        await setTimelineMode(db, true);
        await withSourceCopy(task, async (copy) => {
            editFile(copy, (raw) => {
                dropTriggers(raw);
                raw.exec("PRAGMA ignore_check_constraints = ON");
                raw.exec(
                    "UPDATE timeline_transitions SET path_params = 'not json'",
                );
            });
            const close = vi.spyOn(DatabaseSync.prototype, "close");
            try {
                const before = close.mock.calls.length;
                const error = await readPreviousDotsFile(copy).catch(
                    (e: unknown) => e,
                );
                expect(error).toBeInstanceOf(SourceTimelineReadError);
                expect((error as Error).message).toBe(
                    "Couldn't read the timeline of this file",
                );
                expect(close.mock.calls.length).toBe(before + 1);
            } finally {
                close.mockRestore();
            }
        });
    });

    it("keeps a marcher with no assignment at the last beat where its last span ended", async ({
        db,
        marchersAndPages: _,
        task,
    }) => {
        await convertPagesToTimeline(db);
        await setTimelineMode(db, true);
        const page = await lastPage(db);
        const endBeat = pageEndBeat(page);
        const assignments = await db
            .select()
            .from(schema.timeline_assignments)
            .where(eq(schema.timeline_assignments.marcher_id, 1))
            .all();
        const last = assignments.reduce((a, b) =>
            b.end_beat > a.end_beat ? b : a,
        );
        expect(last.end_beat).toBeGreaterThanOrEqual(endBeat);
        const earlier = assignments.filter((a) => a.id !== last.id);
        expect(earlier.length).toBeGreaterThan(0);
        await db
            .delete(schema.timeline_assignments)
            .where(eq(schema.timeline_assignments.id, last.id));
        const resolver = await acquireExportResolver(db);
        const lastSpanEnd = Math.max(...earlier.map((a) => a.end_beat));
        expect(lastSpanEnd).toBeLessThan(endBeat);
        const held = resolver.positionAt(1, lastSpanEnd);
        const home = await db
            .select({ x: schema.marchers.home_x, y: schema.marchers.home_y })
            .from(schema.marchers)
            .where(eq(schema.marchers.id, 1))
            .get();
        expect([home!.x, home!.y]).not.toEqual(held);

        const { coordinates } = await readPreviousDotsFile(
            getTempDotsPath(task),
        );

        const imported = (await byMarcherId(db, coordinates)).get(1)!;
        expect(imported.x).toBeCloseTo(held[0], 9);
        expect(imported.y).toBeCloseTo(held[1], 9);
    });

    it("a timeline-mode source with no pages fails as page mode does", async ({
        db,
        marchersAndPages: _,
        task,
    }) => {
        await convertPagesToTimeline(db);
        await setTimelineMode(db, true);
        await withSourceCopy(task, async (copy) => {
            editFile(copy, (raw) => {
                dropTriggers(raw);
                raw.exec("PRAGMA foreign_keys = OFF");
                raw.exec("DELETE FROM pages");
            });

            await expect(readPreviousDotsFile(copy)).rejects.toThrow(
                "No timing objects found in source file",
            );
        });
    });

    it("leaves the source file unchanged", async ({
        db,
        marchersAndPages: _,
        task,
    }) => {
        await convertPagesToTimeline(db);
        await setTimelineMode(db, true);
        await withSourceCopy(task, async (copy) => {
            const before = fs.readFileSync(copy);
            await readPreviousDotsFile(copy);
            expect(fs.readFileSync(copy).equals(before)).toBe(true);
        });
    });
});

describe("isSourceInTimelineMode", () => {
    plainIt("is on only when the settings parse and turn the flag on", () => {
        expect(isSourceInTimelineMode(undefined)).toBe(false);
        expect(isSourceInTimelineMode("not json")).toBe(false);
        expect(isSourceInTimelineMode("{}")).toBe(false);
        expect(isSourceInTimelineMode('{"timelineMode":false}')).toBe(false);
        expect(isSourceInTimelineMode('{"timelineMode":true}')).toBe(true);
        expect(
            isSourceInTimelineMode('{"timelineMode":true,"defaultTempo":-1}'),
        ).toBe(false);
    });
});

describe("lastPageEndBeat", () => {
    /** The last page's end beat as the renderer computes it: `fromDatabasePages`, then `pageEndBeat`. */
    const rendererEndBeat = (
        beatCount: number,
        startBeatIndex: number,
        lastPageCounts: number,
    ) => {
        const beats = Array.from({ length: beatCount }, (_, i) => ({
            id: i + 1,
            position: i,
            duration: 0.5,
            include_in_measure: true,
            notes: null,
            index: i,
            timestamp: i * 0.5,
        }));
        const pages = fromDatabasePages({
            databasePages: [
                {
                    id: 0,
                    start_beat: 1,
                    is_subset: false,
                    notes: null,
                },
                ...(startBeatIndex > 0
                    ? [
                          {
                              id: 1,
                              start_beat: startBeatIndex + 1,
                              is_subset: false,
                              notes: null,
                          },
                      ]
                    : []),
            ],
            allMeasures: [],
            allBeats: beats,
            lastPageCounts,
        });
        return pageEndBeat(pages.at(-1)!);
    };

    for (const [beatCount, start, counts] of [
        [20, 5, 8],
        [20, 5, 15],
        [20, 5, 30],
        [20, 19, 8],
        [20, 0, 8],
        [1, 0, 8],
        [10, 9, 1],
    ] as const) {
        plainIt(
            `matches the renderer for ${beatCount} beats, a last page at ${start} and ${counts} counts`,
            () => {
                expect(
                    lastPageEndBeat({
                        startBeatIndex: start,
                        beatCount,
                        lastPageCounts: counts,
                        isFirstPage: start === 0,
                    }),
                ).toBe(rendererEndBeat(beatCount, start, counts));
            },
        );
    }
});

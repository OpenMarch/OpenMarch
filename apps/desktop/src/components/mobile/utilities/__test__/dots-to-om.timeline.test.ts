import { afterEach, describe, expect, it as plainIt, vi } from "vitest";
import { FieldProperties } from "@openmarch/core";
import type { OpenMarchShowData } from "@openmarch/schema";
import { safeValidateOpenMarchData } from "@openmarch/schema";
import { eq } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { FieldPropertiesSchema } from "@/components/field/fieldPropertiesSchema";
import type { DB } from "@/global/database/db";
import { createMarchers } from "@/db-functions/marcher";
import { updateMarcherPages } from "@/db-functions/marcherPage";
import { createLastPage, deletePages } from "@/db-functions/page";
import { transactionWithHistory } from "@/db-functions/history";
import {
    moveMarchersOnPage,
    moveMarchersOnPageInTransaction,
} from "@/db-functions/timelineMoves";
import { updateWorkspaceSettingsParsed } from "@/db-functions/workspaceSettings";
import type Page from "@/global/classes/Page";
import { workspaceSettingsSchema } from "@/settings/workspaceSettings";
import {
    convertPagesToTimeline,
    readShowTiming,
} from "@/timeline/convert/writePageConversion";
import { pageEndBeat } from "@/timeline/timelineCanvas";
import { acquireExportResolver } from "@/timeline/timelineExport";
import { sampleTimelinePagePositions } from "@/timeline/timelinePagePositions";
import {
    startTimelineResolver,
    stopTimelineResolver,
} from "@/timeline/timelineStore";
import { toOpenMarchSchema } from "../dots-to-om";
import {
    keepFixturesInPageMode,
    withPageEraFreezeLifted,
} from "@/test/timelineMode";

// P7.17: these tests set up timeline mode themselves
keepFixturesInPageMode(
    "its tests convert the show or write timeline rows, and set the flag, themselves",
);

/**
 * The mobile app payload in timeline mode (docs/timeline/phases/07-page-parity.md P7.12): page
 * positions come from the resolver at each page's end beat, never from `marcher_pages`.
 */

afterEach(() => stopTimelineResolver());

const setTimelineMode = (db: DbConnection, timelineMode: boolean) =>
    updateWorkspaceSettingsParsed({
        db,
        settings: workspaceSettingsSchema.parse({ timelineMode }),
    });

const exportShow = (db: DbConnection) => toOpenMarchSchema(db as unknown as DB);

const sortedPages = async (db: DbConnection): Promise<Page[]> => {
    const { pages } = await readShowTiming(db);
    return [...pages].sort((a, b) => a.order - b.order);
};

type Coordinate = OpenMarchShowData["coordinates"][number];
const key = (c: Pick<Coordinate, "marcherId" | "pageId">) =>
    `${c.marcherId}:${c.pageId}`;
const byKey = (coordinates: readonly Coordinate[]) =>
    new Map(coordinates.map((c) => [key(c), c]));

/** Every coordinate in `actual` matches `expected` (same pages and marchers, x/y within 1e-9). */
const expectSameCoordinates = (
    actual: readonly Coordinate[],
    expected: readonly Coordinate[],
) => {
    expect(actual).toHaveLength(expected.length);
    const want = byKey(expected);
    for (const c of actual) {
        const w = want.get(key(c));
        expect(w, key(c)).toBeDefined();
        expect(c.xSteps).toBeCloseTo(w!.xSteps, 9);
        expect(c.ySteps).toBeCloseTo(w!.ySteps, 9);
    }
};

describe("sampleTimelinePagePositions", () => {
    plainIt(
        "samples every marcher at every page's end beat, page-major",
        async () => {
            const beats: number[] = [];
            const ids = [7, 9];
            const resolver = {
                marcherIds: () => ids,
                positionsAt: (b: number, out: Float64Array) => {
                    beats.push(b);
                    ids.forEach((m, i) => {
                        out[2 * i] = m * 10;
                        out[2 * i + 1] = b;
                    });
                },
            };
            const pages = [
                { id: 0, beats: [{ index: 0 }] },
                { id: 4, beats: [{ index: 1 }, { index: 2 }, { index: 3 }] },
            ] as unknown as Page[];

            expect(
                await sampleTimelinePagePositions({ resolver, pages }),
            ).toEqual([
                { marcher_id: 7, page_id: 0, x: 70, y: 1 },
                { marcher_id: 9, page_id: 0, x: 90, y: 1 },
                { marcher_id: 7, page_id: 4, x: 70, y: 4 },
                { marcher_id: 9, page_id: 4, x: 90, y: 4 },
            ]);
            // One positionsAt call per page
            expect(beats).toEqual([1, 4]);
        },
    );

    plainIt("yields to the event loop on a long sample", async () => {
        const ids = Array.from({ length: 50 }, (_, i) => i + 1);
        let now = 0;
        const clock = vi
            .spyOn(performance, "now")
            .mockImplementation(() => (now += 5));
        const timeout = vi.spyOn(globalThis, "setTimeout");
        try {
            const pages = Array.from({ length: 20 }, (_, i) => ({
                id: i,
                beats: [{ index: i }],
            })) as unknown as Page[];
            const out = await sampleTimelinePagePositions({
                resolver: {
                    marcherIds: () => ids,
                    positionsAt: (_b: number, out: Float64Array) => out.fill(1),
                },
                pages,
            });
            expect(out).toHaveLength(20 * 50);
            expect(timeout).toHaveBeenCalled();
        } finally {
            clock.mockRestore();
            timeout.mockRestore();
        }
    });
});

describeDbTests("dots-to-om in timeline mode", (it) => {
    it("gives a freshly converted show the same page positions as page mode", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pageMode = await exportShow(db);
        await convertPagesToTimeline(db);
        await setTimelineMode(db, true);

        const timeline = await exportShow(db);

        expect(safeValidateOpenMarchData(timeline).success).toBe(true);
        expectSameCoordinates(timeline.coordinates, pageMode.coordinates);
        expect(timeline.pages).toEqual(pageMode.pages);
        expect(timeline.performers).toEqual(pageMode.performers);
        expect(timeline.tempoSections).toEqual(pageMode.tempoSections);
    });

    it("samples the resolver at each page's end beat", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await setTimelineMode(db, true);
        const pages = await sortedPages(db);
        const resolver = await acquireExportResolver(db);

        const { coordinates } = await exportShow(db);
        const steps = byKey(coordinates);

        // Compare offsets from one page-0 coordinate, so the field's origin cancels out
        const row = await db.query.field_properties.findFirst();
        const { pixelsPerStep } = new FieldProperties(
            FieldPropertiesSchema.parse(JSON.parse(row!.json_data)),
        );
        const m = resolver.marcherIds()[0]!;
        const c0 = steps.get(key({ marcherId: String(m), pageId: "0" }))!;
        const [x0, y0] = resolver.positionAt(m, pageEndBeat(pages[0]!));

        expect(coordinates).toHaveLength(
            pages.length * resolver.marcherIds().length,
        );
        for (const page of pages) {
            for (const id of resolver.marcherIds()) {
                const [x, y] = resolver.positionAt(id, pageEndBeat(page));
                const c = steps.get(
                    key({ marcherId: String(id), pageId: String(page.id) }),
                )!;
                expect(c).toBeDefined();
                expect(c.xSteps - c0.xSteps).toBeCloseTo(
                    (x - x0) / pixelsPerStep,
                    9,
                );
                expect(c.ySteps - c0.ySteps).toBeCloseTo(
                    -(y - y0) / pixelsPerStep,
                    9,
                );
                expect(c.rotation_degrees).toBeUndefined();
            }
        }
    });

    it("exports a timeline edit and never reads marcher_pages", async ({
        db,
        marchersAndPages: _,
    }) => {
        const before = await exportShow(db);
        await convertPagesToTimeline(db);
        await setTimelineMode(db, true);
        const pages = await sortedPages(db);
        const page = pages[2]!;
        const resolver = await acquireExportResolver(db);
        const [x, y] = resolver.positionAt(1, pageEndBeat(page));
        await moveMarchersOnPage({
            db,
            page,
            moves: [{ marcherId: 1, x: x + 24, y }],
        });
        // Frozen page-era rows that disagree with the timeline are ignored (written with the
        // freeze lifted, as only a file from before the conversion could have them)
        await withPageEraFreezeLifted(db, () =>
            updateMarcherPages({
                db,
                modifiedMarcherPages: [
                    { marcher_id: 2, page_id: page.id, x: 1, y: 1 },
                ],
            }),
        );

        const after = await exportShow(db);

        const moved = key({ marcherId: "1", pageId: String(page.id) });
        const untouched = key({ marcherId: "2", pageId: String(page.id) });
        const old = byKey(before.coordinates);
        const now = byKey(after.coordinates);
        const pixelsPerStep =
            24 / (now.get(moved)!.xSteps - old.get(moved)!.xSteps);
        expect(pixelsPerStep).toBeGreaterThan(0);
        expect(now.get(moved)!.ySteps).toBeCloseTo(old.get(moved)!.ySteps, 9);
        expect(now.get(untouched)!.xSteps).toBeCloseTo(
            old.get(untouched)!.xSteps,
            9,
        );
        expect(now.get(untouched)!.ySteps).toBeCloseTo(
            old.get(untouched)!.ySteps,
            9,
        );

        // Page mode still reads the page-era rows, which the timeline edit didn't touch
        await setTimelineMode(db, false);
        const pageMode = byKey((await exportShow(db)).coordinates);
        expect(pageMode.get(moved)!.xSteps).toBe(old.get(moved)!.xSteps);
        expect(pageMode.get(untouched)!.xSteps).not.toBe(
            old.get(untouched)!.xSteps,
        );
    });

    it("leaves out per-page appearance overrides, which timeline mode dropped", async ({
        db,
        marchersAndPages,
    }) => {
        const firstPageId = marchersAndPages.expectedPages[0].id;
        await updateMarcherPages({
            db,
            modifiedMarcherPages: [
                { marcher_id: 1, page_id: firstPageId, shape_type: "x" },
            ],
        });
        await convertPagesToTimeline(db);
        const isOverride = (p: { marcherId: string; pageId: string }) =>
            p.marcherId === "1" && p.pageId === String(firstPageId);

        const pageMode = await exportShow(db);
        await setTimelineMode(db, true);
        const timeline = await exportShow(db);

        expect(pageMode.performerAppearance.performers.some(isOverride)).toBe(
            true,
        );
        expect(timeline.performerAppearance.performers.some(isOverride)).toBe(
            false,
        );
    });

    // A wrapped write joins the FIFO write lock when it is called, so the export's lock alone
    // waits for it; no separate settle is needed for the export's private resolver
    it("waits for a timeline write still in flight", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await setTimelineMode(db, true);
        await startTimelineResolver(db);
        const pages = await sortedPages(db);
        const page = pages[1]!;
        const before = byKey((await exportShow(db)).coordinates);
        const resolver = await acquireExportResolver(db);
        const [x, y] = resolver.positionAt(3, pageEndBeat(page));

        // A nudge is still being written when the export starts: its edit has begun but takes
        // 100 ms before it writes anything
        const nudge = transactionWithHistory(db, "slowNudge", async (tx) => {
            await new Promise((resolve) => setTimeout(resolve, 100));
            return moveMarchersOnPageInTransaction({
                tx,
                page,
                moves: [{ marcherId: 3, x: x + 12, y }],
            });
        });
        const exported = exportShow(db);
        await nudge;
        const after = byKey((await exported).coordinates);

        const moved = key({ marcherId: "3", pageId: String(page.id) });
        expect(after.get(moved)!.xSteps).toBeGreaterThan(
            before.get(moved)!.xSteps,
        );
    });

    it("reads no marcher_pages rows for a show with none", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await setTimelineMode(db, true);
        const expected = (await exportShow(db)).coordinates;
        await withPageEraFreezeLifted(db, () =>
            db.delete(schema.marcher_pages),
        );

        const { coordinates } = await exportShow(db);

        expectSameCoordinates(coordinates, expected);
    });

    it("drops a page-era rotation in timeline mode only", async ({
        db,
        marchersAndPages,
    }) => {
        const pageId = marchersAndPages.expectedPages[1].id;
        await updateMarcherPages({
            db,
            modifiedMarcherPages: [
                { marcher_id: 2, page_id: pageId, rotation_degrees: 45 },
            ],
        });
        await convertPagesToTimeline(db);
        const rotated = key({ marcherId: "2", pageId: String(pageId) });

        const pageMode = byKey((await exportShow(db)).coordinates);
        await setTimelineMode(db, true);
        const timeline = await exportShow(db);

        expect(pageMode.get(rotated)!.rotation_degrees).toBe(45);
        expect(
            timeline.coordinates.some((c) => c.rotation_degrees !== undefined),
        ).toBe(false);
    });

    it("covers a page and a marcher created after conversion", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await setTimelineMode(db, true);
        const [created] = await createMarchers({
            db,
            newMarchers: [
                { section: "Flute", drill_prefix: "N", drill_order: 1 },
            ],
        });
        await createLastPage({ db, newPageCounts: 4, createNewBeats: true });
        // Neither has page-era rows to fall back on (P9.5: they get none), nor does anyone else
        expect(
            await db
                .select()
                .from(schema.marcher_pages)
                .where(eq(schema.marcher_pages.marcher_id, created!.id))
                .all(),
        ).toEqual([]);
        await withPageEraFreezeLifted(db, () =>
            db.delete(schema.marcher_pages),
        );
        const pages = await sortedPages(db);
        const newPage = pages[pages.length - 1]!;
        const resolver = await acquireExportResolver(db);

        const show = await exportShow(db);

        expect(safeValidateOpenMarchData(show).success).toBe(true);
        expect(show.pages.map((p) => p.id)).toContain(String(newPage.id));
        expect(show.performers.map((p) => p.id)).toContain(created!.id);
        const performerIds = show.performers.map((p) => String(p.id));
        expect(show.coordinates).toHaveLength(
            show.pages.length * performerIds.length,
        );
        const coordinates = byKey(show.coordinates);
        for (const page of show.pages)
            for (const marcherId of performerIds)
                expect(
                    coordinates.get(key({ marcherId, pageId: page.id })),
                    `${marcherId}:${page.id}`,
                ).toBeDefined();
        // The new marcher on the new page sits where the resolver puts it
        const [x0, y0] = resolver.positionAt(
            created!.id,
            pageEndBeat(pages[0]!),
        );
        const [x1, y1] = resolver.positionAt(created!.id, pageEndBeat(newPage));
        const first = coordinates.get(
            key({
                marcherId: String(created!.id),
                pageId: String(pages[0]!.id),
            }),
        )!;
        const last = coordinates.get(
            key({ marcherId: String(created!.id), pageId: String(newPage.id) }),
        )!;
        const row = await db.query.field_properties.findFirst();
        const { pixelsPerStep } = new FieldProperties(
            FieldPropertiesSchema.parse(JSON.parse(row!.json_data)),
        );
        expect(last.xSteps - first.xSteps).toBeCloseTo(
            (x1 - x0) / pixelsPerStep,
            9,
        );
        expect(last.ySteps - first.ySteps).toBeCloseTo(
            -(y1 - y0) / pixelsPerStep,
            9,
        );
    });

    it("reads every row under one lock: a write queued mid-export waits", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await setTimelineMode(db, true);
        const pages = await sortedPages(db);
        const lastPage = pages[pages.length - 1]!;
        const before = await exportShow(db);

        // Queue a marcher add and a page delete while the export is reading its rows (after
        // marchers and pages), and give them 100 ms to commit before the reads go on. Under the
        // export's write lock they can't start, so the snapshot read next misses them too.
        let writes: Promise<unknown> | undefined;
        const measures = vi
            .spyOn(db.query.measures, "findMany")
            .mockImplementation((...args) => {
                measures.mockRestore();
                writes = Promise.all([
                    createMarchers({
                        db,
                        newMarchers: [
                            {
                                section: "Flute",
                                drill_prefix: "N",
                                drill_order: 1,
                            },
                        ],
                    }),
                    deletePages({ db, pageIds: new Set([lastPage.id]) }),
                ]);
                const grace = new Promise((resolve) =>
                    setTimeout(resolve, 100),
                );
                return Promise.race([writes, grace]).then(() =>
                    db.query.measures.findMany(...args),
                ) as unknown as ReturnType<typeof db.query.measures.findMany>;
            });
        const show = await exportShow(db);
        await writes;

        expect(writes).toBeDefined();
        // The export saw neither write, and its pages and coordinates agree
        expect(show.pages).toEqual(before.pages);
        expect(show.performers).toEqual(before.performers);
        expectSameCoordinates(show.coordinates, before.coordinates);
        // Both writes did commit afterwards
        const after = await exportShow(db);
        expect(after.performers).toHaveLength(before.performers.length + 1);
        expect(after.pages.map((p) => p.id)).not.toContain(String(lastPage.id));
        expect(after.coordinates).toHaveLength(
            after.pages.length * after.performers.length,
        );
    });

    it("keeps page mode's output unchanged", async ({
        db,
        marchersAndPages,
    }) => {
        await updateMarcherPages({
            db,
            modifiedMarcherPages: [
                {
                    marcher_id: 2,
                    page_id: marchersAndPages.expectedPages[1].id,
                    rotation_degrees: 30,
                    shape_type: "x",
                },
            ],
        });

        expect(await exportShow(db)).toMatchSnapshot();
    });
});

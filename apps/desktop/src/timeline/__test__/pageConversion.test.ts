import { afterEach, expect } from "vitest";
import { and, count, eq } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { performRedo, performUndo } from "@/db-functions/history";
import { createMarchers } from "@/db-functions/marcher";
import { TimelineWriteError } from "@/db-functions/timelineErrors";
import {
    combineMarcherTimelines,
    getMarcherTimelines,
} from "@/hooks/queries/useCoordinateData";
import type { MarcherPagesByMarcher } from "@/global/classes/MarcherPageIndex";
import { getCoordinatesAtTime } from "@/utilities/Keyframes";
import {
    convertPagesToTimeline,
    readShowTiming,
} from "../convert/writePageConversion";
import { createTimelineDevApi } from "../fixtures/timelineFixtures";
import { pageEndBeat } from "../timelineCanvas";
import { timeAtBeat } from "../timeMap";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "../timelineStore";

/**
 * The page → timeline converter on a real database (docs/timeline/phases/06-converter.md P6.5),
 * on the `marchersAndPages` mock show: 76 marchers, page 0 plus six 8-count pages, every beat
 * 0.5 s, no pathways.
 */

afterEach(() => stopTimelineResolver());

const TIMELINE_TABLES = [
    schema.timelines,
    schema.timeline_shapes,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
] as const;

const tableCount = async (
    db: DbConnection,
    table: (typeof TIMELINE_TABLES)[number],
) => (await db.select({ n: count() }).from(table).get())!.n;

const timelineCounts = (db: DbConnection) =>
    Promise.all(TIMELINE_TABLES.map((t) => tableCount(db, t)));

const homes = (db: DbConnection) =>
    db
        .select({
            id: schema.marchers.id,
            x: schema.marchers.home_x,
            y: schema.marchers.home_y,
        })
        .from(schema.marchers)
        .orderBy(schema.marchers.id)
        .all();

const resolver = () => {
    const r = useTimelineResolverStore.getState().resolver;
    expect(r, "the resolver store is ready").not.toBeNull();
    return r!;
};

/**
 * At every page's end beat, the resolver puts each marcher exactly (bit for bit) on that page's
 * marcher_pages coordinate. Page 0 is checked at beats 0 and 1.
 */
const expectPageEndsExact = async (
    db: DbConnection,
    skip: (marcherId: number, pageId: number) => boolean = () => false,
) => {
    const { pages } = await readShowTiming(db);
    const rows = await db.select().from(schema.marcher_pages).all();
    const r = resolver();
    let checked = 0;
    for (const page of pages) {
        const beats =
            page.order === 0 ? [0, pageEndBeat(page)] : [pageEndBeat(page)];
        for (const mp of rows.filter((row) => row.page_id === page.id)) {
            if (skip(mp.marcher_id, page.id)) continue;
            for (const beat of beats) {
                const [x, y] = r.positionAt(mp.marcher_id, beat);
                const what = `marcher ${mp.marcher_id}, page ${page.name}, beat ${beat}`;
                expect(Object.is(x, mp.x), `${what}: x ${x} vs ${mp.x}`).toBe(
                    true,
                );
                expect(Object.is(y, mp.y), `${what}: y ${y} vs ${mp.y}`).toBe(
                    true,
                );
                checked++;
            }
        }
    }
    return checked;
};

describeDbTests("page → timeline converter", (it) => {
    it("puts every marcher on its marcher_pages coordinate at every page end, bit for bit", async ({
        db,
        marchersAndPages,
    }) => {
        const result = await convertPagesToTimeline(db);
        const { pages } = await readShowTiming(db);
        const marcherCount = marchersAndPages.expectedMarchers.length;
        expect(pages.length).toBe(7);
        expect(result.transitionIds.size).toBe(6);
        expect(result.assignmentCount).toBe(6 * marcherCount);
        expect(result.homeCount).toBe(marcherCount);
        expect(await timelineCounts(db)).toEqual([
            1,
            0,
            6,
            6 * marcherCount,
            6 * marcherCount,
        ]);

        // One timeline over the show; one direct, shapeless transition per page N ≥ 1
        const [timeline] = await db.select().from(schema.timelines).all();
        expect([timeline!.start_beat, timeline!.end_beat]).toEqual([
            0,
            pageEndBeat(pages[6]!),
        ]);
        const transitions = await db
            .select()
            .from(schema.timeline_transitions)
            .all();
        expect(
            transitions.map((t) => [
                t.start_beat,
                t.end_beat,
                t.path_style,
                t.dest_shape_id,
                t.slot_count,
            ]),
        ).toEqual(
            pages
                .slice(1)
                .map((p) => [
                    p.beats[0]!.index,
                    pageEndBeat(p),
                    "direct",
                    null,
                    marcherCount,
                ]),
        );
        expect(result.report.pages.every((p) => p.skipped === null)).toBe(true);

        // Homes are page 0's coordinates
        const page0 = await db
            .select()
            .from(schema.marcher_pages)
            .where(eq(schema.marcher_pages.page_id, 0))
            .orderBy(schema.marcher_pages.marcher_id)
            .all();
        expect(await homes(db)).toEqual(
            page0.map((mp) => ({ id: mp.marcher_id, x: mp.x, y: mp.y })),
        );

        await startTimelineResolver(db);
        expect(resolver().diagnostics()).toEqual([]);
        expect(await expectPageEndsExact(db)).toBe(8 * marcherCount);
    });

    it("between pages, matches the page-mode keyframes (uniform tempo, no pathways)", async ({
        db,
        marchersAndPages,
    }) => {
        await convertPagesToTimeline(db);
        await startTimelineResolver(db);
        const r = resolver();
        const { beats, pages } = await readShowTiming(db);
        const rows = await db.select().from(schema.marcher_pages).all();
        const keyframes = combineMarcherTimelines(
            pages.map((page) =>
                getMarcherTimelines(
                    (page.timestamp + page.duration) * 1000,
                    Object.fromEntries(
                        rows
                            .filter((mp) => mp.page_id === page.id)
                            .map((mp) => [mp.marcher_id, mp]),
                    ) as unknown as MarcherPagesByMarcher,
                    {},
                ),
            ),
        );
        const showEnd = pageEndBeat(pages[pages.length - 1]!);
        let checked = 0;
        for (const { id } of marchersAndPages.expectedMarchers) {
            const timeline = keyframes.get(id)!;
            for (let b = 1; b < showEnd; b += 0.125) {
                const expected = getCoordinatesAtTime(
                    timeAtBeat(beats, b) * 1000,
                    timeline,
                )!;
                const [x, y] = r.positionAt(id, b);
                const what = `marcher ${id} at beat ${b}`;
                expect(Math.abs(x - expected.x), what).toBeLessThan(1e-9);
                expect(Math.abs(y - expected.y), what).toBeLessThan(1e-9);
                checked++;
            }
        }
        expect(checked).toBeGreaterThan(1000);
    });

    it("is one undoable edit: undo removes every converted row and restores the homes", async ({
        db,
        marchersAndPages: _,
    }) => {
        const before = await homes(db);
        await startTimelineResolver(db);
        await convertPagesToTimeline(db);
        await timelineResolverSettled();
        // The running store follows the edit through the change log, whose JSON images carry
        // REAL columns at full precision, so it is exact without a cold build.
        expect(await expectPageEndsExact(db)).toBeGreaterThan(0);
        await startTimelineResolver(db);
        expect(await expectPageEndsExact(db)).toBeGreaterThan(0);

        const undo = await performUndo(db);
        expect(undo.success, undo.error?.message).toBe(true);
        expect(await timelineCounts(db)).toEqual([0, 0, 0, 0, 0]);
        expect(await homes(db)).toEqual(before);
        await timelineResolverSettled();
        expect(resolver().positionAt(1, 9)).toEqual([0, 0]);

        const redo = await performRedo(db);
        expect(redo.success, redo.error?.message).toBe(true);
        await timelineResolverSettled();
        expect(await expectPageEndsExact(db)).toBeGreaterThan(0);
        // Redo restores the exact rows
        await startTimelineResolver(db);
        expect(await expectPageEndsExact(db)).toBeGreaterThan(0);
    });

    it("refuses a second conversion (E-ARGS) unless asked to replace", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const counts = await timelineCounts(db);
        const error = await convertPagesToTimeline(db).catch((e) => e);
        expect(error).toBeInstanceOf(TimelineWriteError);
        expect((error as TimelineWriteError).code).toBe("E-ARGS");
        expect(await timelineCounts(db)).toEqual(counts);

        // Replace: the old rows go and the result is the same as one conversion
        await db.insert(schema.timeline_shapes).values({
            kind: "line",
            geometry: JSON.stringify({ a: [0, 0], b: [1, 0] }),
        });
        await convertPagesToTimeline(db, { replace: true });
        expect(await timelineCounts(db)).toEqual(counts);
        await startTimelineResolver(db);
        expect(await expectPageEndsExact(db)).toBeGreaterThan(0);

        // Undoing the replace brings the earlier rows back
        const undo = await performUndo(db);
        expect(undo.success, undo.error?.message).toBe(true);
        expect(await tableCount(db, schema.timeline_shapes)).toBe(1);
        expect(await tableCount(db, schema.timelines)).toBe(1);
    });

    it("reports pathways, midsets and curved shapes, and still lands on their page ends", async ({
        db,
        marchersAndPages: _,
    }) => {
        const [pathway] = await db
            .insert(schema.pathways)
            .values({ path_data: "M 0 0 Q 50 50 100 0" })
            .returning();
        await db
            .update(schema.marcher_pages)
            .set({ path_data_id: pathway!.id })
            .where(
                and(
                    eq(schema.marcher_pages.page_id, 2),
                    eq(schema.marcher_pages.marcher_id, 3),
                ),
            );
        const page3Row = await db
            .select()
            .from(schema.marcher_pages)
            .where(
                and(
                    eq(schema.marcher_pages.page_id, 3),
                    eq(schema.marcher_pages.marcher_id, 5),
                ),
            )
            .get();
        await db.insert(schema.midsets).values({
            mp_id: page3Row!.id,
            x: 1,
            y: 2,
            progress_placement: 0.5,
        });
        const [curved, straight] = await db
            .insert(schema.shapes)
            .values([{ name: "curve" }, { name: "line" }])
            .returning();
        const shapePages = await db
            .insert(schema.shape_pages)
            .values([
                {
                    shape_id: curved!.id,
                    page_id: 4,
                    svg_path: "M 0 0 C 10 10 20 10 30 0",
                },
                {
                    shape_id: straight!.id,
                    page_id: 4,
                    svg_path: "M 0 0 L 30 0",
                },
            ])
            .returning();

        // Dropped in timeline mode: rotation, notes and per-page appearance overrides
        await db
            .update(schema.marcher_pages)
            .set({
                rotation_degrees: 45,
                notes: "kneel",
                fill_color: "#ff0000",
            })
            .where(
                and(
                    eq(schema.marcher_pages.page_id, 5),
                    eq(schema.marcher_pages.marcher_id, 4),
                ),
            );
        await db
            .update(schema.marcher_pages)
            .set({ visible: 0 })
            .where(
                and(
                    eq(schema.marcher_pages.page_id, 5),
                    eq(schema.marcher_pages.marcher_id, 6),
                ),
            );

        const { report } = await createTimelineDevApi(
            db,
            () => {},
        ).convertPages();
        const byPage = new Map(report.pages.map((p) => [p.pageId, p]));
        expect(byPage.get(2)!.pathways).toEqual([
            { marcherId: 3, pathwayId: pathway!.id },
        ]);
        expect(byPage.get(3)!.midsets).toEqual([
            { marcherId: 5, midsetId: expect.any(Number), progress: 0.5 },
        ]);
        expect(byPage.get(4)!.curvedShapes).toEqual([
            { shapePageId: shapePages[0]!.id, shapeId: curved!.id },
        ]);
        for (const id of [0, 1, 5, 6])
            expect(byPage.get(id)!.pathways).toEqual([]);
        expect(byPage.get(5)!.droppedFields).toEqual({
            rotation: 1,
            notes: 1,
            appearance: 2,
        });
        for (const id of [0, 1, 2, 3, 4, 6])
            expect(byPage.get(id)!.droppedFields).toEqual({
                rotation: 0,
                notes: 0,
                appearance: 0,
            });

        await startTimelineResolver(db);
        expect(await expectPageEndsExact(db)).toBeGreaterThan(0);
    });

    it("a marcher missing a row on a page holds over that page", async ({
        db,
        marchersAndPages: _,
    }) => {
        await db
            .delete(schema.marcher_pages)
            .where(
                and(
                    eq(schema.marcher_pages.page_id, 3),
                    eq(schema.marcher_pages.marcher_id, 2),
                ),
            );
        const { report, assignmentCount } = await convertPagesToTimeline(db);
        expect(
            report.pages.find((p) => p.pageId === 3)!.missingMarchers,
        ).toEqual([2]);
        expect(assignmentCount).toBe(6 * 76 - 1);

        await startTimelineResolver(db);
        const { pages } = await readShowTiming(db);
        const page2 = pages.find((p) => p.id === 2)!;
        const page3 = pages.find((p) => p.id === 3)!;
        const page2Row = await db
            .select()
            .from(schema.marcher_pages)
            .where(
                and(
                    eq(schema.marcher_pages.page_id, 2),
                    eq(schema.marcher_pages.marcher_id, 2),
                ),
            )
            .get();
        for (const beat of [pageEndBeat(page2), pageEndBeat(page3) - 0.5])
            expect(resolver().positionAt(2, beat)).toEqual([
                page2Row!.x,
                page2Row!.y,
            ]);
        expect(
            await expectPageEndsExact(
                db,
                (marcherId, pageId) => marcherId === 2 && pageId === 3,
            ),
        ).toBeGreaterThan(0);
    });

    it("a show with only page 0 converts to homes and an empty timeline", async ({
        db,
    }) => {
        await createMarchers({
            db,
            newMarchers: [1, 2, 3].map((i) => ({
                section: "Other",
                drill_prefix: "T",
                drill_order: i,
            })),
        });
        const page0 = await db.select().from(schema.marcher_pages).all();
        expect(page0.length).toBe(3);
        const result = await convertPagesToTimeline(db);
        expect(result.transitionIds.size).toBe(0);
        expect(await timelineCounts(db)).toEqual([1, 0, 0, 0, 0]);
        const [timeline] = await db.select().from(schema.timelines).all();
        expect([timeline!.start_beat, timeline!.end_beat]).toEqual([0, 1]);
        expect(await homes(db)).toEqual(
            page0
                .sort((a, b) => a.marcher_id - b.marcher_id)
                .map((mp) => ({ id: mp.marcher_id, x: mp.x, y: mp.y })),
        );
        await startTimelineResolver(db);
        expect(await expectPageEndsExact(db)).toBe(6);
        // A second run is refused
        await expect(convertPagesToTimeline(db)).rejects.toThrow(/E-ARGS/);
    });
});

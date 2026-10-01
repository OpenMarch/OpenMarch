import { afterEach, expect } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import {
    convertPagesToTimeline,
    readShowTiming,
} from "../convert/writePageConversion";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineMarcherIds,
    useTimelineResolverStore,
} from "../timelineStore";
import { pageEndBeat } from "../timelineCanvas";
import { compareConversion, lossReportCounts } from "./conversionEquality";
import { buildConversionShow } from "./conversionShow";

// The show is built in page mode and converted by the test itself
keepFixturesInPageMode("the test builds a page show and converts it itself");

afterEach(() => stopTimelineResolver());

/**
 * Conversion equality on the generated show (docs/timeline/phases/06-converter.md P6.6): the
 * converted show plays back like the page show. Exact at every page end; at sampled beats inside
 * each page it matches page-mode playback at the same beat position (C-7), and the millisecond
 * difference on pages with uneven tempo is only reported. Pathways (C-8) are reported in their own
 * bucket. Damaged-file gaps glide like page mode (P6.7) and must match at the same beat too.
 */
describeDbTests("conversion equality", (it) => {
    it("plays the generated show back like page mode", async ({ db }) => {
        const show = await buildConversionShow(db);
        const { report } = await convertPagesToTimeline(db);
        await startTimelineResolver(db);
        expect(useTimelineResolverStore.getState().resolver).not.toBeNull();
        const equality = await compareConversion(db, { interiorSamples: 5 });
        const what = JSON.stringify(
            { ...equality, perPage: undefined, samples: undefined },
            null,
            1,
        );

        expect(equality.marchers, what).toBe(14);
        expect(equality.pages, what).toBe(10);

        // Exact (bit for bit) at every page end, page 0 included
        expect(equality.pageEnd.samples, what).toBeGreaterThan(9 * 13);
        expect(equality.pageEnd.exact, what).toBe(equality.pageEnd.samples);
        expect(equality.pageEnd.max, what).toBe(0);

        // Inside pages, straight moves match page mode at the same beat
        expect(equality.plain.samples, what).toBeGreaterThan(400);
        expect(equality.plain.max, what).toBeLessThan(1e-9);

        // C-7: millisecond playback agrees on even-tempo pages and differs on the uneven ones
        expect(equality.maxMsDifferenceEvenTempo, what).toBeLessThan(1e-9);
        expect(equality.unevenTempoPages, what).toBe(2);
        expect(
            equality.perPage.filter((p) => p.unevenTempo).map((p) => p.order),
        ).toEqual(show.unevenPageOrders);
        for (const page of equality.perPage.filter((p) => p.unevenTempo))
            expect(page.maxMsDifference, `page ${page.order}`).toBeGreaterThan(
                0.1,
            );

        // C-8: the pathways are kept only at their page ends, so they differ inside the pages: one
        // on page 7, and one on pages 6 (a gap glide along it) and 7
        expect(equality.pathway.samples, what).toBe(15);
        expect(equality.pathway.max, what).toBeGreaterThan(1);

        // Damaged file (P6.7): marchers without a row glide across the gap like page mode, linear
        // in beats: one gap on page 5 (pages 5 and 6 differ from a plain move), two in a row on
        // pages 4 (uneven tempo) and 5 after the curved-shape page 3 (pages 4 to 6), and one on the
        // last page, which holds. They match at the same beat on even and uneven pages; page
        // mode's millisecond glide is only reported.
        expect(equality.missingRow.samples, what).toBe(30);
        expect(equality.missingRow.max, what).toBeLessThan(1e-9);
        const page4 = equality.perPage.find((p) => p.order === 4)!;
        expect(page4.unevenTempo).toBe(true);
        expect(page4.missingRow.samples).toBe(5);
        expect(page4.missingRow.max).toBeLessThan(1e-9);
        // Their page ends, the glide along a pathway and the end hold included
        expect(equality.gapEnd.samples, what).toBe(5);
        expect(equality.gapEnd.max, what).toBeLessThan(1e-9);
        // No page-0 row for another marcher: page mode has no position before its first row
        expect(equality.beforeFirstRow, what).toBe(5);
        // Those samples: the converted show holds the late marcher on its page-1 row (its home)
        const { pages } = await readShowTiming(db);
        const page1 = pages[1]!;
        const lateRow = await db
            .select()
            .from(schema.marcher_pages)
            .where(
                and(
                    eq(schema.marcher_pages.page_id, page1.id),
                    eq(schema.marcher_pages.marcher_id, show.lateHomeMarcherId),
                ),
            )
            .get();
        const page1Start = page1.beats[0]!.index;
        const page1End = pageEndBeat(page1);
        for (let k = 1; k <= 5; k++) {
            const beat = page1Start + ((page1End - page1Start) * k) / 6;
            expect(
                useTimelineResolverStore
                    .getState()
                    .resolver!.positionAt(show.lateHomeMarcherId, beat),
            ).toEqual([lateRow!.x, lateRow!.y]);
        }

        // Coincident marchers stay together, and the deleted marcher is gone
        const r = useTimelineResolverStore.getState().resolver!;
        const page4End = equality.perPage.find((p) => p.order === 4)!.endBeat;
        expect(r.positionAt(show.coincident[0], page4End)).toEqual(
            r.positionAt(show.coincident[1], page4End),
        );
        const marchers = (
            await db
                .select({ id: schema.marchers.id })
                .from(schema.marchers)
                .all()
        ).map((m) => m.id);
        expect(marchers).not.toContain(show.deletedMarcherId);
        expect(timelineMarcherIds()).not.toContain(show.deletedMarcherId);
        for (const id of show.addedMarcherIds) {
            expect(marchers).toContain(id);
            expect(timelineMarcherIds()).toContain(id);
        }

        // The loss report covers what the comparison saw
        expect(lossReportCounts(report)).toEqual({
            pagesWithPathways: 1,
            pathways: 2,
            midsets: 1,
            curvedShapes: 1,
            droppedRotation: 0,
            droppedNotes: 0,
            droppedAppearance: 0,
            missingMarcherRows: 6,
            interpolatedMarcherRows: 4,
            interpolatedAlongPathway: 1,
            interpolatedUnusablePathway: 0,
            skippedPages: 0,
            homesFromLaterPage: 1,
            marchersWithoutRows: 0,
        });

        // Samples for the judgment step: the same marchers in the same order in both modes
        expect(equality.samples.length).toBe(6);
        for (const s of equality.samples) {
            expect(s.pageMode.length).toBe(s.marcherIds.length);
            expect(s.converted.length).toBe(s.marcherIds.length);
        }

        // Negative control: move one stored destination (page 1, slot 0) by 50 px and rebuild.
        // The comparison must see it at the page end and inside the pages it touches.
        const [firstTransition] = await db
            .select({ id: schema.timeline_transitions.id })
            .from(schema.timeline_transitions)
            .orderBy(asc(schema.timeline_transitions.start_beat))
            .all();
        const slot = await db
            .select()
            .from(schema.timeline_slot_destinations)
            .where(
                and(
                    eq(
                        schema.timeline_slot_destinations.transition_id,
                        firstTransition!.id,
                    ),
                    eq(schema.timeline_slot_destinations.slot_index, 0),
                ),
            )
            .get();
        await db
            .update(schema.timeline_slot_destinations)
            .set({ x: slot!.x + 50 })
            .where(eq(schema.timeline_slot_destinations.id, slot!.id))
            .run();
        await startTimelineResolver(db);
        const broken = await compareConversion(db, { interiorSamples: 5 });
        expect(broken.pageEnd.max).toBeGreaterThan(1);
        expect(broken.plain.max).toBeGreaterThan(1);
    });
});

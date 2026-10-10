import { afterEach, expect } from "vitest";
import { and, asc, eq, sql } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import {
    keepFixturesInPageMode,
    setTimelineModeFlag,
} from "@/test/timelineMode";
import { createBeats, deleteBeats } from "@/db-functions/beat";
import { createPages, deletePages, updatePages } from "@/db-functions/page";
import {
    createMarchers,
    deleteMarchers,
    updateMarchers,
} from "@/db-functions/marcher";
import { updateMarcherPages } from "@/db-functions/marcherPage";
import { updateUtility } from "@/db-functions/utility";
import {
    performRedo,
    performUndo,
    transactionWithHistory,
} from "@/db-functions/history";
import { TimelineCommitViolationError } from "@/db-functions/timelineChanges";
import { setTimelineRangeInTransaction } from "@/db-functions/timelineTransitionsInTransaction";
import { shiftTimeline, createTrack } from "@/db-functions/timelineCommands";
import { readPageGrid } from "@/db-functions/timelineRipple";
import type { DbTransaction } from "@/db-functions/types";
import {
    convertPagesToTimeline,
    readShowTiming,
} from "../convert/writePageConversion";
import { pageEndBeat } from "../pageEndBeat";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "../timelineStore";
import {
    TIMELINE_LEGACY_CONVERSION_MESSAGE,
    timelineErrorMessage,
} from "../timelineErrorMessages";

keepFixturesInPageMode("builds page shows and converts them itself");
afterEach(() => stopTimelineResolver());

type XY = [number, number];

interface ShowSpec {
    /** Beat durations per page 1..n (the last page's are just the remaining beats) */
    pages: number[][];
    marchers: number;
    /** Extra beats inserted at this position after creation, so ids aren't ordinals */
    insertBeatsAt?: { position: number; count: number };
    lastPageCounts?: number;
    subset?: number[];
    holdPages?: number[];
    /** Add this many marchers after the pages exist */
    addMarchers?: number;
    /** Delete marcher at this index (0-based) after everything */
    deleteMarcherIndex?: number;
    /** Remove this marcher index's row on these page indexes (damaged file) */
    gaps?: [number, number][];
}

const layout = (p: number, i: number): XY => [
    100 + 13.37 * i + 29.1 * Math.sin(p * 1.3 + i),
    200 + 7.77 * p + 31.3 * Math.cos(p * 0.7 + i * 0.4),
];

async function buildShow(db: DbConnection, spec: ShowSpec) {
    const durations = spec.pages.flat();
    if (durations.length > 0)
        await createBeats({
            db,
            newBeats: durations.map((duration) => ({
                duration,
                include_in_measure: true,
            })),
        });
    if (spec.insertBeatsAt)
        await createBeats({
            db,
            newBeats: Array.from({ length: spec.insertBeatsAt.count }, () => ({
                duration: 0.5,
                include_in_measure: true,
            })),
            startingPosition: spec.insertBeatsAt.position,
        });
    const sortedBeats = await db
        .select()
        .from(schema.beats)
        .orderBy(asc(schema.beats.position))
        .all();
    const first = await createMarchers({
        db,
        newMarchers: Array.from({ length: spec.marchers }, (_, i) => ({
            section: "Other",
            drill_prefix: "X",
            drill_order: i + 1,
        })),
    });
    // Page starts: ordinal 1, then cumulative counts (ignoring inserted beats: those just grow pages)
    const starts: number[] = [];
    let ordinal = 1;
    for (const page of spec.pages) {
        starts.push(sortedBeats[ordinal]!.id);
        ordinal += page.length;
    }
    if (starts.length > 0)
        await createPages({
            db,
            newPages: starts.map((start_beat, i) => ({
                start_beat,
                is_subset: spec.subset?.includes(i + 1) ?? false,
            })),
        });
    let all = first.map((m) => m.id);
    if (spec.addMarchers) {
        const added = await createMarchers({
            db,
            newMarchers: Array.from({ length: spec.addMarchers }, (_, i) => ({
                section: "Other",
                drill_prefix: "Y",
                drill_order: i + 1,
            })),
        });
        all = [...all, ...added.map((m) => m.id)];
    }
    const { pages } = await readShowTiming(db);
    const ordered = [...pages].sort((a, b) => a.order - b.order);
    for (const [p, page] of ordered.entries()) {
        const src = spec.holdPages?.includes(p) ? p - 1 : p;
        await updateMarcherPages({
            db,
            modifiedMarcherPages: all.map((marcher_id, i) => {
                const [x, y] = layout(src, i);
                return { marcher_id, page_id: page.id, x, y };
            }),
        });
    }
    if (spec.lastPageCounts !== undefined)
        await updateUtility({
            db,
            args: { last_page_counts: spec.lastPageCounts },
        });
    for (const [i, p] of spec.gaps ?? [])
        await db
            .delete(schema.marcher_pages)
            .where(
                and(
                    eq(schema.marcher_pages.page_id, ordered[p]!.id),
                    eq(schema.marcher_pages.marcher_id, all[i]!),
                ),
            );
    if (spec.deleteMarcherIndex !== undefined)
        await deleteMarchers({
            db,
            marcherIds: new Set([all[spec.deleteMarcherIndex]!]),
        });
}

const resolver = () => {
    const r = useTimelineResolverStore.getState().resolver;
    expect(r).not.toBeNull();
    return r!;
};

/** Page-mode position on a beat axis: linear between page-end keyframes, hold after the last. */
async function pageModeExpectations(db: DbConnection) {
    const { pages } = await readShowTiming(db);
    const ordered = [...pages].sort((a, b) => a.order - b.order);
    const rows = await db.select().from(schema.marcher_pages).all();
    const keyframes = new Map<
        number,
        { beat: number; x: number; y: number }[]
    >();
    for (const page of ordered) {
        const beat = pageEndBeat(page);
        for (const r of rows.filter((r) => r.page_id === page.id)) {
            const list = keyframes.get(r.marcher_id) ?? [];
            list.push({ beat, x: r.x, y: r.y });
            keyframes.set(r.marcher_id, list);
        }
    }
    const lastBeat = Math.max(1, ...ordered.map((p) => pageEndBeat(p)));
    return {
        lastBeat,
        at(marcherId: number, beat: number): XY | null {
            const k = keyframes.get(marcherId);
            if (!k || k.length === 0) return null;
            if (beat <= 1 && k[0]!.beat <= 1) return [k[0]!.x, k[0]!.y];
            if (beat < k[0]!.beat) return null;
            for (let i = 1; i < k.length; i++) {
                const a = k[i - 1]!;
                const b = k[i]!;
                if (beat <= b.beat) {
                    if (b.beat === a.beat) return [b.x, b.y];
                    const t = (beat - a.beat) / (b.beat - a.beat);
                    if (beat === b.beat) return [b.x, b.y];
                    return [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t];
                }
            }
            const l = k[k.length - 1]!;
            return [l.x, l.y];
        },
    };
}

/** Every quarter beat from 0 to the end (+2), every marcher: converted == page mode. */
async function expectQuarterBeatEquality(db: DbConnection) {
    const expected = await pageModeExpectations(db);
    const r = resolver();
    const marchers = await db
        .select({ id: schema.marchers.id })
        .from(schema.marchers)
        .all();
    let checked = 0;
    const failures: string[] = [];
    for (let q = 0; q <= (expected.lastBeat + 2) * 4; q++) {
        const beat = q / 4;
        for (const { id } of marchers) {
            const want = expected.at(id, beat);
            if (!want) continue;
            const [x, y] = r.positionAt(id, beat);
            checked++;
            if (Math.abs(x - want[0]) > 1e-9 || Math.abs(y - want[1]) > 1e-9)
                failures.push(
                    `marcher ${id} beat ${beat}: got ${x},${y} want ${want[0]},${want[1]}`,
                );
        }
    }
    expect(failures.slice(0, 10), `${failures.length} mismatches`).toEqual([]);
    return checked;
}

const commitViolations = async (db: DbConnection) =>
    (
        await db.all<unknown>(
            sql`SELECT code, transition_id, detail FROM timeline_commit_violations`,
        )
    ).map((r) => {
        const v = Array.isArray(r) ? r : Object.values(r as object);
        return {
            code: v[0] as string,
            transition_id: v[1] as number,
            detail: v[2] as string,
        };
    });

/**
 * One timeline per timed page someone moves on, exact range, one spanning transition, one layer-0
 * assignment per marcher that moves there.
 */
async function expectStructure(
    db: DbConnection,
    skippedPageIds: ReadonlySet<number> = new Set(),
) {
    const grid = await readPageGrid(db as unknown as DbTransaction);
    const timelines = await db
        .select()
        .from(schema.timelines)
        .orderBy(asc(schema.timelines.start_beat))
        .all();
    const transitions = await db
        .select()
        .from(schema.timeline_transitions)
        .all();
    const assignments = await db
        .select()
        .from(schema.timeline_assignments)
        .all();
    const destinations = await db
        .select()
        .from(schema.timeline_slot_destinations)
        .all();

    const expectedRanges = grid.pages
        .slice(1)
        .filter((p) => p.end > p.start && !skippedPageIds.has(p.id))
        .map((p) => [p.start, p.end]);
    expect(timelines.map((t) => [t.start_beat, t.end_beat])).toEqual(
        expectedRanges,
    );
    // Page grid (UI-9 flags): previous page's end == this page's start
    for (let i = 2; i < grid.pages.length; i++)
        expect(grid.pages[i]!.start).toBe(grid.pages[i - 1]!.end);
    expect(timelines.some((t) => t.start_beat === 0)).toBe(false);
    expect(
        new Set(timelines.map((t) => `${t.start_beat}-${t.end_beat}`)).size,
    ).toBe(timelines.length);
    for (const l of timelines) {
        const own = transitions.filter((t) => t.timeline_id === l.id);
        expect(own.length, `timeline ${l.id}`).toBe(1);
        const t = own[0]!;
        expect([t.start_beat, t.end_beat]).toEqual([l.start_beat, l.end_beat]);
        expect(t.dest_shape_id).toBeNull();
        expect(t.path_style).toBe("direct");
        const as = assignments.filter((a) => a.transition_id === t.id);
        expect(as.length).toBe(t.slot_count);
        expect(new Set(as.map((a) => a.marcher_id)).size).toBe(as.length);
        for (const a of as) {
            expect(a.layer).toBe(0);
            expect([a.start_beat, a.end_beat]).toEqual([
                l.start_beat,
                l.end_beat,
            ]);
        }
        expect(
            destinations.filter((d) => d.transition_id === t.id).length,
        ).toBe(t.slot_count);
    }
    expect(await commitViolations(db)).toEqual([]);
    return timelines;
}

async function convertAndCheck(db: DbConnection) {
    await setTimelineModeFlag(db, true);
    const result = await convertPagesToTimeline(db);
    // Skipped pages, and pages where nobody moves (C-12), have no timeline
    const withoutTimeline = new Set(
        result.report.pages
            .filter((p) => !result.timelineIds.has(p.pageId))
            .map((p) => p.pageId),
    );
    expect(
        result.report.pages.filter(
            (p) => p.skipped !== null && result.timelineIds.has(p.pageId),
        ),
    ).toEqual([]);
    const timelines = await expectStructure(db, withoutTimeline);
    await startTimelineResolver(db);
    expect(resolver().diagnostics()).toEqual([]);
    const checked = await expectQuarterBeatEquality(db);
    return { result, timelines, checked };
}

const Q = 0.5;

describeDbTests("P9.10 adversarial", (it) => {
    it("homes only (page 0 only): no timelines", async ({ db }) => {
        await buildShow(db, { pages: [], marchers: 4 });
        const { timelines, checked } = await convertAndCheck(db);
        expect(timelines).toEqual([]);
        expect(checked).toBeGreaterThan(0);
    });

    it("2 pages", async ({ db }) => {
        await buildShow(db, { pages: [Array(8).fill(Q)], marchers: 5 });
        const { timelines } = await convertAndCheck(db);
        expect(timelines.map((t) => [t.start_beat, t.end_beat])).toEqual([
            [1, 9],
        ]);
    });

    it("many pages, tempo changes, 1-count pages, held pages, subsets", async ({
        db,
    }) => {
        await buildShow(db, {
            pages: [
                Array(8).fill(Q),
                [Q],
                Array(4).fill(0.6),
                [0.3, 0.4, 0.5, 0.6, 0.7],
                [0.45],
                Array(16).fill(Q),
                [Q],
                Array(3).fill(0.4),
                Array(8).fill(Q),
            ],
            marchers: 9,
            subset: [2, 3, 7],
            holdPages: [3, 6],
            lastPageCounts: 8,
        });
        const { timelines, result } = await convertAndCheck(db);
        // Held pages 3 and 6 copy the page before: nobody moves there, so they get no timeline
        // (C-12), and that isn't reported as a loss
        expect(timelines.length).toBe(7);
        expect(result.report.pages.every((p) => p.skipped === null)).toBe(true);
    });

    it("non-ordinal beat ids", async ({ db }) => {
        await buildShow(db, {
            pages: [Array(8).fill(Q), Array(8).fill(Q), Array(4).fill(Q)],
            marchers: 6,
            insertBeatsAt: { position: 3, count: 5 },
        });
        const beats = await db
            .select()
            .from(schema.beats)
            .orderBy(asc(schema.beats.position))
            .all();
        expect(beats.some((b, i) => b.id !== i)).toBe(true);
        await convertAndCheck(db);
    });

    it("last_page_counts larger than remaining beats", async ({ db }) => {
        await buildShow(db, {
            pages: [Array(8).fill(Q), Array(3).fill(Q)],
            marchers: 4,
            lastPageCounts: 50,
        });
        const { timelines } = await convertAndCheck(db);
        const grid = await readPageGrid(db as unknown as DbTransaction);
        expect(timelines.at(-1)!.end_beat).toBe(grid.pages.at(-1)!.end);
    });

    it("last page on the final beat (1 count)", async ({ db }) => {
        await buildShow(db, {
            pages: [Array(4).fill(Q), [Q]],
            marchers: 3,
            lastPageCounts: 8,
        });
        await convertAndCheck(db);
    });

    it("marchers added after pages, one deleted, damaged gaps", async ({
        db,
    }) => {
        await buildShow(db, {
            pages: [
                Array(4).fill(Q),
                Array(4).fill(Q),
                Array(4).fill(Q),
                Array(4).fill(Q),
            ],
            marchers: 5,
            addMarchers: 3,
            deleteMarcherIndex: 2,
            gaps: [
                [0, 2],
                [1, 2],
                [1, 3],
                [6, 4],
            ],
        });
        await convertAndCheck(db);
    });

    it("a page where no marcher has a row gets no timeline", async ({ db }) => {
        await buildShow(db, {
            pages: [Array(4).fill(Q), Array(4).fill(Q), Array(4).fill(Q)],
            marchers: 2,
            gaps: [
                [0, 2],
                [1, 2],
            ],
        });
        await convertAndCheck(db);
    });

    it("trailing pages with no rows at all get no timeline", async ({ db }) => {
        await buildShow(db, {
            pages: [Array(4).fill(Q), Array(4).fill(Q), Array(4).fill(Q)],
            marchers: 2,
            gaps: [
                [0, 2],
                [1, 2],
                [0, 3],
                [1, 3],
            ],
        });
        const { timelines, result } = await convertAndCheck(db);
        expect(result.report.pages.filter((p) => p.skipped).length).toBe(2);
        expect(timelines.map((t) => [t.start_beat, t.end_beat])).toEqual([
            [1, 5],
        ]);
    });

    // ------------------------------------------------------------------ E-T1

    it("E-T1: an edit leaving a transition range != its timeline fails at commit", async ({
        db,
    }) => {
        await buildShow(db, {
            pages: [Array(8).fill(Q), Array(8).fill(Q)],
            marchers: 3,
        });
        await setTimelineModeFlag(db, true);
        await convertPagesToTimeline(db);
        const [l] = await db
            .select()
            .from(schema.timelines)
            .orderBy(asc(schema.timelines.id))
            .all();
        const before = await db.select().from(schema.timelines).all();
        // grow the timeline only
        const err = await transactionWithHistory(db, "growOnly", async (tx) => {
            await tx
                .update(schema.timelines)
                .set({ end_beat: l!.end_beat + 2 })
                .where(eq(schema.timelines.id, l!.id));
        }).catch((e) => e);
        expect(err).toBeInstanceOf(TimelineCommitViolationError);
        expect((err as TimelineCommitViolationError).code).toBe("E-T1");
        expect(await db.select().from(schema.timelines).all()).toEqual(before);

        // Intermediate unequal states that end equal pass (D-17)
        await transactionWithHistory(db, "growThenSettle", async (tx) => {
            await tx
                .update(schema.timelines)
                .set({ start_beat: l!.start_beat, end_beat: l!.end_beat + 3 })
                .where(eq(schema.timelines.id, l!.id));
            await tx
                .update(schema.timelines)
                .set({ end_beat: l!.end_beat })
                .where(eq(schema.timelines.id, l!.id));
        });
        expect(await commitViolations(db)).toEqual([]);
    });

    it("shift, range edit, ripple (insert/delete beats, add/move/delete pages), createTrack keep C-11", async ({
        db,
    }) => {
        await buildShow(db, {
            pages: [
                Array(8).fill(Q),
                Array(8).fill(Q),
                Array(8).fill(Q),
                Array(8).fill(Q),
            ],
            marchers: 4,
        });
        await setTimelineModeFlag(db, true);
        await convertPagesToTimeline(db);
        const ids = (
            await db
                .select()
                .from(schema.timelines)
                .orderBy(asc(schema.timelines.start_beat))
                .all()
        ).map((t) => t.id);

        // Range edit of the last page's timeline (grow at the end, then back)
        await transactionWithHistory(db, "range", (tx) =>
            setTimelineRangeInTransaction({
                tx,
                timelineId: ids[3]!,
                start: 26,
                end: 40,
            }),
        );
        expect(await commitViolations(db)).toEqual([]);
        const t3 = await db
            .select()
            .from(schema.timeline_transitions)
            .where(eq(schema.timeline_transitions.timeline_id, ids[3]!))
            .all();
        expect(t3.map((t) => [t.start_beat, t.end_beat])).toEqual([[26, 40]]);
        await transactionWithHistory(db, "rangeBack", (tx) =>
            setTimelineRangeInTransaction({
                tx,
                timelineId: ids[3]!,
                start: 25,
                end: 33,
            }),
        );
        // Shift the last timeline later and back
        await shiftTimeline({ db, timelineId: ids[3]!, delta: 5 });
        await shiftTimeline({ db, timelineId: ids[3]!, delta: -5 });
        expect(await commitViolations(db)).toEqual([]);
        await expectStructure(db);

        // Ripple: insert beats inside page 2
        await createBeats({
            db,
            newBeats: [
                { duration: Q, include_in_measure: true },
                { duration: Q, include_in_measure: true },
            ],
            startingPosition: 12,
        });
        await expectStructure(db);
        // Delete a beat inside page 3
        const beats = await db
            .select()
            .from(schema.beats)
            .orderBy(asc(schema.beats.position))
            .all();
        await deleteBeats({ db, beatIds: new Set([beats[22]!.id]) });
        await expectStructure(db);
        // Move page 3's start (resize pages 2 and 3)
        const { pages } = await readShowTiming(db);
        const ordered = [...pages].sort((a, b) => a.order - b.order);
        const beats2 = await db
            .select()
            .from(schema.beats)
            .orderBy(asc(schema.beats.position))
            .all();
        await updatePages({
            db,
            modifiedPages: [
                {
                    id: ordered[3]!.id,
                    start_beat: beats2[pageEndBeat(ordered[2]!) + 2]!.id,
                },
            ],
        });
        await expectStructure(db);
        // Add a page splitting page 1: nobody moves on the new page, so it gets no timeline
        const [split] = await createPages({
            db,
            newPages: [{ start_beat: beats2[5]!.id, is_subset: true }],
        });
        const grid = await readPageGrid(db as unknown as DbTransaction);
        const tls = await db
            .select()
            .from(schema.timelines)
            .orderBy(asc(schema.timelines.start_beat))
            .all();
        expect(tls.map((t) => [t.start_beat, t.end_beat])).toEqual(
            grid.pages
                .slice(1)
                .filter((p) => p.id !== split!.id)
                .map((p) => [p.start, p.end]),
        );
        expect(await commitViolations(db)).toEqual([]);
        // Delete page 2 (the split-off page): page 1 stretches back over it
        const after = [...(await readShowTiming(db)).pages].sort(
            (a, b) => a.order - b.order,
        );
        await deletePages({ db, pageIds: new Set([after[2]!.id]) });
        const grid2 = await readPageGrid(db as unknown as DbTransaction);
        const tls2 = await db
            .select()
            .from(schema.timelines)
            .orderBy(asc(schema.timelines.start_beat))
            .all();
        expect(tls2.map((t) => [t.start_beat, t.end_beat])).toEqual(
            grid2.pages.slice(1).map((p) => [p.start, p.end]),
        );
        expect(await commitViolations(db)).toEqual([]);
        // createTrack
        const m = await db.select().from(schema.marchers).all();
        await createTrack({
            db,
            target: { kind: "marcher", marcherId: m[0]!.id },
            startBeat: 3,
            endBeat: 6,
        } as never).catch((e) => {
            // signature may differ; report
            throw e;
        });
        expect(await commitViolations(db)).toEqual([]);
    });

    it("undo/redo of conversion and of a ripple keep C-11", async ({ db }) => {
        await buildShow(db, {
            pages: [Array(4).fill(Q), Array(6).fill(Q), Array(4).fill(Q)],
            marchers: 3,
        });
        await setTimelineModeFlag(db, true);
        await convertPagesToTimeline(db);
        const snap = await db.select().from(schema.timelines).all();
        let r = await performUndo(db);
        expect(r.success, r.error?.message).toBe(true);
        expect(await db.select().from(schema.timelines).all()).toEqual([]);
        r = await performRedo(db);
        expect(r.success, r.error?.message).toBe(true);
        expect(await db.select().from(schema.timelines).all()).toEqual(snap);
        await expectStructure(db);
        const pages = [...(await readShowTiming(db)).pages].sort(
            (a, b) => a.order - b.order,
        );
        await deletePages({ db, pageIds: new Set([pages[2]!.id]) });
        await expectStructure(db);
        r = await performUndo(db);
        expect(r.success, r.error?.message).toBe(true);
        expect(await db.select().from(schema.timelines).all()).toEqual(snap);
        expect(await commitViolations(db)).toEqual([]);
        r = await performRedo(db);
        expect(r.success, r.error?.message).toBe(true);
        await expectStructure(db);
    });

    it("after conversion: delete first/last page, change last_page_counts, delete a marcher, add a last page", async ({
        db,
    }) => {
        await buildShow(db, {
            pages: [
                Array(4).fill(Q),
                Array(6).fill(Q),
                Array(4).fill(Q),
                Array(8).fill(Q),
            ],
            marchers: 4,
            lastPageCounts: 4,
        });
        await setTimelineModeFlag(db, true);
        await convertPagesToTimeline(db);
        const gridMatches = async (
            label: string,
            withoutTimeline: ReadonlySet<number> = new Set(),
        ) => {
            const grid = await readPageGrid(db as unknown as DbTransaction);
            const tls = await db
                .select()
                .from(schema.timelines)
                .orderBy(asc(schema.timelines.start_beat))
                .all();
            expect(
                tls.map((t) => [t.start_beat, t.end_beat]),
                label,
            ).toEqual(
                grid.pages
                    .slice(1)
                    .filter(
                        (p) => p.end > p.start && !withoutTimeline.has(p.id),
                    )
                    .map((p) => [p.start, p.end]),
            );
            expect(await commitViolations(db), label).toEqual([]);
        };
        await gridMatches("converted");
        await updateUtility({ db, args: { last_page_counts: 7 } });
        await gridMatches("last_page_counts 7");
        await updateUtility({ db, args: { last_page_counts: 2 } });
        await gridMatches("last_page_counts 2");
        let pages = [...(await readShowTiming(db)).pages].sort(
            (a, b) => a.order - b.order,
        );
        await deletePages({ db, pageIds: new Set([pages.at(-1)!.id]) });
        await gridMatches("delete last page");
        pages = [...(await readShowTiming(db)).pages].sort(
            (a, b) => a.order - b.order,
        );
        const err = await deletePages({
            db,
            pageIds: new Set([pages[1]!.id]),
        }).catch((e) => e);
        expect(err === undefined || !(err instanceof Error), String(err)).toBe(
            true,
        );
        await gridMatches("delete page 1");
        const m = await db.select().from(schema.marchers).all();
        await deleteMarchers({ db, marcherIds: new Set([m[1]!.id]) });
        await gridMatches("delete marcher");
        await expectStructure(db);
        const beats = await db
            .select()
            .from(schema.beats)
            .orderBy(asc(schema.beats.position))
            .all();
        // Nobody moves on the new page, so it gets no timeline (C-12)
        const [added] = await createPages({
            db,
            newPages: [{ start_beat: beats.at(-2)!.id, is_subset: false }],
        });
        await gridMatches("add page near end", new Set([added!.id]));
    });

    // ------------------------------------------------------------------ legacy layout

    it("legacy show-wide layout: replace repairs it; ordinary edits fail E-T1", async ({
        db,
    }) => {
        await buildShow(db, {
            pages: [Array(8).fill(Q), Array(8).fill(Q), Array(4).fill(Q)],
            marchers: 4,
        });
        await setTimelineModeFlag(db, true);
        await convertPagesToTimeline(db);
        // Rebuild the OLD layout by raw SQL: one timeline [0, N) owning every transition
        const tls = await db
            .select()
            .from(schema.timelines)
            .orderBy(asc(schema.timelines.start_beat))
            .all();
        const N = tls.at(-1)!.end_beat;
        await db.run(
            sql`UPDATE timelines SET start_beat = 0, end_beat = ${N}, name = 'Converted from pages' WHERE id = ${tls[0]!.id}`,
        );
        await db.run(
            sql`UPDATE timeline_transitions SET timeline_id = ${tls[0]!.id}`,
        );
        await db.run(sql`DELETE FROM timelines WHERE id <> ${tls[0]!.id}`);
        expect((await db.select().from(schema.timelines).all()).length).toBe(1);
        const legacyViolations = await commitViolations(db);
        expect(legacyViolations.map((v) => v.code)).toEqual([
            "E-T1",
            "E-T1",
            "E-T1",
        ]);

        // Ordinary (non-timeline) edit on the legacy file
        const m = await db.select().from(schema.marchers).all();
        const err = await updateMarchers({
            db,
            modifiedMarchers: [{ id: m[0]!.id, name: "Renamed" }],
        }).catch((e) => e);
        // An unrelated edit (marcher rename) on a legacy-layout file is refused: the commit check
        // reads the whole database. Auto-repair on open waits on the project owner.
        expect((err as Error).message).toMatch(
            /^E-T1: transition \d+: transition spans/,
        );
        // The toast says the file needs converting again
        expect(timelineErrorMessage(err, { translate: (_k, d) => d })).toBe(
            TIMELINE_LEGACY_CONVERSION_MESSAGE.defaultMessage,
        );
        const errShift = await shiftTimeline({
            db,
            timelineId: tls[0]!.id,
            delta: 1,
        }).catch((e) => e);
        expect(errShift).toBeInstanceOf(TimelineCommitViolationError);

        // Resolver on the legacy file
        await startTimelineResolver(db);
        await timelineResolverSettled();

        // Replace repairs
        await convertPagesToTimeline(db, { replace: true });
        await expectStructure(db);
        await startTimelineResolver(db);
        await expectQuarterBeatEquality(db);
        expect(err).toBeInstanceOf(TimelineCommitViolationError);
    });
});

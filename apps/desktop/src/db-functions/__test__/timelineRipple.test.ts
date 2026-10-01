import { afterEach, describe, expect } from "vitest";
import { asc, eq, getTableName, sql } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import type Page from "@/global/classes/Page";
import {
    convertPagesToTimeline,
    readShowTiming,
} from "@/timeline/convert/writePageConversion";
import { pageEndBeat } from "@/timeline/timelineCanvas";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import { performRedo, performUndo, transactionWithHistory } from "../history";
import { updateTimelineAssignmentsInTransaction } from "../timelineAssignments";
import {
    createBeats,
    createBeatsInTransaction,
    deleteBeats,
    deleteBeatsInTransaction,
    NewBeatArgs,
} from "../beat";
import { deleteMeasuresInTransaction } from "../measures";
import { _replaceAllBeatObjects } from "@/components/timeline/audio/EditableAudioPlayerUtils";
import {
    createLastPage,
    createPages,
    deletePages,
    deletePagesInTransaction,
    deletePageYank,
    ensureSecondBeatHasPage,
    updatePages,
} from "../page";
import { updateUtility } from "../utility";
import { createTrack } from "../timelineCommands";
import { readPageGrid, withTimelinePageRipple } from "../timelineRipple";
import { TimelineWriteError } from "../timelineErrors";
import { keepFixturesInPageMode } from "@/test/timelineMode";

// P7.17: these tests set up timeline mode themselves
keepFixturesInPageMode(
    "its tests convert the show or write timeline rows, and set the flag, themselves",
);

/**
 * Page and beat ripple in timeline mode (docs/timeline/phases/07-page-parity.md P7.4, P7.5), on a
 * converted `marchersAndPages` show: beat 0, 96 beats of 0.5 s, page 0 plus pages 1 to 6 starting
 * at beats 1, 9, 17, 25, 33 and 41 (8 counts each), one shapeless direct transition per page
 * N ≥ 1 over `[start, end)`, every marcher with one layer-0 assignment over it. Beat ids equal
 * their positions and ordinals here.
 */

afterEach(() => stopTimelineResolver());

const TABLES = [
    schema.beats,
    schema.pages,
    schema.utility,
    schema.marchers,
    schema.timelines,
    schema.timeline_shapes,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
];

const TIMELINE_TABLES = [
    schema.timelines,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
];

const snapshot = async (db: DbConnection, tables = TABLES) => {
    const out: Record<string, unknown[]> = {};
    for (const table of tables)
        out[getTableName(table)] = await db.select().from(table).all();
    return out;
};

const resolver = () => {
    const r = useTimelineResolverStore.getState().resolver;
    expect(r, "the resolver store is ready").not.toBeNull();
    return r!;
};

const setTimelineFlag = async (db: DbConnection, on: boolean) => {
    await db.delete(schema.workspace_settings);
    await db.insert(schema.workspace_settings).values({
        id: 1,
        json_data: JSON.stringify({ timelineMode: on }),
    });
};

const pagesInOrder = async (db: DbConnection): Promise<Page[]> => {
    const { pages } = await readShowTiming(db);
    return [...pages].sort((a, b) => a.order - b.order);
};

/** Converts the show with the flag on (or off), starts the store, and returns the pages. */
const setUp = async (db: DbConnection, flag = true): Promise<Page[]> => {
    await setTimelineFlag(db, flag);
    await convertPagesToTimeline(db);
    await startTimelineResolver(db);
    return await pagesInOrder(db);
};

type XY = [number, number];

/** Every marcher's position at the end of each page ≥ 1, by page id then marcher id. */
const pageEnds = (pages: readonly Page[]) => {
    const r = resolver();
    const out = new Map<number, Map<number, XY>>();
    for (const p of pages) {
        if (p.id === 0) continue;
        const byMarcher = new Map<number, XY>();
        for (const id of r.marcherIds())
            byMarcher.set(id, r.positionAt(id, pageEndBeat(p)) as XY);
        out.set(p.id, byMarcher);
    }
    return out;
};

/** The page ends in `after` are bit for bit those in `before`, for every page in both. */
const expectSamePageEnds = (
    before: Map<number, Map<number, XY>>,
    after: Map<number, Map<number, XY>>,
    { only }: { only?: readonly number[] } = {},
) => {
    let compared = 0;
    for (const [pageId, positions] of before) {
        if (only && !only.includes(pageId)) continue;
        const now = after.get(pageId);
        if (!now) continue;
        for (const [id, [x, y]] of positions) {
            const [nx, ny] = now.get(id)!;
            expect(Object.is(nx, x), `page ${pageId} marcher ${id} x`).toBe(
                true,
            );
            expect(Object.is(ny, y), `page ${pageId} marcher ${id} y`).toBe(
                true,
            );
            compared++;
        }
    }
    expect(compared).toBeGreaterThan(0);
};

const violations = async (db: DbConnection) =>
    await db.all(
        sql`SELECT code, transition_id, detail FROM timeline_commit_violations`,
    );

const transitions = async (db: DbConnection) =>
    await db
        .select()
        .from(schema.timeline_transitions)
        .orderBy(
            asc(schema.timeline_transitions.start_beat),
            asc(schema.timeline_transitions.id),
        )
        .all();

const ranges = async (db: DbConnection) =>
    (await transitions(db)).map(
        (t) => [t.start_beat, t.end_beat] as [number, number],
    );

const pageRanges = (pages: readonly Page[]) =>
    pages
        .filter((p) => p.id !== 0)
        .map((p) => [p.beats[0]!.index, pageEndBeat(p)] as [number, number]);

/** Every assignment covers its whole transition (the converter's page moves). */
const expectAssignmentsCoverTransitions = async (db: DbConnection) => {
    const ts = new Map((await transitions(db)).map((t) => [t.id, t]));
    for (const a of await db.select().from(schema.timeline_assignments).all()) {
        const t = ts.get(a.transition_id)!;
        expect([a.start_beat, a.end_beat]).toEqual([t.start_beat, t.end_beat]);
    }
};

const timeline = async (db: DbConnection) =>
    await db.select().from(schema.timelines).all();

const roundTrip = async (
    db: DbConnection,
    before: Record<string, unknown[]>,
    after: Record<string, unknown[]>,
) => {
    const undo = await performUndo(db);
    expect(undo.success, undo.error?.message).toBe(true);
    expect(await snapshot(db)).toEqual(before);
    expect(await violations(db)).toEqual([]);
    await timelineResolverSettled();

    const redo = await performRedo(db);
    expect(redo.success, redo.error?.message).toBe(true);
    expect(await snapshot(db)).toEqual(after);
    expect(await violations(db)).toEqual([]);
    await timelineResolverSettled();
};

const BEAT: NewBeatArgs = { duration: 0.5, include_in_measure: true };

const ORIGINAL = [
    [1, 9],
    [9, 17],
    [17, 25],
    [25, 33],
    [33, 41],
    [41, 49],
];

describeDbTests("page and beat ripple in timeline mode", (it) => {
    it("reads the page grid as the app builds pages", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const grid = await db.transaction((tx) => readPageGrid(tx));
        expect(grid.pages.map((p) => [p.id, p.start, p.end])).toEqual(
            pages.map((p) => [p.id, p.beats[0]!.index, pageEndBeat(p)]),
        );
        expect(await ranges(db)).toEqual(ORIGINAL);
        expect(await timeline(db)).toMatchObject([
            { start_beat: 0, end_beat: 49 },
        ]);
    });

    describe("beat insert (P7.5)", () => {
        it("inside a move: the move grows, later moves shift, page ends stay on the destinations", async ({
            db,
            marchersAndPages: _,
        }) => {
            const pages = await setUp(db);
            const endsBefore = pageEnds(pages);
            // Halfway through page 2's move, in time
            const midBefore = new Map(
                resolver()
                    .marcherIds()
                    .map((id) => [id, resolver().positionAt(id, 13)]),
            );
            const before = await snapshot(db);

            // Two beats after beat 12: they become beats 13 and 14, inside page 2 [9, 17)
            await createBeats({
                db,
                newBeats: [BEAT, BEAT],
                startingPosition: 12,
            });
            await timelineResolverSettled();

            const pagesAfter = await pagesInOrder(db);
            expect(await ranges(db)).toEqual([
                [1, 9],
                [9, 19],
                [19, 27],
                [27, 35],
                [35, 43],
                [43, 51],
            ]);
            expect(await ranges(db)).toEqual(pageRanges(pagesAfter));
            await expectAssignmentsCoverTransitions(db);
            expect(await timeline(db)).toMatchObject([
                { start_beat: 0, end_beat: 51 },
            ]);
            expectSamePageEnds(endsBefore, pageEnds(pagesAfter));
            // Page mode spreads page 2's move over its 10 beats: halfway is now beat 14
            for (const [id, [x, y]] of midBefore) {
                const [nx, ny] = resolver().positionAt(id, 14);
                expect(nx).toBeCloseTo(x, 9);
                expect(ny).toBeCloseTo(y, 9);
            }
            expect(await violations(db)).toEqual([]);

            await roundTrip(db, before, await snapshot(db));
        });

        it("before a move: only the moves after it shift; on a page boundary the earlier page grows", async ({
            db,
            marchersAndPages: _,
        }) => {
            const pages = await setUp(db);
            const endsBefore = pageEnds(pages);
            const before = await snapshot(db);

            // One beat after beat 16, the last beat of page 2: page mode gives it to page 2
            await createBeats({ db, newBeats: [BEAT], startingPosition: 16 });
            await timelineResolverSettled();

            const pagesAfter = await pagesInOrder(db);
            expect(await ranges(db)).toEqual([
                [1, 9],
                [9, 18],
                [18, 26],
                [26, 34],
                [34, 42],
                [42, 50],
            ]);
            expect(await ranges(db)).toEqual(pageRanges(pagesAfter));
            await expectAssignmentsCoverTransitions(db);
            expectSamePageEnds(endsBefore, pageEnds(pagesAfter));
            await roundTrip(db, before, await snapshot(db));
        });

        it("right after beat 0: page 1 takes the new beat, as page mode does", async ({
            db,
            marchersAndPages: _,
        }) => {
            const pages = await setUp(db);
            const endsBefore = pageEnds(pages);
            const before = await snapshot(db);

            await createBeats({ db, newBeats: [BEAT], startingPosition: 0 });
            await timelineResolverSettled();

            const pagesAfter = await pagesInOrder(db);
            expect(await ranges(db)).toEqual(pageRanges(pagesAfter));
            expect((await ranges(db))[0]).toEqual([1, 10]);
            await expectAssignmentsCoverTransitions(db);
            expectSamePageEnds(endsBefore, pageEnds(pagesAfter));
            await roundTrip(db, before, await snapshot(db));
        });

        it("after the last move: no timeline row changes", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            const timelineBefore = await snapshot(db, TIMELINE_TABLES);
            const before = await snapshot(db);
            await createBeats({ db, newBeats: [BEAT, BEAT] });
            expect(await snapshot(db, TIMELINE_TABLES)).toEqual(timelineBefore);
            await roundTrip(db, before, await snapshot(db));
        });

        it("grows a track that strictly contains the new beat and leaves one ending there alone", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            // Steals inside page 2: [10, 14) contains beat 13; [11, 13) ends where it lands
            const grows = await createTrack({
                db,
                target: { kind: "marcher", marcherId: 1 },
                startBeat: 10,
                endBeat: 14,
            });
            const stays = await createTrack({
                db,
                target: { kind: "marcher", marcherId: 2 },
                startBeat: 11,
                endBeat: 13,
            });
            const before = await snapshot(db);
            await createBeats({ db, newBeats: [BEAT], startingPosition: 12 });
            const byId = new Map((await transitions(db)).map((t) => [t.id, t]));
            expect(byId.get(grows.transitionId)).toMatchObject({
                start_beat: 10,
                end_beat: 15,
            });
            expect(byId.get(stays.transitionId)).toMatchObject({
                start_beat: 11,
                end_beat: 13,
            });
            const tls = new Map((await timeline(db)).map((l) => [l.id, l]));
            expect(tls.get(grows.timelineId)).toMatchObject({
                start_beat: 10,
                end_beat: 15,
            });
            expect(await violations(db)).toEqual([]);
            await roundTrip(db, before, await snapshot(db));
        });
    });

    describe("beat delete (P7.5)", () => {
        it("inside a move: the move shrinks, later moves shift, page ends stay on the destinations", async ({
            db,
            marchersAndPages: _,
        }) => {
            const pages = await setUp(db);
            const endsBefore = pageEnds(pages);
            const before = await snapshot(db);

            await deleteBeats({ db, beatIds: new Set([11, 12]) });
            await timelineResolverSettled();

            const pagesAfter = await pagesInOrder(db);
            expect(await ranges(db)).toEqual([
                [1, 9],
                [9, 15],
                [15, 23],
                [23, 31],
                [31, 39],
                [39, 47],
            ]);
            expect(await ranges(db)).toEqual(pageRanges(pagesAfter));
            await expectAssignmentsCoverTransitions(db);
            expectSamePageEnds(endsBefore, pageEnds(pagesAfter));
            expect(await violations(db)).toEqual([]);
            await roundTrip(db, before, await snapshot(db));
        });

        it("refuses to leave a track with no beats, and writes nothing", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            await createTrack({
                db,
                target: { kind: "marcher", marcherId: 1 },
                startBeat: 11,
                endBeat: 13,
            });
            const before = await snapshot(db);
            const error = await deleteBeats({
                db,
                beatIds: new Set([11, 12]),
            }).catch((e: unknown) => e);
            expect(error).toBeInstanceOf(TimelineWriteError);
            expect((error as TimelineWriteError).code).toBe("E-ARGS");
            expect(await snapshot(db)).toEqual(before);
        });

        it("refuses to strand a part outside its move (E-A1), and writes nothing", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            // Marcher 1's part in page 2's move ends on beat 15, two beats before the move
            const page2 = (await transitions(db))[1]!;
            const part = (await db
                .select()
                .from(schema.timeline_assignments)
                .where(eq(schema.timeline_assignments.transition_id, page2.id))
                .all()
                .then((rows) => rows.find((r) => r.marcher_id === 1)))!;
            await transactionWithHistory(db, "shorten", (tx) =>
                updateTimelineAssignmentsInTransaction({
                    tx,
                    modifiedAssignments: [{ id: part.id, endBeat: 15 }],
                }),
            );
            const before = await snapshot(db);
            // Splitting page 2 at beat 13 ends its move there; the part would stick out
            const error = await createPages({
                db,
                newPages: [{ start_beat: 13, is_subset: false }],
            }).catch((e: unknown) => e);
            expect(error).toBeInstanceOf(TimelineWriteError);
            expect((error as TimelineWriteError).code).toBe("E-A1");
            expect(await snapshot(db)).toEqual(before);
        });
    });

    describe("page resize (P7.4)", () => {
        it("moving a boundary later: the move ending there grows, the next one shrinks, nothing else moves", async ({
            db,
            marchersAndPages: _,
        }) => {
            const pages = await setUp(db);
            const endsBefore = pageEnds(pages);
            const before = await snapshot(db);

            // Page 3 starts on beat 19 instead of 17
            await updatePages({
                db,
                modifiedPages: [{ id: 3, start_beat: 19 }],
            });
            await timelineResolverSettled();

            const pagesAfter = await pagesInOrder(db);
            expect(await ranges(db)).toEqual([
                [1, 9],
                [9, 19],
                [19, 25],
                [25, 33],
                [33, 41],
                [41, 49],
            ]);
            expect(await ranges(db)).toEqual(pageRanges(pagesAfter));
            await expectAssignmentsCoverTransitions(db);
            expectSamePageEnds(endsBefore, pageEnds(pagesAfter));
            await roundTrip(db, before, await snapshot(db));
        });

        it("moving a boundary earlier, and the last page's counts", async ({
            db,
            marchersAndPages: _,
        }) => {
            const pages = await setUp(db);
            const endsBefore = pageEnds(pages);
            const before = await snapshot(db);

            await updatePages({
                db,
                modifiedPages: [{ id: 3, start_beat: 14 }],
            });
            const middle = await snapshot(db);
            expect(await ranges(db)).toEqual([
                [1, 9],
                [9, 14],
                [14, 25],
                [25, 33],
                [33, 41],
                [41, 49],
            ]);
            await timelineResolverSettled();
            expectSamePageEnds(endsBefore, pageEnds(await pagesInOrder(db)));

            // The last page runs 4 counts instead of 8
            await updateUtility({ db, args: { last_page_counts: 4 } });
            await timelineResolverSettled();
            const pagesAfter = await pagesInOrder(db);
            expect((await ranges(db))[5]).toEqual([41, 45]);
            expect(await ranges(db)).toEqual(pageRanges(pagesAfter));
            expect(await timeline(db)).toMatchObject([
                { start_beat: 0, end_beat: 45 },
            ]);
            await expectAssignmentsCoverTransitions(db);
            expectSamePageEnds(endsBefore, pageEnds(pagesAfter));

            await roundTrip(db, middle, await snapshot(db));
            const undo = await performUndo(db);
            expect(undo.success).toBe(true);
            const undo2 = await performUndo(db);
            expect(undo2.success).toBe(true);
            expect(await snapshot(db)).toEqual(before);
        });
    });

    describe("page insert and delete (P7.4)", () => {
        it("splitting a page: the move finishes at the split, then a holding move to the old page end", async ({
            db,
            marchersAndPages: _,
        }) => {
            const pages = await setUp(db);
            const endsBefore = pageEnds(pages);
            const before = await snapshot(db);

            const [created] = await createPages({
                db,
                newPages: [{ start_beat: 13, is_subset: false }],
            });
            await timelineResolverSettled();

            const pagesAfter = await pagesInOrder(db);
            expect(await ranges(db)).toEqual([
                [1, 9],
                [9, 13],
                [13, 17],
                [17, 25],
                [25, 33],
                [33, 41],
                [41, 49],
            ]);
            expect(await ranges(db)).toEqual(pageRanges(pagesAfter));
            await expectAssignmentsCoverTransitions(db);
            // Every page keeps its positions; the new page holds page 2's
            const endsAfter = pageEnds(pagesAfter);
            expectSamePageEnds(endsBefore, endsAfter);
            const page2 = endsBefore.get(2)!;
            for (const [id, [x, y]] of endsAfter.get(created!.id)!) {
                expect(Object.is(x, page2.get(id)![0])).toBe(true);
                expect(Object.is(y, page2.get(id)![1])).toBe(true);
            }
            // The holding move has a slot for every marcher, as the page moves do
            const hold = (await transitions(db))[2]!;
            expect(hold.slot_count).toBe(
                (await transitions(db))[1]!.slot_count,
            );
            expect(await violations(db)).toEqual([]);
            await roundTrip(db, before, await snapshot(db));
        });

        it("adding a last page: a holding move after the last one, in the grown timeline", async ({
            db,
            marchersAndPages: _,
        }) => {
            const pages = await setUp(db);
            const endsBefore = pageEnds(pages);
            const before = await snapshot(db);

            const created = await createLastPage({ db, newPageCounts: 8 });
            await timelineResolverSettled();

            const pagesAfter = await pagesInOrder(db);
            expect(await ranges(db)).toEqual(pageRanges(pagesAfter));
            expect((await ranges(db)).at(-1)).toEqual([49, 57]);
            expect(await timeline(db)).toMatchObject([
                { start_beat: 0, end_beat: 57 },
            ]);
            const endsAfter = pageEnds(pagesAfter);
            expectSamePageEnds(endsBefore, endsAfter);
            const page6 = endsBefore.get(6)!;
            for (const [id, [x, y]] of endsAfter.get(created.id)!) {
                expect(Object.is(x, page6.get(id)![0])).toBe(true);
                expect(Object.is(y, page6.get(id)![1])).toBe(true);
            }
            await roundTrip(db, before, await snapshot(db));
        });

        it("deleting a page: its move goes, and the page before stretches over its beats", async ({
            db,
            marchersAndPages: _,
        }) => {
            const pages = await setUp(db);
            const endsBefore = pageEnds(pages);
            const before = await snapshot(db);

            await deletePages({ db, pageIds: new Set([3]) });
            await timelineResolverSettled();

            const pagesAfter = await pagesInOrder(db);
            expect(await ranges(db)).toEqual([
                [1, 9],
                [9, 25],
                [25, 33],
                [33, 41],
                [41, 49],
            ]);
            expect(await ranges(db)).toEqual(pageRanges(pagesAfter));
            await expectAssignmentsCoverTransitions(db);
            // Page 2 still ends on its own positions; pages 4 to 6 are unchanged
            expectSamePageEnds(endsBefore, pageEnds(pagesAfter));
            expect(await violations(db)).toEqual([]);
            await roundTrip(db, before, await snapshot(db));
        });

        it("deleting a page and its time (yank): its move goes and the later moves shift earlier", async ({
            db,
            marchersAndPages: _,
        }) => {
            const pages = await setUp(db);
            const endsBefore = pageEnds(pages);
            const before = await snapshot(db);

            await deletePageYank({ db, pageId: 3 });
            await timelineResolverSettled();

            const pagesAfter = await pagesInOrder(db);
            expect(await ranges(db)).toEqual([
                [1, 9],
                [9, 17],
                [17, 25],
                [25, 33],
                [33, 41],
            ]);
            expect(await ranges(db)).toEqual(pageRanges(pagesAfter));
            expect(await timeline(db)).toMatchObject([
                { start_beat: 0, end_beat: 41 },
            ]);
            await expectAssignmentsCoverTransitions(db);
            expectSamePageEnds(endsBefore, pageEnds(pagesAfter));
            await roundTrip(db, before, await snapshot(db));
        });

        it("deleting the last page: its move goes and the page before keeps its range", async ({
            db,
            marchersAndPages: _,
        }) => {
            const pages = await setUp(db);
            const endsBefore = pageEnds(pages);
            const before = await snapshot(db);

            await deletePages({ db, pageIds: new Set([6]) });
            await timelineResolverSettled();

            const pagesAfter = await pagesInOrder(db);
            expect(await ranges(db)).toEqual(ORIGINAL.slice(0, 5));
            expect(await ranges(db)).toEqual(pageRanges(pagesAfter));
            expectSamePageEnds(endsBefore, pageEnds(pagesAfter));
            await roundTrip(db, before, await snapshot(db));
        });
    });

    describe("tracks that aren't page moves", () => {
        it("a track ending on a page boundary grows with the page when beats go in there", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            // Inside page 2, ending where page 2 ends (beat 17)
            const track = await createTrack({
                db,
                target: { kind: "marcher", marcherId: 1 },
                startBeat: 12,
                endBeat: 17,
            });
            const before = await snapshot(db);
            // One beat after beat 16: page mode gives it to page 2, which now ends on beat 18
            await createBeats({ db, newBeats: [BEAT], startingPosition: 16 });
            const t = (await transitions(db)).find(
                (r) => r.id === track.transitionId,
            )!;
            expect([t.start_beat, t.end_beat]).toEqual([12, 18]);
            expect((await ranges(db)).slice(0, 3)).toEqual([
                [1, 9],
                [9, 18],
                [12, 18],
            ]);
            expect(await violations(db)).toEqual([]);
            await roundTrip(db, before, await snapshot(db));
        });

        it("deleting a page keeps a track over exactly its beats; only the page move goes", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            const pageMove = (await transitions(db))[2]!;
            const track = await createTrack({
                db,
                target: { kind: "marcher", marcherId: 1 },
                startBeat: 17,
                endBeat: 25,
            });
            expect(track.layer).toBe(1);
            const before = await snapshot(db);

            await deletePages({ db, pageIds: new Set([3]) });

            const after = await transitions(db);
            expect(after.find((t) => t.id === pageMove.id)).toBeUndefined();
            expect(
                after.find((t) => t.id === track.transitionId),
            ).toMatchObject({ start_beat: 17, end_beat: 25 });
            expect(
                await db
                    .select()
                    .from(schema.timeline_assignments)
                    .where(
                        eq(
                            schema.timeline_assignments.transition_id,
                            track.transitionId,
                        ),
                    )
                    .all(),
            ).toHaveLength(1);
            expect(await violations(db)).toEqual([]);
            await roundTrip(db, before, await snapshot(db));
        });

        /** Page 3 and its beats [17, 25) go in one edit, as the cascade measure delete does. */
        const deletePage3AndItsBeats = (db: DbConnection) =>
            transactionWithHistory(db, "cascadeDeleteMeasures", (tx) =>
                withTimelinePageRipple(tx, async () => {
                    await deleteMeasuresInTransaction({
                        tx,
                        itemIds: new Set([5, 6]),
                    });
                    await deletePagesInTransaction({
                        tx,
                        pageIds: new Set([3]),
                    });
                    await deleteBeatsInTransaction({
                        tx,
                        beatIds: new Set([17, 18, 19, 20, 21, 22, 23, 24]),
                    });
                    await ensureSecondBeatHasPage({ tx });
                }),
            );

        it("deleting a page with its beats removes its page move and shifts the rest", async ({
            db,
            marchersAndPages: _,
        }) => {
            const pages = await setUp(db);
            const endsBefore = pageEnds(pages);
            const before = await snapshot(db);
            await deletePage3AndItsBeats(db);
            await timelineResolverSettled();
            const pagesAfter = await pagesInOrder(db);
            expect(await ranges(db)).toEqual([
                [1, 9],
                [9, 17],
                [17, 25],
                [25, 33],
                [33, 41],
            ]);
            expect(await ranges(db)).toEqual(pageRanges(pagesAfter));
            expectSamePageEnds(endsBefore, pageEnds(pagesAfter));
            await roundTrip(db, before, await snapshot(db));
        });

        it("refuses a page delete that would empty a track, naming it, and writes nothing", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            await createTrack({
                db,
                target: { kind: "marcher", marcherId: 1 },
                startBeat: 18,
                endBeat: 22,
            });
            const before = await snapshot(db);
            const error = await deletePage3AndItsBeats(db).catch(
                (e: unknown) => e,
            );
            expect(error).toBeInstanceOf(TimelineWriteError);
            expect((error as TimelineWriteError).code).toBe("E-ARGS");
            expect((error as Error).message).toMatch(
                /the move over beats \[18, 22\) in timeline/,
            );
            expect(await snapshot(db)).toEqual(before);
        });
    });

    it("nested wrappers in one edit ripple once", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);
        const before = await snapshot(db);
        await transactionWithHistory(db, "nested", (tx) =>
            withTimelinePageRipple(tx, async () => {
                await withTimelinePageRipple(tx, () =>
                    createBeatsInTransaction({
                        tx,
                        newBeats: [BEAT],
                        startingPosition: 12,
                    }),
                );
                await withTimelinePageRipple(tx, () =>
                    createBeatsInTransaction({
                        tx,
                        newBeats: [BEAT],
                        startingPosition: 12,
                    }),
                );
            }),
        );
        // Two beats inside page 2, rippled once: page 2's move grows by 2, not 4
        expect(await ranges(db)).toEqual([
            [1, 9],
            [9, 19],
            [19, 27],
            [27, 35],
            [35, 43],
            [43, 51],
        ]);
        expect(await ranges(db)).toEqual(pageRanges(await pagesInOrder(db)));
        await roundTrip(db, before, await snapshot(db));
    });

    describe("audio player: replace all beats", () => {
        const replaceAllBeats = async (db: DbConnection) => {
            const { beats, pages } = await readShowTiming(db);
            const measures = await db.select().from(schema.measures).all();
            await _replaceAllBeatObjects({
                newBeats: beats.map((b) => ({ ...b, id: -1 - b.id })),
                oldBeats: [...beats],
                newMeasures: [],
                oldMeasures: measures.map((m) => ({ id: m.id }) as never),
                pages: [...pages],
            });
        };

        it("is one edit: page moves follow their pages and one undo restores everything", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            const before = await snapshot(db);
            await replaceAllBeats(db);
            await timelineResolverSettled();
            expect(await ranges(db)).toEqual(
                pageRanges(await pagesInOrder(db)),
            );
            await expectAssignmentsCoverTransitions(db);
            expect(await violations(db)).toEqual([]);
            await roundTrip(db, before, await snapshot(db));
        });

        it("a refusal writes nothing, not even the new beats", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            // A track that isn't a page move loses its beats when the old beats go
            await createTrack({
                db,
                target: { kind: "marcher", marcherId: 1 },
                startBeat: 11,
                endBeat: 13,
            });
            const before = await snapshot(db);
            const error = await replaceAllBeats(db).catch((e: unknown) => e);
            expect(error).toBeInstanceOf(TimelineWriteError);
            expect((error as TimelineWriteError).code).toBe("E-ARGS");
            expect(await snapshot(db)).toEqual(before);
        });
    });

    it("with the flag off, page and beat edits leave the timeline rows alone", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db, false);
        const timelineBefore = await snapshot(db, TIMELINE_TABLES);
        await createBeats({ db, newBeats: [BEAT], startingPosition: 12 });
        await updatePages({ db, modifiedPages: [{ id: 4, start_beat: 27 }] });
        await createPages({
            db,
            newPages: [{ start_beat: 5, is_subset: false }],
        });
        await deletePages({ db, pageIds: new Set([5]) });
        expect(await snapshot(db, TIMELINE_TABLES)).toEqual(timelineBefore);
        // Page mode still did its part
        const pagesAfter = await pagesInOrder(db);
        expect(pagesAfter.map((p) => p.id)).not.toContain(5);
        const beatCount = await db
            .select()
            .from(schema.beats)
            .all()
            .then((b) => b.length);
        expect(beatCount).toBe(98);
        expect(
            await db
                .select()
                .from(schema.pages)
                .where(eq(schema.pages.id, 4))
                .get(),
        ).toMatchObject({ start_beat: 27 });
    });
});

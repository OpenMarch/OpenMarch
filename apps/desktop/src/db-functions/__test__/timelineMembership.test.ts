import { afterEach, describe, expect } from "vitest";
import { eq, getTableName, sql } from "drizzle-orm";
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
import { deleteMarchers } from "../marcher";
import { createTimelinesInTransaction } from "../timelines";
import {
    addMarchersToTimeline,
    createOwnTransitionsInTransaction,
    removeAssignmentFromTimeline,
    removeMarchersFromTimeline,
    type BeatRange,
} from "../timelineMembership";
import { TimelineWriteError } from "../timelineErrors";
import {
    keepFixturesInPageMode,
    setTimelineModeFlag,
} from "@/test/timelineMode";

// P7.17: these tests set up timeline mode themselves
keepFixturesInPageMode(
    "its tests convert the show and set the flag themselves",
);

/**
 * Who is in a timeline (docs/timeline/phases/08-authoring-ui.md P8.14, ui.md UI-9), on a converted
 * `marchersAndPages` show: one show-wide timeline holding a shapeless direct transition per page,
 * so a page's box is a range inside that timeline.
 */

afterEach(() => stopTimelineResolver());

const TABLES = [
    schema.marchers,
    schema.timelines,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
];

const snapshot = async (db: DbConnection) => {
    const out: Record<string, unknown[]> = {};
    for (const table of TABLES)
        out[getTableName(table)] = await db.select().from(table).all();
    return out;
};

const resolver = () => {
    const r = useTimelineResolverStore.getState().resolver;
    expect(r, "the resolver store is ready").not.toBeNull();
    return r!;
};

const violations = async (db: DbConnection) =>
    await db.all(
        sql`SELECT code, transition_id, detail FROM timeline_commit_violations`,
    );

/** Converts the show, turns the flag on, starts the store, and returns the pages in order. */
const setUp = async (db: DbConnection): Promise<Page[]> => {
    await convertPagesToTimeline(db);
    await setTimelineModeFlag(db, true);
    await startTimelineResolver(db);
    const { pages } = await readShowTiming(db);
    return [...pages].sort((a, b) => a.order - b.order);
};

/**
 * Page `i`'s box: from the previous page's flag to its own (UI-9 Pages). A converted show already
 * stores a timeline over it with every marcher in it (P9.10).
 */
const pageRange = (pages: readonly Page[], i: number): BeatRange => ({
    start: pageEndBeat(pages[i - 1]!),
    end: pageEndBeat(pages[i]!),
});

/** A range wholly inside page `i`'s move, two beats in from each flag: not stored yet. */
const insidePage = (pages: readonly Page[], i: number): BeatRange => {
    const { start, end } = pageRange(pages, i);
    expect(end - start).toBeGreaterThanOrEqual(6);
    return { start: start + 2, end: end - 2 };
};

/** Every marcher's position at each of `beats`, keyed by marcher id. */
const positions = (beats: readonly number[]) => {
    const r = resolver();
    return new Map(
        r.marcherIds().map((id) => [id, beats.map((b) => r.positionAt(id, b))]),
    );
};

const expectSamePositions = (
    before: ReturnType<typeof positions>,
    after: ReturnType<typeof positions>,
) => {
    for (const [id, points] of before)
        points.forEach(([x, y], i) => {
            const [ax, ay] = after.get(id)![i]!;
            expect(ax, `marcher ${id} x at #${i}`).toBeCloseTo(x, 9);
            expect(ay, `marcher ${id} y at #${i}`).toBeCloseTo(y, 9);
        });
};

const roundTrip = async (
    db: DbConnection,
    before: Record<string, unknown[]>,
    after: Record<string, unknown[]>,
) => {
    const undo = await performUndo(db);
    expect(undo.success, undo.error?.message).toBe(true);
    expect(await snapshot(db)).toEqual(before);
    expect(await violations(db)).toEqual([]);
    const redo = await performRedo(db);
    expect(redo.success, redo.error?.message).toBe(true);
    expect(await snapshot(db)).toEqual(after);
    expect(await violations(db)).toEqual([]);
    await timelineResolverSettled();
};

/** Runs `write` and checks it is refused with `code` and writes nothing. */
const expectRefused = async (
    db: DbConnection,
    write: () => Promise<unknown>,
    code: string,
    message?: RegExp,
) => {
    const before = await snapshot(db);
    const error = await write().then(
        () => null,
        (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(TimelineWriteError);
    expect((error as TimelineWriteError).code).toBe(code);
    if (message) expect((error as Error).message).toMatch(message);
    expect(await snapshot(db)).toEqual(before);
};

const ownRows = async (db: DbConnection, timelineId: number) =>
    await db
        .select({
            marcher: schema.timeline_assignments.marcher_id,
            transition: schema.timeline_transitions.id,
            slots: schema.timeline_transitions.slot_count,
            style: schema.timeline_transitions.path_style,
            shape: schema.timeline_transitions.dest_shape_id,
            layer: schema.timeline_assignments.layer,
            start: schema.timeline_assignments.start_beat,
            end: schema.timeline_assignments.end_beat,
        })
        .from(schema.timeline_assignments)
        .innerJoin(
            schema.timeline_transitions,
            eq(
                schema.timeline_transitions.id,
                schema.timeline_assignments.transition_id,
            ),
        )
        .where(eq(schema.timeline_transitions.timeline_id, timelineId))
        .orderBy(schema.timeline_assignments.marcher_id)
        .all();

const timelineIds = async (db: DbConnection) =>
    (await db.select().from(schema.timelines).all()).map((t) => t.id);

describeDbTests("timeline membership (P8.14, UI-9)", (it) => {
    describe("Add selected marchers", () => {
        it("creates a timeline inside a page move and gives each marcher its own one-slot move there, changing no motion", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const range = insidePage(pages, 2);
            const ids = marchersAndPages.expectedMarchers
                .slice(0, 2)
                .map((m) => m.id);
            const length = range.end - range.start;
            const beats = [
                range.start,
                range.start + length / 3,
                range.start + length / 2,
                range.end,
                pageEndBeat(pages[pages.length - 1]!),
            ];
            const positionsBefore = positions(beats);
            const before = await snapshot(db);

            const result = await addMarchersToTimeline({
                db,
                range,
                marcherIds: ids,
            });
            expect(result.createdTimeline).toBe(true);
            expect(result.alreadyIn).toEqual([]);
            const timeline = await db
                .select()
                .from(schema.timelines)
                .where(eq(schema.timelines.id, result.timelineId))
                .get();
            expect([timeline!.start_beat, timeline!.end_beat]).toEqual([
                range.start,
                range.end,
            ]);
            const rows = await ownRows(db, result.timelineId);
            // One transition per marcher; one layer above the page move it lies inside
            expect(rows).toEqual(
                [...ids]
                    .sort((a, b) => a - b)
                    .map((marcher, i) => ({
                        marcher,
                        transition: rows[i]!.transition,
                        slots: 1,
                        style: "direct",
                        shape: null,
                        layer: 1,
                        start: range.start,
                        end: range.end,
                    })),
            );
            expect(new Set(rows.map((r) => r.transition)).size).toBe(2);
            // Each destination is where the marcher was at the range's end
            for (const row of rows) {
                const [dest] = await db
                    .select()
                    .from(schema.timeline_slot_destinations)
                    .where(
                        eq(
                            schema.timeline_slot_destinations.transition_id,
                            row.transition,
                        ),
                    )
                    .all();
                const [x, y] = positionsBefore.get(row.marcher)![3]!;
                expect([dest!.slot_index, dest!.x, dest!.y]).toEqual([0, x, y]);
            }
            expect(await violations(db)).toEqual([]);
            await timelineResolverSettled();
            expectSamePositions(positionsBefore, positions(beats));

            await roundTrip(db, before, await snapshot(db));
        });

        it("adds to the stored timeline over the range, skipping marchers already in it", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const range = insidePage(pages, 3);
            const [a, b, c] = marchersAndPages.expectedMarchers.map(
                (m) => m.id,
            );
            const first = await addMarchersToTimeline({
                db,
                range,
                marcherIds: [a!],
            });
            const second = await addMarchersToTimeline({
                db,
                range,
                marcherIds: [b!, a!],
            });
            expect(second.timelineId).toBe(first.timelineId);
            expect(second.createdTimeline).toBe(false);
            expect(second.alreadyIn).toEqual([a]);
            expect(second.added.map((x) => x.marcherId)).toEqual([b]);
            expect(
                (await ownRows(db, first.timelineId)).map((r) => r.marcher),
            ).toEqual([a, b].sort((x, y) => x! - y!));

            // Everyone already in: refused, nothing written
            await expectRefused(
                db,
                () =>
                    addMarchersToTimeline({
                        db,
                        range,
                        marcherIds: [a!, b!],
                    }),
                "E-ARGS",
                /already in this timeline/,
            );
            // Undo takes back only the second add
            const undo = await performUndo(db);
            expect(undo.success).toBe(true);
            expect(
                (await ownRows(db, first.timelineId)).map((r) => r.marcher),
            ).toEqual([a]);
            expect(c).toBeDefined();
        });

        it("goes a layer up inside a marcher's timeline, and refuses a partial overlap or a range around one of its timelines", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            // The page's stored timeline (P9.10) holds the marcher's page move at layer 0
            const range = pageRange(pages, 2);
            const id = marchersAndPages.expectedMarchers[0]!.id;
            const inPage = await addMarchersToTimeline({
                db,
                range: insidePage(pages, 2),
                marcherIds: [id],
            });
            // Wholly inside: one layer above its highest layer there (UI-9 Layers)
            expect(inPage.added.map((x) => x.layer)).toEqual([1]);
            const nested = await addMarchersToTimeline({
                db,
                range: { start: range.start + 3, end: range.end - 3 },
                marcherIds: [id],
            });
            expect(nested.added.map((x) => x.layer)).toEqual([2]);
            expect(await violations(db)).toEqual([]);

            // Only partly overlapping one of its timelines
            await expectRefused(
                db,
                () =>
                    addMarchersToTimeline({
                        db,
                        range: { start: range.start + 1, end: range.end + 1 },
                        marcherIds: [id],
                    }),
                "E-ARGS",
                /only partly overlaps/,
            );
            // Around one of its timelines: the new move would steal all of that one
            await expectRefused(
                db,
                () =>
                    addMarchersToTimeline({
                        db,
                        range: { start: range.start, end: range.end + 1 },
                        marcherIds: [id],
                    }),
                "E-ARGS",
                /inside/,
            );
        });

        it("a converted page's stored range finds its timeline: everyone is already in, no new timeline, no motion change", async ({
            db,
            marchersAndPages,
        }) => {
            // What a page box (or its clip) sends on a converted show (P9.10: a timeline per page)
            const pages = await setUp(db);
            const range = pageRange(pages, 1);
            const timelinesBefore = await timelineIds(db);
            const show = (await db.select().from(schema.timelines).all()).find(
                (t) => t.start_beat === range.start && t.end_beat === range.end,
            );
            expect(show).toBeDefined();
            const ends = pages.map((p) => pageEndBeat(p));
            const positionsBefore = positions(ends);
            await expectRefused(
                db,
                () =>
                    addMarchersToTimeline({
                        db,
                        range: { start: show!.start_beat, end: show!.end_beat },
                        marcherIds: marchersAndPages.expectedMarchers.map(
                            (m) => m.id,
                        ),
                    }),
                "E-ARGS",
                /already in this timeline/,
            );
            expect(await timelineIds(db)).toEqual(timelinesBefore);
            await timelineResolverSettled();
            expectSamePositions(positionsBefore, positions(ends));
        });

        it("counts a marcher in either of two legacy timelines over one range as already in", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const range = insidePage(pages, 2);
            const [a, b] = marchersAndPages.expectedMarchers.map((m) => m.id);
            await addMarchersToTimeline({ db, range, marcherIds: [a!] });
            // A second timeline over the same range, as a file from before C-12 could hold
            const newer = await transactionWithHistory(db, "legacy", (tx) =>
                createTimelinesInTransaction({
                    tx,
                    allowSharedRanges: true,
                    newTimelines: [
                        { startBeat: range.start, endBeat: range.end },
                    ],
                }),
            );
            await transactionWithHistory(db, "legacyMove", async (tx) => {
                await createOwnTransitionsInTransaction(tx, newer[0]!, [
                    { marcherId: b!, point: [0, 0], layer: 1 },
                ]);
            });
            await expectRefused(
                db,
                () =>
                    addMarchersToTimeline({
                        db,
                        range,
                        marcherIds: [a!, b!],
                    }),
                "E-ARGS",
                /already in this timeline/,
            );
        });

        it("refuses bad arguments before writing", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const range = pageRange(pages, 1);
            const id = marchersAndPages.expectedMarchers[0]!.id;
            for (const [args, message] of [
                [{ range, marcherIds: [] }, /select the marchers/],
                [{ range, marcherIds: [id, id] }, /more than once/],
                [{ range, marcherIds: [987654] }, /does not exist/],
                [
                    { range: { start: 4, end: 4 }, marcherIds: [id] },
                    /whole beats/,
                ],
                [
                    { range: { start: 1.5, end: 4 }, marcherIds: [id] },
                    /whole beats/,
                ],
            ] as const)
                await expectRefused(
                    db,
                    () => addMarchersToTimeline({ db, ...args }),
                    "E-ARGS",
                    message,
                );
        });
    });

    describe("one timeline per range", () => {
        it("refuses a second timeline over a stored range, or two new ones over one range", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            const create = (ranges: [number, number][]) =>
                transactionWithHistory(db, "timelines", (tx) =>
                    createTimelinesInTransaction({
                        tx,
                        newTimelines: ranges.map(([startBeat, endBeat]) => ({
                            startBeat,
                            endBeat,
                        })),
                    }),
                );
            await create([[1, 3]]);
            await expectRefused(
                db,
                () => create([[1, 3]]),
                "E-ARGS",
                /one timeline per range/,
            );
            await expectRefused(
                db,
                () =>
                    create([
                        [4, 6],
                        [4, 6],
                    ]),
                "E-ARGS",
                /one timeline per range/,
            );
        });
    });

    describe("removing marchers", () => {
        it("deletes the marcher's own move and keeps the timeline, even when it empties", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const range = insidePage(pages, 2);
            const [a, b] = marchersAndPages.expectedMarchers.map((m) => m.id);
            const { timelineId } = await addMarchersToTimeline({
                db,
                range,
                marcherIds: [a!, b!],
            });
            const transitionsBefore = (
                await db.select().from(schema.timeline_transitions).all()
            ).length;
            const before = await snapshot(db);

            const result = await removeMarchersFromTimeline({
                db,
                timelineId,
                marcherIds: [a!],
            });
            expect(result.deletedTransitionIds.length).toBe(1);
            expect(result.leftVacant).toEqual([]);
            expect(
                (await ownRows(db, timelineId)).map((r) => r.marcher),
            ).toEqual([b]);
            expect(
                (await db.select().from(schema.timeline_transitions).all())
                    .length,
            ).toBe(transitionsBefore - 1);
            expect(await violations(db)).toEqual([]);
            await roundTrip(db, before, await snapshot(db));

            // The last one out leaves an empty, stored timeline
            await removeMarchersFromTimeline({
                db,
                timelineId,
                marcherIds: [b!],
            });
            expect(await timelineIds(db)).toContain(timelineId);
            expect(await ownRows(db, timelineId)).toEqual([]);
            expect(await violations(db)).toEqual([]);
            // Still selectable: adding to its range finds it again
            const again = await addMarchersToTimeline({
                db,
                range,
                marcherIds: [a!],
            });
            expect(again.timelineId).toBe(timelineId);
            expect(again.createdTimeline).toBe(false);
        });

        it("refuses a marcher who isn't in the timeline, and a missing timeline", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const [a, b] = marchersAndPages.expectedMarchers.map((m) => m.id);
            const { timelineId } = await addMarchersToTimeline({
                db,
                range: insidePage(pages, 2),
                marcherIds: [a!],
            });
            await expectRefused(
                db,
                () =>
                    removeMarchersFromTimeline({
                        db,
                        timelineId,
                        marcherIds: [b!],
                    }),
                "E-ARGS",
                /isn't in this timeline/,
            );
            await expectRefused(
                db,
                () =>
                    removeMarchersFromTimeline({
                        db,
                        timelineId: 987654,
                        marcherIds: [a!],
                    }),
                "E-ARGS",
                /does not exist/,
            );
        });

        it("the inspector's remove deletes one assignment and its own move, and leaves a shared slot vacant", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const [a] = marchersAndPages.expectedMarchers.map((m) => m.id);
            const { added, timelineId } = await addMarchersToTimeline({
                db,
                range: insidePage(pages, 2),
                marcherIds: [a!],
            });
            const own = await removeAssignmentFromTimeline({
                db,
                assignmentId: added[0]!.assignmentId,
            });
            expect(own.deletedTransitionIds).toEqual([added[0]!.transitionId]);
            expect(await timelineIds(db)).toContain(timelineId);

            // A page move of the converted show is shared: the slot stays, vacant (D-13)
            const pageMove = await db
                .select()
                .from(schema.timeline_assignments)
                .where(eq(schema.timeline_assignments.marcher_id, a!))
                .get();
            const shared = await removeAssignmentFromTimeline({
                db,
                assignmentId: pageMove!.id,
            });
            expect(shared.deletedTransitionIds).toEqual([]);
            expect(shared.leftVacant).toEqual([
                {
                    transitionId: pageMove!.transition_id,
                    slotIndex: pageMove!.slot_index,
                },
            ]);
            // Only that one row went: the marcher keeps its other page moves
            expect(
                (
                    await db
                        .select()
                        .from(schema.timeline_assignments)
                        .where(eq(schema.timeline_assignments.marcher_id, a!))
                        .all()
                ).length,
            ).toBe(pages.length - 2);
            expect(await violations(db)).toEqual([]);
        });
    });

    describe("marcher delete", () => {
        it("deletes the marcher's own moves and keeps their timelines", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const [a, b] = marchersAndPages.expectedMarchers.map((m) => m.id);
            const { timelineId } = await addMarchersToTimeline({
                db,
                range: insidePage(pages, 2),
                marcherIds: [a!],
            });
            const kept = await addMarchersToTimeline({
                db,
                range: insidePage(pages, 4),
                marcherIds: [a!, b!],
            });
            const before = await snapshot(db);

            await deleteMarchers({ db, marcherIds: new Set([a!]) });
            expect(await timelineIds(db)).toEqual(
                expect.arrayContaining([timelineId, kept.timelineId]),
            );
            expect(await ownRows(db, timelineId)).toEqual([]);
            expect(
                (await ownRows(db, kept.timelineId)).map((r) => r.marcher),
            ).toEqual([b]);
            const ownTransitions = [
                ...kept.added.filter((x) => x.marcherId === a),
            ].map((x) => x.transitionId);
            const left = await db
                .select()
                .from(schema.timeline_transitions)
                .all();
            for (const id of ownTransitions)
                expect(left.map((t) => t.id)).not.toContain(id);
            expect(await violations(db)).toEqual([]);
            await timelineResolverSettled();
            expect(
                resolver()
                    .diagnostics()
                    .filter((d) => d.code === "D-VACANT"),
            ).toEqual([]);
            await roundTrip(db, before, await snapshot(db));
        });
    });
});

import { afterEach, describe, expect } from "vitest";
import { asc, eq, getTableName, sql } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import type Page from "@/global/classes/Page";
import { convertPagesToTimeline } from "@/test/convertPages";
import { readShowTiming } from "@/timeline/showTiming";
import { pageEndBeat } from "@/timeline/timelineCanvas";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import { performRedo, performUndo, transactionWithHistory } from "../history";
import {
    addMarchersToTimeline,
    removeMarchersFromTimeline,
    type BeatRange,
} from "../timelineMembership";
import {
    createTrack,
    deleteTimeline,
    renameTimeline,
} from "../timelineCommands";
import { moveMarchersInTarget } from "../timelineMoves";
import { addPageFlag, deletePageFlags, movePageFlag } from "../pageFlags";
import { deletePageYankWithMoves, deletePagesWithMoves } from "../pageDelete";
import {
    createTimelineShape,
    createTimelineShapesInTransaction,
} from "../timelineShapes";
import {
    setTimelineTransitionDestinationInTransaction,
    updateTimelineTransitionsInTransaction,
} from "../timelineTransitionsInTransaction";
import { readBasicRows } from "../basicRows";
import { lockedMarchersByPage } from "@/timeline/basicSimple";
import { TimelineWriteError } from "../timelineErrors";
import {
    mergeFits,
    mergeMoves,
    splitMarchersIntoNewMove,
    splitMembershipBlocker,
} from "../timelineSplitMoves";
import { readTimelineResizeLimits, resizeTimeline } from "../timelineResize";
import { keepFixturesInPageMode } from "@/test/timelineMode";

// These tests convert the show themselves, so a page's timeline is one shared transition
keepFixturesInPageMode("its tests convert the show themselves");

/**
 * Splitting a move and merging moves (docs/timeline/ui.md UI-25) on a converted
 * `marchersAndPages` show: each page box holds a stored timeline with one shared shapeless
 * transition, one slot per marcher (P9.10).
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

const violations = async (db: DbConnection) =>
    await db.all(
        sql`SELECT code, transition_id, detail FROM timeline_commit_violations`,
    );

const setUp = async (db: DbConnection): Promise<Page[]> => {
    await convertPagesToTimeline(db);
    await startTimelineResolver(db);
    const { pages } = await readShowTiming(db);
    return [...pages].sort((a, b) => a.order - b.order);
};

const pageRange = (pages: readonly Page[], i: number): BeatRange => ({
    start: pageEndBeat(pages[i - 1]!),
    end: pageEndBeat(pages[i]!),
});

const showEnd = (pages: readonly Page[]) =>
    pageEndBeat(pages[pages.length - 1]!);

const resolver = () => {
    const r = useTimelineResolverStore.getState().resolver;
    expect(r, "the resolver store is ready").not.toBeNull();
    return r!;
};

/** Every marcher's position at every beat of the show. */
const everyBeat = async (pages: readonly Page[]) => {
    await timelineResolverSettled();
    const r = resolver();
    const beats = Array.from({ length: showEnd(pages) + 1 }, (_, i) => i);
    return new Map(
        r.marcherIds().map((id) => [id, beats.map((b) => r.positionAt(id, b))]),
    );
};

const expectSamePositions = (
    before: Map<number, [number, number][]>,
    after: Map<number, [number, number][]>,
) => {
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    for (const [id, points] of before)
        points.forEach(([x, y], beat) => {
            const [ax, ay] = after.get(id)![beat]!;
            expect(ax, `marcher ${id} x at beat ${beat}`).toBeCloseTo(x, 9);
            expect(ay, `marcher ${id} y at beat ${beat}`).toBeCloseTo(y, 9);
        });
};

const timelineOf = async (db: DbConnection, range: BeatRange) =>
    (
        await db
            .select()
            .from(schema.timelines)
            .where(
                sql`${schema.timelines.start_beat} = ${range.start} AND ${schema.timelines.end_beat} = ${range.end}`,
            )
            .orderBy(asc(schema.timelines.id))
            .all()
    )[0]!;

/** Each member of a timeline with its transition's shape and the assignment's layer. */
const membersOf = async (db: DbConnection, timelineId: number) =>
    await db
        .select({
            marcher: schema.timeline_assignments.marcher_id,
            assignment: schema.timeline_assignments.id,
            transition: schema.timeline_transitions.id,
            slots: schema.timeline_transitions.slot_count,
            slot: schema.timeline_assignments.slot_index,
            style: schema.timeline_transitions.path_style,
            params: schema.timeline_transitions.path_params,
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
        .orderBy(asc(schema.timeline_assignments.marcher_id))
        .all();

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

const expectRefused = async (
    db: DbConnection,
    write: () => Promise<unknown>,
    message?: RegExp,
) => {
    const before = await snapshot(db);
    const error = await write().then(
        () => null,
        (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(TimelineWriteError);
    expect((error as TimelineWriteError).code).toBe("E-ARGS");
    if (message) expect((error as Error).message).toMatch(message);
    expect(await snapshot(db)).toEqual(before);
};

const ids = (m: { expectedMarchers: readonly { id: number }[] }) =>
    m.expectedMarchers.map((x) => x.id).sort((a, b) => a - b);

describeDbTests("splitting and merging moves (UI-25)", (it) => {
    describe("Split", () => {
        it("peels marchers off a converted page's shared transition into a new move over the same range, changing no motion", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const range = pageRange(pages, 2);
            const page = await timelineOf(db, range);
            const all = ids(marchersAndPages);
            const chosen = all.slice(0, 2);
            const membersBefore = await membersOf(db, page.id);
            expect(new Set(membersBefore.map((m) => m.transition)).size).toBe(
                1,
            );
            const positionsBefore = await everyBeat(pages);
            const before = await snapshot(db);

            const result = await splitMarchersIntoNewMove({
                db,
                timelineId: page.id,
                marcherIds: chosen,
            });

            expect(result.fromTimelineId).toBe(page.id);
            expect(result.marcherIds).toEqual(chosen);
            expect(result.notInMove).toEqual([]);
            expect([
                result.timeline.start_beat,
                result.timeline.end_beat,
                result.timeline.name,
            ]).toEqual([range.start, range.end, "Move 1"]);
            // The page's timeline is still the oldest over the range (the page box's)
            expect((await timelineOf(db, range)).id).toBe(page.id);
            const moved = await membersOf(db, result.timeline.id);
            expect(moved.map((m) => m.marcher)).toEqual(chosen);
            // Each has its own one-slot transition, at its old layer and beats, with the old path
            for (const m of moved) {
                const old = membersBefore.find((b) => b.marcher === m.marcher)!;
                expect(m).toMatchObject({
                    slots: 1,
                    slot: 0,
                    style: old.style,
                    params: old.params,
                    layer: old.layer,
                    start: old.start,
                    end: old.end,
                });
            }
            // The rest stay in the page's transition, compacted: no vacant slot
            const left = await membersOf(db, page.id);
            expect(left.map((m) => m.marcher)).toEqual(all.slice(2));
            expect(left[0]!.slots).toBe(all.length - 2);
            expect(await violations(db)).toEqual([]);
            expectSamePositions(positionsBefore, await everyBeat(pages));

            await roundTrip(db, before, await snapshot(db));
            expectSamePositions(positionsBefore, await everyBeat(pages));
        });

        it("moves a marcher's own one-slot transition as it is: same rows and layer", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const page = pageRange(pages, 3);
            // A move inside page 3: each marcher gets its own transition one layer up
            const range = { start: page.start + 1, end: page.end - 1 };
            const [a, b, c] = ids(marchersAndPages);
            const { timelineId } = await addMarchersToTimeline({
                db,
                range,
                marcherIds: [a!, b!, c!],
            });
            const membersBefore = await membersOf(db, timelineId);
            const positionsBefore = await everyBeat(pages);
            const before = await snapshot(db);

            const result = await splitMarchersIntoNewMove({
                db,
                timelineId,
                marcherIds: [b!, c!],
            });

            const moved = await membersOf(db, result.timeline.id);
            expect(moved).toEqual(membersBefore.filter((m) => m.marcher !== a));
            expect(moved.every((m) => m.layer === 1)).toBe(true);
            expect(result.timeline.name).toBe("Move 2");
            expect(await violations(db)).toEqual([]);
            expectSamePositions(positionsBefore, await everyBeat(pages));
            await roundTrip(db, before, await snapshot(db));
        });

        it("splits a move that crosses a page flag", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const range = {
                start: pageRange(pages, 2).start + 1,
                end: pageRange(pages, 3).end - 1,
            };
            const [a, b] = ids(marchersAndPages);
            // A canvas drag over a window that crosses page 2's flag (UI-10 pass-through)
            const moved = await moveMarchersInTarget({
                db,
                target: { kind: "range", ...range },
                moves: [
                    { marcherId: a!, x: 10, y: 10 },
                    { marcherId: b!, x: 20, y: 10 },
                ],
            });
            const timelineId = moved.passThrough!.createdTimelineId!;
            const positionsBefore = await everyBeat(pages);
            const result = await splitMarchersIntoNewMove({
                db,
                timelineId,
                marcherIds: [b!],
            });
            expect([
                result.timeline.start_beat,
                result.timeline.end_beat,
            ]).toEqual([range.start, range.end]);
            expect(
                (await membersOf(db, timelineId)).map((m) => m.marcher),
            ).toEqual([a]);
            expect(await violations(db)).toEqual([]);
            expectSamePositions(positionsBefore, await everyBeat(pages));
        });

        it("leaves selected marchers who aren't in the move alone, and says so", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const page = pageRange(pages, 3);
            const range = { start: page.start + 1, end: page.end - 1 };
            const [a, b, c] = ids(marchersAndPages);
            const { timelineId } = await addMarchersToTimeline({
                db,
                range,
                marcherIds: [a!, b!],
            });
            const result = await splitMarchersIntoNewMove({
                db,
                timelineId,
                marcherIds: [c!, b!],
            });
            expect(result.marcherIds).toEqual([b]);
            expect(result.notInMove).toEqual([c]);
        });

        it("is refused for every member, for none of them, for nobody and for a missing move", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const page = pageRange(pages, 3);
            const range = { start: page.start + 1, end: page.end - 1 };
            const [a, b, c] = ids(marchersAndPages);
            const { timelineId } = await addMarchersToTimeline({
                db,
                range,
                marcherIds: [a!, b!],
            });
            await expectRefused(
                db,
                () =>
                    splitMarchersIntoNewMove({
                        db,
                        timelineId,
                        marcherIds: [a!, b!, c!],
                    }),
                /Every marcher in Move 1 is selected/,
            );
            await expectRefused(
                db,
                () =>
                    splitMarchersIntoNewMove({
                        db,
                        timelineId,
                        marcherIds: [c!],
                    }),
                /Select marchers in Move 1/,
            );
            await expectRefused(db, () =>
                splitMarchersIntoNewMove({ db, timelineId, marcherIds: [] }),
            );
            await expectRefused(db, () =>
                splitMarchersIntoNewMove({
                    db,
                    timelineId: 9999,
                    marcherIds: [a!],
                }),
            );
        });

        it("refuses to split marchers apart who move into one shape together, but moves the whole shape's transition", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const page = pageRange(pages, 3);
            const range = { start: page.start + 1, end: page.end - 1 };
            const [a, b, c, d] = ids(marchersAndPages);
            const shape = await createTimelineShape({
                db,
                newShape: {
                    kind: "line",
                    geometry: {
                        points: [
                            [0, 0],
                            [40, 0],
                        ],
                    },
                },
            });
            const track = await createTrack({
                db,
                target: {
                    kind: "shape",
                    shapeId: shape.id,
                    marcherIds: [a!, b!, c!],
                },
                startBeat: range.start,
                endBeat: range.end,
            });
            await addMarchersToTimeline({ db, range, marcherIds: [d!] });
            await expectRefused(
                db,
                () =>
                    splitMarchersIntoNewMove({
                        db,
                        timelineId: track.timelineId,
                        marcherIds: [a!],
                    }),
                /move into one shape together/,
            );
            const positionsBefore = await everyBeat(pages);
            const result = await splitMarchersIntoNewMove({
                db,
                timelineId: track.timelineId,
                marcherIds: [a!, b!, c!],
            });
            const moved = await membersOf(db, result.timeline.id);
            expect(moved.map((m) => m.transition)).toEqual([
                track.transitionId,
                track.transitionId,
                track.transitionId,
            ]);
            expect(await violations(db)).toEqual([]);
            expectSamePositions(positionsBefore, await everyBeat(pages));
        });

        it("splits a split move again, numbering each new move", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const range = pageRange(pages, 2);
            const page = await timelineOf(db, range);
            const all = ids(marchersAndPages);
            const first = await splitMarchersIntoNewMove({
                db,
                timelineId: page.id,
                marcherIds: all.slice(0, 4),
            });
            const second = await splitMarchersIntoNewMove({
                db,
                timelineId: first.timeline.id,
                marcherIds: all.slice(0, 2),
            });
            expect([first.timeline.name, second.timeline.name]).toEqual([
                "Move 1",
                "Move 2",
            ]);
            expect(
                (await membersOf(db, first.timeline.id)).map((m) => m.marcher),
            ).toEqual(all.slice(2, 4));
        });
    });

    describe("Merge", () => {
        it("merges a split move back into its page: no motion change, the page's rows hold everyone, one undo step", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const range = pageRange(pages, 2);
            const page = await timelineOf(db, range);
            const all = ids(marchersAndPages);
            const positionsBefore = await everyBeat(pages);
            const split = await splitMarchersIntoNewMove({
                db,
                timelineId: page.id,
                marcherIds: all.slice(0, 3),
            });
            const before = await snapshot(db);

            const merged = await mergeMoves({
                db,
                sourceId: split.timeline.id,
                targetId: page.id,
            });

            expect(merged.targetTimelineId).toBe(page.id);
            expect(merged.marcherIds).toEqual(all.slice(0, 3));
            expect(
                await db
                    .select()
                    .from(schema.timelines)
                    .where(eq(schema.timelines.id, split.timeline.id))
                    .all(),
            ).toEqual([]);
            expect(
                (await membersOf(db, page.id)).map((m) => m.marcher),
            ).toEqual(all);
            expect(await violations(db)).toEqual([]);
            expectSamePositions(positionsBefore, await everyBeat(pages));
            await roundTrip(db, before, await snapshot(db));
            expectSamePositions(positionsBefore, await everyBeat(pages));
        });

        it("merges two split moves, keeping the target's name", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const range = pageRange(pages, 2);
            const page = await timelineOf(db, range);
            const all = ids(marchersAndPages);
            const a = await splitMarchersIntoNewMove({
                db,
                timelineId: page.id,
                marcherIds: all.slice(0, 2),
            });
            const b = await splitMarchersIntoNewMove({
                db,
                timelineId: page.id,
                marcherIds: all.slice(2, 4),
            });
            await mergeMoves({
                db,
                sourceId: b.timeline.id,
                targetId: a.timeline.id,
            });
            const target = await db
                .select()
                .from(schema.timelines)
                .where(eq(schema.timelines.id, a.timeline.id))
                .get();
            expect(target!.name).toBe("Move 1");
            expect(
                (await membersOf(db, a.timeline.id)).map((m) => m.marcher),
            ).toEqual(all.slice(0, 4));
        });

        it("is refused for a page's own timeline as the source, itself, and a marcher in both", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const range = pageRange(pages, 2);
            const page = await timelineOf(db, range);
            const other = await timelineOf(db, pageRange(pages, 3));
            const all = ids(marchersAndPages);
            const split = await splitMarchersIntoNewMove({
                db,
                timelineId: page.id,
                marcherIds: all.slice(0, 2),
            });
            await expectRefused(
                db,
                () =>
                    mergeMoves({
                        db,
                        sourceId: split.timeline.id,
                        targetId: other.id,
                    }),
                // Page 3's move holds the split marchers too
                /in both Move 1 and Page 3/,
            );
            await expectRefused(
                db,
                () =>
                    mergeMoves({
                        db,
                        sourceId: page.id,
                        targetId: split.timeline.id,
                    }),
                /Page 2 is a page's own move/,
            );
            await expectRefused(db, () =>
                mergeMoves({
                    db,
                    sourceId: split.timeline.id,
                    targetId: split.timeline.id,
                }),
            );
            // A marcher in both: a move inside the split one's range can't be made by the app,
            // so stack a second same-range move with a marcher of the first, a layer up
            const [x] = all;
            const third = await splitMarchersIntoNewMove({
                db,
                timelineId: page.id,
                marcherIds: all.slice(2, 3),
            });
            await transactionWithHistory(db, "stack", async (tx) => {
                const [t] = await tx
                    .insert(schema.timeline_transitions)
                    .values({
                        timeline_id: third.timeline.id,
                        slot_count: 1,
                        start_beat: range.start,
                        end_beat: range.end,
                    })
                    .returning();
                await tx.insert(schema.timeline_slot_destinations).values({
                    transition_id: t!.id,
                    slot_index: 0,
                    x: 0,
                    y: 0,
                });
                await tx.insert(schema.timeline_assignments).values({
                    marcher_id: x!,
                    transition_id: t!.id,
                    slot_index: 0,
                    start_beat: range.start,
                    end_beat: range.end,
                    layer: 5,
                });
            });
            await expectRefused(
                db,
                () =>
                    mergeMoves({
                        db,
                        sourceId: third.timeline.id,
                        targetId: split.timeline.id,
                    }),
                /in both Move 2 and Move 1/,
            );
        });

        it("fits a stretched split move back to its page's counts: the page's counts win, one undo step", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const range = pageRange(pages, 2);
            const next = pageRange(pages, 3);
            const page = await timelineOf(db, range);
            const all = ids(marchersAndPages);
            const positionsBefore = await everyBeat(pages);
            const split = await splitMarchersIntoNewMove({
                db,
                timelineId: page.id,
                marcherIds: all.slice(0, 2),
            });
            const mid = next.start + Math.floor((next.end - next.start) / 2);
            await resizeTimeline({
                db,
                timelineId: split.timeline.id,
                start: range.start + 1,
                end: mid,
            });
            const before = await snapshot(db);

            await mergeMoves({
                db,
                sourceId: split.timeline.id,
                targetId: page.id,
            });

            const page2 = await membersOf(db, page.id);
            expect(page2.map((m) => m.marcher)).toEqual(all);
            for (const m of page2)
                expect([m.start, m.end]).toEqual([range.start, range.end]);
            expect(await violations(db)).toEqual([]);
            // Back where they were before the split: the page's set by the page's end
            expectSamePositions(positionsBefore, await everyBeat(pages));
            await roundTrip(db, before, await snapshot(db));
        });

        it("refuses a fit that would run a marcher into another of its moves on the same layer", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const page2 = await timelineOf(db, pageRange(pages, 2));
            const page3 = await timelineOf(db, pageRange(pages, 3));
            const [a, b] = ids(marchersAndPages);
            const fromTwo = await splitMarchersIntoNewMove({
                db,
                timelineId: page2.id,
                marcherIds: [a!],
            });
            const fromThree = await splitMarchersIntoNewMove({
                db,
                timelineId: page3.id,
                marcherIds: [b!],
            });
            // Fitted to Page 3's counts, a's row would overlap a's own Page 3 row
            await expectRefused(
                db,
                () =>
                    mergeMoves({
                        db,
                        sourceId: fromTwo.timeline.id,
                        targetId: fromThree.timeline.id,
                    }),
                /Fitting Move 1 to Move 2's counts would run .* into Page 3/,
            );
        });

        it("refuses a fit that would give a marcher two moves over the same counts (L-4)", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const p2 = pageRange(pages, 2);
            const p3 = pageRange(pages, 3);
            const p4 = pageRange(pages, 4);
            const page3 = await timelineOf(db, p3);
            const [a] = ids(marchersAndPages);
            // a's move split off Page 3, grown into Page 4 (its row rises over Page 4's move)
            // and shrunk back: Page 3's counts again, one layer up
            const offThree = await splitMarchersIntoNewMove({
                db,
                timelineId: page3.id,
                marcherIds: [a!],
            });
            await resizeTimeline({
                db,
                timelineId: offThree.timeline.id,
                start: p3.start,
                end: p4.start + 1,
            });
            await resizeTimeline({
                db,
                timelineId: offThree.timeline.id,
                start: p3.start,
                end: p3.end,
            });
            expect(
                (await membersOf(db, offThree.timeline.id)).map((m) => m.layer),
            ).toEqual([1]);
            const offTwo = await splitMarchersIntoNewMove({
                db,
                timelineId: (await timelineOf(db, p2)).id,
                marcherIds: [a!],
            });
            // Fitted to Page 3's counts, a's row would sit on layer 0 beside its layer-1 row
            // there: no same-layer overlap, but two moves over the same counts
            await expectRefused(
                db,
                () =>
                    mergeMoves({
                        db,
                        sourceId: offTwo.timeline.id,
                        targetId: page3.id,
                    }),
                /already in Move 1, over Page 3's counts/,
            );
        });
    });

    describe("a page with a split move (audit of one-timeline-per-range callers)", () => {
        it("can still move the page's flag: both moves on it follow, and keep sharing their range", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const range = pageRange(pages, 2);
            const page = await timelineOf(db, range);
            const all = ids(marchersAndPages);
            const split = await splitMarchersIntoNewMove({
                db,
                timelineId: page.id,
                marcherIds: all.slice(0, 2),
            });
            await movePageFlag({
                db,
                pageId: pages[2]!.id,
                beat: range.end - 1,
            });
            const moved = await db
                .select()
                .from(schema.timelines)
                .where(
                    sql`${schema.timelines.id} IN (${page.id}, ${split.timeline.id})`,
                )
                .all();
            expect(moved.map((t) => [t.start_beat, t.end_beat])).toEqual([
                [range.start, range.end - 1],
                [range.start, range.end - 1],
            ]);
            expect(await violations(db)).toEqual([]);
        });

        it("dragging a split-off marcher back to where the page starts takes it out of its move, so the page is Not set (holds 16)", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const range = pageRange(pages, 2);
            const page = await timelineOf(db, range);
            const [a, b] = ids(marchersAndPages);
            const split = await splitMarchersIntoNewMove({
                db,
                timelineId: page.id,
                marcherIds: [a!],
            });
            await timelineResolverSettled();
            const [x, y] = resolver().positionAt(a!, range.start);
            await moveMarchersInTarget({
                db,
                target: { kind: "range", ...range },
                moves: [{ marcherId: a!, x, y }],
            });
            // Emptied, the split-off move goes; the page's own move stays
            expect(
                await db
                    .select()
                    .from(schema.timelines)
                    .where(eq(schema.timelines.id, split.timeline.id))
                    .all(),
            ).toEqual([]);
            // The page's own rows are untouched by it
            expect(
                (await membersOf(db, page.id)).map((m) => m.marcher),
            ).toContain(b);
            expect(await violations(db)).toEqual([]);
        });

        it("a split move grows past its page over the next page's move, which catches up after it", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const range = pageRange(pages, 2);
            const next = pageRange(pages, 3);
            const page = await timelineOf(db, range);
            const [a, b, ...rest] = ids(marchersAndPages);
            const split = await splitMarchersIntoNewMove({
                db,
                timelineId: page.id,
                marcherIds: [a!, b!],
            });
            const limits = (await readTimelineResizeLimits(
                db,
                split.timeline.id,
            ))!;
            // Page 3's move doesn't stop the edge any more
            expect(limits.endEdge.max.beat).toBeGreaterThan(next.end);
            await timelineResolverSettled();
            const before = await everyBeat(pages);
            const setAt = (id: number, beat: number) => before.get(id)![beat]!;
            const mid = next.start + Math.floor((next.end - next.start) / 2);
            await resizeTimeline({
                db,
                timelineId: split.timeline.id,
                start: range.start,
                end: mid,
            });
            expect(await violations(db)).toEqual([]);
            // Its rows went above page 3's
            const rows = await membersOf(db, split.timeline.id);
            expect(rows.map((r) => [r.marcher, r.end, r.layer])).toEqual([
                [a, mid, 1],
                [b, mid, 1],
            ]);
            const after = await everyBeat(pages);
            for (const id of [a!, b!]) {
                // Page 2's set is reached at the new end, and page 3's still by its end
                expect(after.get(id)![mid]).toEqual(setAt(id, range.end));
                expect(after.get(id)![next.end]![0]).toBeCloseTo(
                    setAt(id, next.end)[0],
                    9,
                );
                expect(after.get(id)![next.end]![1]).toBeCloseTo(
                    setAt(id, next.end)[1],
                    9,
                );
            }
            // Everyone else is untouched
            for (const id of rest)
                expect(after.get(id)).toEqual(before.get(id));
            // Undo puts the layers and the range back
            const undo = await performUndo(db);
            expect(undo.success, undo.error?.message).toBe(true);
            expect(
                (await membersOf(db, split.timeline.id)).map((r) => [
                    r.end,
                    r.layer,
                ]),
            ).toEqual([
                [range.end, 0],
                [range.end, 0],
            ]);
            expect(await violations(db)).toEqual([]);
        });

        it("a split move can be resized back onto its page's exact counts, which share no marcher", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const range = pageRange(pages, 2);
            const page = await timelineOf(db, range);
            const all = ids(marchersAndPages);
            const split = await splitMarchersIntoNewMove({
                db,
                timelineId: page.id,
                marcherIds: all.slice(0, 2),
            });
            await resizeTimeline({
                db,
                timelineId: split.timeline.id,
                start: range.start,
                end: range.end - 1,
            });
            const limits = (await readTimelineResizeLimits(
                db,
                split.timeline.id,
            ))!;
            expect(limits.taken.map((t) => t.timelineId)).not.toContain(
                page.id,
            );
            await resizeTimeline({
                db,
                timelineId: split.timeline.id,
                start: range.start,
                end: range.end,
            });
            const back = await db
                .select()
                .from(schema.timelines)
                .where(eq(schema.timelines.id, split.timeline.id))
                .get();
            expect([back!.start_beat, back!.end_beat]).toEqual([
                range.start,
                range.end,
            ]);
            expect(await violations(db)).toEqual([]);
        });

        it("emptying the page's own timeline keeps it, so a move split off it doesn't become the page's", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const range = pageRange(pages, 2);
            const page = await timelineOf(db, range);
            const [a, ...rest] = ids(marchersAndPages);
            const split = await splitMarchersIntoNewMove({
                db,
                timelineId: page.id,
                marcherIds: rest,
            });
            const left = await membersOf(db, page.id);
            expect(left.map((m) => [m.marcher, m.slots])).toEqual([[a, 1]]);
            await timelineResolverSettled();
            const [x, y] = resolver().positionAt(a!, range.start);
            await moveMarchersInTarget({
                db,
                target: { kind: "range", ...range },
                moves: [{ marcherId: a!, x, y }],
            });
            // a's own move is gone, but the page's timeline stays (empty) as the oldest
            expect(await membersOf(db, page.id)).toEqual([]);
            expect((await timelineOf(db, range)).id).toBe(page.id);
            expect(
                (await membersOf(db, split.timeline.id)).map((m) => m.marcher),
            ).toEqual(rest);
            expect(await violations(db)).toEqual([]);
        });

        it("a drag in the window of a selected split move adds new marchers to that move", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const page = pageRange(pages, 3);
            // A move inside page 3 so some marchers aren't in any timeline over it
            const range = { start: page.start + 1, end: page.end - 1 };
            const [a, b, c] = ids(marchersAndPages);
            const { timelineId } = await addMarchersToTimeline({
                db,
                range,
                marcherIds: [a!, b!],
            });
            const split = await splitMarchersIntoNewMove({
                db,
                timelineId,
                marcherIds: [b!],
            });
            await moveMarchersInTarget({
                db,
                target: {
                    kind: "range",
                    ...range,
                    timelineId: split.timeline.id,
                },
                moves: [{ marcherId: c!, x: 12, y: 12 }],
            });
            expect(
                (await membersOf(db, split.timeline.id)).map((m) => m.marcher),
            ).toEqual([b, c]);
            expect(
                (await membersOf(db, timelineId)).map((m) => m.marcher),
            ).toEqual([a]);
        });
    });

    describe("splitting every marcher off a page (#581)", () => {
        /** Page 2's timeline with everyone split off it into a new move */
        const splitEveryone = async (
            db: DbConnection,
            m: { expectedMarchers: readonly { id: number }[] },
        ) => {
            const pages = await setUp(db);
            const range = pageRange(pages, 2);
            const page = await timelineOf(db, range);
            const all = ids(m);
            const membersBefore = await membersOf(db, page.id);
            const positionsBefore = await everyBeat(pages);
            const before = await snapshot(db);
            const result = await splitMarchersIntoNewMove({
                db,
                timelineId: page.id,
                marcherIds: all,
            });
            return {
                pages,
                range,
                page,
                all,
                membersBefore,
                positionsBefore,
                before,
                result,
            };
        };

        it("gives one new move with all of them; the page's look and timing don't change, and its timeline stays as the page box's, empty", async ({
            db,
            marchersAndPages,
        }) => {
            const {
                pages,
                range,
                page,
                all,
                membersBefore,
                positionsBefore,
                before,
                result,
            } = await splitEveryone(db, marchersAndPages);

            expect(result.marcherIds).toEqual(all);
            expect(result.notInMove).toEqual([]);
            expect([
                result.timeline.start_beat,
                result.timeline.end_beat,
                result.timeline.name,
            ]).toEqual([range.start, range.end, "Move 1"]);
            // Whole transitions moved: the same rows, now in the new move
            expect(await membersOf(db, result.timeline.id)).toEqual(
                membersBefore,
            );
            // The page box still stands for the page's timeline, which is left empty
            expect(await membersOf(db, page.id)).toEqual([]);
            expect((await timelineOf(db, range)).id).toBe(page.id);
            expect(await violations(db)).toEqual([]);
            expectSamePositions(positionsBefore, await everyBeat(pages));

            // One undo step, exact both ways
            await roundTrip(db, before, await snapshot(db));
            expectSamePositions(positionsBefore, await everyBeat(pages));
        });

        it("then resizes across two later page flags: the pages pass through as checkpoints, and undo is exact", async ({
            db,
            marchersAndPages,
        }) => {
            const { pages, range, page, all, result } = await splitEveryone(
                db,
                marchersAndPages,
            );
            expect(pages.length).toBeGreaterThan(4);
            const page3 = pageRange(pages, 3);
            const page4 = pageRange(pages, 4);
            // Past page 2's flag and page 3's, ending partway through page 4
            const end = page4.start + Math.floor((page4.end - page4.start) / 2);
            const limits = (await readTimelineResizeLimits(
                db,
                result.timeline.id,
            ))!;
            expect(limits.endEdge.max.beat).toBeGreaterThanOrEqual(end);
            const before = await everyBeat(pages);
            const setAt = (id: number, beat: number) => before.get(id)![beat]!;
            const beforeRows = await snapshot(db);

            await resizeTimeline({
                db,
                timelineId: result.timeline.id,
                start: range.start,
                end,
            });

            expect(await violations(db)).toEqual([]);
            const rows = await membersOf(db, result.timeline.id);
            expect(rows.map((r) => r.marcher)).toEqual(all);
            expect(rows.every((r) => r.end === end)).toBe(true);
            // Page 2's box keeps its (empty) timeline; the move is a clip across the flags
            expect((await timelineOf(db, range)).id).toBe(page.id);
            expect(await membersOf(db, page.id)).toEqual([]);
            const after = await everyBeat(pages);
            for (const id of all) {
                // Nothing changes before the move
                for (let beat = 0; beat <= range.start; beat++)
                    expect(after.get(id)![beat]).toEqual(setAt(id, beat));
                // Page 2's set is reached at the new end, passing page 2's and page 3's flags
                expect(after.get(id)![end]![0]).toBeCloseTo(
                    setAt(id, range.end)[0],
                    9,
                );
                expect(after.get(id)![end]![1]).toBeCloseTo(
                    setAt(id, range.end)[1],
                    9,
                );
                // Page 4's move catches up after it: its set still by its flag
                expect(after.get(id)![page4.end]![0]).toBeCloseTo(
                    setAt(id, page4.end)[0],
                    9,
                );
                expect(after.get(id)![page4.end]![1]).toBeCloseTo(
                    setAt(id, page4.end)[1],
                    9,
                );
            }
            expect(page3.end).toBeLessThan(end);

            // Undo puts the page's timing back; redo the resized move
            const resized = await snapshot(db);
            const undo = await performUndo(db);
            expect(undo.success, undo.error?.message).toBe(true);
            expect(await snapshot(db)).toEqual(beforeRows);
            expectSamePositions(before, await everyBeat(pages));
            const redo = await performRedo(db);
            expect(redo.success, redo.error?.message).toBe(true);
            expect(await snapshot(db)).toEqual(resized);
            expectSamePositions(after, await everyBeat(pages));
            expect(await violations(db)).toEqual([]);
        });

        it("splits a page whose move goes into a shape following the leader only whole: part of it is refused as today", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const range = pageRange(pages, 2);
            const page = await timelineOf(db, range);
            const [{ transition }] = await membersOf(db, page.id);
            await transactionWithHistory(db, "ftl", async (tx) => {
                const [shape] = await createTimelineShapesInTransaction({
                    tx,
                    newShapes: [
                        {
                            kind: "line",
                            geometry: {
                                points: [
                                    [0, 0],
                                    [500, 0],
                                ],
                            },
                        },
                    ],
                });
                await setTimelineTransitionDestinationInTransaction({
                    tx,
                    transitionId: transition,
                    destination: { kind: "shape", shapeId: shape!.id },
                });
                await updateTimelineTransitionsInTransaction({
                    tx,
                    modifiedTransitions: [
                        {
                            id: transition,
                            pathStyle: "follow_the_leader",
                            pathParams: { waypoints: [] },
                        },
                    ],
                });
            });
            const all = ids(marchersAndPages);
            await expectRefused(
                db,
                () =>
                    splitMarchersIntoNewMove({
                        db,
                        timelineId: page.id,
                        marcherIds: all.slice(1),
                    }),
                /move into one shape together/,
            );
            const positionsBefore = await everyBeat(pages);
            const result = await splitMarchersIntoNewMove({
                db,
                timelineId: page.id,
                marcherIds: all,
            });
            const moved = await membersOf(db, result.timeline.id);
            expect(new Set(moved.map((m) => m.transition))).toEqual(
                new Set([transition]),
            );
            expect(moved[0]!.style).toBe("follow_the_leader");
            expect(await violations(db)).toEqual([]);
            expectSamePositions(positionsBefore, await everyBeat(pages));
        });

        it("in Basic, the split move's marchers stay editable on the page until it crosses a flag", async ({
            db,
            marchersAndPages,
        }) => {
            const { pages, range, all, result } = await splitEveryone(
                db,
                marchersAndPages,
            );
            const boxes = pages.slice(1).map((_, i) => pageRange(pages, i + 1));
            const page2 = boxes.findIndex(
                (b) => b.start === range.start && b.end === range.end,
            );
            expect(
                lockedMarchersByPage(await readBasicRows(db), boxes).get(page2),
            ).toEqual(new Map());
            // Basic's write at the page's flag still works for one of them
            const [a, ...rest] = all;
            await timelineResolverSettled();
            const others = rest.map((id) => [
                id,
                resolver().positionAt(id, range.end),
            ]);
            await moveMarchersInTarget({
                db,
                target: { kind: "point", beat: range.end, box: range },
                moves: [{ marcherId: a!, x: 33, y: 44 }],
            });
            await timelineResolverSettled();
            expect(await violations(db)).toEqual([]);
            expect(resolver().positionAt(a!, range.end)).toEqual([33, 44]);
            for (const [id, at] of others)
                expect(resolver().positionAt(id as number, range.end)).toEqual(
                    at,
                );
            await performUndo(db);

            // Across a flag the move needs Expert: locked as Expert-made
            const page4 = pageRange(pages, 4);
            await resizeTimeline({
                db,
                timelineId: result.timeline.id,
                start: range.start,
                end: page4.start + 1,
            });
            const locked = lockedMarchersByPage(await readBasicRows(db), boxes);
            expect(
                [...locked.get(page2)!.keys()].sort((x, y) => x - y),
            ).toEqual(all);
            expect(new Set(locked.get(page2)!.values())).toEqual(
                new Set(["crossesFlag"]),
            );
        });
    });

    describe("the empty page timeline after page edits (#581 review)", () => {
        /**
         * Page 2's timeline with everyone split off it into a move over the same counts, as
         * `splitEveryone` above
         */
        const splitPage2 = async (
            db: DbConnection,
            m: { expectedMarchers: readonly { id: number }[] },
        ) => {
            const pages = await setUp(db);
            const range = pageRange(pages, 2);
            const page = await timelineOf(db, range);
            const { timeline: move } = await splitMarchersIntoNewMove({
                db,
                timelineId: page.id,
                marcherIds: ids(m),
            });
            expect(await membersOf(db, page.id)).toEqual([]);
            return { pages, range, page, move };
        };

        /** Timelines with no transition, as `[id, start, end]` */
        const emptyTimelines = async (db: DbConnection) => {
            const used = new Set(
                (
                    await db
                        .select({ id: schema.timeline_transitions.timeline_id })
                        .from(schema.timeline_transitions)
                        .all()
                ).map((t) => t.id),
            );
            return (
                await db
                    .select()
                    .from(schema.timelines)
                    .orderBy(asc(schema.timelines.id))
                    .all()
            )
                .filter((t) => !used.has(t.id))
                .map((t) => [t.id, t.start_beat, t.end_beat]);
        };

        const rangeOf = async (db: DbConnection, timelineId: number) => {
            const t = await db
                .select()
                .from(schema.timelines)
                .where(eq(schema.timelines.id, timelineId))
                .get();
            return t ? [t.start_beat, t.end_beat] : undefined;
        };

        /** Runs `edit`, then checks one undo and one redo restore each side exactly */
        const exactUndo = async (
            db: DbConnection,
            edit: () => Promise<unknown>,
        ) => {
            const before = await snapshot(db);
            await edit();
            expect(await violations(db)).toEqual([]);
            await roundTrip(db, before, await snapshot(db));
        };

        it("Delete page and its moves takes the empty page timeline with the page", async ({
            db,
            marchersAndPages,
        }) => {
            const { pages, page } = await splitPage2(db, marchersAndPages);
            await exactUndo(db, () =>
                deletePagesWithMoves({ db, pageIds: new Set([pages[2]!.id]) }),
            );
            expect(await rangeOf(db, page.id)).toBeUndefined();
            expect(await emptyTimelines(db)).toEqual([]);
        });

        it("Delete page (yank) of a page left with only its empty timeline deletes it rather than refusing", async ({
            db,
            marchersAndPages,
        }) => {
            const { pages, page, move } = await splitPage2(
                db,
                marchersAndPages,
            );
            await deleteTimeline({ db, timelineId: move.id });
            const page3 = pageRange(pages, 3);
            const page3Timeline = (await timelineOf(db, page3)).id;
            await exactUndo(db, () =>
                deletePageYankWithMoves({ db, pageId: pages[2]!.id }),
            );
            expect(await rangeOf(db, page.id)).toBeUndefined();
            expect(await emptyTimelines(db)).toEqual([]);
            // Page 3's box moved back onto page 2's counts: it still stands for page 3's move
            const moved = {
                start: page.start_beat,
                end: page.start_beat + page3.end - page3.start,
            };
            expect((await timelineOf(db, moved)).id).toBe(page3Timeline);
        });

        it("deleting page 2's flag or page 1's, keeping moves, drops the empty page timeline and leaves the split move a clip", async ({
            db,
            marchersAndPages,
        }) => {
            const { pages, range, page, move } = await splitPage2(
                db,
                marchersAndPages,
            );
            const positions = await everyBeat(pages);
            for (const flag of [2, 1]) {
                await exactUndo(db, () =>
                    deletePageFlags({
                        db,
                        pageIds: new Set([pages[flag]!.id]),
                    }),
                );
                expect(await rangeOf(db, page.id)).toBeUndefined();
                expect(await emptyTimelines(db)).toEqual([]);
                expect(await rangeOf(db, move.id)).toEqual([
                    range.start,
                    range.end,
                ]);
                expectSamePositions(positions, await everyBeat(pages));
                await performUndo(db);
            }
        });

        it("a flag added mid page 2 (Expert) drops the empty page timeline; the split move stays a move across the flag", async ({
            db,
            marchersAndPages,
        }) => {
            const { pages, range, page, move } = await splitPage2(
                db,
                marchersAndPages,
            );
            const positions = await everyBeat(pages);
            await exactUndo(db, () =>
                addPageFlag({ db, beat: range.start + 4 }),
            );
            expect(await rangeOf(db, page.id)).toBeUndefined();
            expect(await emptyTimelines(db)).toEqual([]);
            expect(await rangeOf(db, move.id)).toEqual([
                range.start,
                range.end,
            ]);
            expectSamePositions(positions, await everyBeat(pages));
        });

        it("an edit elsewhere keeps the empty page timeline while the split move shares its box", async ({
            db,
            marchersAndPages,
        }) => {
            const { pages, range, page, move } = await splitPage2(
                db,
                marchersAndPages,
            );
            await addPageFlag({ db, beat: pageRange(pages, 4).start + 2 });
            await deletePageFlags({ db, pageIds: new Set([pages[5]!.id]) });
            expect(await violations(db)).toEqual([]);
            expect(await emptyTimelines(db)).toEqual([
                [page.id, range.start, range.end],
            ]);
            expect((await timelineOf(db, range)).id).toBe(page.id);
            expect(await rangeOf(db, move.id)).toEqual([
                range.start,
                range.end,
            ]);

            // Deleting page 3 grows page 2's box over it: both timelines follow its flag
            const grown = { start: range.start, end: pageRange(pages, 3).end };
            await exactUndo(db, () =>
                deletePagesWithMoves({ db, pageIds: new Set([pages[3]!.id]) }),
            );
            expect(await emptyTimelines(db)).toEqual([
                [page.id, grown.start, grown.end],
            ]);
            expect((await timelineOf(db, grown)).id).toBe(page.id);
            expect(await rangeOf(db, move.id)).toEqual([
                grown.start,
                grown.end,
            ]);
        });

        it("Basic's Split page keeps the split move's halves moves: each new box keeps an empty page timeline older than its half", async ({
            db,
            marchersAndPages,
        }) => {
            const { pages, range, page } = await splitPage2(
                db,
                marchersAndPages,
            );
            const all = ids(marchersAndPages);
            const positions = await everyBeat(pages);
            const beat = range.start + 4;
            await exactUndo(db, () =>
                addPageFlag({ db, beat, splitMoves: true }),
            );
            expectSamePositions(positions, await everyBeat(pages));
            // The old page timeline crossed the new flag, so it went
            expect(await rangeOf(db, page.id)).toBeUndefined();
            for (const half of [
                { start: range.start, end: beat },
                { start: beat, end: range.end },
            ]) {
                const over = await db
                    .select()
                    .from(schema.timelines)
                    .where(
                        sql`${schema.timelines.start_beat} = ${half.start} AND ${schema.timelines.end_beat} = ${half.end}`,
                    )
                    .orderBy(asc(schema.timelines.id))
                    .all();
                // The box's own (oldest) timeline is empty; the half is a move over it
                expect(over).toHaveLength(2);
                expect(await membersOf(db, over[0]!.id)).toEqual([]);
                expect(
                    (await membersOf(db, over[1]!.id)).map((m) => m.marcher),
                ).toEqual(all);
                expect(over[1]!.name).toMatch(/^Move \d+$/);
            }
        });

        it("Basic's Split page of a page with some marchers split off: the page's halves are the new boxes', the move's halves stay moves", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const range = pageRange(pages, 2);
            const page = await timelineOf(db, range);
            const all = ids(marchersAndPages);
            const chosen = all.slice(0, 2);
            await splitMarchersIntoNewMove({
                db,
                timelineId: page.id,
                marcherIds: chosen,
            });
            const positions = await everyBeat(pages);
            const beat = range.start + 4;
            const before = await snapshot(db);
            await addPageFlag({ db, beat, splitMoves: true });
            expect(await violations(db)).toEqual([]);
            await roundTrip(db, before, await snapshot(db));
            expectSamePositions(positions, await everyBeat(pages));
            for (const half of [
                { start: range.start, end: beat },
                { start: beat, end: range.end },
            ]) {
                const over = await db
                    .select()
                    .from(schema.timelines)
                    .where(
                        sql`${schema.timelines.start_beat} = ${half.start} AND ${schema.timelines.end_beat} = ${half.end}`,
                    )
                    .orderBy(asc(schema.timelines.id))
                    .all();
                expect(over).toHaveLength(2);
                expect(
                    (await membersOf(db, over[0]!.id)).map((m) => m.marcher),
                ).toEqual(all.slice(2));
                expect(
                    (await membersOf(db, over[1]!.id)).map((m) => m.marcher),
                ).toEqual(chosen);
            }
        });

        /** Adds a flag mid page 4, deletes page 5's flag, moves page 4's and deletes page 4 */
        const pageEditsAfterPage3 = async (db: DbConnection, pages: Page[]) => {
            expect(pages.length).toBeGreaterThan(5);
            const page4 = pageRange(pages, 4);
            await addPageFlag({ db, beat: page4.start + 2 });
            expect(await violations(db)).toEqual([]);
            await deletePageFlags({ db, pageIds: new Set([pages[5]!.id]) });
            expect(await violations(db)).toEqual([]);
            await movePageFlag({
                db,
                pageId: pages[4]!.id,
                beat: page4.end - 1,
            });
            expect(await violations(db)).toEqual([]);
            await deletePagesWithMoves({
                db,
                pageIds: new Set([pages[4]!.id]),
            });
            expect(await violations(db)).toEqual([]);
        };

        it("a move emptied with Remove stays through page edits elsewhere (UI-9 Remove)", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const range = {
                start: pageRange(pages, 2).start,
                end: pageRange(pages, 3).end,
            };
            const marcherId = ids(marchersAndPages)[0]!;
            const { timelineId } = await createTrack({
                db,
                target: { kind: "marcher", marcherId },
                startBeat: range.start,
                endBeat: range.end,
            });
            await renameTimeline({ db, timelineId, name: "Kept empty" });
            await removeMarchersFromTimeline({
                db,
                timelineId,
                marcherIds: [marcherId],
            });
            expect(await membersOf(db, timelineId)).toEqual([]);

            await pageEditsAfterPage3(db, pages);
            const kept = await db
                .select()
                .from(schema.timelines)
                .where(eq(schema.timelines.id, timelineId))
                .get();
            expect([kept?.name, kept?.start_beat, kept?.end_beat]).toEqual([
                "Kept empty",
                range.start,
                range.end,
            ]);
        });
    });

    describe("blockers", () => {
        it("say why a split or a merge can't run", () => {
            const members = new Set([1, 2, 3]);
            expect(splitMembershipBlocker(members, [1], "Move 1")).toBeNull();
            expect(splitMembershipBlocker(members, [4], "Move 1")).toMatch(
                /Select marchers in Move 1/,
            );
            expect(
                splitMembershipBlocker(members, [1, 2, 3, 4], "Move 2"),
            ).toMatch(/Every marcher in Move 2/);
            // A page's own move can be split off whole (#581)
            expect(
                splitMembershipBlocker(members, [1, 2, 3, 4], "Page 2", {
                    pageMove: true,
                }),
            ).toBeNull();
            expect(
                splitMembershipBlocker(members, [4], "Page 2", {
                    pageMove: true,
                }),
            ).toMatch(/Select marchers in Page 2/);
            // Worded by the caller's translation
            expect(
                splitMembershipBlocker(members, [1, 2, 3], "Move 2", {
                    t: (key, _english, params) =>
                        `${key}:${params?.name ?? ""}`,
                }),
            ).toBe("timeline.split.everyMarcher:Move 2");
            expect(mergeFits({ start: 1, end: 5 }, { start: 1, end: 5 })).toBe(
                false,
            );
            expect(mergeFits({ start: 1, end: 5 }, { start: 1, end: 6 })).toBe(
                true,
            );
        });
    });
});

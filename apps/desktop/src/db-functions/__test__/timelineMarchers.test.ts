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
import { createMarchers, deleteMarchers, NewMarcherArgs } from "../marcher";
import { createTimelineShapesInTransaction } from "../timelineShapes";
import { createTimelinesInTransaction } from "../timelines";
import { createTimelineAssignmentsInTransaction } from "../timelineAssignments";
import {
    createTimelineTransitionsInTransaction,
    setTimelineTransitionDestinationInTransaction,
} from "../timelineTransitions";
import {
    keepFixturesInPageMode,
    setTimelineModeFlag,
} from "@/test/timelineMode";

// P7.17: these tests set up timeline mode themselves
keepFixturesInPageMode(
    "its tests convert the show or write timeline rows, and set the flag, themselves",
);

/**
 * Marcher add and delete in timeline mode (docs/timeline/phases/07-page-parity.md P7.3, reworked
 * for UI-9 by P8.14), mostly on a converted `marchersAndPages` show: page 0 plus six pages, one
 * show-wide timeline holding one shapeless direct transition per page N ≥ 1 with one slot per
 * marcher.
 */

afterEach(() => stopTimelineResolver());

const TABLES = [
    schema.marchers,
    schema.marcher_pages,
    schema.timelines,
    schema.timeline_shapes,
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

/**
 * Converts the show, sets the file's timeline flag (on unless `flag` is false), starts the store
 * on it, and returns the pages in order.
 */
const setUp = async (db: DbConnection, flag = true): Promise<Page[]> => {
    await convertPagesToTimeline(db);
    await setTimelineModeFlag(db, flag);
    await startTimelineResolver(db);
    const { pages } = await readShowTiming(db);
    return [...pages].sort((a, b) => a.order - b.order);
};

/** Each marcher's position at each page end, keyed by marcher id. */
const pageEnds = (pages: readonly Page[]) => {
    const r = resolver();
    const out = new Map<number, [number, number][]>();
    for (const id of r.marcherIds())
        out.set(
            id,
            pages.map((p) => r.positionAt(id, pageEndBeat(p)) as never),
        );
    return out;
};

/** Each marcher's position a third of the way through each transition, keyed by marcher id. */
const midTransitions = (
    ts: readonly { start_beat: number; end_beat: number }[],
) => {
    const r = resolver();
    const out = new Map<number, [number, number][]>();
    for (const id of r.marcherIds())
        out.set(
            id,
            ts.map(
                (t) =>
                    r.positionAt(
                        id,
                        t.start_beat + (t.end_beat - t.start_beat) / 3,
                    ) as never,
            ),
        );
    return out;
};

/** Every position in `after` is bit for bit the one in `before`, for the marchers in `before`. */
const expectSamePositions = (
    before: Map<number, [number, number][]>,
    after: Map<number, [number, number][]>,
    except: ReadonlySet<number> = new Set(),
) => {
    for (const [id, points] of before) {
        if (except.has(id)) continue;
        const now = after.get(id);
        expect(now, `marcher ${id}`).toBeDefined();
        points.forEach(([x, y], i) => {
            expect(Object.is(now![i]![0], x), `marcher ${id} page ${i} x`).toBe(
                true,
            );
            expect(Object.is(now![i]![1], y), `marcher ${id} page ${i} y`).toBe(
                true,
            );
        });
    }
};

const violations = async (db: DbConnection) =>
    await db.all(
        sql`SELECT code, transition_id, detail FROM timeline_commit_violations`,
    );

const vacancies = () =>
    resolver()
        .diagnostics()
        .filter((d) => d.code === "D-VACANT");

const transitions = async (db: DbConnection) =>
    await db
        .select()
        .from(schema.timeline_transitions)
        .orderBy(schema.timeline_transitions.start_beat)
        .all();

const NEW_MARCHER: NewMarcherArgs = {
    section: "Trumpet",
    drill_prefix: "N",
    drill_order: 1,
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
    await timelineResolverSettled();

    const redo = await performRedo(db);
    expect(redo.success, redo.error?.message).toBe(true);
    expect(await snapshot(db)).toEqual(after);
    expect(await violations(db)).toEqual([]);
    await timelineResolverSettled();
};

describeDbTests("marcher add and delete in timeline mode", (it) => {
    describe("add", () => {
        it("gives the new marcher a home and its own one-slot transition in every stored timeline (UI-9)", async ({
            db,
            marchersAndPages: _,
        }) => {
            const pages = await setUp(db);
            const transitionsBefore = await transitions(db);
            const timelinesBefore = await db
                .select()
                .from(schema.timelines)
                .all();
            // The converter writes one timeline per page move (P9.10)
            expect(timelinesBefore.length).toBe(pages.length - 1);
            const endsBefore = pageEnds(pages);
            const before = await snapshot(db);

            const [created] = await createMarchers({
                db,
                newMarchers: [NEW_MARCHER],
            });
            const id = created!.id;
            const marcher = await db
                .select()
                .from(schema.marchers)
                .where(eq(schema.marchers.id, id))
                .get();
            const home = [marcher!.home_x, marcher!.home_y] as const;
            // Not on top of anyone's home
            const others = await db.select().from(schema.marchers).all();
            for (const o of others)
                if (o.id !== id)
                    expect([o.home_x, o.home_y]).not.toEqual([...home]);

            // The page moves are untouched: no slot was added to them
            const transitionsAfter = await transitions(db);
            for (const t of transitionsBefore)
                expect(transitionsAfter.find((a) => a.id === t.id)).toEqual(t);
            // One new transition per timeline: one slot at the home, spanning its timeline
            const added = transitionsAfter.filter(
                (t) => !transitionsBefore.some((b) => b.id === t.id),
            );
            expect(added.map((t) => t.timeline_id).sort()).toEqual(
                timelinesBefore.map((t) => t.id).sort(),
            );
            const rows = await db
                .select()
                .from(schema.timeline_assignments)
                .where(eq(schema.timeline_assignments.marcher_id, id))
                .all();
            expect(rows.length).toBe(timelinesBefore.length);
            for (const timeline of timelinesBefore) {
                const own = added.find((t) => t.timeline_id === timeline.id)!;
                expect(own).toMatchObject({
                    dest_shape_id: null,
                    path_style: "direct",
                    slot_count: 1,
                    start_beat: timeline.start_beat,
                    end_beat: timeline.end_beat,
                });
                // Page timelines don't overlap, so every join is at layer 0
                expect(
                    rows.find((r) => r.transition_id === own.id),
                ).toMatchObject({
                    slot_index: 0,
                    start_beat: timeline.start_beat,
                    end_beat: timeline.end_beat,
                    layer: 0,
                });
                const dest = await db
                    .select()
                    .from(schema.timeline_slot_destinations)
                    .where(
                        eq(
                            schema.timeline_slot_destinations.transition_id,
                            own.id,
                        ),
                    )
                    .all();
                expect(dest.map((d) => [d.slot_index, d.x, d.y])).toEqual([
                    [0, ...home],
                ]);
            }

            // The resolver puts it on its home everywhere and moves no one else
            await timelineResolverSettled();
            const endsAfter = pageEnds(pages);
            for (const [x, y] of endsAfter.get(id)!) {
                expect(Object.is(x, home[0])).toBe(true);
                expect(Object.is(y, home[1])).toBe(true);
            }
            const [mx, my] = resolver().positionAt(
                id,
                (pageEndBeat(pages[1]!) + pageEndBeat(pages[2]!)) / 2,
            );
            expect([mx, my]).toEqual([...home]);
            expectSamePositions(endsBefore, endsAfter);
            expect(vacancies()).toEqual([]);
            expect(await violations(db)).toEqual([]);

            const after = await snapshot(db);
            await roundTrip(db, before, after);
            expect(pageEnds(pages).get(id)).toEqual(endsAfter.get(id));
        });

        it("places several new marchers side by side, each with its own transition", async ({
            db,
            marchersAndPages: _,
        }) => {
            const pages = await setUp(db);
            const transitionsBefore = await transitions(db);
            const endsBefore = pageEnds(pages);
            const created = await createMarchers({
                db,
                newMarchers: [
                    NEW_MARCHER,
                    { ...NEW_MARCHER, drill_order: 2 },
                    { ...NEW_MARCHER, drill_order: 3 },
                ],
            });
            const homes = await db
                .select()
                .from(schema.marchers)
                .all()
                .then((rows) =>
                    created.map((c) => {
                        const r = rows.find((row) => row.id === c.id)!;
                        return [r.home_x, r.home_y];
                    }),
                );
            expect(new Set(homes.map((h) => h.join())).size).toBe(3);
            expect(homes[1]![1]).toBe(homes[0]![1]);
            expect(homes[1]![0]).toBeGreaterThan(homes[0]![0]!);

            const transitionsAfter = await transitions(db);
            // One page timeline per page move (P9.10), and a transition per marcher in each
            const timelineCount = pages.length - 1;
            expect(transitionsAfter.length).toBe(
                transitionsBefore.length + 3 * timelineCount,
            );
            const rows = await db
                .select()
                .from(schema.timeline_assignments)
                .all();
            const own = created.map(
                (c) => rows.filter((r) => r.marcher_id === c.id)!,
            );
            for (const r of own) expect(r.length).toBe(timelineCount);
            // Nobody shares a transition: each row is in its own
            expect(new Set(own.flat().map((r) => r.transition_id)).size).toBe(
                3 * timelineCount,
            );
            await timelineResolverSettled();
            const endsAfter = pageEnds(pages);
            created.forEach((c, i) => {
                for (const p of endsAfter.get(c.id)!)
                    expect(p).toEqual(homes[i]);
            });
            expectSamePositions(endsBefore, endsAfter);
            expect(vacancies()).toEqual([]);
        });

        it("joins timelines in start order, a layer up inside another, and skips a partial overlap (UI-9 New marchers and overlaps)", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setTimelineModeFlag(db, true);
            await startTimelineResolver(db);
            // Stored timelines, some of them empty: [0, 8) holds [2, 6); [6, 12) only partly
            // overlaps [0, 8); [12, 16) is after both
            const made = await transactionWithHistory(
                db,
                "timelines",
                async (tx) =>
                    await createTimelinesInTransaction({
                        tx,
                        newTimelines: [
                            { startBeat: 6, endBeat: 12 },
                            { startBeat: 2, endBeat: 6 },
                            { startBeat: 12, endBeat: 16 },
                            { startBeat: 0, endBeat: 8 },
                        ],
                    }),
            );
            const byRange = (start: number, end: number) =>
                made.find((t) => t.start_beat === start && t.end_beat === end)!
                    .id;
            const before = await snapshot(db);

            const [created] = await createMarchers({
                db,
                newMarchers: [NEW_MARCHER],
            });
            const rows = await db
                .select({
                    timeline: schema.timeline_transitions.timeline_id,
                    layer: schema.timeline_assignments.layer,
                    slots: schema.timeline_transitions.slot_count,
                })
                .from(schema.timeline_assignments)
                .innerJoin(
                    schema.timeline_transitions,
                    eq(
                        schema.timeline_transitions.id,
                        schema.timeline_assignments.transition_id,
                    ),
                )
                .where(eq(schema.timeline_assignments.marcher_id, created!.id))
                .all();
            expect(rows.sort((a, b) => a.timeline - b.timeline)).toEqual(
                [
                    { timeline: byRange(0, 8), layer: 0, slots: 1 },
                    { timeline: byRange(2, 6), layer: 1, slots: 1 },
                    { timeline: byRange(12, 16), layer: 0, slots: 1 },
                ].sort((a, b) => a.timeline - b.timeline),
            );
            expect(await violations(db)).toEqual([]);

            // It stands at home throughout
            await timelineResolverSettled();
            const marcher = await db
                .select()
                .from(schema.marchers)
                .where(eq(schema.marchers.id, created!.id))
                .get();
            for (const beat of [0, 3, 7, 10, 14, 16])
                expect(resolver().positionAt(created!.id, beat)).toEqual([
                    marcher!.home_x,
                    marcher!.home_y,
                ]);
            await roundTrip(db, before, await snapshot(db));
        });
    });

    describe("delete", () => {
        it("removes the marcher's slots without moving anyone else (QA-UNDO-3)", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const transitionsBefore = await transitions(db);
            const endsBefore = pageEnds(pages);
            const before = await snapshot(db);
            // A marcher in the middle of the slot order
            const ids = marchersAndPages.expectedMarchers.map((m) => m.id);
            const victim = ids[1]!;
            // Per transition: the victim's slot, and the last slot's marcher and point
            const assignments = await db
                .select()
                .from(schema.timeline_assignments)
                .all();
            const points = await db
                .select()
                .from(schema.timeline_slot_destinations)
                .all();
            const expectedMoves = transitionsBefore.map((t) => {
                const vacated = assignments.find(
                    (a) => a.transition_id === t.id && a.marcher_id === victim,
                )!.slot_index;
                const last = assignments.find(
                    (a) =>
                        a.transition_id === t.id &&
                        a.slot_index === t.slot_count - 1,
                )!;
                const point = points.find(
                    (d) =>
                        d.transition_id === t.id &&
                        d.slot_index === t.slot_count - 1,
                )!;
                return { t, vacated, last, point };
            });
            expect(
                expectedMoves.every((m) => m.vacated < m.t.slot_count - 1),
                "the victim is not in the last slot",
            ).toBe(true);
            const midBefore = midTransitions(transitionsBefore);

            await deleteMarchers({
                db,
                marcherIds: new Set([victim]),
            });
            // The last slot's marcher and point moved into the vacated slot
            for (const { t, vacated, last, point } of expectedMoves) {
                const moved = await db
                    .select()
                    .from(schema.timeline_assignments)
                    .where(eq(schema.timeline_assignments.id, last.id))
                    .get();
                expect(moved!.slot_index).toBe(vacated);
                const dest = await db
                    .select()
                    .from(schema.timeline_slot_destinations)
                    .where(
                        eq(
                            schema.timeline_slot_destinations.transition_id,
                            t.id,
                        ),
                    )
                    .all()
                    .then((rows) => rows.find((r) => r.slot_index === vacated));
                expect(Object.is(dest!.x, point.x)).toBe(true);
                expect(Object.is(dest!.y, point.y)).toBe(true);
            }
            const left = await db
                .select()
                .from(schema.timeline_assignments)
                .where(eq(schema.timeline_assignments.marcher_id, victim))
                .all();
            expect(left).toEqual([]);
            const transitionsAfter = await transitions(db);
            transitionsAfter.forEach((t, i) =>
                expect(t.slot_count).toBe(transitionsBefore[i]!.slot_count - 1),
            );
            expect(await violations(db)).toEqual([]);

            await timelineResolverSettled();
            expect(resolver().marcherIds()).not.toContain(victim);
            const endsAfter = pageEnds(pages);
            expectSamePositions(endsBefore, endsAfter, new Set([victim]));
            // And mid-transition, while the marchers are on the move
            expectSamePositions(
                midBefore,
                midTransitions(transitionsBefore),
                new Set([victim]),
            );
            expect(vacancies()).toEqual([]);

            const after = await snapshot(db);
            await roundTrip(db, before, after);
            // Undo brought back the marcher at its old positions
            await performUndo(db);
            await timelineResolverSettled();
            expectSamePositions(endsBefore, pageEnds(pages));
        });

        it("deletes several marchers at once, including the last slot", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const transitionsBefore = await transitions(db);
            const endsBefore = pageEnds(pages);
            const before = await snapshot(db);
            const lastSlotMarcher = (
                await db
                    .select()
                    .from(schema.timeline_assignments)
                    .where(
                        eq(
                            schema.timeline_assignments.transition_id,
                            transitionsBefore[0]!.id,
                        ),
                    )
                    .all()
            ).find(
                (r) => r.slot_index === transitionsBefore[0]!.slot_count - 1,
            )!.marcher_id;
            const victims = new Set([
                marchersAndPages.expectedMarchers[0]!.id,
                lastSlotMarcher,
            ]);

            await deleteMarchers({
                db,
                marcherIds: victims,
            });
            const transitionsAfter = await transitions(db);
            transitionsAfter.forEach((t, i) =>
                expect(t.slot_count).toBe(transitionsBefore[i]!.slot_count - 2),
            );
            await timelineResolverSettled();
            expectSamePositions(endsBefore, pageEnds(pages), victims);
            expect(vacancies()).toEqual([]);
            await roundTrip(db, before, await snapshot(db));
        });

        it("undoes an add by deleting the new marcher's last slots", async ({
            db,
            marchersAndPages: _,
        }) => {
            const pages = await setUp(db);
            const before = await snapshot(db);
            const [created] = await createMarchers({
                db,
                newMarchers: [NEW_MARCHER],
            });
            await deleteMarchers({
                db,
                marcherIds: new Set([created!.id]),
            });
            const after = await snapshot(db);
            // Back to the converted show, apart from the page rows and ids of the deleted marcher
            expect(after.timeline_transitions).toEqual(
                before.timeline_transitions,
            );
            expect(after.timeline_assignments).toEqual(
                before.timeline_assignments,
            );
            await timelineResolverSettled();
            expect(vacancies()).toEqual([]);
            expect(pages.length).toBeGreaterThan(1);
        });

        it("leaves vacant slots in shape-backed transitions (D-13)", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const shaped = (await transitions(db))[1]!;
            await transactionWithHistory(db, "toShape", async (tx) => {
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
                    transitionId: shaped.id,
                    destination: { kind: "shape", shapeId: shape!.id },
                });
            });
            await timelineResolverSettled();
            const endsBefore = pageEnds(pages);
            const before = await snapshot(db);
            const victim = marchersAndPages.expectedMarchers[0]!.id;

            await deleteMarchers({
                db,
                marcherIds: new Set([victim]),
            });
            const after = (await transitions(db)).find(
                (t) => t.id === shaped.id,
            )!;
            expect(after.slot_count).toBe(shaped.slot_count);
            await timelineResolverSettled();
            expectSamePositions(endsBefore, pageEnds(pages), new Set([victim]));
            const vacant = vacancies();
            expect(vacant.length).toBe(1);
            expect(vacant[0]!.transitionId).toBe(shaped.id);
            expect(await violations(db)).toEqual([]);
            await roundTrip(db, before, await snapshot(db));
        });

        it("leaves slots vacant where a follow-the-leader transition may inherit their order", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUp(db);
            const ts = await transitions(db);
            const last = ts[ts.length - 1]!;
            const [m0, m1, m2] = marchersAndPages.expectedMarchers;
            await transactionWithHistory(db, "addFtl", async (tx) => {
                // It shares the last page move's timeline (C-11; one timeline per range, C-12)
                const timeline = { id: last.timeline_id };
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
                const [ftl] = await createTimelineTransitionsInTransaction({
                    tx,
                    newTransitions: [
                        {
                            timelineId: timeline!.id,
                            startBeat: last.start_beat,
                            endBeat: last.end_beat,
                            slotCount: 2,
                            destination: { kind: "shape", shapeId: shape!.id },
                            pathStyle: "follow_the_leader",
                            pathParams: { waypoints: [] },
                        },
                    ],
                });
                await createTimelineAssignmentsInTransaction({
                    tx,
                    newAssignments: [m1!, m2!].map((m, slot) => ({
                        marcherId: m.id,
                        transitionId: ftl!.id,
                        slotIndex: slot,
                        startBeat: last.start_beat,
                        endBeat: last.end_beat,
                        layer: 1,
                    })),
                });
            });
            await timelineResolverSettled();
            const endsBefore = pageEnds(pages);
            const before = await snapshot(db);

            await deleteMarchers({
                db,
                marcherIds: new Set([m0!.id]),
            });
            // Every page move shares m1 and m2 with the follow-the-leader transition
            const after = await transitions(db);
            for (const t of ts)
                expect(after.find((a) => a.id === t.id)!.slot_count).toBe(
                    t.slot_count,
                );
            await timelineResolverSettled();
            expectSamePositions(endsBefore, pageEnds(pages), new Set([m0!.id]));
            expect(vacancies().length).toBe(ts.length);
            expect(await violations(db)).toEqual([]);
            await roundTrip(db, before, await snapshot(db));
        });
    });

    describe("flag off", () => {
        it("creates and deletes marchers as page mode always has", async ({
            db,
            marchersAndPages,
        }) => {
            await setUp(db, false);
            const before = await snapshot(db);
            const [created] = await createMarchers({
                db,
                newMarchers: [NEW_MARCHER],
            });
            const afterCreate = await snapshot(db);
            // No timeline row changed, the home is the column default, and page rows were added
            for (const name of [
                "timelines",
                "timeline_shapes",
                "timeline_transitions",
                "timeline_assignments",
                "timeline_slot_destinations",
            ])
                expect(afterCreate[name], name).toEqual(before[name]);
            const marcher = await db
                .select()
                .from(schema.marchers)
                .where(eq(schema.marchers.id, created!.id))
                .get();
            expect([marcher!.home_x, marcher!.home_y]).toEqual([0, 0]);
            expect(afterCreate.marcher_pages!.length).toBeGreaterThan(
                before.marcher_pages!.length,
            );

            // Delete: the assignments go through the cascade, slot counts stay
            const victim = marchersAndPages.expectedMarchers[0]!.id;
            await deleteMarchers({ db, marcherIds: new Set([victim]) });
            const afterDelete = await snapshot(db);
            expect(afterDelete.timeline_transitions).toEqual(
                before.timeline_transitions,
            );
            expect(afterDelete.timeline_slot_destinations).toEqual(
                before.timeline_slot_destinations,
            );
            expect(
                (
                    afterDelete.timeline_assignments as { marcher_id: number }[]
                ).some((r) => r.marcher_id === victim),
            ).toBe(false);
        });
    });
});

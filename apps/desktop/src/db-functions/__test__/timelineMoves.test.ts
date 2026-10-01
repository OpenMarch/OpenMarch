import { afterEach, describe, expect } from "vitest";
import { and, eq, getTableName } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
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
import { TimelineWriteError } from "../timelineErrors";
import { createTimelineShapesInTransaction } from "../timelineShapes";
import { createTimelineAssignmentsInTransaction } from "../timelineAssignments";
import {
    createTimelineTransitionsInTransaction,
    setTimelineTransitionDestinationInTransaction,
    updateTimelineTransitionsInTransaction,
} from "../timelineTransitions";
import { moveMarchersOnPage } from "../timelineMoves";
import { keepFixturesInPageMode } from "@/test/timelineMode";

// P7.17: these tests set up timeline mode themselves
keepFixturesInPageMode(
    "its tests convert the show or write timeline rows, and set the flag, themselves",
);

/**
 * "Move a marcher on page N" as timeline writes (docs/timeline/phases/07-page-parity.md P7.2), on
 * a converted `marchersAndPages` show: page 0 plus six pages, one shapeless direct transition per
 * page N ≥ 1 with one slot per marcher.
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

/** Converts the show, starts the store on it, and returns the pages in order. */
const setUp = async (db: DbConnection): Promise<Page[]> => {
    await convertPagesToTimeline(db);
    await startTimelineResolver(db);
    const { pages } = await readShowTiming(db);
    return [...pages].sort((a, b) => a.order - b.order);
};

/** The marcher's assignment in the transition that ends at `page`'s end beat. */
const slotOf = async (db: DbConnection, marcherId: number, page: Page) => {
    const row = await db
        .select({
            transitionId: schema.timeline_assignments.transition_id,
            slotIndex: schema.timeline_assignments.slot_index,
        })
        .from(schema.timeline_assignments)
        .where(
            and(
                eq(schema.timeline_assignments.marcher_id, marcherId),
                eq(schema.timeline_assignments.end_beat, pageEndBeat(page)),
                // The converted (base) row, not a test's added steal
                eq(schema.timeline_assignments.layer, 0),
            ),
        )
        .get();
    expect(row).toBeDefined();
    return row!;
};

const STEAL_POINT = [600, 700] as const;

/**
 * Adds a one-slot shapeless transition over [start, transitionEnd ?? end) with the marcher
 * assigned over [start, end) at `layer`, as one edit. Returns the transition id.
 */
const addMove = async (
    db: DbConnection,
    {
        marcherId,
        start,
        end,
        transitionEnd,
        layer,
    }: {
        marcherId: number;
        start: number;
        end: number;
        transitionEnd?: number;
        layer: number;
    },
): Promise<number> => {
    const timeline = await db.select().from(schema.timelines).get();
    return await transactionWithHistory(db, "addMove", async (tx) => {
        const [transition] = await createTimelineTransitionsInTransaction({
            tx,
            newTransitions: [
                {
                    timelineId: timeline!.id,
                    startBeat: start,
                    endBeat: transitionEnd ?? end,
                    slotCount: 1,
                    destination: {
                        kind: "individual",
                        points: [[STEAL_POINT[0], STEAL_POINT[1]]],
                    },
                },
            ],
        });
        await createTimelineAssignmentsInTransaction({
            tx,
            newAssignments: [
                {
                    marcherId,
                    transitionId: transition!.id,
                    slotIndex: 0,
                    startBeat: start,
                    endBeat: end,
                    layer,
                },
            ],
        });
        return transition!.id;
    });
};

/** A slot's individual destination, as [x, y]. */
const pointOf = async (
    db: DbConnection,
    transitionId: number,
    slotIndex: number,
) => {
    const row = await db
        .select()
        .from(schema.timeline_slot_destinations)
        .where(
            and(
                eq(
                    schema.timeline_slot_destinations.transition_id,
                    transitionId,
                ),
                eq(schema.timeline_slot_destinations.slot_index, slotIndex),
            ),
        )
        .get();
    return [row!.x, row!.y];
};

const expectExactlyAt = (
    marcherId: number,
    beat: number,
    x: number,
    y: number,
) => {
    const [rx, ry] = resolver().positionAt(marcherId, beat);
    expect(Object.is(rx, x), `x ${rx} vs ${x}`).toBe(true);
    expect(Object.is(ry, y), `y ${ry} vs ${y}`).toBe(true);
};

/** Every marcher's position at every page end, for comparing whole shows. */
const allPageEnds = (pages: readonly Page[]) => {
    const r = resolver();
    return pages.flatMap((page) =>
        r.marcherIds().map((id) => r.positionAt(id, pageEndBeat(page))),
    );
};

/** A marcher's drill number, as refusal messages name it. */
const drillNumber = async (db: DbConnection, marcherId: number) => {
    const m = await db
        .select()
        .from(schema.marchers)
        .where(eq(schema.marchers.id, marcherId))
        .get();
    return `${m!.drill_prefix}${m!.drill_order}`;
};

const expectRefused = async (
    db: DbConnection,
    code: string,
    write: () => Promise<unknown>,
) => {
    const before = await snapshot(db);
    const error = await write().catch((e) => e);
    expect(error).toBeInstanceOf(TimelineWriteError);
    expect((error as TimelineWriteError).code).toBe(code);
    expect(await snapshot(db)).toEqual(before);
    return error as TimelineWriteError;
};

describeDbTests("moving marchers on a page in timeline mode", (it) => {
    it("on page N ≥ 1 changes only that marcher's slot destination, exactly", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const page = pages[3]!;
        const marcherId = 5;
        const { transitionId, slotIndex } = await slotOf(db, marcherId, page);
        const before = await snapshot(db);
        const endsBefore = allPageEnds(pages);

        const x = 123.456789012345;
        const y = -0.1 + 0.2;
        const result = await moveMarchersOnPage({
            db,
            page,
            moves: [{ marcherId, x, y }],
        });
        expect(result).toEqual({
            homes: [],
            slots: [{ marcherId, transitionId, slotIndex }],
            convertedTransitionIds: [],
        });

        // Only the one slot_destinations row differs
        const after = await snapshot(db);
        for (const table of TABLES) {
            const name = getTableName(table);
            if (name === "timeline_slot_destinations") continue;
            expect(after[name], name).toEqual(before[name]);
        }
        const changed = (
            after.timeline_slot_destinations as {
                transition_id: number;
                slot_index: number;
                x: number;
                y: number;
            }[]
        ).filter(
            (row, i) =>
                JSON.stringify(row) !==
                JSON.stringify(before.timeline_slot_destinations![i]),
        );
        expect(changed).toEqual([
            expect.objectContaining({
                transition_id: transitionId,
                slot_index: slotIndex,
                x,
                y,
            }),
        ]);

        // The running store follows the edit; the move lands exactly at the page's end beat
        await timelineResolverSettled();
        expectExactlyAt(marcherId, pageEndBeat(page), x, y);
        // Nobody else moved at any page end, and the marcher kept its other pages
        const endsAfter = allPageEnds(pages);
        const ids = resolver().marcherIds();
        const movedIndex =
            pages.indexOf(page) * ids.length + ids.indexOf(marcherId);
        endsAfter.forEach((p, i) => {
            if (i !== movedIndex) expect(p).toEqual(endsBefore[i]);
        });

        // Undo and redo round-trip, and the store follows both
        const undo = await performUndo(db);
        expect(undo.success, undo.error?.message).toBe(true);
        expect(await snapshot(db)).toEqual(before);
        await timelineResolverSettled();
        expect(allPageEnds(pages)).toEqual(endsBefore);

        const redo = await performRedo(db);
        expect(redo.success, redo.error?.message).toBe(true);
        expect(await snapshot(db)).toEqual(after);
        await timelineResolverSettled();
        expectExactlyAt(marcherId, pageEndBeat(page), x, y);
        // A cold build agrees
        await startTimelineResolver(db);
        expectExactlyAt(marcherId, pageEndBeat(page), x, y);
    });

    it("on page 0 sets the marchers' homes", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const before = await snapshot(db);
        const result = await moveMarchersOnPage({
            db,
            page: pages[0]!,
            moves: [
                { marcherId: 1, x: 10.5, y: 20.25 },
                { marcherId: 2, x: -3, y: 4 },
            ],
        });
        expect(result.homes).toEqual([1, 2]);
        const after = await snapshot(db);
        expect(after.timeline_slot_destinations).toEqual(
            before.timeline_slot_destinations,
        );
        expect(after.marcher_pages).toEqual(before.marcher_pages);
        const homes = await db
            .select({
                id: schema.marchers.id,
                x: schema.marchers.home_x,
                y: schema.marchers.home_y,
            })
            .from(schema.marchers)
            .where(eq(schema.marchers.id, 1))
            .get();
        expect(homes).toEqual({ id: 1, x: 10.5, y: 20.25 });

        await timelineResolverSettled();
        expectExactlyAt(1, pageEndBeat(pages[0]!), 10.5, 20.25);
        expectExactlyAt(2, pageEndBeat(pages[0]!), -3, 4);

        const undo = await performUndo(db);
        expect(undo.success, undo.error?.message).toBe(true);
        expect(await snapshot(db)).toEqual(before);
    });

    it("switches a shape-backed transition to individual points, copying the shape's samples", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const page = pages[2]!;
        const { transitionId, slotIndex } = await slotOf(db, 7, page);
        await transactionWithHistory(db, "shape", async (tx) => {
            const [shape] = await createTimelineShapesInTransaction({
                tx,
                newShapes: [
                    {
                        kind: "circle",
                        geometry: {
                            center: [400, 300],
                            radius: 77.7,
                            start_angle: 0.3,
                            clockwise: true,
                        },
                    },
                ],
            });
            await setTimelineTransitionDestinationInTransaction({
                tx,
                transitionId,
                destination: { kind: "shape", shapeId: shape!.id },
            });
        });
        await timelineResolverSettled();
        const endsBefore = allPageEnds(pages);
        const shapesBefore = await db
            .select()
            .from(schema.timeline_shapes)
            .all();

        const result = await moveMarchersOnPage({
            db,
            page,
            moves: [{ marcherId: 7, x: 1, y: 2 }],
        });
        expect(result.convertedTransitionIds).toEqual([transitionId]);
        const transition = await db
            .select()
            .from(schema.timeline_transitions)
            .where(eq(schema.timeline_transitions.id, transitionId))
            .get();
        expect(transition!.dest_shape_id).toBeNull();
        expect(await db.select().from(schema.timeline_shapes).all()).toEqual(
            shapesBefore,
        );
        const points = await db
            .select()
            .from(schema.timeline_slot_destinations)
            .where(
                eq(
                    schema.timeline_slot_destinations.transition_id,
                    transitionId,
                ),
            )
            .all();
        expect(points.length).toBe(transition!.slot_count);
        expect(points.find((p) => p.slot_index === slotIndex)).toMatchObject({
            x: 1,
            y: 2,
        });

        // Everyone else is exactly where the shape put them, at every page end
        await timelineResolverSettled();
        expectExactlyAt(7, pageEndBeat(page), 1, 2);
        const ids = resolver().marcherIds();
        const movedIndex = pages.indexOf(page) * ids.length + ids.indexOf(7);
        allPageEnds(pages).forEach((p, i) => {
            if (i === movedIndex) return;
            const [bx, by] = endsBefore[i]!;
            expect(Object.is(p[0], bx) && Object.is(p[1], by), `end ${i}`).toBe(
                true,
            );
        });

        // One edit: undo puts the shape back
        const undo = await performUndo(db);
        expect(undo.success, undo.error?.message).toBe(true);
        const restored = await db
            .select()
            .from(schema.timeline_transitions)
            .where(eq(schema.timeline_transitions.id, transitionId))
            .get();
        expect(restored!.dest_shape_id).toBe(shapesBefore[0]!.id);
        await timelineResolverSettled();
        expect(allPageEnds(pages)).toEqual(endsBefore);
    });

    it("refuses follow-the-leader into a shape (E-T5)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const page = pages[2]!;
        const { transitionId } = await slotOf(db, 7, page);
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
                transitionId,
                destination: { kind: "shape", shapeId: shape!.id },
            });
            await updateTimelineTransitionsInTransaction({
                tx,
                modifiedTransitions: [
                    {
                        id: transitionId,
                        pathStyle: "follow_the_leader",
                        pathParams: { waypoints: [] },
                    },
                ],
            });
        });
        await expectRefused(db, "E-T5", () =>
            moveMarchersOnPage({
                db,
                page,
                moves: [{ marcherId: 7, x: 1, y: 2 }],
            }),
        );
    });

    it("refuses a marcher with no move ending on the page, and writes nothing", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const page = pages[4]!;
        await transactionWithHistory(db, "unassign", async (tx) => {
            await tx
                .delete(schema.timeline_assignments)
                .where(
                    and(
                        eq(schema.timeline_assignments.marcher_id, 3),
                        eq(
                            schema.timeline_assignments.end_beat,
                            pageEndBeat(page),
                        ),
                    ),
                );
        });
        const error = await expectRefused(db, "E-ARGS", () =>
            moveMarchersOnPage({
                db,
                page,
                // Marcher 2 could move, but the edit is all or nothing
                moves: [
                    { marcherId: 2, x: 1, y: 1 },
                    { marcherId: 3, x: 1, y: 2 },
                ],
            }),
        );
        // Named by drill number, not database id
        expect(error.message).toContain(
            `marcher ${await drillNumber(db, 3)} has no move that ends`,
        );
    });

    it("refuses a marcher named twice and an out-of-bounds position", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        await expectRefused(db, "E-ARGS", () =>
            moveMarchersOnPage({
                db,
                page: pages[1]!,
                moves: [
                    { marcherId: 2, x: 1, y: 1 },
                    { marcherId: 2, x: 1, y: 2 },
                ],
            }),
        );
        await expectRefused(db, "E-D2", () =>
            moveMarchersOnPage({
                db,
                page: pages[1]!,
                moves: [{ marcherId: 2, x: 2e6, y: 0 }],
            }),
        );
    });

    it("with layers: a higher-layer steal ending at the page end wins; one ending earlier doesn't", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const page = pages[3]!;
        const B = pageEndBeat(page);
        // Marcher 2 is stolen for the last two beats of the page; marcher 3 for two beats
        // that end before the page does
        const steal = await addMove(db, {
            marcherId: 2,
            start: B - 2,
            end: B,
            layer: 1,
        });
        const early = await addMove(db, {
            marcherId: 3,
            start: B - 4,
            end: B - 2,
            layer: 1,
        });
        const base2 = await slotOf(db, 2, page);
        const base3 = await slotOf(db, 3, page);
        const base2Before = await pointOf(
            db,
            base2.transitionId,
            base2.slotIndex,
        );
        await timelineResolverSettled();
        expectExactlyAt(2, B, ...STEAL_POINT);

        const result = await moveMarchersOnPage({
            db,
            page,
            moves: [
                { marcherId: 2, x: 31, y: 32 },
                { marcherId: 3, x: 41, y: 42 },
            ],
        });
        expect(result.slots).toEqual([
            { marcherId: 2, transitionId: steal, slotIndex: 0 },
            { marcherId: 3, ...base3 },
        ]);
        // The base row of marcher 2 and the early steal of marcher 3 are untouched
        expect(await pointOf(db, base2.transitionId, base2.slotIndex)).toEqual(
            base2Before,
        );
        expect(await pointOf(db, early, 0)).toEqual(STEAL_POINT);
        await timelineResolverSettled();
        expectExactlyAt(2, B, 31, 32);
        expectExactlyAt(3, B, 41, 42);
    });

    it("refuses a move that spans several pages (ends after the page end)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const page = pages[3]!;
        // A layer-1 move from page 3's start to page 4's end
        await addMove(db, {
            marcherId: 4,
            start: page.beats[0]!.index,
            end: pageEndBeat(pages[4]!),
            layer: 1,
        });
        const error = await expectRefused(db, "E-ARGS", () =>
            moveMarchersOnPage({
                db,
                page,
                moves: [{ marcherId: 4, x: 1, y: 2 }],
            }),
        );
        expect(error.message).toContain(
            `marcher ${await drillNumber(db, 4)} has no move that ends`,
        );
    });

    it("refuses when the winning assignment ends at the page end but its transition ends later", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const page = pages[3]!;
        const B = pageEndBeat(page);
        await addMove(db, {
            marcherId: 4,
            start: B - 2,
            end: B,
            transitionEnd: B + 2,
            layer: 1,
        });
        await expectRefused(db, "E-ARGS", () =>
            moveMarchersOnPage({
                db,
                page,
                moves: [{ marcherId: 4, x: 1, y: 2 }],
            }),
        );
    });

    describe("history", () => {
        const testWithHistory = getTestWithHistory(it, TABLES);
        testWithHistory(
            "a page move is one undo group",
            async ({ db, marchersAndPages: _, expectNumberOfChanges }) => {
                await convertPagesToTimeline(db);
                const { pages } = await readShowTiming(db);
                const sorted = [...pages].sort((a, b) => a.order - b.order);
                const state = await expectNumberOfChanges.getDatabaseState(db);
                await moveMarchersOnPage({
                    db,
                    page: sorted[2]!,
                    moves: [
                        { marcherId: 1, x: 5, y: 6 },
                        { marcherId: 2, x: 7, y: 8 },
                    ],
                });
                await moveMarchersOnPage({
                    db,
                    page: sorted[0]!,
                    moves: [{ marcherId: 1, x: 9, y: 10 }],
                });
                await expectNumberOfChanges.test(db, 2, state);
            },
        );
    });
});

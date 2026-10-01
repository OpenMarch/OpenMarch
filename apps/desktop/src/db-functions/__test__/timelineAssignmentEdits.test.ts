import { afterEach, describe, expect } from "vitest";
import { asc, eq, getTableName } from "drizzle-orm";
import { createResolver, type Resolver, type XY } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { readTimelineTables } from "@/timeline/timelineRows";
import { MAX_CAST_SLOTS } from "@/timeline/timelineCasting";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import { performRedo, performUndo, transactionWithHistory } from "../history";
import { TimelineWriteError } from "../timelineErrors";
import { createTimelinesInTransaction } from "../timelines";
import { createTimelineShapesInTransaction } from "../timelineShapes";
import { createTimelineTransitionsInTransaction } from "../timelineTransitions";
import { createTimelineAssignmentsInTransaction } from "../timelineAssignments";
import {
    castMarchersIntoTransition,
    recastTransition,
    removeAssignment,
    setAssignmentSlot,
    updateAssignment,
} from "../timelineAssignmentEdits";
import { keepFixturesInPageMode } from "@/test/timelineMode";

// P7.17: these tests set up timeline mode themselves
keepFixturesInPageMode(
    "its tests convert the show or write timeline rows, and set the flag, themselves",
);

/**
 * P8.4: the inspector's assignment edits on a real database. Each is one undoable edit, undo and
 * redo round-trip the rows exactly, the running resolver store follows every step, and a refusal
 * writes nothing.
 */

afterEach(() => stopTimelineResolver());

const TABLES = [
    schema.marchers,
    schema.timelines,
    schema.timeline_shapes,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
];

const dataOf = async (db: DbConnection) => {
    const out: Record<string, unknown[]> = {};
    for (const table of TABLES)
        out[getTableName(table)] = await db.select().from(table).all();
    return out;
};

const BEATS = Array.from({ length: 21 }, (_, i) => i / 2);

const positions = (r: Resolver) =>
    r.marcherIds().map((id) => BEATS.map((b) => r.positionAt(id, b)));

const store = () => useTimelineResolverStore.getState().resolver!;

const coldResolver = async (db: DbConnection) =>
    createResolver((await readTimelineTables(db)).snapshot);

/** The store matches a cold resolver over the committed rows. */
const expectStoreFollows = async (db: DbConnection) => {
    await timelineResolverSettled();
    const cold = await coldResolver(db);
    expect(positions(store())).toEqual(positions(cold));
    return positions(cold);
};

/** Runs `edit` and round-trips undo and redo; the store follows each step. */
const roundTrip = async (
    db: DbConnection,
    edit: () => Promise<unknown>,
    after: () => Promise<void>,
) => {
    const before = await dataOf(db);
    const beforePositions = await expectStoreFollows(db);
    await edit();
    const edited = await dataOf(db);
    const editedPositions = await expectStoreFollows(db);
    await after();

    expect((await performUndo(db)).success).toBe(true);
    expect(await dataOf(db)).toEqual(before);
    expect(await expectStoreFollows(db)).toEqual(beforePositions);

    expect((await performRedo(db)).success).toBe(true);
    expect(await dataOf(db)).toEqual(edited);
    expect(await expectStoreFollows(db)).toEqual(editedPositions);
};

/** Expects `edit` to be refused with `code`, writing nothing. */
const expectRefused = async (
    db: DbConnection,
    code: string,
    edit: () => Promise<unknown>,
) => {
    const before = await dataOf(db);
    const error = await edit().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TimelineWriteError);
    expect((error as TimelineWriteError).code).toBe(code);
    expect(await dataOf(db)).toEqual(before);
    return error as TimelineWriteError;
};

const HOMES: XY[] = [
    [0, 0],
    [60, 0],
    [45, 0],
    [15, 0],
];

/**
 * One edit: four marchers at `HOMES`, a line from (0, 0) to (60, 0), and a timeline [0, 8) with
 * transition T: four slots into the line (slot points at x = 0, 20, 40, 60). Marcher 1 (at x = 0)
 * is in slot 3 and marcher 2 (at x = 60) in slot 0, so they cross; slots 1 and 2 are vacant.
 * A second timeline holds U: a one-slot shapeless move [0, 8) for marcher 3 to (45, 30).
 */
const setUp = async (db: DbConnection) => {
    const ids = (
        await db
            .select({ id: schema.marchers.id })
            .from(schema.marchers)
            .orderBy(asc(schema.marchers.id))
            .all()
    ).map((m) => m.id);
    expect(ids.length).toBeGreaterThanOrEqual(4);
    const m = ids.slice(0, 4) as [number, number, number, number];
    const made = await transactionWithHistory(db, "setUp", async (tx) => {
        for (const [i, id] of m.entries())
            await tx
                .update(schema.marchers)
                .set({ home_x: HOMES[i]![0], home_y: HOMES[i]![1] })
                .where(eq(schema.marchers.id, id));
        const [line] = await createTimelineShapesInTransaction({
            tx,
            newShapes: [
                {
                    kind: "line",
                    geometry: {
                        points: [
                            [0, 0],
                            [60, 0],
                        ],
                    },
                },
            ],
        });
        const [one, two] = await createTimelinesInTransaction({
            tx,
            newTimelines: [
                { startBeat: 0, endBeat: 8 },
                { startBeat: 0, endBeat: 8 },
            ],
        });
        const [t] = await createTimelineTransitionsInTransaction({
            tx,
            newTransitions: [
                {
                    timelineId: one!.id,
                    startBeat: 0,
                    endBeat: 8,
                    slotCount: 4,
                    destination: { kind: "shape", shapeId: line!.id },
                },
            ],
        });
        const [u] = await createTimelineTransitionsInTransaction({
            tx,
            newTransitions: [
                {
                    timelineId: two!.id,
                    startBeat: 0,
                    endBeat: 8,
                    slotCount: 1,
                    destination: { kind: "individual", points: [[45, 30]] },
                },
            ],
        });
        const rows = await createTimelineAssignmentsInTransaction({
            tx,
            newAssignments: [
                { marcherId: m[0], transitionId: t!.id, slotIndex: 3 },
                { marcherId: m[1], transitionId: t!.id, slotIndex: 0 },
                { marcherId: m[2], transitionId: u!.id, slotIndex: 0 },
            ].map((a) => ({ ...a, startBeat: 0, endBeat: 8, layer: 0 })),
        });
        return { t: t!.id, u: u!.id, rows: rows.map((r) => r.id) };
    });
    return { m, ...made };
};

const rowsOf = async (db: DbConnection, transitionId: number) =>
    await db
        .select()
        .from(schema.timeline_assignments)
        .where(eq(schema.timeline_assignments.transition_id, transitionId))
        .orderBy(asc(schema.timeline_assignments.slot_index))
        .all();

const slotsOf = async (db: DbConnection, transitionId: number) =>
    (await rowsOf(db, transitionId)).map((a) => [a.marcher_id, a.slot_index]);

const expectAt = (r: Resolver, id: number, beat: number, xy: XY) => {
    const [x, y] = r.positionAt(id, beat);
    expect(x).toBeCloseTo(xy[0]);
    expect(y).toBeCloseTo(xy[1]);
};

describeDbTests("timeline assignment edits (P8.4)", (it) => {
    describe("casting", () => {
        it("casts marchers into the vacant slots nearest to them, with undo and redo", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { m, t } = await setUp(db);
            await startTimelineResolver(db);
            await roundTrip(
                db,
                () =>
                    castMarchersIntoTransition({
                        db,
                        transitionId: t,
                        marcherIds: [m[3], m[2]],
                    }),
                async () => {
                    // Marcher 4 (x = 15) takes slot 1 (x = 20); marcher 3 (x = 45) slot 2 (x = 40)
                    expect(await slotsOf(db, t)).toEqual([
                        [m[1], 0],
                        [m[3], 1],
                        [m[2], 2],
                        [m[0], 3],
                    ]);
                    const rows = await rowsOf(db, t);
                    expect(rows.map((a) => [a.start_beat, a.end_beat])).toEqual(
                        Array(4).fill([0, 8]),
                    );
                    const r = await coldResolver(db);
                    expectAt(r, m[3], 8, [20, 0]);
                    expectAt(r, m[2], 8, [40, 0]);
                },
            );
        });

        it("puts a cast marcher one layer above its other moves at those beats, so it steals them (R-2)", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { m, t, u } = await setUp(db);
            const result = await castMarchersIntoTransition({
                db,
                transitionId: t,
                marcherIds: [m[2], m[3]],
            });
            // The result names what each marcher now steals from, for the inspector's note
            expect(result.steals).toEqual([
                { marcherId: m[2], transitionIds: [u] },
            ]);
            expect(result.assignments).toHaveLength(2);
            const rows = await rowsOf(db, t);
            // Marcher 3 already moves at layer 0 over [0, 8) in U; marcher 4 has nothing there
            expect(rows.find((a) => a.marcher_id === m[2])!.layer).toBe(1);
            expect(rows.find((a) => a.marcher_id === m[3])!.layer).toBe(0);
            // T wins: marcher 3 ends on its slot, not at U's (45, 30)
            expectAt(await coldResolver(db), m[2], 8, [40, 0]);
        });

        it("refuses a marcher already in the transition, and too few vacant slots, writing nothing", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { m, t } = await setUp(db);
            await expectRefused(db, "E-ARGS", () =>
                castMarchersIntoTransition({
                    db,
                    transitionId: t,
                    marcherIds: [m[0], m[2]],
                }),
            );
            const error = await expectRefused(db, "E-ARGS", () =>
                castMarchersIntoTransition({
                    db,
                    transitionId: t,
                    marcherIds: [m[2], m[3], 999_999],
                }),
            );
            expect(error.message).toMatch(/does not exist/);
            // Three marchers for the two vacant slots
            const [extra] = (
                await db
                    .select({ id: schema.marchers.id })
                    .from(schema.marchers)
                    .orderBy(asc(schema.marchers.id))
                    .all()
            ).slice(4);
            expect(extra).toBeDefined();
            const full = await expectRefused(db, "E-ARGS", () =>
                castMarchersIntoTransition({
                    db,
                    transitionId: t,
                    marcherIds: [m[2], m[3], extra!.id],
                }),
            );
            expect(full.message).toMatch(/2 vacant slots for 3 marchers/);
        });
    });

    describe("recasting", () => {
        it("recasts crossing marchers by nearest slot, keeping beats and layers, with undo and redo", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { m, t } = await setUp(db);
            await startTimelineResolver(db);
            await roundTrip(
                db,
                () => recastTransition({ db, transitionId: t }),
                async () => {
                    expect(await slotsOf(db, t)).toEqual([
                        [m[0], 0],
                        [m[1], 3],
                    ]);
                    const r = await coldResolver(db);
                    // Each now holds still: its slot is where it stands
                    expectAt(r, m[0], 4, [0, 0]);
                    expectAt(r, m[1], 4, [60, 0]);
                },
            );
        });

        it("refuses a recast that wouldn't shorten anything, writing nothing", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { t } = await setUp(db);
            await recastTransition({ db, transitionId: t });
            const error = await expectRefused(db, "E-ARGS", () =>
                recastTransition({ db, transitionId: t }),
            );
            expect(error.message).toMatch(/already in its nearest slot/);
        });
    });

    describe("one assignment", () => {
        it("moves to a vacant slot, with undo and redo", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { m, t, rows } = await setUp(db);
            await startTimelineResolver(db);
            await roundTrip(
                db,
                () =>
                    setAssignmentSlot({ db, assignmentId: rows[0]!, slot: 1 }),
                async () => {
                    expect(await slotsOf(db, t)).toEqual([
                        [m[1], 0],
                        [m[0], 1],
                    ]);
                    expectAt(await coldResolver(db), m[0], 8, [20, 0]);
                },
            );
        });

        it("trades slots with the marcher in an occupied one, with undo and redo", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { m, t, rows } = await setUp(db);
            await startTimelineResolver(db);
            await roundTrip(
                db,
                () =>
                    setAssignmentSlot({ db, assignmentId: rows[0]!, slot: 0 }),
                async () => {
                    expect(await slotsOf(db, t)).toEqual([
                        [m[0], 0],
                        [m[1], 3],
                    ]);
                },
            );
        });

        it("refuses a slot the transition doesn't have (E-A2)", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { rows } = await setUp(db);
            await expectRefused(db, "E-A2", () =>
                setAssignmentSlot({ db, assignmentId: rows[0]!, slot: 4 }),
            );
        });

        it("a higher layer steals; the same layer over the same beats is refused (E-A3)", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { m, t, u } = await setUp(db);
            await castMarchersIntoTransition({
                db,
                transitionId: t,
                marcherIds: [m[2]],
            });
            const cast = (await rowsOf(db, t)).find(
                (a) => a.marcher_id === m[2],
            )!;
            const inU = (await rowsOf(db, u))[0]!;
            await expectRefused(db, "E-A3", () =>
                updateAssignment({
                    db,
                    assignmentId: cast.id,
                    change: { layer: 0 },
                }),
            );
            await startTimelineResolver(db);
            // Raising U above T gives U the beats back: marcher 3 ends at U's point
            await roundTrip(
                db,
                () =>
                    updateAssignment({
                        db,
                        assignmentId: inU.id,
                        change: { layer: 2 },
                    }),
                async () => expectAt(await coldResolver(db), m[2], 8, [45, 30]),
            );
        });

        it("changes its beats inside the transition, and refuses beats outside it (E-A1)", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { rows } = await setUp(db);
            await startTimelineResolver(db);
            await roundTrip(
                db,
                () =>
                    updateAssignment({
                        db,
                        assignmentId: rows[0]!,
                        change: { startBeat: 4 },
                    }),
                async () => {
                    const row = await db
                        .select()
                        .from(schema.timeline_assignments)
                        .where(eq(schema.timeline_assignments.id, rows[0]!))
                        .get();
                    expect([row!.start_beat, row!.end_beat]).toEqual([4, 8]);
                },
            );
            await expectRefused(db, "E-A1", () =>
                updateAssignment({
                    db,
                    assignmentId: rows[0]!,
                    change: { endBeat: 9 },
                }),
            );
            await expectRefused(db, "E-ARGS", () =>
                updateAssignment({
                    db,
                    assignmentId: rows[0]!,
                    change: { layer: 1001 },
                }),
            );
        });

        it("removing leaves a vacant slot (D-13, D-VACANT), with undo and redo", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { m, t, rows } = await setUp(db);
            await startTimelineResolver(db);
            await roundTrip(
                db,
                () => removeAssignment({ db, assignmentId: rows[0]! }),
                async () => {
                    expect(await slotsOf(db, t)).toEqual([[m[1], 0]]);
                    const vacant = (await coldResolver(db))
                        .diagnostics()
                        .filter(
                            (d) =>
                                d.code === "D-VACANT" && d.transitionId === t,
                        )
                        .map((d) => d.slot);
                    expect(vacant.sort()).toEqual([1, 2, 3]);
                },
            );
        });
    });
});

/** The first four marchers' ids. */
const firstFour = async (db: DbConnection) =>
    (
        await db
            .select({ id: schema.marchers.id })
            .from(schema.marchers)
            .orderBy(asc(schema.marchers.id))
            .all()
    )
        .slice(0, 4)
        .map((m) => m.id) as [number, number, number, number];

/**
 * One edit: `homes` for the first marchers, a line from (0, 0) to (60, 0), and a timeline [0, 8)
 * with one transition into the line as `transition` describes; returns the ids.
 */
const lineTransition = async (
    db: DbConnection,
    homes: XY[],
    transition: {
        slotCount: number;
        pathStyle?: "direct" | "follow_the_leader";
        orderMode?: "inherit" | "slot";
        members: { marcher: number; slot: number }[];
    },
) => {
    const m = await firstFour(db);
    return await transactionWithHistory(db, "setUp", async (tx) => {
        for (const [i, xy] of homes.entries())
            await tx
                .update(schema.marchers)
                .set({ home_x: xy[0], home_y: xy[1] })
                .where(eq(schema.marchers.id, m[i]!));
        const [line] = await createTimelineShapesInTransaction({
            tx,
            newShapes: [
                {
                    kind: "line",
                    geometry: {
                        points: [
                            [0, 0],
                            [60, 0],
                        ],
                    },
                },
            ],
        });
        const [timeline] = await createTimelinesInTransaction({
            tx,
            newTimelines: [{ startBeat: 0, endBeat: 8 }],
        });
        const ftl = transition.pathStyle === "follow_the_leader";
        const [t] = await createTimelineTransitionsInTransaction({
            tx,
            newTransitions: [
                {
                    timelineId: timeline!.id,
                    startBeat: 0,
                    endBeat: 8,
                    slotCount: transition.slotCount,
                    destination: { kind: "shape", shapeId: line!.id },
                    pathStyle: transition.pathStyle ?? "direct",
                    pathParams: ftl ? { waypoints: [] } : null,
                    orderMode: transition.orderMode ?? "inherit",
                },
            ],
        });
        await createTimelineAssignmentsInTransaction({
            tx,
            newAssignments: transition.members.map((a) => ({
                marcherId: m[a.marcher]!,
                transitionId: t!.id,
                slotIndex: a.slot,
                startBeat: 0,
                endBeat: 8,
                layer: 0,
            })),
        });
        return { m, t: t!.id, timelineId: timeline!.id };
    });
};

describeDbTests("timeline assignment edits, review cases (P8.4)", (it) => {
    for (const orderMode of ["inherit", "slot"] as const)
        it(`follow the leader (${orderMode}): casts into the lowest vacant slots, not the nearest, and refuses a recast`, async ({
            db,
            marchersAndPages: _,
        }) => {
            // Slots at x = 0, 20, 40, 60; marcher 1 holds slot 1. Nearest would put marcher 4
            // (x = 15) in slot 0 and marcher 3 (x = 45) in slot 2.
            const { m, t } = await lineTransition(db, HOMES, {
                slotCount: 4,
                pathStyle: "follow_the_leader",
                orderMode,
                members: [{ marcher: 0, slot: 1 }],
            });
            await startTimelineResolver(db);
            await roundTrip(
                db,
                () =>
                    castMarchersIntoTransition({
                        db,
                        transitionId: t,
                        marcherIds: [m[3], m[2]],
                    }),
                async () => {
                    expect(await slotsOf(db, t)).toEqual([
                        [m[2], 0],
                        [m[0], 1],
                        [m[3], 2],
                    ]);
                },
            );
            const error = await expectRefused(db, "E-ARGS", () =>
                recastTransition({ db, transitionId: t }),
            );
            expect(error.message).toMatch(/follow the leader/);
        });

    it("recasts from where a marcher is when its row first wins, not from the row's start (a breakaway at the start)", async ({
        db,
        marchersAndPages: _,
    }) => {
        // Slots at x = 0 and 60. Marcher 1 (home x = 0) holds slot 0 and marcher 2 (x = 20)
        // slot 1, but a layer-1 breakaway takes marcher 1 to (60, 10) over [0, 4), so its row in
        // T only wins from beat 4, at (60, 10): trading is shorter. From marcher 1's home it isn't.
        const { m, t } = await lineTransition(
            db,
            [
                [0, 0],
                [20, 0],
            ],
            {
                slotCount: 2,
                members: [
                    { marcher: 0, slot: 0 },
                    { marcher: 1, slot: 1 },
                ],
            },
        );
        await transactionWithHistory(db, "breakaway", async (tx) => {
            const [timeline] = await createTimelinesInTransaction({
                tx,
                newTimelines: [{ startBeat: 0, endBeat: 4 }],
            });
            const [u] = await createTimelineTransitionsInTransaction({
                tx,
                newTransitions: [
                    {
                        timelineId: timeline!.id,
                        startBeat: 0,
                        endBeat: 4,
                        slotCount: 1,
                        destination: {
                            kind: "individual",
                            points: [[60, 10]],
                        },
                    },
                ],
            });
            await createTimelineAssignmentsInTransaction({
                tx,
                newAssignments: [
                    {
                        marcherId: m[0],
                        transitionId: u!.id,
                        slotIndex: 0,
                        startBeat: 0,
                        endBeat: 4,
                        layer: 1,
                    },
                ],
            });
        });
        await recastTransition({ db, transitionId: t });
        expect(await slotsOf(db, t)).toEqual([
            [m[1], 0],
            [m[0], 1],
        ]);
    });

    it("refuses casting and recasting past MAX_CAST_SLOTS by nearest slot, writing nothing", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { m, t } = await lineTransition(db, HOMES, {
            slotCount: MAX_CAST_SLOTS + 1,
            members: [{ marcher: 0, slot: 0 }],
        });
        const cast = await expectRefused(db, "E-ARGS", () =>
            castMarchersIntoTransition({
                db,
                transitionId: t,
                marcherIds: [m[1]],
            }),
        );
        expect(cast.message).toMatch(`up to ${MAX_CAST_SLOTS}`);
        await expectRefused(db, "E-ARGS", () =>
            recastTransition({ db, transitionId: t }),
        );
    });

    it("refuses a beats change that overlaps the marcher's move on the same layer (E-A3)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { m, rows } = await setUp(db);
        await updateAssignment({
            db,
            assignmentId: rows[0]!,
            change: { endBeat: 4 },
        });
        // Marcher 1 joins another move over [4, 8) at layer 0
        await transactionWithHistory(db, "join", async (tx) => {
            const [timeline] = await createTimelinesInTransaction({
                tx,
                newTimelines: [{ startBeat: 4, endBeat: 8 }],
            });
            const [v] = await createTimelineTransitionsInTransaction({
                tx,
                newTransitions: [
                    {
                        timelineId: timeline!.id,
                        startBeat: 4,
                        endBeat: 8,
                        slotCount: 1,
                        destination: { kind: "individual", points: [[5, 5]] },
                    },
                ],
            });
            await createTimelineAssignmentsInTransaction({
                tx,
                newAssignments: [
                    {
                        marcherId: m[0],
                        transitionId: v!.id,
                        slotIndex: 0,
                        startBeat: 4,
                        endBeat: 8,
                        layer: 0,
                    },
                ],
            });
        });
        await expectRefused(db, "E-A3", () =>
            updateAssignment({
                db,
                assignmentId: rows[0]!,
                change: { endBeat: 8 },
            }),
        );
    });
});

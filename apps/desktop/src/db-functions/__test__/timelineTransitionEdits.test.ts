import { afterEach, describe, expect } from "vitest";
import { asc, eq, getTableName } from "drizzle-orm";
import { createResolver, type Resolver, type XY } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import { readTimelineTables } from "@/timeline/timelineRows";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import {
    applyTransitionEdit,
    buildTransitionEditTarget,
    planTransitionEdit,
    type TransitionEdit,
} from "@/timeline/timelineTransitionEditor";
import { performRedo, performUndo, transactionWithHistory } from "../history";
import { TimelineWriteError } from "../timelineErrors";
import { createTimelinesInTransaction } from "../timelines";
import { createTimelineShapesInTransaction } from "../timelineShapes";
import { createTimelineTransitionsInTransaction } from "../timelineTransitions";
import { createTimelineAssignmentsInTransaction } from "../timelineAssignments";
import { keepFixturesInPageMode } from "@/test/timelineMode";

// P7.17: these tests set up timeline mode themselves
keepFixturesInPageMode(
    "its tests convert the show or write timeline rows, and set the flag, themselves",
);

/**
 * P8.3: the inspector's transition edits on a real database. Each is one undoable edit, undo and
 * redo round-trip the rows exactly, and the running resolver store follows every step.
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

/** Whole and half beats over the move and a little after. */
const BEATS = Array.from({ length: 25 }, (_, i) => i / 2);

const positions = (r: Resolver) =>
    r.marcherIds().map((id) => BEATS.map((b) => r.positionAt(id, b)));

const store = () => useTimelineResolverStore.getState().resolver!;

/** The store matches a cold resolver over the committed rows. */
const expectStoreFollows = async (db: DbConnection) => {
    await timelineResolverSettled();
    const cold = createResolver((await readTimelineTables(db)).snapshot);
    expect(positions(store())).toEqual(positions(cold));
    return positions(cold);
};

const LINE_POINTS: XY[] = [
    [0, 0],
    [40, 0],
];

/**
 * One edit: a line shape and a block, a timeline [0, 8) with one direct transition of two slots
 * into the line, and the first two marchers in it.
 */
const setUp = async (db: DbConnection) => {
    const marchers = await db
        .select({ id: schema.marchers.id })
        .from(schema.marchers)
        .orderBy(asc(schema.marchers.id))
        .all();
    expect(marchers.length).toBeGreaterThanOrEqual(2);
    return await transactionWithHistory(db, "setUp", async (tx) => {
        const [line, block] = await createTimelineShapesInTransaction({
            tx,
            newShapes: [
                { kind: "line", geometry: { points: LINE_POINTS } },
                {
                    kind: "block",
                    geometry: {
                        origin: [10, 10],
                        rows: 2,
                        cols: 2,
                        spacing: [4, 4],
                    },
                },
            ],
        });
        const [timeline] = await createTimelinesInTransaction({
            tx,
            newTimelines: [{ startBeat: 0, endBeat: 8 }],
        });
        const [transition] = await createTimelineTransitionsInTransaction({
            tx,
            newTransitions: [
                {
                    timelineId: timeline!.id,
                    startBeat: 0,
                    endBeat: 8,
                    slotCount: 2,
                    destination: { kind: "shape", shapeId: line!.id },
                },
            ],
        });
        await createTimelineAssignmentsInTransaction({
            tx,
            newAssignments: marchers.slice(0, 2).map((m, slotIndex) => ({
                marcherId: m.id,
                transitionId: transition!.id,
                slotIndex,
                startBeat: 0,
                endBeat: 8,
                layer: 0,
            })),
        });
        return {
            transitionId: transition!.id,
            lineId: line!.id,
            blockId: block!.id,
        };
    });
};

/** Plans `edit` against the committed rows, as the inspector does, and runs it. */
const runEdit = async (
    db: DbConnection,
    transitionId: number,
    edit: TransitionEdit,
) => {
    const { snapshot } = await readTimelineTables(db);
    const target = buildTransitionEditTarget(transitionId, snapshot)!;
    const plan = planTransitionEdit(target, edit);
    expect(plan).not.toBeNull();
    await applyTransitionEdit(db, plan!);
};

const transitionRow = async (db: DbConnection, id: number) =>
    (await db
        .select()
        .from(schema.timeline_transitions)
        .where(eq(schema.timeline_transitions.id, id))
        .get())!;

const destinationRows = async (db: DbConnection, id: number) =>
    (
        await db
            .select()
            .from(schema.timeline_slot_destinations)
            .where(eq(schema.timeline_slot_destinations.transition_id, id))
            .orderBy(asc(schema.timeline_slot_destinations.slot_index))
            .all()
    ).map((d) => [d.x, d.y]);

/**
 * Runs `edit`, checks it with `after`, and round-trips undo and redo: the rows return exactly to
 * before and after, and the store follows each step.
 */
const roundTrip = async (
    db: DbConnection,
    transitionId: number,
    edit: TransitionEdit,
    after: () => Promise<void>,
) => {
    const before = await dataOf(db);
    const beforePositions = await expectStoreFollows(db);
    await runEdit(db, transitionId, edit);
    const edited = await dataOf(db);
    const editedPositions = await expectStoreFollows(db);
    await after();

    expect((await performUndo(db)).success).toBe(true);
    expect(await dataOf(db)).toEqual(before);
    expect(await expectStoreFollows(db)).toEqual(beforePositions);

    expect((await performRedo(db)).success).toBe(true);
    expect(await dataOf(db)).toEqual(edited);
    expect(await expectStoreFollows(db)).toEqual(editedPositions);
    return { beforePositions, editedPositions };
};

describeDbTests("timeline transition edits (P8.3)", (it) => {
    describe("path", () => {
        it("a style change: direct to arc, with undo and redo", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { transitionId } = await setUp(db);
            await startTimelineResolver(db);
            const { beforePositions, editedPositions } = await roundTrip(
                db,
                transitionId,
                { kind: "pathStyle", style: "arc" },
                async () => {
                    const row = await transitionRow(db, transitionId);
                    expect(row.path_style).toBe("arc");
                    expect(JSON.parse(row.path_params!)).toEqual({
                        bulge: 0.25,
                    });
                },
            );
            // The arc bows away from the straight path mid-move
            expect(editedPositions).not.toEqual(beforePositions);
        });

        it("a bulge change, with undo and redo", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { transitionId } = await setUp(db);
            await runEdit(db, transitionId, {
                kind: "pathStyle",
                style: "arc",
            });
            await startTimelineResolver(db);
            await roundTrip(
                db,
                transitionId,
                { kind: "bulge", bulge: -0.5 },
                async () => {
                    const row = await transitionRow(db, transitionId);
                    expect(JSON.parse(row.path_params!)).toEqual({
                        bulge: -0.5,
                    });
                },
            );
        });

        it("a bulge beyond ½ is refused (E-P1) and writes nothing", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { transitionId } = await setUp(db);
            await runEdit(db, transitionId, {
                kind: "pathStyle",
                style: "arc",
            });
            const before = await dataOf(db);
            const error = await runEdit(db, transitionId, {
                kind: "bulge",
                bulge: 0.75,
            }).catch((e: unknown) => e);
            expect(error).toBeInstanceOf(TimelineWriteError);
            expect((error as TimelineWriteError).code).toBe("E-P1");
            expect(await dataOf(db)).toEqual(before);
        });
    });

    describe("destination", () => {
        it("shape to individual points keeps every position (the shape's samples), with undo and redo", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { transitionId } = await setUp(db);
            await startTimelineResolver(db);
            const { beforePositions, editedPositions } = await roundTrip(
                db,
                transitionId,
                { kind: "destinationIndividual" },
                async () => {
                    expect(
                        (await transitionRow(db, transitionId)).dest_shape_id,
                    ).toBeNull();
                    expect(await destinationRows(db, transitionId)).toEqual(
                        LINE_POINTS,
                    );
                },
            );
            expect(editedPositions).toEqual(beforePositions);
        });

        it("individual points back to a shape, with undo and redo", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { transitionId, blockId } = await setUp(db);
            await runEdit(db, transitionId, { kind: "destinationIndividual" });
            await startTimelineResolver(db);
            const { beforePositions, editedPositions } = await roundTrip(
                db,
                transitionId,
                { kind: "destinationShape", shapeId: blockId },
                async () => {
                    expect(
                        (await transitionRow(db, transitionId)).dest_shape_id,
                    ).toBe(blockId);
                    expect(await destinationRows(db, transitionId)).toEqual([]);
                },
            );
            expect(editedPositions).not.toEqual(beforePositions);
        });
    });

    describe("slot count", () => {
        it("a shapeless transition gets a point for the new slot, with undo and redo", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { transitionId } = await setUp(db);
            await runEdit(db, transitionId, { kind: "destinationIndividual" });
            await startTimelineResolver(db);
            await roundTrip(
                db,
                transitionId,
                { kind: "slotCount", slotCount: 3 },
                async () => {
                    expect(
                        (await transitionRow(db, transitionId)).slot_count,
                    ).toBe(3);
                    expect(await destinationRows(db, transitionId)).toEqual([
                        ...LINE_POINTS,
                        LINE_POINTS[1],
                    ]);
                },
            );
        });

        it("a shape transition's slots resample the shape, with undo and redo", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { transitionId } = await setUp(db);
            await startTimelineResolver(db);
            const { beforePositions, editedPositions } = await roundTrip(
                db,
                transitionId,
                { kind: "slotCount", slotCount: 3 },
                async () => {
                    expect(
                        (await transitionRow(db, transitionId)).slot_count,
                    ).toBe(3);
                },
            );
            // Slot 1 moves from the line's end to its middle
            expect(editedPositions).not.toEqual(beforePositions);
        });

        it("below an occupied slot is refused (E-A2) and writes nothing", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { transitionId } = await setUp(db);
            const before = await dataOf(db);
            const error = await runEdit(db, transitionId, {
                kind: "slotCount",
                slotCount: 1,
            }).catch((e: unknown) => e);
            expect(error).toBeInstanceOf(TimelineWriteError);
            expect((error as TimelineWriteError).code).toMatch(/E-A2/);
            expect(await dataOf(db)).toEqual(before);
        });
    });

    describe("history", () => {
        const testWithHistory = getTestWithHistory(it, TABLES);
        testWithHistory(
            "each change is one undo group",
            async ({ db, marchersAndPages: _, expectNumberOfChanges }) => {
                const { transitionId, blockId } = await setUp(db);
                const state = await expectNumberOfChanges.getDatabaseState(db);
                await runEdit(db, transitionId, {
                    kind: "pathStyle",
                    style: "arc",
                });
                await runEdit(db, transitionId, { kind: "bulge", bulge: 0.5 });
                await runEdit(db, transitionId, {
                    kind: "orderMode",
                    order: "slot",
                });
                await runEdit(db, transitionId, {
                    kind: "destinationIndividual",
                });
                await runEdit(db, transitionId, {
                    kind: "slotCount",
                    slotCount: 3,
                });
                await runEdit(db, transitionId, {
                    kind: "destinationShape",
                    shapeId: blockId,
                });
                await expectNumberOfChanges.test(db, 6, state);
            },
        );
    });
});

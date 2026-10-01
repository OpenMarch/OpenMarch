import { afterEach, describe, expect } from "vitest";
import { asc, eq, getTableName } from "drizzle-orm";
import {
    createResolver,
    type Resolver,
    type ShapeKind,
    type ShapeRow,
} from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { readTimelineTables } from "@/timeline/timelineRows";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import {
    applyShapeEdit,
    buildShapeEditTargets,
    planNewShape,
    planShapeEdit,
    type ShapeEdit,
    type ShapeFrame,
} from "@/timeline/timelineShapeEditor";
import { performRedo, performUndo, transactionWithHistory } from "../history";
import { TimelineWriteError } from "../timelineErrors";
import { createTimelinesInTransaction } from "../timelines";
import {
    createTimelineShapesInTransaction,
    deleteTimelineShapesInTransaction,
} from "../timelineShapes";
import { createTimelineTransitionsInTransaction } from "../timelineTransitions";
import { createTimelineAssignmentsInTransaction } from "../timelineAssignments";
import { keepFixturesInPageMode } from "@/test/timelineMode";

// P7.17: these tests set up timeline mode themselves
keepFixturesInPageMode(
    "its tests convert the show or write timeline rows, and set the flag, themselves",
);

/**
 * P8.2: the inspector's shape edits on a real database. Each is one undoable edit, undo and redo
 * round-trip the rows exactly, the running resolver store follows every step, and a change that
 * would break a transition using the shape is refused by the database with nothing written.
 */

afterEach(() => stopTimelineResolver());

const FRAME: ShapeFrame = { center: [50, 50], size: 16, spacing: 2 };

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

/** Whole and half beats over both moves and a little after. */
const BEATS = Array.from({ length: 41 }, (_, i) => i / 2);

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

/**
 * One edit: a line shape, a 2 × 2 block and an unused box. Timeline [0, 8): a direct move of the
 * first two marchers into the line (2 slots). Timeline [8, 16): a direct move of the first three
 * into the block (3 slots).
 */
const setUp = async (db: DbConnection) => {
    const marchers = await db
        .select({ id: schema.marchers.id })
        .from(schema.marchers)
        .orderBy(asc(schema.marchers.id))
        .all();
    expect(marchers.length).toBeGreaterThanOrEqual(3);
    return await transactionWithHistory(db, "setUp", async (tx) => {
        const [line, block, box] = await createTimelineShapesInTransaction({
            tx,
            newShapes: [
                {
                    name: "Opener",
                    kind: "line",
                    geometry: {
                        points: [
                            [0, 0],
                            [40, 0],
                        ],
                    },
                },
                {
                    kind: "block",
                    geometry: {
                        origin: [10, 10],
                        rows: 2,
                        cols: 2,
                        spacing: [4, 4],
                    },
                },
                {
                    kind: "box",
                    geometry: { origin: [0, 0], width: 8, height: 4 },
                },
            ],
        });
        const [first, second] = await createTimelinesInTransaction({
            tx,
            newTimelines: [
                { startBeat: 0, endBeat: 8 },
                { startBeat: 8, endBeat: 16 },
            ],
        });
        const [intoLine, intoBlock] =
            await createTimelineTransitionsInTransaction({
                tx,
                newTransitions: [
                    {
                        timelineId: first!.id,
                        startBeat: 0,
                        endBeat: 8,
                        slotCount: 2,
                        destination: { kind: "shape", shapeId: line!.id },
                    },
                    {
                        timelineId: second!.id,
                        startBeat: 8,
                        endBeat: 16,
                        slotCount: 3,
                        destination: { kind: "shape", shapeId: block!.id },
                    },
                ],
            });
        await createTimelineAssignmentsInTransaction({
            tx,
            newAssignments: [
                ...marchers.slice(0, 2).map((m, slotIndex) => ({
                    marcherId: m.id,
                    transitionId: intoLine!.id,
                    slotIndex,
                    startBeat: 0,
                    endBeat: 8,
                    layer: 0,
                })),
                ...marchers.slice(0, 3).map((m, slotIndex) => ({
                    marcherId: m.id,
                    transitionId: intoBlock!.id,
                    slotIndex,
                    startBeat: 8,
                    endBeat: 16,
                    layer: 0,
                })),
            ],
        });
        return {
            lineId: line!.id,
            blockId: block!.id,
            boxId: box!.id,
            intoLineId: intoLine!.id,
            marcherIds: marchers.map((m) => m.id),
        };
    });
};

/** The editor's target for shape `id`, from the committed rows, as the inspector builds it. */
const targetOf = async (db: DbConnection, id: number) => {
    const { snapshot } = await readTimelineTables(db);
    const names = await db
        .select({
            id: schema.timeline_shapes.id,
            name: schema.timeline_shapes.name,
        })
        .from(schema.timeline_shapes)
        .all();
    const target = buildShapeEditTargets(
        snapshot.shapes,
        names,
        snapshot.transitions,
        0,
    ).find((t) => t.id === id);
    expect(target).toBeDefined();
    return target!;
};

/** Plans `edit` against the committed rows, as the inspector does, and runs it. */
const runEdit = async (db: DbConnection, id: number, edit: ShapeEdit) => {
    const plan = planShapeEdit(await targetOf(db, id), edit, FRAME);
    expect(plan).not.toBeNull();
    return await applyShapeEdit(db, plan!);
};

const shapeRow = async (db: DbConnection, id: number) =>
    await db
        .select()
        .from(schema.timeline_shapes)
        .where(eq(schema.timeline_shapes.id, id))
        .get();

const parsed = (row: { kind: string; geometry: string }): ShapeRow =>
    ({ kind: row.kind, geometry: JSON.parse(row.geometry) }) as ShapeRow;

/**
 * Runs `run`, checks it with `after`, and round-trips undo and redo: the rows return exactly to
 * before and after, and the store follows each step.
 */
const roundTrip = async (
    db: DbConnection,
    run: () => Promise<unknown>,
    after: () => Promise<void>,
) => {
    const before = await dataOf(db);
    const beforePositions = await expectStoreFollows(db);
    await run();
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

/** Runs `run`, expects a refusal with `code`, and checks nothing was written. */
const expectRefused = async (
    db: DbConnection,
    run: () => Promise<unknown>,
    code: string,
) => {
    const before = await dataOf(db);
    const error = await run().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TimelineWriteError);
    expect((error as TimelineWriteError).code).toBe(code);
    expect(await dataOf(db)).toEqual(before);
    return error as TimelineWriteError;
};

describeDbTests("timeline shape edits (P8.2)", (it) => {
    describe("create", () => {
        it.for(["line", "freehand", "circle", "box", "block"] as ShapeKind[])(
            "a new %s through the selected marchers, with undo and redo",
            async (kind, { db, marchersAndPages: _ }) => {
                await setUp(db);
                await startTimelineResolver(db);
                let created: number | null = null;
                await roundTrip(
                    db,
                    async () => {
                        created = await applyShapeEdit(
                            db,
                            planNewShape(
                                kind,
                                [
                                    [0, 0],
                                    [20, 5],
                                    [10, 30],
                                ],
                                FRAME,
                            ),
                        );
                    },
                    async () => {
                        expect(created).not.toBeNull();
                        const row = await shapeRow(db, created!);
                        expect(row?.kind).toBe(kind);
                    },
                );
            },
        );
    });

    describe("edit a shape in use", () => {
        it("moving the line moves its marchers' destinations, with undo and redo", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { lineId, marcherIds } = await setUp(db);
            await startTimelineResolver(db);
            const { beforePositions, editedPositions } = await roundTrip(
                db,
                () =>
                    runEdit(db, lineId, {
                        kind: "geometry",
                        geometry: {
                            points: [
                                [0, 20],
                                [40, 20],
                            ],
                        },
                    }),
                async () => {
                    expect(store().positionAt(marcherIds[0]!, 8)).toEqual([
                        0, 20,
                    ]);
                    expect(store().positionAt(marcherIds[1]!, 8)).toEqual([
                        40, 20,
                    ]);
                },
            );
            expect(editedPositions).not.toEqual(beforePositions);
        });

        it("a rename, with undo and redo", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { lineId } = await setUp(db);
            await startTimelineResolver(db);
            await roundTrip(
                db,
                () =>
                    runEdit(db, lineId, {
                        kind: "rename",
                        name: "Company front",
                    }),
                async () => {
                    expect((await shapeRow(db, lineId))?.name).toBe(
                        "Company front",
                    );
                },
            );
        });

        it("a line in use becomes a block with a cell for every slot, with undo and redo", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { lineId } = await setUp(db);
            await startTimelineResolver(db);
            await roundTrip(
                db,
                () => runEdit(db, lineId, { kind: "kind", to: "block" }),
                async () => {
                    const shape = parsed((await shapeRow(db, lineId))!);
                    expect(shape.kind).toBe("block");
                    if (shape.kind !== "block") return;
                    expect(
                        shape.geometry.rows * shape.geometry.cols,
                    ).toBeGreaterThanOrEqual(2);
                },
            );
        });

        it("a block in use becomes a circle, with undo and redo", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { blockId } = await setUp(db);
            await startTimelineResolver(db);
            await roundTrip(
                db,
                () => runEdit(db, blockId, { kind: "kind", to: "circle" }),
                async () => {
                    expect((await shapeRow(db, blockId))?.kind).toBe("circle");
                },
            );
        });

        it("too few rows for a transition's slots is refused by the database (E-T4) and writes nothing", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { blockId } = await setUp(db);
            await startTimelineResolver(db);
            await expectRefused(
                db,
                () =>
                    runEdit(db, blockId, {
                        kind: "geometry",
                        geometry: {
                            origin: [10, 10],
                            rows: 1,
                            cols: 2,
                            spacing: [4, 4],
                        },
                    }),
                "E-T3/E-T4",
            );
            // Exactly enough cells is accepted
            await runEdit(db, blockId, {
                kind: "geometry",
                geometry: {
                    origin: [10, 10],
                    rows: 1,
                    cols: 3,
                    spacing: [4, 4],
                },
            });
            await expectStoreFollows(db);
        });

        it("a follow-the-leader destination can't become a block (E-T3) and nothing is written", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { lineId, intoLineId } = await setUp(db);
            await transactionWithHistory(db, "ftl", (tx) =>
                tx
                    .update(schema.timeline_transitions)
                    .set({
                        path_style: "follow_the_leader",
                        path_params: JSON.stringify({ waypoints: [] }),
                    })
                    .where(eq(schema.timeline_transitions.id, intoLineId)),
            );
            await startTimelineResolver(db);
            await expectRefused(
                db,
                () => runEdit(db, lineId, { kind: "kind", to: "block" }),
                "E-T3/E-T4",
            );
        });

        it("non-whole rows or columns are refused before writing (E-S1)", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { blockId } = await setUp(db);
            for (const [rows, cols] of [
                [2.5, 2],
                [2, 1.5],
            ])
                await expectRefused(
                    db,
                    () =>
                        runEdit(db, blockId, {
                            kind: "geometry",
                            geometry: {
                                origin: [10, 10],
                                rows: rows!,
                                cols: cols!,
                                spacing: [4, 4],
                            },
                        }),
                    "E-S1",
                );
        });

        it("bad geometry is refused before writing (E-S1)", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { lineId } = await setUp(db);
            await expectRefused(
                db,
                () =>
                    runEdit(db, lineId, {
                        kind: "geometry",
                        geometry: {
                            points: [
                                [5, 5],
                                [5, 5],
                            ],
                        },
                    }),
                "E-S1",
            );
        });
    });

    describe("delete", () => {
        it("an unused shape, with undo and redo", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { boxId } = await setUp(db);
            await startTimelineResolver(db);
            await roundTrip(
                db,
                () => runEdit(db, boxId, { kind: "delete" }),
                async () => {
                    expect(await shapeRow(db, boxId)).toBeUndefined();
                },
            );
        });

        it("a shape in use is refused before writing, naming the transitions (I-D1)", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { lineId, intoLineId } = await setUp(db);
            const error = await expectRefused(
                db,
                () => runEdit(db, lineId, { kind: "delete" }),
                "E-ARGS",
            );
            expect(error.message).toBe(
                `E-ARGS: Shape ${lineId} can't be deleted while transition ${intoLineId} uses it. Give it another destination first.`,
            );
        });

        it("the foreign key stays the backstop for a delete that skips the check (I-D1)", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { lineId } = await setUp(db);
            await expectRefused(
                db,
                () =>
                    transactionWithHistory(db, "rawDelete", (tx) =>
                        deleteTimelineShapesInTransaction({
                            tx,
                            shapeIds: new Set([lineId]),
                        }),
                    ),
                "E-DB",
            );
        });
    });
});

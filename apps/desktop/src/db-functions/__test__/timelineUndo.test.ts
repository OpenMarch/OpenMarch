import { describe, expect } from "vitest";
import { eq, getTableName, sql } from "drizzle-orm";
import type { ChangeBatch } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { setTimelineModeFlag } from "@/test/timelineMode";
import {
    createUndoTriggers,
    dropUndoTriggers,
    performRedo,
    performUndo,
    resetTimelineChangeLog,
    transactionWithHistory,
} from "../history";
import {
    createTimelineAssignmentsInTransaction,
    createTimelineShapesInTransaction,
    createTimelineTransitionsInTransaction,
    createTimelinesInTransaction,
    deleteMarchers,
    deleteTimelineAssignmentsInTransaction,
    deleteTimelineTransitionsInTransaction,
    deleteTimelinesInTransaction,
    setTimelineTransitionDestinationInTransaction,
    subscribeTimelineChanges,
    updateMarcherHomesInTransaction,
    updateTimelineTransitionsInTransaction,
    updateTimelinesInTransaction,
} from "../index";

/**
 * Undo round trips on the app's real undo (docs/timeline/phases/04-write-path-undo.md P4.8, spec
 * §6.1 and §12.2): QA-UNDO-1 and -1b (informational negative controls), -3, -4, -6 and -8, and
 * the rule that a rejected undo or redo leaves the data and both stacks unchanged.
 *
 * Covered elsewhere, and not repeated here: QA-UNDO-2a to -2g in `timelineRangeEdit.test.ts`;
 * QA-UNDO-5 and -7 in `timelineChanges.test.ts`; the C-1 child-first delete and the C-2
 * `slot_destinations` delete/undo in `timelineHistory.test.ts`.
 *
 * "Round trip" means edit, undo, redo, undo, with the data compared exactly after every step.
 */

const tablesToCheck = [
    schema.marchers,
    schema.timelines,
    schema.timeline_shapes,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
];

const dataOf = async (db: DbConnection) => {
    const data: Record<string, unknown[]> = {};
    for (const table of tablesToCheck)
        data[getTableName(table)] = await db.select().from(table).all();
    return data;
};

/** The data tables and all three history tables. */
const snapshot = async (db: DbConnection) => ({
    data: await dataOf(db),
    undo: await db.select().from(schema.history_undo).all(),
    redo: await db.select().from(schema.history_redo).all(),
    stats: await db.select().from(schema.history_stats).all(),
});

const setGroupLimit = (db: DbConnection, limit: number) =>
    db.update(schema.history_stats).set({ group_limit: limit }).run();

/** Records every batch delivered while `run` executes. */
const recordBatches = async (run: () => Promise<unknown>) => {
    const batches: ChangeBatch[] = [];
    const unsubscribe = subscribeTimelineChanges((event) => {
        if (event.kind === "batch") batches.push(event.batch);
    });
    try {
        await run();
    } finally {
        unsubscribe();
    }
    return batches;
};

/**
 * Writes with the history triggers of `tables` removed, so the write leaves no history, then
 * clears what it logged to the change log. Tests use it to put the data in a state that the
 * next undo or redo can't replay onto.
 */
const writeWithoutHistory = async (
    db: DbConnection,
    tables: string[],
    write: () => Promise<unknown>,
) => {
    for (const table of tables) await dropUndoTriggers(db, table);
    try {
        await write();
    } finally {
        for (const table of tables) await createUndoTriggers(db, table);
    }
    await resetTimelineChangeLog(db);
};

/** Edit, undo, redo, undo; every step must match exactly. Returns the edited data. */
const roundTrip = async (db: DbConnection, edit: () => Promise<unknown>) => {
    const original = await dataOf(db);
    await edit();
    const edited = await dataOf(db);
    expect(edited, "the edit changed nothing").not.toEqual(original);

    const undo1 = await performUndo(db);
    expect(undo1.success, undo1.error?.message).toBe(true);
    expect(await dataOf(db)).toEqual(original);

    const redo = await performRedo(db);
    expect(redo.success, redo.error?.message).toBe(true);
    expect(await dataOf(db)).toEqual(edited);

    const undo2 = await performUndo(db);
    expect(undo2.success, undo2.error?.message).toBe(true);
    expect(await dataOf(db)).toEqual(original);
    return edited;
};

/** The tables of the newest undo group's inverses, in the order they were logged. */
const newestUndoGroupTables = async (db: DbConnection) => {
    const rows = await db
        .select()
        .from(schema.history_undo)
        .orderBy(schema.history_undo.sequence)
        .all();
    const newest = Math.max(...rows.map((r) => r.history_group));
    return rows
        .filter((r) => r.history_group === newest)
        .map((r) => r.sql.match(/^\s*\w+ (?:INTO|FROM)?\s*"(\w+)"/i)?.[1]);
};

const LINE = {
    kind: "line",
    geometry: {
        points: [
            [0, 0],
            [10, 0],
        ],
    },
} as const;

/**
 * One edit: 3 marchers, a line shape, and two transitions, each spanning its own timeline (C-11):
 *
 * - T1 on the line over [8, 24), 3 slots: marcher 1 `[8, 24)` slot 0, marcher 2 `[8, 24)` slot 1,
 *   marcher 3 `[12, 20)` slot 2;
 * - T2 with individual destinations over [30, 40), 2 slots: marcher 1 `[30, 40)` slot 0.
 */
const seed = (db: DbConnection) =>
    transactionWithHistory(db, "seed", async (tx) => {
        await tx.insert(schema.marchers).values(
            [1, 2, 3].map((id) => ({
                id,
                section: "Brass",
                drill_prefix: "B",
                drill_order: id,
            })),
        );
        const [timeline, timeline2] = await createTimelinesInTransaction({
            newTimelines: [
                { name: "Opener", startBeat: 8, endBeat: 24 },
                { startBeat: 30, endBeat: 40 },
            ],
            tx,
        });
        const [shape] = await createTimelineShapesInTransaction({
            newShapes: [LINE],
            tx,
        });
        const [t1, t2] = await createTimelineTransitionsInTransaction({
            newTransitions: [
                {
                    timelineId: timeline!.id,
                    startBeat: 8,
                    endBeat: 24,
                    slotCount: 3,
                    destination: { kind: "shape", shapeId: shape!.id },
                },
                {
                    timelineId: timeline2!.id,
                    startBeat: 30,
                    endBeat: 40,
                    slotCount: 2,
                    destination: {
                        kind: "individual",
                        points: [
                            [0, 4],
                            [2, 4],
                        ],
                    },
                },
            ],
            tx,
        });
        const rows: [number, number, number, number, number][] = [
            // marcher, transition, slot, start, end
            [1, t1!.id, 0, 8, 24],
            [2, t1!.id, 1, 8, 24],
            [3, t1!.id, 2, 12, 20],
            [1, t2!.id, 0, 30, 40],
        ];
        await createTimelineAssignmentsInTransaction({
            newAssignments: rows.map(
                ([marcherId, transitionId, slotIndex, startBeat, endBeat]) => ({
                    marcherId,
                    transitionId,
                    slotIndex,
                    startBeat,
                    endBeat,
                }),
            ),
            tx,
        });
        return {
            timelineId: timeline!.id,
            shapeId: shape!.id,
            t1: t1!.id,
            t2: t2!.id,
        };
    });

const assignmentOf = async (db: DbConnection, marcherId: number) =>
    (await db
        .select()
        .from(schema.timeline_assignments)
        .where(eq(schema.timeline_assignments.marcher_id, marcherId))
        .get())!;

describeDbTests("timeline undo round trips (P4.8)", (it) => {
    describe("QA-UNDO-3: deletes of a transition, a marcher and a timeline", () => {
        it("a transition with an assignment and destinations: children are logged first", async ({
            db,
        }) => {
            const { t2 } = await seed(db);
            await roundTrip(db, () =>
                transactionWithHistory(db, "deleteTransition", (tx) =>
                    deleteTimelineTransitionsInTransaction({
                        transitionIds: new Set([t2]),
                        tx,
                    }),
                ),
            );

            // Redo once more to read the edit's log order. The app's delete trigger runs BEFORE
            // DELETE and FKs are RESTRICT (C-1), so child-first deletes log each child's inverse
            // before its parent's, and undo re-inserts the parent first.
            expect((await performRedo(db)).success).toBe(true);
            // Its timeline is left empty, so it goes last (C-11)
            expect(await newestUndoGroupTables(db)).toEqual([
                "timeline_assignments",
                "timeline_slot_destinations",
                "timeline_slot_destinations",
                "timeline_transitions",
                "timelines",
            ]);
        });

        it("a marcher with assignments in two transitions (FK cascade)", async ({
            db,
        }) => {
            await seed(db);
            // The page-mode delete, which leaves the assignments to the cascade. With the flag on
            // (`test:timeline`), `deleteMarchers` deletes them first instead (P7.3), which
            // `timelineMarchers.test.ts` covers.
            await setTimelineModeFlag(db, false);
            await roundTrip(db, () =>
                deleteMarchers({ marcherIds: new Set([1]), db }),
            );

            // `timeline_assignments.marcher_id` is the one timeline FK that still cascades. The
            // BEFORE DELETE trigger logs the marcher before SQLite cascades to its assignments,
            // so undo re-inserts the assignments first. That is safe only because undo replays
            // with foreign keys off and no assignment trigger reads `marchers`; this pins it.
            expect((await performRedo(db)).success).toBe(true);
            expect(await newestUndoGroupTables(db)).toEqual([
                "marchers",
                "timeline_assignments",
                "timeline_assignments",
            ]);
        });

        it("a timeline holding two transitions (two levels)", async ({
            db,
        }) => {
            const { timelineId, shapeId } = await seed(db);
            // A second transition over the same counts (C-11)
            await transactionWithHistory(db, "sibling", (tx) =>
                createTimelineTransitionsInTransaction({
                    newTransitions: [
                        {
                            timelineId,
                            slotCount: 1,
                            destination: { kind: "shape", shapeId },
                        },
                    ],
                    tx,
                }),
            );
            await roundTrip(db, () =>
                transactionWithHistory(db, "deleteTimeline", (tx) =>
                    deleteTimelinesInTransaction({
                        timelineIds: new Set([timelineId]),
                        tx,
                    }),
                ),
            );
            expect(
                await db.select().from(schema.timeline_shapes).all(),
            ).toHaveLength(1);

            expect((await performRedo(db)).success).toBe(true);
            const tables = await newestUndoGroupTables(db);
            const lastIndex = (name: string) => tables.lastIndexOf(name);
            const firstIndex = (name: string) => tables.indexOf(name);
            // Every child before any transition, every transition before the timeline
            expect(lastIndex("timeline_assignments")).toBeLessThan(
                firstIndex("timeline_transitions"),
            );
            expect(lastIndex("timeline_slot_destinations")).toBeLessThan(
                firstIndex("timeline_transitions"),
            );
            expect(lastIndex("timeline_transitions")).toBeLessThan(
                firstIndex("timelines"),
            );
            expect(tables.filter((t) => t === "timeline_transitions")).toEqual([
                "timeline_transitions",
                "timeline_transitions",
            ]);
            expect(tables.at(-1)).toBe("timelines");
        });
    });

    describe("QA-UNDO-4: edits checked at commit (I-T6)", () => {
        it("shape to individual", async ({ db }) => {
            const { t1 } = await seed(db);
            await roundTrip(db, () =>
                transactionWithHistory(db, "toIndividual", (tx) =>
                    setTimelineTransitionDestinationInTransaction({
                        transitionId: t1,
                        destination: {
                            kind: "individual",
                            points: [
                                [0, 5],
                                [3, 5],
                                [6, 5],
                            ],
                        },
                        tx,
                    }),
                ),
            );
        });

        it("individual to shape", async ({ db }) => {
            const { t2, shapeId } = await seed(db);
            await roundTrip(db, () =>
                transactionWithHistory(db, "toShape", (tx) =>
                    setTimelineTransitionDestinationInTransaction({
                        transitionId: t2,
                        destination: { kind: "shape", shapeId },
                        tx,
                    }),
                ),
            );
        });

        it("grow the slot count, place the new slot and fill it", async ({
            db,
        }) => {
            const { t2 } = await seed(db);
            const edited = await roundTrip(db, () =>
                transactionWithHistory(db, "growAndPlace", async (tx) => {
                    await updateTimelineTransitionsInTransaction({
                        modifiedTransitions: [
                            {
                                id: t2,
                                slotCount: 3,
                                points: [
                                    [0, 4],
                                    [2, 4],
                                    [9, 9],
                                ],
                            },
                        ],
                        tx,
                    });
                    await createTimelineAssignmentsInTransaction({
                        newAssignments: [
                            {
                                marcherId: 2,
                                transitionId: t2,
                                slotIndex: 2,
                                startBeat: 30,
                                endBeat: 40,
                            },
                        ],
                        tx,
                    });
                }),
            );
            expect(edited.timeline_slot_destinations).toHaveLength(3);
            expect(edited.timeline_assignments).toHaveLength(5);
        });
    });

    describe("QA-UNDO-6: redo is cleared by a new edit; undo on an empty stack", () => {
        it("a new edit after an undo clears redo", async ({ db }) => {
            const { timelineId } = await seed(db);
            const rename = (name: string) =>
                transactionWithHistory(db, "rename", (tx) =>
                    updateTimelinesInTransaction({
                        modifiedTimelines: [{ id: timelineId, name }],
                        tx,
                    }),
                );
            await rename("First");
            expect((await performUndo(db)).success).toBe(true);
            expect(
                await db.select().from(schema.history_redo).all(),
            ).not.toEqual([]);

            await rename("Second");
            expect(await db.select().from(schema.history_redo).all()).toEqual(
                [],
            );
            // Redo with an empty redo stack changes neither the data nor the stacks (it only
            // resets `cur_redo_group`)
            const before = await snapshot(db);
            const redo = await performRedo(db);
            expect(redo.success).toBe(true);
            expect(redo.sqlStatements).toEqual([]);
            const after = await snapshot(db);
            expect({ ...after, stats: undefined }).toEqual({
                ...before,
                stats: undefined,
            });
        });

        it("undo with an empty stack does nothing", async ({ db }) => {
            await seed(db);
            expect((await performUndo(db)).success).toBe(true);
            expect(await dataOf(db)).toEqual({
                marchers: [],
                timelines: [],
                timeline_shapes: [],
                timeline_transitions: [],
                timeline_assignments: [],
                timeline_slot_destinations: [],
            });
            expect(await db.select().from(schema.history_undo).all()).toEqual(
                [],
            );

            const before = await snapshot(db);
            const batches = await recordBatches(async () => {
                const undo = await performUndo(db);
                expect(undo.success).toBe(true);
                expect(undo.sqlStatements).toEqual([]);
            });
            expect(batches).toEqual([]);
            expect(await snapshot(db)).toEqual(before);

            // The redo stack survived, and still redoes the seed
            expect((await performRedo(db)).success).toBe(true);
            expect(
                await db.select().from(schema.timeline_assignments).all(),
            ).toHaveLength(4);
        });
    });

    it("QA-UNDO-8: group_limit = 3 keeps three whole groups; three undo steps restore exactly and the fourth does nothing", async ({
        db,
    }) => {
        await seed(db);
        await setGroupLimit(db, 3);
        const states = [await dataOf(db)];
        for (let k = 0; k < 5; k++) {
            // Two rows per group, so a partly pruned group would show
            await transactionWithHistory(db, "moveHomes", (tx) =>
                updateMarcherHomesInTransaction({
                    modifiedHomes: [
                        { marcherId: 1, home: [10 + k, 0] },
                        { marcherId: 2, home: [0, k] },
                    ],
                    tx,
                }),
            );
            states.push(await dataOf(db));
        }

        const undoRows = await db.select().from(schema.history_undo).all();
        const rowsPerGroup = new Map<number, number>();
        for (const row of undoRows)
            rowsPerGroup.set(
                row.history_group,
                (rowsPerGroup.get(row.history_group) ?? 0) + 1,
            );
        expect([...rowsPerGroup.values()]).toEqual([2, 2, 2]);

        for (let k = 0; k < 3; k++) {
            const undo = await performUndo(db);
            expect(undo.success, undo.error?.message).toBe(true);
            expect(await dataOf(db)).toEqual(states[4 - k]);
        }
        const fourth = await performUndo(db);
        expect(fourth.success).toBe(true);
        expect(fourth.sqlStatements).toEqual([]);
        expect(await dataOf(db)).toEqual(states[2]);
    });

    describe("a rejected undo or redo leaves the data and both stacks unchanged (§6.1)", () => {
        /**
         * Seeds, then deletes marcher 3's assignment (the edit whose undo is forced to fail),
         * then renames the timeline twice and undoes both renames, so the redo stack holds two
         * groups. Finally a write that leaves no history puts marcher 3 back in slot 2 over
         * [12, 20) as a new row, so undoing the delete (re-inserting the old row) is rejected:
         * one row per marcher and transition, and the overlap check (E-A3).
         */
        const setUpRejectedUndo = async (db: DbConnection) => {
            const { timelineId, t1 } = await seed(db);
            const deleted = await assignmentOf(db, 3);
            await transactionWithHistory(db, "deleteAssignment", (tx) =>
                deleteTimelineAssignmentsInTransaction({
                    assignmentIds: new Set([deleted.id]),
                    tx,
                }),
            );
            for (const name of ["First", "Second"])
                await transactionWithHistory(db, "rename", (tx) =>
                    updateTimelinesInTransaction({
                        modifiedTimelines: [{ id: timelineId, name }],
                        tx,
                    }),
                );
            for (let k = 0; k < 2; k++)
                expect((await performUndo(db)).success).toBe(true);

            await writeWithoutHistory(db, ["timeline_assignments"], () =>
                db
                    .insert(schema.timeline_assignments)
                    .values({
                        marcher_id: 3,
                        transition_id: t1,
                        slot_index: 2,
                        start_beat: 12,
                        end_beat: 20,
                    })
                    .run(),
            );
        };

        const expectRejectedUnchanged = async (
            db: DbConnection,
            action: typeof performUndo,
            reason: RegExp,
        ) => {
            const before = await snapshot(db);
            const batches = await recordBatches(async () => {
                const response = await action(db);
                expect(response.success).toBe(false);
                expect(response.error?.message).toMatch(reason);
            });
            expect(batches).toEqual([]);
            expect(await snapshot(db)).toEqual(before);
        };

        it("a rejected undo", async ({ db }) => {
            await setUpRejectedUndo(db);
            await expectRejectedUnchanged(db, performUndo, /UNIQUE|E-A3/);
            // Redo still works: the two undone renames come back
            expect((await performRedo(db)).success).toBe(true);
            expect((await performRedo(db)).success).toBe(true);
            expect((await db.select().from(schema.timelines).get())!.name).toBe(
                "Second",
            );
        });

        it("a rejected undo at the group limit prunes nothing", async ({
            db,
        }) => {
            await setUpRejectedUndo(db);
            // The redo stack (two groups) is now over the limit, so any redo-group increment
            // would prune its oldest group
            await setGroupLimit(db, 1);
            await expectRejectedUnchanged(db, performUndo, /UNIQUE|E-A3/);
        });

        it("a rejected redo", async ({ db }) => {
            const { t2 } = await seed(db);
            const add = {
                marcher_id: 2,
                transition_id: t2,
                slot_index: 1,
                start_beat: 30,
                end_beat: 40,
            };
            await transactionWithHistory(db, "addAssignment", (tx) =>
                createTimelineAssignmentsInTransaction({
                    newAssignments: [
                        {
                            marcherId: add.marcher_id,
                            transitionId: add.transition_id,
                            slotIndex: add.slot_index,
                            startBeat: add.start_beat,
                            endBeat: add.end_beat,
                        },
                    ],
                    tx,
                }),
            );
            expect((await performUndo(db)).success).toBe(true);
            // The same assignment comes back as a new row with no history, so redoing the insert
            // (with the old id) is rejected
            await writeWithoutHistory(db, ["timeline_assignments"], () =>
                db.insert(schema.timeline_assignments).values(add).run(),
            );
            await expectRejectedUnchanged(db, performRedo, /UNIQUE|E-A3/);
        });

        for (const type of ["undo", "redo"] as const) {
            it(`a failure after the ${type} replay rolls the replay back`, async ({
                db,
            }) => {
                const { timelineId } = await seed(db);
                await transactionWithHistory(db, "rename", (tx) =>
                    updateTimelinesInTransaction({
                        modifiedTimelines: [{ id: timelineId, name: "First" }],
                        tx,
                    }),
                );
                if (type === "redo")
                    expect((await performUndo(db)).success).toBe(true);
                const table = type === "undo" ? "history_undo" : "history_redo";
                // Make the removal of the replayed group fail
                await db.run(
                    sql.raw(
                        `CREATE TRIGGER test_block_delete BEFORE DELETE ON ${table}
                         BEGIN SELECT RAISE(ABORT, 'blocked by test'); END`,
                    ),
                );
                const before = await snapshot(db);
                const action = type === "undo" ? performUndo : performRedo;
                const batches = await recordBatches(async () => {
                    const response = await action(db);
                    expect(response.success).toBe(false);
                    expect(response.error?.message).toMatch(/blocked by test/);
                });
                expect(batches).toEqual([]);
                expect(await snapshot(db)).toEqual(before);

                await db.run(sql.raw("DROP TRIGGER test_block_delete"));
                expect((await action(db)).success).toBe(true);
                expect(
                    (await db.select().from(schema.timelines).get())!.name,
                ).toBe(type === "undo" ? "Opener" : "First");
            });
        }
    });

    describe("negative controls (informational)", () => {
        it("QA-UNDO-1: a restored v0.6 row-rewriting range trigger makes a shrink's undo fail (U-1)", async ({
            db,
        }) => {
            const { t1, timelineId } = await seed(db);
            await db.run(sql.raw("DROP TRIGGER timeline_tr_range_check"));
            await db.run(
                sql.raw(`CREATE TRIGGER v06_range_anchor AFTER UPDATE OF start_beat, end_beat ON timeline_transitions
                BEGIN
                  UPDATE timeline_assignments
                     SET start_beat = CASE WHEN start_beat = OLD.start_beat THEN NEW.start_beat ELSE start_beat END,
                         end_beat   = CASE WHEN end_beat   = OLD.end_beat   THEN NEW.end_beat   ELSE end_beat   END
                   WHERE transition_id = NEW.id
                     AND (start_beat = OLD.start_beat OR end_beat = OLD.end_beat);
                END`),
            );
            // SQLite fires the newest trigger first. Recreate the history triggers so that they
            // log the transition's inverse before the anchor trigger moves the rows, the order
            // the v0.6 review found (spec Appendix G).
            await dropUndoTriggers(db, "timeline_transitions");
            await createUndoTriggers(db, "timeline_transitions");
            await transactionWithHistory(db, "shrink", async (tx) => {
                await tx
                    .update(schema.timeline_transitions)
                    .set({ end_beat: 20 })
                    .where(eq(schema.timeline_transitions.id, t1));
                // The timeline too, so the transition still spans it at commit (C-11)
                await tx
                    .update(schema.timelines)
                    .set({ end_beat: 20 })
                    .where(eq(schema.timelines.id, timelineId));
            });
            const edited = await snapshot(db);
            expect((await assignmentOf(db, 2)).end_beat).toBe(20);

            // Undo restores the rows before the transition, and the bounds check rejects that
            const undo = await performUndo(db);
            expect(undo.success).toBe(false);
            expect(undo.error?.message).toMatch(/E-A1/);
            expect(await snapshot(db)).toEqual(edited);
        });

        it("QA-UNDO-1b: without the transition-side range check, 'shrink, then fix the rows' commits and can't be undone (U-3)", async ({
            db,
        }) => {
            const { t1, timelineId } = await seed(db);
            await db.run(sql.raw("DROP TRIGGER timeline_tr_range_check"));
            await transactionWithHistory(db, "shrinkThenFix", async (tx) => {
                await tx
                    .update(schema.timeline_transitions)
                    .set({ end_beat: 16 })
                    .where(eq(schema.timeline_transitions.id, t1));
                await tx
                    .update(schema.timeline_assignments)
                    .set({ end_beat: 16 })
                    .where(eq(schema.timeline_assignments.transition_id, t1));
                // The timeline too, so the transition still spans it at commit (C-11)
                await tx
                    .update(schema.timelines)
                    .set({ end_beat: 16 })
                    .where(eq(schema.timelines.id, timelineId));
            });
            const edited = await snapshot(db);

            const undo = await performUndo(db);
            expect(undo.success).toBe(false);
            expect(undo.error?.message).toMatch(/E-A1/);
            expect(await snapshot(db)).toEqual(edited);
        });
    });
});

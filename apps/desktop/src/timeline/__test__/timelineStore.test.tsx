import { afterEach, describe, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { eq, inArray, sql } from "drizzle-orm";
import {
    createResolver,
    createTimelineOracleForTesting,
    type Resolver,
    type XY,
} from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import {
    performRedo,
    performUndo,
    resetTimelineChangeLog,
    transactionWithHistory,
} from "@/db-functions/history";
import { timelineChangeListenerCount } from "@/db-functions/timelineChanges";
import { setTimelineTransitionDestinationInTransaction } from "@/db-functions/timelineTransitions";
import {
    getWorkspaceSettingsParsed,
    updateWorkspaceSettingsParsed,
} from "@/db-functions/workspaceSettings";
import { isTimelineModeEnabled } from "@/settings/workspaceSettings";
import { createTimelineHost } from "../timelineHost";
import { readTimelineTables } from "../timelineRows";
import {
    getTimelineHost,
    isTimelineResolverRunning,
    positionsAt,
    startTimelineResolver,
    stopTimelineResolver,
    timelineMarcherIds,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "../timelineStore";
import { useTimelineResolverSession } from "../TimelineResolverHost";

/**
 * The resolver store (docs/timeline/phases/05-rendering.md P5.3) against a real database. The
 * timeline db-functions are still in review (P4.4), so edits write rows with drizzle inside
 * `transactionWithHistory`, which delivers the batches the store applies.
 */

const tablesToCheck = [
    schema.marchers,
    schema.timelines,
    schema.timeline_shapes,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
];

/** Beats to compare at: before the show, inside and at the edges of every transition, after it. */
const SAMPLE_BEATS = [
    -5,
    0,
    0.5,
    ...Array.from({ length: 101 }, (_, i) => 1 + i * 0.75),
    200,
];

/**
 * Four marchers and one timeline over [0, 96):
 * - transition 1: a line, direct, beats [1, 17)
 * - transition 2: a circle, arc, beats [17, 33)
 * - transition 3: a line, follow-the-leader, beats [33, 49)
 * - transition 4: shapeless (two placed destinations), beats [49, 65), marchers 1 and 2 only
 */
const seedShow = (db: DbConnection) =>
    transactionWithHistory(db, "seedShow", async (tx) => {
        await tx.insert(schema.marchers).values(
            [1, 2, 3, 4].map((id) => ({
                id,
                section: "Brass",
                drill_prefix: "B",
                drill_order: id,
                home_x: 2 * (id - 1),
                home_y: 0,
            })),
        );
        await tx
            .insert(schema.timelines)
            .values({ id: 1, name: "Opener", start_beat: 0, end_beat: 96 });
        await tx.insert(schema.timeline_shapes).values([
            { id: 1, kind: "line", geometry: '{"points":[[0,10],[30,10]]}' },
            {
                id: 2,
                kind: "circle",
                geometry:
                    '{"center":[20,20],"radius":5,"start_angle":0,"clockwise":false}',
            },
            {
                id: 3,
                kind: "line",
                geometry: '{"points":[[0,30],[15,30],[30,40]]}',
            },
        ]);
        const transition = (
            id: number,
            dest_shape_id: number | null,
            path_style: string,
            start_beat: number,
            end_beat: number,
            slot_count = 4,
            path_params: string | null = null,
        ) => ({
            id,
            timeline_id: 1,
            dest_shape_id,
            path_style,
            path_params,
            slot_count,
            start_beat,
            end_beat,
        });
        await tx
            .insert(schema.timeline_transitions)
            .values([
                transition(1, 1, "direct", 1, 17),
                transition(2, 2, "arc", 17, 33, 4, '{"bulge":0.25}'),
                transition(3, 3, "follow_the_leader", 33, 49),
                transition(4, null, "direct", 49, 65, 2),
            ]);
        await tx.insert(schema.timeline_slot_destinations).values([
            { id: 1, transition_id: 4, slot_index: 0, x: 5, y: 5 },
            { id: 2, transition_id: 4, slot_index: 1, x: 7, y: 5 },
        ]);
        let id = 1;
        const assign = (
            transition_id: number,
            start_beat: number,
            end_beat: number,
            marchers: number[],
        ) =>
            marchers.map((marcher_id, slot_index) => ({
                id: id++,
                marcher_id,
                transition_id,
                slot_index,
                start_beat,
                end_beat,
            }));
        await tx
            .insert(schema.timeline_assignments)
            .values([
                ...assign(1, 1, 17, [1, 2, 3, 4]),
                ...assign(2, 17, 33, [4, 3, 2, 1]),
                ...assign(3, 33, 49, [1, 2, 3, 4]),
                ...assign(4, 49, 65, [2, 1]),
            ]);
    });

const expectClose = (actual: XY, expected: XY, what: string) => {
    const tolerance = 1e-9;
    expect(Math.abs(actual[0] - expected[0]), `${what} x`).toBeLessThanOrEqual(
        tolerance,
    );
    expect(Math.abs(actual[1] - expected[1]), `${what} y`).toBeLessThanOrEqual(
        tolerance,
    );
};

/** Compares a resolver's positions with the oracle's over a snapshot, at every sampled beat. */
const expectMatchesOracle = (
    resolver: Resolver,
    oracle: ReturnType<typeof createTimelineOracleForTesting>,
    marcherIds: readonly number[],
) => {
    for (const m of marcherIds)
        for (const b of SAMPLE_BEATS)
            expectClose(
                resolver.positionAt(m, b),
                oracle.positionAt(m, b),
                `marcher ${m} at beat ${b}`,
            );
};

const sortDiagnostics = <T,>(diagnostics: T[]) =>
    diagnostics.map((d) => JSON.stringify(d)).sort();

/**
 * The store's host must equal a fresh cold build: the same mirror, and the same answers as a
 * fresh resolver and the oracle.
 */
const expectStoreMatchesTables = async (db: DbConnection) => {
    await timelineResolverSettled();
    const host = getTimelineHost();
    expect(host, "the store has a host").not.toBeNull();
    const { resolver, snapshot } = host!;
    expect(useTimelineResolverStore.getState().resolver).toBe(resolver);

    const fresh = await readTimelineTables(db);
    expect(snapshot.marchers).toEqual(fresh.snapshot.marchers);
    expect(snapshot.shapes).toEqual(fresh.snapshot.shapes);
    expect(snapshot.transitions).toEqual(fresh.snapshot.transitions);

    const cold = createResolver(fresh.snapshot);
    const oracle = createTimelineOracleForTesting(fresh.snapshot);
    const ids = cold.marcherIds();
    expect(resolver.marcherIds()).toEqual(ids);
    expectMatchesOracle(resolver, oracle, ids);
    for (const m of ids)
        for (const b of SAMPLE_BEATS)
            expectClose(
                resolver.positionAt(m, b),
                cold.positionAt(m, b),
                `cold build: marcher ${m} at beat ${b}`,
            );
    expect(sortDiagnostics(resolver.diagnostics())).toEqual(
        sortDiagnostics(cold.diagnostics()),
    );
    expect(resolver.checkCacheClosure()).toBe(true);
};

const edit = (
    db: DbConnection,
    name: string,
    func: Parameters<typeof transactionWithHistory>[2],
) => transactionWithHistory(db, name, func);

afterEach(() => {
    stopTimelineResolver();
});

describeDbTests("timeline resolver store", (it) => {
    const testWithHistory = getTestWithHistory(it, tablesToCheck);

    describe("cold build", () => {
        it("matches the oracle at sampled beats", async ({ db }) => {
            await seedShow(db);
            const tables = await readTimelineTables(db);
            expect(tables.snapshot.marchers).toEqual([
                { id: 1, home: [0, 0] },
                { id: 2, home: [2, 0] },
                { id: 3, home: [4, 0] },
                { id: 4, home: [6, 0] },
            ]);
            expect(tables.snapshot.transitions[4]!.points).toEqual([
                [5, 5],
                [7, 5],
            ]);
            expect(tables.snapshot.transitions[1]).not.toHaveProperty("points");

            const host = createTimelineHost(tables);
            const oracle = createTimelineOracleForTesting(
                (await readTimelineTables(db)).snapshot,
            );
            expectMatchesOracle(host.resolver, oracle, [1, 2, 3, 4]);
            expect(sortDiagnostics(host.resolver.diagnostics())).toEqual(
                sortDiagnostics(oracle.diagnostics()),
            );
        });

        it("an empty show builds with no marchers", async ({ db }) => {
            await startTimelineResolver(db);
            const state = useTimelineResolverStore.getState();
            expect(state.status).toBe("ready");
            expect(state.resolver?.marcherIds()).toEqual([]);
            expect(positionsAt(1, new Float64Array(0))).toBe(true);
        });

        it("positionsAt reports false for a buffer sized for a different marcher count", async ({
            db,
        }) => {
            await seedShow(db);
            await startTimelineResolver(db);
            const count = timelineMarcherIds().length;
            expect(count).toBeGreaterThan(0);
            expect(positionsAt(1, new Float64Array(2 * count))).toBe(true);
            expect(positionsAt(1, new Float64Array(2 * count - 2))).toBe(false);
            expect(positionsAt(1, new Float64Array(2 * count + 2))).toBe(false);
        });
    });

    describe("batches", () => {
        it("after each committed edit, the store matches a fresh cold build and the oracle", async ({
            db,
        }) => {
            await seedShow(db);
            await startTimelineResolver(db);
            expect(useTimelineResolverStore.getState().status).toBe("ready");
            await expectStoreMatchesTables(db);
            const firstResolver = useTimelineResolverStore.getState().resolver;

            await edit(db, "moveHome", async (tx) => {
                await tx
                    .update(schema.marchers)
                    .set({ home_x: -3, home_y: 4 })
                    .where(eq(schema.marchers.id, 2));
            });
            await expectStoreMatchesTables(db);

            await edit(db, "growCircle", async (tx) => {
                await tx
                    .update(schema.timeline_shapes)
                    .set({
                        geometry:
                            '{"center":[20,22],"radius":8,"start_angle":1,"clockwise":true}',
                    })
                    .where(eq(schema.timeline_shapes.id, 2));
            });
            await expectStoreMatchesTables(db);

            await edit(db, "stretchTransition", async (tx) => {
                await tx
                    .update(schema.timeline_transitions)
                    .set({ end_beat: 70 })
                    .where(eq(schema.timeline_transitions.id, 4));
            });
            await expectStoreMatchesTables(db);

            await edit(db, "moveDestination", async (tx) => {
                await tx
                    .update(schema.timeline_slot_destinations)
                    .set({ x: 9, y: -2 })
                    .where(eq(schema.timeline_slot_destinations.id, 2));
            });
            await expectStoreMatchesTables(db);

            await edit(db, "leaveFtl", async (tx) => {
                await tx
                    .delete(schema.timeline_assignments)
                    .where(
                        sql`${schema.timeline_assignments.transition_id} = 3 AND ${schema.timeline_assignments.marcher_id} = 2`,
                    );
            });
            await expectStoreMatchesTables(db);

            // A new marcher, placed in a new slot of the shapeless transition, in one edit
            await edit(db, "addMarcher", async (tx) => {
                await tx.insert(schema.marchers).values({
                    id: 5,
                    section: "Brass",
                    drill_prefix: "B",
                    drill_order: 5,
                    home_x: 12,
                    home_y: -6,
                });
                await tx
                    .update(schema.timeline_transitions)
                    .set({ slot_count: 3 })
                    .where(eq(schema.timeline_transitions.id, 4));
                await tx.insert(schema.timeline_slot_destinations).values({
                    id: 3,
                    transition_id: 4,
                    slot_index: 2,
                    x: 11,
                    y: 5,
                });
                await tx.insert(schema.timeline_assignments).values({
                    id: 100,
                    marcher_id: 5,
                    transition_id: 4,
                    slot_index: 2,
                    start_beat: 50,
                    end_beat: 70,
                });
            });
            await expectStoreMatchesTables(db);
            expect(
                getTimelineHost()!.snapshot.transitions[4]!.points,
            ).toHaveLength(3);

            await edit(db, "straightenArc", async (tx) => {
                await tx
                    .update(schema.timeline_transitions)
                    .set({ path_style: "direct", path_params: null })
                    .where(eq(schema.timeline_transitions.id, 2));
            });
            await expectStoreMatchesTables(db);

            // Delete the shapeless transition and everything under it
            await edit(db, "deleteTransition", async (tx) => {
                await tx
                    .delete(schema.timeline_assignments)
                    .where(eq(schema.timeline_assignments.transition_id, 4));
                await tx
                    .delete(schema.timeline_slot_destinations)
                    .where(
                        eq(schema.timeline_slot_destinations.transition_id, 4),
                    );
                await tx
                    .delete(schema.timeline_transitions)
                    .where(eq(schema.timeline_transitions.id, 4));
            });
            await expectStoreMatchesTables(db);
            expect(getTimelineHost()!.destinations.has(4)).toBe(false);

            // Deleting a marcher cascades to its assignments
            await edit(db, "deleteMarcher", async (tx) => {
                await tx
                    .delete(schema.marchers)
                    .where(inArray(schema.marchers.id, [3]));
            });
            await expectStoreMatchesTables(db);
            expect(timelineMarcherIds()).toEqual([1, 2, 4, 5]);

            // Every batch was applied to the same resolver: no rebuilds
            expect(useTimelineResolverStore.getState().resolver).toBe(
                firstResolver,
            );
        });

        it("positionsAt fills the render buffer in marcher id order", async ({
            db,
        }) => {
            await seedShow(db);
            await startTimelineResolver(db);
            const resolver = useTimelineResolverStore.getState().resolver!;
            const ids = timelineMarcherIds();
            expect(ids).toEqual([1, 2, 3, 4]);

            const out = new Float64Array(2 * ids.length);
            for (const beat of [0, 9, 25, 40, 57, 80]) {
                expect(positionsAt(beat, out)).toBe(true);
                ids.forEach((m, i) =>
                    expectClose(
                        [out[2 * i]!, out[2 * i + 1]!],
                        resolver.positionAt(m, beat),
                        `marcher ${m} at beat ${beat}`,
                    ),
                );
            }
        });

        it("a transition switches between a shape and individual destinations", async ({
            db,
        }) => {
            await seedShow(db);
            await startTimelineResolver(db);
            const firstResolver = useTimelineResolverStore.getState().resolver;

            // Shapeless → shape
            await edit(db, "toShape", (tx) =>
                setTimelineTransitionDestinationInTransaction({
                    tx,
                    transitionId: 4,
                    destination: { kind: "shape", shapeId: 1 },
                }),
            );
            await expectStoreMatchesTables(db);
            expect(
                getTimelineHost()!.snapshot.transitions[4],
            ).not.toHaveProperty("points");
            expect(getTimelineHost()!.destinations.has(4)).toBe(false);

            // Shape → individual destinations
            await edit(db, "toPoints", (tx) =>
                setTimelineTransitionDestinationInTransaction({
                    tx,
                    transitionId: 1,
                    destination: {
                        kind: "individual",
                        points: [
                            [1, 1],
                            [3, 1],
                            [5, 1],
                            [7, 1],
                        ],
                    },
                }),
            );
            await expectStoreMatchesTables(db);
            expect(getTimelineHost()!.snapshot.transitions[1]!.dest).toBeNull();
            expect(getTimelineHost()!.snapshot.transitions[1]!.points).toEqual([
                [1, 1],
                [3, 1],
                [5, 1],
                [7, 1],
            ]);
            expect(useTimelineResolverStore.getState().resolver).toBe(
                firstResolver,
            );
        });

        it("a destination update that changes slot_index", async ({ db }) => {
            await seedShow(db);
            await startTimelineResolver(db);
            // Rotate transition 4's destinations up one slot, into a new third slot
            await edit(db, "rotateSlots", async (tx) => {
                await tx
                    .update(schema.timeline_transitions)
                    .set({ slot_count: 3 })
                    .where(eq(schema.timeline_transitions.id, 4));
                await tx
                    .update(schema.timeline_slot_destinations)
                    .set({ slot_index: 2 })
                    .where(eq(schema.timeline_slot_destinations.id, 2));
                await tx
                    .update(schema.timeline_slot_destinations)
                    .set({ slot_index: 1 })
                    .where(eq(schema.timeline_slot_destinations.id, 1));
                await tx.insert(schema.timeline_slot_destinations).values({
                    id: 3,
                    transition_id: 4,
                    slot_index: 0,
                    x: -4,
                    y: 9,
                });
            });
            await expectStoreMatchesTables(db);
            expect(getTimelineHost()!.snapshot.transitions[4]!.points).toEqual([
                [-4, 9],
                [5, 5],
                [7, 5],
            ]);
        });

        it("an edit committed while the cold build is pending", async ({
            db,
        }) => {
            await seedShow(db);
            const started = startTimelineResolver(db);
            expect(useTimelineResolverStore.getState().status).toBe("loading");
            const edited = edit(db, "moveHome", async (tx) => {
                await tx
                    .update(schema.marchers)
                    .set({ home_x: 11, home_y: -7 })
                    .where(eq(schema.marchers.id, 3));
            });
            await Promise.all([started, edited]);
            await expectStoreMatchesTables(db);
            expect(
                useTimelineResolverStore.getState().resolver!.positionAt(3, -1),
            ).toEqual([11, -7]);

            // And a reset while a rebuild is pending, followed by an edit
            const reset = resetTimelineChangeLog(db);
            const again = edit(db, "moveHomeAgain", async (tx) => {
                await tx
                    .update(schema.marchers)
                    .set({ home_x: 12 })
                    .where(eq(schema.marchers.id, 3));
            });
            await Promise.all([reset, again]);
            await expectStoreMatchesTables(db);
            expect(
                useTimelineResolverStore.getState().resolver!.positionAt(3, -1),
            ).toEqual([12, -7]);
        });

        it("each applied batch bumps the version", async ({ db }) => {
            await seedShow(db);
            await startTimelineResolver(db);
            const before = useTimelineResolverStore.getState().version;
            await edit(db, "moveHome", async (tx) => {
                await tx
                    .update(schema.marchers)
                    .set({ home_x: 1 })
                    .where(eq(schema.marchers.id, 1));
            });
            expect(useTimelineResolverStore.getState().version).toBe(
                before + 1,
            );
        });
    });

    describe("reset", () => {
        it("rebuilds from the tables, including writes that bypassed the wrapper", async ({
            db,
        }) => {
            await seedShow(db);
            await startTimelineResolver(db);
            const first = useTimelineResolverStore.getState().resolver;

            // A write outside the wrapper, like a migration or repair: no batch
            await db.run(sql`UPDATE marchers SET home_x = 9 WHERE id = 2`);
            await db.run(
                sql`UPDATE timeline_shapes SET geometry = '{"points":[[0,12],[30,12]]}' WHERE id = 1`,
            );

            await resetTimelineChangeLog(db);
            await timelineResolverSettled();

            const state = useTimelineResolverStore.getState();
            expect(state.status).toBe("ready");
            expect(state.resolver).not.toBe(first);
            await expectStoreMatchesTables(db);
            expect(state.resolver!.positionAt(2, -1)).toEqual([9, 0]);
        });

        it("a batch the host can't apply triggers a rebuild", async ({
            db,
        }) => {
            await seedShow(db);
            await startTimelineResolver(db);
            const first = useTimelineResolverStore.getState().resolver;

            // Corrupt the mirror so that the next batch touching the shapes fails
            const host = getTimelineHost()!;
            delete host.snapshot.shapes[1];
            await edit(db, "shrinkTransition", async (tx) => {
                await tx
                    .delete(schema.timeline_assignments)
                    .where(
                        sql`${schema.timeline_assignments.transition_id} = 1 AND ${schema.timeline_assignments.slot_index} = 3`,
                    );
                await tx
                    .update(schema.timeline_transitions)
                    .set({ slot_count: 3 })
                    .where(eq(schema.timeline_transitions.id, 1));
            });
            await timelineResolverSettled();

            expect(useTimelineResolverStore.getState().resolver).not.toBe(
                first,
            );
            await expectStoreMatchesTables(db);
        });
    });

    describe("undo and redo", () => {
        testWithHistory(
            "the store follows undo and redo",
            async ({ db, expectNumberOfChanges }) => {
                await seedShow(db);
                const state = await expectNumberOfChanges.getDatabaseState(db);
                await startTimelineResolver(db);
                try {
                    await edit(db, "moveDestination", async (tx) => {
                        await tx
                            .update(schema.timeline_slot_destinations)
                            .set({ x: 3 })
                            .where(eq(schema.timeline_slot_destinations.id, 1));
                        await tx
                            .update(schema.marchers)
                            .set({ home_y: 5 })
                            .where(eq(schema.marchers.id, 4));
                    });
                    await edit(db, "dropAssignment", async (tx) => {
                        await tx
                            .delete(schema.timeline_assignments)
                            .where(eq(schema.timeline_assignments.id, 5));
                    });
                    await expectStoreMatchesTables(db);

                    for (let i = 0; i < 2; i++) {
                        const undo = await performUndo(db);
                        expect(undo.success, undo.error?.message).toBe(true);
                        await expectStoreMatchesTables(db);
                    }
                    for (let i = 0; i < 2; i++) {
                        const redo = await performRedo(db);
                        expect(redo.success, redo.error?.message).toBe(true);
                        await expectStoreMatchesTables(db);
                    }
                } finally {
                    stopTimelineResolver();
                }
                await expectNumberOfChanges.test(db, 2, state);
            },
        );
    });

    describe("dev flag (P5.1)", () => {
        it("is off by default and read from workspace_settings", async ({
            db,
        }) => {
            const settings = await getWorkspaceSettingsParsed({ db });
            expect(settings.timelineMode).toBeUndefined();
            expect(isTimelineModeEnabled(settings)).toBe(false);

            await updateWorkspaceSettingsParsed({
                db,
                settings: { ...settings, timelineMode: true },
            });
            expect(
                isTimelineModeEnabled(await getWorkspaceSettingsParsed({ db })),
            ).toBe(true);
        });

        it("with the flag off nothing subscribes; turning it on starts the store, and off stops it", async ({
            db,
        }) => {
            await seedShow(db);
            const listenersBefore = timelineChangeListenerCount();

            const { rerender, unmount } = renderHook(
                ({ enabled }) => useTimelineResolverSession(db, enabled),
                { initialProps: { enabled: false } },
            );
            expect(timelineChangeListenerCount()).toBe(listenersBefore);
            expect(isTimelineResolverRunning()).toBe(false);
            expect(useTimelineResolverStore.getState().status).toBe("off");

            // An edit with the flag off builds nothing
            await edit(db, "moveHome", async (tx) => {
                await tx
                    .update(schema.marchers)
                    .set({ home_x: 1 })
                    .where(eq(schema.marchers.id, 1));
            });
            expect(useTimelineResolverStore.getState().resolver).toBeNull();

            rerender({ enabled: true });
            expect(timelineChangeListenerCount()).toBe(listenersBefore + 1);
            await timelineResolverSettled();
            expect(useTimelineResolverStore.getState().status).toBe("ready");
            await expectStoreMatchesTables(db);

            rerender({ enabled: false });
            expect(timelineChangeListenerCount()).toBe(listenersBefore);
            expect(isTimelineResolverRunning()).toBe(false);
            expect(useTimelineResolverStore.getState()).toMatchObject({
                status: "off",
                resolver: null,
            });
            expect(positionsAt(1, new Float64Array(8))).toBe(false);
            unmount();
        });
    });
});

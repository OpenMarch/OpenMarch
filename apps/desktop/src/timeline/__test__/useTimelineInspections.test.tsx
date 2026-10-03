import { afterEach, expect } from "vitest";
import { eq } from "drizzle-orm";
import { renderHook, waitFor } from "@testing-library/react";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import {
    performRedo,
    performUndo,
    transactionWithHistory,
} from "@/db-functions/history";
import {
    startTimelineResolver,
    stopTimelineResolver,
    useTimelineResolverStore,
} from "../timelineStore";
import { useTimelineInspections } from "../useTimelineInspections";
import { updateTimelineShape } from "@/db-functions/timelineShapes";

/**
 * `useTimelineInspections` (P8.5) against a real database: the explanation joined with the rows
 * it names (timeline, layer, shape), re-derived after each committed edit and undo.
 */

const seedShow = (db: DbConnection) =>
    transactionWithHistory(db, "seedShow", async (tx) => {
        await tx.insert(schema.marchers).values(
            [1, 2].map((id) => ({
                id,
                section: "Brass",
                drill_prefix: "B",
                drill_order: id,
                home_x: 2 * id,
                home_y: 0,
            })),
        );
        await tx
            .insert(schema.timelines)
            .values({ id: 1, name: "Opener", start_beat: 1, end_beat: 9 });
        await tx.insert(schema.timeline_shapes).values({
            id: 1,
            name: "Front line",
            kind: "line",
            geometry: '{"points":[[0,10],[30,10]]}',
        });
        await tx.insert(schema.timeline_transitions).values({
            id: 1,
            timeline_id: 1,
            dest_shape_id: 1,
            path_style: "direct",
            slot_count: 3,
            start_beat: 1,
            end_beat: 9,
        });
        await tx.insert(schema.timeline_assignments).values(
            [1, 2].map((marcher_id, slot_index) => ({
                id: marcher_id,
                marcher_id,
                transition_id: 1,
                slot_index,
                start_beat: 1,
                end_beat: 9,
                layer: 4,
            })),
        );
    });

afterEach(() => {
    stopTimelineResolver();
});

describeDbTests("useTimelineInspections", (it) => {
    it("explains each marcher with its timeline, layer, shape and the show's diagnostics", async ({
        db,
    }) => {
        await seedShow(db);
        await startTimelineResolver(db);
        const ids = [1, 2];
        const { result } = renderHook(() =>
            useTimelineInspections({
                database: db,
                enabled: true,
                marcherIds: ids,
                beat: 5,
            }),
        );
        await waitFor(() => expect(result.current.inspections).toHaveLength(2));
        const [first] = result.current.inspections;
        expect(first).toMatchObject({
            marcherId: 1,
            layer: 4,
            span: { kind: "founding", slot: 0 },
            transition: {
                id: 1,
                timelineName: "Opener",
                slotCount: 3,
                destination: {
                    kind: "shape",
                    name: "Front line",
                    shape: "line",
                },
            },
        });
        // Slot 2 of the transition has nobody
        expect(result.current.diagnostics.map((d) => d.code)).toEqual([
            "D-VACANT",
        ]);
        expect(first!.diagnostics.map((d) => d.code)).toEqual(["D-VACANT"]);
        // P8.3: both marchers are in transition 1, so it is offered once
        expect(result.current.transitionEdits).toHaveLength(1);
        expect(result.current.transitionEdits[0]).toMatchObject({
            id: 1,
            style: "direct",
            slotCount: 3,
            minSlotCount: 2,
            destination: { kind: "shape", shapeId: 1 },
        });
        expect(result.current.shapeOptions).toEqual([
            { id: 1, name: "Front line", kind: "line", capacity: null },
        ]);
        // P8.4: the same transition's slots, with drill numbers and the vacancy
        expect(result.current.assignmentEdits).toEqual([
            {
                version: expect.any(Number),
                transitionId: 1,
                style: "direct",
                start: 1,
                end: 9,
                slotCount: 3,
                members: [1, 2].map((id, slot) => ({
                    assignmentId: id,
                    marcherId: id,
                    label: `B${id}`,
                    slot,
                    start: 1,
                    end: 9,
                    layer: 4,
                    stolen: [],
                })),
                vacantSlots: [2],
            },
        ]);
    });

    it("explains nobody while there is no beat, and ignores marchers the resolver lacks", async ({
        db,
    }) => {
        await seedShow(db);
        await startTimelineResolver(db);
        const ids = [1, 99];
        const { result, rerender } = renderHook(
            ({ beat }: { beat: number | null }) =>
                useTimelineInspections({
                    database: db,
                    enabled: true,
                    marcherIds: ids,
                    beat,
                }),
            { initialProps: { beat: null as number | null } },
        );
        await waitFor(() => expect(result.current.diagnostics).toHaveLength(1));
        expect(result.current.inspections).toEqual([]);
        rerender({ beat: 5 });
        await waitFor(() =>
            expect(result.current.inspections.map((i) => i.marcherId)).toEqual([
                1,
            ]),
        );
    });

    it("follows a committed edit and its undo", async ({ db }) => {
        await seedShow(db);
        await startTimelineResolver(db);
        const ids = [1];
        const { result } = renderHook(() =>
            useTimelineInspections({
                database: db,
                enabled: true,
                marcherIds: ids,
                beat: 5,
            }),
        );
        await waitFor(() => expect(result.current.inspections).toHaveLength(1));
        expect(result.current.inspections[0]!.layer).toBe(4);

        await transactionWithHistory(db, "relayer", async (tx) => {
            await tx.update(schema.timeline_assignments).set({ layer: 7 });
        });
        await waitFor(() =>
            expect(result.current.inspections[0]!.layer).toBe(7),
        );

        await performUndo(db);
        await waitFor(() =>
            expect(result.current.inspections[0]!.layer).toBe(4),
        );
    });

    it("lists every shape for the shape editor (P8.2) with no page, and follows a rename, a reshape and their undo", async ({
        db,
    }) => {
        await seedShow(db);
        await startTimelineResolver(db);
        const ids: number[] = [];
        const { result } = renderHook(() =>
            useTimelineInspections({
                database: db,
                enabled: true,
                marcherIds: ids,
                beat: null,
            }),
        );
        await waitFor(() =>
            expect(result.current.shapeEdits.targets).toHaveLength(1),
        );
        const first = result.current.shapeEdits;
        expect(first.targets[0]).toMatchObject({
            id: 1,
            name: "Front line",
            usedBy: [{ transitionId: 1, style: "direct", slotCount: 3 }],
            minCells: 3,
            version: first.version,
        });

        await updateTimelineShape({
            db,
            modified: {
                id: 1,
                name: "Company front",
                geometry: {
                    points: [
                        [0, 20],
                        [30, 20],
                    ],
                },
            },
        });
        await waitFor(() =>
            expect(result.current.shapeEdits.targets[0]!.name).toBe(
                "Company front",
            ),
        );
        const edited = result.current.shapeEdits;
        expect(edited.version).toBeGreaterThan(first.version);
        expect(edited.targets[0]!.shape.geometry).toEqual({
            points: [
                [0, 20],
                [30, 20],
            ],
        });

        await performUndo(db);
        await waitFor(() =>
            expect(result.current.shapeEdits.targets[0]!.name).toBe(
                "Front line",
            ),
        );
        expect(result.current.shapeEdits.version).toBeGreaterThan(
            edited.version,
        );
    });

    it("counts only known marchers as omitted, and reports the unknown ones", async ({
        db,
    }) => {
        await seedShow(db);
        await transactionWithHistory(db, "moreMarchers", async (tx) => {
            await tx.insert(schema.marchers).values(
                Array.from({ length: 10 }, (_, k) => ({
                    id: k + 3,
                    section: "Brass",
                    drill_prefix: "B",
                    drill_order: k + 3,
                    home_x: 0,
                    home_y: 0,
                })),
            );
        });
        await startTimelineResolver(db);
        // 12 known marchers and one the resolver lacks
        const ids = [...Array.from({ length: 12 }, (_, k) => k + 1), 99];
        const { result } = renderHook(() =>
            useTimelineInspections({
                database: db,
                enabled: true,
                marcherIds: ids,
                beat: 5,
            }),
        );
        await waitFor(() =>
            expect(result.current.inspections).toHaveLength(10),
        );
        expect(result.current.omitted).toBe(2);
        expect(result.current.unknownMarcherIds).toEqual([99]);
    });

    it("reports no unknown marchers while disabled", async ({ db }) => {
        await seedShow(db);
        await startTimelineResolver(db);
        const ids = [99];
        const { result } = renderHook(() =>
            useTimelineInspections({
                database: db,
                enabled: false,
                marcherIds: ids,
                beat: 5,
            }),
        );
        expect(result.current.unknownMarcherIds).toEqual([]);
    });

    it("reads nothing while disabled", async ({ db }) => {
        await seedShow(db);
        await startTimelineResolver(db);
        const ids = [1];
        const { result } = renderHook(() =>
            useTimelineInspections({
                database: db,
                enabled: false,
                marcherIds: ids,
                beat: 5,
            }),
        );
        expect(result.current.inspections).toEqual([]);
        expect(result.current.diagnostics).toEqual([]);
    });

    it("reloads after a timeline rename, which the change log doesn't carry (P7.15)", async ({
        db,
    }) => {
        await seedShow(db);
        await startTimelineResolver(db);
        const ids = [1, 2];
        const { result } = renderHook(() =>
            useTimelineInspections({
                database: db,
                enabled: true,
                marcherIds: ids,
                beat: 5,
            }),
        );
        await waitFor(() =>
            expect(
                result.current.inspections[0]?.transition?.timelineName,
            ).toBe("Opener"),
        );
        const name = () =>
            result.current.inspections[0]?.transition?.timelineName;

        await transactionWithHistory(db, "renameTimeline", (tx) =>
            tx
                .update(schema.timelines)
                .set({ name: "Renamed" })
                .where(eq(schema.timelines.id, 1)),
        );
        await waitFor(() => expect(name()).toBe("Renamed"));
        await performUndo(db);
        await waitFor(() => expect(name()).toBe("Opener"));
        await performRedo(db);
        await waitFor(() => expect(name()).toBe("Renamed"));
    });

    it("a display-only edit raises the assignment target's version, so an editor waiting on it re-enables (P7.15, P8.4)", async ({
        db,
    }) => {
        await seedShow(db);
        await startTimelineResolver(db);
        const ids = [1, 2];
        const { result } = renderHook(() =>
            useTimelineInspections({
                database: db,
                enabled: true,
                marcherIds: ids,
                beat: 5,
            }),
        );
        await waitFor(() =>
            expect(result.current.assignmentEdits).toHaveLength(1),
        );
        const before = result.current.assignmentEdits[0]!.version;
        const resolverVersion = useTimelineResolverStore.getState().version;

        // A timeline rename writes no change-log row: only the display version moves
        await transactionWithHistory(db, "renameTimeline", (tx) =>
            tx
                .update(schema.timelines)
                .set({ name: "Renamed" })
                .where(eq(schema.timelines.id, 1)),
        );
        await waitFor(() =>
            expect(result.current.assignmentEdits[0]!.version).toBeGreaterThan(
                before,
            ),
        );
        expect(useTimelineResolverStore.getState().version).toBe(
            resolverVersion,
        );
    });
});

import { afterEach, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { performUndo, transactionWithHistory } from "@/db-functions/history";
import { startTimelineResolver, stopTimelineResolver } from "../timelineStore";
import { useTimelineInspections } from "../useTimelineInspections";

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
            .values({ id: 1, name: "Opener", start_beat: 0, end_beat: 16 });
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
});

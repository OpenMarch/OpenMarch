import { afterEach, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { eq } from "drizzle-orm";
import {
    performRedo,
    performUndo,
    transactionWithHistory,
} from "@/db-functions/history";
import type { TimelineInput } from "@/components/timeline/Timeline";
import {
    startTimelineResolver,
    stopTimelineResolver,
    useTimelineResolverStore,
} from "../timelineStore";
import { marcherTrackId, shapeTrackId } from "../timelineViewModel";
import { useTimelineTracks } from "../useTimelineTracks";

const lockCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/db-functions/history", async (importOriginal) => {
    const actual =
        await importOriginal<typeof import("@/db-functions/history")>();
    return {
        ...actual,
        withTimelineWriteLock: <T,>(operation: () => Promise<T>) => {
            lockCalls.count += 1;
            return actual.withTimelineWriteLock(operation);
        },
    };
});

/**
 * `useTimelineTracks` (P8.8) against a real database: it builds the tracks once the resolver is
 * ready, and rebuilds them after each committed edit and undo.
 */

/** Two marchers moving into a line over [1, 9), on timeline 1. */
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
            slot_count: 2,
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
            })),
        );
    });

/** Marcher 1 breaks away alone over [5, 9) on a new timeline, at layer 1. */
const stealMarcher1 = (db: DbConnection) =>
    transactionWithHistory(db, "stealMarcher1", async (tx) => {
        await tx
            .insert(schema.timelines)
            .values({ id: 2, name: "Breakaway", start_beat: 5, end_beat: 9 });
        await tx.insert(schema.timeline_transitions).values({
            id: 2,
            timeline_id: 2,
            dest_shape_id: null,
            path_style: "direct",
            slot_count: 1,
            start_beat: 5,
            end_beat: 9,
        });
        await tx
            .insert(schema.timeline_slot_destinations)
            .values({ id: 1, transition_id: 2, slot_index: 0, x: 4, y: 4 });
        await tx.insert(schema.timeline_assignments).values({
            id: 3,
            marcher_id: 1,
            transition_id: 2,
            slot_index: 0,
            start_beat: 5,
            end_beat: 9,
            layer: 1,
        });
    });

const NONE = new Set<number>();

afterEach(() => {
    stopTimelineResolver();
});

describeDbTests("useTimelineTracks", (it) => {
    it("rebuilds the tracks after a committed edit and its undo", async ({
        db,
    }) => {
        await seedShow(db);
        await startTimelineResolver(db);
        const { result } = renderHook(() =>
            useTimelineTracks({
                database: db,
                enabled: true,
                selectedMarcherIds: NONE,
            }),
        );
        await waitFor(() =>
            expect(result.current.map((t) => t.id)).toEqual([
                shapeTrackId(1, 1),
            ]),
        );
        expect(result.current[0]).toMatchObject({
            label: "Front line",
            startBeatIndex: 1,
            endBeatIndex: 9,
        });

        await stealMarcher1(db);
        await waitFor(() =>
            expect(result.current.map((t) => t.id)).toEqual([
                shapeTrackId(1, 1),
                marcherTrackId(2, 1),
            ]),
        );
        const breakaway = result.current[1]!;
        expect(breakaway).toMatchObject({ label: "B1", linkId: 2 });
        expect(breakaway.activitySpans).toEqual([
            { startBeatIndex: 5, endBeatIndex: 9, active: true },
        ]);
        // Marcher 2 still moves into the line, so its track stays active
        expect(result.current[0]!.activitySpans).toEqual([
            { startBeatIndex: 1, endBeatIndex: 9, active: true },
        ]);

        await performUndo(db);
        await waitFor(() =>
            expect(result.current.map((t) => t.id)).toEqual([
                shapeTrackId(1, 1),
            ]),
        );
    });

    it("refreshes after a shape rename and its undo and redo, which the change log doesn't carry (P7.15)", async ({
        db,
    }) => {
        await seedShow(db);
        await startTimelineResolver(db);
        const { result } = renderHook(() =>
            useTimelineTracks({
                database: db,
                enabled: true,
                selectedMarcherIds: NONE,
            }),
        );
        await waitFor(() =>
            expect(result.current[0]?.label).toBe("Front line"),
        );

        await transactionWithHistory(db, "renameShape", (tx) =>
            tx
                .update(schema.timeline_shapes)
                .set({ name: "Back line" })
                .where(eq(schema.timeline_shapes.id, 1)),
        );
        await waitFor(() => expect(result.current[0]?.label).toBe("Back line"));
        await performUndo(db);
        await waitFor(() =>
            expect(result.current[0]?.label).toBe("Front line"),
        );
        await performRedo(db);
        await waitFor(() => expect(result.current[0]?.label).toBe("Back line"));
    });

    it("refreshes drill numbers, loading once for a write that moves both versions (P7.15)", async ({
        db,
    }) => {
        await seedShow(db);
        await stealMarcher1(db);
        await startTimelineResolver(db);
        const selected = new Set([1]);
        const { result } = renderHook(() =>
            useTimelineTracks({
                database: db,
                enabled: true,
                selectedMarcherIds: selected,
            }),
        );
        await waitFor(() =>
            expect(result.current.map((t) => t.label)).toContain("B1"),
        );
        const loadsBefore = lockCalls.count;

        await transactionWithHistory(db, "renumber", (tx) =>
            tx
                .update(schema.marchers)
                .set({ drill_order: 9 })
                .where(eq(schema.marchers.id, 1)),
        );
        await waitFor(() =>
            expect(result.current.map((t) => t.label)).toContain("B9"),
        );
        expect(lockCalls.count - loadsBefore).toBe(1);

        // A new marcher is in the change log too, so one write moves both versions
        const loads = lockCalls.count;
        const resolverVersion = useTimelineResolverStore.getState().version;
        await transactionWithHistory(db, "addMarcher", (tx) =>
            tx.insert(schema.marchers).values({
                id: 3,
                section: "Brass",
                drill_prefix: "B",
                drill_order: 3,
            }),
        );
        await waitFor(() => expect(lockCalls.count).toBeGreaterThan(loads));
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(useTimelineResolverStore.getState().version).toBeGreaterThan(
            resolverVersion,
        );
        expect(lockCalls.count - loads).toBe(1);
    });

    it("shows the selected marchers' tracks", async ({ db }) => {
        await seedShow(db);
        await startTimelineResolver(db);
        const { result } = renderHook(() =>
            useTimelineTracks({
                database: db,
                enabled: true,
                selectedMarcherIds: new Set([2]),
            }),
        );
        await waitFor(() =>
            expect(result.current.map((t) => t.id)).toEqual([
                shapeTrackId(1, 1),
                marcherTrackId(1, 2),
            ]),
        );
    });

    it("never builds rows of one version against another version's resolver", async ({
        db,
    }) => {
        await seedShow(db);
        await startTimelineResolver(db);
        const seen: (readonly TimelineInput[])[] = [];
        const { result } = renderHook(() => {
            const tracks = useTimelineTracks({
                database: db,
                enabled: true,
                selectedMarcherIds: NONE,
            });
            seen.push(tracks);
            return tracks;
        });
        await waitFor(() => expect(result.current).toHaveLength(1));
        const before = result.current;
        seen.length = 0;

        await stealMarcher1(db);
        await waitFor(() => expect(result.current).toHaveLength(2));
        const after = result.current;
        // Every render showed the old tracks (the same array) or the new ones: no build paired
        // the old rows with the new resolver, which would be a third, new array
        expect(
            seen.every((tracks) => tracks === before || tracks === after),
        ).toBe(true);
    });

    it("a selection change reuses the version's spans and diagnostics", async ({
        db,
    }) => {
        await seedShow(db);
        await startTimelineResolver(db);
        const { result, rerender } = renderHook(
            ({ selected }: { selected: ReadonlySet<number> }) =>
                useTimelineTracks({
                    database: db,
                    enabled: true,
                    selectedMarcherIds: selected,
                }),
            { initialProps: { selected: NONE } },
        );
        await waitFor(() => expect(result.current).toHaveLength(1));
        const resolver = useTimelineResolverStore.getState().resolver!;
        const spanInfos = vi.spyOn(resolver, "spanInfos");
        const diagnostics = vi.spyOn(resolver, "diagnostics");

        // The shape track already asked for both members' spans
        rerender({ selected: new Set([2]) });
        expect(result.current.map((t) => t.id)).toEqual([
            shapeTrackId(1, 1),
            marcherTrackId(1, 2),
        ]);
        expect(spanInfos).not.toHaveBeenCalled();
        expect(diagnostics).not.toHaveBeenCalled();
    });

    it("builds nothing while disabled", async ({ db }) => {
        await seedShow(db);
        await startTimelineResolver(db);
        const { result } = renderHook(() =>
            useTimelineTracks({
                database: db,
                enabled: false,
                selectedMarcherIds: NONE,
            }),
        );
        // Give a read the chance to land, had one started
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(result.current).toEqual([]);
    });
});

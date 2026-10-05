import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { transactionWithHistory, performUndo } from "@/db-functions/history";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import type Marcher from "@/global/classes/Marcher";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";
import { defaultSettings } from "@/stores/UiSettingsStore";
import {
    selectedStoredTimeline,
    useTimelineSelectionStore,
    type StoredTimelineMembership,
} from "@/stores/TimelineSelectionStore";
import { shiftTimeline } from "@/db-functions/timelineCommands";
import LassoListeners from "@/components/canvas/listeners/LassoListeners";
import { startTimelineResolver, stopTimelineResolver } from "../timelineStore";
import {
    readStoredTimelineMemberships,
    useTimelineSelectionHost,
} from "../useTimelineSelectionHost";
import {
    useDeselectDimmedMarchers,
    useTimelineDimming,
} from "../useTimelineDimming";

/**
 * The UI-9 selection's read model and what it draws (P8.11): the stored timelines and who is in
 * each, dimming marchers outside the selected timeline, and keeping them out of the marcher
 * selection.
 */

const store = () => useTimelineSelectionStore.getState();
beforeEach(() => store().reset());

const marcher = (id: number) =>
    ({
        id,
        name: null,
        section: "Brass",
        year: null,
        notes: null,
        drill_prefix: "B",
        drill_order: id,
        drill_number: `B${id}`,
        type: "marcher",
    }) as unknown as Marcher;

const membership = (
    id: number,
    start: number,
    end: number,
    marcherIds: number[],
): StoredTimelineMembership => ({
    id,
    start,
    end,
    marcherIds: new Set(marcherIds),
});

/** Marchers 1 and 2 move over [1, 9) on timeline 1; marcher 3 is in no timeline. */
const seedShow = (db: DbConnection) =>
    transactionWithHistory(db, "seedShow", async (tx) => {
        await tx.insert(schema.marchers).values(
            [1, 2, 3].map((id) => ({
                id,
                section: "Brass",
                drill_prefix: "B",
                drill_order: id,
            })),
        );
        await tx
            .insert(schema.timelines)
            .values({ id: 1, name: null, start_beat: 1, end_beat: 9 });
        await tx.insert(schema.timeline_transitions).values(
            [1, 2].map((id) => ({
                id,
                timeline_id: 1,
                dest_shape_id: null,
                path_style: "direct" as const,
                slot_count: 1,
                start_beat: 1,
                end_beat: 9,
            })),
        );
        await tx.insert(schema.timeline_slot_destinations).values(
            [1, 2].map((id) => ({
                id,
                transition_id: id,
                slot_index: 0,
                x: id,
                y: id,
            })),
        );
        await tx.insert(schema.timeline_assignments).values(
            [1, 2].map((id) => ({
                id,
                marcher_id: id,
                transition_id: id,
                slot_index: 0,
                start_beat: 1,
                end_beat: 9,
            })),
        );
    });

describeDbTests("the stored timelines the selection resolves to", (it) => {
    it("reads every stored timeline and who is in it, empty ones included", async ({
        db,
    }) => {
        await seedShow(db);
        await transactionWithHistory(db, "emptyTimeline", (tx) =>
            tx
                .insert(schema.timelines)
                .values({ id: 2, name: null, start_beat: 9, end_beat: 17 }),
        );
        const timelines = await readStoredTimelineMemberships(db);
        expect(timelines).toEqual([
            membership(1, 1, 9, [1, 2]),
            membership(2, 9, 17, []),
        ]);
    });

    it("keeps them current after a commit and its undo, and clears them when disabled", async ({
        db,
    }) => {
        await seedShow(db);
        await startTimelineResolver(db);
        try {
            const { rerender } = renderHook(
                ({ enabled }: { enabled: boolean }) =>
                    useTimelineSelectionHost(db, enabled),
                { initialProps: { enabled: true } },
            );
            await waitFor(() =>
                expect(store().storedTimelines).toEqual([
                    membership(1, 1, 9, [1, 2]),
                ]),
            );
            // The selection resolves to the stored timeline with exactly its range
            act(() => {
                store().selectRange(1, 9);
            });
            expect(selectedStoredTimeline(store())?.id).toBe(1);

            await transactionWithHistory(db, "emptyTimeline", (tx) =>
                tx.insert(schema.timelines).values({
                    id: 2,
                    name: null,
                    start_beat: 9,
                    end_beat: 17,
                }),
            );
            await waitFor(() =>
                expect(store().storedTimelines).toHaveLength(2),
            );
            await performUndo(db);
            await waitFor(() =>
                expect(store().storedTimelines).toHaveLength(1),
            );

            rerender({ enabled: false });
            await waitFor(() => expect(store().storedTimelines).toBeNull());
        } finally {
            stopTimelineResolver();
        }
    });

    it("keeps every selected marcher on a stored timeline: UI-10 dims nobody", async ({
        wrapper,
    }) => {
        store().setStoredTimelines([membership(1, 1, 9, [1, 2])]);
        const { result } = renderHook(
            () => {
                useDeselectDimmedMarchers(true);
                return useSelectedMarchers()!;
            },
            { wrapper },
        );
        act(() => {
            result.current.setSelectedMarchers([1, 2, 3].map(marcher));
        });
        act(() => {
            store().selectRange(1, 9);
        });
        // Marcher 3 isn't in the timeline, but dragging it is what adds it, so it stays
        expect(result.current.selectedMarchers.map((m) => m.id)).toEqual([
            1, 2, 3,
        ]);
    });
    it("keeps the marcher selection when a range with no stored timeline is selected", async ({
        wrapper,
    }) => {
        store().setStoredTimelines([membership(1, 1, 9, [1, 2])]);
        const seen: number[][] = [];
        const { result } = renderHook(
            () => {
                useDeselectDimmedMarchers(true);
                const selected = useSelectedMarchers()!;
                seen.push(selected.selectedMarchers.map((m) => m.id));
                return selected;
            },
            { wrapper },
        );
        act(() => {
            result.current.setSelectedMarchers([1, 2, 3].map(marcher));
        });
        seen.length = 0;
        // A dragged range: [3, 12) overlaps the stored [1, 9) but isn't it
        act(() => {
            store().selectRange(3, 12);
        });
        expect(selectedStoredTimeline(store())).toBeNull();
        await waitFor(() => expect(seen.length).toBeGreaterThan(0));
        expect(result.current.selectedMarchers.map((m) => m.id)).toEqual([
            1, 2, 3,
        ]);
        expect(seen.every((ids) => ids.length === 3)).toBe(true);
    });

    it("keeps the marcher selection through a clip move of the selected timeline", async ({
        db,
        wrapper,
    }) => {
        await seedShow(db);
        await startTimelineResolver(db);
        try {
            // Every marcher selection rendered once both marchers are selected
            const seen: number[][] = [];
            let watching = false;
            const { result } = renderHook(
                () => {
                    useTimelineSelectionHost(db, true);
                    useDeselectDimmedMarchers(true);
                    const selected = useSelectedMarchers()!;
                    if (watching)
                        seen.push(selected.selectedMarchers.map((m) => m.id));
                    return selected;
                },
                { wrapper },
            );
            await waitFor(() =>
                expect(store().storedTimelines).toEqual([
                    membership(1, 1, 9, [1, 2]),
                ]),
            );
            act(() => {
                store().selectRange(1, 9);
                result.current.setSelectedMarchers([1, 2].map(marcher));
            });
            watching = true;

            // What the panel does: shift, then move the selection with it
            await shiftTimeline({ db, timelineId: 1, delta: 2 });
            act(() => {
                store().followTimelineShift({ start: 1, end: 9 }, 2);
            });
            await waitFor(() =>
                expect(store().storedTimelines).toEqual([
                    membership(1, 3, 11, [1, 2]),
                ]),
            );
            expect(store().selection).toEqual({
                kind: "range",
                start: 3,
                end: 11,
            });
            expect(result.current.selectedMarchers.map((m) => m.id)).toEqual([
                1, 2,
            ]);
            // Never emptied on the way, not even before the reload
            expect(seen.length).toBeGreaterThan(0);
            expect(seen.every((ids) => ids.length === 2)).toBe(true);
        } finally {
            stopTimelineResolver();
        }
    });
});

describe("dimming on the canvas (UI-10: nobody is dimmed)", () => {
    const setUpCanvas = () => {
        const canvas = new OpenMarchCanvas({
            canvasRef: null,
            fieldProperties:
                FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES,
            uiSettings: defaultSettings,
        });
        const marchers = [1, 2, 3].map(
            (id) =>
                new CanvasMarcher({
                    marcher: marcher(id),
                    coordinate: { x: id * 20, y: 40 },
                }),
        );
        for (const m of marchers) canvas.add(m);
        return { canvas, marchers };
    };
    const states = (marchers: CanvasMarcher[]) =>
        marchers.map((m) => ({
            dimmed: m.timelineDimmed,
            opacity: m.opacity,
            selectable: m.selectable,
            evented: m.evented,
        }));

    it("UI-10: a stored timeline dims nobody, and the lasso selects anyone", () => {
        const { canvas, marchers } = setUpCanvas();
        store().setStoredTimelines([membership(1, 1, 9, [1])]);
        renderHook(() => useTimelineDimming({ canvas, enabled: true }));
        act(() => {
            store().selectRange(1, 9);
        });
        const undimmed = {
            dimmed: false,
            opacity: 1,
            selectable: true,
            evented: true,
        };
        expect(states(marchers)).toEqual([undimmed, undimmed, undimmed]);

        const lasso = new LassoListeners({ canvas });
        lasso.initiateListeners();
        const far = 1e6;
        Object.assign(lasso, {
            startPoint: { x: -far, y: -far },
            currentPath: [
                { x: -far, y: -far },
                { x: far, y: -far },
                { x: far, y: far },
                { x: -far, y: far },
            ],
        });
        (
            lasso as unknown as { closeLassoAndSelect: () => void }
        ).closeLassoAndSelect();
        expect(
            canvas
                .getActiveObjects()
                .map((o) => (o as CanvasMarcher).id)
                .sort(),
        ).toEqual([1, 2, 3]);
    });
});

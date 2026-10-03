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
import DefaultListeners from "@/components/canvas/listeners/DefaultListeners";
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

    it("drops dimmed marchers from the marcher selection, however they were selected", async ({
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
        // Home: nothing is dimmed
        expect(result.current.selectedMarchers.map((m) => m.id)).toEqual([
            1, 2, 3,
        ]);

        act(() => {
            store().selectRange(1, 9);
        });
        await waitFor(() =>
            expect(result.current.selectedMarchers.map((m) => m.id)).toEqual([
                1, 2,
            ]),
        );
        // Selecting a dimmed marcher afterwards doesn't stick
        act(() => {
            result.current.setSelectedMarchers([3].map(marcher));
        });
        await waitFor(() =>
            expect(result.current.selectedMarchers).toEqual([]),
        );
        // A range with no stored timeline dims nobody (P8.16): the selection stays
        act(() => {
            result.current.setSelectedMarchers([1].map(marcher));
        });
        act(() => {
            store().selectRange(9, 17);
        });
        expect(result.current.selectedMarchers.map((m) => m.id)).toEqual([1]);
        // ...and any marcher can be selected there, for Add selected marchers
        act(() => {
            result.current.setSelectedMarchers([1, 3].map(marcher));
        });
        expect(result.current.selectedMarchers.map((m) => m.id)).toEqual([
            1, 3,
        ]);
        // Once that range is stored, non-members are dimmed and deselected
        act(() => {
            store().setStoredTimelines([
                membership(1, 1, 9, [1, 2]),
                membership(2, 9, 17, [3]),
            ]);
        });
        await waitFor(() =>
            expect(result.current.selectedMarchers.map((m) => m.id)).toEqual([
                3,
            ]),
        );
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

describe("dimming on the canvas (UI-9 Selection)", () => {
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

    it("keeps dimmed marchers out of the select tool's Shift-drag lasso", () => {
        const { canvas, marchers } = setUpCanvas();
        store().setStoredTimelines([membership(1, 1, 9, [1])]);
        renderHook(() => useTimelineDimming({ canvas, enabled: true }));
        act(() => {
            store().selectRange(1, 9);
        });
        const listeners = new DefaultListeners({ canvas });
        const lasso = listeners as unknown as {
            startLassoSelection: (event: unknown) => void;
            closeLassoAndSelect: () => void;
            resetLassoState: () => void;
        };
        lasso.startLassoSelection({
            e: new MouseEvent("mousedown", { clientX: 0, clientY: 0 }),
        });
        const far = 1e6;
        Object.assign(listeners, {
            lassoStartPoint: { x: -far, y: -far },
            lassoCurrentPath: [
                { x: -far, y: -far },
                { x: far, y: -far },
                { x: far, y: far },
                { x: -far, y: far },
            ],
        });
        lasso.closeLassoAndSelect();
        expect(
            canvas.getActiveObjects().map((o) => (o as CanvasMarcher).id),
        ).toEqual([1]);
        const hooked = (m: CanvasMarcher) => [m.selectable, m.evented];
        expect(marchers.map(hooked)).toEqual([
            [true, true],
            [false, false],
            [false, false],
        ]);
        lasso.resetLassoState();
        expect(marchers.map(hooked)).toEqual([
            [true, true],
            [false, false],
            [false, false],
        ]);
    });

    it("keeps dimmed marchers unselectable through the line and lasso tools", () => {
        const { canvas, marchers } = setUpCanvas();
        store().setStoredTimelines([membership(1, 1, 9, [1])]);
        renderHook(() => useTimelineDimming({ canvas, enabled: true }));
        act(() => {
            store().selectRange(1, 9);
        });
        const hooked = (m: CanvasMarcher) => [m.selectable, m.evented];

        // The line tool (LineListeners) makes everyone selectable again when a line is finished
        for (const m of marchers) m.makeSelectable();
        expect(hooked(marchers[0]!)).toEqual([true, true]);
        expect(hooked(marchers[1]!)).toEqual([false, false]);

        // The lasso tool turns everything off, selects what it encloses, and turns things back on
        // when put away. A lasso around everyone selects only the undimmed marcher.
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
            canvas.getActiveObjects().map((o) => (o as CanvasMarcher).id),
        ).toEqual([1]);
        lasso.cleanupListeners();
        expect(hooked(marchers[0]!)).toEqual([true, true]);
        expect(hooked(marchers[1]!)).toEqual([false, false]);
        expect(hooked(marchers[2]!)).toEqual([false, false]);
        expect(marchers[1]!.timelineDimmed).toBe(true);

        // Going home restores them
        act(() => {
            store().selectHome();
        });
        expect(hooked(marchers[1]!)).toEqual([true, true]);
    });

    it("dims and unhooks marchers outside the selected timeline, and restores them", () => {
        const { canvas, marchers } = setUpCanvas();
        store().setStoredTimelines([membership(1, 1, 9, [1])]);
        const { rerender } = renderHook(
            ({ enabled }: { enabled: boolean }) =>
                useTimelineDimming({ canvas, enabled }),
            { initialProps: { enabled: true } },
        );
        // Home: nothing is dimmed
        expect(marchers.map((m) => m.timelineDimmed)).toEqual([
            false,
            false,
            false,
        ]);

        act(() => {
            store().selectRange(1, 9);
        });
        const dimmed = {
            dimmed: true,
            opacity: CanvasMarcher.DIMMED_OPACITY,
            selectable: false,
            evented: false,
        };
        expect(states(marchers)).toEqual([
            { dimmed: false, opacity: 1, selectable: true, evented: true },
            dimmed,
            dimmed,
        ]);
        expect(marchers[1]!.textLabel.opacity).toBe(
            CanvasMarcher.DIMMED_OPACITY,
        );

        // Page mode (the flag off) draws everyone alike
        rerender({ enabled: false });
        expect(marchers.map((m) => m.timelineDimmed)).toEqual([
            false,
            false,
            false,
        ]);
        expect(states(marchers)[1]).toEqual({
            dimmed: false,
            opacity: 1,
            selectable: true,
            evented: true,
        });
    });

    it("dims nobody on a range with no stored timeline, and the lasso selects anyone there", () => {
        const { canvas, marchers } = setUpCanvas();
        store().setStoredTimelines([membership(1, 1, 9, [1])]);
        renderHook(() => useTimelineDimming({ canvas, enabled: true }));
        act(() => {
            store().selectRange(1, 9);
        });
        expect(marchers.map((m) => m.timelineDimmed)).toEqual([
            false,
            true,
            true,
        ]);
        // A new page's box (or a dragged range) has no stored timeline yet
        act(() => {
            store().selectRange(9, 17);
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
        lasso.cleanupListeners();

        // Storing it (Add selected marchers adds marcher 3) dims the others
        act(() => {
            store().setStoredTimelines([
                membership(1, 1, 9, [1]),
                membership(2, 9, 17, [3]),
            ]);
        });
        expect(marchers.map((m) => m.timelineDimmed)).toEqual([
            true,
            true,
            false,
        ]);
    });
});

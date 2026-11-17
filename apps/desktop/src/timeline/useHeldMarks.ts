import { useEffect, useMemo } from "react";
import { create } from "zustand";
import type { DbConnection } from "@/db-functions/types";
import { useTimelineDisplayStore } from "@/db-functions/timelineDisplay";
import { readHeldMarks, type HeldMark } from "@/db-functions/timelineHeldMarks";
import { useIsBasicMode } from "@/stores/EditorModeStore";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { usePlacedBoxStore } from "@/shapes/placed/placedBoxStore";
import {
    marcherHolds,
    NO_HOLDS,
    selectionHolds,
    type SelectionHolds,
} from "./timelineHoldBars";
import { useDraggedHoldMarks } from "./holdEdgeDragStore";
import { carriedStretches } from "./timelineCarried";
import {
    editingPositionAt,
    useIsolationPlanStore,
} from "./timelineIsolationPlan";
import { useHoldLightStore } from "./holdLight";
import { useFieldEditing } from "./useFieldEditing";
import { resolverSpans, useTimelineResolverStore } from "./timelineStore";

/**
 * The stored Held marks (`timeline_held_marks`) as the renderer sees them, for the timeline's Held
 * bars. Read by `useHeldMarksHost` after every committed edit, undo or redo that may have changed
 * them: the marks aren't in the change log, so it follows the resolver's version (an edit that
 * also wrote rows) and the display version (an edit that wrote only marks).
 */
export const useHeldMarksStore = create<{
    marks: readonly HeldMark[];
    /**
     * The resolver version (`useTimelineResolverStore`) the marks were read for, or `null` before
     * the first read. Behind the resolver's version, the marks may be older than the rows: the
     * field's look waits for them rather than drawing a Held marcher Not defined for a frame.
     */
    version: number | null;
}>(() => ({
    marks: [],
    version: null,
}));

let reads = 0;

/**
 * Reads the Held marks again into `useHeldMarksStore`; a late older read is dropped.
 *
 * @param version the resolver version the read is for; a failed read still records it, so
 *   nothing waits on marks that won't come
 */
export async function refreshHeldMarks(
    database: DbConnection,
    version: number | null = useTimelineResolverStore.getState().version,
): Promise<void> {
    const read = ++reads;
    try {
        const marks = await readHeldMarks(database);
        if (read === reads) useHeldMarksStore.setState({ marks, version });
    } catch (error) {
        console.error("Couldn't read the Held marks", error);
        if (read === reads) useHeldMarksStore.setState({ version });
    }
}

/**
 * Keeps `useHeldMarksStore` current while `enabled` (timeline mode): one read per resolver or
 * display version. Mounted once, by `TimelineResolverHost`.
 */
export function useHeldMarksHost(
    database: DbConnection,
    enabled: boolean,
): void {
    const version = useTimelineResolverStore((s) => s.version);
    const display = useTimelineDisplayStore((s) => s.version);
    useEffect(() => {
        if (!enabled) {
            reads++;
            useHeldMarksStore.setState({ marks: [], version: null });
            return;
        }
        void refreshHeldMarks(database, version);
    }, [database, enabled, version, display]);
}

/**
 * The selection's hold bars and departure ticks (`selectionHolds`; fork #472, #477), worked out
 * once per selection, resolver version, set of marks and shapes, and when a field drag starts or
 * ends or a follow-back entry is hovered: never per scrubbed beat.
 *
 * During a field drag that moves, scales or rotates the selection, the bars the edit changes
 * light up: it edits the window's end (the playhead), or the starting spots on the home page. An
 * Expert drag has a window, and one that starts inside a hold ends that hold (`dragLitRanges`).
 *
 * @param marcherIds the selected marchers; keep the array stable while the selection is
 */
export function useSelectionHolds(
    marcherIds: readonly number[],
): SelectionHolds {
    const marks = useHeldMarksStore((s) => s.marks);
    const resolver = useTimelineResolverStore((s) => s.resolver);
    const version = useTimelineResolverStore((s) => s.version);
    const showEnd = useTimelineSelectionStore((s) =>
        s.pageBoxes.reduce((end, box) => Math.max(end, box.end), 0),
    );
    const recipes = usePlacedBoxStore((s) => s.recipes);
    const ends = usePlacedBoxStore((s) => s.ends);
    const editing = useFieldEditing();
    const dragBeat = useTimelineSelectionStore((s) =>
        !editing
            ? null
            : s.selection.kind === "home"
              ? 0
              : s.selection.kind === "range"
                ? s.selection.end
                : null,
    );
    const basic = useIsBasicMode();
    // The write's rule (`planCanvasEdit`): Basic edits a point, Expert the window
    const dragWindowStart = useTimelineSelectionStore((s) =>
        editing && !basic && !s.isolation && s.selection.kind === "range"
            ? s.selection.start
            : null,
    );
    const hoverLight = useHoldLightStore((s) => s.light);
    // #475: a hold edge being dragged draws its holds where it would land, lit
    const { shownMarks, light } = useDraggedHoldMarks(marks, hoverLight);
    const isolation = useIsolationPlanStore((s) => s.current);
    // Where a shape carries the selected marchers: the field's rule (`carriedStretches`), worked
    // out apart from the lit ranges, so starting a drag or hovering an entry doesn't redo it
    const carried = useMemo(() => {
        void version; // a new version means new spans
        if (!resolver || marcherIds.length === 0 || recipes.length === 0)
            return null;
        const spansOf = (id: number) => resolverSpans(resolver, id);
        return carriedStretches({
            marcherIds,
            within: marcherIds.flatMap((id) =>
                marcherHolds(spansOf(id), showEnd),
            ),
            recipes,
            endBeatOf: (id) => (id === null ? 0 : ends.get(id)),
            spansOf,
            positionAt: (id, beat) => {
                try {
                    const [x, y] = editingPositionAt(
                        resolver,
                        id,
                        beat,
                        isolation,
                    );
                    return { x, y };
                } catch {
                    return undefined;
                }
            },
        });
    }, [resolver, version, marcherIds, recipes, ends, showEnd, isolation]);
    return useMemo(() => {
        void version; // a new version means new spans
        if (!resolver || marcherIds.length === 0) return NO_HOLDS;
        return selectionHolds({
            marcherIds,
            spansOf: (id) => resolverSpans(resolver, id),
            marks: shownMarks,
            showEnd,
            carriedOf: carried ? (id) => carried.get(id) : undefined,
            dragBeat,
            dragWindowStart,
            light,
        });
    }, [
        resolver,
        version,
        marcherIds,
        shownMarks,
        showEnd,
        carried,
        dragBeat,
        dragWindowStart,
        light,
    ]);
}

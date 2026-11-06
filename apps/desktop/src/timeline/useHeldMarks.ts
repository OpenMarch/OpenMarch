import { useEffect, useMemo } from "react";
import { create } from "zustand";
import type { DbConnection } from "@/db-functions/types";
import { useTimelineDisplayStore } from "@/db-functions/timelineDisplay";
import { readHeldMarks, type HeldMark } from "@/db-functions/timelineHeldMarks";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { usePlacedBoxStore } from "@/shapes/placed/placedBoxStore";
import { isUngrouped } from "@/shapes/placed/placedBox";
import {
    marcherShapeChanges,
    NO_HOLDS,
    selectionHolds,
    type SelectionHolds,
} from "./timelineHoldBars";
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
 * During a field drag that moves, scales or rotates the selection, the bars the edit carries into
 * light up: it edits the window's end (the playhead), or the starting spots on the home page.
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
    const light = useHoldLightStore((s) => s.light);
    const shapeRecipes = useMemo(
        () =>
            recipes.map((r) => ({
                timelineId: r.timelineId,
                ungrouped: isUngrouped(r),
                memberIds: r.members.map((m) => m.marcherId),
            })),
        [recipes],
    );
    return useMemo(() => {
        void version; // a new version means new spans
        if (!resolver || marcherIds.length === 0) return NO_HOLDS;
        const endBeatOf = (id: number | null) =>
            id === null ? 0 : ends.get(id);
        return selectionHolds({
            marcherIds,
            spansOf: (id) => resolverSpans(resolver, id),
            marks,
            showEnd,
            shapeChangesOf:
                shapeRecipes.length === 0
                    ? undefined
                    : (id) => marcherShapeChanges(shapeRecipes, endBeatOf, id),
            dragBeat,
            light,
        });
    }, [
        resolver,
        version,
        marcherIds,
        marks,
        showEnd,
        shapeRecipes,
        ends,
        dragBeat,
        light,
    ]);
}

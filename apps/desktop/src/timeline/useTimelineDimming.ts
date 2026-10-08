import { useEffect, useRef } from "react";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import {
    isMarcherDimmed,
    type TimelineSelectionState,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";

/**
 * Timeline mode (docs/timeline/ui.md UI-9 Selection; P8.11, P8.16): marchers that
 * `isMarcherDimmed` names (under UI-10, those outside an isolated timeline) are dimmed and can't
 * be selected or hit, so clicks and box selection pass over them.
 *
 * @param redrawKey anything whose change means the canvas marchers were re-created
 */
export function useTimelineDimming({
    canvas,
    enabled,
    redrawKey,
}: {
    canvas: OpenMarchCanvas | null;
    enabled: boolean;
    redrawKey?: unknown;
}): void {
    // Only isolation dims (`isMarcherDimmed`), so outside it the window's moves (every scrub beat,
    // page change and Stop) don't need to visit the marchers or redraw the field
    const selection = useTimelineSelectionStore(selectionWhileIsolated);
    const storedTimelines = useTimelineSelectionStore((s) => s.storedTimelines);
    const isolation = useTimelineSelectionStore((s) => s.isolation);
    /** Whether the last pass may have left a marcher dimmed */
    const mayBeDimmed = useRef(false);
    useEffect(() => {
        if (!canvas) return;
        const dims = enabled && isolation !== null;
        if (!dims && !mayBeDimmed.current) return;
        mayBeDimmed.current = dims;
        const state = {
            selection:
                selection ?? useTimelineSelectionStore.getState().selection,
            storedTimelines,
            isolation,
        };
        for (const marcher of canvas.getCanvasMarchers())
            marcher.setTimelineDimmed(
                enabled && isMarcherDimmed(state, marcher.marcherObj.id),
            );
        canvas.requestRenderAll();
    }, [canvas, enabled, selection, storedTimelines, isolation, redrawKey]);
}

/** The window while isolated, else `null`, so moving the window outside isolation isn't a change */
const selectionWhileIsolated = (s: TimelineSelectionState) =>
    s.isolation === null ? null : s.selection;

/**
 * Keeps dimmed marchers out of the marcher selection (UI-9: selecting a stored timeline deselects
 * any selected marcher that isn't in it, so a selection never mixes dimmed and undimmed marchers).
 * A range with no stored timeline dims nobody, so it keeps the marcher selection.
 * Covers every way of selecting, such as the sidebar and select all, not only the canvas.
 */
export function useDeselectDimmedMarchers(enabled: boolean): void {
    const selectedMarchersContext = useSelectedMarchers();
    const selectedMarchers = selectedMarchersContext?.selectedMarchers;
    const setSelectedMarchers = selectedMarchersContext?.setSelectedMarchers;
    const selection = useTimelineSelectionStore(selectionWhileIsolated);
    const storedTimelines = useTimelineSelectionStore((s) => s.storedTimelines);
    const isolation = useTimelineSelectionStore((s) => s.isolation);
    useEffect(() => {
        // Nothing is dimmed outside isolation
        if (
            !enabled ||
            isolation === null ||
            selection === null ||
            !selectedMarchers ||
            !setSelectedMarchers
        )
            return;
        const state = { selection, storedTimelines, isolation };
        const kept = selectedMarchers.filter(
            (m) => !isMarcherDimmed(state, m.id),
        );
        if (kept.length !== selectedMarchers.length) setSelectedMarchers(kept);
    }, [
        enabled,
        selection,
        storedTimelines,
        isolation,
        selectedMarchers,
        setSelectedMarchers,
    ]);
}

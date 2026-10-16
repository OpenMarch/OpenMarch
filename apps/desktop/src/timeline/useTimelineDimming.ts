import { useEffect } from "react";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import {
    isMarcherDimmed,
    type TimelineSelectionState,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";

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

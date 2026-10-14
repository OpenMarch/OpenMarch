import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { fieldPropertiesQueryOptions } from "@/hooks/queries";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";
import {
    planCanvasEdit,
    timelineCoordinateRecords,
} from "@/timeline/timelineCoordinateWrites";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";

/**
 * Shared editor state that most editor action handlers depend on.
 * `ready` replaces the legacy guard in the removed registered-actions handler
 * (selected page and field properties loaded).
 */
export function useEditorReadiness() {
    const selectedPageContext = useSelectedPage();
    const selectedPage = selectedPageContext?.selectedPage ?? null;
    const databaseReady = useDatabaseReady();
    const { data: fieldProperties } = useQuery(
        fieldPropertiesQueryOptions(databaseReady),
    );
    const selectedMarchersContext = useSelectedMarchers();
    const selectedMarchers = selectedMarchersContext?.selectedMarchers ?? [];

    /**
     * The selected marchers' positions where the selection edits (UI-9 Editing, P8.15): the
     * resolver's positions at the selected timeline's end, or homes at beat 0, for every selected
     * marcher. A refused selection gives nothing here; the write (`useUpdateCoordinates` or
     * `useUpdateSelectedMarchers`) says why, once.
     */
    const getSelectedMarcherPages = useCallback(() => {
        if (selectedMarchers.length === 0) return [];
        const plan = planCanvasEdit();
        if (!plan.ok) return [];
        try {
            return timelineCoordinateRecords(
                plan.beat,
                selectedMarchers.map((marcher) => marcher.id),
            );
        } catch (e) {
            toastTimelineError(e);
            return [];
        }
    }, [selectedMarchers]);

    const ready = !!selectedPage && !!fieldProperties;

    return {
        selectedPage,
        fieldProperties,
        ready,
        getSelectedMarcherPages,
        selectedMarchers,
    };
}

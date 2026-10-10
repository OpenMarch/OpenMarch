import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    fieldPropertiesQueryOptions,
    marcherPagesByPageQueryOptions,
} from "@/hooks/queries";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";
import { useTimelineMode } from "@/hooks/queries/useWorkspaceSettings";
import {
    planCanvasEdit,
    timelineCoordinateRecords,
} from "@/timeline/timelineCoordinateWrites";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";

/**
 * Shared editor state that most editor action handlers depend on.
 * `ready` replaces the legacy guard in the removed registered-actions handler
 * (selected page, field properties and marcher pages all loaded).
 */
export function useEditorReadiness() {
    const selectedPageContext = useSelectedPage();
    const selectedPage = selectedPageContext?.selectedPage ?? null;
    const { data: marcherPages, isSuccess: marcherPagesLoaded } = useQuery(
        marcherPagesByPageQueryOptions(selectedPage?.id),
    );
    const databaseReady = useDatabaseReady();
    const { data: fieldProperties } = useQuery(
        fieldPropertiesQueryOptions(databaseReady),
    );
    const selectedMarchersContext = useSelectedMarchers();
    const selectedMarchers = selectedMarchersContext?.selectedMarchers ?? [];
    const timelineMode = useTimelineMode();

    /**
     * Get the MarcherPages for the selected marchers on the selected page.
     */
    const getSelectedMarcherPages = useCallback(() => {
        if (timelineMode) {
            // Timeline mode (UI-9 Editing, P8.15): the tools start from the resolver's positions
            // where the selection edits (the selected timeline's end, or homes at beat 0), for
            // every selected marcher. marcher_pages isn't read: its rows can be stale or missing.
            // A refused selection gives nothing here; the write (`useUpdateCoordinates` or
            // `useUpdateSelectedMarchers`) says why, once.
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
        }
        if (!selectedPage) {
            console.error("No selected page");
            return [];
        }
        if (!marcherPagesLoaded) {
            console.error("Marcher pages not loaded");
            return [];
        }

        const output = selectedMarchers.map(
            (marcher) => marcherPages[marcher.id],
        );
        return output;
    }, [
        marcherPages,
        marcherPagesLoaded,
        selectedMarchers,
        selectedPage,
        timelineMode,
    ]);

    const ready = !!selectedPage && !!fieldProperties && marcherPagesLoaded;

    return {
        selectedPage,
        fieldProperties,
        marcherPages,
        marcherPagesLoaded,
        ready,
        getSelectedMarcherPages,
        selectedMarchers,
        timelineMode,
    };
}

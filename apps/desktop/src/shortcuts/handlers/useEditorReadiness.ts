import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    fieldPropertiesQueryOptions,
    marcherPagesByPageQueryOptions,
} from "@/hooks/queries";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";

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

    /**
     * Get the MarcherPages for the selected marchers on the selected page.
     */
    const getSelectedMarcherPages = useCallback(() => {
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
    }, [marcherPages, marcherPagesLoaded, selectedMarchers, selectedPage]);

    const ready = !!selectedPage && !!fieldProperties && marcherPagesLoaded;

    return {
        selectedPage,
        fieldProperties,
        marcherPages,
        marcherPagesLoaded,
        ready,
        getSelectedMarcherPages,
        selectedMarchers,
    };
}

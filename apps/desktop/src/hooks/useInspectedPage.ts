import { useMemo } from "react";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import type Page from "@/global/classes/Page";

/**
 * Returns the page that the inspector should display.
 *
 * While the show is playing, `selectedPage` is the page the marchers are
 * leaving from, so the inspector should show the page they are heading to.
 * When stopped (or if the next page cannot be found), the selected page is
 * returned unchanged.
 */
export function useInspectedPage(): Page | null {
    const { selectedPage } = useSelectedPage()!;
    const { isPlaying } = useIsPlaying()!;
    const { pages } = useTimingObjects()!;

    return useMemo(() => {
        if (!isPlaying || !selectedPage?.nextPageId) return selectedPage;
        return (
            pages.find((p) => p.id === selectedPage.nextPageId) ?? selectedPage
        );
    }, [isPlaying, selectedPage, pages]);
}

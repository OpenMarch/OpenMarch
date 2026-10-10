import type { TimelineNavigation } from "@/components/timeline/TimelineViewModel";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import Page, { getNextPage, getPreviousPage } from "@/global/classes/Page";
import { useTimingObjects } from "@/hooks";
import { useMetronomeStore } from "@/stores/MetronomeStore";
import {
    navigateTimelinePages,
    playTimelinePage,
    toggleTimelineLoop,
    toggleTimelinePlayback,
} from "@/timeline/timelineTransport";
import { useActionHandler } from "../useActionHandler";
import { useEditorReadiness } from "./useEditorReadiness";

// eslint-disable-next-line max-lines-per-function
export function useNavigationActionHandlers() {
    const { selectedPage, ready, timelineMode } = useEditorReadiness();
    const setSelectedPage =
        useSelectedPage()?.setSelectedPage ?? (() => undefined);
    const { pages, beats } = useTimingObjects()!;
    const isPlayingContext = useIsPlaying();
    const isPlaying = isPlayingContext?.isPlaying ?? false;
    const setIsPlaying = isPlayingContext?.setIsPlaying ?? (() => {});
    const toggleMetronome = useMetronomeStore()?.toggleMetronome ?? (() => {});
    const canNavigate = ready && !!pages && pages.length > 0;

    const go = (target: Page | null | undefined) => {
        if (target && !isPlaying) setSelectedPage(target);
    };
    /** UI-9: in timeline mode, navigation moves the playhead to a flag and selects that page */
    const navigate = (
        timelineTarget: TimelineNavigation,
        pageTarget: () => Page | null | undefined,
    ) => {
        if (!timelineMode) return go(pageTarget());
        if (!isPlaying) navigateTimelinePages(pages, timelineTarget);
    };

    const goNext = () =>
        navigate("next-page", () => getNextPage(selectedPage!, pages));
    const goPrevious = () =>
        navigate("previous-page", () => getPreviousPage(selectedPage!, pages));
    const enabled = { enabled: canNavigate };
    const transport = () => ({
        isPlaying,
        showEndBeat: beats.length,
        setIsPlaying,
    });

    useActionHandler("nextPage", goNext, enabled);
    useActionHandler("timelineNextPage", goNext, enabled);
    useActionHandler("previousPage", goPrevious, enabled);
    useActionHandler("timelinePreviousPage", goPrevious, enabled);
    useActionHandler(
        "firstPage",
        () => navigate("first-page", () => pages[0]),
        enabled,
    );
    useActionHandler(
        "lastPage",
        () => navigate("last-page", () => pages[pages.length - 1]),
        enabled,
    );
    useActionHandler(
        "playPause",
        () => {
            // UI-17 Play: loops a pinned window, or plays on; playing, it stops
            if (timelineMode) return toggleTimelinePlayback(transport());
            if (getNextPage(selectedPage!, pages)) setIsPlaying(!isPlaying);
        },
        enabled,
    );
    // UI-17: Shift+Space plays the page's move once, back to its set
    useActionHandler("playPage", () => playTimelinePage(transport()), {
        enabled: canNavigate && timelineMode,
    });
    // UI-17: C turns looping on over the page being edited, or off
    useActionHandler("toggleLoop", () => toggleTimelineLoop(), {
        enabled: ready && timelineMode,
    });
    useActionHandler("toggleMetronome", () => toggleMetronome());
}

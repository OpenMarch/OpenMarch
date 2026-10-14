import type { TimelineNavigation } from "@/components/timeline/TimelineViewModel";
import { useIsPlaying } from "@/context/IsPlayingContext";
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
    const { ready } = useEditorReadiness();
    const { pages, beats } = useTimingObjects()!;
    const isPlayingContext = useIsPlaying();
    const isPlaying = isPlayingContext?.isPlaying ?? false;
    const setIsPlaying = isPlayingContext?.setIsPlaying ?? (() => {});
    const toggleMetronome = useMetronomeStore()?.toggleMetronome ?? (() => {});
    const canNavigate = ready && !!pages && pages.length > 0;

    /** UI-9: navigation moves the playhead to a flag and selects that page */
    const navigate = (target: TimelineNavigation) => {
        if (!isPlaying) navigateTimelinePages(pages, target);
    };

    const goNext = () => navigate("next-page");
    const goPrevious = () => navigate("previous-page");
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
    useActionHandler("firstPage", () => navigate("first-page"), enabled);
    useActionHandler("lastPage", () => navigate("last-page"), enabled);
    useActionHandler(
        "playPause",
        // UI-17 Play: loops a pinned window, or plays on; playing, it stops
        () => toggleTimelinePlayback(transport()),
        enabled,
    );
    // UI-17: Shift+Space plays the page's move once, back to its set
    useActionHandler("playPage", () => playTimelinePage(transport()), {
        enabled: canNavigate,
    });
    // UI-17: C turns looping on over the page being edited, or off
    useActionHandler("toggleLoop", () => toggleTimelineLoop(), {
        enabled: ready,
    });
    useActionHandler("toggleMetronome", () => toggleMetronome());
}

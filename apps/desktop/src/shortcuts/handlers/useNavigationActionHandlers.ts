import type { TimelineNavigation } from "@/components/timeline/TimelineViewModel";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useTimingObjects } from "@/hooks";
import { useMetronomeStore } from "@/stores/MetronomeStore";
import {
    navigateTimeline,
    playTimelinePage,
    toggleTimelineLoop,
    toggleTimelinePlayback,
} from "@/timeline/timelineTransport";
import { useActionHandler } from "../useActionHandler";
import { useIsBasicMode } from "@/stores/EditorModeStore";
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

    /**
     * UI-9: navigation moves the playhead to a flag and selects that page, or a beat on with Shift.
     * Playing, it jumps playback there, as the transport's Previous and Next do.
     */
    const navigate = (target: TimelineNavigation) =>
        navigateTimeline(beats, pages, isPlaying, target);

    const goNext = () => navigate("next-page");
    const goPrevious = () => navigate("previous-page");
    // Playing, each jump restarts the audio, so a held key jumps once rather than stuttering
    const enabled = { enabled: canNavigate, ignoreRepeat: isPlaying };
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
    useActionHandler("previousBeat", () => navigate("previous-beat"), enabled);
    useActionHandler("nextBeat", () => navigate("next-beat"), enabled);
    useActionHandler(
        "playPause",
        // UI-17 Play: loops the loop, or plays on from the start flag; playing, it stops
        () => toggleTimelinePlayback(transport()),
        enabled,
    );
    // Shift+Space plays on from the playhead (or the loop once)
    useActionHandler("playPage", () => playTimelinePage(transport()), {
        enabled: canNavigate,
    });
    // UI-17: C turns looping on over the page being edited, or off. Not in Basic (UI-19)
    const basic = useIsBasicMode();
    useActionHandler("toggleLoop", () => toggleTimelineLoop(), {
        enabled: ready && !basic,
    });
    useActionHandler("toggleMetronome", () => toggleMetronome());
}

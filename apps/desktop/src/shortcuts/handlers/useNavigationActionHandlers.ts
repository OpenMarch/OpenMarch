import type { TimelineNavigation } from "@/components/timeline/TimelineViewModel";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useTimingObjects } from "@/hooks";
import { useMetronomeStore } from "@/stores/MetronomeStore";
import { usePlaybackSpeedStore } from "@/stores/PlaybackSpeedStore";
import {
    navigateTimeline,
    playTimelineOn,
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
    const { pages, countGrid } = useTimingObjects()!;
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
        navigateTimeline(countGrid, pages, isPlaying, target);

    const goNext = () => navigate("next-page");
    const goPrevious = () => navigate("previous-page");
    // Playing, each jump restarts the audio, so a held key jumps once rather than stuttering
    const enabled = { enabled: canNavigate, ignoreRepeat: isPlaying };
    const transport = () => ({ isPlaying, setIsPlaying });

    useActionHandler("nextPage", goNext, enabled);
    useActionHandler("previousPage", goPrevious, enabled);
    useActionHandler("firstPage", () => navigate("first-page"), enabled);
    useActionHandler("lastPage", () => navigate("last-page"), enabled);
    useActionHandler("previousBeat", () => navigate("previous-beat"), enabled);
    useActionHandler("nextBeat", () => navigate("next-beat"), enabled);
    useActionHandler(
        "playPause",
        // UI-17 Play: loops the loop, else plays the window once (Expert, UI-26) or on from the
        // start flag (Basic); playing, it stops
        () => toggleTimelinePlayback(transport()),
        enabled,
    );
    // Shift+Space plays on from the playhead (or the loop once)
    useActionHandler("playPage", () => playTimelinePage(transport()), {
        enabled: canNavigate,
    });
    const basic = useIsBasicMode();
    // UI-26: Alt+Space plays on from the start flag, past the playhead. Expert only: Basic's Space
    // already plays on
    useActionHandler("playOn", () => playTimelineOn(transport()), {
        enabled: canNavigate && !basic,
    });
    // UI-17: C turns looping on over the page being edited, or off. Not in Basic (UI-19)
    useActionHandler("toggleLoop", () => toggleTimelineLoop(), {
        enabled: ready && !basic,
    });
    useActionHandler("toggleMetronome", () => toggleMetronome());
    // Playback speed: ] and [ last while held
    const speed = usePlaybackSpeedStore.getState;
    useActionHandler("holdFasterPlayback", () => speed().pressHold("faster"), {
        onRelease: () => speed().releaseHold("faster"),
    });
    useActionHandler("holdSlowerPlayback", () => speed().pressHold("slower"), {
        onRelease: () => speed().releaseHold("slower"),
    });
    useActionHandler("nextPlaybackSpeed", () => speed().stepSpeed());
    useActionHandler("previousPlaybackSpeed", () => speed().stepSpeed(true));
    useActionHandler("resetPlaybackSpeed", () => speed().setSpeed(1));
}

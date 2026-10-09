import { useEffect, useRef } from "react";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import {
    getLivePlaybackPosition,
    playbackStartInfoRef,
    restartLivePlaybackAt,
} from "@/components/timeline/audio/AudioPlayer";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { beatAtTime, timeAtBeat } from "./timeMap";
import { playbackStep } from "./timelinePlayhead";
import { consumeSuspendRequest } from "./timelineTransport";

/**
 * Timeline mode's playback rules while playing (docs/timeline/ui.md UI-9 Play, UI-11; P8.11), once
 * per animation frame, independent of the canvas. Playing never writes the playhead P; it moves the
 * store's cursor instead (`cue`).
 *
 * - A **preview** (Play with the start flag pinned, UI-17) loops from the start flag to P. However
 *   it stops, the cursor goes back on P, the arrival being edited.
 * - **Playing on** (P) stops at the end of the show; an isolated timeline loops over its range
 *   instead. Pausing it moves P to the last whole beat played (`seek`): an unpinned start flag
 *   follows P, as it does when a scrub ends (UI-12 review), so the window doesn't silently span
 *   pages; a pinned one stays.
 * - A scrub's suspension (`suspendTimelinePlayback`, UI-12 review) pauses without writing P or the
 *   cursor: the scrub moves the cursor, and resumes playback when it ends.
 *
 * Nothing follows playback in page mode (`enabled` false); `useAnimation` keeps its page rules.
 */
export function useTimelinePlaybackDriver(enabled: boolean): void {
    const { beats } = useTimingObjects();
    const isPlayingContext = useIsPlaying();
    const isPlaying = isPlayingContext?.isPlaying ?? false;
    const setIsPlaying = isPlayingContext?.setIsPlaying;
    const lastLiveBeat = useRef<number | null>(null);

    // The furthest the playhead can go
    useEffect(() => {
        const store = useTimelineSelectionStore.getState();
        // Unknown (no clamp) until the beats load
        store.setShowEndBeat(enabled && beats.length > 0 ? beats.length : null);
    }, [enabled, beats.length]);

    // Pausing
    useEffect(() => {
        if (!enabled) return;
        if (isPlaying) {
            lastLiveBeat.current = null;
            // Started outside the transport: it plays on from where the audio starts
            const store = useTimelineSelectionStore.getState();
            if (store.playback === null) store.setPlayback({ kind: "on" });
            return;
        }
        const store = useTimelineSelectionStore.getState();
        const run = store.playback;
        const suspended = consumeSuspendRequest();
        const live = lastLiveBeat.current;
        lastLiveBeat.current = null;
        if (run === null) return;
        store.setPlayback(null);
        if (suspended) return;
        // A preview returns to P however it stopped (UI-17). Paused before the audio started,
        // nothing played, so there is nowhere else to stop
        if (run.kind === "preview" || live === null) {
            store.clearCursor();
            return;
        }
        store.seek(Math.min(Math.floor(live), beats.length));
    }, [enabled, isPlaying, beats.length]);

    useEffect(() => {
        if (!enabled || !isPlaying || !setIsPlaying) return;
        let frame = 0;
        const tick = () => {
            const store = useTimelineSelectionStore.getState();
            // No live position until the audio player has started
            if (playbackStartInfoRef.current && store.playback) {
                const live = beatAtTime(beats, getLivePlaybackPosition());
                lastLiveBeat.current = live;
                const step = playbackStep(
                    store.playback,
                    live,
                    beats.length,
                    store.isolation,
                );
                if (step === "stop") {
                    lastLiveBeat.current = beats.length;
                    setIsPlaying(false);
                    return;
                }
                if (step) {
                    restartLivePlaybackAt(timeAtBeat(beats, step.loopTo));
                    lastLiveBeat.current = step.loopTo;
                    store.cue(step.loopTo);
                }
            }
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [enabled, isPlaying, beats, setIsPlaying]);
}

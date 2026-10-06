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
import { consumeStopRequest, consumeSuspendRequest } from "./timelineTransport";

/**
 * Timeline mode's playback rules while playing (docs/timeline/ui.md UI-9 Play, UI-11; P8.11), once
 * per animation frame, independent of the canvas. Playing never writes the playhead P; it moves the
 * store's cursor instead (`cue`).
 *
 * - A **preview** (Play) runs from just before the start flag to just after P. At its end it loops
 *   when the loop is on or a timeline is isolated, and otherwise ends with the cursor back on P.
 *   Pausing it holds the frame where it paused (the cursor) and leaves P alone.
 * - **Playing on** (P) stops at the end of the show; an isolated timeline loops over its range
 *   instead. Pausing it moves P to the last whole beat played (`seek`): an unpinned start flag
 *   follows P, as it does when a scrub ends (UI-12 review), so the window doesn't silently span
 *   pages; a pinned one stays.
 * - **Stop** (`stopTimelinePlayback`) puts the cursor back on P.
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
    /** The preview reached its end: the pause that follows puts the cursor back on P */
    const previewEnded = useRef(false);

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
            previewEnded.current = false;
            // Started outside the transport: it plays on from where the audio starts
            const store = useTimelineSelectionStore.getState();
            if (store.playback === null) store.setPlayback({ kind: "on" });
            return;
        }
        const store = useTimelineSelectionStore.getState();
        const run = store.playback;
        const stopped = consumeStopRequest();
        const suspended = consumeSuspendRequest();
        const ended = previewEnded.current;
        previewEnded.current = false;
        const live = lastLiveBeat.current;
        lastLiveBeat.current = null;
        if (run === null) return;
        store.setPlayback(null);
        if (suspended) return;
        if (stopped || ended) {
            store.clearCursor();
            return;
        }
        // Paused before the audio started: nothing played, so there is no frame to hold
        if (live === null) {
            store.clearCursor();
            return;
        }
        const beat = Math.min(Math.floor(live), beats.length);
        if (run.kind === "preview") store.cue(beat);
        else store.seek(beat);
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
                    store.loopPreview,
                );
                if (step === "stop") {
                    lastLiveBeat.current = beats.length;
                    setIsPlaying(false);
                    return;
                }
                if (step === "end") {
                    previewEnded.current = true;
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

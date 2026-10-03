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

/**
 * Timeline mode's playback rules while playing (docs/timeline/ui.md UI-9 Play; P8.11), once per
 * animation frame, independent of the canvas:
 *
 * - With a range selected, at its end playback jumps back to its start. The live position moves
 *   at once (`restartLivePlaybackAt`), and the playhead write restarts the audio there, so the
 *   loop doesn't wait on the audio player and loops again however many times it comes round.
 * - Otherwise it plays on, and stops at the end of the show.
 * - Pausing, however it happens, leaves the playhead on the last whole beat played, and keeps
 *   the selection.
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

    // Pausing: leave the playhead where playback was
    useEffect(() => {
        if (!enabled) return;
        if (isPlaying) {
            lastLiveBeat.current = null;
            return;
        }
        if (lastLiveBeat.current === null) return;
        const beat = Math.min(Math.floor(lastLiveBeat.current), beats.length);
        lastLiveBeat.current = null;
        useTimelineSelectionStore.getState().seek(beat);
    }, [enabled, isPlaying, beats.length]);

    useEffect(() => {
        if (!enabled || !isPlaying || !setIsPlaying) return;
        let frame = 0;
        const tick = () => {
            // No live position until the audio player has started
            if (playbackStartInfoRef.current) {
                const live = beatAtTime(beats, getLivePlaybackPosition());
                lastLiveBeat.current = live;
                const store = useTimelineSelectionStore.getState();
                const step = playbackStep(store.selection, live, beats.length);
                if (step === "stop") {
                    lastLiveBeat.current = beats.length;
                    setIsPlaying(false);
                    return;
                }
                if (step) {
                    restartLivePlaybackAt(timeAtBeat(beats, step.loopTo));
                    lastLiveBeat.current = step.loopTo;
                    store.seek(step.loopTo);
                }
            }
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [enabled, isPlaying, beats, setIsPlaying]);
}

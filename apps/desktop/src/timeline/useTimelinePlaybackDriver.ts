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
import {
    consumeEndRequest,
    consumeSuspendRequest,
    stopTimelinePlayback,
} from "./timelineTransport";

/**
 * Timeline mode's playback rules while playing (docs/timeline/ui.md UI-9 Play, UI-11; P8.11), once
 * per animation frame, independent of the canvas. Playing never writes the playhead P; it moves the
 * store's cursor instead (`cue`).
 *
 * - **Stop** (Space, `stopTimelinePlayback`, UI-24) goes back to where Play was pressed: the
 *   cursor clears, and the start flag and P, which playing never moved, are the edit window again.
 *   Reaching the end of the show stops the same way.
 * - **Pause** (Shift+Space, `pauseTimelinePlayback`, UI-24) stays where it is: P moves to the last
 *   whole beat played (`seek`), and an unpinned start flag follows P, as it does when a scrub ends
 *   (UI-12 review), so the window doesn't silently span pages; a pinned one stays. Paused within
 *   its first beat from the start flag, nothing moves.
 * - A pause asked for elsewhere keeps each run's own rule: a **preview** (the loop, UI-17) goes
 *   back to P, and **playing on** pauses where it is.
 * - A scrub's suspension (`suspendTimelinePlayback`, UI-12 review) pauses without writing P or the
 *   cursor: the scrub moves the cursor, and resumes playback when it ends.
 *
 * Nothing follows playback while `enabled` is false.
 */
export function useTimelinePlaybackDriver(enabled: boolean): void {
    const { beats } = useTimingObjects();
    const isPlayingContext = useIsPlaying();
    const isPlaying = isPlayingContext?.isPlaying ?? false;
    const setIsPlaying = isPlayingContext?.setIsPlaying;
    const lastLiveBeat = useRef<number | null>(null);
    // Where playing on started (the cue), so a stop within Play's first beat changes nothing
    const startedAt = useRef<number | null>(null);

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
            startedAt.current = store.cursorBeat ?? store.playheadBeat;
            if (store.playback === null) store.setPlayback({ kind: "on" });
            return;
        }
        const store = useTimelineSelectionStore.getState();
        const run = store.playback;
        const suspended = consumeSuspendRequest();
        const live = lastLiveBeat.current;
        lastLiveBeat.current = null;
        const end = consumeEndRequest();
        if (run === null) return;
        store.setPlayback(null);
        if (suspended) return;
        // Stop goes back (UI-24); so does a preview however it stopped, unless paused (UI-17).
        // Paused before the audio started, nothing played, so there is nowhere else to stop. Nor
        // when Play from the start flag pauses within its first beat: the flag is the page
        // before's end flag, and stopping on it would move the window back a page
        const stopAt =
            live === null ? null : Math.min(Math.floor(live), beats.length);
        if (
            end === "stop" ||
            (run.kind === "preview" && end !== "pause") ||
            stopAt === null ||
            (stopAt === startedAt.current && stopAt === store.startBeat)
        ) {
            store.clearCursor();
            return;
        }
        store.seek(stopAt);
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
                // The end of the show stops, back to where Play was pressed (UI-24)
                if (step === "stop") {
                    lastLiveBeat.current = beats.length;
                    stopTimelinePlayback(setIsPlaying);
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

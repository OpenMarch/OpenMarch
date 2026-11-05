import { useEffect, useRef } from "react";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import {
    getLivePlaybackPosition,
    playbackStartInfoRef,
    restartLivePlaybackAt,
} from "@/components/timeline/audio/AudioPlayer";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { playbackStep } from "./timelinePlayhead";
import {
    consumeEndRequest,
    consumeSuspendRequest,
    stopTimelinePlayback,
} from "./timelineTransport";
import { usePlaybackStopBeat } from "./usePlaybackStopBeat";

/**
 * Timeline mode's playback rules while playing (docs/timeline/ui.md UI-9 Play, UI-11; P8.11), once
 * per animation frame, independent of the canvas. Playing never writes the playhead P; it moves the
 * store's cursor instead (`cue`).
 *
 * - **Stop** (Space, `stopTimelinePlayback`, UI-24) goes back to where Play was pressed: the
 *   cursor clears, and the start flag and P, which playing never moved, are the edit window again.
 *   Playing on stops the same way where it reaches the stop point (docs/timeline/endless-counts.md
 *   rule 6: the latest of the show's end, the music's end and the last move's end); started or
 *   jumped at or past it, it plays on in silence until stopped. Show time and counts convert on
 *   the count grid, so playback goes on past the stored counts.
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
// eslint-disable-next-line max-lines-per-function
export function useTimelinePlaybackDriver(enabled: boolean): void {
    const { beats, countGrid: grid } = useTimingObjects();
    const isPlayingContext = useIsPlaying();
    const isPlaying = isPlayingContext?.isPlaying ?? false;
    const setIsPlaying = isPlayingContext?.setIsPlaying;
    const lastLiveBeat = useRef<number | null>(null);
    // Where playing on started (the cue), so a stop within Play's first beat changes nothing
    const startedAt = useRef<number | null>(null);
    const stopBeat = usePlaybackStopBeat();

    // Where playing on stops
    useEffect(() => {
        const store = useTimelineSelectionStore.getState();
        // Unknown until the beats load
        store.setShowEndBeat(enabled && beats.length > 0 ? stopBeat : null);
    }, [enabled, beats.length, stopBeat]);

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
        const stopAt = live === null ? null : Math.floor(live);
        if (
            end === "stop" ||
            (run.kind === "preview" && end !== "pause") ||
            stopAt === null ||
            (!store.startHidden &&
                stopAt === startedAt.current &&
                stopAt === store.startBeat)
        ) {
            store.clearCursor();
            return;
        }
        store.seek(stopAt);
    }, [enabled, isPlaying]);

    useEffect(() => {
        if (!enabled || !isPlaying || !setIsPlaying) return;
        let frame = 0;
        // Where the last frame was, or where a cue (the start, a jump, a loop) put playback, so
        // playing on stops only where it plays across the stop point, never where it jumped past
        let previous: number | null = null;
        let revision = -1;
        const tick = () => {
            const store = useTimelineSelectionStore.getState();
            if (store.playheadRevision !== revision) {
                revision = store.playheadRevision;
                previous = store.cursorBeat ?? store.playheadBeat;
            }
            // No live position until the audio player has started
            if (playbackStartInfoRef.current && store.playback) {
                const live = grid.beatAtTime(getLivePlaybackPosition());
                lastLiveBeat.current = live;
                const stop = store.showEndBeat ?? Infinity;
                const step = playbackStep(
                    store.playback,
                    live,
                    stop,
                    store.isolation,
                    previous ?? live,
                );
                previous = live;
                // The stop point stops, back to where Play was pressed (UI-24)
                if (step === "stop") {
                    lastLiveBeat.current = stop;
                    stopTimelinePlayback(setIsPlaying);
                    return;
                }
                if (step) {
                    restartLivePlaybackAt(grid.timeAtBeat(step.loopTo));
                    lastLiveBeat.current = step.loopTo;
                    store.cue(step.loopTo);
                }
            }
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [enabled, isPlaying, grid, setIsPlaying]);
}

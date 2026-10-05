import type { TimelineNavigation } from "@/components/timeline/TimelineViewModel";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import {
    canPlay,
    navigationTarget,
    playStartBeat,
    type FlagPage,
} from "./timelinePlayhead";

/**
 * The timeline-mode transport (docs/timeline/ui.md UI-9; P8.11), shared by the timeline's
 * transport buttons and the registered actions (shortcuts, menus). These drive
 * `useTimelineSelectionStore`; page mode keeps its own page-based transport.
 */

/** Set by `stopTimelinePlayback` while playing, so the pause that follows returns to the flag. */
let stopRequested = false;

/**
 * Page navigation (UI-9 Page-relative tools): moves the playhead to the target flag and selects
 * that page's timeline, or home for the first page. Returns false when there is nowhere to go.
 * Callers don't navigate while playing.
 */
export function navigateTimelinePages(
    pages: readonly FlagPage[],
    direction: TimelineNavigation,
): boolean {
    const state = useTimelineSelectionStore.getState();
    const target = navigationTarget(pages, state.playheadBeat, direction);
    if (!target) return false;
    if (target.range) state.selectRange(target.range.start, target.range.end);
    else state.selectHome();
    return true;
}

/**
 * Starts playback (UI-10 Play): from the playhead. Returns false, and doesn't start, when there's nothing to play.
 *
 * @param showEndBeat the end of the show, `beats.length`
 */
export function startTimelinePlayback(
    showEndBeat: number,
    setIsPlaying: (isPlaying: boolean) => void,
): boolean {
    const state = useTimelineSelectionStore.getState();
    if (!canPlay(state.selection, state.playheadBeat, showEndBeat))
        return false;
    // A Stop whose pause never landed (pressed with a stale isPlaying) mustn't turn the next
    // ordinary pause into a return
    stopRequested = false;
    const start = playStartBeat(state.selection, state.playheadBeat);
    if (start !== state.playheadBeat) state.seek(start);
    setIsPlaying(true);
    return true;
}

/**
 * Play/pause from the transport or the shortcut. Pausing leaves the playhead where playback is
 * (`useAnimation` writes it) and keeps the selection.
 */
export function toggleTimelinePlayback({
    isPlaying,
    showEndBeat,
    setIsPlaying,
}: {
    isPlaying: boolean;
    showEndBeat: number;
    setIsPlaying: (isPlaying: boolean) => void;
}): void {
    if (isPlaying) setIsPlaying(false);
    else startTimelinePlayback(showEndBeat, setIsPlaying);
}

/** Whether the pause in progress came from **Stop**; clears the request. */
export function consumeStopRequest(): boolean {
    const requested = stopRequested;
    stopRequested = false;
    return requested;
}

/**
 * **Stop** (UI-10): stops playback and returns the playhead to the start flag. While playing, the
 * playback driver does the return once the pause lands, so its pause handling doesn't overwrite
 * it; while paused, it returns at once.
 */
export function stopTimelinePlayback({
    isPlaying,
    setIsPlaying,
}: {
    isPlaying: boolean;
    setIsPlaying: (isPlaying: boolean) => void;
}): void {
    if (isPlaying) {
        stopRequested = true;
        setIsPlaying(false);
        return;
    }
    useTimelineSelectionStore.getState().returnToStart();
}

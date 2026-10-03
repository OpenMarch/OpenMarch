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
 * Starts playback (UI-9 Play): from the playhead, or from the selected range's start when the
 * playhead is at or past its end. Returns false, and doesn't start, when there's nothing to play.
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

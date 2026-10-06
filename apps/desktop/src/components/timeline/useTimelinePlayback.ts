import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsPlaying } from "@/context/IsPlayingContext";
import type Beat from "@/global/classes/Beat";
import type Page from "@/global/classes/Page";
import {
    displayedBeat,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { beatAtTime, beatIndexAtTime } from "@/timeline/timeMap";
import {
    jumpTimelinePages,
    navigateTimelinePages,
    seekTimeline,
    stopTimelinePlayback,
    toggleTimelinePlayback,
} from "@/timeline/timelineTransport";
import {
    getLivePlaybackPosition,
    playbackStartInfoRef,
} from "./audio/AudioPlayer";
import type { TimelinePlayback } from "./Timeline";

/**
 * Feeds the timeline from the timeline-mode playhead (docs/timeline/ui.md UI-9, P8.11):
 * `useTimelineSelectionStore`'s paused playhead, `IsPlayingContext`, and the audio player's
 * `getLivePlaybackPosition`.
 *
 * - While playing, the cursor is `beatIndexAtTime(beats, seconds)`, updated once per animation
 *   frame and re-rendered only when the beat changes. With no beats it returns -1, which is never
 *   used as a position. The playhead line itself follows the fractional `liveBeat` every frame,
 *   without re-rendering the timeline.
 * - While paused, the cursor is the frame a paused preview holds, or else the playhead, which
 *   rests on any whole beat, the end of the show included (UI-11).
 * - Seeking moves only the playhead; the selection stays. Page navigation moves the playhead to a
 *   flag and selects that page (`navigateTimelinePages`). While playing, both jump playback
 *   instead and leave the playhead alone (UI-12, `jumpTimelinePlayback`); a scrub suspends
 *   playback until it ends, then plays on from there once (`seekTimeline`, UI-12 review).
 * - Play previews the window, from just before the start flag to just after the playhead,
 *   looping when the loop is on (`toggleTimelinePlayback`, UI-11).
 */
export function useTimelinePlayback({
    beats,
    pages,
}: {
    beats: readonly Beat[];
    pages: readonly Page[];
}): TimelinePlayback {
    const { isPlaying, setIsPlaying } = useIsPlaying()!;
    const playheadBeat = useTimelineSelectionStore(displayedBeat);
    const [liveIndex, setLiveIndex] = useState<number | null>(null);

    useEffect(() => {
        if (!isPlaying) {
            setLiveIndex(null);
            return;
        }
        let frame = 0;
        const update = () => {
            const index = beatIndexAtTime(beats, getLivePlaybackPosition());
            if (index >= 0) setLiveIndex(index);
            frame = requestAnimationFrame(update);
        };
        update();
        return () => cancelAnimationFrame(frame);
    }, [beats, isPlaying]);

    // The playhead line reads this every frame; nothing re-renders for it
    const liveBeat = useCallback(
        () =>
            playbackStartInfoRef.current
                ? beatAtTime(beats, getLivePlaybackPosition())
                : null,
        [beats],
    );

    return useMemo<TimelinePlayback>(
        () => ({
            liveBeat,
            positionBeat:
                isPlaying && liveIndex != null ? liveIndex : playheadBeat,
            isPlaying,
            // UI-12: while playing, a click or page button jumps playback there, and a scrub
            // suspends it until it ends (`seekTimeline`)
            onSeek: (beatIndex, options) =>
                seekTimeline(beats, beatIndex, options?.gesture, {
                    isPlaying,
                    setIsPlaying,
                }),
            onNavigate: (direction) => {
                if (!isPlaying) navigateTimelinePages(pages, direction);
                else
                    jumpTimelinePages(
                        beats,
                        pages,
                        Math.floor(liveBeat() ?? liveIndex ?? playheadBeat),
                        direction,
                    );
            },
            onStop: () => stopTimelinePlayback({ isPlaying, setIsPlaying }),
            onPlayingChange: (next) => {
                if (next === isPlaying) return;
                toggleTimelinePlayback({
                    isPlaying,
                    showEndBeat: beats.length,
                    setIsPlaying,
                });
            },
        }),
        [
            beats,
            isPlaying,
            liveBeat,
            liveIndex,
            pages,
            playheadBeat,
            setIsPlaying,
        ],
    );
}

import { useEffect, useMemo, useState } from "react";
import { useIsPlaying } from "@/context/IsPlayingContext";
import type Beat from "@/global/classes/Beat";
import type Page from "@/global/classes/Page";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { beatIndexAtTime } from "@/timeline/timeMap";
import { pageAtPlayhead } from "@/timeline/timelinePlayhead";
import {
    navigateTimelinePages,
    toggleTimelinePlayback,
} from "@/timeline/timelineTransport";
import { getLivePlaybackPosition } from "./audio/AudioPlayer";
import type { TimelinePlayback } from "./Timeline";

/**
 * Feeds the timeline from the timeline-mode playhead (docs/timeline/ui.md UI-9, P8.11):
 * `useTimelineSelectionStore`'s paused playhead, `IsPlayingContext`, and the audio player's
 * `getLivePlaybackPosition`.
 *
 * - While playing, the cursor is `beatIndexAtTime(beats, seconds)`, updated once per animation
 *   frame and re-rendered only when the beat changes. With no beats it returns -1, which is never
 *   used as a position.
 * - While paused, the cursor is the playhead, which rests on any whole beat, the end of the show
 *   included.
 * - Seeking moves only the playhead; the selection stays. Page navigation moves the playhead to a
 *   flag and selects that page (`navigateTimelinePages`). Neither does anything while playing.
 * - Play resumes from the playhead and loops a selected range (`toggleTimelinePlayback`).
 */
export function useTimelinePlayback({
    beats,
    pages,
}: {
    beats: readonly Beat[];
    pages: readonly Page[];
}): TimelinePlayback {
    const { isPlaying, setIsPlaying } = useIsPlaying()!;
    const playheadBeat = useTimelineSelectionStore((s) => s.playheadBeat);
    const seek = useTimelineSelectionStore((s) => s.seek);
    const [liveBeat, setLiveBeat] = useState<number | null>(null);

    useEffect(() => {
        if (!isPlaying) {
            setLiveBeat(null);
            return;
        }
        let frame = 0;
        const update = () => {
            const index = beatIndexAtTime(beats, getLivePlaybackPosition());
            if (index >= 0) setLiveBeat(index);
            frame = requestAnimationFrame(update);
        };
        update();
        return () => cancelAnimationFrame(frame);
    }, [beats, isPlaying]);

    return useMemo<TimelinePlayback>(
        () => ({
            positionBeat:
                isPlaying && liveBeat != null ? liveBeat : playheadBeat,
            // A page is named by its end flag, so on a flag the label names the page ending there
            pageLabel: isPlaying
                ? undefined
                : pageAtPlayhead(pages, playheadBeat)?.name,
            isPlaying,
            onSeek: (beatIndex) => {
                if (!isPlaying) seek(beatIndex);
            },
            onNavigate: (direction) => {
                if (!isPlaying) navigateTimelinePages(pages, direction);
            },
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
            beats.length,
            isPlaying,
            liveBeat,
            pages,
            playheadBeat,
            seek,
            setIsPlaying,
        ],
    );
}

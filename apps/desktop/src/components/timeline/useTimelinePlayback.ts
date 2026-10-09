import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    loopBounds,
    selectedPageBox,
    seekTimeline,
    toggleTimelinePlayback,
} from "@/timeline/timelineTransport";
import {
    getLivePlaybackPosition,
    playbackStartInfoRef,
} from "./audio/AudioPlayer";
import type { TimelinePlayback } from "./Timeline";

interface PlaybackState {
    readonly beats: readonly Beat[];
    readonly pages: readonly Page[];
    readonly isPlaying: boolean;
    readonly setIsPlaying: (isPlaying: boolean) => void;
    readonly liveIndex: number | null;
    readonly playheadBeat: number;
}

/** The playback commands, reading the latest state, so they keep their identity across beats */
const playbackCommands = (
    latest: { readonly current: PlaybackState },
    liveBeat: () => number | null,
): Pick<TimelinePlayback, "onSeek" | "onNavigate" | "onPlayingChange"> => ({
    // UI-12: while playing, a click or page button jumps playback there, and a scrub suspends it
    // until it ends (`seekTimeline`), which says where a scrub's seek landed
    onSeek: (beatIndex, options) => {
        const { beats, isPlaying, setIsPlaying } = latest.current;
        return seekTimeline(beats, beatIndex, options?.gesture, {
            isPlaying,
            setIsPlaying,
        });
    },
    onNavigate: (direction) => {
        const { beats, pages, isPlaying, liveIndex, playheadBeat } =
            latest.current;
        if (!isPlaying) navigateTimelinePages(pages, direction);
        else
            jumpTimelinePages(
                beats,
                pages,
                Math.floor(liveBeat() ?? liveIndex ?? playheadBeat),
                direction,
            );
    },
    onPlayingChange: (next) => {
        const { beats, isPlaying, setIsPlaying } = latest.current;
        if (next === isPlaying) return;
        toggleTimelinePlayback({
            isPlaying,
            showEndBeat: beats.length,
            setIsPlaying,
        });
    },
});

/**
 * Feeds the timeline from the timeline-mode playhead (docs/timeline/ui.md UI-9, P8.11):
 * `useTimelineSelectionStore`'s paused playhead, `IsPlayingContext`, and the audio player's
 * `getLivePlaybackPosition`.
 *
 * - While playing, the cursor is `beatIndexAtTime(beats, seconds)`, updated once per animation
 *   frame and re-rendered only when the beat changes. With no beats it returns -1, which is never
 *   used as a position. The playhead line itself follows the fractional `liveBeat` every frame,
 *   without re-rendering the timeline.
 * - While paused, the cursor is the playhead, which rests on any whole beat, the end of the show
 *   included (UI-11).
 * - Seeking moves only the playhead; the selection stays. Page navigation moves the playhead to a
 *   flag and selects that page (`navigateTimelinePages`). While playing, both jump playback
 *   instead and leave the playhead alone (UI-12, `jumpTimelinePlayback`); a scrub suspends
 *   playback until it ends, then plays on from there once (`seekTimeline`, UI-12 review).
 * - Play (`toggleTimelinePlayback`, UI-17) loops the loop region while looping is on, wherever the
 *   playhead is, and returns to the playhead when it stops; otherwise it plays on from the
 *   playhead and stops in place.
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
    // UI-17: with looping on (or a move isolated), Play loops
    const playLoops = useTimelineSelectionStore((s) => loopBounds(s) !== null);
    // UI-17: what an unpinned Play does next, for the Play button's words
    const playNext = useTimelineSelectionStore((s) =>
        selectedPageBox(s) ? ("page" as const) : undefined,
    );
    // Shift+Space's once-through, which stops back on the page's set
    const playingOnce = useTimelineSelectionStore(
        (s) => s.playback?.kind === "preview" && s.playback.once === true,
    );
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

    const state: PlaybackState = {
        beats,
        pages,
        isPlaying,
        setIsPlaying,
        liveIndex,
        playheadBeat,
    };
    const latest = useRef(state);
    latest.current = state;
    const commands = useMemo(
        () => playbackCommands(latest, liveBeat),
        [liveBeat],
    );

    return useMemo<TimelinePlayback>(
        () => ({
            liveBeat,
            positionBeat:
                isPlaying && liveIndex != null ? liveIndex : playheadBeat,
            isPlaying,
            playLoops,
            playNext,
            playingOnce,
            ...commands,
        }),
        [
            commands,
            isPlaying,
            liveBeat,
            liveIndex,
            playheadBeat,
            playLoops,
            playNext,
            playingOnce,
        ],
    );
}

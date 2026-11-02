import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsPlaying } from "@/context/IsPlayingContext";
import type Page from "@/global/classes/Page";
import {
    displayedBeat,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import type { CountClock } from "@/timeline/countGrid";
import {
    navigateTimeline,
    loopBounds,
    playTimelineOn,
    playTimelinePage,
    seekTimeline,
    toggleTimelinePlayback,
} from "@/timeline/timelineTransport";
import {
    getLivePlaybackPosition,
    playbackStartInfoRef,
} from "./audio/AudioPlayer";
import type { TimelinePlayback } from "./Timeline";
import { useIsBasicMode } from "@/stores/EditorModeStore";
import { useIsPreviewMode } from "@/stores/PreviewModeStore";
import { useTempoModeStore } from "@/tempo/tempoModeStore";
import tolgee from "@/global/singletons/Tolgee";

interface PlaybackState {
    readonly countGrid: CountClock;
    readonly pages: readonly Page[];
    readonly isPlaying: boolean;
    readonly setIsPlaying: (isPlaying: boolean) => void;
}

/** The playback commands, reading the latest state, so they keep their identity across beats */
const playbackCommands = (latest: {
    readonly current: PlaybackState;
}): Pick<
    TimelinePlayback,
    | "onSeek"
    | "onNavigate"
    | "onPlayingChange"
    | "onPlayFromPlayhead"
    | "onPlayOn"
> => ({
    // UI-12: while playing, a click or page button jumps playback there, and a scrub suspends it
    // until it ends (`seekTimeline`), which says where a scrub's seek landed
    onSeek: (beatIndex, options) => {
        const { countGrid, isPlaying, setIsPlaying } = latest.current;
        return seekTimeline(countGrid, beatIndex, options?.gesture, {
            isPlaying,
            setIsPlaying,
            line: options?.line,
        });
    },
    onNavigate: (direction) => {
        const { countGrid, pages, isPlaying } = latest.current;
        navigateTimeline(countGrid, pages, isPlaying, direction);
    },
    onPlayingChange: (next) => {
        const { isPlaying, setIsPlaying } = latest.current;
        if (next === isPlaying) return;
        toggleTimelinePlayback({ isPlaying, setIsPlaying });
    },
    // Shift+click on Play, as Shift+Space
    onPlayFromPlayhead: () => {
        const { isPlaying, setIsPlaying } = latest.current;
        playTimelinePage({ isPlaying, setIsPlaying });
    },
    // Alt+click on Play, as Alt+Space (UI-26)
    onPlayOn: () => {
        const { isPlaying, setIsPlaying } = latest.current;
        playTimelineOn({ isPlaying, setIsPlaying });
    },
});

/**
 * Feeds the timeline from the timeline-mode playhead (docs/timeline/ui.md UI-9, P8.11):
 * `useTimelineSelectionStore`'s paused playhead, `IsPlayingContext`, and the audio player's
 * `getLivePlaybackPosition`.
 *
 * - While playing, the cursor is the whole count playing (on the count grid, so past the stored
 *   counts too), updated once per animation frame and re-rendered only when the count changes.
 *   The playhead line itself follows the fractional `liveBeat` every frame, without re-rendering
 *   the timeline.
 * - While paused, the cursor is the playhead, which rests on any whole beat, the end of the show
 *   included (UI-11).
 * - Seeking moves only the playhead; the selection stays. Page navigation moves the playhead to a
 *   flag and selects that page (`navigateTimelinePages`). While playing, both jump playback
 *   instead and leave the playhead alone (UI-12, `jumpTimelinePlayback`); a scrub suspends
 *   playback until it ends, then plays on from there once (`seekTimeline`, UI-12 review).
 * - Play (`toggleTimelinePlayback`, UI-17) loops the loop region while looping is on; otherwise
 *   Expert plays the window once, start flag to playhead, and Alt plays on (UI-26), and Basic plays
 *   on from the start flag. Stop goes back to where Play was
 *   pressed, and Shift+Space pauses where it is instead (UI-24).
 */
export function useTimelinePlayback({
    countGrid,
    pages,
}: {
    /** Show time to count and back, past the stored counts too (endless counts) */
    countGrid: CountClock;
    pages: readonly Page[];
}): TimelinePlayback {
    const { isPlaying, setIsPlaying } = useIsPlaying()!;
    const playheadBeat = useTimelineSelectionStore(displayedBeat);
    // UI-17: with looping on (or a move isolated), Play loops
    const playLoops = useTimelineSelectionStore((s) => loopBounds(s) !== null);
    // UI-24: Stop goes back to the resting playhead, which playing never moves
    const restingBeat = useTimelineSelectionStore((s) => s.playheadBeat);
    const [liveIndex, setLiveIndex] = useState<number | null>(null);

    useEffect(() => {
        if (!isPlaying) {
            setLiveIndex(null);
            return;
        }
        let frame = 0;
        const update = () => {
            const beat = countGrid.beatAtTime(getLivePlaybackPosition());
            if (beat >= 0) setLiveIndex(Math.floor(beat));
            frame = requestAnimationFrame(update);
        };
        update();
        return () => cancelAnimationFrame(frame);
    }, [countGrid, isPlaying]);

    // The playhead line reads this every frame; nothing re-renders for it
    const liveBeat = useCallback(
        () =>
            playbackStartInfoRef.current
                ? countGrid.beatAtTime(getLivePlaybackPosition())
                : null,
        [countGrid],
    );

    const state: PlaybackState = {
        countGrid,
        pages,
        isPlaying,
        setIsPlaying,
    };
    const latest = useRef(state);
    latest.current = state;
    const commands = useMemo(() => playbackCommands(latest), []);
    // UI-26: Alt+click plays on in Expert; Basic's Play already does, and so does Preview's, which
    // has no loop and pauses where it is (`timelineTransport`), so nothing marks a way back
    const basic = useIsBasicMode();
    const preview = useIsPreviewMode();
    // PROTOTYPE (tempo mode, owner 2026-10-30): one playhead, one Play. It loops the selected
    // measures or plays on from the playhead, and Stop stays where it stopped: nothing to go back to
    const tempoMode = useTempoModeStore((s) => s.on);
    const tempoLoop = useTempoModeStore((s) => s.loop?.label ?? null);

    return useMemo<TimelinePlayback>(
        () =>
            tempoMode
                ? {
                      liveBeat,
                      positionBeat:
                          isPlaying && liveIndex != null
                              ? liveIndex
                              : playheadBeat,
                      isPlaying,
                      playLoops: tempoLoop !== null,
                      ...commands,
                      onPlayOn: undefined,
                      onPlayFromPlayhead: undefined,
                      playOnly:
                          tempoLoop !== null
                              ? tolgee.t(
                                    "tempoMode.timeline.playLoop",
                                    "Loop {measures}",
                                    { measures: tempoLoop },
                                )
                              : tolgee.t(
                                    "tempoMode.timeline.playFromPlayhead",
                                    "Play from the playhead",
                                ),
                  }
                : {
                      liveBeat,
                      positionBeat:
                          isPlaying && liveIndex != null
                              ? liveIndex
                              : playheadBeat,
                      isPlaying,
                      returnBeat:
                          isPlaying && !preview ? restingBeat : undefined,
                      playLoops: playLoops && !preview,
                      ...commands,
                      onPlayOn:
                          basic || preview ? undefined : commands.onPlayOn,
                      onPlayFromPlayhead: preview
                          ? undefined
                          : commands.onPlayFromPlayhead,
                  },
        [
            tempoMode,
            tempoLoop,
            basic,
            preview,
            commands,
            isPlaying,
            liveBeat,
            liveIndex,
            playheadBeat,
            playLoops,
            restingBeat,
        ],
    );
}

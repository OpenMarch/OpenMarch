import { useMemo } from "react";
import { useTimingObjects } from "@/hooks";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { jumpTimelinePlayback } from "@/timeline/timelineTransport";
import {
    peaksByBeat,
    useAudioEnvelopeStore,
} from "@/timeline/timelineWaveform";
import { createTimelineBeatAxis } from "@/timeline/timelineViewModel";
import type Beat from "@/global/classes/Beat";
import type { CountGrid } from "@/timeline/countGrid";
import { musicEndBeat } from "@/timeline/countsPastEnd";
import { beatsThrough } from "@/timeline/endlessTimeline";
import {
    useMusicEndSeconds,
    usePlaybackStopBeat,
} from "@/timeline/usePlaybackStopBeat";
import {
    TimelineWaveformProvider,
    type TimelineInput,
    type TimelineSelection,
} from "./Timeline";
import { TimelineSoundButton, TimelineSpeedButton } from "./TimelineControls";
import { PlayingTimeline } from "./TimelineModePanel";

const NO_WAVEFORM = { peaksByBeat: [] };
const NO_CLIPS: TimelineInput[] = [];

// The transport's controls read their own state: the same elements every render, as in the drill
// timeline's panel
const SOUND_BUTTON = <TimelineSoundButton />;
const SPEED_BUTTON = <TimelineSpeedButton />;

/**
 * UI-12: the waveform lane, from the audio player's envelope, per beat on the view axis, as the
 * drill timeline's panel draws it: in full, past the stored counts to the music's end (endless
 * counts). Hidden in settings, the lane goes away as it does with no audio. In page boxes
 * (`inBoxes`, as Basic draws them) a silent placeholder counts as no audio too, as the lane sets
 * the pane's height there (UI-19).
 */
function useWaveformLane(
    beats: readonly Beat[],
    countGrid: CountGrid,
    inBoxes = false,
) {
    const envelope = useAudioEnvelopeStore((s) => s.envelope);
    const waveformHidden = useUiSettingsStore(
        (s) => s.uiSettings.timelineWaveformStyle === "hidden",
    );
    const musicEnd = useMusicEndSeconds();
    return useMemo(() => {
        if (!envelope || waveformHidden) return null;
        const through =
            musicEnd === null ? 0 : musicEndBeat(countGrid, musicEnd);
        const peaks = peaksByBeat(
            envelope,
            beatsThrough(countGrid, beats, through),
            createTimelineBeatAxis(beats).offset,
        );
        if (inBoxes && !peaks.some((beat) => beat.some((peak) => peak > 0)))
            return null;
        return { peaksByBeat: peaks };
    }, [envelope, beats, countGrid, musicEnd, waveformHidden, inBoxes]);
}

/** A page box or home goes to that page, as in the drill timeline (UI-9), without the loop */
function useGoToPage(countGrid: CountGrid) {
    const { isPlaying } = useIsPlaying()!;
    return (next: TimelineSelection) => {
        if (isPlaying && next?.kind === "home") {
            jumpTimelinePlayback(countGrid, 0);
            return;
        }
        if (isPlaying) return;
        const store = useTimelineSelectionStore.getState();
        if (next?.kind === "home") store.selectHome();
        else if (next?.kind === "range")
            store.selectRange(
                next.range.startBeatIndex,
                next.range.endBeatIndex,
            );
    };
}

/** The timeline's zoom, fitted to the show or not, as saved (UI-12) */
function useSavedZoomFit() {
    const zoomFitted = useUiSettingsStore(
        (s) => s.uiSettings.timelineZoomFitted,
    );
    const setZoomFitted = useUiSettingsStore((s) => s.setTimelineZoomFitted);
    return { zoomFitted, onZoomFittedChange: setZoomFitted };
}

/**
 * Preview's timeline (`PreviewModeStore`): only the music, the pages and the playhead, as one row
 * of page boxes with the music inside them (Basic's look, in either mode), read-only. No start
 * flag, loop or way-back mark: Preview always plays on. The transport keeps navigation, speed and
 * sound.
 */
export function PreviewTimelinePanel() {
    const { beats, pages, measures, countGrid } = useTimingObjects()!;
    const waveform = useWaveformLane(beats, countGrid, true);
    const goTo = useGoToPage(countGrid);
    // The counts go on past the stored ones, as on the drill timeline (endless counts)
    const stopBeat = usePlaybackStopBeat();
    const zoomFit = useSavedZoomFit();
    return (
        <TimelineWaveformProvider waveform={waveform ?? NO_WAVEFORM}>
            <PlayingTimeline
                mode="basic"
                basic
                readOnly
                hideStartFlag
                showTransport
                {...zoomFit}
                className="w-full"
                beats={beats}
                pages={pages}
                measures={measures}
                timelines={NO_CLIPS}
                transportAccessories={SPEED_BUTTON}
                transportSecondary={SOUND_BUTTON}
                onSelectionChange={goTo}
                countGrid={countGrid}
                fitBeat={stopBeat}
            />
        </TimelineWaveformProvider>
    );
}

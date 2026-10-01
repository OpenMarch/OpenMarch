import type Beat from "@/global/classes/Beat";
import type Measure from "@/global/classes/Measure";
import type Page from "@/global/classes/Page";
import {
    createContext,
    type ReactNode,
    useContext,
    useMemo,
    useState,
} from "react";
import {
    createTimelineBeatAxis,
    timelineInputToView,
    type TimelineBeatAxis,
} from "@/timeline/timelineViewModel";
import { clamp } from "./TimelineGeometry";
import { CollapsedTimeline, ExpandedTimeline } from "./TimelineVariants";
import type {
    TimelineActivitySpan,
    TimelineCreateTrackRequest,
    TimelineNavigation,
    TimelineRangeChange,
    TimelineSelection,
    TimelineTarget,
    TimelineTrack,
    TimelineTrackDiagnostics,
    TimelineViewModel,
    TimelineWaveform,
} from "./TimelineViewModel";

export type TimelineMode = "expanded" | "collapsed";

export interface TimelineLegInput {
    readonly id: string | number;
    readonly startBeatIndex: number;
    readonly endBeatIndex: number;
    readonly texture: "move" | "hold";
}

/**
 * Renderer-ready aggregate assembled outside the visual component, by the view-model adapter
 * (`src/timeline/timelineViewModel.ts`). Its ranges are spec beat positions.
 */
export interface TimelineInput {
    readonly id: string | number;
    /** The spec timeline: clips with the same link id move together */
    readonly linkId?: string | number;
    readonly targetId: string | number;
    readonly targetType: TimelineTarget["type"];
    readonly label: string;
    readonly color: string;
    readonly startBeatIndex: number;
    readonly endBeatIndex: number;
    readonly legs: readonly TimelineLegInput[];
    readonly activitySpans: readonly TimelineActivitySpan[];
    readonly diagnostics?: TimelineTrackDiagnostics;
}

/**
 * The playback state the timeline shows and the commands it sends. The caller owns the clock: the
 * app feeds it from its audio playback (see `useTimelinePlayback`), and stories keep local state.
 * 0.2 read the frame clock store here instead; that clock isn't wired into the app yet (P5.9).
 */
export interface TimelinePlayback {
    /** The beat under the playback cursor, a beat index in `[0, beats.length)` */
    readonly positionBeat: number;
    /** Names the page in the transport and playhead labels, such as the selected page while paused */
    readonly pageLabel?: string;
    readonly isPlaying: boolean;
    /** Seek to a whole beat index, already clamped to the show */
    readonly onSeek?: (beatIndex: number) => void;
    readonly onPlayingChange?: (isPlaying: boolean) => void;
    /** Page navigation from the transport; without it, the transport seeks to page starts */
    readonly onNavigate?: (direction: TimelineNavigation) => void;
}

const STOPPED_AT_START: TimelinePlayback = {
    positionBeat: 0,
    isPlaying: false,
};

/**
 * Every beat in these props, and in the commands the timeline sends, is a spec beat position
 * (`beats` indexes). The timeline draws them on a view axis that hides the zero-length beat 0
 * (`createTimelineBeatAxis`); its selection is in view beats and is only passed back to it.
 */
export interface TimelineProps {
    readonly mode: TimelineMode;
    readonly beats: readonly Beat[];
    readonly pages: readonly Page[];
    readonly measures: readonly Measure[];
    readonly timelines: readonly TimelineInput[];
    readonly playback?: TimelinePlayback;
    /** The playback clock shown in the transport */
    readonly transportClock?: ReactNode;
    /** Extra transport controls, such as volume, the metronome and fullscreen */
    readonly transportAccessories?: ReactNode;
    readonly showTransport?: boolean;
    readonly selection?: TimelineSelection;
    readonly selectedTarget?: TimelineTarget | null;
    readonly className?: string;
    readonly onSelectionChange?: (selection: TimelineSelection) => void;
    readonly onCreateTrack?: (request: TimelineCreateTrackRequest) => void;
    readonly onTimelineRangeCommit?: (change: TimelineRangeChange) => void;
}

const TimelineWaveformContext = createContext<TimelineWaveform | null>(null);

/** Internal injection point used by Storybook until the audio adapter lands. */
export function TimelineWaveformProvider({
    waveform,
    children,
}: {
    waveform: TimelineWaveform;
    children: ReactNode;
}) {
    return (
        <TimelineWaveformContext.Provider value={waveform}>
            {children}
        </TimelineWaveformContext.Provider>
    );
}

const useTimelineWaveform = (beatCount: number): TimelineWaveform => {
    const injected = useContext(TimelineWaveformContext);
    return useMemo(() => {
        if (injected?.peaksByBeat.length === beatCount) return injected;
        return {
            peaksByBeat: Array.from({ length: beatCount }, () => []),
        };
    }, [beatCount, injected]);
};

const toTrack = (timeline: TimelineInput): TimelineTrack => ({
    id: timeline.id,
    linkId: timeline.linkId,
    targetId: String(timeline.targetId),
    targetType: timeline.targetType,
    label: timeline.label,
    color: timeline.color,
    legs: timeline.legs.map((leg) => ({
        id: leg.id,
        startBeat: leg.startBeatIndex,
        endBeat: leg.endBeatIndex,
        texture: leg.texture,
    })),
    activitySpans: timeline.activitySpans,
    diagnostics: timeline.diagnostics,
});

/**
 * The view model on the view's beat axis: the fixed zero-length beat 0 would be a one-beat empty
 * column before the first timed page, so the axis hides it (`createTimelineBeatAxis`).
 */
export const createTimelineViewModel = ({
    beats,
    pages,
    measures,
    timelines,
    waveform,
    axis = createTimelineBeatAxis(beats),
}: Pick<TimelineProps, "beats" | "pages" | "measures" | "timelines"> & {
    waveform: TimelineWaveform;
    axis?: TimelineBeatAxis;
}): TimelineViewModel => ({
    beatCount: axis.beatCount,
    pages: pages.flatMap((page) => {
        const first = page.beats[0]?.index;
        return first == null
            ? []
            : [
                  {
                      id: page.id,
                      label: page.name,
                      atBeat: axis.toView(first),
                      isInitial:
                          page.previousPageId === null && page.counts === 0,
                  },
              ];
    }),
    measures: measures.map((measure) => ({
        id: measure.id,
        label: `M${measure.number}`,
        atBeat: axis.toView(measure.startBeat.index),
        rehearsalMark: measure.rehearsalMark,
    })),
    tracks: timelines.flatMap((timeline) => {
        const view = timelineInputToView(timeline, axis);
        return view ? [toTrack(view)] : [];
    }),
    waveform,
});

export function Timeline(props: TimelineProps) {
    const axis = useMemo(
        () => createTimelineBeatAxis(props.beats),
        [props.beats],
    );
    const waveform = useTimelineWaveform(axis.beatCount);
    const model = useMemo(
        () =>
            createTimelineViewModel({
                beats: props.beats,
                pages: props.pages,
                measures: props.measures,
                timelines: props.timelines,
                waveform,
                axis,
            }),
        [
            axis,
            props.beats,
            props.measures,
            props.pages,
            props.timelines,
            waveform,
        ],
    );
    const playback = props.playback ?? STOPPED_AT_START;
    const [pixelsPerBeat, setPixelsPerBeat] = useState(16);

    const positionBeat = clamp(
        axis.toView(playback.positionBeat),
        0,
        Math.max(model.beatCount - 1, 0),
    );
    const seekToBeat = playback.onSeek
        ? (viewBeat: number) => {
              const nextIndex = clamp(
                  axis.toSpec(Math.round(viewBeat)),
                  0,
                  Math.max(props.beats.length - 1, 0),
              );
              if (!props.beats[nextIndex]) return;
              playback.onSeek?.(nextIndex);
          }
        : undefined;
    const { onTimelineRangeCommit, onCreateTrack, timelines } = props;
    // A clip move keeps its length: send the spec range shifted by the move, so a clip whose start
    // was hidden with beat 0 moves by exactly the beats it was dragged
    const commitRange = onTimelineRangeCommit
        ? (change: TimelineRangeChange) => {
              const input = timelines.find(
                  (timeline) => timeline.id === change.timelineId,
              );
              if (!input) return;
              const shift =
                  change.startBeatIndex - axis.toView(input.startBeatIndex);
              onTimelineRangeCommit({
                  timelineId: change.timelineId,
                  startBeatIndex: input.startBeatIndex + shift,
                  endBeatIndex: input.endBeatIndex + shift,
              });
          }
        : undefined;
    const createTrack = onCreateTrack
        ? (request: TimelineCreateTrackRequest) =>
              onCreateTrack({
                  target: request.target,
                  range: {
                      startBeatIndex: axis.toSpec(request.range.startBeatIndex),
                      endBeatIndex: axis.toSpec(request.range.endBeatIndex),
                  },
              })
        : undefined;
    const commonProps = {
        model,
        positionBeat,
        pageLabel: playback.pageLabel,
        isPlaying: playback.isPlaying,
        pixelsPerBeat,
        selection: props.selection,
        selectedTarget: props.selectedTarget,
        className: props.className,
        onSeek: seekToBeat,
        onPlayingChange: playback.onPlayingChange,
        onNavigate: playback.onNavigate,
        onPixelsPerBeatChange: setPixelsPerBeat,
        onSelectionChange: props.onSelectionChange,
        onCreateTrack: createTrack,
        onTimelineRangeCommit: commitRange,
        showTransport: props.showTransport ?? true,
        transportClock: props.transportClock,
        transportAccessories: props.transportAccessories,
    };

    return props.mode === "expanded" ? (
        <ExpandedTimeline {...commonProps} />
    ) : (
        <CollapsedTimeline {...commonProps} />
    );
}

export type {
    TimelineActivitySpan,
    TimelineBeatRange,
    TimelineCreateTrackRequest,
    TimelineSelection,
    TimelineTarget,
} from "./TimelineViewModel";

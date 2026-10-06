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
import { pageEndBeat } from "@/timeline/pageEndBeat";
import { clamp } from "./TimelineGeometry";
import { CollapsedTimeline, ExpandedTimeline } from "./TimelineVariants";
import type {
    TimelineAddMarchersMenu,
    TimelineMenuTarget,
} from "./TimelineRangeMenu";
import type {
    TimelineActivitySpan,
    TimelineBeatRange,
    TimelineCreateTrackRequest,
    TimelineNavigation,
    TimelineRangeChange,
    TimelineSeekOptions,
    TimelineSelection,
    TimelineTarget,
    TimelineTrack,
    TimelineTrackDiagnostics,
    TimelineTrackTargetType,
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
    readonly targetType: TimelineTrackTargetType;
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
    /** The beat under the playback cursor, in `[0, beats.length]` (the end of the show included) */
    readonly positionBeat: number;
    /** While playing, the live spec beat, fractional, for a smooth playhead; `null` when there is none */
    readonly liveBeat?: () => number | null;
    readonly isPlaying: boolean;
    /**
     * Seek to a whole beat index, already clamped to the show. `options.gesture` says where the
     * seek sits in a scrub (UI-12 review); without it, the seek is one explicit action.
     */
    readonly onSeek?: (
        beatIndex: number,
        options?: TimelineSeekOptions,
    ) => void;
    readonly onPlayingChange?: (isPlaying: boolean) => void;
    /** **Stop** (UI-11): back to the playhead */
    readonly onStop?: () => void;
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
 * (`createTimelineBeatAxis`), and converts at this boundary, the selection included.
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
    /** Transport controls that fold into "⋯" on a narrow panel, such as Sound */
    readonly transportSecondary?: ReactNode;
    /** View controls at the transport's end, such as Compact */
    readonly transportViewControls?: ReactNode;
    readonly showTransport?: boolean;
    /** The zoom, in pixels per beat; without it the timeline keeps its own (starting at 16) */
    readonly pixelsPerBeat?: number;
    readonly onPixelsPerBeatChange?: (pixelsPerBeat: number) => void;
    /** Whether the zoom was fitted to the show; the timeline opens fitted when it was (UI-12) */
    readonly zoomFitted?: boolean;
    readonly onZoomFittedChange?: (fitted: boolean) => void;
    readonly selection?: TimelineSelection;
    readonly selectedTarget?: TimelineTarget | null;
    readonly className?: string;
    readonly onSelectionChange?: (selection: TimelineSelection) => void;
    readonly onCreateTrack?: (request: TimelineCreateTrackRequest) => void;
    readonly onTimelineRangeCommit?: (change: TimelineRangeChange) => void;
    /** Turns **From start** off (UI-11), from the range bar */
    readonly onPlayFromStartOff?: () => void;
    /** Unpins the start flag (UI-12), from its pin */
    readonly onUnpinStart?: () => void;
    /**
     * The right-click menu's **Add selected marchers** (UI-9, P8.14), for a page box, a clip's
     * timeline or a dragged range. It gets spec beats; the menu doesn't change the selection.
     */
    readonly addSelectedMarchers?: TimelineAddMarchersMenu;
    /**
     * UI-9 **+** at the paused playhead (P8.13's `useAddPageFlag`); omit it where **+** doesn't
     * show (on a flag, at home, past the beats).
     */
    readonly onAddPageFlag?: () => void;
    /** The page box menu's **Delete page flag** (UI-9 Deleting a flag), by page id */
    readonly onDeletePageFlag?: (pageId: number) => void;
    /**
     * Double-clicking a page box or a clip: isolate that range's stored timeline. It gets the
     * range in spec beats (a clip's stored range).
     */
    readonly onOpenRange?: (range: TimelineBeatRange) => void;
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
                      endBeat: axis.toView(pageEndBeat(page)),
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

/** A spec-beat selection on the view axis */
export const selectionToView = (
    selection: TimelineSelection | undefined,
    axis: TimelineBeatAxis,
): TimelineSelection | undefined =>
    selection?.kind === "range"
        ? {
              kind: "range",
              range: {
                  startBeatIndex: axis.toView(selection.range.startBeatIndex),
                  endBeatIndex: axis.toView(selection.range.endBeatIndex),
              },
              ...(selection.startFlagBeatIndex !== undefined
                  ? {
                        startFlagBeatIndex: axis.toView(
                            selection.startFlagBeatIndex,
                        ),
                    }
                  : {}),
              ...(selection.fromStart ? { fromStart: true } : {}),
              ...(selection.startPinned ? { startPinned: true } : {}),
          }
        : selection;

/** A view-axis selection in spec beats */
export const selectionToSpec = (
    selection: TimelineSelection,
    axis: TimelineBeatAxis,
): TimelineSelection =>
    selection?.kind === "range"
        ? {
              kind: "range",
              range: {
                  startBeatIndex: axis.toSpec(selection.range.startBeatIndex),
                  endBeatIndex: axis.toSpec(selection.range.endBeatIndex),
              },
              ...(selection.drawn ? { drawn: true } : {}),
          }
        : selection;

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
    const [ownPixelsPerBeat, setOwnPixelsPerBeat] = useState(16);
    const pixelsPerBeat = props.pixelsPerBeat ?? ownPixelsPerBeat;
    const setPixelsPerBeat = props.onPixelsPerBeatChange ?? setOwnPixelsPerBeat;

    // The playhead may rest on the end of the show (the last flag, UI-9), one past the last beat
    const positionBeat = clamp(
        axis.toView(playback.positionBeat),
        0,
        model.beatCount,
    );
    const liveBeat = playback.liveBeat;
    const beatCount = model.beatCount;
    const livePositionBeat = useMemo(
        () =>
            liveBeat
                ? () => {
                      const beat = liveBeat();
                      return beat === null
                          ? null
                          : clamp(axis.toView(beat), 0, beatCount);
                  }
                : undefined,
        [axis, beatCount, liveBeat],
    );
    const seekToBeat = playback.onSeek
        ? (viewBeat: number, options?: TimelineSeekOptions) => {
              if (props.beats.length === 0) return;
              playback.onSeek?.(
                  clamp(
                      axis.toSpec(Math.round(viewBeat)),
                      0,
                      props.beats.length,
                  ),
                  options,
              );
          }
        : undefined;
    const { onSelectionChange } = props;
    const selection = selectionToView(props.selection, axis);
    const changeSelection = onSelectionChange
        ? (next: TimelineSelection) =>
              onSelectionChange(selectionToSpec(next, axis))
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
    const { addSelectedMarchers, onDeletePageFlag, onOpenRange } = props;
    // A clip's stored spec range, else the view range mapped back (as the menu's Add does)
    const specRangeOf = ({ range, trackId }: TimelineMenuTarget) => {
        const input =
            trackId === undefined
                ? undefined
                : timelines.find((t) => String(t.id) === trackId);
        return input
            ? {
                  startBeatIndex: input.startBeatIndex,
                  endBeatIndex: input.endBeatIndex,
              }
            : {
                  startBeatIndex: axis.toSpec(range.startBeatIndex),
                  endBeatIndex: axis.toSpec(range.endBeatIndex),
              };
    };
    const openRange = (target: TimelineMenuTarget) =>
        onOpenRange?.(specRangeOf(target));
    // A clip sends its stored spec range: the view axis folds spec beats 0 and 1 together, so a
    // converted show's timeline over [0, N) would come back as [1, N). Page boxes and dragged
    // ranges start on a flag or a timed beat, which `toSpec` maps back exactly.
    // The right-click menu has an entry for each command given: add, and delete on page boxes
    const addMarchersMenu:
        | TimelineAddMarchersMenu<TimelineMenuTarget>
        | undefined = (addSelectedMarchers || onDeletePageFlag) && {
        disabledReason: addSelectedMarchers?.disabledReason,
        ...(onDeletePageFlag
            ? {
                  onDeleteFlag: (pageId: string | number) =>
                      onDeletePageFlag(Number(pageId)),
              }
            : {}),
        onAdd:
            addSelectedMarchers?.onAdd &&
            ((target) => addSelectedMarchers.onAdd?.(specRangeOf(target))),
    };
    const commonProps = {
        model,
        positionBeat,
        livePositionBeat,
        isPlaying: playback.isPlaying,
        pixelsPerBeat,
        selection,
        selectedTarget: props.selectedTarget,
        className: props.className,
        onSeek: seekToBeat,
        onPlayingChange: playback.onPlayingChange,
        onStop: playback.onStop,
        onNavigate: playback.onNavigate,
        onPixelsPerBeatChange: setPixelsPerBeat,
        zoomFitted: props.zoomFitted,
        onZoomFittedChange: props.onZoomFittedChange,
        onSelectionChange: changeSelection,
        onCreateTrack: createTrack,
        addSelectedMarchers: addMarchersMenu,
        onAddPageFlag: props.onAddPageFlag,
        onOpenRange: onOpenRange && openRange,
        onTimelineRangeCommit: commitRange,
        onPlayFromStartOff: props.onPlayFromStartOff,
        onUnpinStart: props.onUnpinStart,
        transportSecondary: props.transportSecondary,
        transportViewControls: props.transportViewControls,
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
    TimelineSeekGesture,
    TimelineSeekOptions,
    TimelineSelection,
    TimelineTarget,
} from "./TimelineViewModel";

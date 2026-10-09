import type {
    ClipResizeBound,
    TimelineClipResizeCommands,
} from "./TimelineClipResize";
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
import { useLatestCallback } from "./useLatestCallback";
import { CollapsedTimeline, ExpandedTimeline } from "./TimelineVariants";
import type {
    TimelineAddMarchersMenu,
    TimelineMenuTarget,
    TimelineMoveCommands,
} from "./TimelineRangeMenu";
import type {
    TimelineActivitySpan,
    TimelineBeatRange,
    TimelineCreateTrackRequest,
    TimelineNavigation,
    TimelinePageFlagMove,
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
    /**
     * Where other timelines take every member of this one (the dashed spans, UI-4), in spec beats:
     * which timeline, and its part of the range (UI-14 review)
     */
    readonly overriddenBy?: readonly {
        readonly timelineId: number;
        readonly start: number;
        readonly end: number;
    }[];
    /** See `TimelineTrack.accessibleName` */
    readonly accessibleName?: string;
    /** See `TimelineTrack.description` */
    readonly description?: string;
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
     * seek sits in a scrub (UI-12 review); without it, the seek is one explicit action. During a
     * scrub it may return the beat the playhead landed on (`TimelineSeek`, `seekTimeline`).
     */
    readonly onSeek?: (
        beatIndex: number,
        options?: TimelineSeekOptions,
    ) => number | null | void;
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
    /** Resizing a clip by its edges (resize-move), in spec beats */
    readonly clipResize?: TimelineClipResizeCommands;
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
     * A clip's move commands (UI-14): **Edit move**, **Rename move…** and **Delete move**, from
     * its right-click menu, the selected clip's ⋯ button, and Delete on the focused clip. They get
     * the stored timeline's id (the clip's `linkId`).
     */
    readonly moveCommands?: TimelineMoveCommands;
    /**
     * Moving page flags by their grips (docs/timeline/research/move-page-flag), in spec beats:
     * where page `pageId`'s flag can go, and the move. Omit both where flags can't move.
     */
    readonly pageFlagMove?: TimelinePageFlagMove;
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
    ...(timeline.accessibleName
        ? { accessibleName: timeline.accessibleName }
        : {}),
    ...(timeline.description ? { description: timeline.description } : {}),
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
    // Every command below keeps its identity across renders (`useLatestCallback`), and the
    // objects are memoized, so the memoized parts of the timeline only re-render for what they show
    const { beats } = props;
    const seekToBeat = useLatestCallback(
        playback.onSeek
            ? (viewBeat: number, options?: TimelineSeekOptions) => {
                  if (beats.length === 0) return;
                  const target = Math.round(viewBeat);
                  const spec = clamp(axis.toSpec(target), 0, beats.length);
                  const landed = playback.onSeek?.(spec, options);
                  if (typeof landed !== "number") return;
                  // The beat sent comes back as sent: the view axis folds spec beats 0 and 1
                  // together, so mapping it back could move it
                  return landed === spec
                      ? target
                      : clamp(axis.toView(landed), 0, beatCount);
              }
            : undefined,
    );
    const { onSelectionChange } = props;
    const selection = useMemo(
        () => selectionToView(props.selection, axis),
        [props.selection, axis],
    );
    const changeSelection = useLatestCallback(
        onSelectionChange
            ? (next: TimelineSelection) =>
                  onSelectionChange(selectionToSpec(next, axis))
            : undefined,
    );
    const { onTimelineRangeCommit, onCreateTrack, timelines } = props;
    // A clip move keeps its length: send the spec range shifted by the move, so a clip whose start
    // was hidden with beat 0 moves by exactly the beats it was dragged
    const commitRange = useLatestCallback(
        onTimelineRangeCommit
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
            : undefined,
    );
    // A resize sends each edge's own change: an edge that didn't move keeps its stored spec beat;
    // the limits come back mapped onto the view axis
    const { clipResize } = props;
    const viewClipResize = useMemo(():
        | TimelineClipResizeCommands
        | undefined => {
        if (!clipResize) return undefined;
        const toView = (bound: ClipResizeBound): ClipResizeBound => ({
            ...bound,
            beat: axis.toView(bound.beat),
        });
        return {
            limits: async (trackId) => {
                const limits = await clipResize.limits(trackId);
                if (!limits) return null;
                return {
                    startEdge: {
                        min: toView(limits.startEdge.min),
                        max: toView(limits.startEdge.max),
                    },
                    endEdge: {
                        min: toView(limits.endEdge.min),
                        max: toView(limits.endEdge.max),
                    },
                    taken: limits.taken.map((t) => ({
                        ...t,
                        startBeatIndex: axis.toView(t.startBeatIndex),
                        endBeatIndex: axis.toView(t.endBeatIndex),
                    })),
                };
            },
            commit: (change) => {
                const input = timelines.find(
                    (timeline) => timeline.id === change.timelineId,
                );
                if (!input) return;
                // An edge that moved lands where it was drawn (`toSpec`), also for a move stored
                // from spec beat 0, which the view folds onto beat 1
                const edge = (spec: number, view: number) =>
                    view === axis.toView(spec) ? spec : axis.toSpec(view);
                clipResize.commit({
                    timelineId: change.timelineId,
                    startBeatIndex: edge(
                        input.startBeatIndex,
                        change.startBeatIndex,
                    ),
                    endBeatIndex: edge(input.endBeatIndex, change.endBeatIndex),
                });
            },
        };
    }, [clipResize, axis, timelines]);
    const createTrack = useLatestCallback(
        onCreateTrack
            ? (request: TimelineCreateTrackRequest) =>
                  onCreateTrack({
                      target: request.target,
                      range: {
                          startBeatIndex: axis.toSpec(
                              request.range.startBeatIndex,
                          ),
                          endBeatIndex: axis.toSpec(request.range.endBeatIndex),
                      },
                  })
            : undefined,
    );
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
    const openRange = useLatestCallback(
        onOpenRange
            ? (target: TimelineMenuTarget) => onOpenRange(specRangeOf(target))
            : undefined,
    );
    // A clip sends its stored spec range: the view axis folds spec beats 0 and 1 together, so a
    // converted show's timeline over [0, N) would come back as [1, N). Page boxes and dragged
    // ranges start on a flag or a timed beat, which `toSpec` maps back exactly.
    // The right-click menu has an entry for each command given: add, and delete on page boxes
    const deleteFlag = useLatestCallback(
        onDeletePageFlag
            ? (pageId: string | number) => onDeletePageFlag(Number(pageId))
            : undefined,
    );
    const addMarchers = useLatestCallback(
        addSelectedMarchers?.onAdd
            ? (target: TimelineMenuTarget) =>
                  addSelectedMarchers.onAdd?.(specRangeOf(target))
            : undefined,
    );
    const hasMarchersMenu = !!(addSelectedMarchers || onDeletePageFlag);
    const disabledReason = addSelectedMarchers?.disabledReason;
    const addMarchersMenu = useMemo<
        TimelineAddMarchersMenu<TimelineMenuTarget> | undefined
    >(
        () =>
            hasMarchersMenu
                ? {
                      disabledReason,
                      ...(deleteFlag ? { onDeleteFlag: deleteFlag } : {}),
                      onAdd: addMarchers,
                  }
                : undefined,
        [addMarchers, deleteFlag, disabledReason, hasMarchersMenu],
    );
    // A clip's track id to its stored timeline (`linkId`), for the move commands (UI-14)
    const { moveCommands } = props;
    const storedIdOf = (trackId: string | number) => {
        const linkId = timelines.find(
            (t) => String(t.id) === String(trackId),
        )?.linkId;
        return linkId === undefined ? null : Number(linkId);
    };
    const editMove = useLatestCallback(
        moveCommands
            ? (trackId: string | number) => {
                  const id = storedIdOf(trackId);
                  if (id !== null) moveCommands.onEdit(id);
              }
            : undefined,
    );
    const deleteMove = useLatestCallback(
        moveCommands
            ? (trackId: string | number) => {
                  const id = storedIdOf(trackId);
                  if (id !== null) moveCommands.onDelete(id);
              }
            : undefined,
    );
    const renameMove = useLatestCallback(
        moveCommands
            ? (trackId: string | number, name: string) => {
                  const id = storedIdOf(trackId);
                  if (id !== null) moveCommands.onRename(id, name);
              }
            : undefined,
    );
    const moveDisabledReason = moveCommands?.disabledReason;
    // Stable while only closures change, like the other commands, so memoized clips don't redraw
    const trackMoveCommands = useMemo(
        () =>
            editMove && deleteMove && renameMove
                ? {
                      disabledReason: moveDisabledReason,
                      onEdit: editMove,
                      onDelete: deleteMove,
                      onRename: renameMove,
                  }
                : undefined,
        [deleteMove, editMove, moveDisabledReason, renameMove],
    );
    // Page flags move in spec beats; the grips work in view beats
    const flagMove = props.pageFlagMove;
    const flagLimits = useLatestCallback(flagMove?.limits);
    const flagCommit = useLatestCallback(flagMove?.commit);
    const pageFlagMove = useMemo<TimelinePageFlagMove | undefined>(
        () =>
            flagLimits && flagCommit
                ? {
                      limits: async (pageId) => {
                          const limits = await flagLimits(pageId);
                          return limits
                              ? {
                                    ...limits,
                                    flag: axis.toView(limits.flag),
                                    min: axis.toView(limits.min),
                                    max: axis.toView(limits.max),
                                    holes: limits.holes?.map((h) => ({
                                        ...h,
                                        beat: axis.toView(h.beat),
                                    })),
                                }
                              : null;
                      },
                      commit: (pageId, beat) =>
                          flagCommit(pageId, axis.toSpec(beat)),
                  }
                : undefined,
        [axis, flagCommit, flagLimits],
    );
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
        onPlayingChange: useLatestCallback(playback.onPlayingChange),
        onStop: useLatestCallback(playback.onStop),
        onNavigate: useLatestCallback(playback.onNavigate),
        onPixelsPerBeatChange: useLatestCallback(setPixelsPerBeat),
        zoomFitted: props.zoomFitted,
        onZoomFittedChange: useLatestCallback(props.onZoomFittedChange),
        onSelectionChange: changeSelection,
        onCreateTrack: createTrack,
        addSelectedMarchers: addMarchersMenu,
        moveCommands: trackMoveCommands,
        onAddPageFlag: useLatestCallback(props.onAddPageFlag),
        pageFlagMove,
        onOpenRange: openRange,
        onTimelineRangeCommit: commitRange,
        clipResize: viewClipResize,
        onPlayFromStartOff: useLatestCallback(props.onPlayFromStartOff),
        onUnpinStart: useLatestCallback(props.onUnpinStart),
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

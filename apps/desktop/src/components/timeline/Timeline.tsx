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
    useRef,
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
import {
    BasicTimeline,
    CollapsedTimeline,
    ExpandedTimeline,
} from "./TimelineVariants";
import type { TimelineBand } from "./TimelineBand";
import type {
    TimelineKeyframe,
    TimelineKeyframeMenu,
} from "./TimelineKeyframes";
import type { SelectionHolds } from "@/timeline/timelineHoldBars";
import type {
    TimelineHoldEdgesInput,
    TimelineSplitHoldMenu,
} from "@/timeline/useHoldExtent";
import type { TimelineHoldEdges } from "./TimelineHoldEdges";
import type {
    TimelinePageMenu,
    TimelineSetAsShownMenu,
    TimelinePageCommandMenu,
    TimelineClearPageMenu,
    TimelineMenuEntry,
    TimelineMenuTarget,
    TimelineMoveCommands,
} from "./TimelineRangeMenu";
import type {
    TimelineClipPeel,
    TimelineMovePeel,
    TimelineMovePeelTarget,
    TimelinePeelTarget,
} from "./TimelineClipPeel";
import type {
    TimelineActivitySpan,
    TimelineBasicPoint,
    TimelineAppendAtPlayhead,
    TimelineBeatRange,
    TimelineNavigation,
    TimelinePageFlagMove,
    TimelineRangeChange,
    TimelineRangeCommitResult,
    TimelineSeekOptions,
    TimelineSelection,
    TimelineViewportExtent,
    TimelineTrack,
    TimelineTrackTargetType,
    TimelineViewModel,
    TimelineWaveform,
} from "./TimelineViewModel";

/** `basic` is Basic mode's page boxes with the music inside them (UI-19) */
export type TimelineMode = "expanded" | "collapsed" | "basic";

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
    /**
     * `label` is a stand-in ("Timeline 12") for a stored timeline without a name, for logs and
     * tests; the app words it when it shows it (`describeMoveClips`)
     */
    readonly unnamed?: boolean;
    readonly color: string;
    readonly startBeatIndex: number;
    readonly endBeatIndex: number;
    readonly legs: readonly TimelineLegInput[];
    readonly activitySpans: readonly TimelineActivitySpan[];
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
     * While playing, where Stop goes back to (UI-24): the resting playhead, which playing never
     * moves. The timeline marks it so you can see where playback came from.
     */
    readonly returnBeat?: number;
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
    /** Looping is on, so Play loops (UI-17): the button says so */
    readonly playLoops?: boolean;
    /** Shift+click on Play (Shift+Space): plays on from the playhead, or the loop once */
    readonly onPlayFromPlayhead?: () => void;
    /** Alt+click on Play (Alt+Space): plays on from the start flag (Expert, UI-26) */
    readonly onPlayOn?: () => void;
    /**
     * Tempo mode: Play is the only play action, and its tooltip names it like this
     * ("Play from the playhead", "Loop m. 11–12"): no Shift or Alt variants
     */
    readonly playOnly?: string;
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
    /**
     * A timeline that only navigates (Preview): no clips,
     * no window, no page flag or move edits, no ranges drawn. Page boxes and home still select
     * (`onSelectionChange`, to go to that page), and the ruler and the surface scrub. The editing
     * commands given are ignored
     */
    readonly readOnly?: boolean;
    /** A read-only timeline with no start flag drawn (Preview, which always plays on) */
    readonly hideStartFlag?: boolean;
    /** Lanes drawn in place of the clip rows, under the waveform (tempo mode's lanes) */
    readonly band?: TimelineBand;
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
    /** Zoom out and Zoom in buttons beside Fit, for mouse users (tempo mode) */
    readonly zoomButtons?: boolean;
    readonly selection?: TimelineSelection;
    readonly className?: string;
    readonly onSelectionChange?: (selection: TimelineSelection) => void;
    readonly onTimelineRangeCommit?: (
        change: TimelineRangeChange,
    ) => TimelineRangeCommitResult;
    /** Resizing a clip by its edges (resize-move), in spec beats */
    readonly clipResize?: TimelineClipResizeCommands;
    /** The loop (UI-17), spec beats; `null` or absent when looping is off */
    readonly loop?: TimelineBeatRange | null;
    /** A loop end dragged or stepped (UI-17), spec beats */
    readonly onLoopChange?: (loop: TimelineBeatRange) => void;
    /**
     * The right-click menu's page-box entries (UI-9), passed through to the surface. Separate
     * props (`onDeletePageFlag`, `setAsShown`, …) also fill this menu.
     */
    readonly pageMenu?: TimelinePageMenu;
    /**
     * UI-9 **Create page at playhead** on the paused playhead's right-click menu (P8.13's `useAddPageFlag`); omit
     * it where no page can be added (on a flag, at home, past the beats).
     */
    readonly onAddPageFlag?: () => void;
    /** **Create subset at playhead** in the playhead's right-click menu: the same page, as a subset (UI-9) */
    readonly onAddSubsetPage?: () => void;
    /** The names the playhead's menu shows, muted, after **Create page at playhead** and **Create subset at playhead** */
    readonly addPageNames?: { readonly page: string; readonly subset: string };
    /**
     * The page box menu's **Subset** switch (UI-9): sets page `pageId` to a subset page, or back
     * to a numbered one. Without it, the menu has no such entry.
     */
    readonly onSetPageSubset?: (pageId: number, subset: boolean) => void;
    /** **+ Add N-Count Page** at the paused playhead past the last page */
    readonly appendAtPlayhead?: TimelineAppendAtPlayhead;
    /** The beats Fit fits (rule 7, where playback stops), in spec beats; without it, every beat */
    readonly fitBeat?: number;
    /** The scroller's width in counts, so the owner leaves room past where playback stops */
    readonly onViewportExtent?: (extent: TimelineViewportExtent) => void;
    /** The page box menu's **Delete page** (UI-9 Deleting a flag), by page id */
    readonly onDeletePageFlag?: (pageId: number) => void;
    /** The page box menu's **Delete page and its moves**, by page id */
    readonly onDeletePageWithMoves?: (pageId: number) => void;
    /**
     * A clip's move commands (UI-14): **Edit move**, **Rename move…** and **Delete move**, from
     * its right-click menu, the selected clip's ⋯ button, and Delete on the focused clip. They get
     * the stored timeline's id (the clip's `linkId`).
     */
    readonly moveCommands?: TimelineMoveCommands;
    /** UI-25: dragging a clip down splits, onto a move or page box merges (by stored id) */
    readonly clipPeel?: TimelineMovePeel;
    /** UI-25: a page box's split entries, by page id, read when its menu opens */
    readonly pageMenuExtra?: (pageId: number) => readonly TimelineMenuEntry[];
    /**
     * Moving page flags by their grips (docs/timeline/research/move-page-flag), in spec beats:
     * where page `pageId`'s flag can go, and the move. Omit both where flags can't move.
     */
    readonly pageFlagMove?: TimelinePageFlagMove;
    /**
     * Double-clicking a page box or a clip: isolate that range's stored timeline. It gets the
     * range in spec beats (a clip's stored range).
     */
    readonly onOpenRange?: (
        range: TimelineBeatRange,
        /** UI-25: the clip's stored timeline, when a clip was double-clicked */
        timelineId?: number,
    ) => void;
    /** #303: where the selected marchers are Set, spec beats; none without a selection */
    readonly keyframes?: readonly TimelineKeyframe[];
    /** #306: a keyframe diamond's right-click Unset actions, by spec beat; without it, no menu */
    readonly keyframeMenu?: TimelineKeyframeMenu;
    /** #472, #477: the selected marchers' hold bars and departures, spec beats */
    readonly holds?: SelectionHolds;
    /** #475: the draggable ends of their Held bars, spec beats; without it, none */
    readonly holdEdges?: TimelineHoldEdgesInput;
    /** #475: **Split hold here** on a Held bar's right-click, spec beats */
    readonly splitHold?: TimelineSplitHoldMenu;
    /**
     * The moves a page box stands for, so they have no clip (`timelinesOffPages`), by track id.
     * One that gets a clip (its box was split, or a flag deleted) drops out of the page row
     * (`useClipDrops`)
     */
    readonly pageMoves?: ReadonlySet<string | number>;
    /** The page box menu's **Set as shown** (holds, fork #466) */
    readonly setAsShown?: TimelineSetAsShownMenu;
    /** **Hold from last keyframe** on a page box (holds, fork #472) */
    readonly holdFromPrevious?: TimelinePageCommandMenu;
    /** **Clear Page N** on a page box (#573) */
    readonly clearPage?: TimelineClearPageMenu;
    /** UI-19 Basic: the selected marchers' mid-page positions, spec beats */
    readonly basicPoints?: readonly TimelineBasicPoint[];
    /** UI-19 Basic: **Remove this count's position**, by its spec beat */
    readonly onRemoveBasicPoint?: (beat: number) => void;
    /** UI-19 Basic: per page id, how many marchers on it use Expert moves */
    readonly expertMarks?: ReadonlyMap<string | number, number>;
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

const NO_PEAKS: readonly number[] = [];

/** The injected waveform on `beatCount` beats: beats after the music (or with none) have no peaks */
const useTimelineWaveform = (beatCount: number): TimelineWaveform => {
    const injected = useContext(TimelineWaveformContext);
    return useMemo(() => {
        const peaks = injected?.peaksByBeat ?? [];
        if (injected && peaks.length === beatCount) return injected;
        return {
            peaksByBeat: Array.from(
                { length: beatCount },
                (_, i) => peaks[i] ?? NO_PEAKS,
            ),
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
              ...(selection.timelineId !== undefined
                  ? { timelineId: selection.timelineId }
                  : {}),
              ...(selection.onClip ? { onClip: true } : {}),
              ...(selection.pairedTimelineId !== undefined
                  ? { pairedTimelineId: selection.pairedTimelineId }
                  : {}),
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
              ...(selection.via ? { via: selection.via } : {}),
              ...(selection.timelineId !== undefined
                  ? { timelineId: selection.timelineId }
                  : {}),
              ...(selection.extend ? { extend: true } : {}),
          }
        : selection;

const NO_TIMELINES: readonly TimelineInput[] = [];

/** What a read-only timeline leaves out of its variant's props: the window and every edit */
const READ_ONLY_EDITS = {
    readOnly: true,
    selection: undefined,
    pageMenu: undefined,
    moveCommands: undefined,
    onAddPageFlag: undefined,
    onAddSubsetPage: undefined,
    addPageNames: undefined,
    appendAtPlayhead: undefined,
    pageFlagMove: undefined,
    onOpenRange: undefined,
    onTimelineRangeCommit: undefined,
    clipResize: undefined,
    onUnpinStart: undefined,
    holdMarks: undefined,
    holdEdges: undefined,
    pageMoves: undefined,
    basicPoints: undefined,
    onRemoveBasicPoint: undefined,
    expertMarks: undefined,
} as const;

/** Where a read-only timeline draws the start flag: the window's start, or the flag left behind */
const readOnlyStartFlag = (selection: TimelineSelection | undefined) =>
    selection?.kind === "range"
        ? (selection.startFlagBeatIndex ?? selection.range.startBeatIndex)
        : undefined;

export function Timeline(props: TimelineProps) {
    const { readOnly = false } = props;
    const timelines = readOnly ? NO_TIMELINES : props.timelines;
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
                timelines,
                waveform,
                axis,
            }),
        [axis, props.beats, props.measures, props.pages, timelines, waveform],
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
    const returnBeat =
        playback.isPlaying && playback.returnBeat !== undefined
            ? clamp(axis.toView(playback.returnBeat), 0, model.beatCount)
            : undefined;
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
    // UI-17: the loop, mapped onto the view axis and back
    const { loop } = props;
    const viewLoop = useMemo(
        () =>
            loop
                ? {
                      startBeatIndex: axis.toView(loop.startBeatIndex),
                      endBeatIndex: axis.toView(loop.endBeatIndex),
                  }
                : null,
        [loop, axis],
    );
    const changeLoop = useLatestCallback(
        props.onLoopChange
            ? (next: TimelineBeatRange) =>
                  props.onLoopChange?.({
                      startBeatIndex: axis.toSpec(next.startBeatIndex),
                      endBeatIndex: axis.toSpec(next.endBeatIndex),
                  })
            : undefined,
    );
    const { onTimelineRangeCommit } = props;
    // A clip move keeps its length: send the spec range shifted by the move, so a clip whose start
    // was hidden with beat 0 moves by exactly the beats it was dragged
    const commitRange = useLatestCallback(
        onTimelineRangeCommit
            ? (change: TimelineRangeChange) => {
                  const input = timelines.find(
                      (timeline) => timeline.id === change.timelineId,
                  );
                  if (!input) return Promise.resolve(false);
                  const shift =
                      change.startBeatIndex - axis.toView(input.startBeatIndex);
                  return onTimelineRangeCommit({
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
                if (!input) return Promise.resolve(false);
                // An edge that moved lands where it was drawn (`toSpec`), also for a move stored
                // from spec beat 0, which the view folds onto beat 1
                const edge = (spec: number, view: number) =>
                    view === axis.toView(spec) ? spec : axis.toSpec(view);
                return clipResize.commit({
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
    const {
        pageMenu,
        onDeletePageFlag,
        onDeletePageWithMoves,
        onSetPageSubset,
        onOpenRange,
        setAsShown,
        holdFromPrevious,
        clearPage,
        pageMenuExtra,
        splitHold,
    } = props;
    // A clip's stored spec range, else the view range mapped back
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
            ? (target: TimelineMenuTarget) => {
                  const track =
                      target.trackId === undefined
                          ? undefined
                          : timelines.find(
                                (t) => String(t.id) === target.trackId,
                            );
                  onOpenRange(
                      specRangeOf(target),
                      track?.linkId === undefined
                          ? undefined
                          : Number(track.linkId),
                  );
              }
            : undefined,
    );
    // A clip sends its stored spec range: the view axis folds spec beats 0 and 1 together, so a
    // converted show's timeline over [0, N) would come back as [1, N). Page boxes and dragged
    // ranges start on a flag or a timed beat, which `toSpec` maps back exactly.
    // The right-click menu has an entry for each page-box command given
    const deleteFlag = useLatestCallback(
        onDeletePageFlag
            ? (pageId: string | number) => onDeletePageFlag(Number(pageId))
            : undefined,
    );
    const deleteWithMoves = useLatestCallback(
        onDeletePageWithMoves
            ? (pageId: string | number) => onDeletePageWithMoves(Number(pageId))
            : undefined,
    );
    const setSubset = useLatestCallback(
        onSetPageSubset
            ? (pageId: string | number, subset: boolean) =>
                  onSetPageSubset(Number(pageId), subset)
            : undefined,
    );
    const pagesRef = useRef(props.pages);
    pagesRef.current = props.pages;
    // Read when the menu opens, so the toggle shows the page's subset state now
    const subsetMenu = useMemo(
        () =>
            setSubset
                ? {
                      isSubset: (pageId: string | number) =>
                          pagesRef.current.find(
                              (p) => String(p.id) === String(pageId),
                          )?.isSubset ?? false,
                      onSet: setSubset,
                  }
                : undefined,
        [setSubset],
    );
    const pageExtra = useLatestCallback(
        pageMenuExtra
            ? (pageId: string | number) => pageMenuExtra(Number(pageId))
            : undefined,
    );
    // #475: Split hold here at the right-clicked count, mapped back to spec beats
    const viewSplitHold = useMemo(
        () =>
            splitHold && {
                offeredAt: (beat: number) =>
                    splitHold.offeredAt(axis.toSpec(beat)),
                onSplit: (beat: number) => splitHold.onSplit(axis.toSpec(beat)),
            },
        [axis, splitHold],
    );
    const hasPageMenu = !!(
        pageMenuExtra ||
        splitHold ||
        pageMenu ||
        onDeletePageFlag ||
        onDeletePageWithMoves ||
        onSetPageSubset ||
        setAsShown ||
        holdFromPrevious ||
        clearPage
    );
    const pageBoxMenu = useMemo<TimelinePageMenu | undefined>(
        () =>
            hasPageMenu
                ? {
                      ...(deleteFlag ? { onDeleteFlag: deleteFlag } : {}),
                      ...(deleteWithMoves
                          ? { onDeleteWithMoves: deleteWithMoves }
                          : {}),
                      ...(setAsShown ? { setAsShown } : {}),
                      ...(holdFromPrevious ? { holdFromPrevious } : {}),
                      ...(clearPage ? { clearPage } : {}),
                      ...(subsetMenu ? { subset: subsetMenu } : {}),
                      ...(pageExtra ? { extraFor: pageExtra } : {}),
                      ...(viewSplitHold ? { splitHold: viewSplitHold } : {}),
                  }
                : undefined,
        [
            viewSplitHold,
            deleteFlag,
            deleteWithMoves,
            hasPageMenu,
            setAsShown,
            holdFromPrevious,
            clearPage,
            subsetMenu,
            pageExtra,
        ],
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
    const selectMoveMarchers = useLatestCallback(
        moveCommands?.onSelectMarchers
            ? (trackId: string | number) => {
                  const id = storedIdOf(trackId);
                  if (id !== null) moveCommands.onSelectMarchers!(id);
              }
            : undefined,
    );
    // UI-27: Split at playhead, by stored id too; its reason is read as the menu opens
    const splitMove = useLatestCallback(
        moveCommands?.onSplit
            ? (trackId: string | number) => {
                  const id = storedIdOf(trackId);
                  if (id !== null) moveCommands.onSplit!(id);
              }
            : undefined,
    );
    const splitMoveReason = useLatestCallback(
        moveCommands?.splitDisabledReason
            ? (trackId: string | number): string | null => {
                  const id = storedIdOf(trackId);
                  return id === null
                      ? null
                      : moveCommands.splitDisabledReason!(id);
              }
            : undefined,
    );
    const moveDisabledReason = moveCommands?.disabledReason;
    const moveExtraFor = useLatestCallback(
        moveCommands?.extraFor
            ? (trackId: string | number) => {
                  const id = storedIdOf(trackId);
                  return id === null ? [] : moveCommands.extraFor!(id);
              }
            : undefined,
    );
    // Stable while only closures change, like the other commands, so memoized clips don't redraw
    const trackMoveCommands = useMemo(
        () =>
            editMove && deleteMove && renameMove
                ? {
                      disabledReason: moveDisabledReason,
                      onEdit: editMove,
                      onDelete: deleteMove,
                      onRename: renameMove,
                      ...(selectMoveMarchers
                          ? { onSelectMarchers: selectMoveMarchers }
                          : {}),
                      ...(splitMove ? { onSplit: splitMove } : {}),
                      ...(splitMoveReason
                          ? { splitDisabledReason: splitMoveReason }
                          : {}),
                      ...(moveExtraFor ? { extraFor: moveExtraFor } : {}),
                  }
                : undefined,
        [
            deleteMove,
            editMove,
            moveDisabledReason,
            renameMove,
            selectMoveMarchers,
            splitMove,
            splitMoveReason,
            moveExtraFor,
        ],
    );
    // UI-25: the drag-out and drag-to-merge gesture, from track ids to stored ones
    const { clipPeel } = props;
    const peelTarget = (
        target: TimelinePeelTarget,
    ): TimelineMovePeelTarget | null => {
        if ("pageId" in target) return { pageId: Number(target.pageId) };
        const id = storedIdOf(target.trackId);
        return id === null ? null : { timelineId: id };
    };
    const peelSplit = useLatestCallback(clipPeel?.split);
    const peelMerge = useLatestCallback(clipPeel?.merge);
    const peelOnSplit = useLatestCallback(clipPeel?.onSplit);
    const peelOnMerge = useLatestCallback(clipPeel?.onMerge);
    const trackPeel = useMemo<TimelineClipPeel | undefined>(
        () =>
            peelSplit && peelMerge && peelOnSplit && peelOnMerge
                ? {
                      split: (trackId) => {
                          const id = storedIdOf(trackId);
                          return id === null ? null : peelSplit(id);
                      },
                      merge: (trackId, target) => {
                          const id = storedIdOf(trackId);
                          const to = peelTarget(target);
                          return id === null || to === null
                              ? null
                              : peelMerge(id, to);
                      },
                      onSplit: (trackId) => {
                          const id = storedIdOf(trackId);
                          if (id !== null) peelOnSplit(id);
                      },
                      onMerge: (trackId, target) => {
                          const id = storedIdOf(trackId);
                          const to = peelTarget(target);
                          if (id !== null && to !== null) peelOnMerge(id, to);
                      },
                  }
                : undefined,
        // storedIdOf reads `timelines`, which the callbacks see through it
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [peelSplit, peelMerge, peelOnSplit, peelOnMerge, timelines],
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
    // UI-19 Basic: mid-page positions on the view axis, and back
    const { basicPoints, onRemoveBasicPoint } = props;
    const viewBasicPoints = useMemo(
        () =>
            basicPoints?.map((point) => ({
                ...point,
                beat: axis.toView(point.beat),
            })),
        [axis, basicPoints],
    );
    const removeBasicPoint = useLatestCallback(
        onRemoveBasicPoint
            ? (viewBeat: number) => onRemoveBasicPoint(axis.toSpec(viewBeat))
            : undefined,
    );
    // #303: the selection's keyframes on the view axis
    const { keyframes } = props;
    const viewKeyframes = useMemo(
        () =>
            keyframes?.map((keyframe) => ({
                ...keyframe,
                beat: axis.toView(keyframe.beat),
            })),
        [axis, keyframes],
    );
    // #472, #477: the selection's hold bars and departures on the view axis
    const { holds } = props;
    const viewHolds = useMemo<SelectionHolds | undefined>(
        () =>
            holds && {
                bars: holds.bars
                    .map((bar) => ({
                        ...bar,
                        start: axis.toView(bar.start),
                        end: axis.toView(bar.end),
                    }))
                    // The lead-in before page 1's first count has no width on the view axis
                    .filter((bar) => bar.end > bar.start),
                departures: holds.departures.map((departure) => ({
                    ...departure,
                    beat: axis.toView(departure.beat),
                })),
            },
        [axis, holds],
    );
    // #475: the Held bars' draggable ends on the view axis; their drags go back in spec beats
    const { holdEdges } = props;
    const viewHoldEdges = useMemo<TimelineHoldEdges | undefined>(() => {
        if (!holdEdges) return undefined;
        const toView = (beat: number) => axis.toView(beat);
        const dragOf = (index: number, beat: number, from?: number) => {
            const handle = holdEdges.handles[index]!;
            return {
                from: from === undefined ? handle.beat : axis.toSpec(from),
                to: axis.toSpec(beat),
                marcherIds: handle.marcherIds,
            };
        };
        return {
            handles: holdEdges.handles.map((handle) => ({
                ...handle,
                beat: toView(handle.beat),
                limits: {
                    ...handle.limits,
                    from: toView(handle.limits.from),
                    min: toView(handle.limits.min),
                    max: toView(handle.limits.max),
                },
            })),
            onPreview: (index, beat) =>
                holdEdges.preview(beat === null ? null : dragOf(index, beat)),
            onCommit: (index, beat, from) =>
                holdEdges.commit(dragOf(index, beat, from)),
        };
    }, [axis, holdEdges]);
    // #306: their menu acts on spec beats
    const { keyframeMenu } = props;
    const viewKeyframeMenu = useMemo<TimelineKeyframeMenu | undefined>(
        () =>
            keyframeMenu && {
                stateFor: (beat) => keyframeMenu.stateFor(axis.toSpec(beat)),
                onUnset: (beat) => keyframeMenu.onUnset(axis.toSpec(beat)),
                onUnsetAndFollowing: (beat) =>
                    keyframeMenu.onUnsetAndFollowing(axis.toSpec(beat)),
                // Its light is in spec beats, as the hold bars it lights are
                onFollowingPreview: keyframeMenu.onFollowingPreview,
            },
        [axis, keyframeMenu],
    );
    const commonProps = {
        model,
        positionBeat,
        livePositionBeat,
        returnBeat,
        isPlaying: playback.isPlaying,
        pixelsPerBeat,
        selection,
        className: props.className,
        onSeek: seekToBeat,
        onPlayingChange: useLatestCallback(playback.onPlayingChange),
        playLoops: playback.playLoops,
        onPlayFromPlayhead: useLatestCallback(playback.onPlayFromPlayhead),
        onPlayOn: useLatestCallback(playback.onPlayOn),
        playOnly: playback.playOnly,
        onNavigate: useLatestCallback(playback.onNavigate),
        onPixelsPerBeatChange: useLatestCallback(setPixelsPerBeat),
        zoomFitted: props.zoomFitted,
        onZoomFittedChange: useLatestCallback(props.onZoomFittedChange),
        zoomButtons: props.zoomButtons,
        onSelectionChange: changeSelection,
        pageMenu: pageBoxMenu,
        moveCommands: trackMoveCommands,
        clipPeel: trackPeel,
        onAddPageFlag: useLatestCallback(props.onAddPageFlag),
        onAddSubsetPage: useLatestCallback(props.onAddSubsetPage),
        addPageNames: props.addPageNames,
        pageFlagMove,
        appendAtPlayhead: props.appendAtPlayhead,
        fitBeatCount:
            props.fitBeat === undefined
                ? undefined
                : Math.min(axis.toView(props.fitBeat), axis.beatCount),
        onViewportExtent: useLatestCallback(props.onViewportExtent),
        onOpenRange: openRange,
        onTimelineRangeCommit: commitRange,
        clipResize: viewClipResize,
        loop: viewLoop,
        onLoopChange: changeLoop,
        transportSecondary: props.transportSecondary,
        transportViewControls: props.transportViewControls,
        showTransport: props.showTransport ?? true,
        transportClock: props.transportClock,
        transportAccessories: props.transportAccessories,
        keyframes: viewKeyframes,
        keyframeMenu: viewKeyframeMenu,
        holds: viewHolds,
        holdEdges: viewHoldEdges,
        pageMoves: props.pageMoves,
        basicPoints: viewBasicPoints,
        onRemoveBasicPoint: removeBasicPoint,
        expertMarks: props.expertMarks,
    };

    // Read-only (Preview): no window and no edits; page boxes still select, to go to their page
    // Its start flag is still drawn, where Play starts from
    const shownProps = readOnly
        ? {
              ...commonProps,
              ...READ_ONLY_EDITS,
              startFlagBeat: props.hideStartFlag
                  ? undefined
                  : readOnlyStartFlag(selection),
              band: props.band,
          }
        : { ...commonProps, band: props.band };

    return props.mode === "basic" ? (
        <BasicTimeline {...shownProps} />
    ) : props.mode === "expanded" ? (
        <ExpandedTimeline {...shownProps} />
    ) : (
        <CollapsedTimeline {...shownProps} />
    );
}

export type {
    TimelineActivitySpan,
    TimelineAppendAtPlayhead,
    TimelineBeatRange,
    TimelineSeekGesture,
    TimelineSeekOptions,
    TimelineSelection,
    TimelineTarget,
} from "./TimelineViewModel";

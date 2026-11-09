import clsx from "clsx";
import { TEMPO_BAND, useTempoModeStore } from "@/tempo/TempoBand";
import { TempoModeButton } from "@/tempo/TempoModeButton";
import { toast } from "sonner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTolgee, useTranslate } from "@tolgee/react";
import {
    pageFlagMoveLimits,
    type AddedPageFlag,
    type PageFlagMoveBlock,
} from "@/db-functions/pageFlags";
import {
    deletePageFlagsMutationOptions,
    deletePagesWithMovesMutationOptions,
    movePageFlagMutationOptions,
    useAddPageFlag,
} from "@/hooks/queries/usePageFlags";
import { allMarchersQueryOptions } from "@/hooks/queries/useMarchers";
import { updatePagesMutationOptions } from "@/hooks/queries/usePages";
import { usePerformHistoryAction } from "@/hooks/queries/useHistory";
import { useTimingObjects } from "@/hooks";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { db } from "@/global/database/db";
import {
    displayedBeat,
    isolatedTimeline,
    resolveStoredTimeline,
    selectedStoredTimeline,
    selectionIsRange,
    useTimelineSelectionStore,
    type TimelineEditSelection,
    type TimelineIsolation,
} from "@/stores/TimelineSelectionStore";
import {
    pageFlags,
    selectionOfPage,
    type FlagPage,
} from "@/timeline/timelinePlayhead";
import { useTimelineTracksState } from "@/timeline/useTimelineTracks";
import { musicEndBeat } from "@/timeline/countsPastEnd";
import { AudioClock } from "./Clock";
import {
    TimelineCompactButton,
    TimelineLoopButton,
    TimelineSoundButton,
    TimelineSpeedButton,
} from "./TimelineControls";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import {
    Timeline,
    TimelineWaveformProvider,
    type TimelineInput,
    type TimelineProps,
    type TimelineSelection,
} from "./Timeline";
import {
    peaksByBeat,
    useAudioEnvelopeStore,
} from "@/timeline/timelineWaveform";
import {
    createTimelineBeatAxis,
    isPageTimeline,
    pageTimelineIds,
} from "@/timeline/timelineViewModel";
import {
    useMusicEndSeconds,
    usePlaybackStopBeat,
} from "@/timeline/usePlaybackStopBeat";
import type { CountGrid } from "@/timeline/countGrid";
import { beatsThrough, measuresThrough } from "@/timeline/endlessTimeline";
import {
    moveCommandBlocker,
    useMoveCommands,
    useTimelineCommands,
    moveAtPlayhead,
    splitMoveBlocker,
} from "./useTimelineCommands";
import { useTimelineClipResize } from "./useTimelineClipResize";
import { useActionHandler } from "@/shortcuts/useActionHandler";
import { useSplitMergeActions, useSplitMergeMoves } from "./useSplitMergeMoves";
import { useTimelinePlayback } from "./useTimelinePlayback";
import { jumpTimelinePlayback } from "@/timeline/timelineTransport";
import { useSelectionKeyframes } from "@/timeline/useSelectionKeyframes";
import { useSelectionHolds } from "@/timeline/useHeldMarks";
import { useHoldExtentCommands } from "@/timeline/useHoldExtent";
import { marcherNamesText } from "@/timeline/timelineKeepLater";
import tolgee from "@/global/singletons/Tolgee";
import type { TimelineKeyframe } from "./TimelineKeyframes";
import { useKeyframeUnsetMenu } from "@/timeline/timelineUnset";
import { useMarcherNameOf } from "@/timeline/useKeepLaterPages";
import { useHoldCommands } from "@/timeline/useHoldCommands";
import { clearPageMenu } from "@/timeline/timelineClearPage";
import { describeMoveClips } from "./moveClipText";
import { useClearLeftoverMoveSelection } from "./useMoveMemberSelection";
import { useIsBasicMode } from "@/stores/EditorModeStore";
import { useBasicLocksStore } from "@/timeline/basicLocks";
import { useBasicPoints } from "./useBasicPoints";
import type Page from "@/global/classes/Page";

const NO_WAVEFORM = { peaksByBeat: [] };
const NO_CLIPS: TimelineInput[] = [];

/**
 * Basic's marks on the page boxes (UI-19): the selected marchers' mid-page positions, with
 * **Remove this count's position**, and the Expert mark where marchers are locked.
 */
function useBasicTimelineExtras(pages: readonly Page[]) {
    const { points, removePoint } = useBasicPoints();
    const locked = useBasicLocksStore((s) => s.locked);
    const boxes = useBasicLocksStore((s) => s.boxes);
    return useMemo(() => {
        const names = new Map(
            pageFlags(pages).flatMap((f) =>
                f.range
                    ? [[`${f.range.start}:${f.range.end}`, f.page] as const]
                    : [],
            ),
        );
        const expertMarks = new Map<number, number>();
        boxes.forEach((box, index) => {
            const count = locked.get(index)?.size ?? 0;
            const page = names.get(`${box.start}:${box.end}`);
            if (count > 0 && page) expertMarks.set(page.id, count);
        });
        return {
            basicPoints: points.map((point) => ({
                beat: point.beat,
                count: point.beat - point.box.start,
                page:
                    names.get(`${point.box.start}:${point.box.end}`)?.name ??
                    "",
            })),
            onRemoveBasicPoint: (beat: number) => {
                const point = points.find((p) => p.beat === beat);
                if (point) removePoint(point);
            },
            expertMarks,
        };
    }, [pages, points, removePoint, locked, boxes]);
}

// The transport's controls read their own state: the same elements every render, so the
// memoized transport doesn't re-render for them
const SOUND_BUTTON = <TimelineSoundButton />;
const LOOP_BUTTONS = (
    <>
        <TimelineLoopButton />
        <TimelineSpeedButton />
    </>
);
const SPEED_BUTTON = <TimelineSpeedButton />;
/**
 * Tempo mode: the Tempo button leads the transport's view controls. In tempo mode
 * it's the only one: Play loops the selected measures, so no Loop button
 */
const TEMPO_VIEW_CONTROLS = <TempoModeButton />;
const BASIC_VIEW_CONTROLS = <TempoModeButton />;
const EXPERT_VIEW_CONTROLS = (
    <>
        <TempoModeButton />
        <TimelineCompactButton />
    </>
);

/** The store's selection as the timeline draws it (spec beats; `Timeline` maps them to its axis) */
export const toTimelineSelection = (
    selection: TimelineEditSelection,
    startBeat?: number,
    /** UI-25: the stored timeline the window resolves to, and whether it is a move's clip */
    resolved?: { readonly id: number; readonly onClip: boolean } | null,
    /** UI-25: a second move selected beside it (Shift+click) */
    pairedTimelineId: number | null = null,
): TimelineSelection =>
    selection.kind === "range"
        ? {
              kind: "range",
              range: {
                  startBeatIndex: selection.start,
                  endBeatIndex: selection.end,
              },
              ...(resolved ? { timelineId: resolved.id } : {}),
              ...(resolved?.onClip ? { onClip: true } : {}),
              ...(pairedTimelineId !== null ? { pairedTimelineId } : {}),
              // UI-10: with P on or before S the window falls back, but the flag stays where it is
              ...(startBeat !== undefined && startBeat !== selection.start
                  ? { startFlagBeatIndex: startBeat }
                  : {}),
          }
        : selection.kind === "home"
          ? { kind: "home" }
          : null;

/**
 * The timeline (ui.md, from the 0.2 branch). It takes the file's real beats, pages and measures, and plays through the app's existing audio clock. Its
 * selection is `useTimelineSelectionStore`'s (UI-9): the initial page box selects home, a page box
 * or a dragged range selects that range, and each seeks (home to beat 0, a range to its end).
 * **Create page at playhead** on the free paused playhead's right-click menu adds a page flag there and selects
 * the new page; a page box's right-click menu deletes its flag (P8.13's writes, wired by P8.15), or the page and its
 * moves (defined coordinates, owner decision 3). Double-clicking
 * a page box or clip isolates its stored timeline (docs/timeline/research/ownership/09-isolation.md).
 * A clip is a move: its menu, its ⋯ button and Delete edit, rename and delete it (UI-14).
 */
export default function TimelineModePanel() {
    const { beats, pages, measures, countGrid } = useTimingObjects()!;
    // UI-19: Basic is this timeline with its page boxes holding the music, and none of the
    // Expert parts (clips, the loop, isolation, moves): docs/timeline/research/basic-mode
    // Tempo mode: the timeline shows the tempo lanes in place of the clips, in Basic too
    const tempoMode = useTempoModeStore((s) => s.on);
    const basic = useIsBasicMode() && !tempoMode;
    const basicExtras = useBasicTimelineExtras(pages);
    const compact = useUiSettingsStore((s) => s.uiSettings.timelineCompact);
    // UI-12: the waveform lane, from the audio player's envelope, per beat on the view axis, in
    // full: past the stored counts on the counts that go on (endless counts), to the music's end.
    // Hidden in settings, the lane goes away as it does with no audio.
    const envelope = useAudioEnvelopeStore((s) => s.envelope);
    const waveformHidden = useUiSettingsStore(
        (s) => s.uiSettings.timelineWaveformStyle === "hidden",
    );
    const musicEnd = useMusicEndSeconds();
    const waveform = useMemo(() => {
        // Tempo mode draws the music in its own lane: one waveform, not two
        if (!envelope || waveformHidden || tempoMode) return null;
        const through =
            musicEnd === null ? 0 : musicEndBeat(countGrid, musicEnd);
        const peaks = peaksByBeat(
            envelope,
            beatsThrough(countGrid, beats, through),
            createTimelineBeatAxis(beats).offset,
        );
        // A show with no audio plays a silent placeholder: nothing to draw, so in Basic, where the
        // lane sets the pane's height, it counts as no waveform (UI-19)
        if (basic && !peaks.some((beat) => beat.some((peak) => peak > 0)))
            return null;
        return { peaksByBeat: peaks };
    }, [
        envelope,
        beats,
        countGrid,
        musicEnd,
        waveformHidden,
        basic,
        tempoMode,
    ]);
    const zoomFitted = useUiSettingsStore(
        (s) => s.uiSettings.timelineZoomFitted,
    );
    const setZoomFitted = useUiSettingsStore((s) => s.setTimelineZoomFitted);
    const { isPlaying } = useIsPlaying()!;
    const selectedMarchers = useSelectedMarchers()?.selectedMarchers;
    const selectedIdsKey = (selectedMarchers ?? []).map((m) => m.id).join(",");
    const selectedMarcherIds = useMemo(
        () =>
            new Set(
                selectedIdsKey === ""
                    ? []
                    : selectedIdsKey.split(",").map(Number),
            ),
        [selectedIdsKey],
    );
    const selectedIdList = useMemo(
        () => [...selectedMarcherIds],
        [selectedMarcherIds],
    );
    const keepNameOf = useMarcherNameOf(selectedMarchers);
    // #303: where the selected marchers are Set, as keyframes on the timeline, each naming who
    const selectionKeyframes = useSelectionKeyframes(selectedIdList);
    // Words built here with tolgee.t are built again when the language changes
    const language = useTolgee(["language"]).getLanguage();
    const keyframes = useMemo<readonly TimelineKeyframe[]>(
        () =>
            selectionKeyframes.map((keyframe) => ({
                ...keyframe,
                names: marcherNamesText(
                    keyframe.marcherIds,
                    keepNameOf,
                    (key, defaultValue, params) =>
                        tolgee.t(key, defaultValue, params),
                ),
            })),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- language: the words are tolgee.t's
        [selectionKeyframes, keepNameOf, language],
    );
    // #472, #477: the selected marchers' holds, as bars from their arrivals' diamonds to their
    // departures: Held solid, Not defined dashed, lit where a drag or a follow-back would carry
    const holds = useSelectionHolds(selectedIdList);
    // #475: drag a Held bar's end or start, and Split hold here on its right-click
    const { holdEdges, splitHold } = useHoldExtentCommands(
        selectedIdList,
        !isPlaying,
    );
    // #306: a diamond's right-click Unset actions at its count
    const keyframeMenu = useKeyframeUnsetMenu(selectedIdList, isPlaying);
    // Holds: Define as shown (#466) and Hold from last keyframe (#472) on a page box, the same
    // commands the timelineDefineAsShown and timelineHoldFromPrevious actions run on the current page
    const {
        defineAsShown: setAsShown,
        holdFromPrevious,
        entriesOn,
    } = useHoldCommands(pages, selectedIdList, keepNameOf);
    // #573: Clear Page N, for the selected marchers or every performer when none is selected;
    // ticked when every selected marcher is already Not defined on the page (`entriesOn`)
    const { data: performers } = useQuery(allMarchersQueryOptions());
    const clearPage = useMemo(
        () =>
            clearPageMenu({
                pages,
                selectedIds: selectedIdList,
                performerIds: (performers ?? []).map((m) => m.id),
                entryOn: (pageId) => entriesOn(pageId)?.clearThisPage,
            }),
        [pages, selectedIdList, performers, entriesOn],
    );
    const { tracks: timelines, current: tracksCurrent } =
        useTimelineTracksState({
            database: db,
            enabled: true,
        });
    // A page flag move changes the pages and the tracks, and the pages can arrive first: matched
    // against the new boxes, the old page timelines would flash as clips. Until the tracks catch
    // up they're matched against the boxes they were built with
    const clipBoxPages = useHeldWhileStale(pages, tracksCurrent);
    // UI-10: a page box already stands for its page timeline, so only the others get a clip.
    // UI-14: each is a move, labelled by its name ("Move 2" since it was made), named for
    // screen readers in counts, and saying why it is dashed where it is (`describeMoveClips`)
    const storedTimelines = useTimelineSelectionStore((s) => s.storedTimelines);
    const pageBoxes = useTimelineSelectionStore((s) => s.pageBoxes);
    const clipTimelines = useMemo(
        () => timelinesOffPages(timelines, clipBoxPages),
        [timelines, clipBoxPages],
    );
    // The others: one that gets a clip (its box split, or a flag deleted) drops out of the page row
    const pageMoves = useMemo(() => {
        const clipped = new Set(clipTimelines);
        return new Set(
            timelines.flatMap((t) => (clipped.has(t) ? [] : [t.id])),
        );
    }, [timelines, clipTimelines]);
    const { clips: offPage } = useMemo(
        () =>
            describeMoveClips({
                clips: clipTimelines,
                storedTimelines: storedTimelines ?? [],
                pageBoxes,
                pages,
            }),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- language: the words are tolgee.t's
        [clipTimelines, pages, storedTimelines, pageBoxes, language],
    );
    // UI-14 round-2 review: a "Select marchers" selection doesn't follow you to another move
    useClearLeftoverMoveSelection();
    const commands = useTimelineCommands({
        database: db,
        timelines,
    });
    // UI-25: a move can be split, and moves merged (not in Basic, which gets no clips)
    const splitMerge = useSplitMergeMoves({
        database: db,
        selectedMarcherIds,
        isPlaying,
        pages,
    });
    useSplitMergeActions(splitMerge, !basic, selectedMarcherIds, isPlaying);
    // UI-14: a clip is a move; it can be edited, renamed and deleted
    const moves = useMoveCommands(db);
    const moveCommands = useMemo(
        () => ({
            disabledReason: moveCommandBlocker(isPlaying),
            extraFor: splitMerge.moveExtraFor,
            onEdit: (id: number) => {
                if (!isPlaying) moves.editMove(id);
            },
            onRename: (id: number, name: string) =>
                void moves.renameMove(id, name),
            onDelete: (id: number) => {
                if (!isPlaying) void moves.deleteMove(id);
            },
            onSelectMarchers: (id: number) => void moves.selectMarchers(id),
            // UI-27: two moves that meet at the playhead
            onSplit: (id: number) =>
                void moves.splitMoveAtPlayhead(id, isPlaying),
            splitDisabledReason: (id: number) => {
                const s = useTimelineSelectionStore.getState();
                return splitMoveBlocker(
                    s.storedTimelines?.find((t) => t.id === id),
                    s.playheadBeat,
                    isPlaying,
                );
            },
        }),
        [isPlaying, moves, splitMerge],
    );
    // UI-27: ⌘K's Split at playhead acts on the move the playhead is inside (Expert only: Basic
    // has no moves to split, its + splits the page's moves at a new flag). Greyed out while
    // playing, as the menus' entry is
    useActionHandler(
        "timelineSplitMoveAtPlayhead",
        () => {
            const target = moveAtPlayhead(useTimelineSelectionStore.getState());
            if (typeof target === "string") {
                toast.error(target, { id: "timeline-split-move" });
                return;
            }
            void moves.splitMoveAtPlayhead(target.id, isPlaying);
        },
        { enabled: !basic && !isPlaying },
    );
    const clipResize = useTimelineClipResize({ database: db, timelines });
    const queryClient = useQueryClient();
    // Moving a page flag (research/move-page-flag): the playhead and start flag on it go with it
    const { mutateAsync: movePageFlag } = useMutation(
        movePageFlagMutationOptions(queryClient, ({ from, to }) =>
            useTimelineSelectionStore.getState().followPageFlagMove(from, to),
        ),
    );
    const isolated = useTimelineSelectionStore((s) => s.isolation !== null);
    const latestBlockText = useRef({ pages, timelines });
    latestBlockText.current = { pages, timelines };
    // Flags don't move while playing or isolated (cases 21, 22)
    const pageFlagMove = useMemo<TimelineProps["pageFlagMove"]>(
        () =>
            isPlaying || isolated
                ? undefined
                : {
                      limits: async (pageId) => {
                          const limits = await pageFlagMoveLimits({
                              db,
                              pageId: Number(pageId),
                          });
                          if (!limits) return null;
                          const { pages, timelines } = latestBlockText.current;
                          return {
                              flag: limits.flag,
                              min: limits.min,
                              max: limits.max,
                              minReason: describePageFlagBlock(
                                  limits.minBlock,
                                  pages,
                                  timelines,
                              ),
                              maxReason: describePageFlagBlock(
                                  limits.maxBlock,
                                  pages,
                                  timelines,
                              ),
                              holes: limits.holes.map((h) => ({
                                  beat: h.beat,
                                  reason: describePageFlagBlock(
                                      h.block,
                                      pages,
                                      timelines,
                                  ),
                              })),
                          };
                      },
                      commit: async (pageId, beat) => {
                          // A refusal is shown as a toast by the mutation
                          await movePageFlag({
                              pageId: Number(pageId),
                              beat,
                          }).catch(() => {});
                      },
                  },
        [isPlaying, isolated, movePageFlag],
    );
    // Playback and Fit go on to the latest of the last page's flag, the music's end and the last
    // move's end (endless counts rule 4)
    const stopBeat = usePlaybackStopBeat();
    const windowBeforeClick = useRef<TimelineIsolation["restore"] | null>(null);
    // The page box menu's Subset switch: one `updatePages` edit, one undo step
    const { mutate: updatePages } = useMutation(
        updatePagesMutationOptions(queryClient),
    );
    const { mutate: deletePageFlags } = useMutation(
        deletePageFlagsMutationOptions(queryClient),
    );
    // The delete toast's Undo is the app's normal undo (Ctrl+Z)
    const { mutate: performHistoryAction } = usePerformHistoryAction();
    const undo = () => performHistoryAction("undo");
    const { mutate: deletePagesWithMoves } = useMutation(
        deletePagesWithMovesMutationOptions(queryClient, undo),
    );
    const selectAfterDelete = (
        after: ReturnType<typeof selectionAfterFlagDelete>,
    ) => {
        if (!after) return;
        const store = useTimelineSelectionStore.getState();
        if (after.kind === "home") store.selectHome();
        else store.selectRange(after.start, after.end);
    };
    // UI-9: selecting home seeks to beat 0 and a range to its end; not while playing
    const changeSelection = (next: TimelineSelection) => {
        // UI-17 follow-up: home while playing jumps playback to the start (a page box jumps by
        // its own scrub; home has nowhere else to go)
        if (isPlaying && next?.kind === "home") {
            jumpTimelinePlayback(countGrid, 0);
            return;
        }
        if (isPlaying) return;
        const store = useTimelineSelectionStore.getState();
        // UI-25: Shift+click on another move's clip selects it beside the window's, for **Merge
        // moves**; the window stays
        if (
            next?.kind === "range" &&
            next.extend &&
            next.timelineId !== undefined
        ) {
            const current = selectedStoredTimeline(store);
            if (
                store.isolation === null &&
                current &&
                current.id !== next.timelineId
            ) {
                store.pairTimeline(
                    store.pairedTimelineId === next.timelineId
                        ? null
                        : next.timelineId,
                );
                return;
            }
        }
        if (next?.kind === "home") store.selectHome();
        else if (next?.kind === "range") {
            const { startBeatIndex: start, endBeatIndex: end } = next.range;
            store.selectRange(start, end, next.timelineId);
            // UI-17: a drawn range (Ctrl+drag) is the loop, and turns looping on, as dragging
            // Logic's cycle bar does; a page box or Shift+click takes a loop that is on to the
            // pages selected. A dragged start flag only moves the edit window. A clip click
            // carries its move, and a move split off a page keeps the page's range but is still
            // a clip, not the page box (UI-25)
            const pageBox =
                next.timelineId === undefined &&
                store.pageBoxes.some((b) => b.start === start && b.end === end);
            if (
                store.isolation === null &&
                (next.drawn ||
                    (store.loop && (next.via === "pages" || pageBox)))
            )
                store.setLoop({ start, end });
        } else store.selectNothing();
    };

    return (
        // A double-click's two clicks select the range first; remember the window from before the
        // first one, so leaving isolation goes back there (V-18)
        <div
            className="contents"
            onMouseDownCapture={(event) => {
                if (event.detail !== 1) return;
                const s = useTimelineSelectionStore.getState();
                windowBeforeClick.current = s.isolation?.restore ?? {
                    startBeat: s.startBeat,
                    playheadBeat: s.playheadBeat,
                    windowTimelineId: s.windowTimelineId,
                };
            }}
        >
            <TimelineWaveformProvider waveform={waveform ?? NO_WAVEFORM}>
                <PlayingTimeline
                    mode={basic ? "basic" : compact ? "collapsed" : "expanded"}
                    showTransport
                    basic={basic}
                    {...(basic ? basicExtras : {})}
                    zoomFitted={zoomFitted}
                    onZoomFittedChange={setZoomFitted}
                    zoomButtons={tempoMode}
                    // Tempo mode is a focused mode: the timeline is framed in the accent
                    className={clsx(
                        "w-full",
                        tempoMode && "ring-accent ring-2",
                    )}
                    beats={beats}
                    pages={pages}
                    measures={measures}
                    timelines={basic || tempoMode ? NO_CLIPS : offPage}
                    band={tempoMode ? TEMPO_BAND : undefined}
                    pageMoves={pageMoves}
                    transportAccessories={
                        basic || tempoMode ? SPEED_BUTTON : LOOP_BUTTONS
                    }
                    transportSecondary={SOUND_BUTTON}
                    transportViewControls={
                        tempoMode
                            ? TEMPO_VIEW_CONTROLS
                            : basic
                              ? BASIC_VIEW_CONTROLS
                              : EXPERT_VIEW_CONTROLS
                    }
                    keyframes={keyframes}
                    keyframeMenu={keyframeMenu}
                    holds={holds}
                    holdEdges={holdEdges}
                    splitHold={splitHold}
                    setAsShown={setAsShown}
                    holdFromPrevious={holdFromPrevious}
                    clearPage={clearPage}
                    onSelectionChange={changeSelection}
                    onTimelineRangeCommit={
                        basic ? undefined : commands.commitTimelineRange
                    }
                    clipResize={basic ? undefined : clipResize}
                    onOpenRange={
                        basic
                            ? undefined
                            : (range, timelineId) => {
                                  if (isPlaying) return;
                                  const store =
                                      useTimelineSelectionStore.getState();
                                  // UI-25: a clip's own move; a page box's is the oldest there
                                  const timeline =
                                      store.storedTimelines?.find(
                                          (t) => t.id === timelineId,
                                      ) ??
                                      resolveStoredTimeline(
                                          {
                                              kind: "range",
                                              start: range.startBeatIndex,
                                              end: range.endBeatIndex,
                                          },
                                          store.storedTimelines,
                                      );
                                  if (timeline)
                                      store.isolate(
                                          timeline.id,
                                          windowBeforeClick.current ??
                                              undefined,
                                      );
                                  else
                                      toast.info(
                                          tolgee.t(
                                              "timeline.isolation.nothingToIsolate",
                                          ),
                                      );
                              }
                    }
                    moveCommands={basic ? undefined : moveCommands}
                    clipPeel={basic ? undefined : splitMerge.clipPeel}
                    pageMenuExtra={basic ? undefined : splitMerge.pageMenuExtra}
                    pageFlagMove={pageFlagMove}
                    countGrid={countGrid}
                    fitBeat={stopBeat}
                    onSetPageSubset={(pageId, subset) =>
                        updatePages({
                            modifiedPagesArgs: [
                                { id: pageId, is_subset: subset },
                            ],
                        })
                    }
                    onDeletePageFlag={(pageId) => {
                        const after = selectionAfterFlagDelete(
                            pages,
                            pageId,
                            useTimelineSelectionStore.getState().selection,
                        );
                        deletePageFlags(new Set([pageId]), {
                            onSuccess: () => selectAfterDelete(after),
                        });
                    }}
                    onDeletePageWithMoves={(pageId) => {
                        const after = selectionAfterDeleteWithMoves(
                            pages,
                            pageId,
                            useTimelineSelectionStore.getState().selection,
                        );
                        deletePagesWithMoves(new Set([pageId]), {
                            onSuccess: () => selectAfterDelete(after),
                        });
                    }}
                />
            </TimelineWaveformProvider>
        </div>
    );
}

/**
 * The timeline fed by the audio playback, with its zoom, its window and **Create page at playhead**. The playback
 * position changes once a beat while playing or scrubbing, the window (from the start flag to the
 * playhead) with it, and the zoom every frame of a pinch, so all of them are read here, under the
 * panel: they re-render the timeline, not the panel and its queries.
 */
export function PlayingTimeline({
    basic = false,
    countGrid,
    ...props
}: { basic?: boolean } & Omit<
    TimelineProps,
    | "playback"
    | "pixelsPerBeat"
    | "onPixelsPerBeatChange"
    | "selection"
    | "transportClock"
    | "onAddPageFlag"
    | "onAddSubsetPage"
    | "addPageNames"
    | "appendAtPlayhead"
    | "loop"
    | "onLoopChange"
    | "onViewportExtent"
> & {
        /** The counts as they go on past the stored ones (endless counts) */
        countGrid: CountGrid;
    }) {
    const { beats, pages } = props;
    const playback = useTimelinePlayback({ countGrid, pages });
    const editSelection = useTimelineSelectionStore((s) => s.selection);
    const startBeat = useTimelineSelectionStore((s) => s.startBeat);
    // UI-17: the loop, drawn as a bar with draggable ends; an isolated move always loops, so its
    // range is drawn as the loop too, read-only
    const storeLoop = useTimelineSelectionStore((s) => s.loop);
    const isolation = useTimelineSelectionStore((s) => s.isolation);
    const loop = useMemo(() => {
        if (basic) return null;
        const region = isolation ?? storeLoop;
        return region
            ? { startBeatIndex: region.start, endBeatIndex: region.end }
            : null;
    }, [basic, isolation, storeLoop]);
    const changeLoop = useCallback(
        (next: { startBeatIndex: number; endBeatIndex: number }) =>
            useTimelineSelectionStore.getState().setLoop({
                start: next.startBeatIndex,
                end: next.endBeatIndex,
            }),
        [],
    );
    // UI-25: which of the moves sharing the window's range it stands for
    const resolvedId = useTimelineSelectionStore(
        (s) => s.isolation?.timelineId ?? selectedStoredTimeline(s)?.id ?? null,
    );
    const pairedId = useTimelineSelectionStore((s) => s.pairedTimelineId);
    const resolvedOnClip = useTimelineSelectionStore((s) => {
        const t = s.isolation ? isolatedTimeline(s) : selectedStoredTimeline(s);
        return (
            t !== null &&
            !isPageTimeline(t, s.storedTimelines ?? [], s.pageBoxes) &&
            s.pageBoxes.some((b) => b.start === t.start && b.end === t.end)
        );
    });
    const selection = useMemo(
        () =>
            toTimelineSelection(
                editSelection,
                startBeat,
                resolvedId === null
                    ? null
                    : { id: resolvedId, onClip: resolvedOnClip },
                pairedId,
            ),
        [editSelection, startBeat, resolvedId, resolvedOnClip, pairedId],
    );
    // UI-12: the paused clock reads the beat the timeline shows, not the selected page's end
    const shownBeat = useTimelineSelectionStore(displayedBeat);
    // Past the stored counts too: they go on (endless counts)
    const pausedSeconds =
        beats.length > 0 ? countGrid.timeAtBeat(shownBeat) : undefined;
    const clock = useMemo(
        () => <AudioClock pausedSeconds={pausedSeconds} />,
        [pausedSeconds],
    );
    // UI-9 **Create page at playhead** on the free paused playhead's menu; the new page becomes the selection
    const playheadBeat = useTimelineSelectionStore((s) => s.playheadBeat);
    // Endless counts (rules 1 and 7): the timeline draws the counts on past the stored ones, with
    // some room past where playback stops; the scroll ends there
    // The zoom changes every frame of a pinch: keep it here, and save it once the gesture settles
    const [pixelsPerBeat, setPixelsPerBeat] = useState(
        () => useUiSettingsStore.getState().uiSettings.timelinePixelsPerBeat,
    );
    useEffect(() => {
        const timeout = setTimeout(
            () =>
                useUiSettingsStore
                    .getState()
                    .setTimelinePixelsPerBeat(pixelsPerBeat),
            400,
        );
        return () => clearTimeout(timeout);
    }, [pixelsPerBeat]);
    const endless = useEndlessCounts({
        countGrid,
        beats,
        measures: props.measures,
        stopBeat: props.fitBeat ?? 0,
        playheadBeat: Math.max(playheadBeat, shownBeat, playback.positionBeat),
        pixelsPerBeat,
    });
    // Not while a paused preview holds a frame: the menu would open there, but add at P (UI-11)
    const holding = useTimelineSelectionStore((s) => s.cursorBeat !== null);
    const addPageFlag = useAddPageFlag({
        pages,
        beatCount: beats.length,
        playheadBeat,
        isPlaying: playback.isPlaying || holding,
        onAdded: selectAddedPage,
    });
    // F and Shift+F do what the playhead's menu does, whenever it would open
    useActionHandler("timelineCreatePageAtPlayhead", addPageFlag.add, {
        enabled: addPageFlag.insertion !== null,
    });
    useActionHandler("timelineCreateSubsetAtPlayhead", addPageFlag.addSubset, {
        enabled: addPageFlag.insertion !== null,
    });
    // Past the last page, the playhead offers **+ Add N-Count Page**: a page from the last flag to it
    const { t } = useTranslate();
    const { insertion, add: addPage, addSubset } = addPageFlag;
    const appendAtPlayhead = useMemo(() => {
        if (insertion?.kind !== "append") return undefined;
        const counts = insertion.beat - insertion.lastPage.end;
        return {
            counts,
            label: t("timeline.appendAtPlayhead.label", { counts }),
            title: t("timeline.appendAtPlayhead.title", { counts }),
            onAppend: addPage,
            subset: {
                label: t("timeline.appendAtPlayhead.subsetLabel", { counts }),
                title: t("timeline.appendAtPlayhead.subsetTitle", { counts }),
                onAppend: addSubset,
            },
        };
    }, [insertion, addPage, addSubset, t]);
    return (
        <Timeline
            {...props}
            beats={endless.beats}
            measures={endless.measures}
            onViewportExtent={endless.onViewportExtent}
            selection={selection}
            transportClock={clock}
            onAddPageFlag={addPageFlag.insertion ? addPageFlag.add : undefined}
            addPageNames={addPageFlag.names ?? undefined}
            appendAtPlayhead={appendAtPlayhead}
            onAddSubsetPage={
                addPageFlag.insertion ? addPageFlag.addSubset : undefined
            }
            playback={playback}
            pixelsPerBeat={pixelsPerBeat}
            onPixelsPerBeatChange={setPixelsPerBeat}
            loop={loop}
            onLoopChange={isolation || basic ? undefined : changeLoop}
        />
    );
}

/** The fewest counts the timeline goes on past where playback stops */
const MIN_PADDING_BEATS = 32;

/**
 * The counts the timeline draws (docs/timeline/endless-counts.md rules 1 and 7): the stored ones,
 * then the grid's up to some room past `stopBeat` (the latest of the last page's flag, the music's
 * end and the last move's end): half a screen, at least 32 counts (EC-9). The scroll ends there;
 * placing a page or move further moves it on. The playhead keeps the end where it is (playing on
 * past it, say) but adds no room, so clicking at the far right doesn't creep the end out. Rounded
 * up to 32 counts so that playing on redraws the lanes once in a while. A screen's counts come from
 * the zoom as it renders (and the scroller's width, reported on resize), so a zoom that changes
 * the room lands in its own commit.
 */
function useEndlessCounts({
    countGrid,
    beats,
    measures,
    stopBeat,
    playheadBeat,
    pixelsPerBeat,
}: {
    countGrid: CountGrid;
    beats: TimelineProps["beats"];
    measures: TimelineProps["measures"];
    stopBeat: number;
    /** The playhead, or the beat playing: the timeline reaches it, with no room past it */
    playheadBeat: number;
    pixelsPerBeat: number;
}) {
    const [viewportWidth, setViewportWidth] = useState<number | null>(null);
    // Whole powers of two (down), so a pinch redraws the counts a few times, not every frame
    const screenBeats =
        viewportWidth !== null && pixelsPerBeat > 0
            ? Math.max(
                  MIN_PADDING_BEATS,
                  2 **
                      Math.floor(
                          Math.log2(Math.max(viewportWidth / pixelsPerBeat, 1)),
                      ),
              )
            : 2 * MIN_PADDING_BEATS;
    const padding = Math.max(MIN_PADDING_BEATS, screenBeats / 2);
    const extent =
        Math.ceil(
            Math.max(stopBeat + padding, playheadBeat) / MIN_PADDING_BEATS,
        ) * MIN_PADDING_BEATS;
    const onViewportExtent = useCallback(
        ({ width }: { width: number }) => setViewportWidth(width),
        [],
    );
    const drawnBeats = useMemo(
        () => beatsThrough(countGrid, beats, extent),
        [beats, countGrid, extent],
    );
    const drawnMeasures = useMemo(
        () => measuresThrough(countGrid, measures, drawnBeats),
        [countGrid, drawnBeats, measures],
    );
    return {
        beats: drawnBeats as TimelineProps["beats"],
        measures: drawnMeasures as TimelineProps["measures"],
        onViewportExtent,
    };
}

/**
 * What to select after deleting `pageId`'s flag (lead decision, 2026-10-02): when that page was
 * the selection, the merged box: the next page's box, which now runs from the deleted page's start
 * to the next flag. Deleting the last page's flag makes the previous page last, so that page's box
 * (home for page 0). `null` when the deleted page wasn't selected, so the selection stays.
 */
export function selectionAfterFlagDelete(
    pages: readonly FlagPage[],
    pageId: number,
    selection: TimelineEditSelection,
): Exclude<TimelineEditSelection, { kind: "none" }> | null {
    const flags = pageFlags(pages);
    const index = flags.findIndex((f) => f.page.id === pageId);
    const deleted = flags[index];
    if (
        !deleted?.range ||
        !selectionIsRange(selection, deleted.range.start, deleted.range.end)
    )
        return null;
    const next = flags[index + 1];
    if (next?.range)
        return {
            kind: "range",
            start: deleted.range.start,
            end: next.range.end,
        };
    const previous = flags[index - 1];
    return previous ? selectionOfPage(previous) : null;
}

/**
 * What to select after **Delete page and its moves** on `pageId` (lead default, 2026-10-08): when
 * that page was the selection, the box that now covers it. The page before it takes its beats, so
 * that is the previous page's box running to the deleted page's flag; after home, the next page
 * starts where the deleted one did. `null` when the deleted page wasn't selected.
 */
export function selectionAfterDeleteWithMoves(
    pages: readonly FlagPage[],
    pageId: number,
    selection: TimelineEditSelection,
): Exclude<TimelineEditSelection, { kind: "none" }> | null {
    const flags = pageFlags(pages);
    const index = flags.findIndex((f) => f.page.id === pageId);
    const deleted = flags[index];
    if (
        !deleted?.range ||
        !selectionIsRange(selection, deleted.range.start, deleted.range.end)
    )
        return null;
    const previous = flags[index - 1];
    if (previous?.range)
        return {
            kind: "range",
            start: previous.range.start,
            end: deleted.range.end,
        };
    const next = flags[index + 1];
    return next?.range
        ? { kind: "range", start: deleted.range.start, end: next.range.end }
        : { kind: "home" };
}

/** **Create page at playhead** selects the new page's page timeline (UI-9: "The new page is selected"). */
export const selectAddedPage = ({
    startBeat,
    endBeat,
}: Pick<AddedPageFlag, "startBeat" | "endBeat">) =>
    useTimelineSelectionStore.getState().selectRange(startBeat, endBeat);

/**
 * What stops a dragged page flag, in words for its readout (research/move-page-flag cases 1, 4, 6,
 * 9, 10): the neighboring flag, the show's end, or the move in the way, named by its page when it
 * is a page's move. `timelines` are the tracks (`useTimelineTracks`); ranges are spec beats.
 */
export function describePageFlagBlock(
    block: PageFlagMoveBlock,
    pages: readonly (FlagPage & { readonly name: string })[],
    timelines: readonly Pick<
        TimelineInput,
        "linkId" | "label" | "unnamed" | "startBeatIndex" | "endBeatIndex"
    >[],
): string {
    // Nothing stops the last flag past every move (endless counts); never shown
    if (block.kind === "open") return "";
    const flags = pageFlags(pages);
    if (block.kind === "flag") {
        const flag = flags.find((f) => f.page.id === block.pageId);
        return !flag || !flag.range
            ? tolgee.t("timeline.pageFlagBlock.home")
            : tolgee.t("timeline.rangeName.flag", { page: flag.page.name });
    }
    const track =
        block.timelineId === undefined
            ? undefined
            : timelines.find((t) => t.linkId === block.timelineId);
    const page = track
        ? flags.find(
              (f) =>
                  f.range?.start === track.startBeatIndex &&
                  f.range.end === track.endBeatIndex,
          )
        : undefined;
    const who = page
        ? { who: "page", page: page.page.name, name: "" }
        : track && !track.unnamed
          ? { who: "named", page: "", name: track.label }
          : { who: "other", page: "", name: "" };
    switch (block.reason) {
        case "sharesRange":
            return tolgee.t("timeline.pageFlagBlock.sharesCounts", who);
        case "leftBehind":
            return tolgee.t("timeline.pageFlagBlock.startsOrEnds", who);
        default:
            return tolgee.t("timeline.pageFlagBlock.inTheWay", who);
    }
}

/** `value` as it was the last time `current` was true, or as it is now while `current` is. */
export function useHeldWhileStale<T>(value: T, current: boolean): T {
    const held = useRef(value);
    if (current) held.current = value;
    return held.current;
}

/**
 * The timelines that don't match a page box (UI-10, project owner, 2026-10-03). A page box
 * already stands for the stored timeline with exactly its range: clicking it sets the start flag
 * and playhead to its edges, so a clip under it would only repeat it. Timelines that start or end
 * off a flag (a mid-page arrival) keep their clips, and so does a move split
 * off a page's timeline (UI-25): the box stands for the oldest over its range. Ranges are spec
 * beats.
 */
export function timelinesOffPages<
    T extends Pick<TimelineInput, "startBeatIndex" | "endBeatIndex" | "linkId">,
>(timelines: readonly T[], pages: readonly FlagPage[]): T[] {
    const boxes = pageFlags(pages).flatMap((f) =>
        f.range ? [{ start: f.range.start, end: f.range.end }] : [],
    );
    // UI-25: only the page's own timeline (the oldest over the box) hides under it; a move split
    // off it keeps the range and its clip
    const pages_ = pageTimelineIds(
        timelines.flatMap((t) =>
            t.linkId === undefined
                ? []
                : [
                      {
                          id: Number(t.linkId),
                          start: t.startBeatIndex,
                          end: t.endBeatIndex,
                      },
                  ],
        ),
        boxes,
    );
    const onBox = new Set(boxes.map((b) => `${b.start}:${b.end}`));
    return timelines.filter(
        (t) =>
            !onBox.has(`${t.startBeatIndex}:${t.endBeatIndex}`) ||
            (t.linkId !== undefined && !pages_.has(Number(t.linkId))),
    );
}

import { toast } from "sonner";
import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CornersInIcon, CornersOutIcon } from "@phosphor-icons/react";
import type { AddedPageFlag } from "@/db-functions/pageFlags";
import {
    deletePageFlagsMutationOptions,
    useAddPageFlag,
} from "@/hooks/queries/usePageFlags";
import { useTimingObjects } from "@/hooks";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { db } from "@/global/database/db";
import {
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
import { useTimelineMode } from "@/hooks/queries/useWorkspaceSettings";
import { useTimelineTracks } from "@/timeline/useTimelineTracks";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import { AudioClock } from "./Clock";
import {
    TimelineFromStartButton,
    TimelineLoopButton,
    TimelineMetronomeButton,
    TimelineMuteButton,
} from "./TimelineControls";
import {
    Timeline,
    type TimelineInput,
    type TimelineSelection,
} from "./Timeline";
import { useTimelineCommands } from "./useTimelineCommands";
import { useTimelinePlayback } from "./useTimelinePlayback";

/** The page timeline's fullscreen toggle, for the timeline's transport */
function FullscreenButton() {
    const { isFullscreen, toggleFullscreen } = useFullscreenStore();
    return (
        <button
            className="text-text enabled:hover:text-accent focus-visible:ring-accent duration-150 ease-out focus-visible:ring-2 focus-visible:outline-none"
            onClick={toggleFullscreen}
            aria-label="Toggle timeline fullscreen"
            aria-pressed={isFullscreen}
        >
            {isFullscreen ? (
                <CornersInIcon size={20} />
            ) : (
                <CornersOutIcon size={20} />
            )}
        </button>
    );
}

/** The store's selection as the timeline draws it (spec beats; `Timeline` maps them to its axis) */
export const toTimelineSelection = (
    selection: TimelineEditSelection,
    startBeat?: number,
    fromStart = false,
): TimelineSelection =>
    selection.kind === "range"
        ? {
              kind: "range",
              range: {
                  startBeatIndex: selection.start,
                  endBeatIndex: selection.end,
              },
              // UI-10: after Stop the window falls back, but the flag stays where it is
              ...(startBeat !== undefined && startBeat !== selection.start
                  ? { startFlagBeatIndex: startBeat }
                  : {}),
              ...(fromStart ? { fromStart: true } : {}),
          }
        : selection.kind === "home"
          ? { kind: "home" }
          : null;

/**
 * The timeline (ui.md, from the 0.2 branch) for a file whose timeline dev flag is on. It takes the
 * file's real beats, pages and measures, and plays through the app's existing audio clock. Its
 * selection is `useTimelineSelectionStore`'s (UI-9): the initial page box selects home, a page box
 * or a dragged range selects that range, and each seeks (home to beat 0, a range to its end).
 * **+** after the free paused playhead adds a page flag there and selects the new page; a page
 * box's right-click menu deletes its flag (P8.13's writes, wired by P8.15). Neither Create Track
 * nor **Add selected marchers** is offered: dragging marchers adds them (UI-10). Double-clicking
 * a page box or clip isolates its stored timeline (docs/timeline/research/ownership/09-isolation.md).
 */
export default function TimelineModePanel() {
    const { beats, pages, measures } = useTimingObjects()!;
    const playback = useTimelinePlayback({ beats, pages });
    const editSelection = useTimelineSelectionStore((s) => s.selection);
    // UI-10: the start flag follows the page boxes
    useEffect(() => {
        useTimelineSelectionStore
            .getState()
            .setPageBoxes(
                pageFlags(pages).flatMap((f) =>
                    f.range ? [{ ...f.range, name: f.page.name }] : [],
                ),
            );
    }, [pages]);
    const startBeat = useTimelineSelectionStore((s) => s.startBeat);
    const playFromStart = useTimelineSelectionStore((s) => s.playFromStart);
    const selection = useMemo(
        () => toTimelineSelection(editSelection, startBeat, playFromStart),
        [editSelection, startBeat, playFromStart],
    );
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
    const timelines = useTimelineTracks({
        database: db,
        enabled: useTimelineMode(),
    });
    // UI-10: a page box already stands for its page timeline, so only the others get a clip
    const offPage = useMemo(
        () => timelinesOffPages(timelines, pages),
        [timelines, pages],
    );
    const commands = useTimelineCommands({
        database: db,
        timelines,
        selectedMarcherIds,
    });
    // UI-9 **+** after the free paused playhead; the new page becomes the selection
    const playheadBeat = useTimelineSelectionStore((s) => s.playheadBeat);
    // Not while a paused preview holds a frame: + is drawn there, but would add at P (UI-11)
    const holding = useTimelineSelectionStore((s) => s.cursorBeat !== null);
    const addPageFlag = useAddPageFlag({
        pages,
        beatCount: beats.length,
        playheadBeat,
        isPlaying: isPlaying || holding,
        onAdded: selectAddedPage,
    });
    const queryClient = useQueryClient();
    const windowBeforeClick = useRef<TimelineIsolation["restore"] | null>(null);
    const { mutate: deletePageFlags } = useMutation(
        deletePageFlagsMutationOptions(queryClient),
    );
    // UI-9: selecting home seeks to beat 0 and a range to its end; not while playing
    const changeSelection = (next: TimelineSelection) => {
        if (isPlaying) return;
        const store = useTimelineSelectionStore.getState();
        if (next?.kind === "home") store.selectHome();
        else if (next?.kind === "range") {
            store.selectRange(
                next.range.startBeatIndex,
                next.range.endBeatIndex,
            );
            // UI-11: drawing a range is asking to play it, as Logic's cycle drag does
            if (next.drawn) store.setPlayFromStart(true);
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
                    startPinned: s.startPinned,
                    playheadBeat: s.playheadBeat,
                };
            }}
        >
            <Timeline
                mode="expanded"
                className="w-full"
                beats={beats}
                pages={pages}
                measures={measures}
                timelines={offPage}
                playback={playback}
                transportClock={<AudioClock />}
                transportAccessories={
                    <>
                        <TimelineFromStartButton />
                        <TimelineLoopButton />
                        <TimelineMuteButton />
                        <TimelineMetronomeButton />
                        <FullscreenButton />
                    </>
                }
                selection={selection}
                onSelectionChange={changeSelection}
                onTimelineRangeCommit={commands.commitTimelineRange}
                onPlayFromStartOff={() =>
                    useTimelineSelectionStore.getState().setPlayFromStart(false)
                }
                onOpenRange={(range) => {
                    if (isPlaying) return;
                    const store = useTimelineSelectionStore.getState();
                    const timeline = store.storedTimelines?.find(
                        (t) =>
                            t.start === range.startBeatIndex &&
                            t.end === range.endBeatIndex,
                    );
                    if (timeline)
                        store.isolate(
                            timeline.id,
                            windowBeforeClick.current ?? undefined,
                        );
                    else
                        toast.info(
                            "Nothing moves here yet. Drag marchers in this range to make a move, then double-click it to isolate it.",
                        );
                }}
                onAddPageFlag={
                    addPageFlag.insertion ? addPageFlag.add : undefined
                }
                onDeletePageFlag={(pageId) => {
                    const after = selectionAfterFlagDelete(
                        pages,
                        pageId,
                        useTimelineSelectionStore.getState().selection,
                    );
                    deletePageFlags(new Set([pageId]), {
                        onSuccess: () => {
                            if (!after) return;
                            const store = useTimelineSelectionStore.getState();
                            if (after.kind === "home") store.selectHome();
                            else store.selectRange(after.start, after.end);
                        },
                    });
                }}
            />
        </div>
    );
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

/** **+** selects the new page's page timeline (UI-9: "The new page is selected"). */
export const selectAddedPage = ({
    startBeat,
    endBeat,
}: Pick<AddedPageFlag, "startBeat" | "endBeat">) =>
    useTimelineSelectionStore.getState().selectRange(startBeat, endBeat);

/**
 * The timelines that don't match a page box (UI-10, project owner, 2026-10-03). A page box
 * already stands for the stored timeline with exactly its range: clicking it sets the start flag
 * and playhead to its edges, so a clip under it would only repeat it. Timelines that start or end
 * off a flag (a mid-page arrival, a pinned start flag) keep their clips. Ranges are spec beats.
 */
export function timelinesOffPages<
    T extends Pick<TimelineInput, "startBeatIndex" | "endBeatIndex">,
>(timelines: readonly T[], pages: readonly FlagPage[]): T[] {
    const boxes = new Set(
        pageFlags(pages).flatMap((f) =>
            f.range ? [`${f.range.start}:${f.range.end}`] : [],
        ),
    );
    return timelines.filter(
        (t) => !boxes.has(`${t.startBeatIndex}:${t.endBeatIndex}`),
    );
}

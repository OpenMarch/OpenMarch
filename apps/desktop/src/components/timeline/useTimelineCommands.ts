import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import tolgee from "@/global/singletons/Tolgee";
import { useQueryClient } from "@tanstack/react-query";
import {
    deleteTimelineAndCompare,
    renameTimeline,
    shiftTimeline,
} from "@/db-functions/timelineCommands";
import type { DbConnection } from "@/db-functions/types";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { usePerformHistoryAction } from "@/hooks/queries/useHistory";
import { allMarcherRowsQueryOptions } from "@/hooks/queries/useMarchers";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";
import { isPageTimeline, moveLabels } from "@/timeline/timelineViewModel";
import { subscribeHistoryChanges } from "@/db-functions/history";
import { timelineExists } from "@/db-functions/timelines";
import { pageRuns, type NamedPage } from "@/db-functions/pageDelete";
import { formatList } from "@/utilities/formatList";
import {
    splitTimelineAtBeat,
    type MotionChange,
} from "@/db-functions/timelineSplitAtBeat";
import { beatWhere } from "@/timeline/timelineRangeWords";
import type { TimelineText } from "@/timeline/timelineText";
import { translateTimelineText } from "@/timeline/translateTimelineText";
import { useMoveMemberSelectionStore } from "@/stores/MoveMemberSelectionStore";
import {
    useTimelineSelectionStore,
    windowMove,
    type StoredTimelineMembership,
    type TimelineSelectionState,
} from "@/stores/TimelineSelectionStore";
import type { TimelineInput } from "./Timeline";
import type {
    TimelineRangeChange,
    TimelineRangeCommitResult,
} from "./TimelineViewModel";

/**
 * The timeline's commands (P8.9, ui.md's mapping table), wired to the write path. Everything here
 * arrives in spec beats (`Timeline` converts from its view axis, UI-5).
 */

/**
 * The spec timeline a clip move shifts and by how much: the clip's track carries the spec timeline
 * as `linkId`, and every clip of it moves by the clip's drag. `null` for an unknown clip or one
 * dropped where it started (a no-op the write path would reject as an empty edit).
 */
export function timelineShiftFor(
    change: TimelineRangeChange,
    timelines: readonly TimelineInput[],
): { timelineId: number; delta: number } | null {
    const track = timelines.find((t) => t.id === change.timelineId);
    if (!track || track.linkId === undefined) return null;
    const delta = change.startBeatIndex - track.startBeatIndex;
    if (delta === 0) return null;
    return { timelineId: Number(track.linkId), delta };
}

/**
 * The panel's side of the commands: the callbacks that run each command as one undoable edit and
 * show a refusal's friendly message (P8.6) as a toast. A clip move of the selected timeline moves
 * the selection with it (UI-9).
 */
export function useTimelineCommands({
    database,
    timelines,
}: {
    database: DbConnection;
    timelines: readonly TimelineInput[];
}) {
    const commitTimelineRange = useCallback(
        (change: TimelineRangeChange): TimelineRangeCommitResult => {
            const shift = timelineShiftFor(change, timelines);
            const track = timelines.find((t) => t.id === change.timelineId);
            if (!shift || !track) return Promise.resolve(false);
            const from = {
                start: track.startBeatIndex,
                end: track.endBeatIndex,
            };
            return shiftTimeline({ db: database, ...shift }).then(
                (result) => {
                    if (result)
                        useTimelineSelectionStore
                            .getState()
                            .followTimelineShift(
                                from,
                                shift.delta,
                                shift.timelineId,
                            );
                    return result !== null;
                },
                (error: unknown) => {
                    toastTimelineError(error);
                    return false;
                },
            );
        },
        [database, timelines],
    );

    return {
        commitTimelineRange,
    };
}

/** Why **Edit move** and **Delete move** are unavailable (UI-14), or null when they can run. */
export function moveCommandBlocker(isPlaying: boolean): string | null {
    return isPlaying ? tolgee.t("timeline.moveMenu.paused") : null;
}

/**
 * Before a move's clip goes (UI-14 review): focus moves to the next clip, else the previous one,
 * else the timeline itself, never to the page (where Space and the arrows would act unseen).
 */
export function focusAfterMoveDelete(timelineId: number): void {
    const clips = Array.from(
        document.querySelectorAll<HTMLElement>('[data-testid="timeline-clip"]'),
    );
    const index = clips.findIndex(
        (clip) => clip.dataset.moveId === String(timelineId),
    );
    const next =
        (index >= 0 ? (clips[index + 1] ?? clips[index - 1]) : undefined) ??
        document.querySelector<HTMLElement>(
            '[data-testid="timeline-viewport"]',
        );
    next?.focus({ preventScroll: true });
}

/** Moves being deleted now, across every caller, so a repeated Delete doesn't delete twice */
const deletingMoves = new Set<number>();

/**
 * Moves being split now, likewise: a second click or ⌘K before the first lands reads the old
 * range, and would be refused with an error toast just after the split worked
 */
const splittingMoves = new Set<number>();

/** How long the delete toast stays, unless another edit, undo or redo closes it first */
const DELETE_TOAST_MS = 8000;

/**
 * "Deleted Move 2", and when pages look different after it (marchers that held after the move
 * fall back), "Deleted Move 2 · Pages 4–5 changed", as the delete-page toast says it.
 */
export function moveDeletedMessage(
    label: string,
    changedPages: readonly NamedPage[] = [],
): string {
    if (changedPages.length === 0)
        return tolgee.t("timeline.moveDeleted.message", "Deleted {label}", {
            label,
        });
    const pages = formatList(pageRuns(changedPages));
    return tolgee.t(
        "timeline.moveDeleted.withPages",
        "{count, plural, =1 {Deleted {label} · Page {pages} changed} other {Deleted {label} · Pages {pages} changed}}",
        { label, pages, count: changedPages.length },
    );
}

/**
 * Shows "Deleted <label>" with **Undo** (UI-14), and the pages that changed
 * (`moveDeletedMessage`). Its Undo runs the app's undo, so the toast closes on the next history
 * change (an edit, an undo, a redo): then Undo could only undo something else.
 */
export function toastMoveDeleted(
    label: string,
    undo: () => void,
    changedPages: readonly NamedPage[] = [],
): void {
    toastMoveEdit(moveDeletedMessage(label, changedPages), undo);
}

/** A move edit's toast with **Undo**, closed by the next history change (see `toastMoveDeleted`). */
function toastMoveEdit(message: string, undo: () => void): void {
    let unsubscribe = () => {};
    const id = toast.success(message, {
        duration: DELETE_TOAST_MS,
        action: { label: tolgee.t("actions.edit.undo", "Undo"), onClick: undo },
        onDismiss: () => unsubscribe(),
        onAutoClose: () => unsubscribe(),
    });
    unsubscribe = subscribeHistoryChanges(() => {
        unsubscribe();
        toast.dismiss(id);
    });
}

/**
 * Why **Split at playhead** (UI-27) can't split `move` now, or null: playing, or the playhead not
 * strictly inside the move (on an end there is nothing to split off).
 */
export function splitMoveBlocker(
    move: { readonly start: number; readonly end: number } | undefined,
    playheadBeat: number,
    isPlaying: boolean,
): string | null {
    if (isPlaying)
        return tolgee.t("timeline.moveSplit.paused", "Pause to split a move.");
    if (move && !(move.start < playheadBeat && playheadBeat < move.end))
        return tolgee.t(
            "inspector.timeline.move.splitHelp",
            "Put the playhead inside the move to split it there.",
        );
    return null;
}

/**
 * The move ⌘K's **Split at playhead** acts on (UI-27): while a move is isolated, that move, and
 * only with the playhead inside it; else the window's move when the playhead is inside it, else
 * the one move (not a page's) the playhead is strictly inside. With none, or several, the reason
 * to show instead.
 */
export function moveAtPlayhead(
    state: Pick<
        TimelineSelectionState,
        | "selection"
        | "storedTimelines"
        | "isolation"
        | "pageBoxes"
        | "playheadBeat"
    >,
): StoredTimelineMembership | string {
    const beat = state.playheadBeat;
    const inside = (t: { start: number; end: number }) =>
        t.start < beat && beat < t.end;
    // Isolated, the split is of the move being edited, never another one under the playhead
    if (state.isolation) {
        const isolated = state.storedTimelines?.find(
            (t) => t.id === state.isolation!.timelineId,
        );
        if (isolated && inside(isolated)) return isolated;
        return tolgee.t("timeline.moveSplit.isolatedOutside");
    }
    const current = windowMove(state);
    if (current && inside(current)) return current;
    // A page's own timeline is the oldest over its box (UI-25): a move split off it shares the
    // range and is still a move
    const stored = state.storedTimelines ?? [];
    const crossing = stored.filter(
        (t) => inside(t) && !isPageTimeline(t, stored, state.pageBoxes),
    );
    if (crossing.length === 1) return crossing[0]!;
    const where = beatWhere(beat, state.pageBoxes);
    if (where === null)
        return tolgee.t(
            crossing.length === 0
                ? "timeline.moveSplit.noneAtPlayhead"
                : "timeline.moveSplit.severalAtPlayhead",
        );
    return tolgee.t(
        crossing.length === 0
            ? "timeline.moveSplit.noneAt"
            : "timeline.moveSplit.severalAt",
        { where: translateTimelineText(where) },
    );
}

/**
 * "Split Move 2 at Page 3 count 4" ("… at the playhead" where the moment has no page to say it
 * by), and when paths changed (UI-27): "… · 3 marchers' curved paths restart after it" when every
 * change starts at the split `beat` (an arc keeps its curve before it, #591), else "… · 3
 * marchers' paths are redrawn: straight before it, restarted after" (follow the leader goes
 * straight before it).
 */
export function moveSplitMessage(
    label: string,
    where: TimelineText | null,
    changed: readonly MotionChange[],
    beat: number,
): string {
    const base = where
        ? tolgee.t("timeline.moveSplit.message", "Split {label} at {where}", {
              label,
              where: translateTimelineText(where),
          })
        : tolgee.t(
              "timeline.moveSplit.messageAtPlayhead",
              "Split {label} at the playhead",
              { label },
          );
    if (changed.length === 0) return base;
    // Curved paths keep every count before the split and only restart after it (#591); a path
    // that changes before it too (follow the leader) is redrawn straight there. Each is counted
    // on its own, so a move with both says both
    const restarted = changed.filter((c) => c.fromBeat >= beat).length;
    const redrawn = changed.length - restarted;
    const notes: string[] = [];
    if (restarted > 0)
        notes.push(
            tolgee.t(
                "timeline.moveSplit.restarted",
                "{count, plural, one {# marcher's curved path restarts after it} other {# marchers' curved paths restart after it}}",
                { count: restarted },
            ),
        );
    if (redrawn > 0)
        notes.push(
            tolgee.t(
                "timeline.moveSplit.changed",
                "{count, plural, one {# marcher's path is redrawn: straight before it, restarted after} other {# marchers' paths are redrawn: straight before it, restarted after}}",
                { count: redrawn },
            ),
        );
    return notes.reduce(
        (message, note) =>
            tolgee.t("timeline.moveSplit.withNote", { message, note }),
        base,
    );
}

/**
 * A move's commands (ui.md UI-14), for the timeline's clips and their menu. Each
 * write is one undoable edit, and a refusal is a toast (P8.6).
 *
 * - **Delete move** deletes the timeline, its transitions and assignments; moves it passed through
 *   come back (UI-10). The window stays put, and an isolated move that goes ends isolation (the
 *   store's "timeline goes away" path). A toast names what went, with **Undo**
 *   (`toastMoveDeleted`). A move already being deleted, or already gone (a repeated Delete, a
 *   stale button), is ignored without an error.
 * - **Rename** stores the name as `renameTimeline` normalizes it; an unchanged name writes nothing,
 *   and a move that is gone (its field left open while it was deleted) is skipped.
 * - **Select marchers** selects the marchers with an assignment in it on the canvas, and
 *   records them, so going to another move clears them (`useClearLeftoverMoveSelection`).
 * - **Edit move** isolates the move (09-isolation.md), so its paths show and canvas drags edit
 *   where it ends; on a move already isolated it stays so. It selects nobody (one Esc leaves).
 * - Deleting moves focus to the next clip, else the previous one, else the timeline.
 */
export function useMoveCommands(database: DbConnection) {
    const { mutate: performHistoryAction } = usePerformHistoryAction();
    const queryClient = useQueryClient();
    const setSelectedMarchers = useSelectedMarchers()?.setSelectedMarchers;
    return useMemo(
        () =>
            createMoveCommands({
                database,
                undo: () => performHistoryAction("undo"),
                selectMarchers: async (members) => {
                    if (!setSelectedMarchers) return;
                    try {
                        // Items too: props can be in moves
                        const marchers = await queryClient.ensureQueryData(
                            allMarcherRowsQueryOptions(),
                        );
                        setSelectedMarchers(
                            marchers.filter((m) => members.has(m.id)),
                        );
                    } catch (error: unknown) {
                        console.error("Couldn't read the marchers", error);
                    }
                },
            }),
        [database, performHistoryAction, queryClient, setSelectedMarchers],
    );
}

/** A stored move's label (UI-14), for its toasts. */
const storedMoveLabel = (timelineId: number) => {
    const s = useTimelineSelectionStore.getState();
    return (
        moveLabels(s.storedTimelines ?? [], s.pageBoxes).get(timelineId) ??
        s.storedTimelines?.find((t) => t.id === timelineId)?.name ??
        tolgee.t("timeline.moveName.unnamed")
    );
};

/** `useMoveCommands` without React: the app's undo and marcher selection are passed in. */
export function createMoveCommands({
    database,
    undo,
    selectMarchers: selectMembers,
}: {
    database: DbConnection;
    undo: () => void;
    selectMarchers: (members: ReadonlySet<number>) => Promise<void>;
}) {
    const stored = (timelineId: number) =>
        useTimelineSelectionStore
            .getState()
            .storedTimelines?.find((t) => t.id === timelineId);
    const labelOf = storedMoveLabel;
    /** A refusal is shown, unless the move is gone by now (then there's nothing to say) */
    const report = async (timelineId: number, error: unknown) => {
        if (!(await timelineExists(database, timelineId).catch(() => true)))
            return;
        toastTimelineError(error);
    };
    const selectMarchers = async (timelineId: number) => {
        const members = stored(timelineId)?.marcherIds;
        if (!members) return;
        await selectMembers(members);
        // Going to another move clears them while they are still the selection
        useMoveMemberSelectionStore
            .getState()
            .record({ timelineId, marcherIds: new Set(members) });
    };
    return {
        /** Resolves once the delete has settled (tests wait on it) */
        deleteMove: async (timelineId: number): Promise<void> => {
            if (deletingMoves.has(timelineId) || !stored(timelineId)) return;
            deletingMoves.add(timelineId);
            const label = labelOf(timelineId);
            focusAfterMoveDelete(timelineId);
            try {
                const { changedPages } = await deleteTimelineAndCompare({
                    db: database,
                    timelineId,
                });
                toastMoveDeleted(label, undo, changedPages);
            } catch (error: unknown) {
                await report(timelineId, error);
            } finally {
                deletingMoves.delete(timelineId);
            }
        },
        renameMove: async (
            timelineId: number,
            name: string | null,
        ): Promise<void> => {
            if (!stored(timelineId) || deletingMoves.has(timelineId)) return;
            try {
                await renameTimeline({ db: database, timelineId, name });
            } catch (error: unknown) {
                await report(timelineId, error);
            }
        },
        selectMarchers,
        /**
         * **Split at playhead** (UI-27): the move becomes two that meet at the playhead, the one
         * before it new. That new move becomes the window (its clip selected), ending any
         * isolation. Resolves once the split has settled.
         */
        splitMoveAtPlayhead: (timelineId: number, isPlaying = false) =>
            splitMoveAtPlayhead({
                database,
                undo,
                timelineId,
                isPlaying,
                move: stored(timelineId),
                label: labelOf(timelineId),
                report,
            }),
        editMove: (timelineId: number) => {
            if (!stored(timelineId)) return;
            // UI-14 review: isolation shows who is in it, so nobody is selected (one Esc
            // leaves); the clip menu's **Select marchers** selects them
            useTimelineSelectionStore.getState().isolate(timelineId);
        },
    };
}

/** `createMoveCommands`' **Split at playhead**; see it for what happens. */
async function splitMoveAtPlayhead({
    database,
    undo,
    timelineId,
    isPlaying,
    move,
    label,
    report,
}: {
    database: DbConnection;
    undo: () => void;
    timelineId: number;
    isPlaying: boolean;
    move: StoredTimelineMembership | undefined;
    label: string;
    report: (timelineId: number, error: unknown) => Promise<void>;
}): Promise<void> {
    if (
        !move ||
        deletingMoves.has(timelineId) ||
        splittingMoves.has(timelineId)
    )
        return;
    const { playheadBeat, pageBoxes } = useTimelineSelectionStore.getState();
    const reason = splitMoveBlocker(move, playheadBeat, isPlaying);
    if (reason !== null) {
        toast.error(reason, { id: "timeline-split-move" });
        return;
    }
    splittingMoves.add(timelineId);
    try {
        const { before, motionChanged } = await splitTimelineAtBeat({
            db: database,
            timelineId,
            beat: playheadBeat,
        });
        useTimelineSelectionStore
            .getState()
            .selectRange(before.start_beat, before.end_beat);
        toastMoveEdit(
            moveSplitMessage(
                label,
                beatWhere(playheadBeat, pageBoxes),
                motionChanged,
                playheadBeat,
            ),
            undo,
        );
    } catch (error: unknown) {
        await report(timelineId, error);
    } finally {
        splittingMoves.delete(timelineId);
    }
}

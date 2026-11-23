import { useMemo, useRef } from "react";
import type { DbConnection } from "@/db-functions/types";
import {
    selectedStoredTimeline,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { pageFlags, type FlagPage } from "@/timeline/timelinePlayhead";
import type { TimelineMovePeel } from "./TimelineClipPeel";
import type { TimelineMenuEntry } from "./TimelineRangeMenu";
import {
    createSplitMergeCommands,
    mergeVerdict,
    moveMenuEntries,
    pageMenuEntries,
    splitMergeContext,
    splitVerdict,
    dropTargetTimeline,
    mergeDirection,
    mergeBlocker,
    overlappedPageTimelines,
    selectedMembers,
    splitEntryState,
    type SplitMergeCommands,
    type SplitMergeContext,
} from "./splitMergeMoves";
import { useActionHandler } from "@/shortcuts/useActionHandler";

/**
 * The split and merge commands (`createSplitMergeCommands`) with the context they read when run:
 * the store, the selected marchers and whether playback runs. Undo is the app's undo. The Move
 * card uses these alone; the panel gets them with its menus and drag (`useSplitMergeMoves`).
 */
export function useSplitMergeCommands({
    database,
    selectedMarcherIds,
    isPlaying,
}: {
    database: DbConnection;
    selectedMarcherIds: ReadonlySet<number>;
    isPlaying: boolean;
}): { commands: SplitMergeCommands; context: () => SplitMergeContext } {
    const latest = useRef({ selectedMarcherIds, isPlaying });
    latest.current = { selectedMarcherIds, isPlaying };
    return useMemo(() => {
        const context = () =>
            splitMergeContext(
                useTimelineSelectionStore.getState(),
                latest.current.selectedMarcherIds,
                latest.current.isPlaying,
            );
        return {
            context,
            commands: createSplitMergeCommands({
                database,
                context,
            }),
        };
    }, [database]);
}

/**
 * UI-25 for the timeline panel: the split and merge entries of each clip's menu and of the page
 * boxes, the clip drag (drag out, drag to merge), and the commands behind them, reading the store
 * and the selected marchers when used. The panel passes none of it in Basic mode.
 */
// eslint-disable-next-line max-lines-per-function
export function useSplitMergeMoves({
    database,
    selectedMarcherIds,
    isPlaying,
    pages,
}: {
    database: DbConnection;
    selectedMarcherIds: ReadonlySet<number>;
    isPlaying: boolean;
    pages: readonly FlagPage[];
}): {
    commands: SplitMergeCommands;
    context: () => SplitMergeContext;
    moveExtraFor: (timelineId: number) => readonly TimelineMenuEntry[];
    pageMenuExtra: (pageId: number) => readonly TimelineMenuEntry[];
    clipPeel: TimelineMovePeel;
} {
    const { commands, context } = useSplitMergeCommands({
        database,
        selectedMarcherIds,
        isPlaying,
    });
    const pagesRef = useRef(pages);
    pagesRef.current = pages;
    return useMemo(() => {
        const pageRangeOf = (pageId: number) =>
            pageFlags(pagesRef.current).find(
                (f) => Number(f.page.id) === pageId,
            )?.range ?? null;
        return {
            commands,
            context,
            moveExtraFor: (timelineId: number) => {
                const s = useTimelineSelectionStore.getState();
                const windowId =
                    s.isolation?.timelineId ??
                    selectedStoredTimeline(s)?.id ??
                    null;
                return moveMenuEntries(
                    context(),
                    timelineId,
                    s.pairedTimelineId,
                    windowId,
                    commands,
                );
            },
            pageMenuExtra: (pageId: number) =>
                pageMenuEntries(context(), pageRangeOf(pageId), commands),
            clipPeel: {
                split: (timelineId) => splitVerdict(context(), timelineId),
                merge: (timelineId, target) =>
                    mergeVerdict(context(), timelineId, target, pageRangeOf),
                onSplit: (timelineId) =>
                    commands.split(
                        timelineId,
                        selectedMembers(context(), timelineId),
                    ),
                onMerge: (timelineId, target) => {
                    const ctx = context();
                    const resolved = dropTargetTimeline(
                        ctx,
                        target,
                        pageRangeOf,
                    );
                    if ("missing" in resolved) return;
                    // Dropped on a move: into it, unless the dragged clip is the page's own
                    const { sourceId, targetId } = mergeDirection(
                        ctx,
                        timelineId,
                        resolved.id,
                    );
                    commands.merge(sourceId, targetId);
                },
            },
        };
    }, [commands, context]);
}

/**
 * UI-25 in the command palette (⌘K): **Split selected marchers into a new move** off the window's
 * move (the isolated one, a selected clip, or a page box's own timeline), and **Merge this move
 * into its page** for a move over a page (the page it starts on, fitted to its counts). Registered only outside Basic mode, so Basic
 * doesn't list them; greyed out where the menus would disable them.
 */
export function useSplitMergeActions(
    splitMerge: ReturnType<typeof useSplitMergeMoves>,
    enabled: boolean,
    selectedMarcherIds: ReadonlySet<number>,
    isPlaying: boolean,
) {
    const windowId = useTimelineSelectionStore(
        (s) => s.isolation?.timelineId ?? selectedStoredTimeline(s)?.id ?? null,
    );
    const storedTimelines = useTimelineSelectionStore((s) => s.storedTimelines);
    const pageBoxes = useTimelineSelectionStore((s) => s.pageBoxes);
    const plan = useMemo(() => {
        if (windowId === null)
            return {
                split: null,
                merge: null,
                splitReason: undefined,
                mergeReason: undefined,
            };
        const ctx = splitMergeContext(
            { storedTimelines, pageBoxes },
            selectedMarcherIds,
            isPlaying,
        );
        const split = splitEntryState(ctx, windowId);
        const t = ctx.storedTimelines.find((x) => x.id === windowId);
        // The page the move starts on: merging fits it to that page's counts
        const page = t ? (overlappedPageTimelines(ctx, t)[0] ?? null) : null;
        const mergeReason =
            page && page.id !== windowId
                ? mergeBlocker(ctx, windowId, page.id)
                : null;
        return {
            split:
                split && split.disabledReason === null
                    ? selectedMembers(ctx, windowId)
                    : null,
            merge:
                page && page.id !== windowId && mergeReason === null
                    ? page.id
                    : null,
            // Shown on the disabled entry in the palette and the field's menu
            splitReason: split?.disabledReason ?? undefined,
            mergeReason: mergeReason ?? undefined,
        };
    }, [windowId, storedTimelines, pageBoxes, selectedMarcherIds, isPlaying]);
    useActionHandler(
        "splitSelectedIntoNewMove",
        () => {
            if (windowId !== null && plan.split)
                splitMerge.commands.split(windowId, plan.split);
        },
        {
            enabled: enabled && plan.split !== null,
            disabledReason: plan.splitReason,
        },
        enabled,
    );
    useActionHandler(
        "mergeMoveIntoPage",
        () => {
            if (windowId !== null && plan.merge !== null)
                splitMerge.commands.merge(windowId, plan.merge);
        },
        {
            enabled: enabled && plan.merge !== null,
            disabledReason: plan.mergeReason,
        },
        enabled,
    );
}

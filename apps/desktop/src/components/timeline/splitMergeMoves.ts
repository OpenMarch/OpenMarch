import { toast } from "sonner";
import tolgee from "@/global/singletons/Tolgee";
import type { DbConnection } from "@/db-functions/types";
import { subscribeHistoryChanges } from "@/db-functions/history";
import {
    mergeFits,
    mergeMoves,
    splitMarchersIntoNewMove,
    splitMembershipBlocker,
} from "@/db-functions/timelineSplitMoves";
import {
    useTimelineSelectionStore,
    type PageBox,
    type StoredTimelineMembership,
    type TimelineSelectionState,
} from "@/stores/TimelineSelectionStore";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";
import type { TimelineText } from "@/timeline/timelineText";
import { translateTimelineText } from "@/timeline/translateTimelineText";
import {
    isPageTimeline,
    moveLabels,
    pageTimelineOver as storedPageTimelineOver,
} from "@/timeline/timelineViewModel";
import type { TimelineMenuEntry } from "./TimelineRangeMenu";
import type {
    TimelinePeelVerdict,
    TimelineMovePeelTarget,
} from "./TimelineClipPeel";

/**
 * Splitting a move and merging moves in the app (docs/timeline/ui.md UI-25): what the clip and page
 * box menus, the Move card, the command palette and the clip drag offer, and running each edit.
 * The entries are built from the store and the selected marchers when a menu opens; the writes are
 * `timelineSplitMoves.ts`. Basic mode (UI-19) offers none of it: callers don't pass these there.
 */

/** Why a split or a merge waits (UI-14's "Pause to…" pattern). */
export const pauseToSplit = () =>
    tolgee.t("timeline.split.paused", "Pause to split or merge moves.");

/** "Page 3", or "this page" when it has no name: a page's move, named inside a merge entry. */
const pageWords = (name: string | undefined) =>
    name !== undefined
        ? tolgee.t("timeline.merge.page", "Page {name}", { name })
        : tolgee.t("timeline.merge.thisPage", "this page");

/** What the entries read: the store's stored timelines and page boxes, and who is selected. */
export interface SplitMergeContext {
    readonly storedTimelines: readonly StoredTimelineMembership[];
    readonly pageBoxes: readonly PageBox[];
    readonly selectedMarcherIds: ReadonlySet<number>;
    readonly isPlaying: boolean;
}

/** The store's side of the context. */
export const splitMergeContext = (
    state: Pick<TimelineSelectionState, "storedTimelines" | "pageBoxes">,
    selectedMarcherIds: ReadonlySet<number>,
    isPlaying: boolean,
): SplitMergeContext => ({
    storedTimelines: state.storedTimelines ?? [],
    pageBoxes: state.pageBoxes,
    selectedMarcherIds,
    isPlaying,
});

const stored = (ctx: SplitMergeContext, id: number) =>
    ctx.storedTimelines.find((t) => t.id === id);

/** The page box a timeline's range is, if any. */
const boxOf = (
    ctx: SplitMergeContext,
    range: { readonly start: number; readonly end: number },
) => ctx.pageBoxes.find((b) => b.start === range.start && b.end === range.end);

/** Whether `t` is the page timeline a page box stands for (the oldest over it). */
const isPage = (ctx: SplitMergeContext, t: StoredTimelineMembership) =>
    isPageTimeline(t, ctx.storedTimelines, ctx.pageBoxes);

/** How the UI names a stored timeline: "Page 3" for a page's own, else its move label. */
export function timelineLabel(ctx: SplitMergeContext, id: number): string {
    const t = stored(ctx, id);
    if (!t) return tolgee.t("timeline.merge.thisMove", "this move");
    if (isPage(ctx, t)) {
        const name = boxOf(ctx, t)?.name;
        return pageWords(name);
    }
    return (
        moveLabels(ctx.storedTimelines, ctx.pageBoxes).get(id) ??
        t.name ??
        tolgee.t("timeline.moveName.unnamed")
    );
}

/** The page timeline over page box `range`, if one is stored. */
export function pageTimelineOver(
    ctx: SplitMergeContext,
    range: { readonly start: number; readonly end: number },
): StoredTimelineMembership | null {
    return storedPageTimelineOver(ctx.storedTimelines, ctx.pageBoxes, range);
}

/** The selected marchers in move `t`. */
const chosenIn = (ctx: SplitMergeContext, t: StoredTimelineMembership) =>
    [...ctx.selectedMarcherIds].filter((id) => t.marcherIds.has(id));

/** The selected marchers in move `timelineId`: the ones **Split** takes. */
export const selectedMembers = (
    ctx: SplitMergeContext,
    timelineId: number,
): number[] => {
    const t = stored(ctx, timelineId);
    return t ? chosenIn(ctx, t) : [];
};

const translateBlocker = (blocker: TimelineText | null) =>
    blocker && translateTimelineText(blocker);

/** Why splitting the selected marchers off `t` can't run, or `null` (the menus' and the drag's). */
const splitBlocker = (ctx: SplitMergeContext, t: StoredTimelineMembership) =>
    ctx.isPlaying
        ? pauseToSplit()
        : translateBlocker(
              splitMembershipBlocker(
                  t.marcherIds,
                  ctx.selectedMarcherIds,
                  timelineLabel(ctx, t.id),
                  { pageMove: isPage(ctx, t) },
              ),
          );

/** **Split N selected into new move** on move `timelineId`: its words and why it can't run. */
export function splitEntryState(
    ctx: SplitMergeContext,
    timelineId: number,
): { label: string; disabledReason: string | null } | null {
    const t = stored(ctx, timelineId);
    if (!t) return null;
    const n = chosenIn(ctx, t).length;
    const label =
        n > 0
            ? tolgee.t(
                  "timeline.split.menu",
                  "{count, plural, one {Split # selected into new move} other {Split # selected into new move}}",
                  { count: n },
              )
            : tolgee.t(
                  "timeline.split.menuNone",
                  "Split selected into new move",
              );
    return { label, disabledReason: splitBlocker(ctx, t) };
}

/** Why merging `sourceId` into `targetId` can't run, or `null`. */
export function mergeBlocker(
    ctx: SplitMergeContext,
    sourceId: number,
    targetId: number,
): string | null {
    if (ctx.isPlaying) return pauseToSplit();
    const source = stored(ctx, sourceId);
    const target = stored(ctx, targetId);
    if (!source || !target || source.id === target.id)
        return tolgee.t("timeline.merge.pickTwo", "Pick two moves to merge.");
    const both = [...source.marcherIds].filter((id) =>
        target.marcherIds.has(id),
    );
    if (both.length > 0)
        return tolgee.t(
            "timeline.merge.inBoth",
            "{count, plural, =1 {A marcher is} other {# marchers are}} in both moves, so merging would give them two moves at once.",
            { count: both.length },
        );
    return null;
}

/**
 * Which way two moves merge (UI-25, _lead default_, V-333): into the page's own timeline when one
 * of them is it (the page box keeps standing for it), else into `preferredTarget`.
 */
export function mergeDirection(
    ctx: SplitMergeContext,
    a: number,
    preferredTarget: number,
): { sourceId: number; targetId: number } {
    const ta = stored(ctx, a);
    return ta && isPage(ctx, ta)
        ? { sourceId: preferredTarget, targetId: a }
        : { sourceId: a, targetId: preferredTarget };
}

/**
 * "Merge Move 6 into Page 3", or "Merge into Page 3" for the move's own menu and the drop; with
 * "· fit to its counts" when the source's counts are fitted to the target's (owner, 2026-10-18).
 */
const mergeLabel = (
    ctx: SplitMergeContext,
    sourceId: number,
    targetId: number,
    withSource: boolean,
) => {
    const source = stored(ctx, sourceId);
    const target = stored(ctx, targetId);
    const fits = !!source && !!target && mergeFits(source, target);
    const names = {
        source: timelineLabel(ctx, sourceId),
        target: timelineLabel(ctx, targetId),
    };
    if (withSource)
        return fits
            ? tolgee.t(
                  "timeline.merge.menuPairFit",
                  "Merge {source} into {target} · fit to its counts",
                  names,
              )
            : tolgee.t(
                  "timeline.merge.menuPair",
                  "Merge {source} into {target}",
                  names,
              );
    return fits
        ? tolgee.t(
              "timeline.merge.menuIntoFit",
              "Merge into {target} · fit to its counts",
              names,
          )
        : tolgee.t("timeline.merge.menuInto", "Merge into {target}", names);
};

/**
 * The page timelines of the page boxes `t` overlaps, in page order, `t` itself left out: the
 * pages its menu offers to merge into (fitting it to the page's counts when they differ).
 */
export const overlappedPageTimelines = (
    ctx: SplitMergeContext,
    t: StoredTimelineMembership,
): StoredTimelineMembership[] =>
    [...ctx.pageBoxes]
        .filter((b) => b.start < t.end && t.start < b.end)
        .sort((a, b) => a.start - b.start)
        .flatMap((b) => {
            const page = pageTimelineOver(ctx, b);
            return page && page.id !== t.id ? [page] : [];
        });

/** The commands the entries and the drag run (`createSplitMergeCommands`). */
export interface SplitMergeCommands {
    readonly split: (timelineId: number, marcherIds: readonly number[]) => void;
    readonly merge: (sourceId: number, targetId: number) => void;
}

/**
 * A clip's split and merge entries (UI-25): **Split N selected into new move**; **Merge into Page
 * N** for each page the move overlaps that has its own timeline (fitted to the page's counts when
 * they differ, owner 2026-10-18); and, with a second
 * move selected beside it (Shift+click), **Merge Move 7 into Move 6** (into the clip right-clicked,
 * or into the page's timeline when that is one of them).
 */
export function moveMenuEntries(
    ctx: SplitMergeContext,
    timelineId: number,
    pairedTimelineId: number | null,
    windowTimelineId: number | null,
    commands: SplitMergeCommands,
): TimelineMenuEntry[] {
    const t = stored(ctx, timelineId);
    if (!t) return [];
    const entries: TimelineMenuEntry[] = [];
    const split = splitEntryState(ctx, timelineId);
    if (split)
        entries.push({
            id: "split",
            icon: "split",
            ...split,
            onSelect: () => commands.split(timelineId, chosenIn(ctx, t)),
        });
    const pages = isPage(ctx, t) ? [] : overlappedPageTimelines(ctx, t);
    for (const [i, page] of pages.entries())
        entries.push({
            id: i === 0 ? "merge-into-page" : `merge-into-page-${page.id}`,
            icon: "merge",
            label: mergeLabel(ctx, timelineId, page.id, false),
            disabledReason: mergeBlocker(ctx, timelineId, page.id),
            onSelect: () => commands.merge(timelineId, page.id),
        });
    // The other of the two selected moves: the paired one, or the window's when this is paired
    const other =
        pairedTimelineId === null
            ? null
            : pairedTimelineId === timelineId
              ? windowTimelineId
              : pairedTimelineId;
    if (
        other !== null &&
        other !== timelineId &&
        !pages.some((p) => p.id === other)
    ) {
        const { sourceId, targetId } = mergeDirection(ctx, other, timelineId);
        entries.push({
            id: "merge-pair",
            icon: "merge",
            label: mergeLabel(ctx, sourceId, targetId, true),
            disabledReason: mergeBlocker(ctx, sourceId, targetId),
            onSelect: () => commands.merge(sourceId, targetId),
        });
    }
    return entries;
}

/** A page box's entry (UI-25): **Split N selected into new move** off its page timeline. */
export function pageMenuEntries(
    ctx: SplitMergeContext,
    range: { readonly start: number; readonly end: number } | null,
    commands: SplitMergeCommands,
): TimelineMenuEntry[] {
    if (!range) return [];
    const page = pageTimelineOver(ctx, range);
    // Its timeline is gone, or left empty with a move split off it whole (#581). Only a move over
    // the box's counts is a clip to split instead
    const clipOver =
        page !== null &&
        ctx.storedTimelines.some(
            (t) =>
                t.id !== page.id &&
                t.start === range.start &&
                t.end === range.end &&
                t.marcherIds.size > 0,
        );
    if (!page || page.marcherIds.size === 0)
        return ctx.selectedMarcherIds.size === 0
            ? []
            : [
                  {
                      id: "split",
                      icon: "split",
                      label: tolgee.t(
                          "timeline.split.menuNone",
                          "Split selected into new move",
                      ),
                      disabledReason: clipOver
                          ? tolgee.t(
                                "timeline.split.pageSplitOff",
                                "This page has no move of its own. To split a move over it, use the move's clip.",
                            )
                          : tolgee.t(
                                "timeline.split.nothingOnPage",
                                "Nothing moves on this page yet, so there is nothing to split.",
                            ),
                      onSelect: () => {},
                  },
              ];
    const split = splitEntryState(ctx, page.id)!;
    return [
        {
            id: "split",
            icon: "split",
            ...split,
            onSelect: () => commands.split(page.id, chosenIn(ctx, page)),
        },
    ];
}

/** The drag-out preview (UI-25): "Split 8 marchers", the reason it can't, or nothing to do. */
export function splitVerdict(
    ctx: SplitMergeContext,
    timelineId: number,
): TimelinePeelVerdict | null {
    const t = stored(ctx, timelineId);
    if (!t) return null;
    const n = chosenIn(ctx, t).length;
    // Without members selected a vertical drag does nothing new
    if (n === 0) return null;
    const reason = splitBlocker(ctx, t);
    if (reason) return { label: reason, refused: true };
    return {
        label: tolgee.t(
            "timeline.split.drag",
            "Split {count, plural, one {# marcher} other {# marchers}}",
            { count: n },
        ),
    };
}

/** The move or page timeline a drop target stands for, by id. */
export function dropTargetTimeline(
    ctx: SplitMergeContext,
    target: TimelineMovePeelTarget,
    pageRangeOf: (
        pageId: number,
    ) => { readonly start: number; readonly end: number } | null,
): { id: number } | { missing: string } {
    if ("timelineId" in target) return { id: target.timelineId };
    const range = pageRangeOf(target.pageId);
    const page = range ? pageTimelineOver(ctx, range) : null;
    if (page) return { id: page.id };
    const name = range ? boxOf(ctx, range)?.name : undefined;
    return {
        missing:
            name !== undefined
                ? tolgee.t(
                      "timeline.merge.noPageMove",
                      "Page {page} has no move of its own to merge into.",
                      { page: name },
                  )
                : tolgee.t(
                      "timeline.merge.noPageMoveUnnamed",
                      "This page has no move of its own to merge into.",
                  ),
    };
}

/** The drag-to-merge preview (UI-25): "Merge into Page 3", or why not. */
export function mergeVerdict(
    ctx: SplitMergeContext,
    sourceId: number,
    target: TimelineMovePeelTarget,
    pageRangeOf: (
        pageId: number,
    ) => { readonly start: number; readonly end: number } | null,
): TimelinePeelVerdict | null {
    const resolved = dropTargetTimeline(ctx, target, pageRangeOf);
    if ("missing" in resolved)
        return { label: resolved.missing, refused: true };
    if (resolved.id === sourceId) return null;
    const reason = mergeBlocker(ctx, sourceId, resolved.id);
    if (reason) return { label: reason, refused: true };
    return { label: mergeLabel(ctx, sourceId, resolved.id, false) };
}

/** Resolves once the store's stored timelines satisfy `ready`, or after `ms` regardless. */
const whenStored = (
    ready: (timelines: readonly StoredTimelineMembership[]) => boolean,
    ms = 4000,
): Promise<void> =>
    new Promise((resolve) => {
        const check = () => {
            const timelines =
                useTimelineSelectionStore.getState().storedTimelines;
            return timelines !== null && ready(timelines);
        };
        if (check()) return resolve();
        const timer = setTimeout(() => {
            unsubscribe();
            resolve();
        }, ms);
        const unsubscribe = useTimelineSelectionStore.subscribe(() => {
            if (!check()) return;
            clearTimeout(timer);
            unsubscribe();
            resolve();
        });
    });

/** How long a split or merge toast stays, unless the next edit, undo or redo closes it first */
const TOAST_MS = 8000;

/** A success toast with **Undo** that closes on the next history change (as UI-14's delete toast). */
function toastWithUndo(message: string, undo: () => void): void {
    let unsubscribe = () => {};
    const id = toast.success(message, {
        duration: TOAST_MS,
        action: { label: tolgee.t("actions.edit.undo", "Undo"), onClick: undo },
        onDismiss: () => unsubscribe(),
        onAutoClose: () => unsubscribe(),
    });
    unsubscribe = subscribeHistoryChanges(() => {
        unsubscribe();
        toast.dismiss(id);
    });
}

/** "Split 8 marchers into Move 6". */
export const splitMessage = (count: number, label: string) =>
    tolgee.t(
        "timeline.split.done",
        "Split {count, plural, one {# marcher} other {# marchers}} into {label}",
        { count, label },
    );

/** "Merged Move 6 into Page 3". */
export const mergeMessage = (source: string, target: string) =>
    tolgee.t("timeline.merge.done", "Merged {source} into {target}", {
        source,
        target,
    });

/**
 * One split or merge at a time, app-wide: the timeline panel, the Move card and the command
 * palette each build their commands, but share this guard, so a second edit can't start while one
 * is still writing or waiting for the store.
 */
let busy = false;

/**
 * The split and merge edits (UI-25), each one undoable edit with a toast and **Undo**:
 *
 * - **Split** makes the new move, then selects and isolates it (the window comes back to the old
 *   move on Esc, or when undo takes the new move away).
 * - **Merge** moves the source's marchers into the target and deletes the source, then selects the
 *   target: its page box for a page's timeline, else its clip. An isolated source ends isolation
 *   first (the store's "timeline goes away" path).
 *
 * A refusal is a toast (P8.6).
 */
export function createSplitMergeCommands({
    database,
    undo,
    context,
}: {
    database: DbConnection;
    undo: () => void;
    /** Read when a command runs, for names */
    context: () => SplitMergeContext;
}): SplitMergeCommands {
    return {
        split: (timelineId, marcherIds) => {
            if (busy || marcherIds.length === 0) return;
            busy = true;
            splitMarchersIntoNewMove({ db: database, timelineId, marcherIds })
                .then(async (result) => {
                    const id = result.timeline.id;
                    await whenStored((ts) => ts.some((t) => t.id === id));
                    const label = timelineLabel(context(), id);
                    toastWithUndo(
                        splitMessage(result.marcherIds.length, label),
                        undo,
                    );
                    const store = useTimelineSelectionStore.getState();
                    // From inside an isolated move, the first restore point is kept
                    store.isolate(id);
                })
                .catch((error: unknown) => toastTimelineError(error))
                .finally(() => {
                    busy = false;
                });
        },
        merge: (sourceId, targetId) => {
            if (busy) return;
            busy = true;
            const before = context();
            const source = timelineLabel(before, sourceId);
            const target = timelineLabel(before, targetId);
            const targetRow = stored(before, targetId);
            const targetIsPage = targetRow ? isPage(before, targetRow) : false;
            mergeMoves({ db: database, sourceId, targetId })
                .then(async () => {
                    await whenStored(
                        (ts) => !ts.some((t) => t.id === sourceId),
                    );
                    toastWithUndo(mergeMessage(source, target), undo);
                    const store = useTimelineSelectionStore.getState();
                    if (store.isolation?.timelineId === targetId) return;
                    const t = store.storedTimelines?.find(
                        (x) => x.id === targetId,
                    );
                    if (!t) return;
                    if (targetIsPage) store.selectRange(t.start, t.end);
                    else store.selectRange(t.start, t.end, targetId);
                })
                .catch((error: unknown) => toastTimelineError(error))
                .finally(() => {
                    busy = false;
                });
        },
    };
}

import { useMemo } from "react";
import { toast } from "sonner";
import type { Resolver, SpanInfo, TransitionRow } from "@openmarch/core";
import tolgee from "@/global/singletons/Tolgee";
import type Page from "@/global/classes/Page";
import type { TimelineClearPageMenu } from "@/components/timeline/TimelineRangeMenu";
import {
    setMarchersToNeighborPage,
    type NeighborPageScope,
} from "@/utilities/setMarchersToNeighborPage";
import { samePosition } from "@/db-functions/timelineMoves";
import {
    useTimelineSelectionStore,
    type PageBox,
    type StoredTimelineMembership,
} from "@/stores/TimelineSelectionStore";
import type { HeldMark } from "@/db-functions/timelineHeldMarks";
import { usePlacedBoxStore } from "@/shapes/placed/placedBoxStore";
import { useHeldMarksStore } from "./useHeldMarks";
import { getTimelineHost } from "./timelineStore";
import { pageEndBeat } from "./timelineCanvas";
import { followingPages, pageKeepStates } from "./timelineKeepLater";
import { keepPagesOfBoxes } from "./timelineOnlyThisPage";
import type { PageBoxRange } from "./timelinePageBoxState";
import { resolverSpans, useTimelineResolverStore } from "./timelineStore";
import { moveMarchersAndOfferFollowUp } from "./timelineMoveThemToo";
import { toastTimelineError } from "./timelineErrorMessages";
import type { HoldEntryState } from "./holdMenuState";

/**
 * **Clear Page N** and **Clear Page N, Pages N–M move back too** (#573), worded as Remove keyframe's
 * pair (`timelineUnset.ts`). Clear this page takes the marchers out of every move over the page,
 * so it is Not defined; the later pages that showed its spot either keep where they were (the first
 * item: the next page gets a move of its own) or follow back to the page before (the second). The
 * second is offered only when some later page really takes the page's spot
 * (`clearFollowingPages`); otherwise the two would do the same.
 */

/** A translate function, as Tolgee's `t` with a default value. */
type Translate = (
    key: string,
    defaultValue: string,
    params?: Record<string, string>,
) => string;

const tolgeeTranslate: Translate = (key, defaultValue, params) =>
    tolgee.t(key, defaultValue, params);

/**
 * What makes the clear leave a marcher as it is, or follow back either way, as the renderer reads
 * it (`clearPageSkipsNow`). Each is optional, so a caller without it counts nobody for it.
 */
export interface ClearPageSkips {
    /** The stored Held marks (`useHeldMarksStore`) */
    readonly held?: readonly HeldMark[];
    /** The resolver's transitions, for follow-the-leader and shape-backed rows */
    readonly transitions?: Readonly<Record<number, TransitionRow>>;
    /** The shape recipes and their members (`usePlacedBoxStore`) */
    readonly recipes?: readonly {
        readonly timelineId: number | null;
        readonly members: readonly { readonly marcherId: number }[];
    }[];
    /** The stored moves and who is in them (`storedTimelines`), to place the recipes */
    readonly timelines?: readonly StoredTimelineMembership[] | null;
}

/** `ClearPageSkips` from the stores as they are now. */
export function clearPageSkipsNow(): ClearPageSkips {
    return {
        held: useHeldMarksStore.getState().marks,
        transitions: getTimelineHost()?.snapshot.transitions,
        recipes: usePlacedBoxStore.getState().recipes,
        timelines: useTimelineSelectionStore.getState().storedTimelines,
    };
}

/** Whether `marcherId` is in a shape recipe of a move that `over` says yes to. */
const inShapeOf = (
    skips: ClearPageSkips,
    marcherId: number,
    over: (move: StoredTimelineMembership) => boolean,
): boolean =>
    (skips.recipes ?? []).some(
        (r) =>
            r.timelineId !== null &&
            r.members.some((m) => m.marcherId === marcherId) &&
            (skips.timelines ?? []).some(
                (t) =>
                    t.id === r.timelineId &&
                    t.marcherIds.has(marcherId) &&
                    over(t),
            ),
    );

/**
 * The later pages that would follow back if `marcherIds` were cleared from the page box `box`
 * instead of keeping them (plain **Clear Page N**), in page order, or null when following back
 * would change nothing. A marcher counts when the clear takes it out of the page and moves it
 * (it has a move of its own over the page that leaves it somewhere else than where the page
 * starts, and isn't a shape or follow-the-leader member, whom the clear leaves), and plain Clear
 * would keep the next page for it (`keepNextPageInTransaction`):
 *
 * - the run of boxes it follows into with no move of its own (`followingPages`), or
 * - the next page alone, when a move of its runs through that page's flag (plain Clear cuts it
 *   there; the pages after are unchanged either way), unless that move starts after another move
 *   of its own that ends after the page: it starts from there, so following back changes nothing.
 *
 * A marcher whose Held hold starts at the next page doesn't count: the clear drops that hold and
 * it follows back with either item (holds decision 17).
 */
export function clearFollowingPages({
    resolver,
    boxes,
    marcherIds,
    box,
    skips = {},
}: {
    resolver: Resolver | null;
    boxes: readonly PageBox[];
    marcherIds: readonly number[];
    box: PageBoxRange;
    skips?: ClearPageSkips;
}): string[] | null {
    if (!resolver || marcherIds.length === 0) return null;
    const pages = keepPagesOfBoxes(boxes);
    const index = pages.findIndex(
        (p) => p.range?.start === box.start && p.flag === box.end,
    );
    const page = pages[index];
    if (!page) return null;
    const spansOf = (id: number) => resolverSpans(resolver, id);
    const transitionOf = (s: SpanInfo) =>
        s.transitionId === null
            ? undefined
            : skips.transitions?.[s.transitionId];
    const heldNext = new Set(
        (skips.held ?? [])
            .filter((m) => m.start === box.end)
            .map((m) => m.marcherId),
    );
    const cleared = marcherIds.filter((id) => {
        if (heldNext.has(id)) return false;
        const own = spansOf(id).filter(
            (s) => s.kind !== "hold" && s.start < box.end && s.end > box.start,
        );
        return (
            own.length > 0 &&
            !own.some((s) => transitionOf(s)?.style === "follow_the_leader") &&
            !inShapeOf(
                skips,
                id,
                (t) => t.start < box.end && t.end > box.start,
            ) &&
            !samePosition(
                resolver.positionAt(id, box.end),
                resolver.positionAt(id, box.start),
            )
        );
    });
    if (cleared.length === 0) return null;
    const states = pageKeepStates({ pages, marcherIds: cleared, spansOf });
    const following = followingPages(states, page.id)?.names;
    if (following) return following;
    // A move running through the next page's flag, which plain Clear cuts there
    const next = pages[index + 1];
    const flag = next?.range ? next.flag : undefined;
    if (!next || flag === undefined) return null;
    const cut = cleared.some((id) => {
        const spans = spansOf(id).filter((s) => s.kind !== "hold");
        const across = spans.filter((s) => s.start < flag && s.end > flag);
        return (
            across.length === 1 &&
            // It starts from where a move of the marcher's own after the page leaves it, so
            // clearing the page doesn't change it
            !spans.some((s) => s.end > box.end && s.end <= across[0]!.start) &&
            transitionOf(across[0]!)?.style !== "follow_the_leader" &&
            (transitionOf(across[0]!)?.dest ?? null) === null &&
            !inShapeOf(skips, id, (t) => t.start < flag && t.end > flag)
        );
    });
    return cut ? [next.name] : null;
}

/** "Clear Page 3" */
export function clearPageLabel(
    page: string,
    translate: Translate = tolgeeTranslate,
): string {
    return translate("actions.batchEdit.clearPage", "Clear Page {page}", {
        page,
    });
}

/** "Clear Page 3, Page 4 moves back too" or "Clear Page 3, Pages 4–6 move back too" */
export function clearPageFollowingLabel(
    page: string,
    following: readonly string[],
    translate: Translate = tolgeeTranslate,
): string {
    const first = following[0] ?? "";
    const last = following[following.length - 1] ?? first;
    return first === last
        ? translate(
              "actions.batchEdit.clearPageAndPage",
              "Clear Page {page}, Page {next} moves back too",
              { page, next: first },
          )
        : translate(
              "actions.batchEdit.clearPageAndPages",
              "Clear Page {page}, Pages {first}–{last} move back too",
              { page, first, last },
          );
}

/** A menu label for the command palette, saying who it acts on: "Clear Page 3 (selected)". */
export function clearPageScopedLabel(
    label: string,
    scope: "all" | "selected",
    translate: Translate = tolgeeTranslate,
): string {
    return scope === "all"
        ? translate(
              "actions.batchEdit.forAllMarchers",
              "{label} (all marchers)",
              {
                  label,
              },
          )
        : translate("actions.batchEdit.forSelected", "{label} (selected)", {
              label,
          });
}

/** The two items' labels for one page and some marchers. */
export interface ClearPageLabels {
    /** "Clear Page 3" */
    readonly clear: string;
    /** "Clear Page 3, Pages 4–6 move back too", or null when no later page would follow back */
    readonly followBack: string | null;
}

/**
 * The labels for clearing `marcherIds` from `page` (its name and box), from the show as it is now;
 * null without a page box (the first page). For labels read on demand (the command palette), so
 * the follow-back check doesn't run on every edit while nothing shows them.
 */
export function clearPageLabelsNow(
    page: ClearPagePage | null,
    marcherIds: readonly number[],
): ClearPageLabels | null {
    if (!page) return null;
    return clearPageLabels({
        page,
        marcherIds,
        resolver: useTimelineResolverStore.getState().resolver,
        boxes: useTimelineSelectionStore.getState().pageBoxes,
        skips: clearPageSkipsNow(),
    });
}

/**
 * Reads the follow-back label for clearing marchers from a page (`clearFollowingPages`), or null
 * when nothing would follow back or there's no page, from the show as it is now. It keeps its last
 * answers until the show, the page, the marcher list or the language changes, so the command
 * palette's enabled and label reads of one action run the check once.
 *
 * @param check the follow-back check, for tests
 */
export function clearPageFollowBackReader(
    check: typeof clearFollowingPages = clearFollowingPages,
): (
    page: ClearPagePage | null,
    marcherIds: readonly number[],
) => string | null {
    const cache = new Map<
        readonly number[],
        { key: readonly unknown[]; label: string | null }
    >();
    return (page, marcherIds) => {
        if (!page) return null;
        const { resolver, version } = useTimelineResolverStore.getState();
        const boxes = useTimelineSelectionStore.getState().pageBoxes;
        const skips = clearPageSkipsNow();
        const key = [
            page,
            resolver,
            version,
            boxes,
            skips.held,
            skips.transitions,
            skips.recipes,
            skips.timelines,
            tolgee.getLanguage(),
        ];
        const hit = cache.get(marcherIds);
        if (hit && hit.key.every((k, i) => k === key[i])) return hit.label;
        const following = check({
            resolver,
            boxes,
            marcherIds,
            box: page.box,
            skips,
        });
        const label = following
            ? clearPageFollowingLabel(page.name, following)
            : null;
        // One entry per marcher list in use (all and selected); an old list goes
        cache.delete(marcherIds);
        cache.set(marcherIds, { key, label });
        if (cache.size > 2) cache.delete(cache.keys().next().value!);
        return label;
    };
}

function clearPageLabels({
    page,
    ...check
}: {
    page: ClearPagePage;
    marcherIds: readonly number[];
    resolver: Resolver | null;
    boxes: readonly PageBox[];
    skips: ClearPageSkips;
}): ClearPageLabels {
    const following = clearFollowingPages({ ...check, box: page.box });
    return {
        clear: clearPageLabel(page.name),
        followBack: following
            ? clearPageFollowingLabel(page.name, following)
            : null,
    };
}

/**
 * The labels for clearing `marcherIds` from `page` (its name and box), kept current with the show;
 * null without a page box (the first page). Mount it only while the labels show (an open menu).
 */
export function useClearPageLabels(
    page: ClearPagePage | null,
    marcherIds: readonly number[],
): ClearPageLabels | null {
    const resolver = useTimelineResolverStore((s) => s.resolver);
    const version = useTimelineResolverStore((s) => s.version);
    const boxes = useTimelineSelectionStore((s) => s.pageBoxes);
    const held = useHeldMarksStore((s) => s.marks);
    const recipes = usePlacedBoxStore((s) => s.recipes);
    const timelines = useTimelineSelectionStore((s) => s.storedTimelines);
    const name = page?.name;
    const start = page?.box.start;
    const end = page?.box.end;
    return useMemo(() => {
        void version; // a new version means new spans and transitions
        if (name === undefined || start === undefined || end === undefined)
            return null;
        return clearPageLabels({
            page: { name, box: { start, end } },
            marcherIds,
            resolver,
            boxes,
            skips: {
                held,
                recipes,
                timelines,
                transitions: getTimelineHost()?.snapshot.transitions,
            },
        });
    }, [
        resolver,
        version,
        boxes,
        held,
        recipes,
        timelines,
        marcherIds,
        name,
        start,
        end,
    ]);
}

/** The page Clear this page acts on, as `useClearPageLabels` reads it. */
export interface ClearPagePage {
    readonly name: string;
    readonly box: PageBoxRange;
}

/**
 * `page`'s name and box, stable while they are; null for the first page (it has no box) or none.
 */
export function useClearPagePage(
    page: {
        readonly name: string;
        readonly previousPageId: number | null;
        readonly beats: readonly { readonly index: number }[];
    } | null,
): ClearPagePage | null {
    const name = page?.name;
    const start =
        page && page.previousPageId !== null ? page.beats[0]?.index : undefined;
    const end = start === undefined || !page ? undefined : pageEndBeat(page);
    return useMemo(
        () =>
            name === undefined || start === undefined || end === undefined
                ? null
                : { name, box: { start, end } },
        [name, start, end],
    );
}

/**
 * The page box menu's **Clear Page N** entries (#573), next to Define as shown and Hold from previous
 * page: for the selected marchers, or every performer when none is selected (then the label says
 * so). The labels are read when the menu opens, from the resolver as it is then. Each runs the
 * same command as the Alignment tab and inspector items, on the right-clicked page.
 *
 * @param run the command, for tests; defaults to `clearPageOn`
 */
export function clearPageMenu({
    pages,
    selectedIds,
    performerIds,
    entryOn,
    run = clearPageOn,
}: {
    pages: readonly Page[];
    selectedIds: readonly number[];
    performerIds: readonly number[];
    /**
     * Clear this page's entry for the selection on a page (`useHoldCommands`'s `entriesOn`): when
     * it's checked, the entry shows ticked and off. Read only for the selected marchers
     */
    entryOn?: (pageId: string | number) => HoldEntryState | null | undefined;
    run?: (args: ClearPageArgs) => Promise<unknown>;
}): TimelineClearPageMenu {
    const scope = selectedIds.length > 0 ? "selected" : "all";
    const marcherIds = scope === "selected" ? selectedIds : performerIds;
    const pageOf = (pageId: string | number) =>
        pages.find((p) => String(p.id) === String(pageId));
    return {
        labelsFor: (pageId) => {
            const page = pageOf(pageId);
            const first = page?.beats[0];
            if (!page || page.previousPageId === null || !first)
                return undefined;
            const labels = clearPageLabelsNow(
                {
                    name: page.name,
                    box: { start: first.index, end: pageEndBeat(page) },
                },
                marcherIds,
            )!;
            const say = (label: string) =>
                scope === "all" ? clearPageScopedLabel(label, "all") : label;
            return {
                clear: say(labels.clear),
                followBack: labels.followBack ? say(labels.followBack) : null,
                checked:
                    scope === "selected" &&
                    (entryOn?.(pageId)?.checked ?? false),
            };
        },
        onClear: (pageId, followBack) => {
            const page = pageOf(pageId);
            if (!page) return;
            void run({ page, pages, scope, marcherIds, followBack });
        },
    };
}

/** What `clearPageOn` clears. */
export interface ClearPageArgs {
    page: Page;
    pages: readonly Page[];
    scope: NeighborPageScope;
    marcherIds: readonly number[];
    followBack: boolean;
}

/**
 * Clear this page for `marcherIds` on `page` (`setMarchersToNeighborPage`), as the batch-edit
 * actions run it: no message when everyone was cleared, a quiet one for a partial result, and a
 * refusal's toast.
 */
export function clearPageOn({
    page,
    pages,
    scope,
    marcherIds,
    followBack,
}: ClearPageArgs): Promise<number | null> {
    return setMarchersToNeighborPage({
        direction: "previous",
        scope,
        selectedPage: page,
        pages: [...pages],
        selectedMarcherIds: marcherIds,
        performerIds: marcherIds,
        followBack,
        writeTimeline: (request) =>
            moveMarchersAndOfferFollowUp(request).catch((e: unknown) => {
                toastTimelineError(e, "Error clearing the page");
                throw e;
            }),
        notify: {
            success: (message) => toast.success(message),
            error: (message) => toast.error(message),
            note: (message) => toast.message(message),
        },
        t: (key, params) => tolgee.t(key, params as never),
    });
}

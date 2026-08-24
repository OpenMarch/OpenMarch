import { useQueries, useQuery } from "@tanstack/react-query";
import {
    allMarchersQueryOptions,
    marcherPagesByMarcherQueryOptions,
} from "../queries";
import { useTimingObjects } from "../useTimingObjects";
import { MarcherTimeline } from "@openmarch/core";
import { useCallback, useMemo, useRef } from "react";
import { getAllCoordinatesAtTime } from "@/services/rendering/get-coordinates-at-time";
import { dbToMarcherTimeline } from "@/services/rendering/db-to-timeline";

/**
 * A stable (module-level) select function so `useQuery` can reuse its cached
 * result across re-renders instead of recomputing `.map().sort()` every time.
 * See the memoization note on `useTimingObjects` for why this matters.
 */
const selectMarcherIds = (result: { id: number }[]) =>
    result.map((marcher) => marcher.id).sort();

/**
 * True when every page has a matching coordinate. Used to gate timeline
 * construction while React Query still holds stale marcher_pages after pages
 * refetch first (e.g. undo of a page delete).
 */
export const _coordinatesCoverPages = (
    coordinates: { page_id: number }[],
    pages: { page_id: number }[],
): boolean => {
    const pageIds = new Set(coordinates.map((c) => c.page_id));
    return pages.every((p) => pageIds.has(p.page_id));
};

/** Per-marcher timeline plus the query `data` reference it was built from. */
type CachedMarcherTimeline = {
    data: { page_id: number; x: number; y: number }[];
    timeline: MarcherTimeline;
};

export type TimelineCombineCache = {
    /** The `pagesForTimeline` reference the cache was last built against. */
    pagesForTimeline: { page_id: number; timestamp: number }[] | null;
    perMarcher: Map<number, CachedMarcherTimeline>;
    lastMarcherIds: number[] | null;
    lastResult:
        | { marcherIds: number[]; marcherTimelines: MarcherTimeline[] }
        | undefined;
};

export const createTimelineCombineCache = (): TimelineCombineCache => ({
    pagesForTimeline: null,
    perMarcher: new Map(),
    lastMarcherIds: null,
    lastResult: undefined,
});

/**
 * Pure combine step for `useMarcherTimelines`. TanStack Query calls
 * `combine` whenever *any* underlying query's result object changes —
 * including `isFetching` flipping to `true` on invalidation, before `data`
 * updates. Rebuilding every marcher's timeline (and returning a new
 * top-level object) on every such call recreates `renderingCallback` /
 * `updateCoordinates` downstream, which re-triggers `useAnimation`'s repaint
 * effect even when nothing actually changed.
 *
 * This reuses a marcher's previously built `MarcherTimeline` — and the whole
 * result object — by reference whenever the underlying query `data`
 * references haven't changed, so no-op query-state transitions don't cause
 * a repaint.
 */
export const combineMarcherTimelines = (
    cache: TimelineCombineCache,
    marcherIds: number[] | undefined,
    pagesForTimeline: { page_id: number; timestamp: number }[],
    marcherPages: {
        data: { page_id: number; x: number; y: number }[] | undefined;
    }[],
):
    | { marcherIds: number[]; marcherTimelines: MarcherTimeline[] }
    | undefined => {
    if (
        marcherIds == null ||
        marcherPages.some(
            (mp) =>
                mp == null ||
                mp.data == null ||
                !_coordinatesCoverPages(mp.data, pagesForTimeline),
        )
    )
        return undefined;

    // Page timing changed — every cached timeline embeds its timestamps, so
    // the whole per-marcher cache is stale and must be rebuilt.
    if (cache.pagesForTimeline !== pagesForTimeline) {
        cache.perMarcher = new Map();
        cache.pagesForTimeline = pagesForTimeline;
    }

    let anyChanged = cache.lastMarcherIds !== marcherIds;

    const marcherTimelines = marcherPages.map((result, index) => {
        const marcherId = marcherIds[index];
        const cached = cache.perMarcher.get(marcherId);
        if (cached && cached.data === result.data) {
            return cached.timeline;
        }
        anyChanged = true;
        const timeline = dbToMarcherTimeline(result.data!, pagesForTimeline);
        cache.perMarcher.set(marcherId, { data: result.data!, timeline });
        return timeline;
    });

    // Prune entries for marchers no longer present (e.g. a deleted marcher).
    if (cache.perMarcher.size > marcherIds.length) {
        const idSet = new Set(marcherIds);
        for (const id of cache.perMarcher.keys()) {
            if (!idSet.has(id)) cache.perMarcher.delete(id);
        }
    }

    if (!anyChanged && cache.lastResult) {
        return cache.lastResult;
    }

    const nextResult = { marcherIds, marcherTimelines };
    cache.lastMarcherIds = marcherIds;
    cache.lastResult = nextResult;
    return nextResult;
};

export const useMarcherTimelines = ():
    | {
          /** List of marcher ids whose timelines are being returned */
          marcherIds: number[];
          /** List of `MarcherTimelines` in the same order as the marcher ids */
          marcherTimelines: MarcherTimeline[];
      }
    | undefined => {
    const { data: marcherIds } = useQuery({
        ...allMarchersQueryOptions(),
        select: selectMarcherIds,
    });
    const { pages } = useTimingObjects();

    const pagesForTimeline = useMemo(
        () =>
            pages.map((page) => ({
                page_id: page.id,
                // Page timestamps/durations are in seconds; `MarcherTimeline`
                // (and everything that queries it, e.g. the frame clock) is
                // in milliseconds.
                timestamp: (page.timestamp + page.duration) * 1000,
            })),
        [pages],
    );

    // Must be stable across re-renders (not rebuilt inline) so each query's
    // `select` closure stays referentially stable too, otherwise TanStack
    // Query treats it as a new select every render and never caches it.
    // https://tanstack.com/query/latest/docs/framework/react/reference/useQueries#memoization
    const queries = useMemo(
        () =>
            marcherIds?.map((marcherId) =>
                marcherPagesByMarcherQueryOptions(marcherId),
            ) ?? [],
        [marcherIds],
    );

    const timelineCacheRef = useRef(createTimelineCombineCache());

    // Also must be stable — see comment above.
    const combine = useCallback(
        (
            marcherPages: {
                data: { page_id: number; x: number; y: number }[] | undefined;
            }[],
        ) =>
            combineMarcherTimelines(
                timelineCacheRef.current,
                marcherIds,
                pagesForTimeline,
                marcherPages,
            ),
        [marcherIds, pagesForTimeline],
    );

    return useQueries({ queries, combine });
};

/**
 * Coordinates are returned as a flat `Float32Array` of `[x,y]` values. E.g. `[x1, y1, x2, y2, ...]`
 * The marcher IDs these coordinates map to are returned in the marcherIDs array in the same order as the coordinates.
 *
 * `coordinates.length === marcherIds.length * 2`
 *
 * @returns `renderingCallback` — a callback that, given a timestamp in milliseconds, will return all of the coordinates of the marchers in a flat `Float32Array`
 * @returns `marcherIds` — the list of marcher IDs that are being rendered.
 */
export const useRenderingCallback = () => {
    const timelineResult = useMarcherTimelines();

    const renderingCallback = useCallback(
        (timeMs: number) => {
            if (timelineResult == null) return;

            return getAllCoordinatesAtTime(
                timelineResult.marcherTimelines,
                timeMs,
            );
        },
        [timelineResult],
    );

    return useMemo(
        () => ({ renderingCallback, marcherIds: timelineResult?.marcherIds }),
        [renderingCallback, timelineResult?.marcherIds],
    );
};

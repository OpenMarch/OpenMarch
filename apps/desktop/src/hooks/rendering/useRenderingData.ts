import { useQueries, useQuery } from "@tanstack/react-query";
import {
    allMarchersQueryOptions,
    marcherPagesByMarcherQueryOptions,
} from "../queries";
import { useTimingObjects } from "../useTimingObjects";
import { MarcherTimeline } from "@openmarch/core";
import { useCallback, useMemo } from "react";
import { getAllCoordinatesAtTime } from "@/services/rendering/get-coordinates-at-time";
import { dbToMarcherTimeline } from "@/services/rendering/db-to-timeline";

/**
 * A stable (module-level) select function so `useQuery` can reuse its cached
 * result across re-renders instead of recomputing `.map().sort()` every time.
 * See the memoization note on `useTimingObjects` for why this matters.
 */
const selectMarcherIds = (result: { id: number }[]) =>
    result.map((marcher) => marcher.id).sort();

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

    // Also must be stable — see comment above.
    const combine = useCallback(
        (
            marcherPages: {
                data: { page_id: number; x: number; y: number }[] | undefined;
            }[],
        ) => {
            if (
                marcherIds == null ||
                marcherPages.some((mp) => mp == null || mp.data == null)
            )
                return undefined;

            const marcherTimelines = marcherPages.map((result) =>
                dbToMarcherTimeline(result.data!, pagesForTimeline),
            );

            return {
                marcherIds,
                marcherTimelines,
            };
        },
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

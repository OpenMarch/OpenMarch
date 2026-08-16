import { useQueries, useQuery } from "@tanstack/react-query";
import {
    allMarchersQueryOptions,
    allSectionAppearancesQueryOptions,
    allTagAppearancesQueryOptions,
    fieldPropertiesQueryOptions,
    marcherIdsForAllTagIdsQueryOptions,
    marcherPagesByMarcherQueryOptions,
} from "../queries";
import { useTimingObjects } from "../useTimingObjects";
import { useCallback, useMemo } from "react";
import { toMarcherPagesByPage } from "@/global/classes/MarcherPageIndex";
import { _toMarcherAppearanceTimeline } from "../queries/useMarcherAppearance";
import { MarcherAppearanceTimeline } from "@/services/appearance/type";
import { getAllAppearancesAtTime } from "@/services/appearance/get-appearance-at-time";
import type MarcherPage from "@/global/classes/MarcherPage";

/**
 * A stable (module-level) select function so `useQuery` can reuse its cached
 * result across re-renders instead of recomputing `.map().sort()` every time.
 * See the memoization note on `useTimingObjects` for why this matters.
 */
const selectMarcherIds = (result: { id: number }[]) =>
    result.map((marcher) => marcher.id).sort();

/** Inverts `MarcherIdsByTagId` (tag → marchers) into marcher → tags. */
const invertMarcherIdsByTagId = (
    marcherIdsByTagId: Map<number, number[]>,
): Map<number, number[]> => {
    const tagIdsByMarcherId = new Map<number, number[]>();
    for (const [tagId, marcherIds] of marcherIdsByTagId) {
        for (const marcherId of marcherIds) {
            if (!tagIdsByMarcherId.has(marcherId))
                tagIdsByMarcherId.set(marcherId, []);
            tagIdsByMarcherId.get(marcherId)!.push(tagId);
        }
    }
    return tagIdsByMarcherId;
};

/**
 * Builds every marcher's `MarcherAppearanceTimeline` for the whole show.
 *
 * Mirrors `useMarcherTimelines` (`./useRenderingData`): the only per-marcher cached
 * query is `marcherPagesByMarcherQueryOptions`, which is already used (and correctly
 * invalidated) by the coordinate timeline. The show-wide ingredients (sections, tag
 * appearances, the tag→marcher map, field theme) are plain queries backed by caches
 * that are already invalidated by their own mutations. The final per-marcher timeline
 * is assembled in `combine` against the *live* pages list, so appearance and position
 * keyframes can never drift apart, and page/beat timing changes are picked up for
 * free without any dedicated invalidation.
 */
// eslint-disable-next-line max-lines-per-function
export const useMarcherAppearanceTimelines = ():
    | {
          /** List of marcher ids whose timelines are being returned */
          marcherIds: number[];
          /** List of `MarcherAppearanceTimeline`s in the same order as the marcher ids */
          appearanceTimelines: MarcherAppearanceTimeline[];
      }
    | undefined => {
    const { data: allMarchers } = useQuery(allMarchersQueryOptions());
    const { data: marcherIds } = useQuery({
        ...allMarchersQueryOptions(),
        select: selectMarcherIds,
    });
    const { data: allSectionAppearances } = useQuery(
        allSectionAppearancesQueryOptions(),
    );
    const { data: allTagAppearances } = useQuery(
        allTagAppearancesQueryOptions(),
    );
    const { data: marcherIdsByTagId } = useQuery(
        marcherIdsForAllTagIdsQueryOptions(),
    );
    const { data: fieldProperties } = useQuery(fieldPropertiesQueryOptions());
    const { pages } = useTimingObjects();

    const pagesForTimeline = useMemo(
        () =>
            pages.map((page) => ({
                page_id: page.id,
                // Page timestamps/durations are in seconds; `MarcherAppearanceTimeline`
                // is in milliseconds, matching the `MarcherTimeline` used for coordinates.
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
        (marcherPages: { data: MarcherPage[] | undefined }[]) => {
            if (
                marcherIds == null ||
                allMarchers == null ||
                allSectionAppearances == null ||
                allTagAppearances == null ||
                marcherIdsByTagId == null ||
                fieldProperties == null ||
                marcherPages.some((mp) => mp == null || mp.data == null)
            )
                return undefined;

            const sectionByMarcherId = new Map(
                allMarchers.map((marcher) => [marcher.id, marcher.section]),
            );
            const tagIdsByMarcherId =
                invertMarcherIdsByTagId(marcherIdsByTagId);

            const appearanceTimelines = marcherIds.map((marcherId, index) =>
                _toMarcherAppearanceTimeline(
                    pagesForTimeline,
                    sectionByMarcherId.get(marcherId) ?? "",
                    allSectionAppearances,
                    toMarcherPagesByPage(marcherPages[index].data!),
                    tagIdsByMarcherId.get(marcherId) ?? [],
                    allTagAppearances,
                    fieldProperties.theme,
                ),
            );

            return {
                marcherIds,
                appearanceTimelines,
            };
        },
        [
            marcherIds,
            allMarchers,
            allSectionAppearances,
            allTagAppearances,
            marcherIdsByTagId,
            fieldProperties,
            pagesForTimeline,
        ],
    );

    return useQueries({ queries, combine });
};

/**
 * Appearance keyframes are much sparser than coordinate keyframes — appearance only
 * changes when it actually changes (see `_toMarcherAppearanceTimeline`), while
 * coordinates get a keyframe every page. Mirrors `useRenderingCallback`
 * (`./useRenderingData`), but kept as its own, separately composable hook: sampling
 * is a binary search rather than a tween (`getAllAppearancesAtTime`), and the
 * per-frame cost on the canvas side is a single reference check per marcher (see
 * `CanvasMarcher.applyResolvedAppearance`).
 *
 * @returns `appearanceCallback` — a callback that, given a timestamp in milliseconds, returns
 * every marcher's resolved appearance in the same order as `marcherIds`.
 * @returns `marcherIds` — the list of marcher IDs that are being rendered.
 */
export const useAppearanceCallback = () => {
    const timelineResult = useMarcherAppearanceTimelines();

    const appearanceCallback = useCallback(
        (timeMs: number) => {
            if (timelineResult == null) return;

            return getAllAppearancesAtTime(
                timelineResult.appearanceTimelines,
                timeMs,
            );
        },
        [timelineResult],
    );

    return useMemo(
        () => ({ appearanceCallback, marcherIds: timelineResult?.marcherIds }),
        [appearanceCallback, timelineResult?.marcherIds],
    );
};

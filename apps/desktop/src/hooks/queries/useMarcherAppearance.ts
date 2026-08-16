import {
    _calculateMapAllTagAppearanceIdsByPageId,
    SectionAppearance,
    TagAppearance,
} from "@/db-functions";
import {
    AppearanceComponentOptional,
    resolveAppearanceFromStack,
    ResolvedPerformerAppearance,
} from "@/entity-components/appearance";
import {
    MarcherPagesByPage,
    toMarcherPagesByPage,
} from "@/global/classes/MarcherPageIndex";
import { MarcherAppearanceTimeline } from "@/services/appearance/type";
import { FieldTheme } from "@openmarch/core";
import {
    QueryClient,
    queryOptions,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { DEFAULT_STALE_TIME } from "./constants";
import { marcherPagesByMarcherQueryOptions } from "./useMarcherPages";
import { marcherQueryByIdOptions } from "./useMarchers";
import { fieldPropertiesQueryOptions } from "./useFieldProperties";
import { allSectionAppearancesQueryOptions } from "./useSectionAppearances";
import {
    allTagAppearancesQueryOptions,
    marcherIdsForAllTagIdsQueryOptions,
} from "./tags/queries";
import { useTimingObjects } from "../useTimingObjects";
import {
    appearancesEqual,
    buildDefaultMarcherAppearance,
    getSectionAppearance,
    sortTagAppearancesByPriority,
    tagAppearancesForPage,
} from "./useMarcherAppearances";

const KEY_BASE = "marcher_appearance";

export const marcherAppearanceKeys = {
    all: () => [KEY_BASE] as const,
    byMarcherId: (marcherId: number) => [KEY_BASE, marcherId] as const,
};

/** A page/timestamp pair, sorted in show order and in milliseconds. */
type PageForTimeline = { page_id: number; timestamp: number };

/**
 * Query options for a single marcher's appearance timeline across the whole show.
 *
 * This is a convenience for one-off/non-rendering consumers (inspectors, tests, etc.). It
 * composes several already-cached, already-invalidated queries via `queryClient.fetchQuery`,
 * the same way the old page-based `marcherAppearancesQueryOptions` does.
 *
 * Because `pagesSorted` isn't part of the query key, this cache can go stale if page/beat
 * timestamps shift without any tag/section/marcher change — mitigated by `invalidateAllAppearances`
 * being called from page and beat mutations. The bulk `useMarcherAppearanceTimelines` hook
 * (`hooks/rendering/useAppearanceData.ts`) doesn't have this caveat, since it always recomputes
 * against the live pages list — prefer that one for rendering.
 */
export const marcherAppearanceQueryOptions = (
    marcherId: number,
    pagesSorted: PageForTimeline[],
    queryClient: QueryClient,
) => {
    // queryClient/pagesSorted aren't serializable and deliberately aren't part
    // of the cache key; see the pagesSorted staleness caveat documented above.
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    return queryOptions<MarcherAppearanceTimeline>({
        queryKey: marcherAppearanceKeys.byMarcherId(marcherId),
        queryFn: async () => {
            const [
                marcher,
                allSectionAppearances,
                marcherIdsByTagId,
                allTagAppearances,
                marcherPages,
                fieldProperties,
            ] = await Promise.all([
                queryClient.fetchQuery(marcherQueryByIdOptions(marcherId)),
                queryClient.fetchQuery(allSectionAppearancesQueryOptions()),
                queryClient.fetchQuery(marcherIdsForAllTagIdsQueryOptions()),
                queryClient.fetchQuery(allTagAppearancesQueryOptions()),
                queryClient.fetchQuery(
                    marcherPagesByMarcherQueryOptions(marcherId),
                ),
                queryClient.fetchQuery(fieldPropertiesQueryOptions()),
            ]);
            if (marcher == null)
                throw new Error(
                    "No marcher found with ID: " + marcherId.toString(),
                );

            const tagIdsForMarcher: number[] = [];
            for (const [tagId, marcherIds] of marcherIdsByTagId) {
                if (marcherIds.includes(marcherId))
                    tagIdsForMarcher.push(tagId);
            }

            return _toMarcherAppearanceTimeline(
                pagesSorted,
                marcher.section,
                allSectionAppearances,
                toMarcherPagesByPage(marcherPages),
                tagIdsForMarcher,
                allTagAppearances,
                fieldProperties.theme,
            );
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

/**
 * A single marcher's appearance timeline across the whole show.
 *
 * For rendering all marchers at once, prefer `useMarcherAppearanceTimelines`
 * (`hooks/rendering/useAppearanceData.ts`), which stays correct even when page/beat
 * timing changes without any tag/section/marcher edit.
 */
export const useMarcherAppearance = (marcherId: number) => {
    const queryClient = useQueryClient();
    const { pages } = useTimingObjects();
    const pagesSorted = useMemo(
        () =>
            pages.map((page) => ({
                page_id: page.id,
                timestamp: (page.timestamp + page.duration) * 1000,
            })),
        [pages],
    );

    return useQuery(
        marcherAppearanceQueryOptions(marcherId, pagesSorted, queryClient),
    );
};

export const _toMarcherAppearanceTimeline = (
    allPages: { page_id: number; timestamp: number }[],
    marcherSection: string,
    allSectionAppearances: SectionAppearance[],
    marcherPagesByPage: MarcherPagesByPage,
    tagIdsForMarcher: number[],
    tagAppearances: TagAppearance[],
    fieldTheme: FieldTheme,
): MarcherAppearanceTimeline => {
    const output: MarcherAppearanceTimeline = {
        timestamps: [],
        appearances: [],
    };

    if (allPages.length === 0) {
        return output;
    }

    const tagIdsForMarcherSet = new Set(tagIdsForMarcher);
    const marcherTagAppearances = tagAppearances.filter((tagAppearance) =>
        tagIdsForMarcherSet.has(tagAppearance.tag_id),
    );
    const tagAppearanceIdsByPageId = _calculateMapAllTagAppearanceIdsByPageId({
        tagAppearances: marcherTagAppearances,
        pagesInOrder: allPages.map((page) => ({ id: page.page_id })),
    });
    const sectionAppearance = getSectionAppearance(
        marcherSection,
        allSectionAppearances,
    );
    const defaultAppearance = buildDefaultMarcherAppearance(fieldTheme);

    let lastAppearance: ResolvedPerformerAppearance | undefined;
    for (const page of allPages) {
        const marcherPage = marcherPagesByPage[page.page_id];
        const stack: AppearanceComponentOptional[] = [
            ...(marcherPage ? [marcherPage] : []),
            ...sortTagAppearancesByPriority(
                tagAppearancesForPage(
                    page.page_id,
                    marcherTagAppearances,
                    tagAppearanceIdsByPageId,
                ),
            ),
            ...(sectionAppearance ? [sectionAppearance] : []),
            defaultAppearance,
        ];

        const resolved = resolveAppearanceFromStack(stack, fieldTheme);
        if (
            lastAppearance === undefined ||
            !appearancesEqual(lastAppearance, resolved)
        ) {
            output.timestamps.push(page.timestamp);
            output.appearances.push(resolved);
            lastAppearance = resolved;
        }
    }

    return output;
};

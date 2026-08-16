import {
    allMarchersQueryOptions,
    allSectionAppearancesQueryOptions,
    DEFAULT_STALE_TIME,
    fieldPropertiesQueryOptions,
    marcherIdsForAllTagIdsQueryOptions,
    marcherPagesByPageQueryOptions,
    resolvedTagAppearancesByPageIdQueryOptions,
} from ".";
import { QueryClient, queryOptions } from "@tanstack/react-query";
import Marcher from "@/global/classes/Marcher";
import {
    TagAppearance,
    SectionAppearance,
    MarcherIdsByTagId,
    _calculateMapAllTagAppearanceIdsByPageId,
} from "@/db-functions";
import {
    AppearanceComponentOptional,
    resolveAppearanceFromStack,
    ResolvedPerformerAppearance,
} from "@/entity-components/appearance";
import {
    MarcherPagesByMarcher,
    marcherPageMapFromArray,
} from "@/global/classes/MarcherPageIndex";
import { FieldTheme } from "@openmarch/core";
import { MarcherAppearanceTimeline } from "@/services/appearance/type";
import MarcherPage from "@/global/classes/MarcherPage";

const KEY_BASE = "marcher-appearances";

export const marcherAppearancesKeys = {
    all: () => [KEY_BASE] as const,
    byPageId: (pageId: number) => [KEY_BASE, { pageId }] as const,
};

export type MarcherAppearanceByIdMap = Record<
    number,
    AppearanceComponentOptional[]
>;

export const getSectionAppearance = (
    section: string,
    sectionAppearances: SectionAppearance[],
) => {
    return sectionAppearances.find(
        (appearance) => appearance.section === section,
    );
};

export const buildDefaultMarcherAppearance = (
    fieldTheme: FieldTheme,
): AppearanceComponentOptional => ({
    fill_color: fieldTheme.defaultMarcher.fill,
    outline_color: fieldTheme.defaultMarcher.outline,
    visible: true,
    shape_type: fieldTheme.shapeType,
    label_visible: true,
});

export const sortTagAppearancesByPriority = (
    tagAppearances: TagAppearance[],
): TagAppearance[] =>
    tagAppearances.sort((a, b) => {
        if (b.priority !== a.priority) {
            return b.priority - a.priority;
        }
        // This shouldn't happen, but sort by id in reverse in case the priorities are the same
        return b.id - a.id;
    });

/**
 * Creates a map of tag appearances by marcher id sorted by the priority of the tag appearance.
 *
 * @param tagAppearances
 * @returns Map<marcher_id, TagAppearance[]>
 */
const separateTagAppearanceByMarcherId = (
    tagAppearances: TagAppearance[],
    marcherIdsByTagId: MarcherIdsByTagId,
): Map<number, TagAppearance[]> => {
    const tagAppearanceByMarcherId: Map<number, TagAppearance[]> = new Map();

    // Add all tag appearances to the map, unsorted for now
    for (const tagAppearance of tagAppearances) {
        const marcherIds = marcherIdsByTagId.get(tagAppearance.tag_id);
        if (!marcherIds) {
            continue;
        }
        for (const marcherId of marcherIds) {
            if (!tagAppearanceByMarcherId.has(marcherId))
                tagAppearanceByMarcherId.set(marcherId, []);
            tagAppearanceByMarcherId.get(marcherId)!.push(tagAppearance);
        }
    }

    // Sort the tag appearances by priority
    for (const tagAppearances of tagAppearanceByMarcherId.values()) {
        sortTagAppearancesByPriority(tagAppearances);
    }

    return tagAppearanceByMarcherId;
};

/**
 * Combine queries to determine the visual style for each marcher.
 *
 * The appearance priority is as follows -
 *
 * 1. Individual marcher page appearance
 * 2. Tag appearance (sorted by priority, as marchers can have multiple tags)
 * 3. Section appearance
 * 4. (Default) Field theme appearance
 *
 * @returns
 */
export const _combineMarcherAppearances = ({
    marchers,
    sectionAppearances,
    marcherIdsByTagId,
    tagAppearances,
    marcherPages,
    fieldProperties,
}: {
    marchers: Marcher[];
    sectionAppearances: SectionAppearance[];
    marcherIdsByTagId: MarcherIdsByTagId;
    tagAppearances: TagAppearance[];
    marcherPages: MarcherPagesByMarcher;
    fieldProperties: { theme: FieldTheme };
}): MarcherAppearanceByIdMap => {
    if (!marchers) {
        return {};
    }
    const tagAppearanceByMarcherId: Map<number, TagAppearance[]> =
        tagAppearances && marcherIdsByTagId
            ? separateTagAppearanceByMarcherId(
                  tagAppearances,
                  marcherIdsByTagId,
              )
            : new Map();

    const appearancesByMarcherId: MarcherAppearanceByIdMap = {};
    const defaultMarcherAppearance = buildDefaultMarcherAppearance(
        fieldProperties.theme,
    );
    for (const marcher of marchers) {
        const appearances: AppearanceComponentOptional[] = [];

        const marcherPage = marcherPages?.[marcher.id];
        if (marcherPage) {
            appearances.push(marcherPage);
        }

        const tagAppearances = tagAppearanceByMarcherId.get(marcher.id);
        if (tagAppearances) {
            appearances.push(...tagAppearances);
        }

        const sectionAppearance = sectionAppearances
            ? getSectionAppearance(marcher.section, sectionAppearances)
            : undefined;
        if (sectionAppearance) {
            appearances.push(sectionAppearance);
        }

        appearances.push(defaultMarcherAppearance);

        appearancesByMarcherId[marcher.id] = appearances;
    }
    return appearancesByMarcherId;
};

export const appearancesEqual = (
    a: ResolvedPerformerAppearance,
    b: ResolvedPerformerAppearance,
): boolean =>
    a.fillRgba === b.fillRgba &&
    a.strokeRgba === b.strokeRgba &&
    a.strokeWidth === b.strokeWidth &&
    a.visible === b.visible &&
    a.textVisible === b.textVisible &&
    a.shape === b.shape;

export const tagAppearancesForPage = (
    pageId: number,
    allTagAppearances: TagAppearance[],
    tagAppearanceIdsByPageId: Map<number, Set<number>>,
): TagAppearance[] => {
    const tagAppearanceIds = tagAppearanceIdsByPageId.get(pageId);
    if (!tagAppearanceIds || tagAppearanceIds.size === 0) {
        return [];
    }
    return allTagAppearances.filter((tagAppearance) =>
        tagAppearanceIds.has(tagAppearance.id),
    );
};

export const _toAppearanceTimeline = (
    allPages: { page_id: number; timestamp: number }[],
    allMarchers: Marcher[],
    allSectionAppearances: SectionAppearance[],
    marcherIdsByTagId: MarcherIdsByTagId,
    allTagAppearances: TagAppearance[],
    allMarcherPages: MarcherPage[],
    fieldTheme: FieldTheme,
): MarcherAppearanceTimeline[] => {
    const timelines: MarcherAppearanceTimeline[] = allMarchers.map(() => ({
        timestamps: [],
        appearances: [],
    }));

    if (allMarchers.length === 0 || allPages.length === 0) {
        return timelines;
    }

    const marcherPageMap = marcherPageMapFromArray(allMarcherPages);
    const tagAppearanceIdsByPageId = _calculateMapAllTagAppearanceIdsByPageId({
        tagAppearances: allTagAppearances,
        pagesInOrder: allPages.map((page) => ({ id: page.page_id })),
    });
    const lastAppearance: (ResolvedPerformerAppearance | undefined)[] =
        allMarchers.map(() => undefined);

    for (const page of allPages) {
        const appearancesByMarcherId = _combineMarcherAppearances({
            marchers: allMarchers,
            sectionAppearances: allSectionAppearances,
            marcherIdsByTagId,
            tagAppearances: tagAppearancesForPage(
                page.page_id,
                allTagAppearances,
                tagAppearanceIdsByPageId,
            ),
            marcherPages: marcherPageMap.marcherPagesByPage[page.page_id] ?? {},
            fieldProperties: { theme: fieldTheme },
        });

        for (const [index, marcher] of allMarchers.entries()) {
            const stack = appearancesByMarcherId[marcher.id];
            if (!stack) {
                continue;
            }

            const resolved = resolveAppearanceFromStack(stack, fieldTheme);
            const previous = lastAppearance[index];
            if (previous != null && appearancesEqual(previous, resolved)) {
                continue;
            }

            timelines[index].timestamps.push(page.timestamp);
            timelines[index].appearances.push(resolved);
            lastAppearance[index] = resolved;
        }
    }

    return timelines;
};

export const marcherAppearancesQueryOptions = (
    pageId: number | null | undefined,
    queryClient: QueryClient,
) =>
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryOptions<MarcherAppearanceByIdMap>({
        queryKey: marcherAppearancesKeys.byPageId(pageId!),
        queryFn: async () => {
            const [
                marchers,
                sectionAppearances,
                marcherIdsByTagId,
                tagAppearances,
                marcherPages,
                fieldProperties,
            ] = await Promise.all([
                queryClient.fetchQuery(allMarchersQueryOptions()),
                queryClient.fetchQuery(allSectionAppearancesQueryOptions()),
                queryClient.fetchQuery(marcherIdsForAllTagIdsQueryOptions()),
                queryClient.fetchQuery(
                    resolvedTagAppearancesByPageIdQueryOptions({
                        pageId,
                        queryClient,
                    }),
                ),
                queryClient.fetchQuery(marcherPagesByPageQueryOptions(pageId)),
                queryClient.fetchQuery(fieldPropertiesQueryOptions()),
            ]);
            return _combineMarcherAppearances({
                marchers,
                sectionAppearances,
                marcherIdsByTagId,
                tagAppearances,
                marcherPages,
                fieldProperties,
            });
        },
        enabled: pageId != null,
        staleTime: DEFAULT_STALE_TIME,
    });

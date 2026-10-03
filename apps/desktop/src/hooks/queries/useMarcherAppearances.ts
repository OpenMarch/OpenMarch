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
import { getSectionObjectByName } from "@/global/classes/Sections";
import {
    TagAppearance,
    SectionAppearance,
    MarcherIdsByTagId,
} from "@/db-functions";
import { AppearanceComponentOptional } from "@/entity-components/appearance";
import { MarcherPagesByMarcher } from "@/global/classes/MarcherPageIndex";
import { FieldProperties } from "@openmarch/core";

const KEY_BASE = "marcher-appearances";

export const marcherAppearancesKeys = {
    all: () => [KEY_BASE] as const,
    byPageId: (pageId: number) => [KEY_BASE, { pageId }] as const,
};

export type MarcherAppearanceByIdMap = Record<
    number,
    AppearanceComponentOptional[]
>;

const getSectionAppearance = (
    section: string,
    sectionAppearances: SectionAppearance[],
) => {
    return sectionAppearances.find(
        (appearance) => appearance.section === section,
    );
};

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
        tagAppearances.sort((a, b) => {
            if (b.priority !== a.priority) {
                return b.priority - a.priority;
            }
            // This shouldn't happen, but sort by id in reverse in case the priorities are the same
            return b.id - a.id;
        });
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
    includeSectionFamilyColor = true,
}: {
    marchers: Marcher[];
    sectionAppearances: SectionAppearance[];
    marcherIdsByTagId: MarcherIdsByTagId;
    tagAppearances: TagAppearance[];
    marcherPages: MarcherPagesByMarcher;
    fieldProperties: FieldProperties;
    // The mobile export models colors per section, so it opts out of this fallback
    includeSectionFamilyColor?: boolean;
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
    const defaultTheme = fieldProperties.theme;
    const defaultMarcherAppearance = {
        fill_color: defaultTheme.defaultMarcher.fill,
        outline_color: defaultTheme.defaultMarcher.outline,
        visible: true,
        shape_type: defaultTheme.shapeType,
        label_visible: true,
    } as AppearanceComponentOptional;
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

        // fall back to the section's family color when no custom appearance sets a fill
        if (includeSectionFamilyColor) {
            appearances.push({
                fill_color: getSectionObjectByName(marcher.section).family
                    .color,
                visible: true,
                label_visible: true,
            });
        }

        appearances.push(defaultMarcherAppearance);

        appearancesByMarcherId[marcher.id] = appearances;
    }
    return appearancesByMarcherId;
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

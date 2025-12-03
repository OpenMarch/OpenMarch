import {
    allMarchersQueryOptions,
    allSectionAppearancesQueryOptions,
    marcherIdsForAllTagIdsQueryOptions,
    tagAppearancesByPageIdQueryOptions,
} from "./queries";
import {
    useQueries,
    useQueryClient,
    UseQueryResult,
} from "@tanstack/react-query";
import MarcherVisualGroup from "@/global/classes/MarcherVisualGroup";
import Marcher from "@/global/classes/Marcher";
import {
    TagAppearance,
    SectionAppearance,
    MarcherIdsByTagId,
} from "@/db-functions";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { AppearanceModelOptional } from "electron/database/migrations/schema";

export type MarcherVisualMap = Record<number, MarcherVisualGroup>;

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

export const _combineMarcherVisualGroups = (
    results: [
        UseQueryResult<Marcher[]>,
        UseQueryResult<SectionAppearance[]>,
        UseQueryResult<MarcherIdsByTagId>,
        UseQueryResult<TagAppearance[]>,
    ],
): MarcherVisualMap => {
    const { data: marchers } = results[0];
    const { data: sectionAppearances } = results[1];
    const { data: marcherIdsByTagId } = results[2];
    const { data: tagAppearances } = results[3];

    if (!marchers /*|| !sectionAppearances || !fieldProperties*/) {
        return {};
    }
    const tagAppearanceByMarcherId: Map<number, TagAppearance[]> =
        tagAppearances && marcherIdsByTagId
            ? separateTagAppearanceByMarcherId(
                  tagAppearances,
                  marcherIdsByTagId,
              )
            : new Map();

    const newVisuals: Record<number, MarcherVisualGroup> = {};
    for (const marcher of marchers) {
        const appearances: AppearanceModelOptional[] = [];

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

        newVisuals[marcher.id] = new MarcherVisualGroup({
            marcher,
            appearances,
        });
    }
    return newVisuals;
};

export const useMarchersWithVisuals = (): MarcherVisualMap => {
    const { selectedPage } = useSelectedPage()!;
    const queryClient = useQueryClient();

    return useQueries({
        queries: [
            allMarchersQueryOptions(),
            allSectionAppearancesQueryOptions(),
            marcherIdsForAllTagIdsQueryOptions(),
            tagAppearancesByPageIdQueryOptions({
                pageId: selectedPage?.id,
                queryClient,
            }),
        ],
        // This must be a stable function, not an inline function, otherwise it will be called every time the component re-renders
        // https://tanstack.com/query/latest/docs/framework/react/reference/useQueries#memoization
        combine: _combineMarcherVisualGroups,
    });
};

import {
    allMarchersQueryOptions,
    allSectionAppearancesQueryOptions,
    fieldPropertiesQueryOptions,
} from "./queries";
import { useQueries, UseQueryResult } from "@tanstack/react-query";
import MarcherVisualGroup from "@/global/classes/MarcherVisualGroup";
import Marcher from "@/global/classes/Marcher";
import { FieldProperties } from "@openmarch/core";
import { SectionAppearance } from "@/db-functions";

export type MarcherVisualMap = Record<number, MarcherVisualGroup>;

const getSectionAppearance = (
    section: string,
    sectionAppearances: SectionAppearance[],
) => {
    return sectionAppearances.find(
        (appearance) => appearance.section === section,
    );
};

export const _combineMarcherVisualGroups = (
    results: [
        UseQueryResult<Marcher[]>,
        UseQueryResult<SectionAppearance[]>,
        UseQueryResult<FieldProperties>,
    ],
): MarcherVisualMap => {
    const { data: marchers } = results[0];
    const { data: sectionAppearances } = results[1];
    const { data: fieldProperties } = results[2];

    if (!marchers || !sectionAppearances || !fieldProperties) {
        return {};
    }

    const newVisuals: Record<number, MarcherVisualGroup> = {};
    for (const marcher of marchers) {
        const appearance = sectionAppearances
            ? getSectionAppearance(marcher.section, sectionAppearances)
            : undefined;
        newVisuals[marcher.id] = new MarcherVisualGroup({
            marcher,
            sectionAppearance: appearance,
            fieldTheme: fieldProperties.theme,
        });
    }
    return newVisuals;
};

export const useMarchersWithVisuals = (): MarcherVisualMap => {
    return useQueries({
        queries: [
            allMarchersQueryOptions(),
            allSectionAppearancesQueryOptions(),
            fieldPropertiesQueryOptions(),
        ],
        // This must be a stable function, not an inline function, otherwise it will be called every time the component re-renders
        // https://tanstack.com/query/latest/docs/framework/react/reference/useQueries#memoization
        combine: _combineMarcherVisualGroups,
    });
};

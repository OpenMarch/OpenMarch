import { useEffect, useMemo, useRef } from "react";
import {
    useQueries,
    useQueryClient,
    type UseQueryResult,
} from "@tanstack/react-query";
import {
    allMarchersQueryOptions,
    allSectionAppearancesQueryOptions,
    allTagAppearancesQueryOptions,
    fieldPropertiesQueryOptions,
    marcherIdsForAllTagIdsQueryOptions,
    tagAppearanceByPageIdMapQueryOptions,
    tagKeys,
} from "@/hooks/queries";
import type {
    MarcherIdsByTagId,
    SectionAppearance,
    TagAppearance,
    TagAppearanceIdsByPageId,
} from "@/db-functions";
import type Marcher from "@/global/classes/Marcher";
import type { FieldProperties } from "@openmarch/core";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import {
    appearanceFlagsKey,
    buildAppearanceSteps,
    parseAppearanceFlagsKey,
    type AppearanceStepsByMarcherId,
} from "@/services/appearance/appearanceSteps";

/** The show-wide rows appearance steps are built from, or `undefined` until all are loaded. */
export type AppearanceStepInputs =
    | {
          marchers: Marcher[];
          sectionAppearances: SectionAppearance[];
          tagAppearances: TagAppearance[];
          marcherIdsByTagId: MarcherIdsByTagId;
          tagAppearanceIdsByPageId: TagAppearanceIdsByPageId;
          fieldProperties: FieldProperties;
      }
    | undefined;

export const _combineAppearanceStepInputs = (
    results: [
        UseQueryResult<Marcher[]>,
        UseQueryResult<SectionAppearance[]>,
        UseQueryResult<TagAppearance[]>,
        UseQueryResult<MarcherIdsByTagId>,
        UseQueryResult<TagAppearanceIdsByPageId>,
        UseQueryResult<FieldProperties>,
    ],
): AppearanceStepInputs => {
    const [
        marchers,
        sectionAppearances,
        tagAppearances,
        marcherIdsByTagId,
        tagAppearanceIdsByPageId,
        fieldProperties,
    ] = results.map((r) => r.data) as [
        Marcher[] | undefined,
        SectionAppearance[] | undefined,
        TagAppearance[] | undefined,
        MarcherIdsByTagId | undefined,
        TagAppearanceIdsByPageId | undefined,
        FieldProperties | undefined,
    ];
    if (
        !marchers ||
        !sectionAppearances ||
        !tagAppearances ||
        !marcherIdsByTagId ||
        !tagAppearanceIdsByPageId ||
        !fieldProperties
    )
        return undefined;
    return {
        marchers,
        sectionAppearances,
        tagAppearances,
        marcherIdsByTagId,
        tagAppearanceIdsByPageId,
        fieldProperties,
    };
};

/**
 * Every marcher's appearance steps for the whole show, keyed by flag beat
 * (`buildAppearanceSteps`), or `undefined` until its queries load or when `enabled` is off (page
 * mode). Rebuilt when the pages' flags, the marchers, tags, tag or section appearances, or the
 * field theme change; a tempo edit moves no flag, so it rebuilds nothing.
 */
export function useMarcherAppearanceSteps(
    enabled: boolean,
): AppearanceStepsByMarcherId | undefined {
    const queryClient = useQueryClient();
    const { pages } = useTimingObjects();
    const inputs = useQueries({
        queries: [
            { ...allMarchersQueryOptions(), enabled },
            { ...allSectionAppearancesQueryOptions(), enabled },
            { ...allTagAppearancesQueryOptions(), enabled },
            { ...marcherIdsForAllTagIdsQueryOptions(), enabled },
            { ...tagAppearanceByPageIdMapQueryOptions(), enabled },
            { ...fieldPropertiesQueryOptions(enabled) },
        ],
        combine: _combineAppearanceStepInputs,
    });
    const signature = useMemo(() => appearanceFlagsKey(pages), [pages]);

    // Pages added or removed change which tag appearances each page has; page edits don't
    // invalidate the tag appearance map themselves
    const pageIds = signature.replace(/:\d+(\.\d+)?/g, "");
    const lastPageIds = useRef(pageIds);
    useEffect(() => {
        if (!enabled || lastPageIds.current === pageIds) return;
        lastPageIds.current = pageIds;
        void queryClient.invalidateQueries({
            queryKey: tagKeys.allTagAppearances(),
        });
    }, [enabled, pageIds, queryClient]);

    return useMemo(() => {
        if (!enabled || !inputs) return undefined;
        return buildAppearanceSteps({
            flags: parseAppearanceFlagsKey(signature),
            marchers: inputs.marchers,
            sectionAppearances: inputs.sectionAppearances,
            marcherIdsByTagId: inputs.marcherIdsByTagId,
            tagAppearances: inputs.tagAppearances,
            tagAppearanceIdsByPageId: inputs.tagAppearanceIdsByPageId,
            fieldProperties: inputs.fieldProperties,
        });
    }, [enabled, inputs, signature]);
}

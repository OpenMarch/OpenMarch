import Marcher from "@/global/classes/Marcher";
import Page from "@/global/classes/Page";
import {
    MarcherIdsByTagId,
    SectionAppearance,
    TagAppearance,
    TagAppearanceIdsByPageId,
} from "@/db-functions";
import { FieldProperties } from "@openmarch/core";
import {
    _combineMarcherAppearances,
    MarcherAppearanceByIdMap,
} from "@/hooks/queries/useMarcherAppearances";

export type MarcherAppearancesByPageId = Map<number, MarcherAppearanceByIdMap>;

function resolveTagAppearancesForPage(
    pageId: number,
    allTagAppearances: TagAppearance[],
    tagAppearanceIdsByPageId: TagAppearanceIdsByPageId,
): TagAppearance[] {
    const tagAppearanceIds = tagAppearanceIdsByPageId.get(pageId);
    if (!tagAppearanceIds || tagAppearanceIds.size === 0) return [];
    return allTagAppearances.filter((tagAppearance) =>
        tagAppearanceIds.has(tagAppearance.id),
    );
}

/**
 * Each page's appearance stack per marcher: tag, then section and field theme (there are no
 * per-marcher-page overrides, P7.14), for the drill charts. The video export draws the field's
 * appearance steps instead (`appearanceSteps.ts`), the same rule by flag beat.
 */
export function buildMarcherAppearancesByPageId({
    sortedPages,
    marchers,
    sectionAppearances,
    marcherIdsByTagId,
    allTagAppearances,
    tagAppearanceIdsByPageId,
    fieldProperties,
}: {
    sortedPages: Page[];
    marchers: Marcher[];
    sectionAppearances: SectionAppearance[];
    marcherIdsByTagId: MarcherIdsByTagId;
    allTagAppearances: TagAppearance[];
    tagAppearanceIdsByPageId: TagAppearanceIdsByPageId;
    fieldProperties: FieldProperties;
}): MarcherAppearancesByPageId {
    const appearancesByPageId: MarcherAppearancesByPageId = new Map();

    for (const page of sortedPages) {
        const tagAppearances = resolveTagAppearancesForPage(
            page.id,
            allTagAppearances,
            tagAppearanceIdsByPageId,
        );

        appearancesByPageId.set(
            page.id,
            _combineMarcherAppearances({
                marchers,
                sectionAppearances,
                marcherIdsByTagId,
                tagAppearances,
                fieldProperties,
            }),
        );
    }

    return appearancesByPageId;
}

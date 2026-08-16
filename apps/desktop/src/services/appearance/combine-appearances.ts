import Marcher from "@/global/classes/Marcher";
import {
    TagAppearance,
    SectionAppearance,
    MarcherIdsByTagId,
} from "@/db-functions";
import {
    AppearanceComponentOptional,
    ResolvedPerformerAppearance,
} from "@/entity-components/appearance";
import { MarcherPagesByMarcher } from "@/global/classes/MarcherPageIndex";
import { FieldTheme } from "@openmarch/core";

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
 * This is a page-scoped, one-shot computation — used by the export pipeline
 * (`exportAppearances.ts`, `performer-appearance-export.ts`), which needs every
 * marcher's appearance for a specific page rather than a per-marcher timeline.
 * Live rendering uses `useMarcherAppearanceTimelines`
 * (`hooks/rendering/useAppearanceData.ts`) instead.
 *
 * @returns
 */
export const combineMarcherAppearances = ({
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

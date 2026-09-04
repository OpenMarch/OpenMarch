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
import { MarcherPagesByPage } from "@/global/classes/MarcherPageIndex";
import { FieldTheme } from "@openmarch/core";
import {
    appearancesEqual,
    buildDefaultMarcherAppearance,
    getSectionAppearance,
    sortTagAppearancesByPriority,
    tagAppearancesForPage,
} from "./combine-appearances";
import { MarcherAppearanceTimeline } from "./type";

export const dbToMarcherAppearanceTimeline = (
    allPages: { page_id: number; timestamp: number }[],
    marcherSection: string,
    allSectionAppearances: SectionAppearance[],
    marcherPagesByPage: MarcherPagesByPage,
    tagIdsForMarcher: number[],
    tagAppearances: TagAppearance[],
    fieldTheme: FieldTheme,
): MarcherAppearanceTimeline => {
    if (allPages.length === 0) {
        return { timestamps: new Float32Array(0), appearances: [] };
    }

    const timestamps: number[] = [];
    const appearances: ResolvedPerformerAppearance[] = [];

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
            timestamps.push(page.timestamp);
            appearances.push(resolved);
            lastAppearance = resolved;
        }
    }

    return { timestamps: new Float32Array(timestamps), appearances };
};

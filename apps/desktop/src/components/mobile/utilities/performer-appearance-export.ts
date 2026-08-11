import type { OpenMarchShowData } from "@openmarch/schema";
import { FieldProperties } from "@openmarch/core";
import Marcher, { dbMarcherToMarcher } from "@/global/classes/Marcher";
import {
    _calculateMapAllTagAppearanceIdsByPageId,
    getMarcherIdsByTagIdMap,
    MarcherIdsByTagId,
    realDatabaseSectionAppearanceToDatabaseSectionAppearance,
    realDatabaseTagAppearanceToDatabaseTagAppearance,
    SectionAppearance,
    TagAppearance,
    TagAppearanceIdsByPageId,
} from "@/db-functions";
import {
    AppearanceComponentOptional,
    resolveAppearanceFromStack,
    ResolvedPerformerAppearance,
} from "@/entity-components/appearance";
import { _combineMarcherAppearances } from "@/hooks/queries/useMarcherAppearances";
import { MarcherPagesByMarcher } from "@/global/classes/MarcherPageIndex";
import MarcherPage, {
    databaseMarcherPagesToMarcherPages,
} from "@/global/classes/MarcherPage";
import { schema } from "@/global/database/db";

type PerformerAppearanceShowData = NonNullable<
    OpenMarchShowData["performerAppearance"]
>;

type PageInOrder = { id: number };

const appearancesEqual = (
    a: ResolvedPerformerAppearance,
    b: ResolvedPerformerAppearance,
): boolean =>
    a.fillRgba === b.fillRgba &&
    a.strokeRgba === b.strokeRgba &&
    a.strokeWidth === b.strokeWidth &&
    a.visible === b.visible &&
    a.textVisible === b.textVisible &&
    a.shape === b.shape;

const getDefaultMarcherAppearance = (
    fieldProperties: FieldProperties,
): AppearanceComponentOptional => {
    const defaultTheme = fieldProperties.theme;
    return {
        fill_color: defaultTheme.defaultMarcher.fill,
        outline_color: defaultTheme.defaultMarcher.outline,
        visible: true,
        shape_type: defaultTheme.shapeType,
        label_visible: true,
    };
};

const getSectionAppearance = (
    section: string,
    sectionAppearances: SectionAppearance[],
) => sectionAppearances.find((appearance) => appearance.section === section);

const buildBaselineStack = ({
    marcher,
    sectionAppearances,
    defaultMarcherAppearance,
}: {
    marcher: Pick<Marcher, "section">;
    sectionAppearances: SectionAppearance[];
    defaultMarcherAppearance: AppearanceComponentOptional;
}): AppearanceComponentOptional[] => {
    const stack: AppearanceComponentOptional[] = [];
    const sectionAppearance = getSectionAppearance(
        marcher.section,
        sectionAppearances,
    );
    if (sectionAppearance) {
        stack.push(sectionAppearance);
    }
    stack.push(defaultMarcherAppearance);
    return stack;
};

const getTagAppearancesForPage = ({
    pageId,
    tagAppearances,
    tagAppearanceIdsByPageId,
}: {
    pageId: number;
    tagAppearances: TagAppearance[];
    tagAppearanceIdsByPageId: TagAppearanceIdsByPageId;
}): TagAppearance[] => {
    const ids = tagAppearanceIdsByPageId.get(pageId);
    if (!ids || ids.size === 0) {
        return [];
    }
    const idSet = ids;
    return tagAppearances.filter((ta) => idSet.has(ta.id));
};

export function buildMarcherPagesByPageId(
    marcherPages: MarcherPage[],
    pageId: number,
): MarcherPagesByMarcher {
    const byMarcher: MarcherPagesByMarcher = {};
    for (const mp of marcherPages) {
        if (mp.page_id === pageId) {
            byMarcher[mp.marcher_id] = mp;
        }
    }
    return byMarcher;
}

export function buildPerformerAppearanceShowData({
    fieldProperties,
    sectionAppearances,
    tagAppearances,
    tagAppearanceIdsByPageId,
    marcherIdsByTagId,
    marchers,
    marcherPages,
    pagesInOrder,
}: {
    fieldProperties: FieldProperties;
    sectionAppearances: SectionAppearance[];
    tagAppearances: TagAppearance[];
    tagAppearanceIdsByPageId: TagAppearanceIdsByPageId;
    marcherIdsByTagId: MarcherIdsByTagId;
    marchers: Marcher[];
    marcherPages: MarcherPage[];
    pagesInOrder: PageInOrder[];
}): PerformerAppearanceShowData {
    const fieldTheme = fieldProperties.theme;
    const defaultMarcherAppearance =
        getDefaultMarcherAppearance(fieldProperties);

    const defaultAppearance = resolveAppearanceFromStack(
        [defaultMarcherAppearance],
        fieldTheme,
    );

    const sections = [...sectionAppearances]
        .sort((a, b) => a.section.localeCompare(b.section))
        .map((sectionAppearance) => ({
            section: sectionAppearance.section,
            ...resolveAppearanceFromStack(
                [sectionAppearance, defaultMarcherAppearance],
                fieldTheme,
            ),
        }));

    const performers: NonNullable<PerformerAppearanceShowData["performers"]> =
        [];

    for (const page of pagesInOrder) {
        const pageId = page.id;
        const tagAppearancesForPage = getTagAppearancesForPage({
            pageId,
            tagAppearances,
            tagAppearanceIdsByPageId,
        });
        const marcherPagesForPage = buildMarcherPagesByPageId(
            marcherPages,
            pageId,
        );

        const appearancesByMarcherId = _combineMarcherAppearances({
            marchers,
            sectionAppearances,
            marcherIdsByTagId,
            tagAppearances: tagAppearancesForPage,
            marcherPages: marcherPagesForPage,
            fieldProperties,
        });

        for (const marcher of marchers) {
            const effectiveStack = appearancesByMarcherId[marcher.id];
            if (!effectiveStack) {
                continue;
            }

            const baselineStack = buildBaselineStack({
                marcher,
                sectionAppearances,
                defaultMarcherAppearance,
            });

            const effective = resolveAppearanceFromStack(
                effectiveStack,
                fieldTheme,
            );
            const baseline = resolveAppearanceFromStack(
                baselineStack,
                fieldTheme,
            );

            if (!appearancesEqual(effective, baseline)) {
                performers.push({
                    marcherId: String(marcher.id),
                    pageId: String(pageId),
                    ...effective,
                });
            }
        }
    }

    return {
        defaultAppearance,
        sections,
        performers,
    };
}

export type PerformerAppearanceExportDbData = {
    sectionAppearancesRows: (typeof schema.section_appearances.$inferSelect)[];
    tagAppearancesRows: (typeof schema.tag_appearances.$inferSelect)[];
    marcherIdsByTagId: MarcherIdsByTagId;
    pagesInOrder: PageInOrder[];
};

export async function fetchPerformerAppearanceExportData(
    db: Parameters<typeof getMarcherIdsByTagIdMap>[0]["db"],
    pagesInOrder: PageInOrder[],
): Promise<PerformerAppearanceExportDbData> {
    const [sectionAppearancesRows, tagAppearancesRows, marcherIdsByTagId] =
        await Promise.all([
            db.query.section_appearances.findMany(),
            db.query.tag_appearances.findMany(),
            getMarcherIdsByTagIdMap({ db }),
        ]);

    return {
        sectionAppearancesRows,
        tagAppearancesRows,
        marcherIdsByTagId,
        pagesInOrder,
    };
}

export function parsePerformerAppearanceExportData(
    data: PerformerAppearanceExportDbData,
): {
    sectionAppearances: SectionAppearance[];
    tagAppearances: TagAppearance[];
    tagAppearanceIdsByPageId: TagAppearanceIdsByPageId;
    marcherIdsByTagId: MarcherIdsByTagId;
} {
    const sectionAppearances = data.sectionAppearancesRows.map(
        realDatabaseSectionAppearanceToDatabaseSectionAppearance,
    );
    const tagAppearances = data.tagAppearancesRows.map(
        realDatabaseTagAppearanceToDatabaseTagAppearance,
    );
    const tagAppearanceIdsByPageId = _calculateMapAllTagAppearanceIdsByPageId({
        tagAppearances,
        pagesInOrder: data.pagesInOrder,
    });

    return {
        sectionAppearances,
        tagAppearances,
        tagAppearanceIdsByPageId,
        marcherIdsByTagId: data.marcherIdsByTagId,
    };
}

export function marcherRowsToMarchers(
    marchersRows: Pick<
        Marcher,
        "id" | "section" | "drill_prefix" | "drill_order"
    >[],
): Marcher[] {
    return marchersRows.map((m) =>
        dbMarcherToMarcher({
            ...m,
            name: null,
            year: null,
            notes: null,
            created_at: "",
            updated_at: "",
        }),
    );
}

export {
    databaseMarcherPagesToMarcherPages,
    _calculateMapAllTagAppearanceIdsByPageId,
};

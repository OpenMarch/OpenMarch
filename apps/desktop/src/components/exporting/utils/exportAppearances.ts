import Marcher from "@/global/classes/Marcher";
import Page from "@/global/classes/Page";
import MarcherPageMap from "@/global/classes/MarcherPageIndex";
import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";
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

export function buildMarcherAppearancesByPageId({
    sortedPages,
    marchers,
    marcherPagesMap,
    sectionAppearances,
    marcherIdsByTagId,
    allTagAppearances,
    tagAppearanceIdsByPageId,
    fieldProperties,
}: {
    sortedPages: Page[];
    marchers: Marcher[];
    marcherPagesMap: MarcherPageMap;
    sectionAppearances: SectionAppearance[];
    marcherIdsByTagId: MarcherIdsByTagId;
    allTagAppearances: TagAppearance[];
    tagAppearanceIdsByPageId: TagAppearanceIdsByPageId;
    fieldProperties: FieldProperties;
}): MarcherAppearancesByPageId {
    const appearancesByPageId: MarcherAppearancesByPageId = new Map();

    for (const page of sortedPages) {
        const marcherPages = marcherPagesMap.marcherPagesByPage[page.id] ?? {};
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
                marcherPages,
                fieldProperties,
            }),
        );
    }

    return appearancesByPageId;
}

export function applyMarcherAppearancesForPage({
    pageId,
    marcherAppearancesByPageId,
    canvasMarchersById,
    fieldProperties,
}: {
    pageId: number;
    marcherAppearancesByPageId: MarcherAppearancesByPageId;
    canvasMarchersById: Record<number, CanvasMarcher>;
    fieldProperties: FieldProperties;
}) {
    const appearancesByMarcherId = marcherAppearancesByPageId.get(pageId);
    if (!appearancesByMarcherId) return;

    const labelColor = fieldProperties.theme.defaultMarcher.label;
    for (const [marcherId, appearances] of Object.entries(
        appearancesByMarcherId,
    )) {
        const canvasMarcher = canvasMarchersById[Number(marcherId)];
        if (!canvasMarcher) continue;
        canvasMarcher.setAppearance(
            appearances,
            { requestRenderAll: false },
            labelColor,
        );
    }
}

/**
 * Resolves which page's appearances apply at a playback timestamp.
 * Matches the interval logic used during live animation in useAnimation.
 */
export function getPlaybackPageForTimeMs(
    sortedPages: Page[],
    timeMs: number,
): Page {
    if (sortedPages.length === 0) {
        throw new Error("Cannot resolve playback page without pages");
    }

    const pagesById = Object.fromEntries(
        sortedPages.map((page) => [page.id, page]),
    );
    const firstPage = sortedPages[0];
    const firstPageEndMs = (firstPage.timestamp + firstPage.duration) * 1000;

    if (timeMs < firstPageEndMs) {
        return firstPage;
    }

    const currentPage = sortedPages.find((page) => {
        const nextPage = page.nextPageId ? pagesById[page.nextPageId] : null;
        if (nextPage == null) return false;
        return (
            timeMs >= (page.timestamp + page.duration) * 1000 &&
            timeMs < (nextPage.timestamp + nextPage.duration) * 1000
        );
    });

    if (currentPage) return currentPage;

    return sortedPages[sortedPages.length - 1];
}

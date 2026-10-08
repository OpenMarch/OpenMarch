import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
    generateDrillChartExportSVGs,
    getFieldPropertiesImageElement,
} from "@/components/exporting/utils/svg-generator";
import { buildMarcherAppearancesByPageId } from "@/components/exporting/utils/exportAppearances";
import {
    allMarcherPagesQueryOptions,
    allMarchersQueryOptions,
    allSectionAppearancesQueryOptions,
    allTagAppearancesQueryOptions,
    fieldPropertiesQueryOptions,
    marcherIdsForAllTagIdsQueryOptions,
    tagAppearanceByPageIdMapQueryOptions,
} from "@/hooks/queries";
import type { PagePositionMap } from "@/components/exporting/utils/exportPagePositions";
import type Page from "@/global/classes/Page";
import type Marcher from "@/global/classes/Marcher";
import type { FieldProperties } from "@openmarch/core";
import { useTimingObjects } from "@/hooks";
import { useTimelineMode } from "@/hooks/queries/useWorkspaceSettings";
import { useQuery } from "@tanstack/react-query";
import { useTimelineResolverStore } from "@/timeline/timelineStore";
import { timelinePreviewPositions } from "./svgPreviewPositions";

const SVG_GENERATION_ERROR = "ERROR: Failed to generate SVG";

/**
 * Handler for generating canvas preview SVGs on app close for launch page
 */
const SvgPreviewHandler: React.FC = () => {
    const handlerRegisteredRef = useRef(false);
    // Timeline mode drops the per-page appearance fields of marcher_pages (P7.14)
    const timelineMode = useTimelineMode();

    const { data: fieldProperties } = useQuery(fieldPropertiesQueryOptions());
    const { pages = [] } = useTimingObjects() ?? {};
    // Only page mode reads them: timeline mode samples the resolver for the preview, and the
    // appearances ignore them. Off, every page or flag edit no longer reads all of them again.
    const { data: marcherPages } = useQuery({
        ...allMarcherPagesQueryOptions({
            pinkyPromiseThatYouKnowWhatYouAreDoing: true,
        }),
        enabled: !timelineMode,
    });
    const { data: marchers } = useQuery(allMarchersQueryOptions());
    const { data: sectionAppearances } = useQuery(
        allSectionAppearancesQueryOptions(),
    );
    const { data: marcherIdsByTagId } = useQuery(
        marcherIdsForAllTagIdsQueryOptions(),
    );
    const { data: allTagAppearances } = useQuery(
        allTagAppearancesQueryOptions(),
    );
    const { data: tagAppearanceIdsByPageId } = useQuery(
        tagAppearanceByPageIdMapQueryOptions(),
    );

    const marcherAppearancesByPageId = useMemo(() => {
        if (
            !fieldProperties ||
            !marchers?.length ||
            !sectionAppearances ||
            (!timelineMode && !marcherPages) ||
            !marcherIdsByTagId ||
            !allTagAppearances ||
            !tagAppearanceIdsByPageId ||
            pages.length === 0
        ) {
            return undefined;
        }

        return buildMarcherAppearancesByPageId({
            sortedPages: pages,
            marchers,
            marcherPagesMap: marcherPages,
            timelineMode,
            sectionAppearances,
            marcherIdsByTagId,
            allTagAppearances,
            tagAppearanceIdsByPageId,
            fieldProperties,
        });
    }, [
        timelineMode,
        fieldProperties,
        marchers,
        sectionAppearances,
        marcherPages,
        marcherIdsByTagId,
        allTagAppearances,
        tagAppearanceIdsByPageId,
        pages,
    ]);

    const fieldPropertiesRef = useRef(fieldProperties);
    const marcherPagesRef = useRef<PagePositionMap | undefined>(marcherPages);
    const timelineModeRef = useRef(timelineMode);
    const marchersRef = useRef(Array.isArray(marchers) ? marchers : []);
    const pagesRef = useRef(pages);
    const marcherAppearancesByPageIdRef = useRef(marcherAppearancesByPageId);

    useEffect(() => {
        fieldPropertiesRef.current = fieldProperties;
    }, [fieldProperties]);

    useEffect(() => {
        marcherPagesRef.current = marcherPages;
    }, [marcherPages]);

    useEffect(() => {
        timelineModeRef.current = timelineMode;
    }, [timelineMode]);

    useEffect(() => {
        marchersRef.current = Array.isArray(marchers) ? marchers : [];
    }, [marchers]);

    useEffect(() => {
        pagesRef.current = Array.isArray(pages) ? pages : [];
    }, [pages]);

    useEffect(() => {
        marcherAppearancesByPageIdRef.current = marcherAppearancesByPageId;
    }, [marcherAppearancesByPageId]);

    const generateSvgPreview = useCallback(
        async (
            fieldProps: FieldProperties,
            page: Page,
            marcherPagesMap: PagePositionMap | undefined,
            allMarchers: Marcher[],
        ): Promise<string> => {
            try {
                if (!fieldProps || !page) {
                    throw new Error("Missing field properties or page");
                }

                if (!marcherPagesMap || allMarchers.length === 0) {
                    throw new Error("Missing marcher data for SVG generation");
                }

                if (!marcherPagesMap.marcherPagesByPage?.[page.id]) {
                    throw new Error(
                        "No marcher page mapping available for the selected page",
                    );
                }

                const backgroundImage = await getFieldPropertiesImageElement();
                const { SVGs } = await generateDrillChartExportSVGs({
                    fieldProperties: fieldProps,
                    sortedPages: [page],
                    marchers: allMarchers,
                    marcherPagesMap,
                    sectionAppearances,
                    marcherAppearancesByPageId:
                        marcherAppearancesByPageIdRef.current,
                    backgroundImage,
                    gridLines: true,
                    halfLines: true,
                    individualCharts: false,
                    useImagePlaceholder: false,
                });

                const svg = SVGs?.[0]?.[0];
                if (!svg) {
                    throw new Error("SVG output was empty");
                }
                return svg;
            } catch (err) {
                console.error("Error generating SVG preview:", err);
                return SVG_GENERATION_ERROR;
            }
        },
        [sectionAppearances],
    );

    useEffect(() => {
        if (!window.electron || handlerRegisteredRef.current) return;

        window.electron.onGetSvgForClose(async () => {
            const currentFieldProps = fieldPropertiesRef.current;
            const currentPages = pagesRef.current;
            const currentMarchers = marchersRef.current;

            const firstPage =
                currentPages && currentPages.length > 0
                    ? currentPages[0]
                    : null;

            if (!currentFieldProps || !firstPage) {
                console.error(
                    "Missing required data for SVG generation. Field properties or first page not available.",
                );
                return SVG_GENERATION_ERROR;
            }

            // Timeline mode: marcher_pages is frozen page-era data, so sample the live
            // resolver, only when it is ready and without the write lock (P7.7)
            let currentMarcherPages: PagePositionMap | undefined;
            if (timelineModeRef.current) {
                currentMarcherPages = await timelinePreviewPositions(
                    useTimelineResolverStore.getState(),
                    firstPage,
                );
                if (!currentMarcherPages) return SVG_GENERATION_ERROR;
            } else {
                currentMarcherPages = marcherPagesRef.current;
            }

            const svg = await generateSvgPreview(
                currentFieldProps,
                firstPage,
                currentMarcherPages,
                currentMarchers,
            );

            console.debug(
                "SVG generated successfully for first page on app close",
            );
            return svg;
        });

        handlerRegisteredRef.current = true;
        console.debug("SVG preview handler registered");
    }, [generateSvgPreview, pages]);

    return null;
};

export default SvgPreviewHandler;

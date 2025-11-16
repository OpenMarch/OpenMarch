import React, { useCallback, useEffect, useRef } from "react";
import {
    generateDrillChartExportSVGs,
    getFieldPropertiesImageElement,
} from "@/components/exporting/utils/svg-generator";
import {
    allMarcherPagesQueryOptions,
    allMarchersQueryOptions,
    fieldPropertiesQueryOptions,
} from "@/hooks/queries";
import type MarcherPageMap from "@/global/classes/MarcherPageIndex";
import { useTimingObjects } from "@/hooks";
import { useQuery } from "@tanstack/react-query";

const SVG_GENERATION_ERROR = "ERROR: Failed to generate SVG";

/**
 * Handler for generating canvas preview SVGs on app close for launch page
 */
const SvgPreviewHandler: React.FC = () => {
    const handlerRegisteredRef = useRef(false);

    // Get current values
    const { data: fieldProperties } = useQuery(fieldPropertiesQueryOptions());
    const { pages = [] } = useTimingObjects() ?? {};
    const { data: marcherPages } = useQuery(
        // This might be overkill
        allMarcherPagesQueryOptions({
            pinkyPromiseThatYouKnowWhatYouAreDoing: true,
        }),
    );
    const { data: marchers } = useQuery(allMarchersQueryOptions());

    // Refs to store current values for use in the IPC handler
    const fieldPropertiesRef = useRef(fieldProperties);
    const marcherPagesRef = useRef<MarcherPageMap | undefined>(marcherPages);
    const marchersRef = useRef(Array.isArray(marchers) ? marchers : []);
    const pagesRef = useRef(pages);

    // Keep refs updated
    useEffect(() => {
        fieldPropertiesRef.current = fieldProperties;
    }, [fieldProperties]);

    useEffect(() => {
        marcherPagesRef.current = marcherPages;
    }, [marcherPages]);

    useEffect(() => {
        marchersRef.current = Array.isArray(marchers) ? marchers : [];
    }, [marchers]);

    useEffect(() => {
        pagesRef.current = Array.isArray(pages) ? pages : [];
    }, [pages]);

    /**
     * Generate SVG preview for a page
     */
    const generateSvgPreview = useCallback(
        async (
            fieldProps: any,
            page: any,
            marcherPagesMap: MarcherPageMap | undefined,
            allMarchers: any[],
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
                    backgroundImage,
                    gridLines: true,
                    halfLines: true,
                    individualCharts: false,
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
        [],
    );

    /**
     * Register IPC handler on mount
     */
    useEffect(() => {
        if (!window.electron || handlerRegisteredRef.current) return;

        window.electron.onGetSvgForClose(async () => {
            const currentFieldProps = fieldPropertiesRef.current;
            const currentPages = pagesRef.current;
            const currentMarcherPages = marcherPagesRef.current;
            const currentMarchers = marchersRef.current;

            // Explicitly get the first page only
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

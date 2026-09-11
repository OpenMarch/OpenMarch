import React, { useEffect, useRef } from "react";
import {
    generateDrillChartExportSVGs,
    getFieldPropertiesImageElement,
} from "@/components/exporting/utils/svg-generator";
import { buildMarcherAppearancesByPageId } from "@/components/exporting/utils/exportAppearances";
import {
    _calculateMapAllTagAppearanceIdsByPageId,
    getMarcherIdsByTagIdMap,
    getMarchers,
    getPagesInOrder,
    getSectionAppearances,
    getTagAppearances,
    marcherPagesByPageId,
} from "@/db-functions";
import { getFieldProperties } from "@/global/classes/FieldProperties";
import { dbMarcherToMarcher } from "@/global/classes/Marcher";
import type Page from "@/global/classes/Page";
import { marcherPageMapFromArray } from "@/global/classes/MarcherPageIndex";
import { db } from "@/global/database/db";

const SVG_GENERATION_ERROR = "ERROR: Failed to generate SVG";

/**
 * SVG generation only needs page.id for the overview chart preview.
 */
const pageStubFromId = (id: number): Page => ({
    id,
    name: "",
    order: 0,
    counts: 0,
    nextPageId: null,
    previousPageId: null,
    measures: null,
    duration: 0,
    notes: null,
    isSubset: false,
    beats: [],
    measureBeatToStartOn: null,
    measureBeatToEndOn: null,
    timestamp: 0,
});

/**
 * Fetch fresh data from the DB and generate a first-page SVG for the launch page preview.
 * Intentionally bypasses React Query — this is a one-shot close-time operation.
 */
const generateSvgPreviewForClose = async (): Promise<string> => {
    try {
        const pagesInOrder = await getPagesInOrder({ tx: db });
        const firstPageRow = pagesInOrder[0];
        if (!firstPageRow) {
            throw new Error("No pages available for SVG generation");
        }

        const page = pageStubFromId(firstPageRow.id);

        const [
            fieldProperties,
            marchers,
            marcherPagesForPage,
            sectionAppearances,
            marcherIdsByTagId,
            tagAppearances,
        ] = await Promise.all([
            getFieldProperties(),
            getMarchers({ db }).then((rows) => rows.map(dbMarcherToMarcher)),
            marcherPagesByPageId({ db, pageId: page.id }),
            getSectionAppearances({ db }),
            getMarcherIdsByTagIdMap({ db }),
            getTagAppearances({ db }),
        ]);

        if (marchers.length === 0) {
            throw new Error("Missing marcher data for SVG generation");
        }

        const marcherPagesMap = marcherPageMapFromArray(marcherPagesForPage);
        if (!marcherPagesMap.marcherPagesByPage[page.id]) {
            throw new Error(
                "No marcher page mapping available for the first page",
            );
        }

        const tagAppearanceIdsByPageId =
            _calculateMapAllTagAppearanceIdsByPageId({
                tagAppearances,
                pagesInOrder,
            });

        const marcherAppearancesByPageId = buildMarcherAppearancesByPageId({
            sortedPages: [page],
            marchers,
            marcherPagesMap,
            sectionAppearances,
            marcherIdsByTagId,
            allTagAppearances: tagAppearances,
            tagAppearanceIdsByPageId,
            fieldProperties,
        });

        const backgroundImage = await getFieldPropertiesImageElement();
        const { SVGs } = await generateDrillChartExportSVGs({
            fieldProperties,
            sortedPages: [page],
            marchers,
            marcherPagesMap,
            sectionAppearances,
            marcherAppearancesByPageId,
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

        console.debug("SVG generated successfully for first page on app close");
        return svg;
    } catch (err) {
        console.error("Error generating SVG preview:", err);
        return SVG_GENERATION_ERROR;
    }
};

/**
 * Registers the Electron close handler that generates a canvas preview SVG
 * for the launch page. Fetches data from the DB only when asked.
 */
const SvgPreviewHandler: React.FC = () => {
    const handlerRegisteredRef = useRef(false);

    useEffect(() => {
        if (!window.electron || handlerRegisteredRef.current) return;

        window.electron.onGetSvgForClose(generateSvgPreviewForClose);
        handlerRegisteredRef.current = true;
        console.debug("SVG preview handler registered");
    }, []);

    return null;
};

export default SvgPreviewHandler;

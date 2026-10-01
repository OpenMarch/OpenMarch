/* eslint-disable no-control-regex */
import ReactDOMServer from "react-dom/server";
import type { FieldProperties } from "@openmarch/core";
import type Marcher from "@/global/classes/Marcher";
import type Page from "@/global/classes/Page";
import type tolgee from "@/global/singletons/Tolgee";
import {
    StaticMarcherCoordinateSheet,
    StaticQuarterMarcherSheet,
} from "../MarcherCoordinateSheet";
import {
    type PagePosition,
    type PagePositionMap,
    positionsForMarcherInPageOrder,
} from "./exportPagePositions";

/** How many page rows fit on one quarter sheet. */
export const QUARTER_ROWS = 28;

/** One rendered coordinate sheet, as the `export:pdf` IPC call takes it. */
export interface CoordinateSheet {
    name: string;
    drillNumber: string;
    section: string;
    renderedPage: string;
}

export interface CoordinateSheetOptions {
    quarterPages: boolean;
    terse: boolean;
    includeMeasures: boolean;
    useXY: boolean;
    roundingDenominator: number;
}

type TFunction = (typeof tolgee)["t"];

function chunkArray<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
    }
    return result;
}

/**
 * Renders one coordinate sheet per marcher (or one per quarter-sheet chunk of 28 pages) to HTML.
 *
 * `positions` is where the marchers stand on each page: the `marcher_pages` rows in page mode, or
 * the resolver sampled at each page's end beat in timeline mode
 * (docs/timeline/phases/07-page-parity.md P7.7). Rows are sorted by page order either way.
 *
 * @param marchers - already named and sorted for the export
 * @param t - translates the fallback section name and render errors
 */
export function buildCoordinateSheets({
    marchers,
    pages,
    positions,
    fieldProperties,
    options,
    t,
}: {
    marchers: readonly (Marcher & { name: string })[];
    pages: Page[];
    positions: Pick<PagePositionMap, "marcherPagesByMarcher">;
    fieldProperties: FieldProperties;
    options: CoordinateSheetOptions;
    t: TFunction;
}): CoordinateSheet[] {
    const { quarterPages, terse, includeMeasures, useXY, roundingDenominator } =
        options;
    const section = (marcher: Marcher) =>
        marcher.section || t("exportCoordinates.unsortedSection");
    const rowsFor = (marcher: Marcher): PagePosition[] =>
        positionsForMarcherInPageOrder(positions, marcher.id, pages);

    if (!quarterPages) {
        return marchers.map((marcher) => ({
            name: marcher.name,
            drillNumber: marcher.drill_number,
            section: section(marcher),
            renderedPage: ReactDOMServer.renderToString(
                <StaticMarcherCoordinateSheet
                    marcher={marcher}
                    pages={pages}
                    marcherPages={rowsFor(marcher)}
                    fieldProperties={fieldProperties}
                    includeMeasures={includeMeasures}
                    terse={terse}
                    useXY={useXY}
                    roundingDenominator={roundingDenominator}
                />,
            ),
        }));
    }

    // Quarter sheets for each marcher, organized by performer number
    return marchers.flatMap((marcher) =>
        chunkArray(rowsFor(marcher), QUARTER_ROWS).map((rowChunk, chunkIdx) => {
            try {
                const renderedHtml = ReactDOMServer.renderToString(
                    <StaticQuarterMarcherSheet
                        marcher={marcher}
                        pages={pages}
                        marcherPages={rowChunk}
                        fieldProperties={fieldProperties}
                        roundingDenominator={roundingDenominator}
                        terse={terse}
                        quarterPageNumber={chunkIdx + 1}
                        useXY={useXY}
                        includeMeasures={includeMeasures}
                    />,
                );

                // Clean up the HTML to prevent URL encoding issues
                const cleanedHtml = renderedHtml
                    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // Remove control characters
                    .replace(/\s+/g, " ") // Normalize whitespace
                    .trim();

                return {
                    name: marcher.name,
                    drillNumber: marcher.drill_number,
                    section: section(marcher),
                    renderedPage: cleanedHtml,
                };
            } catch (error) {
                console.error(
                    `Error rendering quarter page for ${marcher.drill_number}:`,
                    error,
                );
                return {
                    name: marcher.name,
                    drillNumber: marcher.drill_number,
                    section: section(marcher),
                    renderedPage: `<div><h3>${t("exportCoordinates.errorRendering", { drillNumber: marcher.drill_number })}</h3><p>${error instanceof Error ? error.message : t("exportCoordinates.unknownError")}</p></div>`,
                };
            }
        }),
    );
}

import { useEffect, useRef, useState } from "react";
import type { FieldProperties } from "@openmarch/core";
import type Marcher from "@/global/classes/Marcher";
import type Page from "@/global/classes/Page";
import type { SectionAppearance } from "@/db-functions";
import { db } from "@/global/database/db";
import tolgee from "@/global/singletons/Tolgee";
import type { FieldViewFrom } from "@/field/fieldViewFrom";
import {
    readTimelineExportPositions,
    type ExportPositions,
} from "./utils/exportPagePositions";
import type { MarcherAppearancesByPageId } from "./utils/exportAppearances";
import {
    generateDrillChartExportSVGs,
    getFieldImageForExport,
} from "./utils/svg-generator";
import type { DrillChartFieldImage } from "./utils/drillChartSvg";

/** A drawn preview and the view it was drawn in. */
type Drawn = { url: string; viewFrom: FieldViewFrom };

/**
 * The drill chart tab's preview: one chart of this show as the export will draw it, in the
 * chosen view. An individual chart shows the first marcher on the second page (so both of its
 * paths show); the overview shows the first page.
 *
 * The show's positions are read once, when the tab opens: the dialog is modal, so the show
 * doesn't change under it, and switching options only redraws. The last chart stays up while
 * the next one draws.
 */
export default function DrillChartPreview({
    fieldProperties,
    pages,
    marchers,
    sectionAppearances,
    marcherAppearancesByPageId,
    gridLines,
    halfLines,
    individualCharts,
    viewFrom,
}: {
    fieldProperties: FieldProperties;
    pages: Page[];
    marchers: Marcher[];
    sectionAppearances?: SectionAppearance[];
    marcherAppearancesByPageId?: MarcherAppearancesByPageId;
    gridLines: boolean;
    halfLines: boolean;
    individualCharts: boolean;
    viewFrom: FieldViewFrom;
}) {
    const [source, setSource] = useState<{
        positions: ExportPositions;
        image: DrillChartFieldImage | undefined;
    } | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { positions, walkedPaths } =
                await readTimelineExportPositions(db);
            const image = await getFieldImageForExport();
            if (!cancelled)
                setSource({ positions: { ...positions, walkedPaths }, image });
        })().catch((error) => {
            // The export reads the positions again and reports what's wrong itself
            console.warn("Couldn't draw the drill chart preview", error);
            if (!cancelled) setFailed(true);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const [drawn, setDrawn] = useState<Drawn | null>(null);
    // The object URL shown, revoked when it's replaced or the preview closes
    const shownUrl = useRef<string | null>(null);
    useEffect(
        () => () => {
            if (shownUrl.current) URL.revokeObjectURL(shownUrl.current);
        },
        [],
    );

    useEffect(() => {
        if (!source || !marchers.length || !pages.length) return;
        let cancelled = false;
        const pageIndex = individualCharts ? Math.min(1, pages.length - 1) : 0;
        // The page shown, and for an individual chart the pages beside it, for its paths
        const from = individualCharts ? Math.max(0, pageIndex - 1) : 0;
        const to = individualCharts ? pageIndex + 2 : 1;
        void generateDrillChartExportSVGs({
            fieldProperties,
            marchers,
            sortedPages: pages.slice(from, to),
            marcherPagesMap: source.positions,
            walkedPaths: source.positions.walkedPaths,
            sectionAppearances,
            marcherAppearancesByPageId,
            backgroundImage: source.image,
            useImagePlaceholder: false,
            gridLines,
            halfLines,
            individualCharts,
            viewFrom,
            onlyMarcherIds: new Set([marchers[0]!.id]),
        }).then(
            ({ SVGs }) => {
                // The first marcher's charts, or the overview's
                const svg = SVGs[0]?.[pageIndex - from];
                if (cancelled) return;
                if (!svg) {
                    setFailed(true);
                    return;
                }
                const url = URL.createObjectURL(
                    new Blob([svg], { type: "image/svg+xml" }),
                );
                if (shownUrl.current) URL.revokeObjectURL(shownUrl.current);
                shownUrl.current = url;
                setFailed(false);
                setDrawn({ url, viewFrom });
            },
            (error) => {
                console.warn("Couldn't draw the drill chart preview", error);
                if (!cancelled) setFailed(true);
            },
        );
        return () => {
            cancelled = true;
        };
    }, [
        source,
        fieldProperties,
        pages,
        marchers,
        sectionAppearances,
        marcherAppearancesByPageId,
        gridLines,
        halfLines,
        individualCharts,
        viewFrom,
    ]);

    if (!drawn || failed)
        return (
            <p
                className="text-sub py-32 text-center text-gray-600"
                data-testid="drill-chart-preview-status"
            >
                {tolgee.t(
                    failed
                        ? "exportCoordinates.drillChartPreviewUnavailable"
                        : "exportCoordinates.drillChartPreviewLoading",
                )}
            </p>
        );
    return (
        <img
            src={drawn.url}
            alt={tolgee.t("exportCoordinates.drillChartPreviewAlt")}
            data-testid="drill-chart-preview"
            data-view-from={drawn.viewFrom}
            className="block w-full"
            style={{ maxHeight: "20rem", objectFit: "contain" }}
        />
    );
}

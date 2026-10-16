import Marcher from "@/global/classes/Marcher";
import Page from "@/global/classes/Page";
import { FieldProperties } from "@openmarch/core";
import { ReadableCoords } from "@/global/classes/ReadableCoords";
import { db } from "@/global/database/db";
import { SectionAppearance } from "@/db-functions";
import type { AppearanceComponentOptional } from "@/entity-components/appearance";
import type { PagePosition, PagePositionMap } from "./exportPagePositions";
import type { MarcherAppearancesByPageId } from "./exportAppearances";
import {
    drillChartSvg,
    fieldSvg,
    type DrillChartDot,
    type DrillChartFieldImage,
} from "./drillChartSvg";

/**
 * Each marcher's appearance stack on a page: the page's stack when there is one, otherwise the
 * marcher's section appearance (or the theme's default).
 */
const appearancesForPage = ({
    marchers,
    sectionAppearances,
    marcherAppearancesByPageId,
}: {
    marchers: Marcher[];
    sectionAppearances?: SectionAppearance[];
    marcherAppearancesByPageId?: MarcherAppearancesByPageId;
}) => {
    const bySection = new Map(
        (sectionAppearances ?? []).map((appearance) => [
            appearance.section,
            appearance,
        ]),
    );
    const fallback = new Map<number, AppearanceComponentOptional[]>(
        marchers.map((marcher) => {
            const section = bySection.get(marcher.section);
            return [marcher.id, section ? [section] : []];
        }),
    );
    // A page without stacks keeps the previous page's, as the canvas did
    let previous = fallback;
    return (pageId: number) => {
        const stacks = marcherAppearancesByPageId?.get(pageId);
        if (!stacks) return previous;
        const current = new Map(previous);
        for (const [marcherId, stack] of Object.entries(stacks))
            current.set(Number(marcherId), stack);
        previous = current;
        return current;
    };
};

// eslint-disable-next-line max-lines-per-function
export const generateDrillChartExportSVGs = async (args: {
    fieldProperties: FieldProperties;
    sortedPages: Page[];
    marchers: Marcher[];
    /** Positions by page, sampled from the resolver at each page's end beat (P7.7) */
    marcherPagesMap: Pick<PagePositionMap, "marcherPagesByPage">;
    sectionAppearances?: SectionAppearance[];
    marcherAppearancesByPageId?: MarcherAppearancesByPageId;
    backgroundImage?: DrillChartFieldImage;
    gridLines?: boolean;
    halfLines?: boolean;
    individualCharts: boolean;
    /** Write the field image as a placeholder the PDF export fills in (main process) */
    useImagePlaceholder?: boolean;
    /** Space around the field for the checkpoint labels, in field pixels */
    svgMargin?: number;
}): Promise<{ SVGs: string[][]; coords: string[][] }> => {
    const {
        fieldProperties,
        marchers,
        sortedPages,
        marcherPagesMap,
        backgroundImage,
        gridLines = true,
        halfLines = true,
        individualCharts,
        useImagePlaceholder = true,
        svgMargin = 40,
    } = args;
    ReadableCoords.setFieldProperties(fieldProperties);

    const field = fieldSvg(fieldProperties, {
        gridLines,
        halfLines,
        image: backgroundImage && {
            ...backgroundImage,
            href: useImagePlaceholder
                ? OPENMARCH_FIELD_IMAGE_PLACEHOLDER
                : backgroundImage.href,
        },
    });
    const appearancesOn = appearancesForPage(args);
    const chart = (
        dots: DrillChartDot[],
        focus?: Parameters<typeof drillChartSvg>[0]["focus"],
    ) =>
        drillChartSvg({
            fieldProperties,
            field,
            dots,
            focus,
            margin: svgMargin,
        });

    const positionOn = (pageIndex: number, marcherId: number) => {
        const page = sortedPages[pageIndex];
        return page
            ? marcherPagesMap.marcherPagesByPage[page.id]?.[marcherId]
            : undefined;
    };

    // One array per marcher (individual charts) or a single one (the main chart)
    const outputSVGs: string[][] = individualCharts
        ? marchers.map(() => [])
        : [[]];
    // Readable coordinates per marcher; the main chart has none, so its strings are empty
    const readableCoordsStrings: string[][] = individualCharts
        ? marchers.map(() => [])
        : marchers.map(() => sortedPages.map(() => ""));
    // Individual charts: indexes of marchers with no position on some page
    const incompleteMarchers = new Set<number>();

    for (const [pageIndex, page] of sortedPages.entries()) {
        const positions: Record<number, PagePosition> =
            marcherPagesMap.marcherPagesByPage[page.id] ?? {};
        const appearances = appearancesOn(page.id);
        const dots: DrillChartDot[] = [];
        const dotsById = new Map<number, DrillChartDot>();
        for (const marcher of marchers) {
            const position = positions[marcher.id];
            if (!position) continue;
            const dot: DrillChartDot = {
                marcherId: marcher.id,
                label: marcher.drill_number,
                x: position.x,
                y: position.y,
                appearances: appearances.get(marcher.id) ?? [],
            };
            dots.push(dot);
            dotsById.set(marcher.id, dot);
        }

        if (!individualCharts) {
            outputSVGs[0]!.push(chart(dots));
            continue;
        }

        marchers.forEach((marcher, index) => {
            const dot = dotsById.get(marcher.id);
            if (!dot) {
                console.error(
                    `No marcherPage found for marcher id: ${marcher.id} on page: ${page.id}`,
                );
                incompleteMarchers.add(index);
                return;
            }
            outputSVGs[index]!.push(
                chart(dots, {
                    dot,
                    path: {
                        previous: positionOn(pageIndex - 1, marcher.id),
                        current: dot,
                        next: positionOn(pageIndex + 1, marcher.id),
                    },
                }),
            );
            readableCoordsStrings[index]!.push(
                ReadableCoords.fromMarcherPage(
                    positions[marcher.id]!,
                ).toString(),
            );
        });
    }

    // A marcher missing on any page gets no pages at all, never a partial chart, and the arrays
    // stay aligned with `marchers` (the caller skips that marcher's PDF)
    for (const index of incompleteMarchers) {
        outputSVGs[index] = [];
        readableCoordsStrings[index] = [];
    }

    return { SVGs: outputSVGs, coords: readableCoordsStrings };
};

export async function getFieldPropertiesImage(): Promise<Uint8Array | null> {
    const result = await db.query.field_properties.findFirst({
        columns: { image: true },
    });
    return result?.image ?? null;
}
export const OPENMARCH_FIELD_IMAGE_PLACEHOLDER =
    "OPENMARCH_FIELD_IMAGE_PLACEHOLDER";

/** The image type from its first bytes; PNG unless it's a JPEG, GIF or WebP */
const imageMimeType = (bytes: Uint8Array): string => {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46)
        return "image/gif";
    if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42)
        return "image/webp";
    return "image/png";
};

/**
 * The show's field image for a drill chart: a data URL and its natural size, once it has
 * loaded. Undefined when the show has no image; size 0 when the browser can't decode it.
 */
export const getFieldImageForExport = async (): Promise<
    DrillChartFieldImage | undefined
> => {
    const bytes = await getFieldPropertiesImage();
    if (bytes === null) return;
    const base64 = btoa(
        Array.from(bytes)
            .map((byte) => String.fromCharCode(byte))
            .join(""),
    );
    const href = `data:${imageMimeType(bytes)};base64,${base64}`;
    const img = new Image();
    img.src = href;
    try {
        await img.decode();
    } catch (error) {
        // Still embed it, as before: the PDF export may be able to draw what the browser can't
        console.error("Couldn't decode the field image for export", error);
        return { href, width: 0, height: 0 };
    }
    return { href, width: img.naturalWidth, height: img.naturalHeight };
};

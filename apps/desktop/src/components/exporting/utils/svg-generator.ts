import Marcher from "@/global/classes/Marcher";
import Page from "@/global/classes/Page";
import { FieldProperties, FieldTheme, rgbaToString } from "@openmarch/core";
import MarcherPageMap from "@/global/classes/MarcherPageIndex";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { defaultSettings } from "@/stores/UiSettingsStore";
import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";
import { ReadableCoords } from "@/global/classes/ReadableCoords";
import MarcherPage from "@/global/classes/MarcherPage";
import { fabric } from "fabric";
import { NoControls } from "@/components/canvas/CanvasConstants";
import { db } from "@/global/database/db";
import { SectionAppearance } from "@/db-functions";

const SectionAppearanceBySection = (
    sectionAppearances: SectionAppearance[] | undefined,
): Map<string, SectionAppearance> => {
    return sectionAppearances
        ? new Map(
              sectionAppearances.map((sectionAppearance) => [
                  sectionAppearance.section,
                  sectionAppearance,
              ]),
          )
        : new Map();
};

export const _calculateViewBox = (
    canvas: OpenMarchCanvas,
    padding = 20,
): fabric.IViewBox => {
    const objects = canvas.getObjects();

    if (objects.length === 0)
        return {
            x: 0,
            y: 0,
            width: canvas.getWidth(),
            height: canvas.getHeight(),
        };

    // 1. Compute global bounding box of all objects
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

    objects.forEach((obj) => {
        const bounds = obj.getBoundingRect(true, true); // account for transform
        minX = Math.min(minX, bounds.left);
        minY = Math.min(minY, bounds.top);
        maxX = Math.max(maxX, bounds.left + bounds.width);
        maxY = Math.max(maxY, bounds.top + bounds.height);
    });

    // 2. Calculate new width/height with padding
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;

    return {
        x: minX - padding,
        y: minY - padding,
        width,
        height,
    };
};

const addIndividualMarcherLines = ({
    canvas,
    currentCoordinate,
    previousCoordinate,
    nextCoordinate,
    fieldTheme,
}: {
    canvas: OpenMarchCanvas;
    currentCoordinate: Pick<MarcherPage, "x" | "y" | "marcher_id">;
    previousCoordinate?: Pick<MarcherPage, "x" | "y">;
    nextCoordinate?: Pick<MarcherPage, "x" | "y">;
    fieldTheme: Pick<FieldTheme, "previousPath" | "nextPath">;
}): { objectsToRemove: fabric.Object[]; readableCoords: ReadableCoords } => {
    const readableCoords = ReadableCoords.fromMarcherPage(currentCoordinate);

    const objectsToRemove: fabric.Object[] = [];

    if (previousCoordinate)
        objectsToRemove.push(
            ...canvas.renderTemporaryPathVisuals({
                start: previousCoordinate,
                end: currentCoordinate,
                marcherId: currentCoordinate.marcher_id,
                color: rgbaToString(fieldTheme.previousPath),
            }),
        );

    if (nextCoordinate)
        objectsToRemove.push(
            ...canvas.renderTemporaryPathVisuals({
                start: currentCoordinate,
                end: nextCoordinate,
                marcherId: currentCoordinate.marcher_id,
                color: rgbaToString(fieldTheme.nextPath),
            }),
        );

    // Add box around prev coordinate
    if (previousCoordinate) {
        const square = new fabric.Rect({
            left: previousCoordinate.x,
            top: previousCoordinate.y,
            width: 20,
            height: 20,
            fill: "transparent",
            stroke: "blue",
            strokeWidth: 3,
            originX: "center",
            originY: "center",
            ...NoControls,
        });
        canvas.add(square);
        objectsToRemove.push(square);
    }

    // Add circle around next coordinate
    if (nextCoordinate) {
        const circle = new fabric.Circle({
            left: nextCoordinate.x,
            top: nextCoordinate.y,
            radius: 10,
            fill: "transparent",
            stroke: "hsl(281, 82%, 63%)",
            strokeWidth: 3,
            originX: "center",
            originY: "center",
            ...NoControls,
        });
        canvas.add(circle);
        objectsToRemove.push(circle);
    }

    // Send marcher to the front
    canvas.sendCanvasMarcherToFront(
        CanvasMarcher.getCanvasMarcherForMarcher(canvas, {
            id: currentCoordinate.marcher_id,
        })!,
    );

    // Convert to SVG after adding pathways
    canvas.renderAll();

    return { objectsToRemove, readableCoords };
};

const initializeCanvasForRendering = async (args: {
    fieldProperties: FieldProperties;
    sortedPages: Page[];
    marchers: Marcher[];
    sectionAppearances?: SectionAppearance[];
    backgroundImage?: HTMLImageElement;
    gridLines?: boolean;
    halfLines?: boolean;
    svgMargin?: number;
}): Promise<{
    canvas: OpenMarchCanvas;
    // viewBox: fabric.IViewBox;
    canvasMarchersById: Record<number, CanvasMarcher>;
}> => {
    const {
        fieldProperties,
        sortedPages,
        marchers,
        sectionAppearances,
        backgroundImage,
        gridLines = true,
        halfLines = true,
        svgMargin = 40,
    } = args;

    const canvasElement = document.createElement("canvas");
    const canvas = new OpenMarchCanvas({
        canvasRef: canvasElement,
        fieldProperties,
        uiSettings: {
            ...defaultSettings,
            gridLines,
            halfLines,
        },
        currentPage: sortedPages[0],
        isGeneratingSVG: true,
    });

    canvas.setWidth(fieldProperties.width + svgMargin * 2);
    canvas.setHeight(fieldProperties.height + svgMargin * 2);
    canvas.viewportTransform = [1, 0, 0, 1, svgMargin, svgMargin];

    // Add the background image
    await canvas.refreshBackgroundImage(true, backgroundImage);

    const sectionAppearanceBySection =
        SectionAppearanceBySection(sectionAppearances);

    const canvasMarchersById: Record<number, CanvasMarcher> = {};
    // Add every marcher
    for (const marcher of marchers) {
        const sectionAppearance = sectionAppearanceBySection.get(
            marcher.section,
        );
        const canvasMarcher = new CanvasMarcher({
            marcher,
            coordinate: { x: 0, y: 0 }, // dummy coordinate, will be set later
            appearances: sectionAppearance,
        });
        canvasMarchersById[marcher.id] = canvasMarcher;
        // Add the marcher to the canvas
        canvas.add(canvasMarcher);
        canvas.add(canvasMarcher.textLabel);
    }
    ReadableCoords.setFieldProperties(fieldProperties);

    // const viewBox = _calculateViewBox(canvas);

    return { canvas, canvasMarchersById };
};

const renderIndividualMarcherChartsForPage = (args: {
    fieldProperties: FieldProperties;
    canvas: OpenMarchCanvas;
    marchers: Marcher[];
    marcherPagesByMarcherForCurrentPage: Record<number, MarcherPage>;
    page: Page;
    pageIndex: number;
    marcherPagesMap: MarcherPageMap;
    sortedPages: Page[];
}) => {
    const {
        fieldProperties,
        canvas,
        marchers,
        marcherPagesByMarcherForCurrentPage,
        page,
        pageIndex,
        marcherPagesMap,
        sortedPages,
    } = args;
    const marcherSvgs: string[] = [];
    const marcherReadableCoordStrings: string[] = [];

    for (const marcher of marchers) {
        const currentCoordinate =
            marcherPagesByMarcherForCurrentPage[marcher.id];
        if (!currentCoordinate) {
            console.error(
                `No marcherPage found for marcher id: ${marcher.id} on page: ${page.id}`,
            );
            continue;
        }

        const previousCoordinate =
            pageIndex > 0
                ? marcherPagesMap.marcherPagesByPage[
                      sortedPages[pageIndex - 1].id
                  ][marcher.id]
                : undefined;
        const nextCoordinate =
            pageIndex < sortedPages.length - 1
                ? marcherPagesMap.marcherPagesByPage[
                      sortedPages[pageIndex + 1]?.id
                  ][marcher.id]
                : undefined;

        const { objectsToRemove, readableCoords } = addIndividualMarcherLines({
            canvas,
            currentCoordinate,
            previousCoordinate,
            nextCoordinate,
            fieldTheme: fieldProperties.theme,
        });

        // render the SVG output for the current marcher
        marcherSvgs.push(canvas.toSVG());

        // remove the objects to keep the canvas clean for the next marcher
        objectsToRemove.forEach((object: fabric.Object) =>
            canvas.remove(object),
        );

        // store the readable coordinates for the current marcher
        marcherReadableCoordStrings.push(readableCoords.toString());
    }

    return { marcherSvgs, marcherReadableCoordStrings };
};

export const generateDrillChartExportSVGs = async (args: {
    fieldProperties: FieldProperties;
    sortedPages: Page[];
    marchers: Marcher[];
    marcherPagesMap: MarcherPageMap;
    sectionAppearances?: SectionAppearance[];
    backgroundImage?: HTMLImageElement;
    gridLines?: boolean;
    halfLines?: boolean;
    individualCharts: boolean;
    useImagePlaceholder?: boolean;
}): Promise<{ SVGs: string[][]; coords: string[][] }> => {
    const {
        fieldProperties,
        marchers,
        sortedPages,
        marcherPagesMap,
        individualCharts,
        useImagePlaceholder = true,
    } = args;
    const outputSVGs: string[][] = [];
    // Readable coordinates storage for each marcher
    const readableCoordsStrings: string[][] = individualCharts
        ? Array.from({ length: marchers.length }, () => [])
        : Array.from({ length: marchers.length }, () =>
              Array.from({ length: sortedPages.length }, () => ""),
          );

    const { canvas, canvasMarchersById } =
        await initializeCanvasForRendering(args);

    // If individual charts are enabled, initialize the output SVGs array for each marcher
    // Otherwise, initialize the output SVGs for the main chart
    if (individualCharts) marchers.forEach(() => outputSVGs.push([]));
    else outputSVGs.push([]);

    // Loop through each page and generate an SVG for it
    for (const [pageIndex, page] of sortedPages.entries()) {
        const marcherPagesByMarcherForCurrentPage =
            marcherPagesMap.marcherPagesByPage[page.id];

        for (const marcherPage of Object.values(
            marcherPagesByMarcherForCurrentPage,
        )) {
            const canvasMarcher = canvasMarchersById[marcherPage.marcher_id];
            if (!canvasMarcher) continue;
            canvasMarcher.setMarcherCoords(marcherPage);
        }

        if (individualCharts) {
            const { marcherSvgs, marcherReadableCoordStrings } =
                renderIndividualMarcherChartsForPage({
                    fieldProperties,
                    canvas,
                    marchers,
                    marcherPagesByMarcherForCurrentPage,
                    page,
                    pageIndex,
                    marcherPagesMap,
                    sortedPages,
                });
            if (useImagePlaceholder)
                marcherSvgs.forEach((svg, index) =>
                    outputSVGs[index].push(
                        replaceImageDataWithPlaceholder(svg),
                    ),
                );
            else
                marcherSvgs.forEach((svg, index) =>
                    outputSVGs[index].push(svg),
                );

            marcherReadableCoordStrings.forEach((coord, index) =>
                readableCoordsStrings[index].push(coord),
            );
        } else {
            if (outputSVGs.length === 0) outputSVGs.push([]);

            // Render the canvas and add the SVG to the output
            if (useImagePlaceholder)
                outputSVGs[0].push(
                    replaceImageDataWithPlaceholder(canvas.toSVG()),
                );
            else outputSVGs[0].push(canvas.toSVG());
        }
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
export const replaceImageDataWithPlaceholder = (svg: string): string => {
    return svg.replace(
        /(<image .* xlink:href=)"[^\s]*/g,
        `$1"${OPENMARCH_FIELD_IMAGE_PLACEHOLDER}"`,
    );
};

export const getFieldPropertiesImageElement = async (): Promise<
    HTMLImageElement | undefined
> => {
    const backgroundImage = await getFieldPropertiesImage();

    if (backgroundImage === null) {
        return;
    }
    const base64 = btoa(
        Array.from(backgroundImage)
            .map((byte) => String.fromCharCode(byte))
            .join(""),
    );

    const img = new Image();
    // Determine the MIME type (assume PNG, but you could detect it from the file header)
    // Common image formats: image/png, image/jpeg, image/gif
    const mimeType = "image/png"; // Adjust if you know the actual format
    img.src = `data:${mimeType};base64,${base64}`;

    return img;
};

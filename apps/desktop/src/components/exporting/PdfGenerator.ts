import Marcher from "@/global/classes/Marcher";
import Page from "@/global/classes/Page";
import { FieldProperties } from "@openmarch/core";
import MarcherPageMap from "@/global/classes/MarcherPageIndex";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { defaultSettings } from "@/stores/UiSettingsStore";
import { SectionAppearance } from "@/global/classes/SectionAppearance";
import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";

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

export const generateFieldSVGs = async ({
    fieldProperties,
    pages,
    marchers,
    marcherPagesMap,
    backgroundImage,
    sectionAppearances,
    gridLines = true,
    halfLines = true,
}: {
    fieldProperties: FieldProperties;
    pages: Page[];
    marchers: Marcher[];
    marcherPagesMap: MarcherPageMap;
    sectionAppearances?: SectionAppearance[];
    backgroundImage?: HTMLImageElement;
    gridLines?: boolean;
    halfLines?: boolean;
}): Promise<string[]> => {
    const outPutSVGs: string[] = [];

    const canvasElement = document.createElement("canvas");
    canvasElement.width = 2000;
    canvasElement.height = 2000;
    const canvas = new OpenMarchCanvas({
        canvasRef: canvasElement,
        fieldProperties,
        uiSettings: {
            ...defaultSettings,
            gridLines,
            halfLines,
        },
        currentPage: pages[0],
        isGeneratingSVG: true,
    });

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
            sectionAppearance,
        });
        canvasMarchersById[marcher.id] = canvasMarcher;
        // Add the marcher to the canvas
        canvas.add(canvasMarcher);
        canvas.add(canvasMarcher.textLabel);
    }

    for (const page of pages) {
        const marcherPagesByMarcher =
            marcherPagesMap.marcherPagesByPage[page.id];

        for (const marcherPage of Object.values(marcherPagesByMarcher)) {
            const canvasMarcher = canvasMarchersById[marcherPage.marcher_id];
            if (!canvasMarcher) continue;
            canvasMarcher.setMarcherCoords(marcherPage);
        }

        const viewBox = _calculateViewBox(canvas);
        // Render the canvas and add the SVG to the output
        outPutSVGs.push(canvas.toSVG({ viewBox }));
    }

    return outPutSVGs;
};

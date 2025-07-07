import { useCallback, useRef, useState } from "react";
import ReactDOMServer from "react-dom/server";
import { fabric } from "fabric";
import { NoControls } from "@/components/canvas/CanvasConstants";
import MarcherCoordinateSheet, {
    StaticMarcherCoordinateSheet,
    StaticCompactMarcherSheet,
} from "./MarcherCoordinateSheet";
import { useFieldProperties } from "@/context/fieldPropertiesContext";
import { useMarcherStore } from "@/stores/MarcherStore";
import MarcherPage from "@/global/classes/MarcherPage";
import { useMarcherPageStore } from "@/stores/MarcherPageStore";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogTitle,
    DialogTrigger,
} from "@openmarch/ui";
import { ArrowSquareOutIcon, InfoIcon } from "@phosphor-icons/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { TooltipContents, Button, Input, Checkbox } from "@openmarch/ui";
import * as Form from "@radix-ui/react-form";
import { toast } from "sonner";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { rgbaToString } from "@/global/classes/FieldTheme";
import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";
import { ReadableCoords } from "@/global/classes/ReadableCoords";
import individualDemoSVG from "@/assets/drill_chart_export_individual_demo.svg";
import overviewDemoSVG from "@/assets/drill_chart_export_overview_demo.svg";
import { Tabs, TabsList, TabContent, TabItem } from "@openmarch/ui";

function chunkArray<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
    }
    return result;
}
const QUARTER_ROWS = 18;

function CoordinateSheetExport() {
    const [isTerse, setIsTerse] = useState(false);
    const [includeMeasures, setIncludeMeasures] = useState(true);
    const [useXY, setUseXY] = useState(false);
    const [roundingDenominator, setRoundingDenominator] = useState(4);
    const [organizeBySection, setOrganizeBySection] = useState(false);
    const [quarterPages, setQuarterPages] = useState(false);
    const { marchers } = useMarcherStore()!;
    const { pages } = useTimingObjectsStore()!;
    const { marcherPages } = useMarcherPageStore()!;
    const { fieldProperties } = useFieldProperties()!;
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentStep, setCurrentStep] = useState("");

    const handleExport = useCallback(async () => {
        setIsLoading(true);
        setProgress(0);
        setCurrentStep("Initializing coordinate sheet export...");

        if (!fieldProperties) {
            toast.error("Field properties are required for export");
            setIsLoading(false);
            return;
        }

        try {
            setCurrentStep("Processing marcher data...");
            setProgress(10);

            const processedMarchers = marchers.map((marcher, index) => ({
                ...marcher,
                name: marcher.name || `${marcher.section} ${index + 1}`,
            }));

            setCurrentStep("Generating coordinate sheets...");
            setProgress(30);

            let groupedSheets: any[];

            // split to quarter sheets
            if (quarterPages) {
                const marcherQuarterSheets = processedMarchers.flatMap(
                    (marcher, mIdx) => {
                        const marcherPagesForMarcher = marcherPages
                            .filter((mp) => mp.marcher_id === marcher.id)
                            .sort((a, b) => {
                                const pageA = pages.find(
                                    (p) => p.id === a.page_id,
                                );
                                const pageB = pages.find(
                                    (p) => p.id === b.page_id,
                                );
                                return (
                                    (pageA?.order ?? 0) - (pageB?.order ?? 0)
                                );
                            });

                        const rowChunks = chunkArray(
                            marcherPagesForMarcher,
                            QUARTER_ROWS,
                        );
                        return rowChunks.map((rowChunk, chunkIdx) => {
                            return {
                                name: marcher.name,
                                drillNumber: marcher.drill_number,
                                section: marcher.section || "Unsorted",
                                renderedPage: ReactDOMServer.renderToString(
                                    <StaticCompactMarcherSheet
                                        marcher={marcher}
                                        pages={pages}
                                        marcherPages={rowChunk}
                                        fieldProperties={fieldProperties}
                                        roundingDenominator={
                                            roundingDenominator
                                        }
                                        terse={isTerse}
                                        quarterPageNumber={chunkIdx + 1}
                                    />,
                                ),
                            };
                        });
                    },
                );
                groupedSheets = chunkArray(marcherQuarterSheets, 4).map(
                    (group: any, groupIdx: any) => {
                        const gridItems = Array(4)
                            .fill(null)
                            .map((_, idx) =>
                                group[idx]
                                    ? `<div class="marcher-table">${group[idx].renderedPage}</div>`
                                    : `<div class="marcher-table"></div>`,
                            )
                            .join("");

                        const pageHtml = `
                            <div style="
                                display: grid;
                                grid-template-columns: 1fr 1fr;
                                grid-template-rows: 1fr 1fr;
                                gap: 0.5rem;
                                width: 100%;
                                height: 100%;
                                box-sizing: border-box;
                                padding: 1rem;
                            ">
                                ${gridItems}
                            </div>
                            <style>
                                .marcher-table tr:nth-child(even) { background: #d0d0d0; }
                                .marcher-table {
                                    box-sizing: border-box;
                                    width: 100%;
                                    height: 100%;
                                    overflow: hidden;
                                    border: 1px solid #e5e7eb;
                                    padding: 0.5rem;
                                    font-size: 80%;
                                }
                                .marcher-table table {
                                    width: 100% !important;
                                    font-size: 90% !important;
                                }
                            </style>
                            `;
                        return {
                            name: `Page ${groupIdx + 1}`,
                            drillNumber: "",
                            section: group[0]?.section,
                            renderedPage: pageHtml,
                        };
                    },
                );
            } else {
                // regular format
                groupedSheets = processedMarchers.map((marcher) => ({
                    name: marcher.name,
                    drillNumber: marcher.drill_number,
                    section: marcher.section || "Unsorted",
                    renderedPage: ReactDOMServer.renderToString(
                        <StaticMarcherCoordinateSheet
                            marcher={marcher}
                            pages={pages}
                            marcherPages={marcherPages}
                            fieldProperties={fieldProperties}
                            includeMeasures={includeMeasures}
                            terse={isTerse}
                            useXY={useXY}
                            roundingDenominator={roundingDenominator}
                        />,
                    ),
                }));
            }

            setCurrentStep("Generating PDF...");
            setProgress(85);

            const result = await window.electron.export.pdf({
                sheets: groupedSheets,
                organizeBySection: organizeBySection,
                quarterPages: quarterPages,
            });

            if (!result.success) {
                throw new Error(result.error);
            }

            setProgress(100);
            setCurrentStep("Export completed!");

            // Add success toast message
            const successMessage = `Successfully exported coordinate sheets for ${marchers.length} marcher${marchers.length === 1 ? "" : "s"}!`;

            toast.success(successMessage);
        } catch (error) {
            console.error("Export error:", error);
            setCurrentStep("Export failed");
            toast.error(
                `Export failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
        } finally {
            // Keep the completed state visible for a moment before hiding
            setTimeout(() => {
                setIsLoading(false);
                setProgress(0);
                setCurrentStep("");
            }, 1500);
        }
    }, [
        fieldProperties,
        marchers,
        quarterPages,
        organizeBySection,
        marcherPages,
        pages,
        roundingDenominator,
        isTerse,
        includeMeasures,
        useXY,
    ]);

    return (
        <div className="flex flex-col gap-20">
            <Form.Root className="grid grid-cols-2 gap-y-24">
                <Form.Field
                    name="includeMeasures"
                    className="flex w-full items-center gap-12"
                >
                    <Form.Control asChild>
                        <Checkbox
                            checked={includeMeasures}
                            onCheckedChange={(checked: boolean) =>
                                setIncludeMeasures(checked)
                            }
                        />
                    </Form.Control>
                    <Form.Label className="text-body">
                        {" "}
                        Include measures{" "}
                    </Form.Label>
                </Form.Field>

                <Form.Field
                    name="abbreviateCoordinateDescriptions"
                    className="flex w-full items-center gap-12"
                >
                    <Form.Control asChild>
                        <Checkbox
                            checked={isTerse || quarterPages}
                            disabled={quarterPages}
                            onCheckedChange={(checked: boolean) => {
                                setIsTerse(checked);
                            }}
                        />
                    </Form.Control>
                    <Form.Label className="text-body">
                        {" "}
                        Abbreviate coordinate descriptions{" "}
                    </Form.Label>
                </Form.Field>

                <Form.Field
                    name="useXYHeaders"
                    className="flex w-full items-center gap-12"
                >
                    <Form.Control asChild>
                        <Checkbox
                            checked={useXY}
                            onCheckedChange={(checked: boolean) =>
                                setUseXY(checked)
                            }
                        />
                    </Form.Control>
                    <Form.Label className="text-body">
                        {" "}
                        Use X/Y headers{" "}
                    </Form.Label>
                </Form.Field>

                <Form.Field
                    name="quarterPageLayout"
                    className="flex w-full items-center gap-12"
                >
                    <Form.Control asChild>
                        <Checkbox
                            checked={quarterPages}
                            onCheckedChange={(checked: boolean) => {
                                checked && setIsTerse(checked);
                                setQuarterPages(checked);
                            }}
                        />
                    </Form.Control>
                    <Form.Label className="text-body">
                        {" "}
                        Quarter-page layout{" "}
                    </Form.Label>
                </Form.Field>

                <Form.Field
                    name="organizeBySection"
                    className="flex w-full items-center gap-12"
                >
                    <Form.Control asChild>
                        <Checkbox
                            checked={organizeBySection}
                            onCheckedChange={(checked: boolean) =>
                                setOrganizeBySection(checked)
                            }
                        />
                    </Form.Control>
                    <Form.Label className="text-body">
                        {" "}
                        Organize by Section{" "}
                    </Form.Label>

                    <Tooltip.TooltipProvider>
                        <Tooltip.Root>
                            <Tooltip.Trigger type="button">
                                <InfoIcon size={18} className="text-text/60" />
                            </Tooltip.Trigger>
                            <TooltipContents className="p-16">
                                <div>
                                    Create PDF files for each individual marcher
                                    organized in folders by section.
                                </div>
                                <div>
                                    If this is not checked, one large PDF file
                                    will be created with every coordinate sheet
                                    in score order.
                                </div>
                            </TooltipContents>
                        </Tooltip.Root>
                    </Tooltip.TooltipProvider>
                </Form.Field>

                <Form.Field
                    name="roundingDenominator"
                    className="flex w-full items-center justify-between gap-12"
                >
                    <Form.Label className="text-body">
                        {" "}
                        Rounding denominator:{" "}
                    </Form.Label>
                    <Form.Control asChild className="w-[6rem]">
                        <Input
                            type="number"
                            className="w-fit"
                            defaultValue={roundingDenominator}
                            step={1}
                            min={1}
                            onChange={(
                                e: React.ChangeEvent<HTMLInputElement>,
                            ) =>
                                setRoundingDenominator(
                                    parseInt(e.target.value) || 4,
                                )
                            }
                        />
                    </Form.Control>
                </Form.Field>

                <Form.Field
                    name="organizeBySection"
                    className="flex w-full items-center gap-12"
                >
                    <Form.Control asChild>
                        <Checkbox
                            checked={organizeBySection}
                            onCheckedChange={(checked: boolean) =>
                                setOrganizeBySection(checked)
                            }
                        />
                    </Form.Control>
                    <Form.Label className="text-body">
                        {" "}
                        Organize by Section{" "}
                    </Form.Label>

                    <Tooltip.TooltipProvider>
                        <Tooltip.Root>
                            <Tooltip.Trigger type="button">
                                <InfoIcon size={18} className="text-text/60" />
                            </Tooltip.Trigger>
                            <TooltipContents className="p-16">
                                <div>
                                    Create PDF files for each individual marcher
                                    organized in folders by section.
                                </div>
                                <div>
                                    If this is not checked, one large PDF file
                                    will be created with every coordinate sheet
                                    in score order.
                                </div>
                            </TooltipContents>
                        </Tooltip.Root>
                    </Tooltip.TooltipProvider>
                </Form.Field>
            </Form.Root>

            {/* Preview Section */}
            <div className="flex flex-col gap-8">
                <div className="flex w-full items-center justify-between">
                    <h5 className="text-h5">Preview</h5>
                    <p className="text-sub text-text/75">
                        {"4 -> 1/4 = nearest quarter step"} {" | "}{" "}
                        {"10 -> 1/10 = nearest tenth step"}
                    </p>
                </div>
                <div>
                    <div className="mx-2 bg-white text-black">
                        <MarcherCoordinateSheet
                            example={true}
                            terse={isTerse}
                            includeMeasures={includeMeasures}
                            useXY={useXY}
                            roundingDenominator={roundingDenominator || 4}
                        />
                    </div>
                </div>
            </div>

            {/* Export Button */}
            <div className="flex w-full justify-end gap-8">
                <Button
                    size="compact"
                    onClick={handleExport}
                    disabled={isLoading || marchers.length === 0}
                >
                    {isLoading ? "Exporting... Please wait" : "Export"}
                </Button>
                <DialogClose>
                    <Button size="compact" variant="secondary">
                        {" "}
                        Cancel{" "}
                    </Button>
                </DialogClose>
            </div>

            {/* Progress Bar */}
            {isLoading && (
                <div className="flex flex-col gap-8">
                    {/* Status Text */}
                    <div className="flex items-center justify-between">
                        <span className="text-body text-text/75">
                            {currentStep}
                        </span>
                        <span className="text-sub text-text/60">
                            {Math.round(progress)}%
                        </span>
                    </div>

                    {/* Progress Bar Container */}
                    <div className="relative h-8 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                        {/* Background Progress Bar */}
                        <div
                            className="bg-accent absolute top-0 left-0 h-full rounded-full transition-all duration-500 ease-out"
                            style={{
                                width: `${progress}%`,
                                transform: `translateX(${progress < 100 ? "0" : "0"})`,
                            }}
                        />

                        {/* Animated Shimmer Effect */}
                        <div
                            className="absolute top-0 left-0 h-full w-full rounded-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
                            style={{
                                animation:
                                    progress > 0 && progress < 100
                                        ? "shimmer 2s infinite"
                                        : "none",
                                transform: "translateX(-100%)",
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

function DrillChartExport() {
    const { pages } = useTimingObjectsStore()!;
    const { fieldProperties } = useFieldProperties()!;
    const { marcherPages } = useMarcherPageStore()!;
    const { marchers } = useMarcherStore()!;

    // Loading bar
    const [isLoading, setIsLoading] = useState(false);
    const isCancelled = useRef(false);
    const [progress, setProgress] = useState(0);
    const [currentStep, setCurrentStep] = useState("");

    // Export options
    const [individualCharts, setIndividualCharts] = useState(false);
    const marginSVG = 40;

    /**
     * Generates SVGs for each marcher on each page, including pathways and coordinates.
     * @param exportCanvas - The canvas to render the SVGs on.
     * @return A promise that resolves to an object containing SVG strings and readable coordinates.
     */
    const generateExportSVGs = useCallback(
        async (
            exportCanvas: OpenMarchCanvas,
        ): Promise<{
            SVGs: string[][];
            coords: string[][];
        }> => {
            // Setup export canvas for SVG generation
            exportCanvas.setWidth(fieldProperties!.width + marginSVG * 2);
            exportCanvas.setHeight(fieldProperties!.height + marginSVG * 2);
            exportCanvas.viewportTransform = [1, 0, 0, 1, marginSVG, marginSVG];
            exportCanvas.requestRenderAll();

            // SVG storage setup
            const svgPages: string[][] = Array.from(
                { length: marchers.length },
                () => [],
            );

            // Get marcherPages for this, prev, and next page
            let currentMarcherPages: MarcherPage[] = MarcherPage.filterByPageId(
                marcherPages,
                pages[0].id,
            );
            let prevMarcherPages: MarcherPage[] = [];
            let nextMarcherPages: MarcherPage[] = MarcherPage.filterByPageId(
                marcherPages,
                pages[1].id,
            );

            // Readable coordinates storage for each marcher
            const readableCoords: string[][] = Array.from(
                { length: marchers.length },
                () => Array.from({ length: pages.length }, () => ""),
            );

            // Generate SVGs for each page
            for (let i = 0; i < pages.length; i++) {
                setCurrentStep(
                    `Processing page ${i + 1} of ${pages.length}: ${exportCanvas.currentPage.name}`,
                );

                exportCanvas.currentPage = pages[i];

                // Render marchers for this page
                await exportCanvas.renderMarchers({
                    currentMarcherPages: currentMarcherPages,
                    allMarchers: marchers,
                });

                // Render pathways for individual marchers
                if (individualCharts) {
                    for (let m = 0; m < marchers.length; m++) {
                        const marcher = MarcherPage.filterByMarcherId(
                            currentMarcherPages,
                            marchers[m].id,
                        )[0];
                        const prevMarcher = MarcherPage.filterByMarcherId(
                            prevMarcherPages,
                            marchers[m].id,
                        )[0];
                        const nextMarcher = MarcherPage.filterByMarcherId(
                            nextMarcherPages,
                            marchers[m].id,
                        )[0];

                        // Store readable coordinates for this marcher
                        readableCoords[m][i] =
                            ReadableCoords.fromMarcherPage(marcher).toString();

                        // Collect pathways to add/remove
                        const objectsToRemove: fabric.Object[] = [];

                        // Render previous pathway and midpoint
                        if (
                            prevMarcherPages.length > 0 &&
                            currentMarcherPages
                        ) {
                            const [prevPathways, prevMidpoints] =
                                exportCanvas.renderPathways({
                                    startPageMarcherPages: [prevMarcher],
                                    endPageMarcherPages: [marcher],
                                    color: rgbaToString(
                                        exportCanvas.fieldProperties.theme
                                            .previousPath,
                                    ),
                                    strokeWidth: 4,
                                    dashed: true,
                                });

                            objectsToRemove.push(
                                ...prevPathways,
                                ...prevMidpoints,
                            );
                        }

                        // Render next pathway and midpoint
                        if (
                            currentMarcherPages &&
                            nextMarcherPages.length > 0
                        ) {
                            const [nextPathways, nextMidpoints] =
                                exportCanvas.renderPathways({
                                    startPageMarcherPages: [marcher],
                                    endPageMarcherPages: [nextMarcher],
                                    color: rgbaToString(
                                        exportCanvas.fieldProperties.theme
                                            .nextPath,
                                    ),
                                    strokeWidth: 3,
                                    dashed: false,
                                });

                            objectsToRemove.push(
                                ...nextPathways,
                                ...nextMidpoints,
                            );
                        }

                        // Add box around prev coordinate
                        if (prevMarcherPages.length > 0) {
                            const square = new fabric.Rect({
                                left: prevMarcher.x,
                                top: prevMarcher.y,
                                width: 20,
                                height: 20,
                                fill: "transparent",
                                stroke: "blue",
                                strokeWidth: 3,
                                originX: "center",
                                originY: "center",
                                ...NoControls,
                            });
                            exportCanvas.add(square);
                            objectsToRemove.push(square);
                        }

                        // Add circle around next coordinate
                        if (nextMarcherPages.length > 0) {
                            const circle = new fabric.Circle({
                                left: nextMarcher.x,
                                top: nextMarcher.y,
                                radius: 10,
                                fill: "transparent",
                                stroke: "hsl(281, 82%, 63%)",
                                strokeWidth: 3,
                                originX: "center",
                                originY: "center",
                                ...NoControls,
                            });
                            exportCanvas.add(circle);
                            objectsToRemove.push(circle);
                        }

                        // Send marcher to the front
                        exportCanvas.sendCanvasMarcherToFront(
                            CanvasMarcher.getCanvasMarcherForMarcher(
                                exportCanvas,
                                marchers[m],
                            )!,
                        );

                        // Convert to SVG after adding pathways
                        exportCanvas.renderAll();
                        svgPages[m].push(exportCanvas.toSVG());

                        // Remove the pathways to keep the canvas clean for the next marcher
                        objectsToRemove.forEach((object: fabric.Object) =>
                            exportCanvas.remove(object),
                        );
                    }

                    // Update current, prev, and next marcher pages
                    prevMarcherPages = currentMarcherPages;
                    currentMarcherPages = nextMarcherPages;
                    nextMarcherPages = MarcherPage.filterByPageId(
                        marcherPages,
                        pages[i + 2]?.id ?? -1,
                    );
                } else {
                    // No pathway rendering, just generate SVG
                    exportCanvas.renderAll();
                    svgPages[0].push(exportCanvas.toSVG());
                    currentMarcherPages = MarcherPage.filterByPageId(
                        marcherPages,
                        pages[i + 1]?.id,
                    );
                }

                // Update progress smoothly
                setProgress(50 * ((i + 1) / pages.length));
                if (isCancelled.current) {
                    throw new Error("Export cancelled by user");
                }
            }

            // Success
            return { SVGs: svgPages, coords: readableCoords };
        },
        [fieldProperties, marchers, marcherPages, pages, individualCharts],
    );

    /**
     * Exports the generated SVGs as PDF files for each marcher or a single overview PDF.
     * @param svgPages - 2D array of SVG strings for each marcher.
     * @param readableCoords - 2D array of readable coordinates for each marcher.
     */
    const exportMarcherSVGs = useCallback(
        async (svgPages: string[][], readableCoords: string[][]) => {
            // Create export directory
            const { exportName, exportDir } =
                await window.electron.export.createExportDirectory(
                    await window.electron.getCurrentFilename(),
                );

            // Generate PDFs for each marcher or MAIN if individual charts are not selected
            for (let marcher = 0; marcher < svgPages.length; marcher++) {
                const result =
                    await window.electron.export.generateDocForMarcher(
                        svgPages[marcher],
                        individualCharts
                            ? marchers[marcher].drill_number
                            : "MAIN",
                        readableCoords[marcher],
                        pages,
                        exportName,
                        exportDir,
                        individualCharts,
                    );

                if (!individualCharts) break; // just one PDF for MAIN

                setProgress(50 + (50 * marcher) / svgPages.length);
                setCurrentStep(
                    `Generating PDF file for: ${marchers[marcher]?.drill_number ?? "MAIN"}`,
                );

                // Individual PDF failed, log error and continue
                if (!result.success) {
                    console.error(
                        "SVG export failed with error:",
                        result.error,
                    );
                    toast.error(
                        `SVG export for ${marchers[marcher]?.drill_number ?? "MAIN"} failed with error: ${result.error}`,
                    );
                }
                if (isCancelled.current) {
                    throw new Error("Export cancelled by user");
                }
            }
        },
        [individualCharts, marchers, pages],
    );

    // Check if we have the minimum requirements for export
    const canExport = !!(
        fieldProperties &&
        pages.length > 1 &&
        marchers.length > 0
    );

    /**
     * Handles the export process, generating SVGs and exporting them as PDFs.
     */
    const handleExport = useCallback(async () => {
        isCancelled.current = false;
        setIsLoading(true);
        setProgress(0);
        setCurrentStep("Initializing export...");

        // Store original state of canvas for restoration
        const exportCanvas: OpenMarchCanvas = window.canvas;
        const originalWidth = exportCanvas.getWidth();
        const originalHeight = exportCanvas.getHeight();
        const originalViewportTransform =
            exportCanvas.viewportTransform!.slice();

        // Generate SVGs from the canvas
        let SVGs: string[][] = [];
        let coords: string[][] = [];
        try {
            ({ SVGs, coords } = await generateExportSVGs(exportCanvas));
        } catch (error) {
            toast.error(
                "SVG Generation failed: " +
                    (error instanceof Error ? error.message : "Unknown error"),
            );
            setCurrentStep("Export failed");
            isCancelled.current = true;
        }

        // Restore canvas to original state
        exportCanvas.setWidth(originalWidth);
        exportCanvas.setHeight(originalHeight);
        exportCanvas.viewportTransform = originalViewportTransform;
        exportCanvas.requestRenderAll();

        // Error occurred during SVG generation
        if (isCancelled.current) return;

        // SVG creation done, start exporting
        setCurrentStep("Generating PDF files...");
        try {
            await exportMarcherSVGs(SVGs, coords);

            setProgress(100);
            setCurrentStep("Export completed!");
            toast.success(`Successfully exported as PDF!`);
        } catch (error) {
            toast.error(
                "PDF Export failed: " +
                    (error instanceof Error ? error.message : "Unknown error"),
            );
            setCurrentStep("Export failed");
        }

        isCancelled.current = false;
        setIsLoading(false);
    }, [generateExportSVGs, exportMarcherSVGs]);

    return (
        <div className="flex flex-col gap-20">
            {/* Export Options */}
            <Form.Root className="flex flex-col gap-y-24">
                <Form.Field
                    name="includeTitle"
                    className="flex w-full items-center gap-12"
                >
                    <Form.Control asChild>
                        <Checkbox
                            checked={individualCharts}
                            onCheckedChange={(checked: boolean) =>
                                setIndividualCharts(checked)
                            }
                        />
                    </Form.Control>
                    <Form.Label className="text-body">
                        Individual Drill Charts
                    </Form.Label>
                    <Tooltip.TooltipProvider>
                        <Tooltip.Root>
                            <Tooltip.Trigger type="button">
                                <InfoIcon size={18} className="text-text/60" />
                            </Tooltip.Trigger>
                            <TooltipContents className="p-16">
                                <div>
                                    Create customized drill chart PDFs for each
                                    individual marcher.
                                </div>
                                <div>
                                    If this is not checked, one overview drill
                                    chart PDF will be created.
                                </div>
                            </TooltipContents>
                        </Tooltip.Root>
                    </Tooltip.TooltipProvider>
                </Form.Field>
            </Form.Root>

            {/* Preview Section */}
            <div className="flex flex-col gap-8">
                <div className="flex w-full items-center justify-between">
                    <h5 className="text-h5">Preview</h5>
                </div>

                {/* Show Demo SVGs or Error if Export Requirement Not Met */}
                {canExport ? (
                    <div className="flex flex-col items-center gap-8">
                        <div className="mx-auto w-full max-w-full bg-white text-black">
                            <img
                                src={
                                    individualCharts
                                        ? individualDemoSVG
                                        : overviewDemoSVG
                                }
                                alt="Drill Chart Preview"
                                className="h-auto w-full max-w-full"
                                style={{
                                    border: "1px solid #eee",
                                    borderRadius: "4px",
                                }}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center gap-12 bg-white py-20 text-black">
                        <h4 className="text-h4">Export Not Available</h4>
                        <p className="text-body max-w-md text-center text-gray-600">
                            Export requires field properties, at least one
                            non-default page, and at least one marcher.
                        </p>
                        <div className="text-center text-xs text-gray-500">
                            <div>
                                Field Properties: {fieldProperties ? "✓" : "✗"}
                            </div>
                            <div>Page: {pages.length > 1 ? "✓" : "✗"}</div>
                            <div>
                                Marcher: {marchers.length > 0 ? "✓" : "✗"}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Export Button */}
            <div className="flex w-full justify-end gap-8">
                <Button
                    size="compact"
                    onClick={handleExport}
                    disabled={isLoading || !canExport}
                >
                    {isLoading ? "Exporting... Please wait" : "Export"}
                </Button>
                <DialogClose>
                    <Button
                        size="compact"
                        variant="secondary"
                        onClick={() => (isCancelled.current = true)}
                    >
                        Cancel
                    </Button>
                </DialogClose>
            </div>

            {/* Progress Bar */}
            {isLoading && (
                <div className="flex flex-col gap-8">
                    {/* Status Text */}
                    <div className="flex items-center justify-between">
                        <span className="text-body text-text/75">
                            {currentStep}
                        </span>
                        <span className="text-sub text-text/60">
                            {Math.round(progress)}%
                        </span>
                    </div>

                    {/* Progress Bar Container */}
                    <div className="relative h-8 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                        {/* Background Progress Bar */}
                        <div
                            className="bg-accent absolute top-0 left-0 h-full rounded-full transition-all duration-500 ease-out"
                            style={{
                                width: `${progress}%`,
                                transform: `translateX(${progress < 100 ? "0" : "0"})`,
                            }}
                        />

                        {/* Animated Shimmer Effect */}
                        <div
                            className="absolute top-0 left-0 h-full w-full rounded-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
                            style={{
                                animation:
                                    progress > 0 && progress < 100
                                        ? "shimmer 2s infinite"
                                        : "none",
                                transform: "translateX(-100%)",
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

function ExportModalContents() {
    return (
        <Tabs defaultValue="coordinate-sheets">
            <TabsList>
                <TabItem value="coordinate-sheets">Coordinate Sheets</TabItem>
                <TabItem value="drill-charts">Drill Charts</TabItem>
            </TabsList>

            <TabContent value="coordinate-sheets">
                <CoordinateSheetExport />
            </TabContent>

            <TabContent value="drill-charts">
                <DrillChartExport />
            </TabContent>
        </Tabs>
    );
}

export default function ExportCoordinatesModal() {
    return (
        <Dialog>
            <DialogTrigger
                asChild
                className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
            >
                <button type="button" className="flex items-center gap-8">
                    <ArrowSquareOutIcon size={24} />
                    Export
                </button>
            </DialogTrigger>

            {/* Dialog Setup */}
            <DialogContent className="w-[48rem]">
                <DialogTitle>Export</DialogTitle>
                <ExportModalContents />
            </DialogContent>
        </Dialog>
    );
}

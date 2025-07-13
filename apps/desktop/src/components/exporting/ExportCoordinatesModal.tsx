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
    TooltipClassName,
} from "@openmarch/ui";
import { ArrowSquareOutIcon, InfoIcon } from "@phosphor-icons/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
    Button,
    Checkbox,
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
} from "@openmarch/ui";
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
import { coordinateRoundingOptions } from "../../config/exportOptions";
import clsx from "clsx";
import "../../styles/shimmer.css";

function chunkArray<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
    }
    return result;
}
const QUARTER_ROWS = 28; // Increased from 25 to fit more rows

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
    const isCancelled = useRef(false);

    const handleExport = useCallback(async () => {
        setIsLoading(true);
        setProgress(0);

        // Fun marching band phrases that rotate during export
        const funPhrases = [
            "Get ready to march a perfect 8 to 5! 🎺",
            "Getting the files to cover down 📋",
            "Cleaning drill from the box 🧹",
            "Making sure everyone's in step 👟",
            "Painting a perfect field",
            "Marching toward perfection! 🎯",
        ];

        let currentPhraseIndex = 0;
        let phraseInterval: NodeJS.Timeout;

        // Start rotating phrases every 2 seconds
        const startPhraseRotation = () => {
            setCurrentStep(funPhrases[currentPhraseIndex]);
            phraseInterval = setInterval(() => {
                currentPhraseIndex =
                    (currentPhraseIndex + 1) % funPhrases.length;
                setCurrentStep(funPhrases[currentPhraseIndex]);
            }, 2000);
        };

        const stopPhraseRotation = () => {
            if (phraseInterval) {
                clearInterval(phraseInterval);
            }
        };

        if (!fieldProperties) {
            toast.error("Field properties are required for export");
            setIsLoading(false);
            return;
        }

        try {
            isCancelled.current = false;
            startPhraseRotation();
            setProgress(5);

            // Simulate more granular progress updates
            await new Promise((resolve) => setTimeout(resolve, 500));
            if (isCancelled.current)
                throw new Error("Export cancelled by user");
            setProgress(15);

            const processedMarchers = marchers
                .map((marcher, index) => ({
                    ...marcher,
                    name: marcher.name || `${marcher.section} ${index + 1}`,
                }))
                .sort((a, b) => {
                    const sectionCompare = (a.section || "").localeCompare(
                        b.section || "",
                    );
                    if (sectionCompare !== 0) return sectionCompare;
                    return a.drill_number.localeCompare(b.drill_number);
                });

            await new Promise((resolve) => setTimeout(resolve, 300));
            if (isCancelled.current)
                throw new Error("Export cancelled by user");
            setProgress(25);

            // More detailed progress for sheet generation
            const totalMarchers = processedMarchers.length;
            let groupedSheets: any[];

            // Check for cancellation
            if (isCancelled.current) {
                throw new Error("Export cancelled by user");
            }

            // Generate coordinate sheets with progress tracking
            setProgress(35);
            await new Promise((resolve) => setTimeout(resolve, 200));
            if (isCancelled.current)
                throw new Error("Export cancelled by user");

            // split to quarter sheets
            if (quarterPages) {
                // Create quarter sheets for each marcher, organized by performer number
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
                            try {
                                const renderedHtml =
                                    ReactDOMServer.renderToString(
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
                                    );

                                // Clean up the HTML to prevent URL encoding issues
                                const cleanedHtml = renderedHtml
                                    .replace(
                                        /[\u0000-\u001F\u007F-\u009F]/g,
                                        "",
                                    ) // Remove control characters
                                    .replace(/\s+/g, " ") // Normalize whitespace
                                    .trim();

                                return {
                                    name: marcher.name,
                                    drillNumber: marcher.drill_number,
                                    section: marcher.section || "Unsorted",
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
                                    section: marcher.section || "Unsorted",
                                    renderedPage: `<div><h3>Error rendering ${marcher.drill_number}</h3><p>${error instanceof Error ? error.message : "Unknown error"}</p></div>`,
                                };
                            }
                        });
                    },
                );

                // Sort by drill number to organize by performer number
                marcherQuarterSheets.sort((a, b) => {
                    // First, sort by section
                    const sectionCompare = a.section.localeCompare(b.section);
                    if (sectionCompare !== 0) return sectionCompare;

                    // Then sort by drill number
                    const drillCompare = a.drillNumber.localeCompare(
                        b.drillNumber,
                    );
                    if (drillCompare !== 0) return drillCompare;

                    // Then by name if drill numbers are the same
                    return a.name.localeCompare(b.name);
                });

                groupedSheets = marcherQuarterSheets;
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

            // Continue with fun phrases during PDF generation
            setProgress(85);

            // Debug logging
            console.log("Sending to export service:", {
                sheetCount: groupedSheets.length,
                organizeBySection,
                quarterPages,
                firstSheetSample: groupedSheets[0]
                    ? {
                          name: groupedSheets[0].name,
                          drillNumber: groupedSheets[0].drillNumber,
                          section: groupedSheets[0].section,
                          renderedPageLength:
                              groupedSheets[0].renderedPage.length,
                          renderedPagePreview:
                              groupedSheets[0].renderedPage.substring(0, 200),
                      }
                    : null,
            });

            // Add some intermediate progress updates during PDF generation
            const pdfGenerationPromise = window.electron.export.pdf({
                sheets: groupedSheets,
                organizeBySection: organizeBySection,
                quarterPages: quarterPages,
            });

            // Simulate smooth progress during PDF generation
            const progressInterval = setInterval(() => {
                setProgress((prev) => {
                    if (prev < 95) {
                        return prev + 1;
                    }
                    return prev;
                });
            }, 100);

            const result = await pdfGenerationPromise;
            clearInterval(progressInterval);

            if (!result.success) {
                if (result.cancelled) {
                    // User cancelled the export dialog - don't show error
                    return;
                }
                throw new Error(result.error);
            }

            setProgress(100);
            setCurrentStep("Export completed!");

            // Add success toast message
            toast.success(
                <span>
                    Successfully exported coordinate sheets for{" "}
                    {marchers.length} marcher{marchers.length === 1 ? "" : "s"}!{" "}
                    <button
                        type="button"
                        onClick={async () => {
                            const error =
                                await window.electron.openExportDirectory(
                                    result.path,
                                );
                            if (error) {
                                toast.error(
                                    "Could not open export directory: " + error,
                                );
                            }
                        }}
                        style={{
                            color: "#3b82f6",
                            textDecoration: "underline",
                            background: "none",
                            border: "none",
                            padding: 0,
                            font: "inherit",
                            cursor: "pointer",
                            marginLeft: "0.5em",
                        }}
                    >
                        Click to open export
                    </button>
                </span>,
            );
        } catch (error) {
            console.error("Export error:", error);
            setCurrentStep("Export failed");
            toast.error(
                `Export failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
        } finally {
            stopPhraseRotation();
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
                            <Tooltip.Portal>
                                <Tooltip.Content
                                    className={clsx(TooltipClassName, "p-16")}
                                >
                                    <div>
                                        Create PDF files for each individual
                                        marcher organized in folders by section.
                                    </div>
                                    <div>
                                        If this is not checked, one large PDF
                                        file will be created with every
                                        coordinate sheet in score order.
                                    </div>
                                </Tooltip.Content>
                            </Tooltip.Portal>
                        </Tooltip.Root>
                    </Tooltip.TooltipProvider>
                </Form.Field>

                <Form.Field
                    name="roundingDenominator"
                    className="flex w-full items-center justify-between gap-12"
                >
                    <Form.Label className="text-body">
                        Coordinate rounding:
                    </Form.Label>
                    <Select
                        value={roundingDenominator.toString()}
                        onValueChange={(value: string) =>
                            setRoundingDenominator(parseInt(value))
                        }
                    >
                        <SelectTriggerButton
                            label={
                                coordinateRoundingOptions.find(
                                    (opt) => opt.value === roundingDenominator,
                                )?.label || "Select rounding"
                            }
                            className="w-[16rem] whitespace-nowrap"
                        />
                        <SelectContent>
                            {coordinateRoundingOptions.map((option) => (
                                <SelectItem
                                    key={option.value}
                                    value={option.value.toString()}
                                >
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Form.Field>
            </Form.Root>

            {/* Preview Section */}
            <div className="flex flex-col gap-8">
                <div className="flex w-full items-center justify-between">
                    <h5 className="text-h5">Preview</h5>
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
                    <Button
                        size="compact"
                        variant="secondary"
                        onClick={() => (isCancelled.current = true)}
                    >
                        {" "}
                        Cancel{" "}
                    </Button>
                </DialogClose>
            </div>

            {/* Progress Bar */}
            {isLoading && (
                <div className="flex flex-col gap-8">
                    {/* Status Text */}
                    <div className="flex flex-col gap-4">
                        {/* Page processing info (only for drill charts) */}
                        {currentStep.includes("Processing page") && (
                            <div className="flex items-center justify-between">
                                <span className="text-body text-text/75">
                                    {currentStep}
                                </span>
                                <span className="text-sub text-text/60">
                                    {Math.round(progress)}%
                                </span>
                            </div>
                        )}

                        {/* Fun phrase */}
                        <div className="flex items-center justify-between">
                            <span className="text-body text-text/75">
                                {currentStep}
                            </span>
                            {!currentStep.includes("Processing page") && (
                                <span className="text-sub text-text/60">
                                    {Math.round(progress)}%
                                </span>
                            )}
                        </div>
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
    const [funPhrase, setFunPhrase] = useState("");

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
            let currentMarcherPages: MarcherPage[] = MarcherPage.getByPageId(
                marcherPages,
                pages[0].id,
            );
            let prevMarcherPages: MarcherPage[] = [];
            let nextMarcherPages: MarcherPage[] = MarcherPage.getByPageId(
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
                        const marcher = MarcherPage.getByMarcherId(
                            currentMarcherPages,
                            marchers[m].id,
                        )[0];
                        const prevMarcher = MarcherPage.getByMarcherId(
                            prevMarcherPages,
                            marchers[m].id,
                        )[0];
                        const nextMarcher = MarcherPage.getByMarcherId(
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
                    nextMarcherPages = MarcherPage.getByPageId(
                        marcherPages,
                        pages[i + 2]?.id ?? -1,
                    );
                } else {
                    // No pathway rendering, just generate SVG
                    exportCanvas.renderAll();
                    svgPages[0].push(exportCanvas.toSVG());
                    currentMarcherPages = MarcherPage.getByPageId(
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
        async (
            svgPages: string[][],
            readableCoords: string[][],
            exportName: string,
            exportDir: string,
        ) => {
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

        // Fun marching band phrases that rotate during export
        const funPhrases = [
            "Get ready to march a perfect 8 to 5! 🎺",
            "Creating the best drill ever! ✨",
            "Getting the files to cover down 📋",
            "Cleaning drill from the box 🧹",
            "Tuning up those coordinates 🎵",
            "Making sure everyone's in step 👟",
            "Polishing those yard line markers ✨",
            "Counting off the perfect tempo 🥁",
            "Aligning the formation like a pro 📐",
            "Marching toward perfection! 🎯",
            "Setting the tempo for success 🎼",
            "Fine-tuning every step count 🔧",
        ];

        let currentPhraseIndex = 0;
        let phraseInterval: NodeJS.Timeout;

        // Start rotating phrases every 2 seconds
        const startPhraseRotation = () => {
            setCurrentStep(funPhrases[currentPhraseIndex]);
            phraseInterval = setInterval(() => {
                currentPhraseIndex =
                    (currentPhraseIndex + 1) % funPhrases.length;
                setCurrentStep(funPhrases[currentPhraseIndex]);
            }, 2000);
        };

        const stopPhraseRotation = () => {
            if (phraseInterval) {
                clearInterval(phraseInterval);
            }
        };

        startPhraseRotation();

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

        // SVG creation done, start exporting - continue with fun phrases
        try {
            // Create export directory
            const { exportName, exportDir } =
                await window.electron.export.createExportDirectory(
                    await window.electron.getCurrentFilename(),
                );

            // Create documents for each marcher with smooth progress
            const exportPromise = exportMarcherSVGs(
                SVGs,
                coords,
                exportName,
                exportDir,
            );

            // Simulate smooth progress during final export phase
            const finalProgressInterval = setInterval(() => {
                setProgress((prev) => {
                    if (prev < 95) {
                        return prev + 0.5;
                    }
                    return prev;
                });
            }, 150);

            await exportPromise;
            clearInterval(finalProgressInterval);

            setProgress(100);
            setCurrentStep("Export completed!");

            // Prompt user to open the export directory
            toast.success(
                <span>
                    Successfully exported as PDF!{" "}
                    <button
                        type="button"
                        onClick={() =>
                            window.electron.openExportDirectory(exportDir)
                        }
                        style={{
                            color: "#3b82f6",
                            textDecoration: "underline",
                            background: "none",
                            border: "none",
                            padding: 0,
                            font: "inherit",
                            cursor: "pointer",
                        }}
                    >
                        Click to open folder
                    </button>
                </span>,
            );
        } catch (error) {
            toast.error(
                "PDF Export failed: " +
                    (error instanceof Error ? error.message : "Unknown error"),
            );
            setCurrentStep("Export failed");
        } finally {
            stopPhraseRotation();
            // Keep the completed state visible for a moment before hiding
            setTimeout(() => {
                isCancelled.current = false;
                setIsLoading(false);
                setProgress(0);
                setCurrentStep("");
            }, 1500);
        }
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
                            <Tooltip.Portal>
                                <Tooltip.Content
                                    className={clsx(TooltipClassName, "p-16")}
                                >
                                    <div>
                                        Create customized drill chart PDFs for
                                        each individual marcher.
                                    </div>
                                    <div>
                                        If this is not checked, one overview
                                        drill chart PDF will be created.
                                    </div>
                                </Tooltip.Content>
                            </Tooltip.Portal>
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

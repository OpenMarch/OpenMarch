/* eslint-disable no-control-regex */
import { useCallback, useRef, useState } from "react";
import ReactDOMServer from "react-dom/server";
import { fabric } from "fabric";
import { NoControls } from "@/components/canvas/CanvasConstants";
import MarcherCoordinateSheetPreview, {
    StaticMarcherCoordinateSheet,
    StaticQuarterMarcherSheet,
} from "./MarcherCoordinateSheet";
import {
    allMarcherPagesQueryOptions,
    fieldPropertiesQueryOptions,
} from "@/hooks/queries";
import { getByMarcherId } from "@/global/classes/MarcherPage";
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
import { useMarchersWithVisuals, useTimingObjects } from "@/hooks";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { rgbaToString } from "@openmarch/core";
import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";
import { ReadableCoords } from "@/global/classes/ReadableCoords";
import individualDemoSVG from "@/assets/drill_chart_export_individual_demo.svg";
import overviewDemoSVG from "@/assets/drill_chart_export_overview_demo.svg";
import { Tabs, TabsList, TabContent, TabItem } from "@openmarch/ui";
import { coordinateRoundingOptions } from "../../config/exportOptions";
import clsx from "clsx";
import "../../styles/shimmer.css";
import { T } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import { useShapePageStore } from "@/stores/ShapePageStore";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useQuery } from "@tanstack/react-query";
import { allMarchersQueryOptions } from "@/hooks/queries/useMarchers";

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
    const { data: marchers, isSuccess: marchersLoaded } = useQuery(
        allMarchersQueryOptions(),
    );
    const { pages } = useTimingObjects();
    const { data: marcherPages, isSuccess: marcherPagesLoaded } = useQuery(
        allMarcherPagesQueryOptions({
            pinkyPromiseThatYouKnowWhatYouAreDoing: true,
        }),
    );
    const { data: fieldProperties } = useQuery(fieldPropertiesQueryOptions());
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentStep, setCurrentStep] = useState("");
    const isCancelled = useRef(false);
    const t = tolgee.t;

    const handleExport = useCallback(async () => {
        setIsLoading(true);
        setProgress(0);

        // Fun marching band phrases that rotate during export
        const funPhrases = [
            t("exportCoordinates.funPhrase.0"),
            t("exportCoordinates.funPhrase.1"),
            t("exportCoordinates.funPhrase.2"),
            t("exportCoordinates.funPhrase.3"),
            t("exportCoordinates.funPhrase.4"),
            t("exportCoordinates.funPhrase.5"),
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
            toast.error(t("exportCoordinates.fieldPropertiesRequired"));
            setIsLoading(false);
            return;
        }

        if (!marcherPagesLoaded || !marchersLoaded) {
            setIsLoading(true);
            return;
        }

        try {
            isCancelled.current = false;
            startPhraseRotation();
            setProgress(5);

            // Simulate more granular progress updates
            await new Promise((resolve) => setTimeout(resolve, 500));
            if (isCancelled.current)
                throw new Error(t("exportCoordinates.cancelledByUser"));
            setProgress(15);

            const processedMarchers = marchers
                .map((marcher) => ({
                    ...marcher,
                    // Use raw DB section with the numeric part of drill_number as fallback display name
                    name:
                        marcher.name ||
                        `${marcher.section} ${
                            marcher.drill_number.match(/\d+/)?.[0] ||
                            String(marcher.drill_order)
                        }`,
                }))
                .sort((a, b) => {
                    const sectionCompare = (a.section || "").localeCompare(
                        b.section || "",
                    );
                    if (sectionCompare !== 0) return sectionCompare;
                    return a.drill_number.localeCompare(
                        b.drill_number,
                        undefined,
                        { numeric: true },
                    );
                });

            await new Promise((resolve) => setTimeout(resolve, 300));
            if (isCancelled.current)
                throw new Error(t("exportCoordinates.cancelledByUser"));
            setProgress(25);

            // More detailed progress for sheet generation
            let groupedSheets: any[];

            // Check for cancellation
            if (isCancelled.current) {
                throw new Error(t("exportCoordinates.cancelledByUser"));
            }

            // Generate coordinate sheets with progress tracking
            setProgress(35);
            await new Promise((resolve) => setTimeout(resolve, 200));
            if (isCancelled.current)
                throw new Error(t("exportCoordinates.cancelledByUser"));

            const pageOrderById: Record<number, number> = {};
            pages.forEach((page) => {
                pageOrderById[page.id] = page.order;
            });

            // split to quarter sheets
            if (quarterPages) {
                // Create quarter sheets for each marcher, organized by performer number
                groupedSheets = processedMarchers.flatMap((marcher) => {
                    const marcherPagesForMarcher = Object.values(
                        marcherPages.marcherPagesByMarcher[marcher.id],
                    ).sort((a, b) => {
                        return (
                            pageOrderById[a.page_id] - pageOrderById[b.page_id]
                        );
                    });

                    const rowChunks = chunkArray(
                        marcherPagesForMarcher,
                        QUARTER_ROWS,
                    );

                    return rowChunks.map((rowChunk, chunkIdx) => {
                        try {
                            const renderedHtml = ReactDOMServer.renderToString(
                                <StaticQuarterMarcherSheet
                                    marcher={marcher}
                                    pages={pages}
                                    marcherPages={rowChunk}
                                    fieldProperties={fieldProperties}
                                    roundingDenominator={roundingDenominator}
                                    terse={isTerse}
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
                                section:
                                    marcher.section ||
                                    t("exportCoordinates.unsortedSection"),
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
                                section:
                                    marcher.section ||
                                    t("exportCoordinates.unsortedSection"),
                                renderedPage: `<div><h3>${t("exportCoordinates.errorRendering", { drillNumber: marcher.drill_number })}</h3><p>${error instanceof Error ? error.message : t("exportCoordinates.unknownError")}</p></div>`,
                            };
                        }
                    });
                });
            } else {
                // regular format
                groupedSheets = processedMarchers.map((marcher) => {
                    const marcherPagesForMarcher = getByMarcherId(
                        marcherPages,
                        marcher.id,
                    ).sort((a, b) => {
                        const pageA = pages.find((p) => p.id === a.page_id);
                        const pageB = pages.find((p) => p.id === b.page_id);
                        return (pageA?.order ?? 0) - (pageB?.order ?? 0);
                    });

                    return {
                        name: marcher.name,
                        drillNumber: marcher.drill_number,
                        section:
                            marcher.section ||
                            t("exportCoordinates.unsortedSection"),
                        renderedPage: ReactDOMServer.renderToString(
                            <StaticMarcherCoordinateSheet
                                marcher={marcher}
                                pages={pages}
                                marcherPages={marcherPagesForMarcher}
                                fieldProperties={fieldProperties}
                                includeMeasures={includeMeasures}
                                terse={isTerse}
                                useXY={useXY}
                                roundingDenominator={roundingDenominator}
                            />,
                        ),
                    };
                });
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
            setCurrentStep(t("exportCoordinates.exportComplete"));

            // Add success toast message
            toast.success(
                <span>
                    {t("exportCoordinates.exportSuccess", {
                        count: marchers.length,
                    })}
                    <button
                        type="button"
                        onClick={async () => {
                            const error =
                                await window.electron.openExportDirectory(
                                    result.path,
                                );
                            if (error) {
                                toast.error(
                                    t(
                                        "exportCoordinates.openExportDirectoryError",
                                        { error },
                                    ),
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
                        <T keyName="exportCoordinates.openExportDirectory" />
                    </button>
                </span>,
            );
        } catch (error) {
            console.error("Export error:", error);
            setCurrentStep(t("exportCoordinates.exportFailed"));
            toast.error(
                t("exportCoordinates.exportFailedToast", {
                    error:
                        error instanceof Error
                            ? error.message
                            : "Unknown error",
                }),
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
        t,
        fieldProperties,
        marcherPagesLoaded,
        marchersLoaded,
        marchers,
        pages,
        quarterPages,
        organizeBySection,
        marcherPages,
        roundingDenominator,
        isTerse,
        useXY,
        includeMeasures,
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
                        <T keyName="exportCoordinates.includeMeasures" />
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
                        <T keyName="exportCoordinates.abbreviateCoordinateDescriptions" />
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
                        <T keyName="exportCoordinates.useXYHeaders" />
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
                        <T keyName="exportCoordinates.quarterPageLayout" />
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
                        <T keyName="exportCoordinates.organizeBySection" />
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
                                    <T keyName="exportCoordinates.organizeBySectionTooltip" />
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
                        <T keyName="exportCoordinates.roundingDenominator" />
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
                                )?.label ||
                                t("exportCoordinates.selectRoundingDenominator")
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
                    <h5 className="text-h5">
                        <T keyName="exportCoordinates.preview" />
                    </h5>
                </div>
                <div>
                    <div className="mx-2 bg-white text-black">
                        <MarcherCoordinateSheetPreview
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
                    disabled={isLoading || !marchersLoaded}
                >
                    {isLoading ? (
                        <T keyName="exportCoordinates.exporting" />
                    ) : (
                        <T keyName="exportCoordinates.export" />
                    )}
                </Button>
                <DialogClose>
                    <Button
                        size="compact"
                        variant="secondary"
                        onClick={() => (isCancelled.current = true)}
                    >
                        <T keyName="exportCoordinates.cancel" />
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
    const { pages } = useTimingObjects()!;
    const { data: fieldProperties } = useQuery(fieldPropertiesQueryOptions());
    const { data: marcherPages, isSuccess: marcherPagesLoaded } = useQuery(
        allMarcherPagesQueryOptions({
            pinkyPromiseThatYouKnowWhatYouAreDoing: true,
        }),
    );
    const marcherVisuals = useMarchersWithVisuals();
    const { data: marchers, isSuccess: marchersLoaded } = useQuery(
        allMarchersQueryOptions(),
    );
    const { setSelectedPage } = useSelectedPage()!;
    const { shapePages } = useShapePageStore()!;

    // Loading bar
    const [isLoading, setIsLoading] = useState(false);
    const isCancelled = useRef(false);
    const [progress, setProgress] = useState(0);
    const [currentStep, setCurrentStep] = useState("");

    const t = tolgee.t;

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
            if (!marcherPagesLoaded) {
                throw new Error(t("exportCoordinates.marcherPagesNotLoaded"));
            }
            if (!marchersLoaded) {
                throw new Error(t("exportCoordinates.marchersNotLoaded"));
            }

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

            // Readable coordinates storage for each marcher
            const readableCoords: string[][] = Array.from(
                { length: marchers.length },
                () => Array.from({ length: pages.length }, () => ""),
            );

            // Generate SVGs for each page
            for (let p = 0; p < pages.length; p++) {
                setCurrentStep(
                    t("exportCoordinates.processingPage", {
                        pageNumber: p + 1,
                        totalPages: pages.length,
                        pageName: exportCanvas.currentPage.name,
                    }),
                );

                // Render marchers for this page
                await exportCanvas.renderMarchers({
                    marcherVisuals: marcherVisuals,
                    marcherPages: marcherPages.marcherPagesByPage[pages[p].id],
                    pageId: pages[p].id,
                });

                // Render previous, current, and next shapes
                exportCanvas.renderMarcherShapes({
                    shapePages: shapePages.filter(
                        (sp) =>
                            sp.page_id === pages[p].id ||
                            sp.page_id === pages[p].previousPageId ||
                            sp.page_id === pages[p].nextPageId,
                    ),
                });

                // Render pathways for individual marchers
                if (individualCharts) {
                    for (let m = 0; m < marchers.length; m++) {
                        const marcher =
                            marcherPages.marcherPagesByMarcher[marchers[m].id][
                                pages[p].id
                            ];
                        const prevMarcher =
                            p > 0 && pages[p].previousPageId
                                ? marcherPages.marcherPagesByMarcher[
                                      marchers[m].id
                                  ][pages[p].previousPageId!]
                                : null;
                        const nextMarcher =
                            p < pages.length - 1 && pages[p].nextPageId
                                ? marcherPages.marcherPagesByMarcher[
                                      marchers[m].id
                                  ][pages[p].nextPageId!]
                                : null;

                        // Store readable coordinates for this marcher
                        readableCoords[m][p] =
                            ReadableCoords.fromMarcherPage(marcher).toString();

                        // Collect pathways to add/remove
                        const objectsToRemove: fabric.Object[] = [];

                        // Render previous pathway and midpoint
                        if (p > 0) {
                            objectsToRemove.push(
                                ...exportCanvas.renderTemporaryPathVisuals({
                                    start: prevMarcher!,
                                    end: marcher,
                                    marcherId: marcher.marcher_id,
                                    color: rgbaToString(
                                        fieldProperties!.theme.previousPath,
                                    ),
                                }),
                            );
                        }

                        // Render next pathway and midpoint
                        if (p < pages.length - 1) {
                            objectsToRemove.push(
                                ...exportCanvas.renderTemporaryPathVisuals({
                                    start: marcher,
                                    end: nextMarcher!,
                                    marcherId: marcher.marcher_id,
                                    color: rgbaToString(
                                        fieldProperties!.theme.nextPath,
                                    ),
                                }),
                            );
                        }

                        // Add box around prev coordinate
                        if (p > 0) {
                            const square = new fabric.Rect({
                                left: prevMarcher!.x,
                                top: prevMarcher!.y,
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
                        if (p < pages.length - 1) {
                            const circle = new fabric.Circle({
                                left: nextMarcher!.x,
                                top: nextMarcher!.y,
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
                } else {
                    // No pathway rendering, just generate SVG
                    exportCanvas.renderAll();
                    svgPages[0].push(exportCanvas.toSVG());
                }

                // Update progress smoothly
                setProgress(50 * ((p + 1) / pages.length));

                // Update UI state
                await new Promise((r) => setTimeout(r, 0));

                if (isCancelled.current) {
                    throw new Error(t("exportCoordinates.cancelledByUser"));
                }
            }

            // Success
            return { SVGs: svgPages, coords: readableCoords };
        },
        [
            marcherPagesLoaded,
            marchersLoaded,
            fieldProperties,
            marchers,
            t,
            pages,
            marcherVisuals,
            marcherPages,
            shapePages,
            individualCharts,
        ],
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
            if (!marchersLoaded) {
                throw new Error(t("exportCoordinates.marchersNotLoaded"));
            }
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
                    t("exportCoordinates.generatingPDF", {
                        drillNumber: marchers[marcher]?.drill_number ?? "MAIN",
                    }),
                );

                // Individual PDF failed, log error and continue
                if (!result.success) {
                    console.error(
                        "SVG export failed with error:",
                        result.error,
                    );
                    toast.error(
                        t("exportCoordinates.svgExportFailed", {
                            drillNumber:
                                marchers[marcher]?.drill_number ?? "MAIN",
                            error: result.error,
                        }),
                    );
                }
                if (isCancelled.current) {
                    throw new Error(t("exportCoordinates.cancelledByUser"));
                }
            }
        },
        [individualCharts, marchers, marchersLoaded, pages, t],
    );

    // Check if we have the minimum requirements for export
    const canExport = !!(
        fieldProperties &&
        pages.length > 1 &&
        marchers &&
        marchers.length > 0
    );

    /**
     * Handles the export process, generating SVGs and exporting them as PDFs.
     */
    const handleExport = useCallback(async () => {
        isCancelled.current = false;
        setIsLoading(true);
        setProgress(0);

        // Store original state of canvas for restoration
        const exportCanvas: OpenMarchCanvas = window.canvas;
        const originalWidth = exportCanvas.getWidth();
        const originalHeight = exportCanvas.getHeight();
        const originalViewportTransform =
            exportCanvas.viewportTransform!.slice();
        exportCanvas.hideAllPathVisuals({ marcherVisuals });

        // Generate SVGs from the canvas
        let SVGs: string[][] = [];
        let coords: string[][] = [];
        try {
            ({ SVGs, coords } = await generateExportSVGs(exportCanvas));
        } catch (error) {
            toast.error(
                t("exportCoordinates.svgGenerationFailed", {
                    error:
                        error instanceof Error
                            ? error.message
                            : "Unknown error",
                }),
            );
            setCurrentStep(t("exportCoordinates.exportFailed"));
            isCancelled.current = true;
        }

        // Restore canvas to original state at last page
        exportCanvas.setWidth(originalWidth);
        exportCanvas.setHeight(originalHeight);
        exportCanvas.viewportTransform = originalViewportTransform;
        setSelectedPage(pages[pages.length - 1]);
        exportCanvas.renderMarcherShapes({
            shapePages: shapePages.filter(
                (sp) => sp.page_id === pages[pages.length - 1].id,
            ),
        });
        exportCanvas.requestRenderAll();

        // Error occurred during SVG generation
        if (isCancelled.current) return;

        // SVG creation done, start exporting
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
            setCurrentStep(t("exportCoordinates.exportComplete"));

            // Prompt user to open the export directory
            toast.success(
                <span>
                    {t("exportCoordinates.exportPDFSuccess")}{" "}
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
                        <T keyName="exportCoordinates.openExportDirectory" />
                    </button>
                </span>,
            );
        } catch (error) {
            toast.error(
                t("exportCoordinates.pdfExportFailed", {
                    error:
                        error instanceof Error
                            ? error.message
                            : "Unknown error",
                }),
            );
            setCurrentStep(t("exportCoordinates.exportFailed"));
        } finally {
            // Keep the completed state visible for a moment before hiding
            setTimeout(() => {
                isCancelled.current = false;
                setIsLoading(false);
                setProgress(0);
                setCurrentStep("");
            }, 1000);
        }
    }, [
        marcherVisuals,
        setSelectedPage,
        pages,
        shapePages,
        generateExportSVGs,
        t,
        exportMarcherSVGs,
    ]);

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
                        <T keyName="exportCoordinates.individualCharts" />
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
                                        <T keyName="exportCoordinates.individualChartsTooltip" />
                                    </div>
                                    <div>
                                        <T keyName="exportCoordinates.individualChartsTooltipDescription" />
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
                    <h5 className="text-h5">
                        <T keyName="exportCoordinates.preview" />
                    </h5>
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
                        <h4 className="text-h4">
                            <T keyName="exportCoordinates.exportNotAvailable" />
                        </h4>
                        <p className="text-body max-w-md text-center text-gray-600">
                            <T keyName="exportCoordinates.exportNotAvailableDescription" />
                        </p>
                        <div className="text-center text-xs text-gray-500">
                            <div>
                                {t("exportCoordinates.fieldProperties", {
                                    status: fieldProperties ? "✓" : "✗",
                                })}
                            </div>
                            <div>
                                {t("exportCoordinates.page", {
                                    status: pages.length > 1 ? "✓" : "✗",
                                })}
                            </div>
                            <div>
                                {t("exportCoordinates.marcher", {
                                    status:
                                        marchers && marchers.length > 0
                                            ? "✓"
                                            : "✗",
                                })}
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
                    {isLoading
                        ? t("exportCoordinates.exporting")
                        : t("exportCoordinates.export")}
                </Button>
                <DialogClose>
                    <Button
                        size="compact"
                        variant="secondary"
                        onClick={() => (isCancelled.current = true)}
                    >
                        <T keyName="exportCoordinates.cancel" />
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
                <TabItem value="coordinate-sheets">
                    <T keyName="exportCoordinates.coordinateSheets" />
                </TabItem>
                <TabItem value="drill-charts">
                    <T keyName="exportCoordinates.drillCharts" />
                </TabItem>
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
        <>
            <style>{`.export-coordinates-dialog + [data-radix-popper-content-wrapper],
                .export-coordinates-dialog ~ [data-radix-popper-content-wrapper]{z-index:10000 !important;}`}</style>
            <Dialog>
                <DialogTrigger
                    asChild
                    className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                >
                    <button type="button" className="flex items-center gap-8">
                        <ArrowSquareOutIcon size={24} />
                        <T keyName="exportCoordinates.exportButton" />
                    </button>
                </DialogTrigger>

                {/* Dialog Setup */}
                <DialogContent className="export-coordinates-dialog w-[48rem]">
                    <DialogTitle>
                        <T keyName="exportCoordinates.title" />
                    </DialogTitle>
                    <ExportModalContents />
                </DialogContent>
            </Dialog>
        </>
    );
}

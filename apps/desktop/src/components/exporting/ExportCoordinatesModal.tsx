/* eslint-disable no-control-regex */
import { useCallback, useRef, useState } from "react";
import ReactDOMServer from "react-dom/server";
import MarcherCoordinateSheetPreview, {
    StaticMarcherCoordinateSheet,
    StaticQuarterMarcherSheet,
} from "./MarcherCoordinateSheet";
import {
    allMarcherPagesQueryOptions,
    allSectionAppearancesQueryOptions,
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
import { useTimingObjects } from "@/hooks";
import individualDemoSVG from "@/assets/drill_chart_export_individual_demo.svg";
import overviewDemoSVG from "@/assets/drill_chart_export_overview_demo.svg";
import { Tabs, TabsList, TabContent, TabItem } from "@openmarch/ui";
import { coordinateRoundingOptions } from "../../config/exportOptions";
import clsx from "clsx";
import "../../styles/shimmer.css";
import { T } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import { useQuery } from "@tanstack/react-query";
import { allMarchersQueryOptions } from "@/hooks/queries/useMarchers";
import { assert } from "@/utilities/utils";
import {
    generateDrillChartExportSVGs,
    getFieldPropertiesImageElement,
} from "./utils/svg-generator";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { notesHtmlToPlainText, truncateHtmlNotes } from "@/utilities/notesText";
import Constants from "@/global/Constants";
import { analytics } from "@/utilities/analytics";

function chunkArray<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
    }
    return result;
}
const QUARTER_ROWS = 28; // Increased from 25 to fit more rows

// eslint-disable-next-line max-lines-per-function
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

    // eslint-disable-next-line max-lines-per-function
    const handleExport = useCallback(async () => {
        setIsLoading(true);
        setProgress(0);
        analytics.trackExportStart("coordinate_sheets");

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
                    const marcherPagesForMarcher = Object.entries(
                        marcherPages.marcherPagesByMarcher[marcher.id],
                    )
                        .sort(
                            ([pageIdA], [pageIdB]) =>
                                (pageOrderById[Number(pageIdA)] ?? 0) -
                                (pageOrderById[Number(pageIdB)] ?? 0),
                        )
                        .map(([, mp]) => mp);

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
            console.debug("Sending to export service:", {
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
                    analytics.trackExportFailed(
                        "coordinate_sheets",
                        "cancelled",
                    );
                    return;
                }
                throw new Error(result.error);
            }

            setProgress(100);
            setCurrentStep(t("exportCoordinates.exportComplete"));
            analytics.trackExportComplete(
                "coordinate_sheets",
                groupedSheets.length,
            );

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
            analytics.trackExportFailed(
                "coordinate_sheets",
                error instanceof Error ? error.message : "Unknown error",
            );
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
        <div className="flex flex-col gap-16">
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
                <div className="mx-2 max-h-[28vh] overflow-auto rounded-md border border-gray-200 bg-white text-black">
                    <MarcherCoordinateSheetPreview
                        example={true}
                        terse={isTerse}
                        includeMeasures={includeMeasures}
                        useXY={useXY}
                        roundingDenominator={roundingDenominator || 4}
                    />
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

// eslint-disable-next-line max-lines-per-function
function DrillChartExport() {
    const { pages } = useTimingObjects()!;
    const { data: fieldProperties } = useQuery(fieldPropertiesQueryOptions());
    const { data: marcherPages, isSuccess: marcherPagesLoaded } = useQuery(
        allMarcherPagesQueryOptions({
            pinkyPromiseThatYouKnowWhatYouAreDoing: true,
        }),
    );
    const { data: marchers, isSuccess: marchersLoaded } = useQuery(
        allMarchersQueryOptions(),
    );
    const { data: sectionAppearances } = useQuery(
        allSectionAppearancesQueryOptions(),
    );
    const { uiSettings } = useUiSettingsStore();

    // Loading bar
    const [isLoading, setIsLoading] = useState(false);
    const isCancelled = useRef(false);
    const [progress, setProgress] = useState(0);
    const [currentStep, setCurrentStep] = useState("");

    const t = tolgee.t;

    // Export options
    const [individualCharts, setIndividualCharts] = useState(false);
    const [includeNotesAppendix, setIncludeNotesAppendix] = useState(true);

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
            const exportPages = pages.map((page) => {
                if (!page.notes) return page;

                // Truncate HTML while preserving formatting tags
                const truncatedHtml = truncateHtmlNotes(
                    page.notes,
                    Constants.PageNotesExportMaxLines,
                    Constants.PageNotesExportCharLimit,
                );

                return {
                    ...page,
                    notes: truncatedHtml,
                };
            });

            const notesAppendixPages = includeNotesAppendix
                ? pages
                      .filter(
                          (page) =>
                              notesHtmlToPlainText(page.notes ?? "").trim()
                                  .length > 0,
                      )
                      .map((page) => ({
                          pageName: page.name,
                          // Preserve rich-text HTML so the main process can
                          // convert it to markdown-like text for the appendix.
                          notes: page.notes ?? "",
                      }))
                : [];

            // Generate PDFs for each marcher or MAIN if individual charts are not selected
            for (let marcher = 0; marcher < svgPages.length; marcher++) {
                const result =
                    await window.electron.export.generateDocForMarcher({
                        svgPages: svgPages[marcher],
                        drillNumber: individualCharts
                            ? marchers[marcher].drill_number
                            : "MAIN",
                        marcherCoordinates: readableCoords[marcher],
                        pages: exportPages,
                        notesAppendixPages:
                            includeNotesAppendix && notesAppendixPages.length
                                ? notesAppendixPages
                                : undefined,
                        showName: exportName,
                        exportDir,
                        individualCharts,
                    });

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
        [
            includeNotesAppendix,
            individualCharts,
            marchers,
            marchersLoaded,
            pages,
            t,
        ],
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
    // eslint-disable-next-line max-lines-per-function
    const handleExport = useCallback(async () => {
        isCancelled.current = false;
        setIsLoading(true);
        setProgress(0);
        analytics.trackExportStart("drill_charts", {
            individual_charts: individualCharts,
        });

        assert(
            marcherPagesLoaded,
            t("exportCoordinates.marcherPagesNotLoaded"),
        );
        assert(marchersLoaded, t("exportCoordinates.marchersNotLoaded"));
        assert(
            fieldProperties,
            t("exportCoordinates.fieldPropertiesNotLoaded"),
        );
        assert(
            sectionAppearances,
            t("exportCoordinates.sectionAppearancesNotLoaded"),
        );

        const backgroundImage = await getFieldPropertiesImageElement();
        // Generate SVGs from the canvas
        let SVGs: string[][] = [];
        let coords: string[][] | null = null;
        try {
            ({ SVGs, coords } = await generateDrillChartExportSVGs({
                fieldProperties,
                marchers,
                sortedPages: pages,
                marcherPagesMap: marcherPages,
                sectionAppearances: sectionAppearances,
                backgroundImage,
                gridLines: uiSettings.gridLines,
                halfLines: uiSettings.halfLines,
                individualCharts: individualCharts,
            }));
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
            setIsLoading(false);
        }
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
                coords ?? [],
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
            analytics.trackExportComplete("drill_charts", SVGs.length);

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
            analytics.trackExportFailed(
                "drill_charts",
                error instanceof Error ? error.message : "Unknown error",
            );
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
        marcherPagesLoaded,
        t,
        marchersLoaded,
        fieldProperties,
        sectionAppearances,
        pages,
        marchers,
        marcherPages,
        uiSettings.gridLines,
        uiSettings.halfLines,
        individualCharts,
        exportMarcherSVGs,
    ]);

    return (
        <div className="flex flex-col gap-16">
            {/* Export Options */}
            <Form.Root className="flex flex-col gap-y-24">
                <div className="grid grid-cols-2 gap-24">
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
                                    <InfoIcon
                                        size={18}
                                        className="text-text/60"
                                    />
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                    <Tooltip.Content
                                        className={clsx(
                                            TooltipClassName,
                                            "z-[100000] p-16",
                                        )}
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

                    <Form.Field
                        name="includeNotesAppendix"
                        className="flex w-full items-center gap-12"
                    >
                        <Form.Control asChild>
                            <Checkbox
                                checked={includeNotesAppendix}
                                onCheckedChange={(checked: boolean) =>
                                    setIncludeNotesAppendix(checked)
                                }
                            />
                        </Form.Control>
                        <Form.Label className="text-body">
                            <T keyName="exportCoordinates.includeNotesAppendix" />
                        </Form.Label>
                        <Tooltip.TooltipProvider>
                            <Tooltip.Root>
                                <Tooltip.Trigger type="button">
                                    <InfoIcon
                                        size={18}
                                        className="text-text/60"
                                    />
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                    <Tooltip.Content
                                        className={clsx(
                                            TooltipClassName,
                                            "z-[100000] p-16",
                                        )}
                                    >
                                        <div>
                                            <T keyName="exportCoordinates.includeNotesAppendixTooltip" />
                                        </div>
                                        <div>
                                            <T keyName="exportCoordinates.includeNotesAppendixTooltipDescription" />
                                        </div>
                                    </Tooltip.Content>
                                </Tooltip.Portal>
                            </Tooltip.Root>
                        </Tooltip.TooltipProvider>
                    </Form.Field>
                </div>
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
                        <div className="max-h-[20rem] w-full max-w-[20rem] rounded-md border border-gray-200 bg-white px-8 py-4 text-black">
                            <img
                                src={
                                    individualCharts
                                        ? individualDemoSVG
                                        : overviewDemoSVG
                                }
                                alt="Drill Chart Preview"
                                className="block w-full"
                                style={{
                                    maxHeight: "20rem",
                                    objectFit: "contain",
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
        <Tabs defaultValue="coordinate-sheets" className="gap-12">
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
                <DialogContent className="export-coordinates-dialog max-h-[80vh] w-[48rem] overflow-y-auto">
                    <DialogTitle>
                        <T keyName="exportCoordinates.title" />
                    </DialogTitle>
                    <ExportModalContents />
                </DialogContent>
            </Dialog>
        </>
    );
}

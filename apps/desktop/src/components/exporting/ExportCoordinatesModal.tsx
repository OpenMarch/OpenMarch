import { useCallback, useEffect, useState, useRef } from "react";
import MarcherCoordinateSheet, {
    StaticMarcherCoordinateSheet,
    StaticCompactMarcherSheet,
} from "./MarcherCoordinateSheet";
import ReactDOMServer from "react-dom/server";
import { useFieldProperties } from "@/context/fieldPropertiesContext";
import { useMarcherStore } from "@/stores/MarcherStore";
import { useMarcherPageStore } from "@/stores/MarcherPageStore";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogTitle,
    DialogTrigger,
} from "@openmarch/ui";
import { ArrowSquareOut, Info, CircleNotch } from "@phosphor-icons/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { TooltipContents, Button, Input, Checkbox } from "@openmarch/ui";
import * as Form from "@radix-ui/react-form";
import { toast } from "sonner";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import { useSelectedPage } from "@/context/SelectedPageContext";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import * as Tabs from "@radix-ui/react-tabs";

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
                                <Info size={18} className="text-text/60" />
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

    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentStep, setCurrentStep] = useState("");

    const padding = 30;
    const zoom = 0.7;

    // Create SVGs from pages and export
    const generateExportSVGs = useCallback(async () => {
        setIsLoading(true);
        setProgress(0);
        setCurrentStep("Initializing export...");

        const svgPages: string[] = [];
        let fileName = "drill-charts.pdf";

        // Calculate progress steps: each page takes 90% of progress, final PDF generation takes 10%
        const totalSteps = pages.length;
        const progressPerPage = 90 / totalSteps;

        const exportCanvas = window.canvas;
        exportCanvas.setWidth(1320);
        exportCanvas.setHeight(730);
        exportCanvas.setZoom(1);
        exportCanvas.viewportTransform = [zoom, 0, 0, zoom, padding, padding];
        exportCanvas.requestRenderAll();

        for (let i = 0; i < pages.length; i++) {
            // Update page
            exportCanvas.currentPage = pages[i];
            setCurrentStep(
                `Processing page ${i + 1} of ${pages.length}: ${exportCanvas.currentPage.name}`,
            );

            // Get marcherPages for page
            const currentPageMarcherPages = marcherPages.filter(
                (mp) => mp.page_id === exportCanvas.currentPage.id,
            );

            // Render marchers for this page
            await exportCanvas.renderMarchers({
                currentMarcherPages: currentPageMarcherPages,
                allMarchers: marchers,
            });

            // Generate SVG
            svgPages.push(exportCanvas.toSVG());

            // Update progress smoothly
            setProgress((i + 1) * progressPerPage);
        }

        // Final step: Generate PDF
        setCurrentStep("Generating PDF file...");
        setProgress(95);

        // Export SVG pages to PDF
        const result = await window.electron.export.svgPagesToPdf(svgPages, {
            fileName,
        });
        if (!result.success) {
            console.error("PDF export failed with error:", result.error);
            throw new Error(result.error);
        }

        // Success
        setProgress(100);
        setCurrentStep("Export completed!");
        const successMessage = `Successfully exported ${pages.length} page${pages.length === 1 ? "" : "s"} as PDF!`;
        toast.success(successMessage);
        setIsLoading(false);
    }, [pages, marcherPages, marchers]);

    // Check if we have the minimum requirements for export
    const canExport = !!(
        fieldProperties &&
        pages.length > 0 &&
        marchers.length > 0
    );

    return (
        <div className="flex flex-col gap-20">
            {/* Export Status */}
            {!canExport && (
                <div className="flex flex-col items-center justify-center gap-12 rounded-lg bg-gray-50 py-20">
                    <h4 className="text-h4 text-gray-600">
                        Export Not Available
                    </h4>
                    <p className="text-body max-w-md text-center text-gray-500">
                        Export requires field properties, pages, and marchers to
                        be loaded.
                    </p>
                    <div className="text-center text-xs text-gray-400">
                        <div>
                            Field Properties: {fieldProperties ? "✓" : "✗"}
                        </div>
                        <div>Pages: {pages.length}</div>
                        <div>Marchers: {marchers.length}</div>
                    </div>
                </div>
            )}

            {/* Export Button */}
            <div className="flex w-full justify-end gap-8">
                <Button
                    size="compact"
                    onClick={generateExportSVGs}
                    disabled={isLoading || !canExport}
                >
                    {isLoading ? "Exporting... Please wait" : "Export"}
                </Button>
                <DialogClose>
                    <Button size="compact" variant="secondary">
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
        <Tabs.Root
            defaultValue="coordinate-sheets"
            className="flex flex-col gap-20"
        >
            <Tabs.List className="border-stroke flex gap-8 border-b">
                <Tabs.Trigger
                    value="coordinate-sheets"
                    className="text-body text-text/60 data-[state=active]:border-accent data-[state=active]:text-accent px-16 py-8 data-[state=active]:border-b-2"
                >
                    Coordinate Sheets
                </Tabs.Trigger>
                <Tabs.Trigger
                    value="drill-charts"
                    className="text-body text-text/60 data-[state=active]:border-accent data-[state=active]:text-accent px-16 py-8 data-[state=active]:border-b-2"
                >
                    Drill Charts
                </Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="coordinate-sheets">
                <CoordinateSheetExport />
            </Tabs.Content>

            <Tabs.Content value="drill-charts">
                <DrillChartExport />
            </Tabs.Content>
        </Tabs.Root>
    );
}

export default function ExportCoordinatesModal() {
    return (
        <Dialog>
            <DialogTrigger
                asChild
                className="hover:text-accent cursor-pointer duration-150 ease-out outline-none focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50"
            >
                <ArrowSquareOut size={18} />
            </DialogTrigger>

            {/* Dialog Setup */}
            <DialogContent className="w-[48rem]">
                <DialogTitle>Export</DialogTitle>
                <ExportModalContents />
            </DialogContent>
        </Dialog>
    );
}

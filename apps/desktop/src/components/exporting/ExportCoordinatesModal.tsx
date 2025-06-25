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
    const { selectedPage } = useSelectedPage()!;
    const { fieldProperties } = useFieldProperties()!;
    const { marcherPages } = useMarcherPageStore()!;
    const { marchers } = useMarcherStore()!;
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentStep, setCurrentStep] = useState("");

    // Export options state
    const [includeTitle, setIncludeTitle] = useState(true);
    const paddingAmount = 64; // Fixed padding amount

    // Preview state
    const [previewSvg, setPreviewSvg] = useState<string>("");
    const [previewGenerated, setPreviewGenerated] = useState(false);
    const previewContainerRef = useRef<HTMLDivElement>(null);

    // Create a completely independent canvas for export
    const createExportCanvas = useCallback(
        async (withPadding: boolean = false) => {
            if (!fieldProperties) {
                throw new Error("Field properties not loaded");
            }

            try {
                // Create a temporary canvas element
                const tempCanvasElement = document.createElement("canvas");
                const padding = withPadding ? paddingAmount : 0;
                const brandingHeight = 60; // Reduced space for simpler header
                const canvasWidth = fieldProperties.width + padding * 2;
                const canvasHeight =
                    fieldProperties.height +
                    padding * 2 +
                    (withPadding ? brandingHeight : 0);

                tempCanvasElement.width = canvasWidth;
                tempCanvasElement.height = canvasHeight;

                // Create a new OpenMarchCanvas instance specifically for export
                const exportCanvas = new OpenMarchCanvas({
                    canvasRef: tempCanvasElement,
                    fieldProperties: fieldProperties,
                    uiSettings: {
                        isPlaying: false,
                        lockX: false,
                        lockY: false,
                        previousPaths: false,
                        nextPaths: false,
                        gridLines: true,
                        halfLines: true,
                        showWaveform: false,
                        timelinePixelsPerSecond: 40,
                        focussedComponent: "canvas",
                        mouseSettings: {
                            trackpadMode: true,
                            trackpadPanSensitivity: 0.5,
                            zoomSensitivity: 0.03,
                            panSensitivity: 0.5,
                        },
                    },
                    currentPage: selectedPage || pages[0],
                });

                // Set the canvas size to match our desired dimensions
                exportCanvas.setWidth(canvasWidth);
                exportCanvas.setHeight(canvasHeight);

                // Render the field grid and background normally
                exportCanvas.renderFieldGrid();

                // Refresh background image if it exists
                await exportCanvas.refreshBackgroundImage(false);

                // Wait for canvas to initialize
                await new Promise((resolve) => setTimeout(resolve, 100));

                return { exportCanvas, padding };
            } catch (error) {
                console.error("Error creating export canvas:", error);
                throw new Error(
                    `Failed to create export canvas: ${error instanceof Error ? error.message : "Unknown error"}`,
                );
            }
        },
        [fieldProperties, selectedPage, pages, paddingAmount],
    );

    // Generate preview of the first page
    const generatePreview = useCallback(async () => {
        if (!fieldProperties || pages.length === 0) {
            console.log(
                "Cannot generate preview: missing field properties or pages",
            );
            return;
        }

        try {
            const firstPage = pages[0];
            const { exportCanvas, padding } = await createExportCanvas(true);

            // Set the current page
            exportCanvas.currentPage = firstPage;

            // Get marcher pages for this page
            const currentPageMarcherPages = marcherPages.filter(
                (mp) => mp.page_id === firstPage.id,
            );

            // Render marchers for this page using the same method as the main canvas
            await exportCanvas.renderMarchers({
                currentMarcherPages: currentPageMarcherPages,
                allMarchers: marchers,
            });

            // Wait for render to complete
            await new Promise((resolve) => setTimeout(resolve, 200));

            // If we have padding, translate the entire canvas content to center it
            if (padding > 0) {
                // Get all objects on the canvas
                const allObjects = exportCanvas.getObjects();

                // Move everything by the padding amount to center it, plus extra space for branding header
                const brandingOffset = 60; // Reduced space for simpler header
                allObjects.forEach((obj) => {
                    if (obj.left !== undefined) {
                        obj.set({ left: obj.left + padding });
                    }
                    if (obj.top !== undefined) {
                        obj.set({
                            top: obj.top + padding + brandingOffset,
                        });
                    }
                    obj.setCoords();
                });

                exportCanvas.requestRenderAll();
            }

            // Generate SVG
            let svg = exportCanvas.toSVG();

            // Add title to preview if enabled
            let titleElement = "";
            if (includeTitle) {
                try {
                    const currentFilename =
                        await window.electron.getCurrentFilename();
                    if (currentFilename) {
                        // Extract just the filename without path and extension
                        const baseFilename =
                            currentFilename
                                .split("/")
                                .pop()
                                ?.split("\\")
                                .pop()
                                ?.replace(/\.[^/.]+$/, "") || currentFilename;
                        const titleText = `${baseFilename} - Page ${firstPage.name}`;
                        titleElement = `
                                <!-- Page Title -->
                                <text x="50%" y="90" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="600" fill="#1F2937">${titleText}</text>
                            `;
                    }
                } catch (error) {
                    console.warn("Could not add title to preview SVG:", error);
                }
            }

            // Insert title after the opening SVG tag
            if (titleElement) {
                svg = svg.replace(/(<svg[^>]*>)/, `$1${titleElement}`);
            }

            setPreviewSvg(svg);
            setPreviewGenerated(true);
        } catch (error) {
            console.error("Error generating preview:", error);
            // Set an error state or show a fallback
            setPreviewSvg("");
            setPreviewGenerated(true);
        }
    }, [
        fieldProperties,
        pages,
        marcherPages,
        marchers,
        createExportCanvas,
        includeTitle,
    ]);

    // Generate preview when component mounts or options change
    useEffect(() => {
        // Only generate preview if we haven't generated one yet and we have the required data
        if (!previewGenerated && fieldProperties && pages.length > 0) {
            generatePreview();
        }
    }, [generatePreview, previewGenerated, fieldProperties, pages.length]);

    // Regenerate preview when options change (but only if preview was already generated)
    useEffect(() => {
        if (previewGenerated && fieldProperties && pages.length > 0) {
            generatePreview();
        }
    }, [
        includeTitle,
        generatePreview,
        previewGenerated,
        fieldProperties,
        pages.length,
    ]);

    // Export all pages as PDF
    const exportAllPagesAsPdf = useCallback(async () => {
        setIsLoading(true);
        setProgress(0);
        setCurrentStep("Initializing export...");

        try {
            const svgPages: string[] = [];
            let fileName = "drill-charts.pdf";

            // Get current filename for title if enabled
            if (includeTitle) {
                setCurrentStep("Getting filename...");
                try {
                    const currentFilename =
                        await window.electron.getCurrentFilename();
                    if (currentFilename) {
                        fileName = `${currentFilename.replace(/\.[^/.]+$/, "")}-drill-charts.pdf`;
                    }
                } catch (error) {
                    console.warn("Could not get current filename:", error);
                }
            }

            // Calculate progress steps: each page takes 90% of progress, final PDF generation takes 10%
            const totalSteps = pages.length;
            const progressPerPage = 90 / totalSteps;

            for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                setCurrentStep(
                    `Processing page ${i + 1} of ${pages.length}: ${page.name}`,
                );

                const { exportCanvas, padding } =
                    await createExportCanvas(true);

                // Set the current page
                exportCanvas.currentPage = page;

                // Get marcher pages for this page
                const currentPageMarcherPages = marcherPages.filter(
                    (mp) => mp.page_id === page.id,
                );

                // Render marchers for this page using the same method as the main canvas
                await exportCanvas.renderMarchers({
                    currentMarcherPages: currentPageMarcherPages,
                    allMarchers: marchers,
                });

                // Wait for render to complete
                await new Promise((resolve) => setTimeout(resolve, 200));

                // If we have padding, translate the entire canvas content to center it
                if (padding > 0) {
                    // Get all objects on the canvas
                    const allObjects = exportCanvas.getObjects();

                    // Move everything by the padding amount to center it, plus extra space for branding header
                    const brandingOffset = 60; // Reduced space for simpler header
                    allObjects.forEach((obj) => {
                        if (obj.left !== undefined) {
                            obj.set({ left: obj.left + padding });
                        }
                        if (obj.top !== undefined) {
                            obj.set({
                                top: obj.top + padding + brandingOffset,
                            });
                        }
                        obj.setCoords();
                    });

                    exportCanvas.requestRenderAll();
                }

                // Generate SVG
                let svg = exportCanvas.toSVG();

                // Add title to SVG if enabled
                let titleElement = "";
                if (includeTitle) {
                    try {
                        const currentFilename =
                            await window.electron.getCurrentFilename();
                        if (currentFilename) {
                            // Extract just the filename without path and extension
                            const baseFilename =
                                currentFilename
                                    .split("/")
                                    .pop()
                                    ?.split("\\")
                                    .pop()
                                    ?.replace(/\.[^/.]+$/, "") ||
                                currentFilename;
                            const titleText = `${baseFilename} - Page ${page.name}`;
                            titleElement = `
                                    <!-- Page Title -->
                                    <text x="50%" y="90" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="600" fill="#1F2937">${titleText}</text>
                                `;
                        }
                    } catch (error) {
                        console.warn("Could not add title to SVG:", error);
                    }
                }

                // Insert title after the opening SVG tag
                if (titleElement) {
                    svg = svg.replace(/(<svg[^>]*>)/, `$1${titleElement}`);
                }

                svgPages.push(svg);

                // Update progress smoothly
                const newProgress = (i + 1) * progressPerPage;
                setProgress(newProgress);

                // Small delay to allow UI to update
                await new Promise((resolve) => setTimeout(resolve, 50));
            }

            // Final step: Generate PDF
            setCurrentStep("Generating PDF file...");
            setProgress(95);

            // Export SVG pages to PDF
            const result = await window.electron.export.svgPagesToPdf(
                svgPages,
                { fileName },
            );

            if (!result.success) {
                console.error("PDF export failed with error:", result.error);
                throw new Error(result.error);
            }

            setProgress(100);
            setCurrentStep("Export completed!");

            // Enhanced success toast with more details
            const successMessage = `Successfully exported ${pages.length} page${pages.length === 1 ? "" : "s"} as PDF!`;

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
    }, [pages, createExportCanvas, marcherPages, marchers, includeTitle]);

    // Check if we have the minimum requirements for export
    const canExport = !!(
        fieldProperties &&
        pages.length > 0 &&
        marchers.length > 0
    );

    // Manual preview generation
    const handleGeneratePreview = useCallback(() => {
        setPreviewGenerated(false);
        setPreviewSvg("");
        generatePreview();
    }, [generatePreview]);

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
                            checked={includeTitle}
                            onCheckedChange={(checked: boolean) =>
                                setIncludeTitle(checked)
                            }
                        />
                    </Form.Control>
                    <Form.Label className="text-body">
                        Include file title
                    </Form.Label>
                </Form.Field>
            </Form.Root>

            {/* Preview Section */}
            {canExport && (
                <div className="flex flex-col gap-8">
                    <div className="flex w-full items-center justify-between">
                        <h5 className="text-h5">Preview</h5>
                        <p className="text-sub text-text/75">
                            First drill page preview
                        </p>
                    </div>
                    <div
                        ref={previewContainerRef}
                        className="border-stroke overflow-hidden rounded-lg border bg-white p-8"
                    >
                        {!previewGenerated ? (
                            <div className="flex flex-col items-center justify-center gap-4 py-20">
                                <p className="text-body text-text/75">
                                    Click to generate preview
                                </p>
                                <Button
                                    size="compact"
                                    onClick={handleGeneratePreview}
                                    disabled={!canExport}
                                >
                                    Generate Preview
                                </Button>
                            </div>
                        ) : previewSvg ? (
                            <div
                                className="flex w-full items-center justify-center"
                                style={{
                                    height: "250px",
                                }}
                            >
                                <div
                                    dangerouslySetInnerHTML={{
                                        __html: previewSvg,
                                    }}
                                    style={(() => {
                                        // Parse SVG dimensions to calculate dynamic scale
                                        const svgMatch = previewSvg.match(
                                            /<svg[^>]*width="([^"]*)"[^>]*height="([^"]*)"[^>]*>/,
                                        );
                                        if (svgMatch) {
                                            const svgWidth = parseFloat(
                                                svgMatch[1],
                                            );
                                            const svgHeight = parseFloat(
                                                svgMatch[2],
                                            );

                                            // Get actual container dimensions
                                            const containerElement =
                                                previewContainerRef.current;
                                            const containerWidth =
                                                containerElement
                                                    ? containerElement.clientWidth -
                                                      32
                                                    : 600; // Subtract padding (16px * 2)
                                            const containerHeight = 250; // Fixed container height
                                            const targetPadding = 24; // Desired padding on each side

                                            // Calculate available space for the SVG
                                            const availableWidth =
                                                containerWidth -
                                                targetPadding * 2;
                                            const availableHeight =
                                                containerHeight -
                                                targetPadding * 2;

                                            // Calculate scale to fit within available space
                                            const scaleX =
                                                availableWidth / svgWidth;
                                            const scaleY =
                                                availableHeight / svgHeight;
                                            const scale = Math.min(
                                                scaleX,
                                                scaleY,
                                                1,
                                            ); // Don't scale up beyond 100%

                                            return {
                                                transform: `scale(${scale})`,
                                                transformOrigin:
                                                    "center center",
                                                width: "fit-content",
                                                height: "fit-content",
                                            };
                                        }

                                        // Fallback if SVG parsing fails
                                        return {
                                            transform: "scale(0.25)",
                                            transformOrigin: "center center",
                                            width: "fit-content",
                                            height: "fit-content",
                                        };
                                    })()}
                                />
                            </div>
                        ) : (
                            <div className="text-text/60 flex h-32 items-center justify-center">
                                <CircleNotch
                                    className="mr-2 animate-spin"
                                    size={16}
                                />
                                Generating preview...
                            </div>
                        )}
                    </div>
                </div>
            )}

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
                    onClick={exportAllPagesAsPdf}
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

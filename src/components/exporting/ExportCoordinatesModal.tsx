import { useCallback, useEffect, useState, useRef } from "react";
import MarcherCoordinateSheet, {
    StaticMarcherCoordinateSheet,
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
} from "../ui/Dialog";
import { ArrowSquareOut, Info, CircleNotch } from "@phosphor-icons/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { TooltipContents } from "../ui/Tooltip";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import * as Form from "@radix-ui/react-form";
import { Input } from "../ui/Input";
import { toast } from "sonner";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import { useSelectedPage } from "@/context/SelectedPageContext";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import * as Tabs from "@radix-ui/react-tabs";

function CoordinateSheetExport() {
    const [isTerse, setIsTerse] = useState(false);
    const [includeMeasures, setIncludeMeasures] = useState(true);
    const [useXY, setUseXY] = useState(false);
    const [roundingDenominator, setRoundingDenominator] = useState(4);
    const [organizeBySection, setOrganizeBySection] = useState(false);
    const { marchers } = useMarcherStore()!;
    const { pages } = useTimingObjectsStore()!;
    const { marcherPages } = useMarcherPageStore()!;
    const { fieldProperties } = useFieldProperties()!;
    const [isLoading, setIsLoading] = useState(false);
    const [, setProgress] = useState(0);

    const handleExport = useCallback(async () => {
        setIsLoading(true);
        setProgress(0);

        if (!fieldProperties) {
            toast.error("Field properties are required for export");
            setIsLoading(false);
            return;
        }

        try {
            const processedMarchers = marchers.map((marcher, index) => ({
                ...marcher,
                name: marcher.name || `${marcher.section} ${index + 1}`,
            }));

            const coordinateSheets = processedMarchers.map((marcher) => ({
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

            const result = await window.electron.export.pdf({
                sheets: coordinateSheets,
                organizeBySection,
            });

            if (!result.success) {
                throw new Error(result.error);
            }

            // Add success toast message
            const successMessage = `Successfully exported coordinate sheets for ${marchers.length} marcher${marchers.length === 1 ? "" : "s"}!`;
            const description = organizeBySection
                ? "PDFs organized by section have been saved to your selected location."
                : "Combined PDF has been saved to your selected location.";

            toast.success(successMessage, {
                description: description,
                duration: 5000, // Show for 5 seconds
            });
        } catch (error) {
            console.error("Export failed:", error);
            toast.error(
                `Export failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
        } finally {
            setIsLoading(false);
            setProgress(100);
        }
    }, [
        fieldProperties,
        marchers,
        pages,
        marcherPages,
        includeMeasures,
        isTerse,
        useXY,
        roundingDenominator,
        organizeBySection,
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
                            checked={isTerse}
                            onCheckedChange={(checked: boolean) =>
                                setIsTerse(checked)
                            }
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
                            onChange={(e) =>
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
    const [, setProgress] = useState(0);

    // Export options state
    const [includeTitle, setIncludeTitle] = useState(true);
    const paddingAmount = 64; // Fixed padding amount

    // Preview state
    const [previewSvg, setPreviewSvg] = useState<string>("");
    const previewContainerRef = useRef<HTMLDivElement>(null);

    // Create a completely independent canvas for export
    const createExportCanvas = useCallback(
        async (withPadding: boolean = false) => {
            if (!fieldProperties) {
                throw new Error("Field properties not loaded");
            }

            // Create a temporary canvas element
            const tempCanvasElement = document.createElement("canvas");
            const padding = withPadding ? paddingAmount : 0;
            tempCanvasElement.width = fieldProperties.width + padding * 2;
            tempCanvasElement.height = fieldProperties.height + padding * 2;

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
                        wheelZoomSensitivity: 1,
                        enableTouchpadGestures: false,
                        enableMomentumScrolling: false,
                        enableCanvasPanning: false,
                        trackpadMode: false,
                        trackpadPanSensitivity: 1,
                        zoomSensitivity: 0.03,
                        panSensitivity: 1,
                    },
                },
                currentPage: selectedPage || pages[0],
            });

            // Wait for canvas to initialize
            await new Promise((resolve) => setTimeout(resolve, 100));

            return { exportCanvas, padding };
        },
        [fieldProperties, selectedPage, pages, paddingAmount],
    );

    // Generate preview of the first page
    const generatePreview = useCallback(async () => {
        if (!fieldProperties || pages.length === 0) return;

        try {
            const firstPage = pages[0];
            const { exportCanvas, padding } = await createExportCanvas(true);

            try {
                // Set the current page
                exportCanvas.currentPage = firstPage;

                // Get marcher pages for this page
                const currentPageMarcherPages = marcherPages.filter(
                    (mp) => mp.page_id === firstPage.id,
                );

                // Adjust marcher page coordinates for padding
                const adjustedMarcherPages = currentPageMarcherPages.map(
                    (mp) => ({
                        ...mp,
                        x: mp.x + padding,
                        y: mp.y + padding,
                    }),
                );

                // Render marchers for this page
                await exportCanvas.renderMarchers({
                    currentMarcherPages: adjustedMarcherPages,
                    allMarchers: marchers,
                });

                // Wait for render to complete
                await new Promise((resolve) => setTimeout(resolve, 200));

                // Generate SVG for preview
                let svg = exportCanvas.toSVG();

                // Wrap the SVG content with padding
                const svgMatch = svg.match(
                    /<svg[^>]*width="([^"]*)"[^>]*height="([^"]*)"[^>]*>/,
                );
                if (svgMatch) {
                    const originalWidth = parseFloat(svgMatch[1]);
                    const originalHeight = parseFloat(svgMatch[2]);
                    const newWidth = originalWidth + padding * 2;
                    const newHeight = originalHeight + padding * 2;

                    // Create a new SVG with padding
                    svg = svg.replace(
                        /<svg[^>]*>/,
                        `<svg width="${newWidth}" height="${newHeight}" viewBox="0 0 ${newWidth} ${newHeight}" xmlns="http://www.w3.org/2000/svg">`,
                    );

                    // Wrap the content in a group with translation
                    svg = svg
                        .replace(
                            /(<svg[^>]*>)/,
                            `$1<g transform="translate(${padding}, ${padding})">`,
                        )
                        .replace(/<\/svg>/, "</g></svg>");
                }

                // Add title to preview if enabled
                if (includeTitle) {
                    try {
                        const currentFilename =
                            await window.electron.getCurrentFilename();
                        if (currentFilename) {
                            const titleText = `${currentFilename} - Page ${firstPage.name}`;
                            // Insert title at the beginning of the SVG content
                            svg = svg.replace(
                                /(<svg[^>]*>)/,
                                `$1<text x="50%" y="30" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="black">${titleText}</text>`,
                            );
                        }
                    } catch (error) {
                        console.warn(
                            "Could not add title to preview SVG:",
                            error,
                        );
                    }
                }

                setPreviewSvg(svg);
            } finally {
                // Clean up the export canvas
                exportCanvas.dispose();
            }
        } catch (error) {
            console.error("Error generating preview:", error);
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
        generatePreview();
    }, [generatePreview]);

    // Export all pages as PDF
    const exportAllPagesAsPdf = useCallback(async () => {
        setIsLoading(true);
        setProgress(0);

        try {
            const svgPages: string[] = [];
            let fileName = "drill-charts.pdf";

            // Get current filename for title if enabled
            if (includeTitle) {
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

            for (let i = 0; i < pages.length; i++) {
                const page = pages[i];

                const { exportCanvas, padding } =
                    await createExportCanvas(true);

                try {
                    // Set the current page
                    exportCanvas.currentPage = page;

                    // Get marcher pages for this page
                    const currentPageMarcherPages = marcherPages.filter(
                        (mp) => mp.page_id === page.id,
                    );

                    // Adjust marcher page coordinates for padding
                    const adjustedMarcherPages = currentPageMarcherPages.map(
                        (mp) => ({
                            ...mp,
                            x: mp.x + padding,
                            y: mp.y + padding,
                        }),
                    );

                    // Render marchers for this page
                    await exportCanvas.renderMarchers({
                        currentMarcherPages: adjustedMarcherPages,
                        allMarchers: marchers,
                    });

                    // Wait for render to complete
                    await new Promise((resolve) => setTimeout(resolve, 200));

                    // Generate SVG
                    let svg = exportCanvas.toSVG();

                    // Wrap the SVG content with padding
                    const svgMatch = svg.match(
                        /<svg[^>]*width="([^"]*)"[^>]*height="([^"]*)"[^>]*>/,
                    );
                    if (svgMatch) {
                        const originalWidth = parseFloat(svgMatch[1]);
                        const originalHeight = parseFloat(svgMatch[2]);
                        const newWidth = originalWidth + padding * 2;
                        const newHeight = originalHeight + padding * 2;

                        // Create a new SVG with padding
                        svg = svg.replace(
                            /<svg[^>]*>/,
                            `<svg width="${newWidth}" height="${newHeight}" viewBox="0 0 ${newWidth} ${newHeight}" xmlns="http://www.w3.org/2000/svg">`,
                        );

                        // Wrap the content in a group with translation
                        svg = svg
                            .replace(
                                /(<svg[^>]*>)/,
                                `$1<g transform="translate(${padding}, ${padding})">`,
                            )
                            .replace(/<\/svg>/, "</g></svg>");
                    }

                    // Add title to SVG if enabled
                    if (includeTitle) {
                        try {
                            const currentFilename =
                                await window.electron.getCurrentFilename();
                            if (currentFilename) {
                                const titleText = `${currentFilename} - Page ${page.name}`;
                                // Insert title at the beginning of the SVG content
                                svg = svg.replace(
                                    /(<svg[^>]*>)/,
                                    `$1<text x="50%" y="30" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="black">${titleText}</text>`,
                                );
                            }
                        } catch (error) {
                            console.warn("Could not add title to SVG:", error);
                        }
                    }

                    svgPages.push(svg);
                } finally {
                    // Clean up the export canvas
                    exportCanvas.dispose();
                }

                setProgress(((i + 1) * 100) / pages.length);
            }

            // Send SVGs to Electron for PDF generation
            const result = await window.electron.export.svgPagesToPdf(
                svgPages,
                { fileName },
            );

            if (!result.success) {
                console.error("PDF export failed with error:", result.error);
                throw new Error(result.error);
            }

            // Enhanced success toast with more details
            const successMessage = `Successfully exported ${pages.length} page${pages.length === 1 ? "" : "s"} as PDF!`;
            const description = result.filePath
                ? `Saved to: ${result.filePath}`
                : "PDF has been saved to your selected location.";

            toast.success(successMessage, {
                description: description,
                duration: 5000, // Show for 5 seconds
            });
        } catch (error) {
            console.error("Export error:", error);
            toast.error(
                `Export failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
        } finally {
            setIsLoading(false);
            setProgress(100);
        }
    }, [pages, createExportCanvas, marcherPages, marchers, includeTitle]);

    // Check if we have the minimum requirements for export
    const canExport = !!(
        fieldProperties &&
        pages.length > 0 &&
        marchers.length > 0
    );

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
                        className="rounded-lg overflow-hidden border border-stroke bg-white p-8"
                    >
                        {previewSvg ? (
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
                            <div className="flex h-32 items-center justify-center text-text/60">
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
                <div className="bg-gray-50 rounded-lg flex flex-col items-center justify-center gap-12 py-20">
                    <h4 className="text-gray-600 text-h4">
                        Export Not Available
                    </h4>
                    <p className="text-gray-500 max-w-md text-center text-body">
                        Export requires field properties, pages, and marchers to
                        be loaded.
                    </p>
                    <div className="text-xs text-gray-400 text-center">
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
                <div className="bg-gray-200 h-8 w-full rounded-full">
                    <div
                        className="bg-blue-600 h-8 rounded-full transition-all duration-300"
                        style={{
                            width: `${Math.round((pages.length > 0 ? 100 / pages.length : 0) * (pages.findIndex((p) => p === selectedPage) + 1))}%`,
                        }}
                    ></div>
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
            <Tabs.List className="flex gap-8 border-b border-stroke">
                <Tabs.Trigger
                    value="coordinate-sheets"
                    className="px-16 py-8 text-body text-text/60 data-[state=active]:border-b-2 data-[state=active]:border-accent data-[state=active]:text-accent"
                >
                    Coordinate Sheets
                </Tabs.Trigger>
                <Tabs.Trigger
                    value="drill-charts"
                    className="px-16 py-8 text-body text-text/60 data-[state=active]:border-b-2 data-[state=active]:border-accent data-[state=active]:text-accent"
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
                className="cursor-pointer outline-none duration-150 ease-out hover:text-accent focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50"
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

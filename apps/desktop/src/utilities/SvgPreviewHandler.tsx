import React, { useEffect, useRef, useCallback, useMemo } from "react";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { useFieldProperties } from "@/context/fieldPropertiesContext";
import { useMarcherPageStore } from "@/stores/MarcherPageStore";
import { useMarcherStore } from "@/stores/MarcherStore";
import { UiSettings } from "@/stores/UiSettingsStore";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";

/**
 * Handler for generating canvas preview SVGs on app close for launchpage
 */
const SvgPreviewHandler: React.FC = () => {
    const handlerRegisteredRef = useRef(false);

    // Get current values
    const { fieldProperties } = useFieldProperties() ?? {};
    const { marcherPages = [] } = useMarcherPageStore() ?? {};
    const { marchers = [] } = useMarcherStore() ?? {};
    const { pages = [] } = useTimingObjectsStore() ?? {};

    // Refs to store current values for use in the IPC handler
    const fieldPropertiesRef = useRef(fieldProperties);
    const marcherPagesRef = useRef(marcherPages);
    const marchersRef = useRef(Array.isArray(marchers) ? marchers : []);
    const pagesRef = useRef(pages);

    // Keep refs updated
    useEffect(() => {
        fieldPropertiesRef.current = fieldProperties;
    }, [fieldProperties]);

    useEffect(() => {
        marcherPagesRef.current = marcherPages;
    }, [marcherPages]);

    useEffect(() => {
        marchersRef.current = Array.isArray(marchers) ? marchers : [];
    }, [marchers]);

    useEffect(() => {
        pagesRef.current = Array.isArray(pages) ? pages : [];
    }, [pages]);

    // Static default UI settings
    const defaultUISettings: UiSettings = useMemo(
        () => ({
            isPlaying: false,
            lockX: false,
            lockY: false,
            previousPaths: false,
            nextPaths: false,
            gridLines: true,
            halfLines: true,
            timelinePixelsPerSecond: 40,
            focussedComponent: "canvas" as const,
            mouseSettings: {
                trackpadMode: true,
                trackpadPanSensitivity: 0.5,
                zoomSensitivity: 0.03,
                panSensitivity: 0.5,
            },
        }),
        [],
    );

    /**
     * Create a minimal canvas for SVG export
     */
    const createSvgCanvas = useCallback(
        async (fieldProps: any, page: any) => {
            if (!fieldProps) throw new Error("Field properties not loaded");

            const canvasEl = document.createElement("canvas");
            canvasEl.width = fieldProps.width;
            canvasEl.height = fieldProps.height;

            const svgCanvas = new OpenMarchCanvas({
                canvasRef: canvasEl,
                fieldProperties: fieldProps,
                uiSettings: defaultUISettings,
                currentPage: page,
            });

            svgCanvas.setWidth(fieldProps.width);
            svgCanvas.setHeight(fieldProps.height);

            svgCanvas.renderFieldGrid();

            return svgCanvas;
        },
        [defaultUISettings],
    );

    /**
     * Generate SVG preview for a page
     */
    const generateSvgPreview = useCallback(
        async (
            fieldProps: any,
            page: any,
            marcherPages: any[],
            allMarchers: any[],
        ): Promise<string> => {
            if (!fieldProps || !page) {
                throw new Error("Missing field properties or page");
            }

            let svgCanvas: OpenMarchCanvas | null = null;

            try {
                svgCanvas = await createSvgCanvas(fieldProps, page);

                const currentPageMarcherPages = marcherPages.filter(
                    (mp) => mp.page_id === page.id,
                );

                await svgCanvas.renderMarchers({
                    currentMarcherPages: currentPageMarcherPages,
                    allMarchers: allMarchers,
                });

                return svgCanvas.toSVG();
            } catch (err) {
                console.error("Error generating SVG preview:", err);
                return "ERROR: Failed to generate SVG";
            } finally {
                if (svgCanvas) {
                    try {
                        svgCanvas.dispose();
                    } catch (e) {
                        console.warn("Error disposing canvas:", e);
                    }
                }
            }
        },
        [createSvgCanvas],
    );

    /**
     * Register IPC handler on mount
     */
    useEffect(() => {
        if (!window.electron || handlerRegisteredRef.current) return;

        window.electron.onGetSvgForClose(async () => {
            const currentFieldProps = fieldPropertiesRef.current;
            const currentPages = pagesRef.current;
            const currentMarcherPages = marcherPagesRef.current;
            const currentMarchers = marchersRef.current;

            // Explicitly get the first page only
            const firstPage =
                currentPages && currentPages.length > 0
                    ? currentPages[0]
                    : null;

            if (!currentFieldProps || !firstPage) {
                console.error(
                    "Missing required data for SVG generation. Field properties or first page not available.",
                );
            }

            const svg = await generateSvgPreview(
                currentFieldProps,
                firstPage,
                currentMarcherPages,
                currentMarchers,
            );

            console.log(
                "SVG generated successfully for first page on app close",
            );
            return svg;
        });

        handlerRegisteredRef.current = true;
        console.log("SVG preview handler registered");
    }, [generateSvgPreview, pages]);

    return null;
};

export default SvgPreviewHandler;

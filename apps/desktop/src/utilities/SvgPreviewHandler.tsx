import React, { useEffect, useRef, useCallback, useMemo } from "react";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import {
    allMarcherPagesQueryOptions,
    allMarchersQueryOptions,
    fieldPropertiesQueryOptions,
} from "@/hooks/queries";
import { UiSettings } from "@/stores/UiSettingsStore";
import { useMarchersWithVisuals, useTimingObjects } from "@/hooks";
import { useQuery } from "@tanstack/react-query";

/**
 * Handler for generating canvas preview SVGs on app close for launch page
 */
const SvgPreviewHandler: React.FC = () => {
    const handlerRegisteredRef = useRef(false);

    // Get current values
    const { data: fieldProperties } = useQuery(fieldPropertiesQueryOptions());
    const { pages = [] } = useTimingObjects() ?? {};
    const { data: marcherPages = {} } = useQuery(
        // This might be overkill
        allMarcherPagesQueryOptions({
            pinkyPromiseThatYouKnowWhatYouAreDoing: true,
        }),
    );
    const marcherVisuals = useMarchersWithVisuals();
    const { data: marchers } = useQuery(allMarchersQueryOptions());

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
            showCollisions: true,
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
            marcherPages: any,
            allMarchers: any[],
        ): Promise<string> => {
            if (!fieldProps || !page) {
                throw new Error("Missing field properties or page");
            }

            let svgCanvas: OpenMarchCanvas | null = null;

            try {
                svgCanvas = await createSvgCanvas(fieldProps, page);

                await svgCanvas.renderMarchers({
                    marcherVisuals: marcherVisuals,
                    marcherPages: marcherPages,
                    pageId: page.id,
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
        [createSvgCanvas, marcherVisuals],
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

            console.debug(
                "SVG generated successfully for first page on app close",
            );
            return svg;
        });

        handlerRegisteredRef.current = true;
        console.debug("SVG preview handler registered");
    }, [generateSvgPreview, pages]);

    return null;
};

export default SvgPreviewHandler;

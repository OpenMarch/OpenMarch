import React, { useState, useEffect } from "react";
import clsx from "clsx";
import { PlusIcon, MinusIcon } from "@phosphor-icons/react";
import { Slider } from "@openmarch/ui";
import {
    FullscreenButton,
    PerspectiveButton,
} from "@/components/timeline/PerspectiveSlider";
import { MAX_ZOOM, MIN_ZOOM } from "@/field/editor/view";

/**
 * What the zoom controls call on the field: the field's view
 * (`threeZoomControls`).
 */
export interface ZoomControlsCanvas {
    width?: number;
    height?: number;
    fieldProperties?: { width: number; height: number };
    getWidth(): number;
    getHeight(): number;
    getZoom(): number;
    getBaseZoom?(): number;
    zoomToPoint(point: { x: number; y: number }, zoom: number): unknown;
    setZoom(zoom: number): unknown;
    setViewportTransform(transform: number[]): unknown;
    centerAtBaseZoom?(): void;
    resetCSSTransform?(): void;
    requestRenderAll(): unknown;
}

interface CanvasZoomControlsProps {
    canvas: ZoomControlsCanvas | undefined;
}

export default function CanvasZoomControls({
    canvas,
}: CanvasZoomControlsProps) {
    const [currentZoom, setCurrentZoom] = useState(100); // Represents percentage
    const [rawZoom, setRawZoom] = useState(1); // Raw field zoom, for the slider

    useEffect(() => {
        if (!canvas) return;

        const updateZoom = () => {
            // Display relative to base zoom so base == 100%
            const base = canvas.getBaseZoom?.() ?? 1.0;
            const ratio = canvas.getZoom() / (base || 1);
            setCurrentZoom(Math.round(ratio * 100));
            setRawZoom(canvas.getZoom());
        };

        updateZoom();
        const interval = setInterval(updateZoom, 100); // Keep interval for live update
        return () => clearInterval(interval);
    }, [canvas]);

    const handleZoomIn = () => {
        if (!canvas) return;

        const currentRawZoom = canvas.getZoom();
        if (currentRawZoom >= MAX_ZOOM) {
            return;
        }

        const newRawZoom = Math.min(currentRawZoom * 1.2, MAX_ZOOM);
        const center = {
            x: (canvas.width || 0) / 2,
            y: (canvas.height || 0) / 2,
        };
        canvas.zoomToPoint(center, newRawZoom);
        canvas.requestRenderAll();
        // setCurrentZoom(Math.round(newRawZoom * 100)); // updateZoom interval will handle this
    };

    const handleZoomOut = () => {
        if (!canvas) return;

        const currentRawZoom = canvas.getZoom();
        if (currentRawZoom <= MIN_ZOOM) {
            return;
        }

        const newRawZoom = Math.max(currentRawZoom / 1.2, MIN_ZOOM);
        const center = {
            x: (canvas.width || 0) / 2,
            y: (canvas.height || 0) / 2,
        };
        canvas.zoomToPoint(center, newRawZoom);
        canvas.requestRenderAll();
        // setCurrentZoom(Math.round(newRawZoom * 100)); // updateZoom interval will handle this
    };

    // The slider is logarithmic, so equal travel is an equal zoom factor, as with the buttons
    const handleSliderChange = ([position]: number[]) => {
        if (!canvas) return;
        const newRawZoom = Math.min(
            Math.max(Math.exp(position), MIN_ZOOM),
            MAX_ZOOM,
        );
        canvas.zoomToPoint(
            { x: (canvas.width || 0) / 2, y: (canvas.height || 0) / 2 },
            newRawZoom,
        );
        canvas.requestRenderAll();
        setRawZoom(newRawZoom);
    };

    const handleResetZoomAndCenter = () => {
        if (
            !canvas ||
            !canvas.fieldProperties ||
            typeof canvas.width !== "number" ||
            typeof canvas.height !== "number"
        ) {
            console.warn(
                "ResetZoomAndCenter: Canvas or its properties not available.",
            );
            return;
        }

        const fieldWidth = canvas.fieldProperties.width;
        const fieldHeight = canvas.fieldProperties.height;
        // Use actual wrapper-sized viewport
        const viewportWidth = canvas.getWidth();
        const viewportHeight = canvas.getHeight();

        if (
            fieldWidth <= 0 ||
            fieldHeight <= 0 ||
            viewportWidth <= 0 ||
            viewportHeight <= 0
        ) {
            console.warn(
                "ResetZoomAndCenter: Invalid dimensions for field or viewport.",
            );
            // Fallback to simple zoom reset if dimensions are problematic
            canvas.setZoom(1);
            canvas.setViewportTransform([1, 0, 0, 1, 0, 0]); // Set zoom to 1, pan to (0,0)
            canvas.requestRenderAll();
            return;
        }

        // Center at base zoom (treated as 100%)
        if (typeof canvas.centerAtBaseZoom === "function") {
            canvas.centerAtBaseZoom();
        }

        // Ensure any CSS transforms are reset if they were part of an older system.
        // This helps ensure a clean state if CSS transforms were previously affecting the view.
        if (typeof canvas.resetCSSTransform === "function") {
            canvas.resetCSSTransform();
        }

        canvas.requestRenderAll();
    };

    // getMaxZoom and getMinZoom now refer to percentage values for the UI disable logic
    const getMaxZoom = () => MAX_ZOOM * 100;
    const getMinZoom = () => MIN_ZOOM * 100;

    // Tooltip for the hamburger icon (placeholder)
    // const NavigationTooltip = () => (
    //     <div className="bg-bg-1 pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 transform rounded-md px-3 py-1.5 text-sm whitespace-nowrap opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
    //         Zoom and navigation
    //         <div className="border-t-bg-1 absolute top-full left-1/2 -translate-x-1/2 transform border-x-4 border-t-4 border-x-transparent" />
    //     </div>
    // );

    return (
        <div
            className={clsx(
                "group border-stroke bg-bg-1 pointer-events-auto absolute right-6 bottom-6 z-10 flex min-w-200 flex-col overflow-hidden rounded-lg border shadow-lg",
            )}
        >
            <div className="border-stroke flex items-center border-b px-12 py-2">
                <Slider
                    aria-label="Zoom"
                    data-testid="canvas-zoom-slider"
                    className="h-12 w-full"
                    thumbClassName="size-10"
                    min={Math.log(MIN_ZOOM)}
                    max={Math.log(MAX_ZOOM)}
                    step={0.01}
                    value={[Math.log(rawZoom)]}
                    onValueChange={handleSliderChange}
                    disabled={!canvas}
                />
            </div>
            <div className="flex items-stretch justify-between">
                {/* The field's view controls (UI-12): fullscreen and perspective */}
                <PerspectiveButton />
                <FullscreenButton />
                {/* Hamburger Icon (placeholder for future menu) */}
                {/* <button
                className="text-text hover:bg-fg-2 flex items-center justify-center p-2 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50"
                title="Zoom and navigation"
                disabled={!canvas}
            >
                <List size={20} />
                <NavigationTooltip />
            </button> */}

                {/* Zoom Out Button */}
                <button
                    onClick={handleZoomOut}
                    className="border-stroke text-text flex w-full items-center justify-center border-l p-2 transition-colors duration-150 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canvas || currentZoom <= getMinZoom()}
                    title="Zoom Out"
                >
                    <MinusIcon size={18} weight="bold" />
                </button>

                {/* Zoom Percentage Display and Reset Button */}
                <button
                    onClick={handleResetZoomAndCenter}
                    className="border-stroke bg-fg-2 text-text flex h-full w-full items-center justify-center border-r border-l px-3 py-4 font-mono text-sm transition-colors duration-150 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canvas}
                    title="Reset Zoom and Center"
                >
                    {currentZoom}%
                </button>

                {/* Zoom In Button */}
                <button
                    onClick={handleZoomIn}
                    className="border-stroke text-text flex w-full items-center justify-center border-l p-2 transition-colors duration-150 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canvas || currentZoom >= getMaxZoom()}
                    title="Zoom In"
                >
                    <PlusIcon size={18} weight="bold" />
                </button>
            </div>
        </div>
    );
}

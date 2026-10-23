import React, { useState, useEffect } from "react";
import { PlusIcon, MinusIcon } from "@phosphor-icons/react";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { CANVAS_ZOOM_LIMITS } from "./CanvasConstants";

interface CanvasZoomControlsProps {
    canvas: OpenMarchCanvas | undefined;
}

export default function CanvasZoomControls({
    canvas,
}: CanvasZoomControlsProps) {
    const [currentZoom, setCurrentZoom] = useState(100); // Represents percentage
    // The Fabric zoom itself, which the limits apply to (the percentage is relative to the fitted view)
    const [fabricZoom, setFabricZoom] = useState(1);

    const FABRIC_MIN_ZOOM = CANVAS_ZOOM_LIMITS.min;
    const FABRIC_MAX_ZOOM = CANVAS_ZOOM_LIMITS.max;

    useEffect(() => {
        if (!canvas) return;

        const updateZoom = () => {
            // Display relative to the fitted zoom so it reads 100% after a fit,
            // and doesn't change when only the canvas size changes
            const base = canvas.getZoomReference?.() ?? 1.0;
            const zoom = canvas.getZoom();
            const ratio = zoom / (base || 1);
            setCurrentZoom(Math.round(ratio * 100));
            setFabricZoom(zoom);
        };

        updateZoom();
        const interval = setInterval(updateZoom, 100); // Keep interval for live update
        return () => clearInterval(interval);
    }, [canvas]);

    const handleZoomIn = () => {
        if (!canvas) return;

        const currentFabricZoom = canvas.getZoom();
        if (currentFabricZoom >= FABRIC_MAX_ZOOM) {
            console.log("Already at max Fabric zoom.");
            return;
        }

        const newFabricZoom = Math.min(
            currentFabricZoom * 1.2,
            FABRIC_MAX_ZOOM,
        );
        const center = {
            x: (canvas.width || 0) / 2,
            y: (canvas.height || 0) / 2,
        };
        canvas.zoomToPoint(center, newFabricZoom);
        canvas.requestRenderAll();
        // setCurrentZoom(Math.round(newFabricZoom * 100)); // updateZoom interval will handle this
    };

    const handleZoomOut = () => {
        if (!canvas) return;

        const currentFabricZoom = canvas.getZoom();
        if (currentFabricZoom <= FABRIC_MIN_ZOOM) {
            console.log("Already at min Fabric zoom.");
            return;
        }

        const newFabricZoom = Math.max(
            currentFabricZoom / 1.2,
            FABRIC_MIN_ZOOM,
        );
        const center = {
            x: (canvas.width || 0) / 2,
            y: (canvas.height || 0) / 2,
        };
        canvas.zoomToPoint(center, newFabricZoom);
        canvas.requestRenderAll();
        // setCurrentZoom(Math.round(newFabricZoom * 100)); // updateZoom interval will handle this
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

    // Compared against the Fabric zoom, not the percentage shown
    const atMaxZoom = fabricZoom >= FABRIC_MAX_ZOOM - 1e-6;
    const atMinZoom = fabricZoom <= FABRIC_MIN_ZOOM + 1e-6;

    // Tooltip for the hamburger icon (placeholder)
    // const NavigationTooltip = () => (
    //     <div className="bg-bg-1 pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 transform rounded-md px-3 py-1.5 text-sm whitespace-nowrap opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
    //         Zoom and navigation
    //         <div className="border-t-bg-1 absolute top-full left-1/2 -translate-x-1/2 transform border-x-4 border-t-4 border-x-transparent" />
    //     </div>
    // );

    return (
        <div
            role="group"
            aria-label="Zoom"
            className="group border-stroke bg-bg-1 touch:w-auto absolute right-6 bottom-6 z-10 flex w-128 items-stretch justify-between overflow-hidden rounded-lg border shadow-lg"
        >
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
                className="border-stroke text-text touch:min-h-48 touch:min-w-48 flex w-full items-center justify-center border-l p-2 transition-colors duration-150 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canvas || atMinZoom}
                title="Zoom Out"
                aria-label="Zoom out"
            >
                <MinusIcon size={18} weight="bold" />
            </button>

            {/* Zoom Percentage Display and Reset Button */}
            <button
                onClick={handleResetZoomAndCenter}
                className="border-stroke bg-fg-2 text-text touch:min-h-48 touch:min-w-72 flex h-full w-full items-center justify-center border-r border-l px-3 py-4 font-mono text-sm transition-colors duration-150 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canvas}
                title="Reset Zoom and Center"
                aria-label={`Zoom ${currentZoom}%, reset zoom and center`}
            >
                {currentZoom}%
            </button>

            {/* Zoom In Button */}
            <button
                onClick={handleZoomIn}
                className="border-stroke text-text touch:min-h-48 touch:min-w-48 flex w-full items-center justify-center border-l p-2 transition-colors duration-150 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canvas || atMaxZoom}
                title="Zoom In"
                aria-label="Zoom in"
            >
                <PlusIcon size={18} weight="bold" />
            </button>
        </div>
    );
}

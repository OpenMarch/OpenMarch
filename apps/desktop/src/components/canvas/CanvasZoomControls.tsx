import React, { useState, useEffect } from "react";
import { PlusIcon, MinusIcon } from "@phosphor-icons/react";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";

interface CanvasZoomControlsProps {
    canvas: OpenMarchCanvas | undefined;
}

export default function CanvasZoomControls({
    canvas,
}: CanvasZoomControlsProps) {
    const [currentZoom, setCurrentZoom] = useState(100); // Represents percentage

    // Min and Max zoom levels for Fabric.js (consistent with OpenMarchCanvas._applyZoom)
    const FABRIC_MIN_ZOOM = 0.2;
    const FABRIC_MAX_ZOOM = 25;

    useEffect(() => {
        if (!canvas) return;

        const updateZoom = () => {
            // Display relative to base zoom so base == 100%
            const base = (canvas as any).getBaseZoom?.() ?? 1.0;
            const ratio = canvas.getZoom() / (base || 1);
            setCurrentZoom(Math.round(ratio * 100));
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
        if (typeof (canvas as any).centerAtBaseZoom === "function") {
            (canvas as any).centerAtBaseZoom();
        }

        // Ensure any CSS transforms are reset if they were part of an older system.
        // This helps ensure a clean state if CSS transforms were previously affecting the view.
        if (typeof canvas.resetCSSTransform === "function") {
            canvas.resetCSSTransform();
        }

        canvas.requestRenderAll();
    };

    // getMaxZoom and getMinZoom now refer to percentage values for the UI disable logic
    const getMaxZoom = () => FABRIC_MAX_ZOOM * 100;
    const getMinZoom = () => FABRIC_MIN_ZOOM * 100;

    // Tooltip for the hamburger icon (placeholder)
    // const NavigationTooltip = () => (
    //     <div className="bg-bg-1 pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 transform rounded-md px-3 py-1.5 text-sm whitespace-nowrap opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
    //         Zoom and navigation
    //         <div className="border-t-bg-1 absolute top-full left-1/2 -translate-x-1/2 transform border-x-4 border-t-4 border-x-transparent" />
    //     </div>
    // );

    return (
        <div className="group border-stroke bg-bg-1 absolute right-6 bottom-6 z-10 flex w-128 items-stretch justify-between overflow-hidden rounded-lg border shadow-lg">
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
                className="border-stroke bg-fg-2 text-text flex h-full items-center justify-center border-r border-l px-3 py-1 font-mono text-sm transition-colors duration-150 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
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
    );
}

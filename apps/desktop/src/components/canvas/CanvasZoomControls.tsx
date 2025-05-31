import React, { useState, useEffect } from "react";
import { Plus, Minus, List } from "@phosphor-icons/react";
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
            // Always use Fabric.js zoom for display
            setCurrentZoom(Math.round(canvas.getZoom() * 100));
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
        const viewportWidth = canvas.width;
        const viewportHeight = canvas.height;

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

        // Set zoom to 100% (zoom factor of 1.0)
        const newZoom = 1.0;

        // Calculate translation to center the field (at 100% zoom) within the viewport.
        // This assumes the field content (grid, lines, etc.) is drawn starting from (0,0)
        // in the Fabric canvas coordinate system, up to (fieldWidth, fieldHeight).
        const panX = (viewportWidth - fieldWidth) / 2;
        const panY = (viewportHeight - fieldHeight) / 2;

        // Apply the new viewport transform: zoom is 1.0, pan is calculated
        canvas.setViewportTransform([newZoom, 0, 0, newZoom, panX, panY]);

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
    const NavigationTooltip = () => (
        <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 transform rounded-md bg-neutral-800 px-3 py-1.5 text-sm whitespace-nowrap text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
            Zoom and navigation
            <div className="absolute top-full left-1/2 -translate-x-1/2 transform border-x-4 border-t-4 border-x-transparent border-t-neutral-800" />
        </div>
    );

    return (
        <div className="group absolute right-6 bottom-6 z-10 flex items-stretch overflow-hidden rounded-lg border border-neutral-300 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
            {/* Hamburger Icon (placeholder for future menu) */}
            {/* <button
                className="text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center justify-center p-2 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50"
                title="Zoom and navigation"
                disabled={!canvas}
            >
                <List size={20} />
                <NavigationTooltip />
            </button> */}

            {/* Zoom Out Button */}
            <button
                onClick={handleZoomOut}
                className="flex items-center justify-center border-l border-neutral-300 p-2 text-neutral-700 transition-colors duration-150 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-700"
                disabled={!canvas || currentZoom <= getMinZoom()}
                title="Zoom Out"
            >
                <Minus size={18} weight="bold" />
            </button>

            {/* Zoom Percentage Display and Reset Button */}
            <button
                onClick={handleResetZoomAndCenter}
                className="dark:bg-neutral-750 dark:hover:bg-neutral-650 flex h-full items-center justify-center border-r border-l border-neutral-300 bg-neutral-100 px-3 py-1 font-mono text-sm text-neutral-700 transition-colors duration-150 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300"
                disabled={!canvas}
                title="Reset Zoom and Center"
            >
                {currentZoom}%
            </button>

            {/* Zoom In Button */}
            <button
                onClick={handleZoomIn}
                className="flex items-center justify-center p-2 text-neutral-700 transition-colors duration-150 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-neutral-700"
                disabled={!canvas || currentZoom >= getMaxZoom()}
                title="Zoom In"
            >
                <Plus size={18} weight="bold" />
            </button>
        </div>
    );
}

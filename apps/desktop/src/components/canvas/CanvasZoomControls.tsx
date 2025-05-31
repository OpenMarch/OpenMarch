import React, { useState, useEffect } from "react";
import { Plus, Minus, House } from "@phosphor-icons/react";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";

interface CanvasZoomControlsProps {
    canvas: OpenMarchCanvas | undefined;
}

export default function CanvasZoomControls({
    canvas,
}: CanvasZoomControlsProps) {
    const [currentZoom, setCurrentZoom] = useState(100);

    // Update zoom percentage when canvas changes
    useEffect(() => {
        if (!canvas) return;

        const updateZoom = () => {
            // Check if using CSS-based zoom system
            const cssTransformValues = canvas.getCSSTransformValues();
            if (cssTransformValues && cssTransformValues.scale !== 1) {
                setCurrentZoom(Math.round(cssTransformValues.scale * 100));
            } else {
                // Fall back to Fabric.js zoom
                setCurrentZoom(Math.round(canvas.getZoom() * 100));
            }
        };

        // Initial update
        updateZoom();

        // Set up interval to update zoom display
        const interval = setInterval(updateZoom, 100);

        return () => clearInterval(interval);
    }, [canvas]);

    const handleZoomIn = () => {
        if (!canvas) return;

        // Check if using CSS-based zoom system
        const cssTransformValues = canvas.getCSSTransformValues();
        if (cssTransformValues) {
            // Use CSS-based zoom
            const currentScale = cssTransformValues.scale;
            const newScale = Math.min(currentScale * 1.2, 2.0); // Max zoom from canvas constants

            canvas.setCSSTransformValues({ scale: newScale });
        } else {
            // Fall back to Fabric.js zoom
            const currentZoom = canvas.getZoom();
            const newZoom = Math.min(currentZoom * 1.2, 10);

            const center = {
                x: (canvas.width || 0) / 2,
                y: (canvas.height || 0) / 2,
            };

            canvas.zoomToPoint(center, newZoom);
        }

        canvas.requestRenderAll();
    };

    const handleZoomOut = () => {
        if (!canvas) return;

        // Check if using CSS-based zoom system
        const cssTransformValues = canvas.getCSSTransformValues();
        if (cssTransformValues) {
            // Use CSS-based zoom
            const currentScale = cssTransformValues.scale;
            const newScale = Math.max(currentScale / 1.2, 0.5); // Min zoom from canvas constants

            canvas.setCSSTransformValues({ scale: newScale });
        } else {
            // Fall back to Fabric.js zoom
            const currentZoom = canvas.getZoom();
            const newZoom = Math.max(currentZoom / 1.2, 0.1);

            const center = {
                x: (canvas.width || 0) / 2,
                y: (canvas.height || 0) / 2,
            };

            canvas.zoomToPoint(center, newZoom);
        }

        canvas.requestRenderAll();
    };

    const handleResetZoom = () => {
        if (!canvas) return;

        // Reset both CSS and Fabric.js zoom systems
        canvas.resetCSSTransform();
        canvas.setZoom(1);
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        canvas.requestRenderAll();
    };

    const getMaxZoom = () => {
        if (!canvas) return 200;
        // Check if using CSS-based zoom system
        const cssTransformValues = canvas.getCSSTransformValues();
        if (cssTransformValues) {
            return 200; // 2.0 * 100
        }
        return 1000; // 10 * 100 for Fabric.js
    };

    const getMinZoom = () => {
        if (!canvas) return 10;
        // Check if using CSS-based zoom system
        const cssTransformValues = canvas.getCSSTransformValues();
        if (cssTransformValues) {
            return 50; // 0.5 * 100
        }
        return 10; // 0.1 * 100 for Fabric.js
    };

    return (
        <div className="fixed right-6 bottom-6 z-[45] flex flex-col gap-2">
            {/* Zoom percentage display */}
            <div className="bg-bg-1 border-stroke text-text rounded-md border px-3 py-1 font-mono text-sm shadow-lg">
                {currentZoom}%
            </div>

            {/* Zoom controls */}
            <div className="bg-bg-1 border-stroke flex flex-col rounded-md border shadow-lg">
                <button
                    onClick={handleZoomIn}
                    className="text-text hover:bg-bg-2 hover:text-accent flex items-center justify-center p-2 transition-colors duration-150 first:rounded-t-md disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canvas || currentZoom >= getMaxZoom()}
                    title="Zoom In"
                >
                    <Plus size={16} />
                </button>

                <div className="border-stroke border-t" />

                <button
                    onClick={handleResetZoom}
                    className="text-text hover:bg-bg-2 hover:text-accent flex items-center justify-center p-2 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canvas}
                    title="Reset Zoom"
                >
                    <House size={16} />
                </button>

                <div className="border-stroke border-t" />

                <button
                    onClick={handleZoomOut}
                    className="text-text hover:bg-bg-2 hover:text-accent flex items-center justify-center p-2 transition-colors duration-150 last:rounded-b-md disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canvas || currentZoom <= getMinZoom()}
                    title="Zoom Out"
                >
                    <Minus size={16} />
                </button>
            </div>
        </div>
    );
}

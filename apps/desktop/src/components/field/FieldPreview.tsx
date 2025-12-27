import { useCallback, useEffect, useRef } from "react";
import { FieldProperties } from "@openmarch/core";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { defaultSettings } from "@/stores/UiSettingsStore";

interface FieldPreviewProps {
    fieldProperties: FieldProperties;
    className?: string;
    disableBackground?: boolean;
}

export default function FieldPreview({
    fieldProperties,
    className = "",
    disableBackground = false,
}: FieldPreviewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const canvasInstanceRef = useRef<OpenMarchCanvas | null>(null);

    const updateCanvas = useCallback(() => {
        const container = containerRef.current;
        const canvas = canvasInstanceRef.current;
        if (!container || !canvas) return;

        // Use client dimensions to avoid resize loops from borders
        const width = container.clientWidth || 600;
        const height = container.clientHeight || 400;

        if (canvas.getWidth() !== width || canvas.getHeight() !== height) {
            canvas.setWidth(width);
            canvas.setHeight(height);
        }

        // Zoom to fit 80% of container (increased padding)
        const fieldWidth = fieldProperties.width;
        const fieldHeight = fieldProperties.height;
        const zoom = Math.min(
            (width * 0.8) / fieldWidth,
            (height * 0.8) / fieldHeight,
        );

        // Center content
        const scaledWidth = fieldWidth * zoom;
        const scaledHeight = fieldHeight * zoom;
        const offsetX = (width - scaledWidth) / 2;
        const offsetY = (height - scaledHeight) / 2;

        canvas.setViewportTransform([zoom, 0, 0, zoom, offsetX, offsetY]);
        canvas.renderAll();
    }, [fieldProperties]);

    useEffect(() => {
        if (!canvasRef.current || !containerRef.current) return;

        // Skip interactive PanZoom setup with isGeneratingSVG=true
        const previewCanvas = new OpenMarchCanvas({
            canvasRef: canvasRef.current,
            fieldProperties,
            uiSettings: defaultSettings,
            isGeneratingSVG: true,
        });

        // Disable interactivity for static preview
        previewCanvas.selection = false;
        previewCanvas.hoverCursor = "default";
        previewCanvas.defaultCursor = "default";
        previewCanvas.skipTargetFind = true;
        previewCanvas.renderOnAddRemove = false;

        // Try loading background only if enabled
        if (!disableBackground) {
            // ignore DB errors during wizard setup
            void previewCanvas.refreshBackgroundImage().catch(() => {});
        }

        // Prevent default window resize listener from resizing canvas
        const onWindowResize = (previewCanvas as any)._onWindowResize;
        if (onWindowResize) {
            window.removeEventListener("resize", onWindowResize);
        }

        canvasInstanceRef.current = previewCanvas;

        updateCanvas();

        const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(updateCanvas);
        });

        resizeObserver.observe(containerRef.current);
        window.addEventListener("resize", updateCanvas);

        return () => {
            window.removeEventListener("resize", updateCanvas);
            resizeObserver.disconnect();
            if (canvasInstanceRef.current) {
                try {
                    canvasInstanceRef.current.dispose();
                } catch (error) {
                    console.warn("Error disposing preview canvas:", error);
                }
                canvasInstanceRef.current = null;
            }
        };
    }, [fieldProperties, disableBackground, updateCanvas]);

    return (
        <div
            ref={containerRef}
            // pointer-events-none disables interaction (scrolling/panning)
            className={`rounded-12 border-stroke bg-bg-1 pointer-events-none relative overflow-hidden border ${className}`}
            style={{ maxHeight: "400px" }}
        >
            <canvas ref={canvasRef} style={{ display: "block" }} />
        </div>
    );
}

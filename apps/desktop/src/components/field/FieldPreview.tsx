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

        const width = container.clientWidth || 600;
        const height = container.clientHeight || 400;

        if (canvas.getWidth() !== width || canvas.getHeight() !== height) {
            canvas.setWidth(width);
            canvas.setHeight(height);
        }

        const fieldWidth = fieldProperties.width;
        const fieldHeight = fieldProperties.height;
        const zoom = Math.min(
            (width * 0.8) / fieldWidth,
            (height * 0.8) / fieldHeight,
        );

        const scaledWidth = fieldWidth * zoom;
        const scaledHeight = fieldHeight * zoom;
        const offsetX = (width - scaledWidth) / 2;
        const offsetY = (height - scaledHeight) / 2;

        canvas.setViewportTransform([zoom, 0, 0, zoom, offsetX, offsetY]);
        canvas.renderAll();
    }, [fieldProperties]);

    useEffect(() => {
        if (!canvasRef.current || !containerRef.current) return;

        const previewCanvas = new OpenMarchCanvas({
            canvasRef: canvasRef.current,
            fieldProperties,
            uiSettings: defaultSettings,
            isGeneratingSVG: true,
        });

        previewCanvas.selection = false;
        previewCanvas.hoverCursor = "default";
        previewCanvas.defaultCursor = "default";
        previewCanvas.skipTargetFind = true;
        previewCanvas.renderOnAddRemove = false;

        if (!disableBackground) {
            void previewCanvas.refreshBackgroundImage().catch(() => {});
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
            className={`rounded-12 border-stroke bg-bg-1 pointer-events-none relative overflow-hidden border ${className}`}
            style={{ maxHeight: "400px" }}
        >
            <canvas ref={canvasRef} style={{ display: "block" }} />
        </div>
    );
}

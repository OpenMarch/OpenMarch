import { useCallback, useEffect, useRef, useState } from "react";
import {
    drawBranding,
    drawOverlay,
    loadBrandingLogo,
    OverlayOptions,
    OverlayPlacement,
    OverlayRect,
    OverlayState,
} from "./videoOverlay";

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const MIN_WIDTH_FRACTION = 0.12;
const HANDLE_RADIUS = 5;
const HANDLE_HIT_RADIUS = 12;

type DragMode = "move" | "width" | "scale";

interface DragContext {
    mode: DragMode;
    /** Pointer offset from the box origin when the drag started */
    offsetX: number;
    offsetY: number;
    startRect: OverlayRect;
    startScale: number;
}

/**
 * WYSIWYG preview of the video overlay. Renders with the same draw functions
 * as the export itself on a mock field, so what the user sees is exactly
 * what ends up in the video.
 *
 * - Drag the box to move it
 * - Drag the right-edge handle to change the width (controls row wrapping,
 *   wide enough collapses everything onto a single row)
 * - Drag the corner handle to make it bigger or smaller
 */
// eslint-disable-next-line max-lines-per-function
export default function OverlayPreview({
    state,
    options,
    placement,
    onPlacementChange,
}: {
    state: OverlayState;
    options: OverlayOptions;
    placement: OverlayPlacement;
    onPlacementChange: (placement: OverlayPlacement) => void;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rectRef = useRef<OverlayRect | null>(null);
    const dragRef = useRef<DragContext | null>(null);
    const [logo, setLogo] = useState<HTMLImageElement | null>(null);

    useEffect(() => {
        void loadBrandingLogo().then(setLogo);
    }, []);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (width === 0 || height === 0) return;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Mock field background with yard lines
        ctx.fillStyle = "#1d2a1d";
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 1;
        for (let i = 1; i < 10; i++) {
            const x = (width / 10) * i;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        rectRef.current = drawOverlay(
            ctx,
            state,
            options,
            placement,
            width,
            height,
        );
        drawBranding(ctx, logo, width, height);

        // Resize handles
        const rect = rectRef.current;
        if (rect) {
            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
            ctx.lineWidth = 1.5;
            const handles = [
                [rect.x + rect.width, rect.y + rect.height / 2],
                [rect.x + rect.width, rect.y + rect.height],
            ];
            for (const [hx, hy] of handles) {
                ctx.beginPath();
                ctx.arc(hx, hy, HANDLE_RADIUS, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
        }
    }, [state, options, placement, logo]);

    useEffect(() => {
        draw();
        const canvas = canvasRef.current;
        if (!canvas) return;
        const observer = new ResizeObserver(draw);
        observer.observe(canvas);
        return () => observer.disconnect();
    }, [draw]);

    const hitTest = useCallback((x: number, y: number): DragMode | null => {
        const rect = rectRef.current;
        if (!rect) return null;
        const near = (hx: number, hy: number) =>
            Math.hypot(x - hx, y - hy) <= HANDLE_HIT_RADIUS;
        if (near(rect.x + rect.width, rect.y + rect.height)) return "scale";
        if (near(rect.x + rect.width, rect.y + rect.height / 2)) return "width";
        if (
            x >= rect.x &&
            x <= rect.x + rect.width &&
            y >= rect.y &&
            y <= rect.y + rect.height
        )
            return "move";
        return null;
    }, []);

    const pointerPosition = (event: React.PointerEvent) => {
        const bounds = canvasRef.current!.getBoundingClientRect();
        return {
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top,
        };
    };

    const handlePointerDown = (event: React.PointerEvent) => {
        const { x, y } = pointerPosition(event);
        const mode = hitTest(x, y);
        const rect = rectRef.current;
        if (!mode || !rect) return;
        dragRef.current = {
            mode,
            offsetX: x - rect.x,
            offsetY: y - rect.y,
            startRect: rect,
            startScale: placement.scale,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: React.PointerEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const { x, y } = pointerPosition(event);
        const drag = dragRef.current;

        if (!drag) {
            const mode = hitTest(x, y);
            canvas.style.cursor =
                mode === "move"
                    ? "grab"
                    : mode === "width"
                      ? "ew-resize"
                      : mode === "scale"
                        ? "nwse-resize"
                        : "default";
            return;
        }

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (drag.mode === "move") {
            canvas.style.cursor = "grabbing";
            onPlacementChange({
                ...placement,
                x: Math.min(Math.max((x - drag.offsetX) / width, 0), 1),
                y: Math.min(Math.max((y - drag.offsetY) / height, 0), 1),
            });
        } else if (drag.mode === "width") {
            onPlacementChange({
                ...placement,
                widthFraction: Math.min(
                    Math.max(
                        (x - drag.startRect.x) / width,
                        MIN_WIDTH_FRACTION,
                    ),
                    1,
                ),
            });
        } else {
            const ratio = (y - drag.startRect.y) / drag.startRect.height;
            onPlacementChange({
                ...placement,
                scale: Math.min(
                    Math.max(drag.startScale * ratio, MIN_SCALE),
                    MAX_SCALE,
                ),
            });
        }
    };

    const handlePointerUp = (event: React.PointerEvent) => {
        dragRef.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
    };

    return (
        <canvas
            ref={canvasRef}
            className="rounded-6 border-stroke aspect-video w-full touch-none border"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
        />
    );
}

import {
    type Dispatch,
    type SetStateAction,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import {
    loadBrandingLogo,
    OverlayOptions,
    OverlayPlacement,
    OverlayRect,
    OverlayState,
} from "./videoOverlay";
import {
    clampFieldFraming,
    renderVideoFrame,
    type FieldFraming,
    type VideoRenderContext,
} from "./videoFrameRenderer";
import { getVideoThemeColors, type VideoTheme } from "./videoTheme";

const MIN_OVERLAY_SCALE = 0.5;
const MAX_OVERLAY_SCALE = 3;
const MIN_WIDTH_FRACTION = 0.12;
const HANDLE_RADIUS = 5;
const HANDLE_HIT_RADIUS = 12;
const WHEEL_ZOOM_FACTOR = 1.05;

type DragMode = "move" | "width" | "scale" | "fieldPan";

interface DragContext {
    mode: DragMode;
    /** Pointer offset from the box origin when the overlay drag started */
    offsetX: number;
    offsetY: number;
    startRect: OverlayRect;
    startScale: number;
    /** Last pointer position for field pan */
    lastX: number;
    lastY: number;
}

/**
 * WYSIWYG preview of the video export frame. Renders the real field and
 * overlay with the same draw functions as export.
 *
 * - Drag the overlay box to move it; side/corner handles resize it
 * - Drag empty canvas to pan the field; scroll wheel to zoom the field
 */
// eslint-disable-next-line max-lines-per-function
export default function OverlayPreview({
    state,
    options,
    placement,
    onPlacementChange,
    videoTheme,
    fieldRenderContext,
    fieldFraming,
    onFieldFramingChange,
    previewTimeSeconds,
    durationSeconds,
    isLoading = false,
    loadingLabel,
}: {
    state: OverlayState;
    options: OverlayOptions;
    placement: OverlayPlacement;
    onPlacementChange: (placement: OverlayPlacement) => void;
    videoTheme: VideoTheme;
    fieldRenderContext: VideoRenderContext | null;
    fieldFraming: FieldFraming;
    onFieldFramingChange: Dispatch<SetStateAction<FieldFraming>>;
    previewTimeSeconds: number;
    durationSeconds: number;
    isLoading?: boolean;
    loadingLabel?: string;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rectRef = useRef<OverlayRect | null>(null);
    const dragRef = useRef<DragContext | null>(null);
    const [logo, setLogo] = useState<HTMLImageElement | null>(null);

    useEffect(() => {
        void loadBrandingLogo(videoTheme).then(setLogo);
    }, [videoTheme]);

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

        const colors = getVideoThemeColors(videoTheme);
        ctx.fillStyle = colors.bg1;
        ctx.fillRect(0, 0, width, height);

        if (fieldRenderContext && !isLoading) {
            rectRef.current = renderVideoFrame({
                ctx,
                context: fieldRenderContext,
                timeSeconds: previewTimeSeconds,
                durationSeconds,
                width,
                height,
                videoTheme,
                fieldFraming,
                overlayState: state,
                overlayOptions: options,
                overlayPlacement: placement,
                brandingLogo: logo,
            });
        } else {
            rectRef.current = null;
            if (loadingLabel) {
                ctx.fillStyle = colors.overlayText;
                ctx.font = "14px system-ui, sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(loadingLabel, width / 2, height / 2);
            }
        }

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
    }, [
        state,
        options,
        placement,
        logo,
        videoTheme,
        fieldRenderContext,
        fieldFraming,
        previewTimeSeconds,
        durationSeconds,
        isLoading,
        loadingLabel,
    ]);

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

        if (mode && rect) {
            dragRef.current = {
                mode,
                offsetX: x - rect.x,
                offsetY: y - rect.y,
                startRect: rect,
                startScale: placement.scale,
                lastX: x,
                lastY: y,
            };
        } else if (fieldRenderContext && !isLoading) {
            dragRef.current = {
                mode: "fieldPan",
                offsetX: 0,
                offsetY: 0,
                startRect: rect ?? { x: 0, y: 0, width: 0, height: 0 },
                startScale: placement.scale,
                lastX: x,
                lastY: y,
            };
        } else {
            return;
        }
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
                        : fieldRenderContext && !isLoading
                          ? "grab"
                          : "default";
            return;
        }

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (drag.mode === "fieldPan") {
            const dx = x - drag.lastX;
            const dy = y - drag.lastY;
            drag.lastX = x;
            drag.lastY = y;
            canvas.style.cursor = "grabbing";
            onFieldFramingChange((current) =>
                clampFieldFraming({
                    ...current,
                    offsetX: current.offsetX + dx / width,
                    offsetY: current.offsetY + dy / height,
                }),
            );
        } else if (drag.mode === "move") {
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
                    Math.max(drag.startScale * ratio, MIN_OVERLAY_SCALE),
                    MAX_OVERLAY_SCALE,
                ),
            });
        }
    };

    const handlePointerUp = (event: React.PointerEvent) => {
        dragRef.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleWheel = (event: WheelEvent) => {
            if (!fieldRenderContext || isLoading) return;
            event.preventDefault();
            event.stopPropagation();
            const factor =
                event.deltaY > 0 ? 1 / WHEEL_ZOOM_FACTOR : WHEEL_ZOOM_FACTOR;
            onFieldFramingChange((current) =>
                clampFieldFraming({
                    ...current,
                    scale: current.scale * factor,
                }),
            );
        };

        canvas.addEventListener("wheel", handleWheel, { passive: false });
        return () => canvas.removeEventListener("wheel", handleWheel);
    }, [fieldRenderContext, isLoading, onFieldFramingChange]);

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

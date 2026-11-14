import React, { useState, useEffect, useRef } from "react";
import clsx from "clsx";
import { PlusIcon, MinusIcon } from "@phosphor-icons/react";
import { Slider } from "@openmarch/ui";
import { useTranslate } from "@tolgee/react";
import { MAX_ZOOM, MIN_ZOOM } from "@/field/editor/view";
import { useIsTouchMode } from "@/stores/InputModeStore";
import {
    fieldLayersIn,
    LAYER_GAP,
    liftClear,
    noteFieldLayersChanged,
    subscribeFieldLayers,
    ZOOM_AVOIDS,
    ZOOM_RISING_AVOIDS,
} from "./fieldLayers";

/**
 * In the touch layout, how far the zoom box rises to keep off a card or bar that holds the current
 * task's buttons (#927): `0` where it usually sits, `null` hidden when there's no room above them.
 * Desktop: always 0.
 */
function useZoomLift(box: React.RefObject<HTMLDivElement | null>) {
    const touch = useIsTouchMode();
    const [lift, setLift] = useState<number | null>(0);
    const current = useRef<number | null>(0);
    useEffect(() => {
        if (!touch) {
            current.current = 0;
            setLift(0);
            return;
        }
        const place = () => {
            const el = box.current;
            const parent = el?.offsetParent;
            if (!el || !parent) return;
            const at = parent.getBoundingClientRect();
            const r = el.getBoundingClientRect();
            // Where it usually sits: where it is, less the lift it has now (hidden counts as none)
            const usual = {
                left: r.left - at.left,
                top: r.top - at.top + (current.current ?? 0),
                width: r.width,
                height: r.height,
            };
            let next = liftClear(
                usual,
                fieldLayersIn(parent, ZOOM_AVOIDS, el),
                LAYER_GAP,
            );
            // Rising: not up under the Inspector's tab either
            if (next !== 0)
                next = liftClear(
                    usual,
                    fieldLayersIn(parent, ZOOM_RISING_AVOIDS, el),
                    LAYER_GAP,
                );
            if (next === current.current) return;
            current.current = next;
            setLift(next);
            // The pill keeps off the zoom box: it moved
            noteFieldLayersChanged();
        };
        place();
        const off = subscribeFieldLayers(place);
        window.addEventListener("resize", place);
        // The field area resizing (the Inspector opening, the timeline split moving) moves it
        const area = box.current?.offsetParent;
        const observer =
            area && typeof ResizeObserver === "function"
                ? new ResizeObserver(place)
                : null;
        if (area) observer?.observe(area);
        return () => {
            off();
            window.removeEventListener("resize", place);
            observer?.disconnect();
        };
    }, [touch, box]);
    return lift;
}

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
    const { t } = useTranslate();
    const [currentZoom, setCurrentZoom] = useState(100); // Represents percentage
    const [rawZoom, setRawZoom] = useState(1); // Raw field zoom, for the slider
    const boxRef = useRef<HTMLDivElement>(null);
    const lift = useZoomLift(boxRef);

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

    return (
        <div
            ref={boxRef}
            data-zoom-controls
            // #927: the pill and the shape editor bar keep off it; it keeps off the task's cards
            data-field-layer="control"
            data-lift={lift ?? "hidden"}
            className={clsx(
                "group border-stroke bg-bg-1 rounded-8 touch:w-auto pointer-events-auto absolute right-6 bottom-6 z-10 flex w-160 flex-col overflow-hidden border shadow-lg",
                lift === null && "invisible",
            )}
            style={lift ? { bottom: 6 + lift } : undefined}
        >
            <div className="border-stroke flex items-center border-b px-12 py-2">
                <Slider
                    aria-label={t("canvas.zoom.group")}
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
                {/* Zoom Out Button */}
                <button
                    onClick={handleZoomOut}
                    className="border-stroke text-text touch:min-h-48 touch:min-w-48 flex w-full items-center justify-center p-2 transition-colors duration-150 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canvas || currentZoom <= getMinZoom()}
                    title={t("canvas.zoom.out")}
                >
                    <MinusIcon
                        size={18}
                        weight="bold"
                        className="touch:size-24"
                    />
                </button>

                {/* Zoom Percentage Display and Reset Button */}
                <button
                    onClick={handleResetZoomAndCenter}
                    className="border-stroke bg-fg-2 text-text touch:min-h-48 touch:min-w-72 flex h-full w-full items-center justify-center border-r border-l px-3 py-4 font-mono text-sm transition-colors duration-150 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canvas}
                    title={t("canvas.zoom.resetAndCenter")}
                    aria-label={t("canvas.zoom.reset", { zoom: currentZoom })}
                >
                    {currentZoom}%
                </button>

                {/* Zoom In Button */}
                <button
                    onClick={handleZoomIn}
                    className="border-stroke text-text touch:min-h-48 touch:min-w-48 flex w-full items-center justify-center border-l p-2 transition-colors duration-150 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canvas || currentZoom >= getMaxZoom()}
                    title={t("canvas.zoom.in")}
                >
                    <PlusIcon
                        size={18}
                        weight="bold"
                        className="touch:size-24"
                    />
                </button>
            </div>
        </div>
    );
}

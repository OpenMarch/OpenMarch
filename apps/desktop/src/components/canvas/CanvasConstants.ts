import { IGroupOptions } from "fabric/fabric-impl";

/**
 * Options for the background image on the canvas.
 */
export const NoControls: IGroupOptions = {
    hasControls: false,
    hasBorders: false,
    lockMovementX: true,
    lockMovementY: true,
    lockRotation: true,
    selectable: false,
    hoverCursor: "default",
    evented: false,
} as const;

export const HasControls: IGroupOptions = {
    hasControls: true,
    hasBorders: true,
    lockMovementX: false,
    lockMovementY: false,
    lockRotation: false,
    selectable: true,
    hoverCursor: "pointer",
    evented: true,
} as const;

/**
 * Options for the active object on the canvas.
 * If this is changed here, it must also be changed in the handleSelect function in Canvas.tsx.
 */
export const ActiveObjectArgs: IGroupOptions = {
    hasControls: false,
    hasBorders: true,
    lockRotation: true,
    borderColor: "#0d6efd",
    borderScaleFactor: 2,
} as const;

/**
 * Lowest and highest Fabric zoom on the field (1 = one canvas unit per CSS pixel).
 * Every way of zooming (wheel, trackpad, pinch, zoom buttons) stays inside these.
 */
export const CANVAS_ZOOM_LIMITS = { min: 0.2, max: 25 } as const;

/** Keeps a Fabric zoom inside CANVAS_ZOOM_LIMITS */
export const clampCanvasZoom = (zoom: number): number =>
    Math.max(CANVAS_ZOOM_LIMITS.min, Math.min(CANVAS_ZOOM_LIMITS.max, zoom));

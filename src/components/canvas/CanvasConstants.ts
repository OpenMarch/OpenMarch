import { IGroupOptions } from "fabric/fabric-impl";

/**
 * The colors for the canvas.
 */
export const CanvasColors = {
    previousPage: "rgba(0, 0, 0, 1)",
    nextPage: "rgba(0, 175, 13, 1)",
    shape: "rgba(126, 34, 206, 1)",
    tempPath: "rgba(192,132,252, 1)",
} as const;

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

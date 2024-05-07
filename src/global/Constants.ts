import { IGroupOptions } from "fabric/fabric-impl";

export const Constants = {
    PageTableName: "pages",
    MarcherTableName: "marchers",
    MarcherPageTableName: "marcher_pages",
    UndoHistoryTableName: "history_undo",
    RedoHistoryTableName: "history_redo",
    FieldPropertiesTableName: "field_properties",

    PagePrefix: "page",
    NewPageId: "NEW_PAGE", // deprecated?
    MarcherPrefix: "marcher",
    MarcherPagePrefix: "mp",
    dotRadius: 5, //deprecated?
} as const;

/**
 * The colors for the canvas.
 */
export const CanvasColors = {
    previousPage: 'rgba(0, 0, 0, 1)',
    nextPage: 'rgba(0, 175, 13, 1)',
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

/**
 * Options for the active object on the canvas.
 * If this is changed here, it must also be changed in the handleSelect function in Canvas.tsx.
 */
export const ActiveObjectArgs: IGroupOptions = {
    hasControls: false,
    hasBorders: true,
    lockRotation: true,
    borderColor: '#0d6efd',
    borderScaleFactor: 2,
} as const;

export default Constants;


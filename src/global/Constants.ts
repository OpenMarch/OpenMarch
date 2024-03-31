import { IGroupOptions } from "fabric/fabric-impl";
export const Constants = {
    PageTableName: "pages",
    MarcherTableName: "marchers",
    MarcherPageTableName: "marcher_pages",
    UndoHistoryTableName: "history_undo",
    RedoHistoryTableName: "history_redo",
    FieldPropertiesTableName: "field_properties",

    PagePrefix: "page",
    NewPageId: "NEW_PAGE",
    MarcherPrefix: "marcher",
    MarcherPagePrefix: "mp",
    dotRadius: 5,
} as const;

export const CanvasColors = {
    previousPage: 'rgba(0, 0, 0, 1)',
    nextPage: 'rgba(0, 175, 13, 1)',
} as const;

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

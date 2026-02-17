/**
 * Shared types for column mapping and header detection.
 * Split out to avoid circular dependency between columns.ts and headerDetection.ts.
 */

export type TextItem = {
    str: string;
    x: number;
    y: number;
    w: number;
    h: number;
};

export type ColumnBand = {
    key: "setId" | "measureRange" | "counts" | "lateralText" | "fbText";
    label: string;
    x1: number;
    x2: number;
};

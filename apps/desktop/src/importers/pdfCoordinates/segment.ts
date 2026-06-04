import type { Quadrant } from "./types";

export type Rect = { x: number; y: number; width: number; height: number };

export function getQuadrantRects(
    pageWidth: number,
    pageHeight: number,
    gutter = 8,
): Record<Quadrant, Rect> {
    const halfW = pageWidth / 2;
    const halfH = pageHeight / 2;
    return {
        TL: {
            x: 0 + gutter,
            y: 0 + gutter,
            width: halfW - gutter * 2,
            height: halfH - gutter * 2,
        },
        TR: {
            x: halfW + gutter,
            y: 0 + gutter,
            width: halfW - gutter * 2,
            height: halfH - gutter * 2,
        },
        BL: {
            x: 0 + gutter,
            y: halfH + gutter,
            width: halfW - gutter * 2,
            height: halfH - gutter * 2,
        },
        BR: {
            x: halfW + gutter,
            y: halfH + gutter,
            width: halfW - gutter * 2,
            height: halfH - gutter * 2,
        },
    };
}

export function rectContains(r: Rect, x: number, y: number) {
    return x >= r.x && y >= r.y && x <= r.x + r.width && y <= r.y + r.height;
}

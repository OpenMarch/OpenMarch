import { pivotPoint, type PivotKey, type ShapeFrame } from "../frame/frame";
import type { XY } from "../types";

/**
 * Flipping a plain selection, one that isn't a shape (#349): the marchers' positions change and
 * nothing else, no recipe. Turning one goes through the editor's `rotateSelection`, as the
 * rotate handle does, around the same pivot. Its frame is the box around them, square to the field, so
 * the Transform section's pivot grid means the same as on a shape. Everything here is pure.
 */

/** The box around `points`, square to the field; null with none */
export function selectionFrame(points: readonly XY[]): ShapeFrame | null {
    if (points.length === 0) return null;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    return {
        center: { x: (left + right) / 2, y: (top + bottom) / 2 },
        halfWidth: (right - left) / 2,
        halfDepth: (bottom - top) / 2,
        rotation: 0,
        flipX: false,
        flipY: false,
    };
}

/** Where `pivot` is on the box around `points` */
export function selectionPivot(
    points: readonly XY[],
    pivot: PivotKey,
): XY | null {
    const frame = selectionFrame(points);
    return frame && pivotPoint(frame, pivot);
}

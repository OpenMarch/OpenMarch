import type { FieldPoint } from "./fieldEditor";
import type { DrawnMarchers } from "./hitTest";

/**
 * Selecting an area of the field (#195): which marchers a marquee or a lasso
 * takes, when a lasso closes, and the selection it leaves. Field units
 * throughout, except where a rule is on screen.
 */

/** A rectangle in field units; `left <= right` and `top <= bottom`. */
export type FieldRect = {
    left: number;
    top: number;
    right: number;
    bottom: number;
};

/**
 * A lasso closes, and selects, only when released less than this many screen
 * pixels from where it started: the same on screen at every zoom (rules
 * table: Lasso).
 */
export const LASSO_CLOSE_DISTANCE = 50;

/** The rectangle with corners `a` and `b`, either way round. */
export function rectBetween(a: FieldPoint, b: FieldPoint): FieldRect {
    return {
        left: Math.min(a.x, b.x),
        top: Math.min(a.y, b.y),
        right: Math.max(a.x, b.x),
        bottom: Math.max(a.y, b.y),
    };
}

/**
 * True when releasing a lasso at `end` closes it: less than
 * {@link LASSO_CLOSE_DISTANCE} screen pixels from `start` at `zoom` (CSS px
 * per field unit). Measured in field units times the zoom, so a pan or zoom
 * mid-lasso still measures what's on screen now.
 */
export function lassoCloses(
    start: FieldPoint,
    end: FieldPoint,
    zoom: number,
): boolean {
    return (
        Math.hypot(end.x - start.x, end.y - start.y) * zoom <
        LASSO_CLOSE_DISTANCE
    );
}

/**
 * True when `point` is inside the polygon (even–odd rule, the polygon closed
 * from its last point back to its first). A point exactly on an edge may land
 * either side.
 */
export function pointInPolygon(
    point: FieldPoint,
    polygon: readonly FieldPoint[],
): boolean {
    const { x, y } = point;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i];
        const b = polygon[j];
        // The edge from a to b crosses the horizontal line through the point
        const aAbove = a.y > y;
        const bAbove = b.y > y;
        if (
            aAbove !== bAbove &&
            x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
        )
            inside = !inside;
    }
    return inside;
}

/**
 * The marchers a marquee takes: every one whose dot it touches, with `radius`
 * the dot's reach in field units (its click target, `hitRadius`). Hidden
 * marchers and ones `canSelect` refuses are never taken, as with a click and
 * Ctrl/Cmd+A.
 */
export function marchersInRect(
    marchers: DrawnMarchers,
    rect: FieldRect,
    radius: number,
    canSelect: (id: number) => boolean,
): number[] {
    return selectableWhere(marchers, canSelect, (x, y) => {
        const dx = x - clamp(x, rect.left, rect.right);
        const dy = y - clamp(y, rect.top, rect.bottom);
        return dx * dx + dy * dy <= radius * radius;
    });
}

/**
 * The marchers a closed lasso takes: every one whose center is inside it.
 * Hidden marchers and ones `canSelect` refuses are never taken.
 */
export function marchersInPolygon(
    marchers: DrawnMarchers,
    polygon: readonly FieldPoint[],
    canSelect: (id: number) => boolean,
): number[] {
    return selectableWhere(marchers, canSelect, (x, y) =>
        pointInPolygon({ x, y }, polygon),
    );
}

/** The selection an area leaves: it replaces the selection, or with Shift adds to it. */
export function selectionAfterArea(
    current: readonly number[],
    inside: readonly number[],
    shift: boolean,
): readonly number[] {
    if (!shift) return inside;
    const selected = new Set(current);
    const added = inside.filter((id) => !selected.has(id));
    return added.length ? [...current, ...added] : current;
}

function selectableWhere(
    marchers: DrawnMarchers,
    canSelect: (id: number) => boolean,
    inside: (x: number, y: number) => boolean,
): number[] {
    const { ids, positions, hidden } = marchers;
    const taken: number[] = [];
    for (let i = 0; i < ids.length; i++) {
        if (hidden?.[i]) continue;
        if (!inside(positions[i * 2], positions[i * 2 + 1])) continue;
        if (canSelect(ids[i])) taken.push(ids[i]);
    }
    return taken;
}

const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

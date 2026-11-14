import type { AreaChoice } from "@/input/modifierRoles";
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
 * A finger or pen lasso closes when released less than this many screen pixels from where it
 * started (#933, owner): a fingertip hides where the line began.
 */
export const FINGER_LASSO_CLOSE_DISTANCE = 150;

/**
 * A finger or pen lasso that ends farther away still closes when the path, closed back to its
 * start, takes in a real area (#933, owner): at least a touch target's square (44 × 44 screen px),
 * and round enough, not a sliver (`4πA / P²`, 1 for a circle and 0 for a line, at least this).
 */
const FINGER_LASSO_MIN_AREA = 44 * 44;
const FINGER_LASSO_MIN_ROUNDNESS = 0.2;

/**
 * True when releasing a finger's or pen's lasso drawn through `points` closes it (#933, owner):
 * it ends within {@link FINGER_LASSO_CLOSE_DISTANCE} screen px of its start, or the path closed
 * back to its start takes in a real area. A long straight swipe does neither, and changes nothing.
 * Field units times the zoom, as {@link lassoCloses}.
 */
export function fingerLassoCloses(
    points: readonly FieldPoint[],
    zoom: number,
): boolean {
    if (points.length < 2) return false;
    const start = points[0];
    const end = points[points.length - 1];
    if (
        Math.hypot(end.x - start.x, end.y - start.y) * zoom <
        FINGER_LASSO_CLOSE_DISTANCE
    )
        return true;
    // Shoelace area and perimeter of the closed path, in screen px
    let twiceArea = 0;
    let perimeter = 0;
    for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        twiceArea += a.x * b.y - b.x * a.y;
        perimeter += Math.hypot(b.x - a.x, b.y - a.y);
    }
    const area = (Math.abs(twiceArea) / 2) * zoom * zoom;
    perimeter *= zoom;
    return (
        area >= FINGER_LASSO_MIN_AREA &&
        (4 * Math.PI * area) / (perimeter * perimeter) >=
            FINGER_LASSO_MIN_ROUNDNESS
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

/**
 * The marchers an area selects of those `inside` it: performers only when there are any, as
 * select-all does, so a marquee across a formation on a riser doesn't take the riser along; the
 * items (props and equipment, C2.2) when the area holds nothing else.
 */
export function areaPicks(
    inside: readonly number[],
    isItem: (id: number) => boolean,
): readonly number[] {
    const performers = inside.filter((id) => !isItem(id));
    return performers.length > 0 ? performers : inside;
}

/**
 * The selection an area leaves: it replaces the selection, or with the press's choice adds to it
 * (Shift) or removes from it (Alt). Marchers one by one, placed boxes or not.
 */
export function selectionAfterArea(
    current: readonly number[],
    inside: readonly number[],
    choice: AreaChoice,
): readonly number[] {
    if (choice === null) return inside;
    if (choice === "subtract") {
        const covered = new Set(inside);
        const kept = current.filter((id) => !covered.has(id));
        return kept.length < current.length ? kept : current;
    }
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

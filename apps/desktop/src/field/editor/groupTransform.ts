// cspell:ignore nesw
import type { FieldTestHandle } from "@/field/fieldTestApi";
import type { FieldPoint } from "./fieldEditor";
import type { MarcherPosition } from "./moveGesture";
import type { FieldRect } from "./selectionArea";

/**
 * Scaling and rotating a selection with the selection box's handles (#198,
 * #189 user stories 46 to 55; rules table: Handles, Shift, Alt). Pure, in
 * field units except where a rule is on screen. Only positions change: dots
 * and labels are drawn upright and the same size wherever they go.
 */

/** A handle on the selection box: corners and middles scale, `rot` rotates. */
export type HandleId = FieldTestHandle;

/** A handle is a square this many CSS px across, and a press inside it takes it. */
export const HANDLE_SIZE = 13;
/** How far above the box's top middle the rotate handle sits, in CSS px. */
export const ROTATE_HANDLE_OFFSET = 40;
/** Rotation snaps to multiples of this many degrees unless Shift or Alt is down. */
export const ROTATION_SNAP = 15;
/**
 * The smallest a handle scales the formation to. A handle dragged past the
 * opposite side stops here instead of flipping it (user story 52).
 */
export const MIN_SCALE = 0.01;

/** The box's center: what rotation turns about. */
export const centerOf = (box: FieldRect): FieldPoint => ({
    x: (box.left + box.right) / 2,
    y: (box.top + box.bottom) / 2,
});

/** The bounds of `positions`, or null with none. */
export function boundsOf(
    positions: readonly { x: number; y: number }[],
): FieldRect | null {
    if (positions.length === 0) return null;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const { x, y } of positions) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
    }
    return { left, top, right, bottom };
}

/**
 * The selection box as drawn: around the marchers' centers (`box`), `pad`
 * further out, turned `angle` degrees about its center (only while a rotation
 * is being dragged; the box fits the marchers again after it).
 */
export type SelectionFrame = { box: FieldRect; pad: number; angle: number };

/** Where each handle is drawn, in field units, at `zoom` (CSS px per field unit). */
export function handlePoints(
    { box, pad, angle }: SelectionFrame,
    zoom: number,
): Record<HandleId, FieldPoint> {
    const left = box.left - pad;
    const right = box.right + pad;
    const top = box.top - pad;
    const bottom = box.bottom + pad;
    const center = centerOf(box);
    const turn = (x: number, y: number) => rotatePoint({ x, y }, center, angle);
    return {
        nw: turn(left, top),
        n: turn(center.x, top),
        ne: turn(right, top),
        e: turn(right, center.y),
        se: turn(right, bottom),
        s: turn(center.x, bottom),
        sw: turn(left, bottom),
        w: turn(left, center.y),
        rot: turn(center.x, top - ROTATE_HANDLE_OFFSET / zoom),
    };
}

/**
 * The handle a press at `point` lands on: inside its {@link HANDLE_SIZE}
 * square on screen, the nearest when squares overlap (a small box). Null
 * when it misses them all.
 */
export function handleAt(
    handles: Record<HandleId, FieldPoint>,
    point: FieldPoint,
    zoom: number,
): HandleId | null {
    const reach = HANDLE_SIZE / 2 / zoom;
    let found: HandleId | null = null;
    let nearest = Infinity;
    for (const [id, at] of Object.entries(handles) as [
        HandleId,
        FieldPoint,
    ][]) {
        const dx = Math.abs(point.x - at.x);
        const dy = Math.abs(point.y - at.y);
        if (dx > reach || dy > reach) continue;
        const distance = Math.hypot(dx, dy);
        if (distance < nearest) {
            nearest = distance;
            found = id;
        }
    }
    return found;
}

/** The cursor over a handle: a resize arrow along its axis, a crosshair to rotate. */
export function handleCursor(handle: HandleId) {
    switch (handle) {
        case "nw":
        case "se":
            return "nwse-resize";
        case "ne":
        case "sw":
            return "nesw-resize";
        case "n":
        case "s":
            return "ns-resize";
        case "e":
        case "w":
            return "ew-resize";
        case "rot":
            return "crosshair";
    }
}

/** How a scale handle scales: by `x` and `y` about `anchor`. */
export type Scale = { anchor: FieldPoint; x: number; y: number };

/** Which way each scale handle faces: -1 left or up, 1 right or down, 0 along. */
const FACING: Record<Exclude<HandleId, "rot">, FieldPoint> = {
    nw: { x: -1, y: -1 },
    n: { x: 0, y: -1 },
    ne: { x: 1, y: -1 },
    e: { x: 1, y: 0 },
    se: { x: 1, y: 1 },
    s: { x: 0, y: 1 },
    sw: { x: -1, y: 1 },
    w: { x: -1, y: 0 },
};

/**
 * The scale a handle's drag gives, for the marchers' bounds `box` and the
 * drag's `delta` in field units. The handle's opposite side or corner stays
 * put (`anchor`), and the handle's side moves with the pointer:
 *
 * - a middle handle scales its own axis only, Shift or not (user story 49);
 * - a corner scales both axes by the same amount, the pointer's progress
 *   along the corner's diagonal, unless `free` (Shift), when each axis
 *   follows the pointer (user story 48);
 * - neither axis goes below {@link MIN_SCALE}: no flipping (user story 52).
 *
 * An axis the marchers have no extent along (all in one row) can't scale.
 */
export function scaleFor(
    handle: Exclude<HandleId, "rot">,
    box: FieldRect,
    delta: FieldPoint,
    free: boolean,
): Scale {
    const facing = FACING[handle];
    const anchor = {
        x: facing.x < 0 ? box.right : box.left,
        y: facing.y < 0 ? box.bottom : box.top,
    };
    // From the anchor to the handle's side, signed
    const reach = {
        x: facing.x * (box.right - box.left),
        y: facing.y * (box.bottom - box.top),
    };
    const along = (extent: number, moved: number) =>
        extent === 0 ? 1 : Math.max(MIN_SCALE, (extent + moved) / extent);

    if (facing.x === 0) return { anchor, x: 1, y: along(reach.y, delta.y) };
    if (facing.y === 0) return { anchor, x: along(reach.x, delta.x), y: 1 };
    if (free)
        return {
            anchor,
            x: along(reach.x, delta.x),
            y: along(reach.y, delta.y),
        };
    const length = reach.x * reach.x + reach.y * reach.y;
    if (length === 0) return { anchor, x: 1, y: 1 };
    // The pointer's progress along the diagonal from the anchor
    const uniform = Math.max(
        MIN_SCALE,
        ((reach.x + delta.x) * reach.x + (reach.y + delta.y) * reach.y) /
            length,
    );
    return { anchor, x: uniform, y: uniform };
}

/**
 * `starts` scaled by `scale`, to three decimal places (as coordinate rounding
 * saves). An axis scaled by 1 is left exactly as it was, so a transform that
 * changes nothing saves nothing.
 */
export function scalePositions(
    starts: readonly MarcherPosition[],
    { anchor, x, y }: Scale,
): MarcherPosition[] {
    return starts.map((start) => ({
        id: start.id,
        x: x === 1 ? start.x : thousandths(anchor.x + (start.x - anchor.x) * x),
        y: y === 1 ? start.y : thousandths(anchor.y + (start.y - anchor.y) * y),
    }));
}

/**
 * How far the pointer turned about `center` from `from` to `to`, in degrees
 * clockwise on screen (y grows down), between -180 and 180. A rotation sums
 * these over its pointer events, so it can turn past half a turn.
 */
export function turnBetween(
    center: FieldPoint,
    from: FieldPoint,
    to: FieldPoint,
): number {
    const degrees =
        ((Math.atan2(to.y - center.y, to.x - center.x) -
            Math.atan2(from.y - center.y, from.x - center.x)) *
            180) /
        Math.PI;
    return degrees > 180
        ? degrees - 360
        : degrees <= -180
          ? degrees + 360
          : degrees;
}

/** `degrees` to the nearest {@link ROTATION_SNAP}, unless `free` (Shift or Alt; user stories 50, 51). */
export const snapRotation = (degrees: number, free: boolean) =>
    free ? degrees : Math.round(degrees / ROTATION_SNAP) * ROTATION_SNAP + 0;

/**
 * `starts` turned `degrees` clockwise about `center`, to three decimal
 * places. Whole turns leave them exactly as they were, so they save nothing.
 */
export function rotatePositions(
    starts: readonly MarcherPosition[],
    center: FieldPoint,
    degrees: number,
): MarcherPosition[] {
    if (degrees % 360 === 0) return starts.map((start) => ({ ...start }));
    return starts.map((start) => {
        const { x, y } = rotatePoint(start, center, degrees);
        return { id: start.id, x: thousandths(x), y: thousandths(y) };
    });
}

/** `point` turned `degrees` clockwise on screen about `center`. */
export function rotatePoint(
    point: FieldPoint,
    center: FieldPoint,
    degrees: number,
): FieldPoint {
    if (degrees === 0) return { x: point.x, y: point.y };
    const radians = (degrees * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
        x: center.x + dx * cos - dy * sin,
        y: center.y + dx * sin + dy * cos,
    };
}

/** `value` to three decimal places, the precision rounding saves; never -0. */
const thousandths = (value: number) => Math.round(value * 1000) / 1000 + 0;

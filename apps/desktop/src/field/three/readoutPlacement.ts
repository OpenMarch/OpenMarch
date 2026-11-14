import {
    clearSpot,
    overlaps,
    type Rect,
} from "@/components/canvas/fieldLayers";

/**
 * Where a readout that follows a touch drag goes (the drag step readout, the held-roles chip):
 * clear of the finger, which covers what's under and just below it. A mouse or pen readout stays
 * beside the pointer as it always was; only a touch press uses this.
 *
 * All values are CSS pixels in the field element. It also keeps off the layers floating over the
 * field (#936: the modifier pill, the Shapes rail, the toolbar panel), which would hide it.
 */

/** From the fingertip up to the readout's bottom edge: clear of a fingertip, as upstream had it */
export const FINGER_CLEARANCE = 64;
/** From the fingertip across to the readout when there's no room above the finger */
export const FINGER_SIDE_CLEARANCE = 44;
/** The readout keeps this far inside the field's edges */
export const READOUT_EDGE = 8;
/** Room kept between the readout and a layer it keeps off */
export const READOUT_LAYER_GAP = 4;
/** Half the width of the finger's column, which the readout never goes over or under */
const FINGER_HALF_WIDTH = 36;

type Size = { readonly width: number; readonly height: number };
type Point = { readonly x: number; readonly y: number };

const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), Math.max(min, max));

/**
 * The top-left of a readout of `size` for a finger at `finger` in a field of `bounds`: centered
 * above the finger, kept inside the field. Near the top, where there's no room above, it sits
 * beside the finger instead (to the right, or the left at the right edge), never under it.
 *
 * Kept off `avoid` too (#936: the layers over the field, the pill and the Shapes rail near its
 * top): above, then beside the finger to the right, then to the left, else the nearest clear spot
 * that keeps off the finger's column; over a layer only when none is clear.
 */
export function touchReadoutPlacement(
    finger: Point,
    size: Size,
    bounds: Size,
    avoid: readonly Rect[] = [],
): { left: number; top: number } {
    const first = plainPlacement(finger, size, bounds);
    if (avoid.length === 0) return first;
    const at = (p: { left: number; top: number }): Rect => ({
        ...p,
        width: size.width,
        height: size.height,
    });
    // The finger and everything below it
    const column: Rect = {
        left: finger.x - FINGER_HALF_WIDTH,
        top: finger.y - FINGER_HALF_WIDTH,
        width: 2 * FINGER_HALF_WIDTH,
        height: bounds.height,
    };
    const blocks = [...avoid, column];
    const clear = (r: Rect) =>
        !blocks.some((b) => overlaps(r, b, READOUT_LAYER_GAP));
    if (!avoid.some((b) => overlaps(at(first), b, READOUT_LAYER_GAP)))
        return first;
    const inside = (left: number, top: number) => ({
        left: clamp(
            left,
            READOUT_EDGE,
            bounds.width - size.width - READOUT_EDGE,
        ),
        top: clamp(
            top,
            READOUT_EDGE,
            bounds.height - size.height - READOUT_EDGE,
        ),
    });
    const above = finger.y - FINGER_CLEARANCE - size.height;
    const besideTop = finger.y - size.height / 2;
    const tries = [
        ...(above >= READOUT_EDGE
            ? [inside(finger.x - size.width / 2, above)]
            : []),
        inside(finger.x + FINGER_SIDE_CLEARANCE, besideTop),
        inside(finger.x - FINGER_SIDE_CLEARANCE - size.width, besideTop),
    ];
    for (const spot of tries) if (clear(at(spot))) return spot;
    const room: Rect = {
        left: READOUT_EDGE,
        top: READOUT_EDGE,
        width: bounds.width - 2 * READOUT_EDGE,
        height: bounds.height - 2 * READOUT_EDGE,
    };
    for (const spot of tries) {
        const moved = clearSpot(at(spot), blocks, room, READOUT_LAYER_GAP);
        if (moved.clear) return { left: moved.left, top: moved.top };
    }
    return first;
}

function plainPlacement(
    finger: Point,
    size: Size,
    bounds: Size,
): { left: number; top: number } {
    const above = finger.y - FINGER_CLEARANCE - size.height;
    if (above >= READOUT_EDGE) {
        return {
            left: clamp(
                finger.x - size.width / 2,
                READOUT_EDGE,
                bounds.width - size.width - READOUT_EDGE,
            ),
            top: above,
        };
    }
    const right = finger.x + FINGER_SIDE_CLEARANCE;
    const left =
        right + size.width <= bounds.width - READOUT_EDGE
            ? right
            : finger.x - FINGER_SIDE_CLEARANCE - size.width;
    return {
        left: clamp(
            left,
            READOUT_EDGE,
            bounds.width - size.width - READOUT_EDGE,
        ),
        top: clamp(
            finger.y - size.height / 2,
            READOUT_EDGE,
            bounds.height - size.height - READOUT_EDGE,
        ),
    };
}

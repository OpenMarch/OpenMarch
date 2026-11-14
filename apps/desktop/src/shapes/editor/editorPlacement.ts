import type { XY } from "../types";
import {
    aroundPoints,
    boxAround,
    clearSpot,
    FINGER_REACH,
    overlapArea,
    rowsAround,
    type Rect,
} from "@/components/canvas/fieldLayers";

/**
 * Where the floating editor goes (#437, owner: predictable motion): under the shape's outline,
 * centered, and above it when there's no room below, kept inside the field side to side. The
 * rotate knob counts as part of the shape top to bottom, so the editor never covers it, even
 * with the shape turned so the knob is underneath (#485). Pure:
 * the hook in `ShapeEditorBar` springs the editor to it.
 */

/** The gap between the shape's outline and the editor, in CSS px */
export const GAP_PX = 14;
/** Room the spots' radius and the handles take beyond the outline */
export const CLEAR_PX = 6;
/** Kept inside the field side to side */
const MARGIN_PX = 4;

export interface PlacementInput {
    /** The shape's outline in the field element's px */
    readonly outline: readonly XY[];
    /** The rotate knob in the field element's px, which the editor mustn't cover */
    readonly knob?: XY;
    /**
     * The shape's handles in the field element's px: those inside the field count as part of the
     * shape, so the editor never covers one (#634)
     */
    readonly handles?: readonly XY[];
    /**
     * The shape's slots in the field element's px: when the editor can only sit on the shape,
     * it keeps off these and the handles (#933)
     */
    readonly spots?: readonly XY[];
    /** The editor's size */
    readonly width: number;
    readonly height: number;
    /** The field element's size */
    readonly fieldWidth: number;
    readonly fieldHeight: number;
}

export interface Placement {
    readonly left: number;
    readonly top: number;
    readonly above: boolean;
}

/** What counts as the shape's extent: its outline, the knob, and its handles inside the field */
function shapeExtent(input: PlacementInput) {
    const { fieldWidth, fieldHeight } = input;
    const xs = input.outline.map((p) => p.x);
    const ys = input.outline.map((p) => p.y);
    if (input.knob) {
        xs.push(input.knob.x);
        ys.push(input.knob.y);
    }
    for (const h of input.handles ?? [])
        if (h.x >= 0 && h.x <= fieldWidth && h.y >= 0 && h.y <= fieldHeight) {
            xs.push(h.x);
            ys.push(h.y);
        }
    return { xs, ys };
}

export function editorPlacement(input: PlacementInput): Placement {
    const pad = GAP_PX + CLEAR_PX;
    const { width, height, fieldWidth } = input;
    const xs = input.outline.map((p) => p.x);
    const { ys } = shapeExtent(input);
    const x = (Math.min(...xs) + Math.max(...xs)) / 2;
    const below = Math.max(...ys) + pad;
    const over = Math.min(...ys) - pad - height;
    const above = below + height > input.fieldHeight && over > 0;
    const left = Math.max(
        MARGIN_PX,
        Math.min(x - width / 2, fieldWidth - width - MARGIN_PX),
    );
    return { left, top: above ? over : below, above };
}

/**
 * What the editor keeps a finger's reach off (#933), inside the field: each handle and the knob on
 * its own; the slots as one box (`slots`) or, for sitting over the shape between them, as rows
 * (`slotRows`). A shape of hundreds of slots stays a handful of boxes, so placing the editor on
 * every pan or zoom frame stays cheap (#933 review).
 */
function gripsOf(input: PlacementInput): {
    handles: Rect[];
    slots: Rect[];
    slotRows: Rect[];
} {
    const { fieldWidth, fieldHeight } = input;
    const inField = (h: XY) =>
        h.x >= 0 && h.x <= fieldWidth && h.y >= 0 && h.y <= fieldHeight;
    const spots = (input.spots ?? []).filter(inField);
    const box = boxAround(spots, FINGER_REACH);
    return {
        handles: aroundPoints(
            [
                ...(input.handles ?? []),
                ...(input.knob ? [input.knob] : []),
            ].filter(inField),
            FINGER_REACH,
        ),
        slots: box ? [box] : [],
        slotRows: rowsAround(spots, FINGER_REACH),
    };
}

/**
 * `editorPlacement`, kept clear of `obstacles` too (#927, touch layout: the zoom box, the
 * Inspector's edge tab, the field display bar, the toolbar panel) without going onto the shape it
 * edits, and a finger's reach off its handles, knob and slots (#933): slid along its side of the
 * shape, else tried on the other side. When neither clears them all (#933: a bar nearly as wide
 * as the field), in this order:
 * 1. over the shape, but a finger's reach off its handles, knob and slots, still clear of them all,
 * 2. beside the shape, clear of it and of `covers`, over as little of the other obstacles (the
 *    controls) as it can,
 * 3. as 2, but a finger's reach off the shape's handles and slots rather than off all of it,
 * 4. clear of the obstacles, onto the shape, so its buttons stay reachable.
 *
 * Its whole height counts, the layout row under its bar too.
 */
export function clearPlacement(
    input: PlacementInput,
    obstacles: readonly Rect[],
    covers: readonly Rect[] = [],
): Placement {
    const placement = editorPlacement(input);
    if (obstacles.length === 0) return placement;
    const { width, height, fieldWidth, fieldHeight } = input;
    const bounds = { left: 0, top: 0, width: fieldWidth, height: fieldHeight };
    const { xs, ys } = shapeExtent(input);
    const shape: Rect = {
        left: Math.min(...xs) - CLEAR_PX,
        top: Math.min(...ys) - CLEAR_PX,
        width: Math.max(...xs) - Math.min(...xs) + 2 * CLEAR_PX,
        height: Math.max(...ys) - Math.min(...ys) + 2 * CLEAR_PX,
    };
    const pad = GAP_PX + CLEAR_PX;
    const sides = [
        placement,
        // The other side of the shape
        placement.above
            ? { ...placement, top: Math.max(...ys) + pad, above: false }
            : {
                  ...placement,
                  top: Math.min(...ys) - pad - height,
                  above: true,
              },
    ];
    // The other side only when it fits on the field
    const fits = (side: Placement, i: number) =>
        i === 0 || (side.top >= 0 && side.top + height <= fieldHeight);
    const at = (side: Placement) => ({
        left: side.left,
        top: side.top,
        width,
        height,
    });
    const grips = gripsOf(input);
    const keepOffs = [
        [shape, ...grips.handles, ...grips.slots],
        [...grips.handles, ...grips.slotRows],
    ];
    for (const keepOff of keepOffs) {
        for (const [i, side] of sides.entries()) {
            if (!fits(side, i)) continue;
            const spot = clearSpot(
                at(side),
                [...keepOff, ...obstacles],
                bounds,
            );
            if (spot.clear)
                return { left: spot.left, top: spot.top, above: side.above };
        }
    }
    // Over a control rather than its own shape: the side that covers the least of them
    const controls = obstacles.filter((o) => !covers.includes(o));
    for (const keepOff of keepOffs) {
        let best: Placement | null = null;
        let bestCover = Infinity;
        for (const [i, side] of sides.entries()) {
            if (!fits(side, i)) continue;
            const spot = clearSpot(at(side), [...keepOff, ...covers], bounds);
            if (!spot.clear) continue;
            const covered = controls.reduce(
                (sum, c) => sum + overlapArea({ ...at(side), ...spot }, c),
                0,
            );
            if (covered < bestCover) {
                best = { left: spot.left, top: spot.top, above: side.above };
                bestCover = covered;
            }
        }
        if (best) return best;
    }
    const spot = clearSpot(
        { left: placement.left, top: placement.top, width, height },
        obstacles,
        bounds,
    );
    return { left: spot.left, top: spot.top, above: placement.above };
}

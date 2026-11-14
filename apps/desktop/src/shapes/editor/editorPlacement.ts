import type { XY } from "../types";
import {
    aroundPoints,
    boxAround,
    clearSpot,
    clearSpotOf,
    FINGER_REACH,
    LAYER_GAP,
    overlapArea,
    overlaps,
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
 *
 * With `visible` (the touch layout, #936: the field less the toolbar panel over its top), it never
 * leaves that box, whatever the zoom or pan, so Place and Discard can always be tapped: a spot
 * past its edge is pulled back in, then moved clear as above, onto the shape only when nothing
 * else fits (`keepVisible`). While pulled in, it keeps `current` (where it is now, in the
 * field's px) as long as that's still as good, so a slow pan doesn't hop it from gap to gap.
 */
export function clearPlacement(
    input: PlacementInput,
    obstacles: readonly Rect[],
    covers: readonly Rect[] = [],
    visible?: Rect,
    current?: { left: number; top: number } | null,
): Placement {
    const placement = clearOfObstacles(input, obstacles, covers);
    return visible
        ? keepVisible(input, placement, obstacles, covers, visible, current)
        : placement;
}

/** Whether `r` lies wholly inside `bounds` (to half a pixel) */
export function isInside(r: Rect, bounds: Rect): boolean {
    return (
        r.left >= bounds.left - 0.5 &&
        r.top >= bounds.top - 0.5 &&
        r.left + r.width <= bounds.left + bounds.width + 0.5 &&
        r.top + r.height <= bounds.top + bounds.height + 0.5
    );
}

/** `r` moved the least to lie inside `bounds` (its top left inside when it's bigger) */
function pulledInside(r: Rect, bounds: Rect): Rect {
    const clamp = (v: number, min: number, max: number) =>
        Math.max(min, Math.min(v, Math.max(min, max)));
    return {
        ...r,
        left: clamp(r.left, bounds.left, bounds.left + bounds.width - r.width),
        top: clamp(r.top, bounds.top, bounds.top + bounds.height - r.height),
    };
}

/**
 * `placement`, kept inside `visible` (#936). A spot past its edge (a shape bigger than the field,
 * or panned half off it) is pulled back in, then kept clear in this order: of the shape, its grips
 * and the obstacles; of its grips (its slots as rows) and the obstacles; of its handles and the
 * obstacles; of the obstacles; of the covers. With none clear it stays pulled in.
 *
 * `current`, where the bar is now, wins while it's clear of a list at least as early as the spot
 * found, and otherwise the least move from it that is (#936 review): during a pan the bar holds
 * still on screen, or is carried along by the shape, instead of hopping to whichever gap between
 * the slot rows is nearest the field's edge this frame.
 */
function keepVisible(
    input: PlacementInput,
    placement: Placement,
    obstacles: readonly Rect[],
    covers: readonly Rect[],
    visible: Rect,
    current?: { left: number; top: number } | null,
): Placement {
    const { width, height } = input;
    const at = { left: placement.left, top: placement.top, width, height };
    if (isInside(at, visible)) return placement;
    const inside = pulledInside(at, visible);
    const { xs, ys } = shapeExtent(input);
    const shape: Rect = {
        left: Math.min(...xs) - CLEAR_PX,
        top: Math.min(...ys) - CLEAR_PX,
        width: Math.max(...xs) - Math.min(...xs) + 2 * CLEAR_PX,
        height: Math.max(...ys) - Math.min(...ys) + 2 * CLEAR_PX,
    };
    const grips = gripsOf(input);
    const lists = [
        [shape, ...grips.handles, ...grips.slots, ...obstacles],
        [...grips.handles, ...grips.slotRows, ...obstacles],
        [...grips.handles, ...obstacles],
        [...obstacles],
        [...covers],
    ];
    // The first list a spot clears, `lists.length` for none
    const tier = (r: Rect) => {
        const i = lists.findIndex(
            (list) => !list.some((o) => overlaps(r, o, LAYER_GAP)),
        );
        return i < 0 ? lists.length : i;
    };
    const spot = clearSpotOf(inside, lists, visible);
    const found = spot.clear
        ? { ...inside, left: spot.left, top: spot.top }
        : inside;
    if (current) {
        // Where it is now, else the least move from there that's as good: carried along with the
        // shape rather than re-picked from the field's edge
        const now = pulledInside({ ...current, width, height }, visible);
        const best = tier(found);
        if (tier(now) <= best)
            return { left: now.left, top: now.top, above: placement.above };
        const slid = clearSpotOf(now, lists.slice(0, best + 1), visible);
        if (slid.clear && tier({ ...now, ...slid }) <= best)
            return { left: slid.left, top: slid.top, above: placement.above };
    }
    return { left: found.left, top: found.top, above: placement.above };
}

/** A control this narrow along the field's left or right edge is an edge tab (the Inspector's) */
export const EDGE_TAB_MAX_PX = 64;

/**
 * How wide the editor's one row may be (#936): the field's width less the edge tabs along its
 * sides (the Inspector's tab, the field display rail), the widest on each side, with a gap. A bar
 * any wider goes on two rows rather than reach under a tab, which would cover part of Place.
 * Wider controls (the zoom box) sit in a corner the bar can clear by moving up or down.
 */
export function oneRowRoom(
    fieldWidth: number,
    controls: readonly Rect[],
    gap = LAYER_GAP,
): number {
    let left = 0;
    let right = 0;
    for (const c of controls) {
        if (c.width <= 0 || c.width > EDGE_TAB_MAX_PX) continue;
        if (c.left <= gap) left = Math.max(left, c.left + c.width + gap);
        else if (c.left + c.width >= fieldWidth - gap)
            right = Math.max(right, fieldWidth - c.left + gap);
    }
    return fieldWidth - left - right;
}

function clearOfObstacles(
    input: PlacementInput,
    obstacles: readonly Rect[],
    covers: readonly Rect[],
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

import type { XY } from "../types";

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

export function editorPlacement(input: PlacementInput): Placement {
    const pad = GAP_PX + CLEAR_PX;
    const { width, height, fieldWidth, fieldHeight } = input;
    const xs = input.outline.map((p) => p.x);
    const ys = input.outline.map((p) => p.y);
    if (input.knob) ys.push(input.knob.y);
    for (const h of input.handles ?? [])
        if (h.x >= 0 && h.x <= fieldWidth && h.y >= 0 && h.y <= fieldHeight)
            ys.push(h.y);
    const x = (Math.min(...xs) + Math.max(...xs)) / 2;
    const below = Math.max(...ys) + pad;
    const over = Math.min(...ys) - pad - height;
    const above = below + height > fieldHeight && over > 0;
    const left = Math.max(
        MARGIN_PX,
        Math.min(x - width / 2, fieldWidth - width - MARGIN_PX),
    );
    return { left, top: above ? over : below, above };
}

/** Another floating bar on the field, in the field element's px */
export interface BarRect {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
}

/**
 * Where a second floating editor goes when a first one (`bar`) is already on the field: where
 * `editorPlacement` puts it, unless that covers the first bar, and then stacked clear of it, the
 * first bar taken as part of what it sits beside (under both, or above both without room below).
 * The path bar goes by the selected placed shape's bar this way (pathways interaction round 4),
 * so neither covers the other.
 */
export function stackedPlacement(
    input: PlacementInput,
    bar: BarRect | null,
): Placement {
    const place = editorPlacement(input);
    if (!bar || bar.width <= 0 || bar.height <= 0) return place;
    const covers =
        place.left < bar.left + bar.width &&
        place.left + input.width > bar.left &&
        place.top < bar.top + bar.height &&
        place.top + input.height > bar.top;
    if (!covers) return place;
    // Its middle stands for it side to side: only its top and bottom count
    const x = Math.min(Math.max(bar.left + bar.width / 2, 0), input.fieldWidth);
    return editorPlacement({
        ...input,
        handles: [
            ...(input.handles ?? []),
            // Kept GAP_PX from it either way, as from a shape's outline
            { x, y: Math.max(bar.top + CLEAR_PX, 0) },
            {
                x,
                y: Math.min(bar.top + bar.height - CLEAR_PX, input.fieldHeight),
            },
        ],
    });
}

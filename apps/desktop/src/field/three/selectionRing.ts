import { DOT_RADIUS, OUTLINE_WIDTH } from "@/field/editor/hitTest";

/**
 * How dots and their selection rings are sized at a zoom (CSS px per field
 * unit). The marchers layer draws them; the overlay keeps the selection box
 * clear of them.
 */

/** A dot never gets smaller than this on screen, in CSS pixels, so a zoomed-out show stays visible. */
const MIN_SCREEN_RADIUS = 1.5;
/** The ring is 2 CSS px wide, clear of the shape's edge by its outline width or 1.5 CSS px, whichever is more. */
const RING_SCREEN_WIDTH = 2;
const RING_SCREEN_GAP = 1.5;
/** The selection border color (#0d6efd), as 0–255 RGB. */
const SELECTION_RGB = [13, 110, 253] as const;
export const SELECTION_COLOR = `rgb(${SELECTION_RGB.join(" ")})`;
/** The same, as 0–1 RGBA for shaders. */
export const SELECTION_RGBA01 = [...SELECTION_RGB.map((c) => c / 255), 1];

/**
 * `scale`: how much a shape is enlarged so it stays visible zoomed out.
 * `ringGap` and `ringWidth`: where the selection ring sits outside the
 * shape's edge, in field units.
 */
export function dotSizes(zoom: number) {
    return {
        scale: Math.max(1, MIN_SCREEN_RADIUS / (DOT_RADIUS * zoom)),
        ringGap: Math.max(OUTLINE_WIDTH, RING_SCREEN_GAP / zoom),
        ringWidth: RING_SCREEN_WIDTH / zoom,
    };
}

/** How far a selected marcher's ring reaches from its center, in field units. */
export function ringReach(zoom: number) {
    const { scale, ringGap, ringWidth } = dotSizes(zoom);
    return DOT_RADIUS * scale + ringGap + ringWidth;
}

/** CSS px between the selection rings and the selection box. */
const BOX_SCREEN_GAP = 3;

/**
 * How far the selection box around a multi-selection reaches past its
 * outermost marchers' centers, in field units: clear of their rings. A drag
 * from inside it moves the selection.
 */
export function selectionBoxPadding(zoom: number) {
    return ringReach(zoom) + BOX_SCREEN_GAP / zoom;
}

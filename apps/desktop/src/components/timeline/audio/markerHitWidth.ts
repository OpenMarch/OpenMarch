/** Widest hit strip around a beat or measure line, by input mode (px). */
export const MARKER_HIT_WIDTH_TOUCH = 32;
export const MARKER_HIT_WIDTH_POINTER = 8;

/**
 * Width of the invisible hit strip centered on a 1px timing line: as wide as
 * the input mode wants, but no wider than the gap to the next line, so
 * neighboring strips don't cover each other. Never narrower than the
 * line's hover width (4px).
 *
 * @param gapPx distance to the next line, in px
 */
export function markerHitWidth({
    gapPx,
    isTouchMode,
}: {
    gapPx: number;
    isTouchMode: boolean;
}): number {
    const max = isTouchMode ? MARKER_HIT_WIDTH_TOUCH : MARKER_HIT_WIDTH_POINTER;
    if (!Number.isFinite(gapPx) || gapPx <= 0) return max;
    return Math.max(4, Math.min(max, gapPx));
}

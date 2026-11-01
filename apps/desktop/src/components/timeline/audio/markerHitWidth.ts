/** Widest hit strip around a beat or measure line, by input mode (px). */
export const MARKER_HIT_WIDTH_TOUCH = 32;
export const MARKER_HIT_WIDTH_POINTER = 8;
/** Never narrower than the line's hover width. */
export const MARKER_HIT_WIDTH_MIN = 4;

/**
 * The gap that limits a hit strip centered on a line: the smaller of the
 * gaps to the previous and next lines. A centered strip reaches half its
 * width each way, and so does its neighbor's, so no wider than the smaller
 * gap keeps strips from covering each other on either side. A missing or
 * non-positive gap (first or last line) doesn't limit it.
 */
export function limitingGap(gapBefore: number, gapAfter: number): number {
    const gaps = [gapBefore, gapAfter].filter(
        (gap) => Number.isFinite(gap) && gap > 0,
    );
    return gaps.length === 0 ? Infinity : Math.min(...gaps);
}

/**
 * Width of the invisible hit strip centered on a 1px timing line: as wide as
 * the input mode wants, but no wider than the gap to either neighbor (see
 * limitingGap), and never narrower than the line's hover width.
 *
 * @param gapBeforePx distance to the previous line, in px
 * @param gapAfterPx distance to the next line, in px
 */
export function markerHitWidth({
    gapBeforePx,
    gapAfterPx,
    isTouchMode,
}: {
    gapBeforePx: number;
    gapAfterPx: number;
    isTouchMode: boolean;
}): number {
    const max = isTouchMode ? MARKER_HIT_WIDTH_TOUCH : MARKER_HIT_WIDTH_POINTER;
    const gap = limitingGap(gapBeforePx, gapAfterPx);
    if (gap === Infinity) return max;
    return Math.max(MARKER_HIT_WIDTH_MIN, Math.min(max, gap));
}

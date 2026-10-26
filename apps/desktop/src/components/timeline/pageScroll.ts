/** Room kept between a page's edge and the scroller's edge, in px. */
export const PAGE_SCROLL_MARGIN = 48;

/**
 * Where to scroll the timeline to show a page (scrollLeft), or null to
 * leave it where it is.
 *
 * - A page that fits is centred, unless `keepIfVisible` and it is already
 *   fully in view (so a tap doesn't slide the boxes under the finger).
 * - A page wider than the view is lined up with its start edge a little in
 *   from the left, so an edge stays in view instead of only its middle.
 *
 * Positions are in content coordinates (scrollLeft + offset in the scroller).
 */
export function scrollLeftForPage({
    pageLeft,
    pageWidth,
    viewWidth,
    scrollLeft,
    keepIfVisible,
    margin = PAGE_SCROLL_MARGIN,
}: {
    pageLeft: number;
    pageWidth: number;
    viewWidth: number;
    scrollLeft: number;
    keepIfVisible: boolean;
    margin?: number;
}): number | null {
    const pageRight = pageLeft + pageWidth;
    const fullyVisible =
        pageLeft >= scrollLeft && pageRight <= scrollLeft + viewWidth;
    if (keepIfVisible && fullyVisible) return null;
    const target =
        pageWidth + 2 * margin <= viewWidth
            ? pageLeft - (viewWidth - pageWidth) / 2
            : pageLeft - Math.min(margin, viewWidth / 4);
    return Math.max(0, target);
}

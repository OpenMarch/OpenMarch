interface ScrollBox {
    readonly scrollWidth: number;
    readonly clientWidth: number;
    readonly scrollHeight: number;
    readonly clientHeight: number;
}

/**
 * Whether a wheel event should scroll the timeline sideways: a mostly vertical wheel or swipe,
 * over a timeline that overflows sideways. When the tracks overflow vertically (a short pane,
 * see the splitter) the wheel scrolls them natively instead; sideways then takes a horizontal
 * swipe or Shift+wheel.
 */
export function wheelScrollsSideways(
    viewport: ScrollBox,
    deltaX: number,
    deltaY: number,
): boolean {
    if (Math.abs(deltaY) <= Math.abs(deltaX)) return false;
    if (viewport.scrollHeight > viewport.clientHeight) return false;
    return viewport.scrollWidth > viewport.clientWidth;
}

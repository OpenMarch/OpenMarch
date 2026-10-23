/**
 * Whether the Inspector panel can be hidden, and whether it is showing, so
 * the field gets the room on a tablet.
 *
 * - With a mouse on a window at least {@link INSPECTOR_COLLAPSE_WIDTH} wide
 *   it always shows, with no button (the desktop layout, unchanged).
 * - In touch mode, or on a narrower window, a button shows and hides it. It
 *   starts hidden below that width (a portrait tablet) and showing above it,
 *   until the person chooses.
 */
export const INSPECTOR_COLLAPSE_WIDTH = 1000;

export interface InspectorLayout {
    /** Whether the show/hide button is there. */
    collapsible: boolean;
    /** Whether the Inspector shows. */
    open: boolean;
}

/**
 * @param choice the person's last choice (true = show), or null before any
 */
export function inspectorLayout(
    windowWidth: number,
    isTouchMode: boolean,
    choice: boolean | null,
): InspectorLayout {
    const wide = windowWidth >= INSPECTOR_COLLAPSE_WIDTH;
    const collapsible = isTouchMode || !wide;
    if (!collapsible) return { collapsible, open: true };
    return { collapsible, open: choice ?? wide };
}

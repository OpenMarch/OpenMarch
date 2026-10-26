/**
 * How the Inspector panel is laid out, so the field keeps its room on a
 * tablet.
 *
 * - `"fixed"`: with the mouse layout it always shows beside the field, with
 *   no button (the desktop layout, unchanged, at any window size).
 * - `"side"`: in touch mode on a wide landscape screen it shows beside the
 *   field, and a tab hides it. It starts showing.
 * - `"drawer"`: in touch mode on a narrow screen, or a tablet in portrait, it slides over
 *   the field from the right instead, so opening it never squeezes the field
 *   or the timeline. It starts closed.
 */
export const INSPECTOR_DRAWER_WIDTH = 1000;

export type InspectorPresentation = "fixed" | "side" | "drawer";

export interface InspectorLayout {
    presentation: InspectorPresentation;
    /** Whether the Inspector shows. */
    open: boolean;
}

export interface InspectorChoices {
    /** The person's last choice beside the field (true = show), or null. */
    side: boolean | null;
    /** Whether the drawer is open. */
    drawer: boolean;
}

export function inspectorPresentation(
    width: number,
    height: number,
    isTouchMode: boolean,
): InspectorPresentation {
    // The mouse layout is the desktop one, unchanged, however narrow the window
    if (!isTouchMode) return "fixed";
    if (width < INSPECTOR_DRAWER_WIDTH) return "drawer";
    return height > width ? "drawer" : "side";
}

export function inspectorLayout(
    width: number,
    height: number,
    isTouchMode: boolean,
    choices: InspectorChoices,
): InspectorLayout {
    const presentation = inspectorPresentation(width, height, isTouchMode);
    switch (presentation) {
        case "fixed":
            return { presentation, open: true };
        case "side":
            return { presentation, open: choices.side ?? true };
        case "drawer":
            return { presentation, open: choices.drawer };
    }
}

/**
 * Whether a change of selection from `previous` to `next` (marcher ids)
 * should point people at the closed Inspector: when something new gets
 * selected while it's hidden behind its tab.
 */
export function shouldHintInspector(
    previous: readonly number[],
    next: readonly number[],
    layout: InspectorLayout,
): boolean {
    if (layout.open || layout.presentation === "fixed") return false;
    if (next.length === 0) return false;
    const before = new Set(previous);
    return next.some((id) => !before.has(id));
}

/**
 * What the editor does about the 3D View when a show opens, from the "Open the 3D View with the
 * show" setting: open it when on, nothing when off. While it was never answered it opens too, and
 * the window asks whether to keep doing that (`AutoOpenQuestion`). A browser blocks a window
 * opened without a click, so the web editor never opens it by itself, and neither does a
 * Playwright session, where an unasked-for window would open in every test.
 */
export function view3dAutoOpenOnShow(
    setting: unknown,
    { canAutoOpen }: { canAutoOpen: boolean },
): "open" | "none" {
    if (setting === true) return "open";
    if (setting === undefined && canAutoOpen) return "open";
    return "none";
}

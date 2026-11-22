/**
 * The "Open on" settings shared by the main process (electron/main/window-state.ts) and
 * Settings › General: which display the editor and the 3D View open on.
 */

/** The windows that remember where they open */
export type PlacedWindow = "editor" | "view3d";

/** Settings keys. The value is `OPEN_ON_LAST` or a display's id as a string. */
export const WINDOW_OPEN_ON_SETTINGS: Record<PlacedWindow, string> = {
    editor: "editorWindowDisplay",
    view3d: "view3dWindowDisplay",
};

/** Opens where it was left, the default */
export const OPEN_ON_LAST = "last";

/** Returns a `DisplaysResponse` */
export const LIST_DISPLAYS_CHANNEL = "window:list-displays";

export interface DisplaysResponse {
    /** False where the app can't place windows (Linux under Wayland): the menus are hidden */
    supported: boolean;
    displays: DisplayListing[];
}

export interface DisplayListing {
    id: number;
    /** The monitor's name where the system gives one (Windows, macOS), else empty */
    label: string;
    /** Resolution in pixels (not scaled) */
    width: number;
    height: number;
    primary: boolean;
    /** 1-based, left to right then top to bottom */
    number: number;
}

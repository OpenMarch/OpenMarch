/**
 * The app menu's playback and help items (UI-17 follow-up; docs/adr/0003-menu-actions-ipc.md).
 * The main process builds menu items from this list and sends the chosen item's `action` on
 * `MENU_ACTION_CHANNEL`; the renderer runs it as the registered action of that name, and nothing
 * outside this list. Shared by the main process, the preload and the renderer, so it imports
 * nothing.
 */
export const MENU_ACTION_CHANNEL = "menu:action";

export interface MenuAction {
    /** A `RegisteredActionsEnum` value */
    readonly action: string;
    readonly label: string;
    /**
     * The shortcut, in Electron's accelerator form. The menu only shows it: the renderer's own
     * keyboard handler owns the key, so text fields keep Space and letters
     */
    readonly accelerator: string;
}

export const PLAYBACK_MENU_ACTIONS: readonly MenuAction[] = [
    { action: "playPause", label: "Play / Stop", accelerator: "Space" },
    {
        action: "playPage",
        label: "Play Page Once",
        accelerator: "Shift+Space",
    },
    { action: "toggleLoop", label: "Loop On / Off", accelerator: "C" },
];

export const HELP_MENU_ACTIONS: readonly MenuAction[] = [
    {
        action: "showShortcuts",
        label: "Keyboard Shortcuts",
        accelerator: "Shift+/",
    },
];

/** Whether `action` is one the menu may send */
export const isMenuAction = (action: unknown): action is string =>
    typeof action === "string" &&
    [...PLAYBACK_MENU_ACTIONS, ...HELP_MENU_ACTIONS].some(
        (item) => item.action === action,
    );

/**
 * The app menu's playback and help items (UI-17 follow-up; docs/adr/0003-menu-actions-ipc.md).
 * The main process builds menu items from this list and sends the chosen item's `action` on
 * `MENU_ACTION_CHANNEL`; the renderer runs the action of that name, and nothing
 * outside this list. Shared by the main process, the preload and the renderer, so it imports
 * nothing.
 */
export const MENU_ACTION_CHANNEL = "menu:action";

export interface MenuAction {
    /** An action id (`shortcuts/definitions.ts`) */
    readonly action: string;
    /**
     * The item's text, as a key in `i18n/en.json`. The main process translates it (with
     * `electron/main/i18n.ts`) when it builds the menu
     */
    readonly labelKey: string;
    /**
     * The shortcut, in Electron's accelerator form. The menu only shows it: the renderer's own
     * keyboard handler owns the key, so text fields keep Space and letters. None for an unbound action
     */
    readonly accelerator?: string;
    /** Left out of the menu in Basic mode, where the action's handler is off (UI-19) */
    readonly expertOnly?: true;
}

export const PLAYBACK_MENU_ACTIONS: readonly MenuAction[] = [
    {
        action: "playPause",
        labelKey: "menu.playback.playPause",
        accelerator: "Space",
    },
    {
        action: "playPage",
        labelKey: "menu.playback.playPage",
        accelerator: "Shift+Space",
    },
    {
        action: "playOn",
        labelKey: "menu.playback.playOn",
        accelerator: "Alt+Space",
        expertOnly: true,
    },
    {
        action: "toggleLoop",
        labelKey: "menu.playback.toggleLoop",
        accelerator: "C",
        expertOnly: true,
    },
];

/**
 * "Check for Updates…": in the app menu on macOS, in Help elsewhere. It has no shortcut; the
 * renderer runs it so it can say what the check found. It works on every screen, so
 * `CheckForUpdatesHandler` (mounted at the top of the app) listens for it, not the editor's
 * `isMenuAction` listener.
 */
export const CHECK_FOR_UPDATES_MENU_ACTION = {
    action: "checkForUpdates",
    labelKey: "menu.checkForUpdates",
} as const;

export const HELP_MENU_ACTIONS: readonly MenuAction[] = [
    {
        action: "showShortcuts",
        labelKey: "menu.help.showShortcuts",
        accelerator: "Shift+/",
    },
    { action: "reportFeedback", labelKey: "menu.help.reportFeedback" },
    { action: "viewMyReports", labelKey: "menu.help.viewMyReports" },
];

/** Whether `action` is one the menu may send */
export const isMenuAction = (action: unknown): action is string =>
    typeof action === "string" &&
    [...PLAYBACK_MENU_ACTIONS, ...HELP_MENU_ACTIONS].some(
        (item) => item.action === action,
    );

/**
 * Opens the editor and the 3D View where they belong (window-placement.ts) and remembers where
 * they're left. The "Open on" settings live in Settings › General.
 */
import { app, screen, type BrowserWindow } from "electron";
import type Store from "electron-store";
import {
    listDisplays,
    parseSavedWindowState,
    resolvePlacement,
    type DisplayArea,
    type Placement,
    type SavedWindowState,
    type WindowDefaults,
} from "./window-placement";
import {
    OPEN_ON_LAST,
    WINDOW_OPEN_ON_SETTINGS,
    type DisplayListing,
    type PlacedWindow,
} from "../../src/settings/windowPlacementSettings";

const STATE_KEYS: Record<PlacedWindow, string> = {
    editor: "editorWindowState",
    view3d: "view3dWindowState",
};

function displayAreas(): DisplayArea[] {
    return screen
        .getAllDisplays()
        .map((d) => ({ id: d.id, workArea: d.workArea }));
}

/**
 * Whether the app can place its windows. Not on Linux under Wayland, where Electron runs natively
 * and the compositor alone decides where windows go.
 */
export function placementSupported(): boolean {
    if (process.platform !== "linux") return true;
    if (app.commandLine.getSwitchValue("ozone-platform") === "x11") return true;
    return !(
        process.env.WAYLAND_DISPLAY ||
        process.env.XDG_SESSION_TYPE === "wayland"
    );
}

/** Where the window opens: its constructor takes `bounds`; showWhenReady does the rest */
export function windowPlacement(
    store: Store,
    kind: PlacedWindow,
    defaults: WindowDefaults,
): Placement {
    const primary = screen.getPrimaryDisplay();
    const supported = placementSupported();
    return resolvePlacement({
        saved: supported
            ? parseSavedWindowState(store.get(STATE_KEYS[kind]))
            : undefined,
        openOn: supported
            ? store.get(WINDOW_OPEN_ON_SETTINGS[kind], OPEN_ON_LAST)
            : OPEN_ON_LAST,
        displays: displayAreas(),
        primary: { id: primary.id, workArea: primary.workArea },
        defaults,
    });
}

export interface PendingShow {
    /** Shows it now, with focus, if it isn't shown yet (asked for while a background open waits) */
    showNow: () => void;
}

/**
 * Shows a window created hidden at its placement, once it has something to draw, so it never
 * shows at one size and jumps to another.
 *
 * `inactive` (the 3D View opening with a show) leaves focus where it is. Maximizing a hidden
 * window shows and activates it on Windows and Linux, so focus goes back to `returnFocusTo`;
 * full screen isn't restored, as it would take over the screen (on macOS, switch Spaces).
 */
export function showWhenReady(
    win: BrowserWindow,
    placement: Placement,
    {
        inactive = false,
        returnFocusTo,
    }: {
        inactive?: boolean;
        returnFocusTo?: () => BrowserWindow | null;
    } = {},
): PendingShow {
    let shown = false;
    const show = (asInactive: boolean) => {
        if (shown || win.isDestroyed()) return;
        shown = true;
        if (!placement.maximized && !placement.fullScreen) {
            // Again, now that it's on its display: on Windows, bounds given for a display with
            // another scale can come out the wrong size
            win.setBounds(placement.bounds);
        }
        if (asInactive) {
            if (placement.maximized || placement.fullScreen) {
                win.maximize();
                const other = returnFocusTo?.();
                if (other && !other.isDestroyed() && other.isVisible())
                    other.focus();
            } else {
                win.showInactive();
            }
            return;
        }
        // `maximize()` shows a hidden window already maximized
        if (placement.maximized && !placement.fullScreen) win.maximize();
        win.show();
        // After showing: set before, Electron shows the window early (Linux) or out of order
        if (placement.fullScreen) win.setFullScreen(true);
    };
    win.once("ready-to-show", () => show(inactive));
    // A page that is slow to paint still gets its window
    const fallback = setTimeout(() => show(inactive), 5000);
    win.once("closed", () => clearTimeout(fallback));
    return {
        showNow: () => {
            if (!shown) show(false);
        },
    };
}

function currentState(win: BrowserWindow): SavedWindowState {
    return {
        bounds: win.getNormalBounds(),
        maximized: win.isMaximized(),
        fullScreen: win.isFullScreen(),
        displayId: screen.getDisplayMatching(win.getBounds()).id,
    };
}

/**
 * Saves where the window is whenever it moves, resizes, maximizes or goes full screen (half a
 * second after it settles), and when it closes.
 */
export function rememberWindowState(
    store: Store,
    kind: PlacedWindow,
    win: BrowserWindow,
) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
        clearTimeout(timer);
        timer = undefined;
        // A hidden window (not shown yet, or closing) reports nothing useful
        if (win.isDestroyed() || !win.isVisible() || win.isMinimized()) return;
        store.set(STATE_KEYS[kind], currentState(win));
    };
    const saveSoon = () => {
        clearTimeout(timer);
        timer = setTimeout(save, 500);
    };
    for (const event of [
        "resize",
        "move",
        "maximize",
        "unmaximize",
        "enter-full-screen",
        "leave-full-screen",
    ] as const) {
        win.on(event as "resize", saveSoon);
    }
    win.on("close", save);
    win.on("closed", () => clearTimeout(timer));
    return {
        /** Saves now; for a window about to be closed with `destroy()`, which emits no "close" */
        flush: save,
    };
}

/** The latest move of each window; an older move's pending steps give way to it */
const moveGenerations = new WeakMap<BrowserWindow, number>();

/**
 * Moves an open window to the display just chosen in Settings, keeping its size (or keeping it
 * maximized). A full-screen window stays put and moves the next time it opens.
 */
export function moveToChosenDisplay(
    store: Store,
    kind: PlacedWindow,
    win: BrowserWindow | null,
    defaults: WindowDefaults,
) {
    if (!win || win.isDestroyed() || !win.isVisible() || win.isFullScreen())
        return;
    if (!placementSupported()) return;
    const openOn = store.get(WINDOW_OPEN_ON_SETTINGS[kind], OPEN_ON_LAST);
    if (typeof openOn !== "string" || openOn === OPEN_ON_LAST) return;

    const generation = (moveGenerations.get(win) ?? 0) + 1;
    moveGenerations.set(win, generation);
    const current = () =>
        !win.isDestroyed() && moveGenerations.get(win) === generation;

    const state = currentState(win);
    // A move still settling (below) is about to maximize the window again
    const pending = pendingMaximize.has(win);
    if (!pending && String(state.displayId) === openOn) return;
    const wasMaximized = state.maximized || pending;

    const primary = screen.getPrimaryDisplay();
    const placement = resolvePlacement({
        saved: state,
        openOn,
        displays: displayAreas(),
        primary: { id: primary.id, workArea: primary.workArea },
        defaults,
    });
    // On Windows, bounds set for a display with another scale can come out the wrong size until
    // set again from that display
    const setBoundsTwice = (done?: () => void) => {
        win.setBounds(placement.bounds);
        setTimeout(() => {
            if (!current()) return;
            win.setBounds(placement.bounds);
            done?.();
        }, SETTLE_MS);
    };

    if (!wasMaximized) {
        setBoundsTwice();
        return;
    }
    // Moved while un-maximized, then maximized again. On Linux the window manager applies each
    // step after the call returns, and its restore resize lands just after "unmaximize": bounds
    // set before it settles are overwritten, and maximizing before the move lands makes the
    // whole display the size it restores to. So each step waits a moment for the last.
    pendingMaximize.add(win);
    let started = false;
    const move = () => {
        win.removeListener("unmaximize", move);
        if (started || !current()) return;
        started = true;
        setTimeout(() => {
            if (!current()) return;
            setBoundsTwice(() => {
                pendingMaximize.delete(win);
                win.maximize();
            });
        }, SETTLE_MS);
    };
    if (win.isMaximized()) {
        win.once("unmaximize", move);
        // A window manager that never reports it
        setTimeout(move, 500);
        win.unmaximize();
    } else {
        move();
    }
}

const SETTLE_MS = 100;
/** Windows a move un-maximized and will maximize again */
const pendingMaximize = new WeakSet<BrowserWindow>();

/** The connected displays, for the "Open on" menus */
export function displayListing(): DisplayListing[] {
    return listDisplays(screen.getAllDisplays(), screen.getPrimaryDisplay().id);
}

/**
 * Tempo mode: while tempo mode is on, only navigation works besides tempo editing
 * (owner, 2026-10-21): moving around the show, playback, go-to, undo and redo, and saving, plus
 * the import its own toolbar runs. Every other action is off, from a key, the palette or a button
 * (`isActionOffInWorkspace`), and keys that would reach the field's or the timeline's own key
 * handlers are stopped here first.
 */
import type { ActionId } from "@/shortcuts/definitions";
import { getEffectiveBindings } from "@/shortcuts/keymap";
import { bindingFromEvent, platformBinding } from "@/shortcuts/bindings";
import { isMacPlatform } from "@/shortcuts/platform";
import { useShortcutOverridesStore } from "@/stores/ShortcutOverridesStore";
import { CLICK_FOCUS_ATTRIBUTE } from "@/utilities/clickFocus";
import { useTempoModeStore } from "./tempoModeStore";

/** The actions tempo mode leaves on */
export const TEMPO_MODE_ACTIONS: ReadonlySet<ActionId> = new Set<ActionId>([
    // moving around the show
    "nextPage",
    "lastPage",
    "previousPage",
    "firstPage",
    "nextBeat",
    "previousBeat",
    "timelineGoTo",
    // playback (Click is the metronome)
    "playPause",
    "playPage",
    "playOn",
    "holdFasterPlayback",
    "holdSlowerPlayback",
    "nextPlaybackSpeed",
    "previousPlaybackSpeed",
    "resetPlaybackSpeed",
    "toggleMetronome",
    // tempo edits are in the show's history; saving keeps them
    "performUndo",
    "performRedo",
    "launchSaveFileDialogue",
    "showShortcuts",
    // tempo mode's own Add music and Import buttons run this
    "launchInsertAudioFileDialogue",
]);

export const isTempoModeOn = (): boolean => useTempoModeStore.getState().on;

/** Keys tempo mode's own lanes use (tap tempo, cancel, the toggle) */
const TEMPO_KEYS = new Set(["T", "Shift+T", "Escape", "Tab", "Shift+Tab"]);

const allowedBindings = (isMac: boolean): Set<string> => {
    const overrides = useShortcutOverridesStore.getState().overrides;
    const out = new Set<string>();
    for (const id of TEMPO_MODE_ACTIONS)
        for (const b of getEffectiveBindings(id, overrides))
            out.add(platformBinding(b, isMac));
    for (const k of TEMPO_KEYS) out.add(platformBinding(k, isMac));
    return out;
};

const isEditable = (el: EventTarget | null) =>
    el instanceof HTMLElement &&
    !!el.closest(
        "input, textarea, select, [contenteditable=true], [role=dialog], [role=menu]",
    );

/**
 * Enter, or Space, on a focused button: it's the button's (the count box's choices, the toolbar,
 * a time signature chip). Space on a button focused by a click still plays, as everywhere else.
 */
const pressedButton = (event: KeyboardEvent): HTMLElement | null => {
    if (event.key !== "Enter" && event.key !== " ") return null;
    if (event.metaKey || event.ctrlKey || event.altKey) return null;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return null;
    const button = target.closest<HTMLElement>("button, [role=button]");
    if (!button || button.matches(":disabled, [aria-disabled=true]"))
        return null;
    return event.key === "Enter" || !button.hasAttribute(CLICK_FOCUS_ATTRIBUTE)
        ? button
        : null;
};

/**
 * Stops keys that tempo mode doesn't use before any other handler sees them. Install once, in
 * the capture phase on the window; it does nothing while tempo mode is off.
 */
export function installTempoKeyGuard(): () => void {
    const onKeyDown = (event: KeyboardEvent) => {
        if (!isTempoModeOn() || isEditable(event.target)) return;
        const button = pressedButton(event);
        if (button) {
            // a native button presses itself (no shortcut also runs); a role=button one
            // handles the key itself
            if (button instanceof HTMLButtonElement) event.stopPropagation();
            return;
        }
        const isMac = isMacPlatform();
        const binding = bindingFromEvent(event, isMac);
        if (binding === undefined) return; // a modifier on its own
        if (allowedBindings(isMac).has(platformBinding(binding, isMac))) return;
        event.stopPropagation();
        event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
}

/** Open layers that take the keys; tap tempo's panel doesn't (T taps in it) */
const KEY_LAYERS = [
    '[role="dialog"][data-state="open"]',
    '[role="alertdialog"][data-state="open"]',
    '[role="menu"][data-state="open"]',
    '[role="listbox"][data-state="open"]',
    "[data-testid=tempo-count-ask]",
]
    .map((s) => `${s}:not([data-testid=tap-tempo])`)
    .join(", ");

/**
 * Whether a dialog has the keys: the focus is in one, or a modal layer (dialog, menu, list) is
 * open, or the tempo lanes' add/remove box is. Tempo mode's own letter keys (T, Shift+T, M)
 * leave them alone then. Tap tempo's panel isn't one.
 */
export function dialogHasKeys(target: EventTarget | null): boolean {
    const inDialog =
        target instanceof Element &&
        target.closest("[role=dialog], [role=alertdialog]");
    return (
        (!!inDialog && !inDialog.matches("[data-testid=tap-tempo]")) ||
        document.querySelector(KEY_LAYERS) !== null
    );
}

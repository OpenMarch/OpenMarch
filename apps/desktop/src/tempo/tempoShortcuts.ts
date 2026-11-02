/**
 * Tempo mode: while tempo mode is on, only navigation works besides tempo editing
 * (owner, 2026-10-21): moving around the show, playback, go-to, undo and redo, and saving. Every
 * other action is off, from a key, the palette or a button (`isActionOffInWorkspace`), and keys
 * that would reach the field's or the timeline's own key handlers are stopped here first.
 */
import type { ActionId } from "@/shortcuts/definitions";
import { getEffectiveBindings } from "@/shortcuts/keymap";
import { bindingFromEvent, platformBinding } from "@/shortcuts/bindings";
import { isMacPlatform } from "@/shortcuts/platform";
import { useShortcutOverridesStore } from "@/stores/ShortcutOverridesStore";
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
    "timelinePreviousPage",
    "timelineNextPage",
    "timelineGoTo",
    // playback (Click is the metronome)
    "playPause",
    "playPage",
    "playOn",
    "timelinePlayPause",
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
]);

export const isTempoModeOn = (): boolean => useTempoModeStore.getState().on;

/** Keys tempo mode's own lanes use (tap tempo, mark, cancel, the toggle) */
const TEMPO_KEYS = new Set(["T", "Shift+T", "M", "Escape", "Tab", "Shift+Tab"]);

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
 * Stops keys that tempo mode doesn't use before any other handler sees them. Install once, in
 * the capture phase on the window; it does nothing while tempo mode is off.
 */
export function installTempoKeyGuard(): () => void {
    const onKeyDown = (event: KeyboardEvent) => {
        if (!isTempoModeOn() || isEditable(event.target)) return;
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

/**
 * Pure helpers for the window's playback controls (ui.md UI-4). The editor
 * owns playback; the window only asks it to run one of its actions, through
 * `window.view3d.requestPlayback`.
 */
import type { View3dPlaybackAction } from "@/view3d/sync/protocol";

/** Actions that last while their key is held: the playback speed keys */
export const HELD_PLAYBACK_ACTIONS: ReadonlySet<View3dPlaybackAction> = new Set(
    ["holdFasterPlayback", "holdSlowerPlayback"],
);

/**
 * The playback action for a key press, using the editor's shortcuts: Space
 * plays or stops, Shift+Space plays from the playhead or pauses, Q
 * and E step a page, Shift+Q and Shift+E a beat, Alt+Q and Alt+E (or Home and
 * End) go to the first and last page, and ] and [ play at double or half
 * speed while held. Matches on `code`, like the editor, so the keys stay put
 * on other layouts.
 */
export function playbackActionForKey(event: {
    code: string;
    shiftKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
}): View3dPlaybackAction | null {
    if (event.ctrlKey || event.metaKey) return null;
    if (event.altKey) {
        if (event.shiftKey) return null;
        if (event.code === "KeyQ") return "firstPage";
        if (event.code === "KeyE") return "lastPage";
        return null;
    }
    switch (event.code) {
        case "Space":
            return event.shiftKey ? "playPage" : "playPause";
        case "KeyQ":
            return event.shiftKey ? "previousBeat" : "previousPage";
        case "KeyE":
            return event.shiftKey ? "nextBeat" : "nextPage";
        case "Home":
            return event.shiftKey ? null : "firstPage";
        case "End":
            return event.shiftKey ? null : "lastPage";
        case "BracketRight":
            return event.shiftKey ? null : "holdFasterPlayback";
        case "BracketLeft":
            return event.shiftKey ? null : "holdSlowerPlayback";
        default:
            return null;
    }
}

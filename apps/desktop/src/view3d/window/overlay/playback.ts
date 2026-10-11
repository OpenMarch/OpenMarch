/**
 * Pure helpers for the window's playback controls (ui.md UI-4). The editor
 * owns playback; the window only asks it to run one of its actions, through
 * `window.view3d.requestPlayback`.
 */
import type { View3dPlaybackAction } from "@/view3d/sync/protocol";

/** Which playback actions would do something right now. */
export type TransportState = Record<View3dPlaybackAction, boolean>;

/**
 * Mirrors the editor's timeline buttons: page steps work only while paused
 * and when there is a page to go to, and play needs a page after the
 * selected one (pause always works).
 */
export function transportState(
    pages: readonly { id: number; order: number }[],
    selectedPageId: number | null,
    playing: boolean,
): TransportState {
    const sorted = [...pages].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((page) => page.id === selectedPageId);
    const hasPrevious = index > 0;
    const hasNext = index >= 0 && index < sorted.length - 1;
    return {
        playPause: playing || hasNext,
        previousPage: !playing && hasPrevious,
        firstPage: !playing && hasPrevious,
        nextPage: !playing && hasNext,
        lastPage: !playing && hasNext,
    };
}

/**
 * The playback action for a key press, using the editor's shortcuts: Space
 * plays or pauses, Q and E step a page, and Shift+Q and Shift+E go to the
 * first and last page. Matches on `code`, like the editor, so the keys stay
 * put on other layouts.
 */
export function playbackActionForKey(event: {
    code: string;
    shiftKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
}): View3dPlaybackAction | null {
    if (event.ctrlKey || event.metaKey || event.altKey) return null;
    switch (event.code) {
        case "Space":
            return event.shiftKey ? null : "playPause";
        case "KeyQ":
            return event.shiftKey ? "firstPage" : "previousPage";
        case "KeyE":
            return event.shiftKey ? "lastPage" : "nextPage";
        default:
            return null;
    }
}

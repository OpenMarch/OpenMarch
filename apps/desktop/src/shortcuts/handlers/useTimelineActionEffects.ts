import { useEffect } from "react";
import { isMenuAction } from "@/global/menuActions";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { ACTIONS, type ActionId } from "../definitions";
import { runAction, subscribeToActionRuns } from "../registry";

/** Playback controls, which leave a held preview frame alone (UI-11) */
const TRANSPORT_ACTIONS: ReadonlySet<ActionId> = new Set<ActionId>([
    "playPause",
    "timelinePlayPause",
    "toggleLoop",
    "playPage",
    "toggleMetronome",
]);

export function useTimelineActionEffects() {
    // UI-11: anything but the transport puts a held preview frame back on the playhead, so
    // edits start from the positions they change
    useEffect(
        () =>
            subscribeToActionRuns((id) => {
                if (TRANSPORT_ACTIONS.has(id)) return;
                const timelineSelection = useTimelineSelectionStore.getState();
                if (timelineSelection.playback === null)
                    timelineSelection.clearCursor();
            }),
        [],
    );

    // The app menu's playback and help items run their action here, and only those
    // (docs/adr/0003-menu-actions-ipc.md)
    useEffect(
        () =>
            window.electron?.onMenuAction?.((action) => {
                if (isMenuAction(action) && action in ACTIONS)
                    runAction(action as ActionId);
            }),
        [],
    );
}

import { useEffect } from "react";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import type { ActionId } from "../definitions";
import { subscribeToActionRuns } from "../registry";

/** Playback controls, and peeks that only change what's drawn, leave a held preview frame alone (UI-11) */
const TRANSPORT_ACTIONS: ReadonlySet<ActionId> = new Set<ActionId>([
    "playPause",
    "timelinePlayPause",
    "toggleLoop",
    "playPage",
    "playOn",
    "toggleMetronome",
    "holdFasterPlayback",
    "holdSlowerPlayback",
    "nextPlaybackSpeed",
    "resetPlaybackSpeed",
    "toggleStartFlagPositions",
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
}

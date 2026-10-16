import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";

/**
 * Whether the app takes an edit press on the field for itself, so the
 * field editor does nothing with it (`FieldEditorPorts.takePress`, fork #202).
 *
 * While a paused preview holds a frame (UI-11), the field shows that frame,
 * not the playhead, where edits land. The first press only puts the field
 * back on the playhead (#189 story 60), so nothing is selected or dragged
 * from the held positions.
 *
 * The line tool's presses are the editor's own (`FieldEditor.setLineTool`,
 * #203), and select no marcher.
 */
export function takeFieldPress(): boolean {
    const timeline = useTimelineSelectionStore.getState();
    if (timeline.cursorBeat === null || timeline.playback !== null)
        return false;
    timeline.clearCursor();
    return true;
}

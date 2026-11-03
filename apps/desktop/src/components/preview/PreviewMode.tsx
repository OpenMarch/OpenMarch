import { useEffect, useRef } from "react";
import { readShortcutContext } from "@/shortcuts/context";
import { notifyActionHandlersChanged } from "@/shortcuts/registry";
import { useActionHandler } from "@/shortcuts/useActionHandler";
import {
    useIsPreviewMode,
    usePreviewModeStore,
} from "@/stores/PreviewModeStore";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";

/**
 * Runs Preview (`PreviewModeStore`), the workspace switch's other mode: **Alt+P** turns it on and
 * off and **Esc** leaves it, back to the Editor. Going in
 * leaves anything mid-edit: an isolated move, a line drag, and the beat editor, which edits too
 * (and comes back on leaving). Playback that loops or plays a window once plays on instead, as
 * Preview always does. Mount once, in the editor.
 */
export function PreviewModeHost() {
    const preview = useIsPreviewMode();
    useActionHandler("togglePreview", () =>
        usePreviewModeStore.getState().togglePreview(),
    );

    // The beat editor was open when Preview began: it opens again when Preview ends
    const beatEditorWasOpen = useRef(false);

    useEffect(() => {
        // Preview turns most actions off (`isActionOffInWorkspace`): buttons and the palette read again
        notifyActionHandlersChanged();
        if (!preview) {
            if (beatEditorWasOpen.current) {
                beatEditorWasOpen.current = false;
                setFocussedComponent("timeline");
            }
            return;
        }
        const timeline = useTimelineSelectionStore.getState();
        if (timeline.lineDrag) timeline.cancelLineDrag();
        if (timeline.isolation) timeline.exitIsolation();
        if (timeline.playback?.kind === "preview")
            timeline.setPlayback({ kind: "on" });
        if (
            useUiSettingsStore.getState().uiSettings.focussedComponent ===
            "timeline"
        ) {
            beatEditorWasOpen.current = true;
            setFocussedComponent("canvas");
        }

        // Esc leaves, unless a dialog or menu is open or a box is being typed in, which take it
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || event.defaultPrevented) return;
            const context = readShortcutContext("canvas");
            if (context.modalOpen || context.inTextInput) return;
            event.preventDefault();
            usePreviewModeStore.getState().setPreview(false);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [preview]);

    return null;
}

const setFocussedComponent = (focussedComponent: "canvas" | "timeline") => {
    const ui = useUiSettingsStore.getState();
    ui.setUiSettings({ ...ui.uiSettings, focussedComponent });
};

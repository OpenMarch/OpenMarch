import { useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { FieldEditor } from "@/field/editor/fieldEditor";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { useBoxSelection } from "../placed/boxSelection";
import {
    clearReleasedPreview,
    previewPlacedBox,
    useBoxSelectionStore,
} from "../placed/boxSelectionStore";
import { LiveBoxMode, setActiveLiveBox } from "../placed/liveBoxMode";
import { closeHandleMenu } from "./handleMenu";
import {
    closeShapeTool,
    useShapeHidden,
    useShapeToolStore,
} from "../tool/shapeToolStore";
import { isAwayFrom } from "../tool/shapeMoment";
import { forgetDiscardedShape } from "../tool/shapeLeave";
import { subscribeHistoryChanges } from "@/db-functions/history";
import { shapeToolMode } from "../tool/shapeToolMode";
import { resetShapePointer, watchShapeEditorFocus } from "./shapePointer";

/**
 * Puts the shapes on the field's editor (#204): the open Shape tool takes every edit press
 * (`shapeToolMode`), and otherwise a selected placed box takes the presses on its handles and
 * inside it (`LiveBoxMode`). Also keeps placed boxes in the selection (`useBoxSelection`).
 *
 * The tool is about one moment and one group of marchers. Only Place (Enter) places it (#416):
 * moving around the timeline, playing, Visuals and a new selection leave it open. While it waits
 * out of sight (`useShapeHidden`) the field doesn't draw it or give it presses, and an armed tool
 * with nothing drawn yet closes once the timeline moves off its moment.
 */
export function useShapeFieldModes(
    editor: FieldEditor,
    isPlaying: boolean,
): void {
    const toolOpen = useShapeToolStore((s) => s.tool !== null);
    const hidden = useShapeHidden();
    const box = useBoxSelectionStore((s) => s.selected);
    const queryClient = useQueryClient();
    useBoxSelection({ isPlaying });

    // One live mode per box, told when the box is saved or read again
    const boxId = box?.recipe.id ?? null;
    const live = useMemo(
        () => (box ? new LiveBoxMode(box, queryClient) : null),
        // A new mode only for another box
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [boxId, queryClient],
    );
    useEffect(() => {
        setActiveLiveBox(live);
        return () => setActiveLiveBox(null);
    }, [live]);
    useEffect(() => {
        if (box) live?.setBox(box);
        // The box read back replaces a released number drag's preview; a drag still held keeps
        // its own, though an earlier save was read back meanwhile (#515)
        clearReleasedPreview();
    }, [live, box]);
    // Another box (or none) drops any preview, held or not; so does the tool opening, which takes
    // the editor and with it a drag's release (review of #516)
    useEffect(() => () => previewPlacedBox(null), [live, toolOpen]);

    useEffect(() => {
        // The pointer was over the last shape, if any; the next cursor check finds the new one
        resetShapePointer();
        // A handle's menu is for the shape it was opened on (#569)
        closeHandleMenu();
        editor.setMode(toolOpen ? (hidden ? null : shapeToolMode) : live);
    }, [editor, toolOpen, hidden, live]);
    useEffect(() => () => editor.setMode(null), [editor]);
    // Keyboard focus in the floating editor shows the shape's controls (#430)
    useEffect(() => watchShapeEditorFocus(), []);

    useShapeWaits(isPlaying, toolOpen);
}

function useShapeWaits(isPlaying: boolean, open: boolean): void {
    // A discarded shape comes back only on the undo right after Escape: any edit to the show
    // in between takes undo back
    useEffect(() => subscribeHistoryChanges(forgetDiscardedShape), []);

    useEffect(() => {
        if (isPlaying) forgetDiscardedShape();
    }, [isPlaying]);

    const selected = useSelectedMarchers()?.selectedMarchers;
    useEffect(() => {
        if (!selected) return;
        const ids = new Set(selected.map((m) => m.id));
        const { discarded } = useShapeToolStore.getState();
        const same =
            !!discarded &&
            ids.size === discarded.tool.marchers.length &&
            discarded.tool.marchers.every((m) => ids.has(m.id));
        if (discarded && !same) forgetDiscardedShape();
    }, [selected]);

    const discarded = useShapeToolStore((s) => s.discarded !== null);
    // Only while a shape is open or waits on undo: moving the playhead changes the window, and the
    // field calls this, so it would re-render for nothing (#455)
    const watching = open || discarded;
    const windowKey = useTimelineSelectionStore((s) => {
        if (!watching) return "";
        const sel = s.selection;
        const iso = s.isolation;
        return [
            sel.kind,
            sel.kind === "range" ? `${sel.start}-${sel.end}` : "",
            iso ? `${iso.timelineId}:${iso.start}-${iso.end}` : "",
        ].join("|");
    });
    useEffect(() => {
        if (!open) return;
        const { tool, moment } = useShapeToolStore.getState();
        // Nothing drawn yet: the marchers it armed on were where they stood at that moment
        if (tool?.params === null && isAwayFrom(moment)) closeShapeTool();
    }, [windowKey, open]);
    // Undo after Escape opens the shape at the moment it was discarded, so a new moment ends it
    const discardedAt = useRef(windowKey);
    useEffect(() => {
        if (discarded) discardedAt.current = windowKey;
        // Only the discarding: a later change of window is handled below
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [discarded]);
    useEffect(() => {
        if (discarded && windowKey !== discardedAt.current)
            forgetDiscardedShape();
    }, [windowKey, discarded]);
}

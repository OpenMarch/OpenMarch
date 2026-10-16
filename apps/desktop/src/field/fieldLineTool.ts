import { useEffect } from "react";
import { useAlignmentEventStore } from "@/stores/AlignmentEventStore";
import type { FieldEditor } from "@/field/editor/fieldEditor";
import type { MarcherPosition } from "@/field/editor/moveGesture";

/**
 * Turns the new field's line tool on and off with the app's alignment event
 * (#203): L sets it to "line" with the selected marchers, and applying
 * (Shift+Enter) or cancelling (Escape) resets it. The tool keeps no state
 * the app doesn't: its previews go back to the alignment event.
 */
export function useFieldLineTool(editor: FieldEditor) {
    useEffect(() => {
        const sync = ({
            alignmentEvent,
            alignmentEventMarchers,
            setAlignmentEventNewMarcherPages,
        }: ReturnType<typeof useAlignmentEventStore.getState>) => {
            if (alignmentEvent !== "line") {
                editor.setLineTool(null);
                return;
            }
            // A fresh tool has no line: an earlier line's previews mustn't be applied
            setAlignmentEventNewMarcherPages([]);
            editor.setLineTool(
                alignmentEventMarchers.map((marcher) => marcher.id),
            );
        };
        sync(useAlignmentEventStore.getState());
        const unsubscribe = useAlignmentEventStore.subscribe((now, before) => {
            if (
                now.alignmentEvent !== before.alignmentEvent ||
                now.alignmentEventMarchers !== before.alignmentEventMarchers
            )
                sync(now);
        });
        return () => {
            unsubscribe();
            editor.setLineTool(null);
        };
    }, [editor]);
}

/**
 * Gives the line's positions to the alignment event, which the
 * `applyQuickShape` action (Shift+Enter) saves through the timeline's rules,
 * in one undo step. It ignores page ids (timeline
 * writes edit where the selection edits), so none is given.
 */
export function publishLinePreviews(positions: readonly MarcherPosition[]) {
    useAlignmentEventStore.getState().setAlignmentEventNewMarcherPages(
        positions.map(({ id, x, y }) => ({
            marcher_id: id,
            page_id: -1,
            x,
            y,
        })),
    );
}

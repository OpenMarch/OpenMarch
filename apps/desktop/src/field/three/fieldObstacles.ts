import {
    obstaclesOf,
    type FieldObstacles,
    type FieldObstacleSource,
} from "@/components/canvas/fieldLayers";
import type { FieldEditor } from "@/field/editor/fieldEditor";
import type { FieldItems } from "./fieldItems";
import type { FieldMarchers } from "./fieldMarchers";
import { fieldToElement, useFieldViewStore } from "./fieldView";
import { drawnSelectionBox, selectionHandles } from "./selectionFrame";

/**
 * What the touch layout's floating layers keep off on the field (#933), in the field element's px:
 * the selection box with its handles and rotate knob, and the open shape (or selected placed box)
 * with its outline, handles, knob and slots. A finger's reach around each (`FieldObstacles`).
 */
export function readFieldObstacles(
    marchers: FieldMarchers,
    editor: FieldEditor,
    items: FieldItems,
): FieldObstacles {
    const view = useFieldViewStore.getState();
    if (view.width === 0) return { handles: [], areas: [] };
    const onElement = (p: { x: number; y: number }) =>
        fieldToElement(view, p.x, p.y);
    const parts: FieldObstacles[] = [];
    const box = drawnSelectionBox(marchers, editor, items);
    if (box) {
        // The handles sit on the box's corners and edges, and the knob above it
        const handles = Object.values(selectionHandles(box, view.zoom)).map(
            onElement,
        );
        parts.push(obstaclesOf(handles, handles));
    }
    const drawn = editor.modeDrawing();
    if (drawn) {
        const handles = [
            ...drawn.handles,
            ...(drawn.knob ? [drawn.knob.at] : []),
            ...drawn.spots,
        ].map(onElement);
        parts.push(obstaclesOf(handles, (drawn.outline ?? []).map(onElement)));
    }
    return {
        handles: parts.flatMap((p) => p.handles),
        areas: parts.flatMap((p) => p.areas),
    };
}

/** `readFieldObstacles` as a source the pill reads and listens to */
export function fieldObstacleSource(
    marchers: FieldMarchers,
    editor: FieldEditor,
    items: FieldItems,
): FieldObstacleSource {
    return {
        read: () => readFieldObstacles(marchers, editor, items),
        subscribe(listener) {
            const off = [
                marchers.subscribe(listener),
                items.subscribe(listener),
                editor.subscribe(listener),
            ];
            return () => off.forEach((unsubscribe) => unsubscribe());
        },
        busy: () => editor.pressing(),
    };
}

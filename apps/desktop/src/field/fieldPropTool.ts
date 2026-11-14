import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useActionHandler } from "@/shortcuts/useActionHandler";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FieldProperties } from "@openmarch/core";
import { createItemsMutationOptions } from "@/hooks/queries/useItems";
import { useTimingObjects } from "@/hooks";
import { useItemDrawingStore } from "@/stores/ItemDrawingStore";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { getRoundCoordinates2 } from "@/utilities/CoordinateActions";
import { outlineWriteBeatNow } from "@/items/itemOutlineTimeline";
import { newPropFromDrawing } from "@/items/newPropFromDrawing";
import type { DrawnOutline } from "@/items/itemOutlines";
import type { FieldEditor, FieldPoint } from "@/field/editor/fieldEditor";

/**
 * Turns the field's prop tool on and off with the Props panel's Draw
 * (`ItemDrawingStore`, C2.1). Escape turns it off through the canvas's
 * cancel action. While a polygon or arc is drawn corner by corner, its
 * last corner can be taken back, and a polygon finished, as its double-click
 * does: the drawing card's Undo point and Finish in the touch layout
 * (tablet 1.4).
 */
export function useFieldPropTool(editor: FieldEditor) {
    const shape = useSyncExternalStore(
        useCallback((listener) => editor.subscribe(listener), [editor]),
        () => editor.propToolShape(),
    );
    useActionHandler(
        "propFinishDrawing",
        () => {
            editor.finishPropTool();
        },
        { enabled: shape?.canFinish ?? false },
    );
    useActionHandler(
        "propRemoveLastPoint",
        () => {
            editor.removeLastPropPoint();
        },
        { enabled: (shape?.points ?? 0) > 0 },
    );
    useEffect(() => {
        editor.setPropTool(useItemDrawingStore.getState().drawingMode);
        const unsubscribe = useItemDrawingStore.subscribe((now, before) => {
            if (now.drawingMode !== before.drawingMode)
                editor.setPropTool(now.drawingMode);
        });
        return () => {
            unsubscribe();
            editor.setPropTool(null);
        };
    }, [editor]);
}

/**
 * A point snapped as a marcher's coordinates are (`coordinateRounding`), the
 * prop tool's corners; as it is with no field yet.
 */
export function snapToRounding(
    point: FieldPoint,
    grid: FieldProperties | null | undefined,
): FieldPoint {
    if (!grid) return point;
    const rounded = getRoundCoordinates2({
        coordinate: { xPixels: point.x, yPixels: point.y },
        uiSettings: {
            coordinateRounding:
                useUiSettingsStore.getState().uiSettings.coordinateRounding,
        },
        fieldProperties: grid,
    });
    return { x: rounded.xPixels, y: rounded.yPixels };
}

/**
 * Makes the prop the prop tool drew: home at its Outline's center, on field
 * from the beat at or before the playhead, then turns the tool off. Returns
 * the editor's `propDrawn` port.
 */
export function usePropDrawn(): (outline: DrawnOutline) => void {
    const queryClient = useQueryClient();
    const { beats } = useTimingObjects()!;
    const { mutate } = useMutation(createItemsMutationOptions(queryClient));
    const latest = useRef({ beats, mutate });
    useEffect(() => {
        latest.current = { beats, mutate };
    });
    return useCallback((outline) => {
        const { beats, mutate } = latest.current;
        useItemDrawingStore.getState().resetDrawingState();
        const beat = outlineWriteBeatNow(beats);
        if (beat) mutate([newPropFromDrawing(outline, beat.id)]);
    }, []);
}

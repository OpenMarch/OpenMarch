import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useActionHandler } from "@/shortcuts/useActionHandler";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FieldProperties } from "@openmarch/core";
import {
    allItemsQueryOptions,
    createItemsMutationOptions,
} from "@/hooks/queries/useItems";
import { useTimingObjects } from "@/hooks";
import {
    useItemDrawingStore,
    type EquipmentPlacement,
} from "@/stores/ItemDrawingStore";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { getRoundCoordinates2 } from "@/utilities/CoordinateActions";
import { outlineWriteBeatNow } from "@/items/itemOutlineTimeline";
import { newPropFromDrawing } from "@/items/newPropFromDrawing";
import { PIXELS_PER_METER, type DrawnOutline } from "@/items/itemOutlines";
import {
    equipmentRotationAt,
    newEquipment,
    nextEquipmentName,
} from "@/items/newEquipment";
import type { PropToolStamp } from "@/field/editor/propTool";
import type { FieldEditor, FieldPoint } from "@/field/editor/fieldEditor";

/**
 * The footprint equipment is placed with, in field units, turned for where it lands (a podium
 * on the back half is turned around) once the field is known
 */
const stampOf = (
    placing: EquipmentPlacement | null,
    field: () => FieldProperties | null | undefined,
): PropToolStamp | null =>
    placing
        ? {
              widthPixels: placing.variant.footprint.width * PIXELS_PER_METER,
              depthPixels: placing.variant.footprint.depth * PIXELS_PER_METER,
              rotationAt: (center) => {
                  const grid = field();
                  return grid
                      ? equipmentRotationAt(placing.variant, center, grid)
                      : 0;
              },
          }
        : null;

/**
 * Turns the field's prop tool on and off with the Props panel's Draw and
 * Front ensemble (`ItemDrawingStore`, C2.1). Escape turns it off through the
 * canvas's cancel action. While a polygon or arc is drawn corner by corner, its
 * last corner can be taken back, and a polygon finished, as its double-click
 * does: the drawing card's Undo point and Finish in the touch layout
 * (tablet 1.4).
 */
export function useFieldPropTool(
    editor: FieldEditor,
    field: () => FieldProperties | null | undefined,
) {
    const latestField = useRef(field);
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
        latestField.current = field;
    });
    useEffect(() => {
        const fieldNow = () => latestField.current();
        const { drawingMode, placing } = useItemDrawingStore.getState();
        editor.setPropTool(drawingMode, stampOf(placing, fieldNow));
        const unsubscribe = useItemDrawingStore.subscribe((now, before) => {
            if (
                now.drawingMode !== before.drawingMode ||
                now.placing !== before.placing
            )
                editor.setPropTool(
                    now.drawingMode,
                    stampOf(now.placing, fieldNow),
                );
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
 * Makes the prop the prop tool drew, or the equipment it placed: home at its
 * Outline's center, on field from the beat at or before the playhead, then
 * turns the tool off. Returns the editor's `propDrawn` port.
 */
export function usePropDrawn(): (outline: DrawnOutline) => void {
    const queryClient = useQueryClient();
    const { beats } = useTimingObjects()!;
    const { data: items } = useQuery(allItemsQueryOptions());
    const { mutate } = useMutation(createItemsMutationOptions(queryClient));
    const latest = useRef({ beats, items, mutate });
    useEffect(() => {
        latest.current = { beats, items, mutate };
    });
    return useCallback((outline) => {
        const { beats, items, mutate } = latest.current;
        const { placing, resetDrawingState } = useItemDrawingStore.getState();
        resetDrawingState();
        const beat = outlineWriteBeatNow(beats);
        if (!beat) return;
        if (!placing) {
            mutate([newPropFromDrawing(outline, beat.id)]);
            return;
        }
        mutate([
            newEquipment({
                variant: placing.variant,
                name: nextEquipmentName(
                    placing.baseName,
                    (items ?? []).map((item) => item.marcher.name),
                ),
                home: [outline.centerX, outline.centerY],
                beatId: beat.id,
                rotation: outline.rotation,
            }),
        ]);
    }, []);
}

import { create } from "zustand";
import type { FieldModeDrawing } from "./fieldEditor";

/**
 * Drawings under the field mode's own, which aren't that mode's: the closed group path a selected
 * placed box's members walk, under the box's handles (pathways, owner on #683), and the group paths
 * Paths All draws as objects at the playhead (pathways step 3a). Set by whoever chooses the field's
 * mode (`useShapeFieldModes`), so the field imports nothing of pathways.
 */
export const useFieldUnderlayStore = create<{
    readonly drawing: FieldModeDrawing | null;
    readonly objects: readonly FieldModeDrawing[];
}>(() => ({ drawing: null, objects: [] }));

export function setFieldUnderlay(drawing: FieldModeDrawing | null): void {
    if (useFieldUnderlayStore.getState().drawing !== drawing)
        useFieldUnderlayStore.setState({ drawing });
}

/** The path objects' drawings (pathways step 3a); an equal list keeps the old one */
export function setFieldObjects(objects: readonly FieldModeDrawing[]): void {
    const now = useFieldUnderlayStore.getState().objects;
    if (now.length === objects.length && now.every((d, i) => d === objects[i]))
        return;
    useFieldUnderlayStore.setState({ objects });
}

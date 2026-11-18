import { create } from "zustand";
import type { BarRect } from "./editorPlacement";

/**
 * Where the shape's floating editor is going on the field (its spring's target, in the field
 * element's px), or null while it isn't shown. Another floating bar stacks clear of it
 * (`stackedPlacement`): the path bar does (pathways interaction round 4).
 */
export const useShapeEditorRect = create<{ rect: BarRect | null }>(() => ({
    rect: null,
}));

export function setShapeEditorRect(rect: BarRect | null): void {
    const now = useShapeEditorRect.getState().rect;
    if (
        now === rect ||
        (now &&
            rect &&
            now.left === rect.left &&
            now.top === rect.top &&
            now.width === rect.width &&
            now.height === rect.height)
    )
        return;
    useShapeEditorRect.setState({ rect });
}

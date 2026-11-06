import { useSyncExternalStore } from "react";
import {
    activeFieldEditor,
    subscribeActiveFieldEditor,
} from "@/field/editor/activeFieldEditor";

/** The field gestures that change where the selected marchers are */
const EDIT_GESTURES = new Set(["move", "scale", "rotate"]);

const fieldEditing = () =>
    EDIT_GESTURES.has(activeFieldEditor()?.activeGesture() ?? "");

/** Calls `listener` when the field on screen, or its gesture, changes */
function subscribeFieldEditing(listener: () => void): () => void {
    let unsubscribeEditor = activeFieldEditor()?.subscribe(listener);
    const unsubscribeActive = subscribeActiveFieldEditor(() => {
        unsubscribeEditor?.();
        unsubscribeEditor = activeFieldEditor()?.subscribe(listener);
        listener();
    });
    return () => {
        unsubscribeActive();
        unsubscribeEditor?.();
    };
}

/** Whether a field drag is moving, scaling or rotating the selected marchers right now */
export function useFieldEditing(): boolean {
    return useSyncExternalStore(subscribeFieldEditing, fieldEditing);
}

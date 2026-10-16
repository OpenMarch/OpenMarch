import type { FieldEditor } from "./fieldEditor";

let active: FieldEditor | null = null;
const listeners = new Set<() => void>();

/**
 * The editor of the field on screen, for app actions that act on the field
 * (Ctrl/Cmd+A, the inspector's rotation), or null when none is on screen.
 */
export const activeFieldEditor = (): FieldEditor | null => active;

/** Calls `listener` when the field on screen changes. Returns the unsubscribe. */
export function subscribeActiveFieldEditor(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Called by the field that owns `editor` when it mounts (`editor`) and unmounts (null). */
export function setActiveFieldEditor(editor: FieldEditor | null) {
    active = editor;
    for (const listener of listeners) listener();
}

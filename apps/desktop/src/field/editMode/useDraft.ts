import { useState } from "react";

/**
 * A value being edited (text typed into an input, a switch flipped), starting from the stored
 * value. Whenever the stored value changes (undo or redo, an edit from elsewhere, this input's own
 * save) the draft starts over from it, so an input never shows a value the field no longer has
 * (B1).
 */
export function useDraft<T extends string | boolean>(
    stored: T,
): [T, (value: T) => void] {
    const [draft, setDraft] = useState<T>(stored);
    const [synced, setSynced] = useState<T>(stored);
    if (synced !== stored) {
        // Adjusting state while rendering, as React suggests for state that follows a prop
        setSynced(stored);
        setDraft(stored);
        return [stored, setDraft];
    }
    return [draft, setDraft];
}

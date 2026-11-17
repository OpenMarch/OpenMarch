import { create } from "zustand";
import { useInputModeStore } from "@/stores/InputModeStore";

/**
 * What a one-finger or pen drag that starts on empty field does (tablet plan
 * 1.3), chosen on the touch pill and kept on this device:
 * - "auto" (the default): a finger moves the view, a pen draws a selection
 *   box. A finger selects with press-and-hold, then drag.
 * - "box", "lasso": finger and pen select ("finger selects", decision 1):
 *   one finger draws a box or a lasso, two fingers move the view.
 * - "pan": finger and pen move the view.
 *
 * Two fingers always move the view; a drag that starts on a marcher or the
 * selection always moves it. A mouse is never affected.
 */
export type FieldDragMode = "auto" | "box" | "lasso" | "pan";

/** What a particular drag does, once the mode and the pointer are known */
export type FieldDragAction = "box" | "lasso" | "pan";

export const FIELD_DRAG_MODE_KEY = "openmarch:fieldDragMode";
/** Set once the stored mode has been read under the "auto" default */
export const FIELD_DRAG_MODE_MIGRATED_KEY = "openmarch:fieldDragMode:v2";
const MODES: FieldDragMode[] = ["auto", "box", "lasso", "pan"];

export const parseFieldDragMode = (raw: string | null): FieldDragMode =>
    MODES.includes(raw as FieldDragMode) ? (raw as FieldDragMode) : "auto";

/**
 * The stored mode under the new default. "box" was the old default, so a
 * stored "box" from before is read as "auto" (once).
 */
export function migrateFieldDragMode(
    raw: string | null,
    migrated: boolean,
): FieldDragMode {
    if (!migrated && raw === "box") return "auto";
    return parseFieldDragMode(raw);
}

/** The mode after this one, for a button that cycles through them */
export const nextFieldDragMode = (mode: FieldDragMode): FieldDragMode =>
    MODES[(MODES.indexOf(mode) + 1) % MODES.length];

/** What a drag from empty field does for this pointer under this mode */
export function fieldDragAction(
    mode: FieldDragMode,
    pointer: "touch" | "pen",
): FieldDragAction {
    if (mode === "auto") return pointer === "touch" ? "pan" : "box";
    return mode;
}

/**
 * The mode in force now: the stored one in the touch layout. The mouse layout
 * shows no pill to say an override is on, so there it is always Auto (a pen
 * draws a box, as a mouse does).
 */
export const activeFieldDragMode = (): FieldDragMode =>
    useInputModeStore.getState().mode === "touch"
        ? useFieldDragModeStore.getState().mode
        : "auto";

/**
 * Whether a finger held still on empty field, then dragged, draws a box: yes
 * wherever its plain drag would move the view (Auto, Pan).
 */
export const holdDragSelects = (mode: FieldDragMode): boolean =>
    fieldDragAction(mode, "touch") === "pan";

const load = (): FieldDragMode => {
    try {
        const raw = localStorage.getItem(FIELD_DRAG_MODE_KEY);
        const migrated =
            localStorage.getItem(FIELD_DRAG_MODE_MIGRATED_KEY) !== null;
        const mode = migrateFieldDragMode(raw, migrated);
        if (!migrated) {
            localStorage.setItem(FIELD_DRAG_MODE_MIGRATED_KEY, "1");
            if (raw !== null) localStorage.setItem(FIELD_DRAG_MODE_KEY, mode);
        }
        return mode;
    } catch {
        return "auto";
    }
};

interface FieldDragModeState {
    mode: FieldDragMode;
    setMode: (mode: FieldDragMode) => void;
}

export const useFieldDragModeStore = create<FieldDragModeState>((set) => ({
    mode: load(),
    setMode: (mode) => {
        try {
            localStorage.setItem(FIELD_DRAG_MODE_KEY, mode);
            localStorage.setItem(FIELD_DRAG_MODE_MIGRATED_KEY, "1");
        } catch {
            // Storage may be unavailable; keep it for this session
        }
        set({ mode });
    },
}));

import { create } from "zustand";

/**
 * What a one-finger (or pen) drag that starts on empty field does in touch
 * mode: draw a selection box (the default), draw a freeform lasso, or move the
 * view. Two fingers always move the view, and a long press still starts the
 * lasso.
 */
export type FieldDragMode = "box" | "lasso" | "pan";

export const FIELD_DRAG_MODE_KEY = "openmarch:fieldDragMode";
const MODES: FieldDragMode[] = ["box", "lasso", "pan"];

export const parseFieldDragMode = (raw: string | null): FieldDragMode =>
    MODES.includes(raw as FieldDragMode) ? (raw as FieldDragMode) : "box";

/** The mode after this one, for a button that cycles through them */
export const nextFieldDragMode = (mode: FieldDragMode): FieldDragMode =>
    MODES[(MODES.indexOf(mode) + 1) % MODES.length];

const load = (): FieldDragMode => {
    try {
        return parseFieldDragMode(localStorage.getItem(FIELD_DRAG_MODE_KEY));
    } catch {
        return "box";
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
        } catch {
            // Storage may be unavailable; keep it for this session
        }
        set({ mode });
    },
}));

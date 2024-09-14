import { create } from "zustand";

export const CursorModes = ["default", "line"] as const;
export type CursorMode = (typeof CursorModes)[number];

interface CursorModeStoreState {
    cursorMode: CursorMode;
}
interface CursorModeStoreActions {
    setCursorMode: (cursorMode: CursorMode) => void;
}
interface CursorModeStoreInterface
    extends CursorModeStoreState,
        CursorModeStoreActions {}

export const useCursorModeStore = create<CursorModeStoreInterface>((set) => ({
    cursorMode: "default",

    /**
     * Set the cursorMode
     *
     * @param newCursorMode the new cursorMode
     */
    setCursorMode: (newCursorMode) => {
        set({ cursorMode: newCursorMode });
    },
}));

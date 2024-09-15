import { create } from "zustand";

export const CursorModes = ["default", "line"] as const;
export type CursorMode = (typeof CursorModes)[number];

interface CursorModeStoreInterface {
    cursorMode: CursorMode;
    setCursorMode: (cursorMode: CursorMode) => void;
}

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

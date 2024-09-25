import Marcher from "@/global/classes/Marcher";
import { create } from "zustand";

export const CursorModes = ["default", "line"] as const;
export type CursorMode = (typeof CursorModes)[number];

export interface CursorModeState {
    cursorMode: CursorMode;
    /** The marchers associated with this cursor mode event change */
    cursorModeMarchers: Marcher[];
}

interface CursorModeStoreInterface extends CursorModeState {
    setCursorMode: (
        cursorMode: CursorMode,
        cursorModeMarchers?: Marcher[]
    ) => void;
}

export const useCursorModeStore = create<CursorModeStoreInterface>((set) => ({
    cursorMode: "default",
    cursorModeMarchers: [],

    /**
     * Set the cursorMode
     *
     * @param newCursorMode the new cursorMode
     */
    setCursorMode: (cursorMode, cursorModeMarchers = []) => {
        set({ cursorMode, cursorModeMarchers });
    },
}));

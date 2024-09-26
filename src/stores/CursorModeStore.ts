import Marcher from "@/global/classes/Marcher";
import MarcherPage from "@/global/classes/MarcherPage";
import { create } from "zustand";

export const CursorModes = ["default", "line"] as const;
export type CursorMode = (typeof CursorModes)[number];

export interface CursorModeState {
    cursorMode: CursorMode;
    /** The marchers associated with this cursor mode event change */
    cursorModeMarchers: Marcher[];
    cursorModeNewMarcherPages: MarcherPage[];
}

interface CursorModeStoreInterface extends CursorModeState {
    resetCursorMode: () => void;
    setCursorMode: (cursorMode: CursorMode) => void;
    setCursorModeMarchers: (cursorModeMarchers: Marcher[]) => void;
    setCursorModeNewMarcherPages: (
        cursorModeNewMarcherPages: MarcherPage[]
    ) => void;
}

export const useCursorModeStore = create<CursorModeStoreInterface>((set) => ({
    cursorMode: "default",
    cursorModeMarchers: [],
    cursorModeNewMarcherPages: [],

    /**
     * Reset the cursor mode to default and clear the marchers and marcher pages associated with this cursor mode event change
     */
    resetCursorMode: () => {
        set({
            cursorMode: "default",
            cursorModeMarchers: [],
            cursorModeNewMarcherPages: [],
        });
    },

    /**
     * Set the cursorMode
     *
     * @param newCursorMode the new cursorMode
     */
    setCursorMode: (cursorMode: CursorMode) => {
        set({ cursorMode });
    },

    /**
     * Set the marchers associated with this cursor mode event change
     *
     * @param cursorModeMarchers
     */
    setCursorModeMarchers: (cursorModeMarchers: Marcher[]) => {
        set({ cursorModeMarchers });
    },

    /**
     * Set the new marcher pages associated with this cursor mode event
     *
     * @param cursorModeNewMarcherPages
     */
    setCursorModeNewMarcherPages: (
        cursorModeNewMarcherPages: MarcherPage[]
    ) => {
        set({ cursorModeNewMarcherPages });
    },
}));

import { type StateCreator } from "zustand";
import { CursorMode } from "./useCursorModeStore";

interface CursorModeStoreState {
    cursorMode: CursorMode;
}
interface CursorModeStoreActions {
    setCursorMode: (cursorMode: CursorMode) => void;
}
export interface CursorModeStoreInterface extends CursorModeStoreState, CursorModeStoreActions { }

/**
 * The UI settings store is where all editable UI settings are stored.
 */
export const cursorModeStoreCreator: StateCreator<CursorModeStoreState & CursorModeStoreActions> = (set) => ({
    cursorMode: 'default',

    /**
     * Set the cursorMode
     *
     * @param newCursorMode the new cursorMode
     */
    setCursorMode: (newCursorMode) => {
        set({ cursorMode: newCursorMode });
    }
});

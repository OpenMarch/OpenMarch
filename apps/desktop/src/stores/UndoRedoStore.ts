import { create } from "zustand";

interface UndoRedoState {
    canUndo: boolean;
    canRedo: boolean;
    setCanUndo: (canUndo: boolean) => void;
    setCanRedo: (canRedo: boolean) => void;
    updateUndoRedo: () => Promise<void>;
}

export const useUndoRedoStore = create<UndoRedoState>((set) => ({
    canUndo: false,
    canRedo: false,
    setCanUndo: (canUndo) => set({ canUndo }),
    setCanRedo: (canRedo) => set({ canRedo }),
    updateUndoRedo: async () => {
        const undoLength = await window.electron.getUndoStackLength();
        const redoLength = await window.electron.getRedoStackLength();
        set({
            canUndo: undoLength.data > 0,
            canRedo: redoLength.data > 0,
        });
    },
}));

import { create } from "zustand";

type SelectionStore = {
    selectedShapePageIds: number[];
    setSelectedShapePageIds: (ids: number[]) => void;
};

export const useSelectionStore = create<SelectionStore>((set) => ({
    selectedShapePageIds: [],
    setSelectedShapePageIds: (ids) => set({ selectedShapePageIds: ids }),
}));

import { create } from "zustand";

/** Which prop's outline is currently being edited on the canvas, if any. */
type PropShapeEditStore = {
    propId: number | null;
    geometryId: number | null;
    pageId: number | null;
    setEditing: (propId: number, geometryId: number, pageId: number) => void;
    clearEditing: () => void;
};

export const usePropShapeEditStore = create<PropShapeEditStore>((set) => ({
    propId: null,
    geometryId: null,
    pageId: null,
    setEditing: (propId, geometryId, pageId) =>
        set({ propId, geometryId, pageId }),
    clearEditing: () => set({ propId: null, geometryId: null, pageId: null }),
}));

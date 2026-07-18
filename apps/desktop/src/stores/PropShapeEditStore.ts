import { create } from "zustand";

type SavePropShapeEditCallback = (geometryId: number) => void;

type PropShapeEditStore = {
    propId: number | null;
    geometryId: number | null;
    pageId: number | null;
    setEditing: (propId: number, geometryId: number, pageId: number) => void;
    clearEditing: () => void;
    savePropShapeEditCallback: SavePropShapeEditCallback | null;
    setSavePropShapeEditCallback: (
        cb: SavePropShapeEditCallback | null,
    ) => void;
};

export const usePropShapeEditStore = create<PropShapeEditStore>((set) => ({
    propId: null,
    geometryId: null,
    pageId: null,
    setEditing: (propId, geometryId, pageId) =>
        set({ propId, geometryId, pageId }),
    clearEditing: () => set({ propId: null, geometryId: null, pageId: null }),
    savePropShapeEditCallback: null,
    setSavePropShapeEditCallback: (cb) =>
        set({ savePropShapeEditCallback: cb }),
}));

import { ShapePage } from "electron/database/tables/ShapePageTable";
import { create } from "zustand";

interface ShapePageStoreInterface {
    /**
     * The map of marcher shapes. The key is the shape's ID.
     */
    shapePages: ShapePage[];
    fetchShapePages: () => Promise<void>;
}

export const useShapePageStore = create<ShapePageStoreInterface>((set) => ({
    shapePages: [],

    fetchShapePages: async () => {
        const allShapePages = await window.electron.getShapePages();
        let newShapePages: ShapePage[] = [];
        if (!allShapePages.success) {
            console.error(allShapePages.error);
        } else {
            newShapePages = allShapePages.data;
        }
        set({ shapePages: newShapePages });
    },
}));

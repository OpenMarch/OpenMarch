import { MarcherShape } from "@/global/classes/canvasObjects/MarcherShape";
import type { ShapePage } from "electron/database/tables/ShapePageTable";
import { create } from "zustand";

interface ShapePageStoreInterface {
    shapePages: ShapePage[];
    fetchShapePages: () => Promise<void>;
    selectedMarcherShapes: MarcherShape[];
    setSelectedMarcherShapes: (marcherShapes: MarcherShape[]) => void;
}

export const useShapePageStore = create<ShapePageStoreInterface>(
    (set, get) => ({
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

            // Refresh the selected marcher shapes
            const selectedMarcherShapes = get().selectedMarcherShapes;
            set({ selectedMarcherShapes: selectedMarcherShapes });
        },
        selectedMarcherShapes: [],
        setSelectedMarcherShapes: (marcherShapes) => {
            set({ selectedMarcherShapes: marcherShapes });
        },
    }),
);

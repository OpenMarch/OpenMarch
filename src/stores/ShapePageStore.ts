import { ShapePage } from "electron/database/tables/ShapePageTable";
import { create } from "zustand";

interface ShapePageStoreInterface {
    /**
     * The map of marcher shapes. The key is the shape's ID.
     */
    shapePages: ShapePage[];
    fetchShapePages: () => Promise<void>;
    selectedShapePages: ShapePage[];
    setSelectedShapePages: (shapePages: ShapePage[]) => void;
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

            // Update the selected shape page so that its values are current
            const selectedShapePages: ShapePage[] = get().selectedShapePages;
            const newSelectedShapePages: ShapePage[] = [];
            if (selectedShapePages.length > 0) {
                const updatedShapePageMap = new Map(
                    newShapePages.map((sp) => [sp.id, sp]),
                );
                for (const selectedShapePage of selectedShapePages) {
                    const newShapePage = updatedShapePageMap.get(
                        selectedShapePage.id,
                    );
                    if (newShapePage) newSelectedShapePages.push(newShapePage);
                }
                set({ selectedShapePages: newSelectedShapePages });
            }
        },

        selectedShapePages: [],
        setSelectedShapePages: (shapePages) => {
            if (shapePages.length > 0) {
                const shapePageIds = new Set(
                    get().shapePages.map((shapePage) => shapePage.id),
                );
                for (const shapePage of shapePages) {
                    if (!shapePageIds.has(shapePage.id)) {
                        console.error(
                            `ShapePage with id ${shapePage.id} not found in shapePages`,
                        );
                    }
                }
            }
            set({ selectedShapePages: shapePages });
        },
    }),
);

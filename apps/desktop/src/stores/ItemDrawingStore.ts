import { create } from "zustand";
import type { OutlineType } from "@/db-functions/items";
import type { PitVariant } from "@/view3d/core/pit/catalog";

/** The Outline being drawn on the canvas to create a prop, or null when not drawing. */
export type ItemDrawingMode = OutlineType | null;

/**
 * Front ensemble equipment being placed on the field with a click: its model, and the name its
 * number follows ("Marimba" for "Marimba 2").
 */
export type EquipmentPlacement = {
    readonly variant: PitVariant;
    readonly baseName: string;
};

type ItemDrawingStore = {
    drawingMode: ItemDrawingMode;
    /** Set while placing equipment, whose footprint is its model's; the mode is then a rectangle */
    placing: EquipmentPlacement | null;
    setDrawingMode: (mode: ItemDrawingMode) => void;
    /** Turns the tool on to place one piece of equipment */
    placeEquipment: (placement: EquipmentPlacement) => void;
    resetDrawingState: () => void;
};

export const useItemDrawingStore = create<ItemDrawingStore>((set) => ({
    drawingMode: null,
    placing: null,
    setDrawingMode: (mode) => set({ drawingMode: mode, placing: null }),
    placeEquipment: (placement) =>
        set({ drawingMode: "rectangle", placing: placement }),
    resetDrawingState: () => set({ drawingMode: null, placing: null }),
}));

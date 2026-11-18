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
    readonly kind: "equipment";
    readonly variant: PitVariant;
    readonly baseName: string;
};

/**
 * An imported model being placed on the field as a prop (fork #999): the show asset it names
 * (`items.model`), its footprint from the sidecar, and the name its number follows ("Chair 2").
 */
export type ModelPlacement = {
    readonly kind: "model";
    /** `library:<id>@<version hash>` */
    readonly modelValue: string;
    /** In meters */
    readonly footprint: {
        readonly width: number;
        readonly depth: number;
        readonly height: number;
    };
    readonly baseName: string;
};

export type Placement = EquipmentPlacement | ModelPlacement;

type ItemDrawingStore = {
    drawingMode: ItemDrawingMode;
    /**
     * Set while placing equipment or an imported model, whose footprint is its model's; the mode
     * is then a rectangle
     */
    placing: Placement | null;
    setDrawingMode: (mode: ItemDrawingMode) => void;
    /** Turns the tool on to place one piece of equipment */
    placeEquipment: (placement: Omit<EquipmentPlacement, "kind">) => void;
    /** Turns the tool on to place one imported model as a prop */
    placeModel: (placement: Omit<ModelPlacement, "kind">) => void;
    resetDrawingState: () => void;
};

export const useItemDrawingStore = create<ItemDrawingStore>((set) => ({
    drawingMode: null,
    placing: null,
    setDrawingMode: (mode) => set({ drawingMode: mode, placing: null }),
    placeEquipment: (placement) =>
        set({
            drawingMode: "rectangle",
            placing: { kind: "equipment", ...placement },
        }),
    placeModel: (placement) =>
        set({
            drawingMode: "rectangle",
            placing: { kind: "model", ...placement },
        }),
    resetDrawingState: () => set({ drawingMode: null, placing: null }),
}));

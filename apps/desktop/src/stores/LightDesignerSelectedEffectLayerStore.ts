import { create } from "zustand";
import { createSelectors } from "./utils";

type LightDesignerSelectedEffectLayerStore = {
    selectedLayerId: number | null;
    selectLayer: (layerId: number) => void;
    clearSelectedLayer: () => void;
};

const lightDesignerSelectedEffectLayerStore =
    create<LightDesignerSelectedEffectLayerStore>((set) => ({
        selectedLayerId: null,
        selectLayer: (layerId) => set({ selectedLayerId: layerId }),
        clearSelectedLayer: () => set({ selectedLayerId: null }),
    }));

export const useLightDesignerSelectedEffectLayerStore = createSelectors(
    lightDesignerSelectedEffectLayerStore,
);

import { create } from "zustand";
import { combine } from "zustand/middleware";
import { createSelectors } from "./utils";

export type LightingEffectSelection = {
    effectId: number;
    sceneId: number;
};

const lightDesignerSelectedEffectStore = create(
    combine(
        { selectedEffect: null as LightingEffectSelection | null },
        (set) => ({
            selectEffect: (payload: LightingEffectSelection) =>
                set((state) =>
                    state.selectedEffect?.effectId === payload.effectId &&
                    state.selectedEffect?.sceneId === payload.sceneId
                        ? { selectedEffect: null }
                        : { selectedEffect: payload },
                ),
            clearSelectedEffect: () => set({ selectedEffect: null }),
        }),
    ),
);

export const useLightDesignerSelectedEffectStore = createSelectors(
    lightDesignerSelectedEffectStore,
);

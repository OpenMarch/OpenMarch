import type { LightingEffectLayerRect } from "@/db-functions";
import { create } from "zustand";
import { createSelectors } from "./utils";

export type LightDesignerEffectLayerDrawState =
    | { status: "idle" }
    | { status: "drawing"; effectId: number }
    | {
          status: "completed";
          effectId: number;
          rect: LightingEffectLayerRect;
      };

type LightDesignerEffectLayerDrawStore = {
    drawState: LightDesignerEffectLayerDrawState;
    startDrawMode: (effectId: number) => void;
    cancelDrawMode: () => void;
    completeDraw: (rect: LightingEffectLayerRect) => void;
};

const lightDesignerEffectLayerDrawStore =
    create<LightDesignerEffectLayerDrawStore>((set) => ({
        drawState: { status: "idle" },
        startDrawMode: (effectId) =>
            set({ drawState: { status: "drawing", effectId } }),
        cancelDrawMode: () => set({ drawState: { status: "idle" } }),
        completeDraw: (rect) =>
            set((state) =>
                state.drawState.status === "drawing"
                    ? {
                          drawState: {
                              status: "completed",
                              effectId: state.drawState.effectId,
                              rect,
                          },
                      }
                    : state,
            ),
    }));

export const useLightDesignerEffectLayerDrawStore = createSelectors(
    lightDesignerEffectLayerDrawStore,
);

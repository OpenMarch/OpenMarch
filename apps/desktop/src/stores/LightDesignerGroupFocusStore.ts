import { create } from "zustand";
import { combine } from "zustand/middleware";
import { createSelectors } from "./utils";

export type LightingGroupFocus = {
    groupId: number;
    sceneId: number;
};

const lightDesignerGroupFocusStore = create(
    combine({ groupFocus: null as LightingGroupFocus | null }, (set) => ({
        toggleGroupFocus: (payload: LightingGroupFocus) =>
            set((state) =>
                state.groupFocus?.groupId === payload.groupId
                    ? { groupFocus: null }
                    : { groupFocus: payload },
            ),
        clearGroupFocus: () => set({ groupFocus: null }),
    })),
);

export const useLightDesignerGroupFocusStore = createSelectors(
    lightDesignerGroupFocusStore,
);

import { create } from "zustand";
import { combine } from "zustand/middleware";
import { createSelectors } from "./utils";

export type LightingGroupFocus = {
    sceneId: number;
    groupIds: readonly number[];
};

type ToggleGroupFocusPayload = {
    groupId: number;
    sceneId: number;
};

const lightDesignerGroupFocusStore = create(
    combine({ groupFocus: null as LightingGroupFocus | null }, (set) => ({
        setGroupFocus: (payload: LightingGroupFocus) =>
            set({ groupFocus: payload }),
        toggleGroupFocus: (payload: ToggleGroupFocusPayload) =>
            set((state) => {
                const gf = state.groupFocus;
                const isOnlyThis =
                    gf != null &&
                    gf.sceneId === payload.sceneId &&
                    gf.groupIds.length === 1 &&
                    gf.groupIds[0] === payload.groupId;
                if (isOnlyThis) return { groupFocus: null };
                return {
                    groupFocus: {
                        sceneId: payload.sceneId,
                        groupIds: [payload.groupId],
                    },
                };
            }),
        clearGroupFocus: () => set({ groupFocus: null }),
    })),
);

export const useLightDesignerGroupFocusStore = createSelectors(
    lightDesignerGroupFocusStore,
);

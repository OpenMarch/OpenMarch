import { create } from "zustand";
import { combine } from "zustand/middleware";
import { createSelectors } from "./utils";

export type LightingGroupFocus = {
    sceneId: number;
    groupIds: readonly number[];
};

type GroupFocusPayload = {
    groupId: number;
    sceneId: number;
};

const lightDesignerGroupFocusStore = create(
    combine({ groupFocus: null as LightingGroupFocus | null }, (set) => ({
        setGroupFocus: (payload: LightingGroupFocus) =>
            set({ groupFocus: payload }),
        addGroupToFocus: (payload: GroupFocusPayload) =>
            set((state) => {
                const gf = state.groupFocus;
                if (
                    gf != null &&
                    gf.sceneId === payload.sceneId &&
                    gf.groupIds.includes(payload.groupId)
                ) {
                    const nextGroupIds = gf.groupIds.filter(
                        (id) => id !== payload.groupId,
                    );
                    if (nextGroupIds.length === 0) {
                        return { groupFocus: null };
                    }
                    return {
                        groupFocus: {
                            sceneId: payload.sceneId,
                            groupIds: nextGroupIds,
                        },
                    };
                }
                if (gf != null && gf.sceneId === payload.sceneId) {
                    return {
                        groupFocus: {
                            sceneId: payload.sceneId,
                            groupIds: [...gf.groupIds, payload.groupId],
                        },
                    };
                }
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

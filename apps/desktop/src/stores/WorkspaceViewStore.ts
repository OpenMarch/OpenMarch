import { create } from "zustand";
import { combine } from "zustand/middleware";
import { createSelectors } from "./utils";

export type WorkspaceViewMode = "editor" | "lightDesigner";

const workspaceViewStore = create(
    combine({ mode: "editor" as WorkspaceViewMode }, (set) => ({
        setMode: (mode: WorkspaceViewMode) => set({ mode }),
    })),
);

export const useWorkspaceViewStore = createSelectors(workspaceViewStore);

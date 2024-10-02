import { create } from "zustand";
import { ReactNode } from "react";

type SidebarModalStore = {
    isSidebarModalOpen: boolean;
    content: ReactNode;
    toggleOpen: () => void;
    setContent: (content: ReactNode) => void;
};

// stores its open state and the content inside

export const useSidebarModalStore = create<SidebarModalStore>((set) => ({
    isSidebarModalOpen: false,
    content: (
        <h4 className="text-h4 text-red">Sidebar modal failed to render</h4>
    ), // default
    toggleOpen: () =>
        set((state) => ({
            isSidebarModalOpen: !state.isSidebarModalOpen,
        })),
    setContent: (newContent) =>
        set(() => ({
            content: newContent,
        })),
}));

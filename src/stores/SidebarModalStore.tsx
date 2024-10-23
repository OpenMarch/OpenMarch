import { create } from "zustand";
import { ReactNode } from "react";

type SidebarModalStore = {
    isOpen: boolean;
    content: ReactNode;
    toggleOpen: () => void;
    setContent: (content: ReactNode) => void;
};

// stores its open state and the content inside

export const useSidebarModalStore = create<SidebarModalStore>((set) => ({
    isOpen: false,
    content: (
        <h4 className="text-h4 text-red">
            Sidebar modal content failed to render
        </h4>
    ), // default
    toggleOpen: () =>
        set((state) => ({
            isOpen: !state.isOpen,
        })),
    setContent: (newContent) =>
        set(() => ({
            content: newContent,
        })),
}));

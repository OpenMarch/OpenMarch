import { create } from "zustand";
import { ReactNode } from "react";

type SidebarModalStore = {
    isOpen: boolean;
    content: ReactNode;
    toggleOpen: () => void;
    setOpen: (open: boolean) => void;
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
    setOpen: (open) =>
        set(() => ({
            isOpen: open,
        })),
    setContent: (newContent) =>
        set(() => ({
            content: newContent,
        })),
}));

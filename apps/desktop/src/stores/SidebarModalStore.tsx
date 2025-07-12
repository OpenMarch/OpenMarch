import { create } from "zustand";
import { ReactNode } from "react";

type SidebarModalStore = {
    isOpen: boolean;
    content: ReactNode;
    contentId: string;
    width: "default" | "wide" | "fit";
    toggleOpen: () => void;
    setOpen: (open: boolean) => void;
    setWidth: (width: "default" | "wide" | "fit") => void;
    setContent: (
        content: ReactNode,
        id: string,
        width?: "default" | "wide" | "fit",
    ) => void;
};

// stores its open state and the content inside

export const useSidebarModalStore = create<SidebarModalStore>((set) => ({
    isOpen: false,
    content: (
        <h4 className="text-h4 text-red">
            Sidebar modal content failed to render
        </h4>
    ), // default
    contentId: "",
    width: "default",
    toggleOpen: () =>
        set((state) => ({
            isOpen: !state.isOpen,
        })),
    setOpen: (open) =>
        set(() => ({
            isOpen: open,
        })),
    setWidth: (newWidth) => set(() => ({ width: newWidth })),
    setContent: (newContent, id, width) =>
        set((state) => ({
            content: newContent,
            contentId: id,
            width: width ?? state.width,
        })),
}));

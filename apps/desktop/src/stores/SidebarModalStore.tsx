import { create } from "zustand";
import { ReactNode } from "react";

type SidebarModalStore = {
    isOpen: boolean;
    content: ReactNode;
    contentId: string;
    highlightSelection: boolean;
    toggleOpen: () => void;
    setOpen: (open: boolean) => void;
    setContent: (content: ReactNode, id: string) => void;
    setHighlightSelection: (highlight: boolean) => void;
};

// stores its open state and the content inside

export const useSidebarModalStore = create<SidebarModalStore>((set) => ({
    isOpen: false,
    highlightSelection: false,
    content: (
        <h4 className="text-h4 text-red">
            Sidebar modal content failed to render
        </h4>
    ), // default
    contentId: "",
    toggleOpen: () =>
        set((state) => ({
            isOpen: !state.isOpen,
        })),
    setOpen: (open) =>
        set(() => ({
            isOpen: open,
        })),
    setContent: (newContent, id) =>
        set(() => ({
            content: newContent,
            contentId: id,
        })),
    setHighlightSelection: (highlight) =>
        set(() => ({
            highlightSelection: highlight,
        })),
}));

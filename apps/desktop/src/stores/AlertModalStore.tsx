import { ReactNode } from "react";
import { create } from "zustand";

type AlertModalStore = {
    isOpen: boolean;
    title: string;
    content: ReactNode;
    toggleOpen: () => void;
    setOpen: (open: boolean) => void;
    setTitle: (title: string) => void;
    setContent: (content: ReactNode) => void;
};

export const useAlertModalStore = create<AlertModalStore>((set) => ({
    isOpen: false,
    title: "Alert",
    content: (
        <h4 className="text-h4 text-red">
            Alert modal content failed to render
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
    setTitle: (newTitle) =>
        set(() => ({
            title: newTitle,
        })),
    setContent: (newContent) =>
        set(() => ({
            content: newContent,
        })),
}));

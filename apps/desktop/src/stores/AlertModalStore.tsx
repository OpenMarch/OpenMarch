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
    title: "fileAccessDialogError.renderFail.title",
    content: <p>Alert Dialog Modal failed to render</p>, // default
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

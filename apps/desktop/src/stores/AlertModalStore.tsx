import { ReactNode } from "react";
import { create } from "zustand";

type AlertModalStore = {
    isOpen: boolean;
    title: string;
    content: ReactNode;
    actions: ReactNode;
    toggleOpen: () => void;
    setOpen: (open: boolean) => void;
    setTitle: (title: string) => void;
    setContent: (content: ReactNode) => void;
    setActions: (actions: ReactNode) => void;
};

export const useAlertModalStore = create<AlertModalStore>((set) => ({
    isOpen: false,
    title: "fileAccessDialogError.renderFail.title",
    content: <p>Alert Dialog Modal failed to render</p>, // default
    actions: undefined,
    toggleOpen: () =>
        set((state) => ({
            isOpen: !state.isOpen,
            actions: state.isOpen ? state.actions : undefined,
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
    setActions: (newActions) =>
        set(() => ({
            actions: newActions,
        })),
}));

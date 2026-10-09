import { create } from "zustand";

/** Whether the keyboard shortcuts list is open (UI-17 follow-up: `?`, or Help in the menu) */
export const useShortcutsDialogStore = create<{
    readonly open: boolean;
    readonly setOpen: (open: boolean) => void;
}>((set) => ({
    open: false,
    setOpen: (open) => set({ open }),
}));

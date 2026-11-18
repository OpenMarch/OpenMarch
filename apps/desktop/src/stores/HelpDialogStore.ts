import { create } from "zustand";

/** Whether the Help window is open (the ? button in the title bar, F1, or Help › Get Help…) */
export const useHelpDialogStore = create<{
    readonly open: boolean;
    readonly setOpen: (open: boolean) => void;
}>((set) => ({
    open: false,
    setOpen: (open) => set({ open }),
}));

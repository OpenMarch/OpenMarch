import { create } from "zustand";

/** Whether What's new is open on its own (Help › What's new, or the web menu), over the app */
export const useWhatsNewDialogStore = create<{
    readonly open: boolean;
    readonly setOpen: (open: boolean) => void;
}>((set) => ({
    open: false,
    setOpen: (open) => set({ open }),
}));

import { create } from "zustand";

/** Whether the web build's welcome modal is open. */
export const useWebWelcomeStore = create<{
    open: boolean;
    setOpen: (open: boolean) => void;
}>((set) => ({
    open: false,
    setOpen: (open) => set({ open }),
}));

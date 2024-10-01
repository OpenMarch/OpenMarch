import { create } from "zustand";

type SidebarModalStore = {
    isSidebarModalOpen: boolean;
    toggleOpen: () => void;
};

export const useSidebarMenuStore = create<SidebarModalStore>((set) => ({
    isSidebarModalOpen: false,
    toggleOpen: () =>
        set((state) => ({
            isSidebarModalOpen: !state.isSidebarModalOpen,
        })),
}));

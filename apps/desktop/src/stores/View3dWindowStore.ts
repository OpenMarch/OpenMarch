import { create } from "zustand";

/**
 * Whether the 3D View window is open, as the editor's publisher hears it (`useView3dPublisher`):
 * main, or the web editor's pop-up bridge, pushes it when the window opens or closes. The 3D View
 * button shows only while it's closed.
 */
interface View3dWindowState {
    readonly open: boolean;
    readonly setOpen: (open: boolean) => void;
}

export const useView3dWindowStore = create<View3dWindowState>((set) => ({
    open: false,
    setOpen: (open) => set({ open }),
}));

import { create } from "zustand";

type FullscreenStore = {
    isFullscreen: boolean;
    toggleFullscreen: () => void;
    setFullscreen: (fullscreen: boolean) => void;
};

export const useFullscreenStore = create<FullscreenStore>((set) => ({
    isFullscreen: false,
    toggleFullscreen: () =>
        set((state) => ({
            isFullscreen: !state.isFullscreen,
        })),
    setFullscreen: (fullscreen) =>
        set(() => ({
            isFullscreen: fullscreen,
        })),
}));

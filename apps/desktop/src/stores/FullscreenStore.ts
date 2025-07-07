import { create } from "zustand";

type FullscreenStore = {
    isFullscreen: boolean;
    perspective: number;
    toggleFullscreen: () => void;
    setFullscreen: (fullscreen: boolean) => void;
    setPerspective: (perspective: number) => void;
};

export const useFullscreenStore = create<FullscreenStore>((set) => ({
    isFullscreen: false,
    perspective: 0,
    toggleFullscreen: () =>
        set((state) => ({
            isFullscreen: !state.isFullscreen,
        })),
    setFullscreen: (fullscreen) =>
        set(() => ({
            isFullscreen: fullscreen,
        })),
    setPerspective: (perspective) =>
        set(() => ({
            perspective,
        })),
}));

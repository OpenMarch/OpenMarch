import { create } from "zustand";

interface MetronomeStore {
    isMetronomeOn: boolean;
    setMetronomeOn: (on: boolean) => void;
    toggleMetronome: () => void;
}

export const useMetronomeStore = create<MetronomeStore>((set) => ({
    isMetronomeOn: true,
    setMetronomeOn: (on) => set({ isMetronomeOn: on }),
    toggleMetronome: () =>
        set((state) => ({ isMetronomeOn: !state.isMetronomeOn })),
}));

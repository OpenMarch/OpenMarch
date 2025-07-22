import { create } from "zustand";

interface MetronomeStore {
    isMetronomeOn: boolean;
    setMetronomeOn: (on: boolean) => void;

    accentFirstBeat: boolean;
    setAccentFirstBeat: (accent: boolean) => void;

    volume: number;
    setVolume: (volume: number) => void;

    beatStyle: string;
    setBeatStyle: (style: string) => void;

    toggleMetronome: () => void;
}

export const useMetronomeStore = create<MetronomeStore>((set) => ({
    isMetronomeOn: true,
    accentFirstBeat: true,

    setMetronomeOn: (on) => set({ isMetronomeOn: on }),
    setAccentFirstBeat: (accent) => set({ accentFirstBeat: accent }),

    volume: 50,
    setVolume: (volume) => set({ volume }),

    beatStyle: "default",
    setBeatStyle: (style) => set({ beatStyle: style }),

    toggleMetronome: () =>
        set((state) => ({ isMetronomeOn: !state.isMetronomeOn })),
}));

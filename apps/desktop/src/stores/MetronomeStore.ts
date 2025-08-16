import { create } from "zustand";
import { BeatStyleId } from "@openmarch/metronome";

interface MetronomeStore {
    isMetronomeOn: boolean;
    setMetronomeOn: (on: boolean) => void;

    accentFirstBeat: boolean;
    setAccentFirstBeat: (accent: boolean) => void;

    firstBeatOnly: boolean;
    setFirstBeatOnly: (firstBeatOnly: boolean) => void;

    volume: number;
    setVolume: (volume: number) => void;

    beatStyle: BeatStyleId;
    setBeatStyle: (style: BeatStyleId) => void;

    toggleMetronome: () => void;
}

export const useMetronomeStore = create<MetronomeStore>((set) => ({
    isMetronomeOn: false,
    setMetronomeOn: (on) => set({ isMetronomeOn: on }),

    accentFirstBeat: true,
    setAccentFirstBeat: (accent) => set({ accentFirstBeat: accent }),

    firstBeatOnly: false,
    setFirstBeatOnly: (firstBeatOnly) => set({ firstBeatOnly }),

    volume: 50,
    setVolume: (volume) => set({ volume }),

    beatStyle: "default",
    setBeatStyle: (style) => set({ beatStyle: style }),

    toggleMetronome: () =>
        set((state) => ({ isMetronomeOn: !state.isMetronomeOn })),
}));

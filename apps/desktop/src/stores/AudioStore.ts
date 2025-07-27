import { create } from "zustand";

interface AudioStoreInterface {
    audioContext: AudioContext | null;
    setAudioContext: (ctx: AudioContext) => void;

    playbackTimestamp: number; // in seconds
    setPlaybackTimestamp: (timestamp: number) => void;
}

export const useAudioStore = create<AudioStoreInterface>((set) => ({
    audioContext: null,
    setAudioContext: (ctx: AudioContext) => set({ audioContext: ctx }),

    playbackTimestamp: 0,
    setPlaybackTimestamp: (timestamp: number) =>
        set({ playbackTimestamp: timestamp }),
}));

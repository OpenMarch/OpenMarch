import { create } from "zustand";

interface AudioStoreInterface {
    audio: HTMLAudioElement;
    setAudio: (audio: HTMLAudioElement) => void;
}

export const useAudioStore = create<AudioStoreInterface>((set) => ({
    audio: new Audio(),

    setAudio: (audio: HTMLAudioElement) => {
        set({ audio });
    },
}));

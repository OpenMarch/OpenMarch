import { useEffect, useRef } from "react";
import Beat from "@/global/classes/Beat";
import Measure from "@/global/classes/Measure";
import { useAudioStore } from "@/stores/AudioStore";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useMetronomeStore } from "@/stores/MetronomeStore";

/**
 * Available beat styles for the metronome.
 * Currently includes:
 * - default: Standard click sound
 * - sharp: Sharp click sound
 * - smooth: Smooth click sound
 */
export const BEAT_STYLES: Record<
    string,
    {
        beat: (ctx: AudioContext, volume: number, when: number) => void;
        measure: (ctx: AudioContext, volume: number, when: number) => void;
        labelKey: string;
    }
> = {
    default: {
        beat: beatClickDefault,
        measure: measureClickDefault,
        labelKey: "music.standard",
    },
    sharp: {
        beat: sharpBeatClick,
        measure: sharpMeasureClick,
        labelKey: "music.sharp",
    },
    smooth: {
        beat: smoothBeatClick,
        measure: smoothMeasureClick,
        labelKey: "music.smooth",
    },
};

import { useEffect, useRef } from "react";
import Beat from "@/global/classes/Beat";
import Measure from "@/global/classes/Measure";
import { useAudioStore } from "@/stores/AudioStore";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useMetronomeStore } from "@/stores/MetronomeStore";

// Constants for metronome scheduling
const SCHEDULE_AHEAD_TIME = 0.1; // s
const SCHEDULER_INTERVAL = 25; // ms

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

/**
 * Standard beat and measure click sound
 */
function beatClickDefault(ctx: AudioContext, volume: number, when: number) {
    playClick(ctx, "sawtooth", 0.1 * volume, 2600, 0.04, when);
    playClick(ctx, "triangle", 0.3 * volume, 2600, 0.04, when);
    playClick(ctx, "sine", 0.8 * volume, 2600, 0.07, when);
}
function measureClickDefault(ctx: AudioContext, volume: number, when: number) {
    playClick(ctx, "sawtooth", 0.1 * volume, 3000, 0.04, when);
    playClick(ctx, "triangle", 0.3 * volume, 3000, 0.04, when);
    playClick(ctx, "sine", 0.8 * volume, 3000, 0.07, when);
}

/**
 * Sharp beat and measure click sound
 */
function sharpBeatClick(ctx: AudioContext, volume: number, when: number) {
    playClick(ctx, "sawtooth", 0.15 * volume, 3200, 0.02, when);
    playClick(ctx, "triangle", 0.4 * volume, 3200, 0.05, when);
}
function sharpMeasureClick(ctx: AudioContext, volume: number, when: number) {
    playClick(ctx, "sawtooth", 0.15 * volume, 3500, 0.02, when);
    playClick(ctx, "triangle", 0.4 * volume, 3500, 0.05, when);
}

/**
 * Smooth beat and measure click sound
 */
function smoothBeatClick(ctx: AudioContext, volume: number, when: number) {
    playClick(ctx, "sine", volume, 2000, 0.1, when);
}
function smoothMeasureClick(ctx: AudioContext, volume: number, when: number) {
    playClick(ctx, "sine", volume, 2400, 0.1, when);
}

// Adjust volume to a range suitable for audio context
function volumeAdjust(volume: number): number {
    return (volume * 2) / 100;
}

/**
 * Plays a short click sound
 * @param ctx Reference to the AudioContext
 * @param type Type of oscillator to use (default "triangle")
 * @param volume Volume of the click (default 1)
 * @param freq Frequency of the click (default 2715hz)
 * @param duration Duration of the click in seconds (default 0.07s)
 * @param when Time to play the click, defaults to current time
 */
function playClick(
    ctx: AudioContext,
    type: OscillatorType = "triangle",
    volume: number = 1,
    freq: number = 2715,
    duration: number = 0.07,
    when: number,
) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.value = freq;

    // fade out
    const startTime = when ?? ctx.currentTime;
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.linearRampToValueAtTime(0, startTime + duration);

    osc.connect(gain).connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);

    osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
    };
}

/**
 * Props for the useMetronome hook
 */
interface UseMetronomeProps {
    beats: Beat[];
    measures: Measure[];
}

/**
 * useMetronome hook
 * Plays a click sound whenever a new beat is reached in the audio playback.
 */
export const useMetronome = ({
    beats,
    measures,
}: UseMetronomeProps): Record<string, never> => {
    const { audio } = useAudioStore();
    const { isPlaying } = useIsPlaying()!;

    const isMetronomeOn = useMetronomeStore((state) => state.isMetronomeOn);
    const accentFirstBeat = useMetronomeStore((state) => state.accentFirstBeat);
    const firstBeatOnly = useMetronomeStore((state) => state.firstBeatOnly);
    const beatStyle = useMetronomeStore((state) => state.beatStyle);
    const volume = volumeAdjust(useMetronomeStore((state) => state.volume));

    const audioContextRef = useRef<AudioContext | null>(null);
    const schedulerTimerRef = useRef<number | null>(null);
    const nextBeatIndexRef = useRef<number>(0);
    const scheduledBeatTimestampsRef = useRef<Set<number>>(new Set());

    // Sort beats by timestamp once
    const sortedBeatsRef = useRef<Beat[]>([]);
    const measureStartBeatIdsRef = useRef<number[]>([]);

    // Create the audio context when the hook is mounted
    useEffect(() => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext ||
                (window as any).webkitAudioContext)();
        }
        sortedBeatsRef.current = [...beats]
            .filter((b) => b.duration > 0)
            .sort((a, b) => a.timestamp - b.timestamp);
        measureStartBeatIdsRef.current = measures.map((m) => m.startBeat.id);

        return () => {
            audioContextRef.current?.close();
            audioContextRef.current = null;
        };
    }, [beats, measures]);

    // Handle playing clicks on beat
    useEffect(() => {
        if (!isPlaying || !audio || !isMetronomeOn) {
            if (schedulerTimerRef.current) {
                clearInterval(schedulerTimerRef.current);
                schedulerTimerRef.current = null;
            }
            nextBeatIndexRef.current = 0;
            scheduledBeatTimestampsRef.current.clear();
            return;
        }

        const beatsArr = sortedBeatsRef.current;
        let nextIdx = beatsArr.findIndex(
            (b) => b.timestamp >= audio.currentTime,
        );
        if (nextIdx === -1) nextIdx = beatsArr.length;
        nextBeatIndexRef.current = nextIdx;
        scheduledBeatTimestampsRef.current.clear();

        // Schedule the new beat(s)
        function scheduler() {
            if (
                !audioContextRef.current ||
                !audio ||
                !isMetronomeOn ||
                !isPlaying
            )
                return;

            const audioCtx = audioContextRef.current as AudioContext;
            const ctxCurrentTime = audioCtx.currentTime;
            const audioCurrentTime = audio.currentTime;
            const beatsArr = sortedBeatsRef.current;

            while (nextBeatIndexRef.current < beatsArr.length) {
                const beat = beatsArr[nextBeatIndexRef.current];
                const beatPlayTime =
                    ctxCurrentTime + (beat.timestamp - audioCurrentTime);

                if (beatPlayTime < ctxCurrentTime + SCHEDULE_AHEAD_TIME) {
                    // Prevent beats that are too close together
                    if (
                        !scheduledBeatTimestampsRef.current.has(beat.timestamp)
                    ) {
                        const isMeasureStart =
                            measureStartBeatIdsRef.current.includes(beat.id);

                        if (isMeasureStart && accentFirstBeat) {
                            // Measure click
                            BEAT_STYLES[beatStyle].measure(
                                audioCtx,
                                volume,
                                beatPlayTime,
                            );
                        } else if (!firstBeatOnly || isMeasureStart) {
                            // Beat click
                            BEAT_STYLES[beatStyle].beat(
                                audioCtx,
                                volume,
                                beatPlayTime,
                            );
                        }

                        scheduledBeatTimestampsRef.current.add(beat.timestamp);
                    }

                    nextBeatIndexRef.current++;
                } else {
                    break;
                }
            }
        }

        // Set up the scheduler to run at regular intervals
        schedulerTimerRef.current = window.setInterval(
            scheduler,
            SCHEDULER_INTERVAL,
        );
        scheduler();

        // Cleanup function to clear the scheduler
        return () => {
            if (schedulerTimerRef.current) {
                clearInterval(schedulerTimerRef.current);
                schedulerTimerRef.current = null;
            }
            nextBeatIndexRef.current = 0;
            scheduledBeatTimestampsRef.current.clear();
        };
    }, [
        isPlaying,
        isMetronomeOn,
        accentFirstBeat,
        firstBeatOnly,
        beatStyle,
        volume,
        audio,
    ]);

    // Update the next beat index when the audio current time changes
    useEffect(() => {
        if (!audio || !isPlaying || !isMetronomeOn) return;
        const beatsArr = sortedBeatsRef.current;
        nextBeatIndexRef.current = beatsArr.findIndex(
            (b) => b.timestamp >= audio.currentTime,
        );
        if (nextBeatIndexRef.current === -1)
            nextBeatIndexRef.current = beatsArr.length;
        scheduledBeatTimestampsRef.current.clear();
    }, [audio?.currentTime]);

    return {};
};
